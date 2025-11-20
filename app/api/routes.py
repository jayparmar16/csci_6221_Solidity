from fastapi import APIRouter, UploadFile, File, HTTPException, Body, Query, Form, Request
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import base64
import numpy as np

from app.database.db import (
    find_image_by_hash,
    insert_image,
    get_image,
    list_images,
    insert_vote,
    get_vote_counts,
    has_user_voted,
    update_image_analysis,
    upsert_embedding,
    get_image_data,
    store_image_data,
    update_image_blockchain_registration,
    find_image_by_blockchain_id,
    get_user_profile,
    get_user_votes,
    get_claimable_rewards,
    mark_reward_claimed,
    get_reward_history,
    finalize_image_voting,
    get_images_to_finalize,
    update_image_voting_period,
)
from app.utils.utils import sha256_bytes
from gemini_client import GeminiClient
from app.core.analysis import perform_analysis
from app.core.faiss_helper import add_embedding, search_neighbors
from app.blockchain.client import get_blockchain_client, is_blockchain_enabled
import logging

logger = logging.getLogger(__name__)


router = APIRouter()


class VoteRequest(BaseModel):
    is_ai: bool
    voter_id: Optional[str] = None


@router.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True}


@router.get("/faiss/status")
def faiss_status(request: Request) -> Dict[str, Any]:
    faiss_index = getattr(request.app.state, "faiss_index", None)
    embedding_client = getattr(request.app.state, "embedding_client", None)
    if faiss_index is None:
        return {"index_loaded": False, "size": 0, "dim": None, "embedding_client": bool(embedding_client)}
    return {
        "index_loaded": True,
        "size": int(faiss_index.index.ntotal),
        "dim": int(faiss_index.dim),
        "embedding_client": bool(embedding_client),
    }


