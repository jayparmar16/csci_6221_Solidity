"""Helper utilities wrapping FAISS index operations.

The FastAPI app keeps a single in-memory FAISS index in app.state.faiss_index.
These helpers centralize creation, addition, and search logic.
"""
from __future__ import annotations
from typing import List, Tuple, Optional
import numpy as np
from app.core.embeddings import FaissIndex

def ensure_index(app, dim: int) -> FaissIndex:
    idx = getattr(app.state, "faiss_index", None)
    if idx is None:
        idx = FaissIndex(dim=dim)
        app.state.faiss_index = idx
    return idx

def add_embedding(app, image_id: int, vec: np.ndarray) -> None:
    if vec.ndim == 1:
        dim = vec.shape[0]
    else:
        dim = vec.shape[1]
    idx = ensure_index(app, dim)
    idx.add(image_id, vec)
    print(f"[FAISS] helper added embedding image_id={image_id} dim={idx.dim} total={idx.index.ntotal}")

def search_neighbors(app, vec: np.ndarray, k: int = 5, exclude_id: Optional[int] = None) -> List[Tuple[int, float]]:
    idx = getattr(app.state, "faiss_index", None)
    if idx is None:
        return []
    res = idx.search(vec, k=k)
    if exclude_id is not None:
        res = [r for r in res if r[0] != exclude_id]
    return res
