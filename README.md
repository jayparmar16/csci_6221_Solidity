# AI Image Auditor (Gemini + FastAPI + SQLite + FAISS)

Detect, describe, and crowd‑vote whether images are AI‑generated. Backed by Google Vertex AI Gemini for analysis & embeddings, with a roadmap to anchor image metadata and votes on an EVM blockchain.

## 1. Overview
This project provides:
- A lightweight Python client (`gemini_client.py`) for Vertex AI Gemini text & multimodal generation via API key.
- A FastAPI backend (`app/main.py`, `app/routes.py`) to:
	- Upload images (hash‑dedup via SHA‑256).
	- Analyze images with Gemini (heuristic AI vs. real labeling).
	- Generate and store image embeddings (Gemini embedding model) and perform similarity search using FAISS.
	- Collect community votes (ai / human) per image.
	- Retrieve nearest similar images.
- Persistence with SQLite (`data.sqlite3`).
- Clear test scripts under `scripts/` for every endpoint.
- Environment variable auto‑loading from `.env` via `python-dotenv`.
- Modular route separation (`app/routes.py`).

## 2. Features
- Upload & optional immediate analysis (`/images/upload`).
- Post‑hoc analysis of existing image (`/images/{id}/analyze`).
- Inline ad‑hoc analysis without storing (`/images/analyze-inline`).
- Vote recording + tally (`/images/{id}/vote`).
- Embedding similarity (`/images/{id}/similar`).
- Automatic FAISS index build on startup from stored embeddings.
- Safe .env loading (supports `GEMINI_API_KEY` or `GEMINI_KEY`).

## 3. Architecture
```
Client -> FastAPI (routes.py) -> Gemini (generateContent / embedContent)
														 -> SQLite (images, votes, image_embeddings)
														 -> FAISS in-memory index (normalized inner product)
Planned: IPFS/Arweave + EVM smart contracts for on-chain registry & votes
```

Key files:
- `gemini_client.py`: simple API key wrapper for generateContent.
- `app/embeddings.py`: embedding client + FAISS index helper.
- `app/routes.py`: all HTTP endpoints.
- `app/main.py`: app creation, startup lifecycle, router inclusion.
- `app/db.py`: DB schema & CRUD helpers.
- `scripts/*.py`: endpoint exercise utilities.

## 4. Environment & Configuration
Create a `.env` (already included, but real keys should not be committed):
```
GEMINI_API_KEY="API_KEY"
GEMINI_PROJECT_ID="PROJECT_ID"
GEMINI_LOCATION="global"
GEMINI_MODEL="gemini-2.5-flash"
GEMINI_EMBEDDING_MODEL="gemini-embedding-001"
```
Fallback variable names also supported: `GEMINI_KEY`, `PROJECT_ID`, `API_KEY`.

The backend loads `.env` automatically on startup and inside clients; you usually just start the server.

## 5. Gemini client (API key) quick start

This repo now includes a simple API-key-based client for Vertex AI Gemini (`gemini_client.py`).

Prereqs:
- Python 3.9+
- A Vertex AI API key
- Project ID with Vertex AI API enabled

Install deps:

```bash
pip install -r requirements.txt
```

Set env vars and run example:

```bash
export GEMINI_API_KEY="API_KEY"
export GEMINI_PROJECT_ID="PROJECT_ID"
export GEMINI_LOCATION="us-central1"
export GEMINI_MODEL="gemini-2.5-flash"

python -m examples.generate_example
```

Use in code:

```python
from gemini_client import GeminiClient

client = GeminiClient(
	api_key="<YOUR_API_KEY>",
	project_id="<PROJECT_ID>",
	location="global",
	model="gemini-2.5-flash",
)

text = client.generate_text(
	prompt="Write a joke about APIs",
	generation_config={"temperature": 0.7, "maxOutputTokens": 256},
)
print(text)
```

## 6. Backend (FastAPI) endpoints

Install backend deps:
```bash
pip install -r requirements.txt
```

Run dev server (auto loads .env):
```bash
uvicorn app.main:app --reload --port 8000
```

Endpoints (see detailed route behavior above):

Image analysis uses Gemini (API key env var GEMINI_API_KEY).

### 6.1 Database setup & inspection
SQLite file auto-created on first start at `data.sqlite3` in repo root.
Manual init (optional):
```bash
python3 -c "from app.db import init_db; init_db(); print('DB initialized')"
```
Inspect tables:
```bash
sqlite3 data.sqlite3 '.tables'
sqlite3 data.sqlite3 'PRAGMA table_info(images);'
sqlite3 data.sqlite3 'SELECT id, sha256, analysis_is_ai, analysis_score FROM images LIMIT 5;'
```

### 6.2 Test scripts
Upload image:
```bash
python3 scripts/test_upload.py /path/to/image.jpg
```
Analyze inline (Gemini):
```bash
python3 scripts/test_analyze_inline.py /path/to/image.jpg
```
Vote:
```bash
python3 scripts/test_vote.py <image_id> ai alice
python3 scripts/test_vote.py <image_id> human bob
```
List & get:
```bash
python3 scripts/test_list_get.py
```
Set base URL by adding second arg (e.g. http://localhost:8000) if different.

## 7. Embeddings & Similarity
When an image is analyzed (upload with `analyze=true` or `/images/{id}/analyze`), the Gemini embedding model (`gemini-embedding-001`) generates a vector. Vectors are L2‑normalized and stored in SQLite, then added to an in-memory FAISS index (`IndexFlatIP`) for cosine‑style similarity. Query:
```
GET /images/{image_id}/similar?k=5
```
If embeddings were created without a running key, re-run analyze to populate them.

## 8. Blockchain roadmap (Solidity / Hardhat)
1. ERC-721 or ERC-1155 contract for image tokens OR a registry contract mapping sha256 -> metadata struct.
2. Store content hash only on-chain; actual bytes in IPFS / Arweave.
3. Emit ImageRegistered event with hash, URI, uploader address.
4. Prevent duplicates by checking mapping before mint/registration.
5. Voting smart contract (optional) to record on-chain votes with address and stance; integrate snapshot of off-chain votes later.
6. Consider Merkle proofs or on-chain tally for trustless aggregation.
7. Upgrade path: add moderation roles or slashing for fraudulent submissions.

## 9. Environment Variables
- GEMINI_API_KEY / API_KEY: Vertex AI key
- GEMINI_PROJECT_ID: Project id
- GEMINI_LOCATION: Region (default global)
- GEMINI_MODEL: Model (default gemini-1.5-flash)

## 10. Future Improvements
- Add force re-analysis flag on upload for existing images.
- Persist FAISS index to disk for faster cold starts.
- Add pagination + filtering for votes & similarity results.
- Include basic unit tests (pytest) for DB and routes.
- Integrate Hardhat deployment scripts; add contract ABIs.
- Optional JWT auth for vote integrity.

## 11. License
See `LICENSE`.

---
AI Image Auditor – empower transparent verification of visual media.