@router.post("/images/upload")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    analyze: bool = Query(False),
) -> Dict[str, Any]:
    import os

    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")

    # Generate SHA256 hash
    digest = sha256_bytes(content)
    # Check for existing image in the database
    existing = find_image_by_hash(digest)
    if existing:
        image_id = int(existing["id"])
        
        # Store image data if not already stored (for existing images)
        existing_data = get_image_data(image_id)
        if not existing_data:
            import mimetypes
            ct = file.content_type or "image/jpeg"
            if ct == "application/octet-stream":
                guessed, _ = mimetypes.guess_type(file.filename or "")
                if guessed:
                    ct = guessed
            store_image_data(image_id, content, mime_type=ct)
        
        # If the image already exists but analyze=True, perform (re)analysis + embedding update
        if analyze:
            image_id = int(existing["id"])
            result: Dict[str, Any] = {"exists": True, "image_id": image_id, "sha256": digest}
            import mimetypes
            ct = file.content_type or "image/jpeg"
            if ct == "application/octet-stream":
                guessed, _ = mimetypes.guess_type(file.filename)
                if guessed:
                    ct = guessed
            try:
                analysis_res = perform_analysis(content, mime_type=ct)
                if analysis_res.get("error"):
                    result["analysis_error"] = analysis_res["error"]
                else:
                    update_image_analysis(
                        image_id=image_id,
                        model=analysis_res.get("model_used"),
                        is_ai=analysis_res.get("is_ai"),
                        score=analysis_res.get("ai_score"),
                        comment=analysis_res.get("explanation"),
                    )
                    result["analysis"] = {
                        "is_ai": analysis_res.get("is_ai"),
                        "ai_score": analysis_res.get("ai_score"),
                        "explanation": analysis_res.get("explanation"),
                        "model_used": analysis_res.get("model_used"),
                        "fallback": analysis_res.get("fallback"),
                    }
            except Exception as analysis_error:
                # Catch any exception during analysis
                error_msg = str(analysis_error)
                logger.error(f"Analysis failed for existing image {image_id}: {error_msg}")
                result["analysis_error"] = error_msg

            # Attempt embedding even if analysis failed
            emb_client = getattr(request.app.state, "embedding_client", None)
            if emb_client:
                try:
                    vec = emb_client.embed_image(content)
                    dim = vec.shape[0]
                    upsert_embedding(image_id, vec.tobytes(), dim=dim)
                    add_embedding(request.app, image_id, vec)
                    neighbors = search_neighbors(request.app, vec, k=5, exclude_id=image_id)
                    result["similar"] = neighbors
                except Exception as emb_err:
                    result["embedding_error"] = str(emb_err)
            return result
        # No analyze requested, just return existing metadata
        return {
            "exists": True,
            "duplicate": True,
            "image_id": image_id,
            "image": dict(existing),
            "message": "This image already exists in the database"
        }

    # BLOCKCHAIN TODOs (placeholder)
    blockchain_tx = None
    blockchain_uri = None

    image_id = insert_image(
        sha256=digest,
        model=None,
        is_ai=None,
        score=None,
        comment=None,
        blockchain_tx=blockchain_tx,
        blockchain_uri=blockchain_uri,
    )

    # Store the actual image bytes
    import mimetypes
    ct = file.content_type or "image/jpeg"
    if ct == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(file.filename or "")
        if guessed:
            ct = guessed
    store_image_data(image_id, content, mime_type=ct)

    result: Dict[str, Any] = {"exists": False, "image_id": image_id, "sha256": digest}

    if analyze:
        import mimetypes
        ct = file.content_type or "image/jpeg"
        if ct == "application/octet-stream":
            guessed, _ = mimetypes.guess_type(file.filename)
            if guessed:
                ct = guessed
        logger.info(f"🔬 Starting analysis for new image {image_id}")
        try:
            analysis_res = perform_analysis(content, mime_type=ct)
            logger.info(f"✅ Analysis completed: {analysis_res.keys()}")
            if analysis_res.get("error"):
                result["analysis_error"] = analysis_res["error"]
            else:
                update_image_analysis(
                    image_id=image_id,
                    model=analysis_res.get("model_used"),
                    is_ai=analysis_res.get("is_ai"),
                    score=analysis_res.get("ai_score"),
                    comment=analysis_res.get("explanation"),
                )
                result["analysis"] = {
                    "is_ai": analysis_res.get("is_ai"),
                    "ai_score": analysis_res.get("ai_score"),
                    "explanation": analysis_res.get("explanation"),
                    "model_used": analysis_res.get("model_used"),
                    "fallback": analysis_res.get("fallback"),
                }
                
                # Register on blockchain if analysis succeeded and blockchain is enabled
                if is_blockchain_enabled():
                    try:
                        logger.info(f"Registering image {image_id} on blockchain...")
                        blockchain_client = get_blockchain_client()
                        blockchain_result = blockchain_client.register_image(
                            sha256_hash=digest,
                            is_ai=analysis_res.get("is_ai"),
                            ai_score=int(analysis_res.get("ai_score", 0)),
                            explanation=analysis_res.get("explanation", "")[:1000]  # Limit to 1000 chars
                        )
                        
                        # Update database with blockchain info
                        update_image_blockchain_registration(
                            image_id=image_id,
                            blockchain_id=blockchain_result['blockchain_id'],
                            tx_hash=blockchain_result['tx_hash'],
                            block_number=blockchain_result['block_number'],
                        )
                        
                        # Set voting period (7 days from now)
                        from datetime import datetime, timedelta
                        voting_period_ends = (datetime.now() + timedelta(days=7)).isoformat()
                        update_image_voting_period(image_id, voting_period_ends)
                        
                        result["blockchain"] = {
                            "registered": True,
                            "blockchain_id": blockchain_result['blockchain_id'],
                            "tx_hash": blockchain_result['tx_hash'],
                            "etherscan_url": blockchain_result['etherscan_url'],
                            "block_number": blockchain_result['block_number'],
                            "voting_period_ends": voting_period_ends,
                        }
                        logger.info(f"Image {image_id} registered on blockchain: ID={blockchain_result['blockchain_id']}")
                    except Exception as blockchain_err:
                        logger.error(f"Blockchain registration failed: {blockchain_err}")
                        result["blockchain_error"] = str(blockchain_err)
        except Exception as analysis_error:
            # Catch any exception during analysis (e.g., Google Cloud credentials not configured)
            error_msg = str(analysis_error)
            logger.error(f"Analysis failed for image {image_id}: {error_msg}")
            result["analysis_error"] = error_msg
        
        # Embedding via app state embedding client regardless of analysis error
        emb_client = getattr(request.app.state, "embedding_client", None)
        if emb_client:
            try:
                vec = emb_client.embed_image(content)
                dim = vec.shape[0]
                upsert_embedding(image_id, vec.tobytes(), dim=dim)
                add_embedding(request.app, image_id, vec)
                neighbors = search_neighbors(request.app, vec, k=5, exclude_id=image_id)
                result["similar"] = neighbors
            except Exception as emb_err:
                result["embedding_error"] = str(emb_err)
    return result


