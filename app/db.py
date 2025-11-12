import sqlite3
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


DB_PATH = Path(__file__).resolve().parents[1] / "data.sqlite3"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS images (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sha256 TEXT NOT NULL UNIQUE,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              model TEXT,
              analysis_is_ai INTEGER,
              analysis_score REAL,
              analysis_comment TEXT,
              blockchain_tx TEXT,
              blockchain_uri TEXT
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS image_embeddings (
                image_id INTEGER PRIMARY KEY,
                dim INTEGER NOT NULL,
                vector BLOB NOT NULL,
                FOREIGN KEY(image_id) REFERENCES images(id)
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS votes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              image_id INTEGER NOT NULL,
              is_ai INTEGER NOT NULL,
              voter_id TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(image_id) REFERENCES images(id)
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


def find_image_by_hash(sha256: str) -> Optional[sqlite3.Row]:
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM images WHERE sha256 = ?", (sha256,))
        row = cur.fetchone()
        return row
    finally:
        conn.close()


def insert_image(
    sha256: str,
    model: Optional[str],
    is_ai: Optional[bool],
    score: Optional[float],
    comment: Optional[str],
    blockchain_tx: Optional[str],
    blockchain_uri: Optional[str],
) -> int:
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO images (sha256, model, analysis_is_ai, analysis_score, analysis_comment, blockchain_tx, blockchain_uri)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                sha256,
                model,
                1 if is_ai else (0 if is_ai is not None else None),
                score,
                comment,
                blockchain_tx,
                blockchain_uri,
            ),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def get_image(image_id: int) -> Optional[sqlite3.Row]:
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM images WHERE id = ?", (image_id,))
        row = cur.fetchone()
        return row
    finally:
        conn.close()


def list_images(limit: int = 20, offset: int = 0) -> Tuple[list, int]:
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM images")
        (total,) = cur.fetchone()
        cur.execute(
            "SELECT * FROM images ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        rows = cur.fetchall()
        return [dict(r) for r in rows], int(total)
    finally:
        conn.close()


def insert_vote(image_id: int, is_ai: bool, voter_id: Optional[str]) -> int:
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO votes (image_id, is_ai, voter_id) VALUES (?, ?, ?)",
            (image_id, 1 if is_ai else 0, voter_id),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def get_vote_counts(image_id: int) -> Dict[str, int]:
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT SUM(CASE WHEN is_ai = 1 THEN 1 ELSE 0 END) AS ai, "
            "SUM(CASE WHEN is_ai = 0 THEN 1 ELSE 0 END) AS human FROM votes WHERE image_id = ?",
            (image_id,),
        )
        row = cur.fetchone()
        return {"ai": int(row["ai"] or 0), "human": int(row["human"] or 0)}
    finally:
        conn.close()


def upsert_embedding(image_id: int, vector: bytes, dim: int) -> None:
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO image_embeddings(image_id, dim, vector)
            VALUES (?, ?, ?)
            ON CONFLICT(image_id) DO UPDATE SET dim = excluded.dim, vector = excluded.vector
            """,
            (image_id, dim, vector),
        )
        conn.commit()
    finally:
        conn.close()


def nearest_by_embedding(query_vec: bytes, dim: int, top_k: int = 5) -> list:
    """
    Very simple brute-force cosine similarity in Python over stored vectors.
    For production, use FAISS/pgvector/Annoy. Returns list of tuples (image_id, score).
    """
    import numpy as np

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT image_id, vector FROM image_embeddings WHERE dim = ?", (dim,))
        rows = cur.fetchall()
        if not rows:
            return []
        q = np.frombuffer(query_vec, dtype=np.float32)
        qn = q / (np.linalg.norm(q) + 1e-9)
        scores = []
        for r in rows:
            vec = np.frombuffer(r["vector"], dtype=np.float32)
            vn = vec / (np.linalg.norm(vec) + 1e-9)
            score = float(np.dot(qn, vn))
            scores.append((int(r["image_id"]), score))
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]
    finally:
        conn.close()


def update_image_analysis(
    image_id: int,
    model: Optional[str],
    is_ai: Optional[bool],
    score: Optional[float],
    comment: Optional[str],
) -> None:
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE images SET model = ?, analysis_is_ai = ?, analysis_score = ?, analysis_comment = ?
            WHERE id = ?
            """,
            (
                model,
                1 if is_ai else (0 if is_ai is not None else None),
                score,
                comment,
                image_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def update_image_blockchain(
    image_id: int,
    blockchain_tx: Optional[str],
    blockchain_uri: Optional[str],
) -> None:
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE images SET blockchain_tx = ?, blockchain_uri = ?
            WHERE id = ?
            """,
            (
                blockchain_tx,
                blockchain_uri,
                image_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()
