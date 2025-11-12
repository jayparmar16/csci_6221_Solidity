from fastapi import FastAPI
import numpy as np

from app.embeddings import GeminiEmbeddingClient, FaissIndex
from dotenv import load_dotenv
import os
from dotenv import load_dotenv
from app.db import init_db
from app.routes import router


app = FastAPI(title="AI Image Auditor")


@app.on_event("startup")
def on_startup() -> None:
    # Load .env before any client initialization
    load_dotenv(dotenv_path=os.getenv("DOTENV_PATH", ".env"))
    # Initialize DB
    init_db()

    # Build FAISS from existing embeddings in DB (if any)
    from app.db import get_conn
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT image_id, dim, vector FROM image_embeddings")
        rows = cur.fetchall()
        if rows:
            dim = int(rows[0][1])
            faiss_index = FaissIndex(dim=dim)
            id_vec_pairs = []
            for r in rows:
                image_id = int(r[0])
                vec = np.frombuffer(r[2], dtype=np.float32)
                id_vec_pairs.append((image_id, vec))
            faiss_index.add_many(id_vec_pairs)
            app.state.faiss_index = faiss_index
        else:
            app.state.faiss_index = None
    finally:
        conn.close()

    # Initialize embedding client
    try:
        app.state.embedding_client = GeminiEmbeddingClient(model="gemini-embedding-001")
    except Exception:
        app.state.embedding_client = None  # Embeddings disabled if credentials missing


# Include API routes
app.include_router(router)