class AnalyzePayload(BaseModel):
    base64_image: Optional[str] = None
    prompt: Optional[str] = "Is this image AI-generated? Brief reason."


@router.post("/images/{image_id}/analyze")
async def analyze_image(request: Request, image_id: int, payload: Optional[AnalyzePayload] = None) -> Dict[str, Any]:
    from app.db import get_image, get_image_data

    row = get_image(image_id)
    if not row:
        raise HTTPException(404, "Image not found")
    
    # If no payload or no base64_image in payload, fetch from database
    if not payload or not payload.base64_image:
        # Get image data from database (returns bytes directly)
        img_bytes = get_image_data(image_id)
        if not img_bytes:
            raise HTTPException(404, "Image data not found in storage")
    else:
        # Use provided base64 image
        try:
            img_bytes = base64.b64decode(payload.base64_image, validate=True)
        except Exception:
            raise HTTPException(400, "Invalid base64_image")

    import os

    try:
        analysis_res = perform_analysis(
            img_bytes,
            mime_type="image/jpeg",
        )
    except Exception as analysis_error:
        # If analysis fails (e.g., Google Cloud credentials missing), return error
        error_msg = str(analysis_error)
        if "DefaultCredentialsError" in error_msg or "credentials" in error_msg.lower():
            raise HTTPException(
                503,
                "AI analysis service unavailable: Google Cloud credentials not configured. "
                "Please set up Application Default Credentials or contact administrator."
            )
        else:
            raise HTTPException(500, f"Analysis failed: {error_msg}")
    
    if analysis_res.get("error"):
        explanation = None
        is_ai = None
        ai_score = None
    else:
        explanation = analysis_res.get("explanation")
        is_ai = analysis_res.get("is_ai")
        ai_score = analysis_res.get("ai_score")
        update_image_analysis(
            image_id=image_id,
            model=analysis_res.get("model_used"),
            is_ai=is_ai,
            score=ai_score,
            comment=explanation,
        )
    neighbors = []
    emb_err = None
    emb_client = getattr(request.app.state, "embedding_client", None)
    if emb_client:
        try:
            # img_bytes is already defined above, use it directly
            vec = emb_client.embed_image(img_bytes)
            dim = vec.shape[0]
            upsert_embedding(image_id, vec.tobytes(), dim=dim)
            add_embedding(request.app, image_id, vec)
            neighbors = search_neighbors(request.app, vec, k=5, exclude_id=image_id)
        except Exception as e:
            # Don't fail the entire request if embedding fails
            emb_err = str(e)
            print(f"⚠️  Warning: Embedding failed for image {image_id}: {emb_err}")
            # Continue without embeddings
    return {
        "raw": analysis_res.get("raw"),
        "explanation": explanation,
        "ai_score": ai_score,
        "is_ai": is_ai,
        "similar": neighbors,
        "embedding_error": emb_err,
        "model_used": analysis_res.get("model_used"),
        "fallback": analysis_res.get("fallback"),
        "error": analysis_res.get("error"),
    }


@router.get("/images/{image_id}/similar")
def similar(request: Request, image_id: int, k: int = Query(5, ge=1, le=50)) -> Dict[str, Any]:
    faiss_index = getattr(request.app.state, "faiss_index", None)
    if faiss_index is None:
        raise HTTPException(503, "Embedding index not available")
    row = get_image(image_id)
    if not row:
        raise HTTPException(404, "Image not found")
    from app.db import get_conn
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT dim, vector FROM image_embeddings WHERE image_id = ?", (image_id,))
        r = cur.fetchone()
        if not r:
            raise HTTPException(404, "Embedding not found for image")
        dim = int(r[0])
        vec = np.frombuffer(r[1], dtype=np.float32)
        if vec.shape[0] != dim:
            raise HTTPException(500, "Embedding dimension mismatch")
        neighbors = faiss_index.search(vec, k=k + 1)
        neighbors = [n for n in neighbors if n[0] != image_id][:k]
        return {"image_id": image_id, "neighbors": neighbors}
    finally:
        conn.close()


