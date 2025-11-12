from typing import Optional, List, Dict, Any
import os
import requests
from dotenv import load_dotenv


class GeminiClient:
    """
    Simple API-key based client for Vertex AI Gemini generateContent.

    Notes:
    - This uses API key auth via query string (?key=...). Keep keys secure and avoid committing them.
    - For production, prefer OAuth2/Service Account with google-auth.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        project_id: str = "",
        location: str = "global",
        model: str = "gemini-1.5-flash",
        timeout: float = 30.0,
        session: Optional[requests.Session] = None,
    ) -> None:
        # Load .env once (idempotent)
        load_dotenv(dotenv_path=os.getenv("DOTENV_PATH", ".env"))

        if not api_key:
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_KEY") or os.getenv("API_KEY")
        if not api_key:
            raise ValueError("API key is required. Provide api_key or set GEMINI_API_KEY / GEMINI_KEY.")
        if not project_id:
            project_id = os.getenv("GEMINI_PROJECT_ID") or os.getenv("PROJECT_ID")
        if not project_id:
            raise ValueError("project_id is required. Provide project_id or set GEMINI_PROJECT_ID / PROJECT_ID.")

        self.api_key = api_key
        self.project_id = project_id
        self.location = location
        self.model = model
        self.timeout = timeout
        self.session = session or requests.Session()
        self.base_url = (
            f"https://{self.location}-aiplatform.googleapis.com/v1/"
            f"projects/{self.project_id}/locations/{self.location}/publishers/google/models"
        )

    def set_model(self, model: str) -> None:
        self.model = model

    def generate_content(
        self,
        contents: List[Dict[str, Any]],
        system_instruction: Optional[Dict[str, Any]] = None,
        generation_config: Optional[Dict[str, Any]] = None,
        candidate_count: int = 1,
        safety_settings: Optional[List[Dict[str, Any]]] = None,
        return_text_only: bool = True,
    ) -> Any:
        """
        Call the generateContent endpoint.

        contents: list of messages as dicts, e.g. [{"role":"user","parts":[{"text":"Hello"}]}]
        system_instruction: optional system message, e.g. {"parts":[{"text":"You are helpful"}]}
        generation_config: model parameters, e.g. {"temperature": 0.7, "maxOutputTokens": 256}
        candidate_count: number of candidates to return
        safety_settings: list of safety configs if needed
        return_text_only: if True, return the first candidate text or ""; else return full response JSON
        """

        url = f"{self.base_url}/{self.model}:generateContent?key={self.api_key}"
        headers = {"Content-Type": "application/json"}
        payload: Dict[str, Any] = {"contents": contents}
        # Use camelCase expected by Vertex AI generateContent
        if system_instruction:
            payload["systemInstruction"] = system_instruction
        # Ensure generationConfig uses camelCase and include candidateCount there
        if generation_config is not None:
            gen_cfg = dict(generation_config)
        else:
            gen_cfg = {}
        if candidate_count:
            gen_cfg["candidateCount"] = candidate_count
        if gen_cfg:
            payload["generationConfig"] = gen_cfg
        if safety_settings:
            payload["safetySettings"] = safety_settings

        resp = self.session.post(url, headers=headers, json=payload, timeout=self.timeout)
        if not resp.ok:
            raise requests.HTTPError(
                f"Gemini generateContent failed [{resp.status_code}]: {resp.text}", response=resp
            )
        data = resp.json()

        if return_text_only:
            try:
                candidates = data.get("candidates", [])
                if not candidates:
                    return ""
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts and isinstance(parts[0], dict) and "text" in parts[0]:
                    return parts[0]["text"]
                texts = [p.get("text") for p in parts if isinstance(p, dict) and p.get("text")]
                return "\n".join([t for t in texts if t])
            except Exception:
                return data
        return data

    def generate_text(
        self,
        prompt: str,
        system: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """Convenience wrapper to send a single user prompt and return text."""
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        system_instruction = {"parts": [{"text": system}]} if system else None
        result = self.generate_content(
            contents=contents,
            system_instruction=system_instruction,
            return_text_only=True,
            **kwargs,
        )
        return result if isinstance(result, str) else str(result)
