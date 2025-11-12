# Testing the AI Image Auditor Backend

This guide shows how to initialize and inspect the SQLite database, run the FastAPI server, and use the provided test scripts.

## Prerequisites
- Python 3.9+
- Dependencies installed:
  ```bash
  pip3 install -r requirements.txt
  ```

## Environment variables (for analysis)
Set these if you plan to use the Gemini analysis endpoint (`/images/analyze-inline`):
```bash
export GEMINI_API_KEY="<YOUR_API_KEY>"
export GEMINI_PROJECT_ID="PROJECT_ID"
export GEMINI_LOCATION="global"      # or us-central1
export GEMINI_MODEL="gemini-1.5-flash"
```

## Start the API server
```bash
uvicorn app.main:app --reload --port 8000
```

## Initialize or inspect the database
The SQLite DB file (`data.sqlite3`) is auto-created on first server start. You can also initialize manually:
```bash
python3 -c "from app.db import init_db; init_db(); print('DB initialized')"
```

List tables and peek at data:
```bash
sqlite3 data.sqlite3 '.tables'
sqlite3 data.sqlite3 'PRAGMA table_info(images);'
sqlite3 data.sqlite3 'PRAGMA table_info(votes);'
sqlite3 data.sqlite3 'SELECT id, sha256, analysis_is_ai, analysis_score FROM images LIMIT 10;'
sqlite3 data.sqlite3 'SELECT id, image_id, is_ai, voter_id FROM votes LIMIT 10;'
```

## Test scripts
All scripts default to `http://127.0.0.1:8000`. Provide a different base URL as the last argument if needed.

### 1) Upload image (dedup by SHA-256)
```bash
python3 scripts/test_upload.py /path/to/image.jpg
```
Output includes whether the image already exists and, if new, the `image_id`.

### 2) Analyze an image inline with Gemini
Requires environment variables above.
```bash
python3 scripts/test_analyze_inline.py /path/to/image.jpg
```
Returns the raw Gemini response and a short summary text if available.

### 3) Vote on an image
```bash
python3 scripts/test_vote.py <image_id> ai alice
python3 scripts/test_vote.py <image_id> human bob
```
Returns the new vote ID and aggregated counts `{ ai, human }`.

### 4) List and get images
```bash
python3 scripts/test_list_get.py
```
Shows the latest images and fetches the first one.

### Embedding & similarity scripts
Upload + analyze (stores embedding, returns neighbors):
```bash
python3 scripts/test_embed_upload.py /path/to/image.jpg
```
Analyze existing image id with a new image payload (updates embedding):
```bash
python3 scripts/test_embed_analyze_id.py <image_id> /path/to/image.jpg
```
Query similar images via FAISS:
```bash
python3 scripts/test_similar.py <image_id> 5
```
Environment must include Gemini embedding model setup (defaults used if GEMINI_EMBEDDING_MODEL not set):
```bash
export GEMINI_EMBEDDING_MODEL="gemini-embedding-001"
```
If embeddings unavailable (missing API key or model), similarity endpoints return 503.

## Troubleshooting
- If `fastapi`/`pydantic` imports fail, ensure requirements are installed.
- If analysis fails, verify `GEMINI_API_KEY` and region/model are valid.
- If upload returns `exists: true`, the image is already recorded by hash.
- To start fresh, stop the server, remove `data.sqlite3`, re-run init, and restart.

## Blockchain development TODOs (context)
- Implement Solidity contracts (Hardhat) for image registry and optional voting.
- Upload image bytes to IPFS/Arweave; store URI and hash on-chain.
- Update backend `/images/upload` to write tx hash + URI via `update_image_blockchain`.
- Add endpoint to fetch and analyze the canonical on-chain image automatically.