@router.post("/images/analyze-inline")
async def analyze_inline(
    base64_image: str = Body(..., embed=True),
    prompt: str = Body("Is this image AI-generated? Provide a short reason."),
) -> Dict[str, Any]:
    try:
        base64.b64decode(base64_image, validate=True)
    except Exception:
        raise HTTPException(400, "Invalid base64 image data")
    analysis_res = perform_analysis(
        base64.b64decode(base64_image),
        mime_type="image/jpeg",
        prompt=prompt,
    )
    return {
        "raw": analysis_res.get("raw"),
        "explanation": analysis_res.get("explanation"),
        "ai_score": analysis_res.get("ai_score"),
        "is_ai": analysis_res.get("is_ai"),
        "model_used": analysis_res.get("model_used"),
        "fallback": analysis_res.get("fallback"),
        "error": analysis_res.get("error"),
    }


@router.post("/images/{image_id}/vote")
def vote(image_id: int, req: VoteRequest) -> Dict[str, Any]:
    """
    Vote on an image. If blockchain is enabled and image is registered,
    vote will be cast on-chain. Otherwise, falls back to database voting.
    """
    row = get_image(image_id)
    if not row:
        raise HTTPException(404, "Image not found")
    
    # Check if user has already voted (database level)
    if req.voter_id and has_user_voted(image_id, req.voter_id):
        raise HTTPException(400, "You have already voted on this image")
    
    # Check if blockchain voting is available
    blockchain_id = row['blockchain_id'] if 'blockchain_id' in row.keys() else None
    if is_blockchain_enabled() and blockchain_id:
        
        try:
            # Cast vote on blockchain using server account
            # Note: req.voter_id is for database tracking only
            # In future, MetaMask integration will allow users to vote with their own wallets
            blockchain_client = get_blockchain_client()
            vote_result = blockchain_client.cast_vote(
                blockchain_id=blockchain_id,
                is_ai=req.is_ai,
                voter_address=None  # Use server's account for now
            )
            
            # Also record in database for caching
            vote_id = insert_vote(
                image_id=image_id,
                is_ai=req.is_ai,
                voter_id=req.voter_id or "blockchain_server"
            )
            
            # Get counts from blockchain
            counts = {
                'ai': vote_result['ai_votes'],
                'human': vote_result['human_votes']
            }
            
            return {
                'vote_id': vote_id,
                'counts': counts,
                'blockchain': {
                    'tx_hash': vote_result['tx_hash'],
                    'etherscan_url': vote_result['etherscan_url'],
                    'block_number': vote_result['block_number']
                }
            }
            
        except ValueError as e:
            # User already voted or other validation error
            error_msg = str(e)
            if "already voted" in error_msg:
                raise HTTPException(400, f"You have already voted on this image")
            raise HTTPException(400, error_msg)
        except Exception as e:
            logger.error(f"Blockchain vote failed: {e}")
            raise HTTPException(500, f"Blockchain voting failed: {str(e)}")
    
    # Fallback to database voting
    vote_id = insert_vote(image_id=image_id, is_ai=req.is_ai, voter_id=req.voter_id)
    counts = get_vote_counts(image_id)
    return {
        "vote_id": vote_id,
        "counts": counts,
        "blockchain": None
    }


@router.get("/images")
def list_all(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)) -> Dict[str, Any]:
    rows, total = list_images(limit=limit, offset=offset)
    return {"total": total, "items": rows}


@router.get("/images/{image_id}")
def get_one(image_id: int) -> Dict[str, Any]:
    row = get_image(image_id)
    if not row:
        raise HTTPException(404, "Not found")
    
    # Get vote counts
    votes = get_vote_counts(image_id)
    
    return {
        "image": dict(row),
        "votes": votes
    }


@router.get("/images/{image_id}/data")
def get_image_bytes(image_id: int):
    """Serve the actual image bytes for display in frontend."""
    data = get_image_data(image_id)
    if not data:
        raise HTTPException(404, "Image not found")
    
    # Detect mime type based on magic bytes
    mime_type = "image/jpeg"  # default
    if data[:4] == b'\x89PNG':
        mime_type = "image/png"
    elif data[:2] == b'\xff\xd8':
        mime_type = "image/jpeg"
    elif data[:4] == b'GIF8':
        mime_type = "image/gif"
    elif data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        mime_type = "image/webp"
    
    return Response(content=data, media_type=mime_type)


@router.get("/")
def serve_frontend():
    """Serve the frontend index.html."""
    return FileResponse("static/index.html")


@router.get("/test-wallet")
def serve_test_wallet():
    """Serve the wallet connection test page."""
    return FileResponse("test_wallet.html")


@router.get("/simple-test")
def serve_simple_test():
    """Serve the simple wallet test page."""
    return FileResponse("simple_test.html")


