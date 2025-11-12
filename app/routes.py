from fastapi import APIRouter, UploadFile, File, HTTPException, Body, Query, Form, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
import base64
import numpy as np

from app.db import (
    find_image_by_hash,
    insert_image,
    get_image,
    list_images,
    insert_vote,
    get_vote_counts,
    update_image_analysis,
    upsert_embedding,
)
from app.utils import sha256_bytes
from gemini_client import GeminiClient


router = APIRouter()


class VoteRequest(BaseModel):
    is_ai: bool
    voter_id: Optional[str] = None


@router.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True}


@router.post("/images/upload")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    analyze: bool = Form(False),
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
        return {"exists": True, "image": dict(existing)}

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

    result: Dict[str, Any] = {"exists": False, "image_id": image_id, "sha256": digest}

    if analyze:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("API_KEY")
        if not api_key:
            result["analysis_error"] = "Missing GEMINI_API_KEY; skipped"
            return result
        project_id = os.getenv("GEMINI_PROJECT_ID", "lyrical-marker-477423-q8")
        location = os.getenv("GEMINI_LOCATION", "global")
        model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        client = GeminiClient(api_key=api_key, project_id=project_id, location=location, model=model)
        b64 = base64.b64encode(content).decode("utf-8")
        contents = [
            {
                "role": "user",
                "parts": [
                    {"text": "Determine if this image is AI-generated and explain briefly."},
                    {
                        "inline_data": {
                            "mime_type": file.content_type or "image/jpeg",
                            "data": b64,
                        }
                    },
                ],
            }
        ]
        try:
            gen = client.generate_content(
                contents,
                generation_config={"temperature": 0.2, "maxOutputTokens": 256},
                candidate_count=1,
                return_text_only=False,
            )
            parts = gen.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            text = next((p.get("text") for p in parts if isinstance(p, dict) and p.get("text")), None)
            is_ai = None
            if text:
                lowered = text.lower()
                if "ai-generated" in lowered or "ai generated" in lowered or "machine generated" in lowered:
                    is_ai = True
                elif "real photo" in lowered or "authentic" in lowered or "not ai" in lowered:
                    is_ai = False
            update_image_analysis(
                image_id=image_id,
                model=model,
                is_ai=is_ai,
                score=None,
                comment=text,
            )
            result["analysis"] = {"is_ai": is_ai, "comment": text}

            # Embedding via app state embedding client
            emb_client = getattr(request.app.state, "embedding_client", None)
            if emb_client:
                try:
                    vec = emb_client.embed_image(content)
                    dim = vec.shape[0]
                    upsert_embedding(image_id, vec.tobytes(), dim=dim)
                    faiss_index = getattr(request.app.state, "faiss_index", None)
                    if faiss_index is None:
                        from app.embeddings import FaissIndex
                        faiss_index = FaissIndex(dim=dim)
                        request.app.state.faiss_index = faiss_index
                    faiss_index.add(image_id, vec)
                    neighbors = faiss_index.search(vec, k=5)
                    neighbors = [n for n in neighbors if n[0] != image_id]
                    result["similar"] = neighbors
                except Exception as emb_err:
                    result["embedding_error"] = str(emb_err)
        except Exception as e:
            result["analysis_error"] = str(e)
    return result


class AnalyzePayload(BaseModel):
    base64_image: str
    prompt: Optional[str] = "Is this image AI-generated? Brief reason."


