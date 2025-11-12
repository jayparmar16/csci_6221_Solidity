from __future__ import annotations

import os
from dotenv import load_dotenv
import base64
import requests
import numpy as np
import faiss
from typing import Optional, Tuple, List


class GeminiEmbeddingClient:
    def __init__(self, api_key: Optional[str] = None, project_id: Optional[str] = None, location: str = "global", model: str = "gemini-embedding-001"):
        # Load environment from .env (idempotent)
        load_dotenv(dotenv_path=os.getenv("DOTENV_PATH", ".env"))
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_KEY") or os.getenv("API_KEY")
        if not self.api_key:
            raise ValueError("Missing GEMINI_API_KEY / GEMINI_KEY / API_KEY")
        self.project_id = project_id or os.getenv("GEMINI_PROJECT_ID") or os.getenv("PROJECT_ID")
        if not self.project_id:
            raise ValueError("Missing project_id (GEMINI_PROJECT_ID / PROJECT_ID)")
        self.location = location or os.getenv("GEMINI_LOCATION", "global")
        self.model = model or os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")

    def embed_image(self, image_bytes: bytes) -> np.ndarray:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        url = (
            f"https://{self.location}-aiplatform.googleapis.com/v1/"
            f"projects/{self.project_id}/locations/{self.location}/publishers/google/models/{self.model}:embedContent"
            f"?key={self.api_key}"
        )
        headers = {"Content-Type": "application/json"}
        payload = {
            "content": {
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64}}
                ]
            }
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        if not resp.ok:
            raise requests.HTTPError(f"Embedding failed [{resp.status_code}]: {resp.text}")
        data = resp.json()
        # Expected: { embeddings: { values: [ ... float ... ] } } or similar structure
        try:
            values = data.get("embeddings", {}).get("values")
            if values is None:
                # alternate structure if returned as list
                values = data.get("embedding", {}).get("values")
            vec = np.array(values, dtype=np.float32)
            return vec
        except Exception:
            raise ValueError(f"Unexpected embedding response: {data}")


class FaissIndex:
    def __init__(self, dim: int, metric: str = "ip"):
        # Use inner product + normalized vectors to approximate cosine similarity
        self.dim = dim
        if metric == "ip":
            self.index = faiss.IndexFlatIP(dim)
        elif metric == "l2":
            self.index = faiss.IndexFlatL2(dim)
        else:
            raise ValueError("metric must be 'ip' or 'l2'")
        self.ids: List[int] = []  # map FAISS position -> image_id

    def _normalize(self, vecs: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-9
        return vecs / norms

    def add(self, image_id: int, vec: np.ndarray) -> None:
        if vec.ndim == 1:
            vec = vec.reshape(1, -1)
        vec = self._normalize(vec)
        self.index.add(vec)
        self.ids.extend([image_id])

    def add_many(self, id_vec_pairs: List[Tuple[int, np.ndarray]]) -> None:
        if not id_vec_pairs:
            return
        ids = [i for (i, _) in id_vec_pairs]
        vecs = np.vstack([v.reshape(1, -1) if v.ndim == 1 else v for (_, v) in id_vec_pairs])
        vecs = self._normalize(vecs)
        self.index.add(vecs)
        self.ids.extend(ids)

    def search(self, vec: np.ndarray, k: int = 5) -> List[Tuple[int, float]]:
        if vec.ndim == 1:
            vec = vec.reshape(1, -1)
        vec = self._normalize(vec)
        scores, idxs = self.index.search(vec, k)
        out = []
        for i, score in zip(idxs[0], scores[0]):
            if i == -1:
                continue
            out.append((self.ids[i], float(score)))
        return out