# ============ Blockchain Endpoints ============

@router.get("/blockchain/status")
def blockchain_status() -> Dict[str, Any]:
    """Check if blockchain integration is enabled and get connection status."""
    if not is_blockchain_enabled():
        return {
            "enabled": False,
            "message": "Blockchain integration is not configured"
        }
    
    try:
        client = get_blockchain_client()
        balance = client.get_balance()
        stats = client.get_stats()
        
        return {
            "enabled": True,
            "connected": True,
            "network": "Sepolia Testnet",
            "contract_address": client.contract_address,
            "account": client.account.address,
            "balance_eth": float(balance),
            "total_images_on_chain": stats['total_images'],
            "total_votes_on_chain": stats['total_votes'],
        }
    except Exception as e:
        logger.error(f"Blockchain status check failed: {e}")
        return {
            "enabled": True,
            "connected": False,
            "error": str(e)
        }


@router.get("/blockchain/images/{blockchain_id}")
def get_blockchain_image(blockchain_id: int) -> Dict[str, Any]:
    """Get image data from blockchain by blockchain_id."""
    if not is_blockchain_enabled():
        raise HTTPException(503, "Blockchain integration not enabled")
    
    try:
        client = get_blockchain_client()
        data = client.get_image_data(blockchain_id)
        
        # Also get local database record if exists
        local_image = find_image_by_blockchain_id(blockchain_id)
        
        return {
            "blockchain_data": data,
            "local_image": dict(local_image) if local_image else None
        }
    except Exception as e:
        logger.error(f"Failed to get blockchain image {blockchain_id}: {e}")
        raise HTTPException(500, str(e))


@router.get("/images/{image_id}/blockchain")
def get_image_blockchain_info(image_id: int) -> Dict[str, Any]:
    """Get blockchain information for a local image."""
    row = get_image(image_id)
    if not row:
        raise HTTPException(404, "Image not found")
    
    blockchain_id = row["blockchain_id"] if "blockchain_id" in row.keys() else None
    if not blockchain_id:
        return {
            "registered": False,
            "message": "Image not registered on blockchain"
        }
    
    if not is_blockchain_enabled():
        return {
            "registered": True,
            "blockchain_id": blockchain_id,
            "message": "Blockchain integration not enabled - cannot fetch chain data"
        }
    
    try:
        client = get_blockchain_client()
        chain_data = client.get_image_data(blockchain_id)
        votes = client.get_votes(blockchain_id)
        
        return {
            "registered": True,
            "blockchain_id": blockchain_id,
            "tx_hash": row["register_tx_hash"] if "register_tx_hash" in row.keys() else None,
            "block_number": row["block_number"] if "block_number" in row.keys() else None,
            "etherscan_url": f"https://sepolia.etherscan.io/tx/{row['register_tx_hash']}" if "register_tx_hash" in row.keys() and row["register_tx_hash"] else None,
            "chain_data": chain_data,
            "votes_on_chain": {
                "ai": votes[0],
                "human": votes[1],
                "total": votes[0] + votes[1]
            }
        }
    except Exception as e:
        logger.error(f"Failed to get blockchain info for image {image_id}: {e}")
        return {
            "registered": True,
            "blockchain_id": blockchain_id,
            "error": str(e)
        }


# ========== Reward System & Profile Endpoints ==========

@router.get("/api/profile/{wallet_address}")
def get_profile(wallet_address: str) -> Dict[str, Any]:
    """Get user profile with voting stats and rewards."""
    profile = get_user_profile(wallet_address)
    
    if not profile:
        # Return empty profile for new users
        return {
            "wallet_address": wallet_address,
            "total_votes": 0,
            "correct_votes": 0,
            "total_rewards_earned": 0,
            "pending_rewards": 0,
            "accuracy_rate": 0,
            "created_at": None,
            "last_activity": None
        }
    
    # Calculate accuracy rate
    accuracy_rate = 0
    if profile["total_votes"] > 0:
        accuracy_rate = (profile["correct_votes"] / profile["total_votes"]) * 100
    
    # Get claimable rewards
    claimable = get_claimable_rewards(wallet_address)
    pending_count = len(claimable)
    pending_amount = pending_count * 10  # 10 AIVT per correct vote
    
    return {
        "wallet_address": wallet_address,
        "total_votes": profile["total_votes"],
        "correct_votes": profile["correct_votes"],
        "total_rewards_earned": profile["total_rewards_earned"],
        "pending_rewards": pending_amount,
        "pending_count": pending_count,
        "accuracy_rate": round(accuracy_rate, 2),
        "created_at": profile["created_at"],
        "last_activity": profile["last_activity"]
    }


