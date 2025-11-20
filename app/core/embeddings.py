from __future__ import annotations

import os
from dotenv import load_dotenv
from app.utils.config import get_config
import base64
import requests
import numpy as np
import faiss
from typing import Optional, Tuple, List
import google.auth
from google.auth.transport.requests import Request as GoogleAuthRequest


class GeminiEmbeddingClient:
    def __init__(self, project_id: Optional[str] = None, location: str = "us-central1", model: str = "multimodalembedding@001"):
        # Load environment from .env (idempotent)
        load_dotenv(dotenv_path=os.getenv("DOTENV_PATH", ".env"))
        cfg = get_config()
        
        self.project_id = project_id or cfg.get("GEMINI_PROJECT_ID") or cfg.get("PROJECT_ID")
        if not self.project_id:
            raise ValueError("Missing project_id (GEMINI_PROJECT_ID / PROJECT_ID)")
        
        self.location = location or cfg.get("GEMINI_LOCATION") or "us-central1"
        self.model = model or cfg.get("GEMINI_EMBEDDING_MODEL") or "multimodalembedding@001"
        
        # Initialize Google Cloud credentials with required scopes
        self.scopes = [
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/generative-language"
        ]
        self.credentials, _ = google.auth.default(scopes=self.scopes)
        
    def _get_token(self) -> str:
        """Get a valid access token, refreshing if necessary."""
        if not self.credentials.valid:
            self.credentials.refresh(GoogleAuthRequest())
        return self.credentials.token

    def embed_image(self, image_bytes: bytes) -> np.ndarray:
        """Embed an image using Vertex AI Multimodal Embedding with ADC authentication."""
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        
        # Use Vertex AI Multimodal Embedding API for image embeddings
        url = (
            f"https://{self.location}-aiplatform.googleapis.com/v1/"
            f"projects/{self.project_id}/locations/{self.location}/"
            f"publishers/google/models/{self.model}:predict"
        )
        
        # Get fresh bearer token
        token = self._get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "instances": [
                {
                    "image": {
                        "bytesBase64Encoded": b64
                    }
                }
            ]
        }
        
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        if not resp.ok:
            raise requests.HTTPError(f"Embedding failed [{resp.status_code}]: {resp.text}")
        data = resp.json()
        
        # Expected structure: { "predictions": [{ "imageEmbedding": [...] }] }
        try:
            predictions = data.get("predictions", [])
            if not predictions:
                raise ValueError(f"No predictions in response: {data}")
            
            embedding = predictions[0].get("imageEmbedding")
            if embedding is None:
                raise ValueError(f"No imageEmbedding in response: {data}")
            
            vec = np.array(embedding, dtype=np.float32)
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