@router.post("/images/{image_id}/analyze")
async def analyze_image(request: Request, image_id: int, payload: AnalyzePayload) -> Dict[str, Any]:
    from app.db import get_image

    row = get_image(image_id)
    if not row:
        raise HTTPException(404, "Image not found")
    try:
        base64.b64decode(payload.base64_image, validate=True)
    except Exception:
        raise HTTPException(400, "Invalid base64_image")

    import os

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("API_KEY")
    if not api_key:
        raise HTTPException(500, "Missing GEMINI_API_KEY or API_KEY env var")
    project_id = os.getenv("GEMINI_PROJECT_ID", "lyrical-marker-477423-q8")
    location = os.getenv("GEMINI_LOCATION", "global")
    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    client = GeminiClient(api_key=api_key, project_id=project_id, location=location, model=model)

    contents = [
        {
            "role": "user",
            "parts": [
                {"text": payload.prompt or "Is this image AI-generated?"},
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": payload.base64_image,
                    }
                },
            ],
        }
    ]
    gen = client.generate_content(
        contents,
        generation_config={"temperature": 0.2, "maxOutputTokens": 256},
        candidate_count=1,
        return_text_only=False,
    )
    parts = gen.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    text = next((p.get("text") for p in parts if isinstance(p, dict) and p.get("text")), None)
    is_ai = None
    if text:
        lowered = text.lower()
        if "ai-generated" in lowered or "ai generated" in lowered or "machine generated" in lowered:
            is_ai = True
        elif "real photo" in lowered or "authentic" in lowered or "not ai" in lowered:
            is_ai = False
    update_image_analysis(
        image_id=image_id,
        model=model,
        is_ai=is_ai,
        score=None,
        comment=text,
    )
    neighbors = []
    emb_err = None
    emb_client = getattr(request.app.state, "embedding_client", None)
    if emb_client:
        try:
            img_bytes = base64.b64decode(payload.base64_image)
            vec = emb_client.embed_image(img_bytes)
            dim = vec.shape[0]
            upsert_embedding(image_id, vec.tobytes(), dim=dim)
            faiss_index = getattr(request.app.state, "faiss_index", None)
            if faiss_index is None:
                from app.embeddings import FaissIndex
                faiss_index = FaissIndex(dim=dim)
                request.app.state.faiss_index = faiss_index
            faiss_index.add(image_id, vec)
            neighbors = faiss_index.search(vec, k=5)
            neighbors = [n for n in neighbors if n[0] != image_id]
        except Exception as e:
            emb_err = str(e)
    return {"raw": gen, "comment": text, "is_ai": is_ai, "similar": neighbors, "embedding_error": emb_err}


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
    import os

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("API_KEY")
    project_id = os.getenv("GEMINI_PROJECT_ID", "lyrical-marker-477423-q8")
    location = os.getenv("GEMINI_LOCATION", "global")
    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    if not api_key:
        raise HTTPException(500, "Missing GEMINI_API_KEY or API_KEY env var")

    client = GeminiClient(api_key=api_key, project_id=project_id, location=location, model=model)

    try:
        base64.b64decode(base64_image, validate=True)
    except Exception:
        raise HTTPException(400, "Invalid base64 image data")

    contents = [
        {
            "role": "user",
            "parts": [
                {"text": prompt},
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": base64_image,
                    }
                },
            ],
        }
    ]

    gen = client.generate_content(
        contents,
        generation_config={"temperature": 0.2, "maxOutputTokens": 256},
        candidate_count=1,
        return_text_only=False,
    )

    text = None
    try:
        parts = gen.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        text = next((p.get("text") for p in parts if isinstance(p, dict) and p.get("text")), None)
    except Exception:
        pass

    return {"raw": gen, "summary": text}


@router.post("/images/{image_id}/vote")
def vote(image_id: int, req: VoteRequest) -> Dict[str, Any]:
    row = get_image(image_id)
    if not row:
        raise HTTPException(404, "Image not found")
    vote_id = insert_vote(image_id=image_id, is_ai=req.is_ai, voter_id=req.voter_id)
    counts = get_vote_counts(image_id)
    return {"vote_id": vote_id, "counts": counts}


@router.get("/images")
def list_all(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)) -> Dict[str, Any]:
    rows, total = list_images(limit=limit, offset=offset)
    return {"total": total, "items": rows}


@router.get("/images/{image_id}")
def get_one(image_id: int) -> Dict[str, Any]:
    row = get_image(image_id)
    if not row:
        raise HTTPException(404, "Not found")
    return {"image": dict(row)}