@router.get("/api/profile/{wallet_address}/votes")
def get_profile_votes(
    wallet_address: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
) -> Dict[str, Any]:
    """Get voting history for a user."""
    votes, total = get_user_votes(wallet_address, limit, offset)
    
    return {
        "votes": votes,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/api/profile/{wallet_address}/rewards")
def get_profile_rewards(
    wallet_address: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
) -> Dict[str, Any]:
    """Get reward history for a user."""
    rewards, total = get_reward_history(wallet_address, limit, offset)
    
    return {
        "rewards": rewards,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/api/profile/{wallet_address}/claimable")
def get_profile_claimable(wallet_address: str) -> Dict[str, Any]:
    """Get list of claimable rewards."""
    claimable = get_claimable_rewards(wallet_address)
    total_amount = len(claimable) * 10  # 10 AIVT per correct vote
    
    return {
        "claimable": claimable,
        "count": len(claimable),
        "total_amount": total_amount,
        "reward_per_vote": 10
    }


class ClaimRewardRequest(BaseModel):
    vote_id: int
    claim_tx_hash: str


@router.post("/api/rewards/claim")
def claim_reward(req: ClaimRewardRequest) -> Dict[str, Any]:
    """Mark a reward as claimed (after blockchain transaction)."""
    try:
        reward_amount = 10.0  # 10 AIVT per correct vote
        mark_reward_claimed(req.vote_id, reward_amount, req.claim_tx_hash)
        
        return {
            "success": True,
            "vote_id": req.vote_id,
            "reward_amount": reward_amount,
            "tx_hash": req.claim_tx_hash
        }
    except Exception as e:
        logger.error(f"Failed to claim reward: {e}")
        raise HTTPException(500, str(e))


class FinalizeRequest(BaseModel):
    correct_answer: bool


@router.post("/api/images/{image_id}/finalize")
def finalize_image(image_id: int, req: FinalizeRequest) -> Dict[str, Any]:
    """Finalize voting period for an image (admin only in production)."""
    row = get_image(image_id)
    if not row:
        raise HTTPException(404, "Image not found")
    
    if row.get("is_finalized"):
        raise HTTPException(400, "Voting already finalized")
    
    try:
        finalize_image_voting(image_id, req.correct_answer)
        
        # Get updated vote counts
        votes = get_vote_counts(image_id)
        correct_count = votes["ai"] if req.correct_answer else votes["human"]
        total_rewards = correct_count * 10.0
        
        return {
            "success": True,
            "image_id": image_id,
            "correct_answer": "ai" if req.correct_answer else "human",
            "correct_voters": correct_count,
            "total_rewards": total_rewards
        }
    except Exception as e:
        logger.error(f"Failed to finalize image {image_id}: {e}")
        raise HTTPException(500, str(e))


@router.get("/api/images/pending-finalization")
def get_pending_finalization() -> Dict[str, Any]:
    """Get images that need to be finalized (voting period ended)."""
    images = get_images_to_finalize()
    
    return {
        "images": images,
        "count": len(images)
    }


@router.get("/api/images/{image_id}/voting-status")
def get_voting_status(image_id: int) -> Dict[str, Any]:
    """Get voting period status for an image."""
    from datetime import datetime
    
    row = get_image(image_id)
    if not row:
        raise HTTPException(404, "Image not found")
    
    voting_period_ends = row.get("voting_period_ends")
    is_finalized = row.get("is_finalized", 0)
    
    if not voting_period_ends:
        return {
            "image_id": image_id,
            "has_voting_period": False,
            "is_finalized": bool(is_finalized)
        }
    
    # Parse datetime
    end_time = datetime.fromisoformat(voting_period_ends.replace("Z", "+00:00"))
    now = datetime.now(end_time.tzinfo) if end_time.tzinfo else datetime.now()
    
    time_remaining = (end_time - now).total_seconds()
    has_ended = time_remaining <= 0
    
    return {
        "image_id": image_id,
        "has_voting_period": True,
        "voting_period_ends": voting_period_ends,
        "time_remaining_seconds": max(0, int(time_remaining)),
        "has_ended": has_ended,
        "is_finalized": bool(is_finalized),
        "correct_answer": row.get("correct_answer") if is_finalized else None
    }

