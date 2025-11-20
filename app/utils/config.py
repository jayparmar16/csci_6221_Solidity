"""Central configuration loader using .env file.

All code should rely on get_config() instead of os.getenv directly.
"""
from functools import lru_cache
from typing import Dict, Any
import os
from dotenv import dotenv_values

ENV_PATH = os.getenv("DOTENV_PATH", ".env")

@lru_cache()
def get_config() -> Dict[str, Any]:
    raw = dotenv_values(ENV_PATH)
    # Normalize keys to upper-case for consistency
    cfg = {k.upper(): v for k, v in raw.items()}
    return cfg

def require(keys):
    cfg = get_config()
    missing = [k for k in keys if cfg.get(k) in (None, "")]
    if missing:
        raise ValueError(f"Missing required config keys: {missing}")
    return cfg
