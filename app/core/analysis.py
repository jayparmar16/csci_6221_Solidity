from typing import Optional, Dict, Any, Tuple, List
import os
import base64
import json
import re
from gemini_client import GeminiClient


def perform_analysis(
    image_bytes: bytes,
    mime_type: str = "image/jpeg",
    temperature: float = 0.2,
    max_tokens: int = 512,
) -> Dict[str, Any]:
    """Run Gemini analysis with structured output for AI detection.

    Returns dict with keys:
      - ai_score: int (0-100, where 0=definitely human, 100=definitely AI)
      - is_ai: bool (True if score >= 50)
      - explanation: str
      - model_used: str
      - fallback: Optional[dict]
      - error: Optional[str]
    """
    from app.utils.config import get_config
    cfg = get_config()
    project_id = cfg.get("GEMINI_PROJECT_ID") or cfg.get("PROJECT_ID")
    location = cfg.get("GEMINI_LOCATION") or "us-central1"
    model_env = cfg.get("GEMINI_ANALYSIS_MODEL") or cfg.get("GEMINI_MODEL") or "gemini-1.5-flash"
    if not project_id:
        return {"error": "Missing project id"}

    client = GeminiClient(project_id=project_id, location=location, model=model_env)
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    
    # Structured prompt for consistent JSON output
    structured_prompt = """Analyze this image and determine if it's AI-generated or human-created.

Respond ONLY with a valid JSON object in this exact format:
{
  "ai_score": <integer from 0 to 100>,
  "explanation": "<your detailed explanation>"
}

Where:
- ai_score: 0 means definitely human-created, 100 means definitely AI-generated, 50 is uncertain
- explanation: A clear, concise explanation of your reasoning (2-3 sentences)

Consider these factors:
- Visual artifacts common in AI images (distorted text, unnatural patterns, impossible physics)
- Consistency and realism of details
- Quality of rendering (too perfect or subtly flawed)
- Context and content plausibility

Response:"""

    contents = [
        {
            "role": "user",
            "parts": [
                {"text": structured_prompt},
                {"inline_data": {"mime_type": mime_type, "data": b64}},
            ],
        }
    ]
    
    try:
        gen = client.generate_content(
            contents,
            generation_config={
                "temperature": temperature, 
                "maxOutputTokens": max_tokens,
                "responseMimeType": "application/json"  # Request JSON response
            },
            candidate_count=1,
            return_text_only=False,
        )
        
        parts = gen.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        text = next((p.get("text") for p in parts if isinstance(p, dict) and p.get("text")), None)
        
        if not text:
            return {"error": "No response from model", "model_used": client.model}
        
        # Parse JSON response
        try:
            # Try to extract JSON from response (sometimes it's wrapped in markdown)
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                result = json.loads(json_match.group())
            else:
                result = json.loads(text)
            
            ai_score = int(result.get("ai_score", 50))
            explanation = result.get("explanation", text)
            
            # Clamp score to 0-100
            ai_score = max(0, min(100, ai_score))
            
            fallback_meta = gen.get("_fallback") if isinstance(gen, dict) else None
            
            return {
                "ai_score": ai_score,
                "is_ai": ai_score >= 50,
                "explanation": explanation,
                "model_used": client.model,
                "fallback": fallback_meta,
                "raw": gen,
            }
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            # Fallback: try to infer from text
            return {
                "ai_score": 50,  # Unknown
                "is_ai": None,
                "explanation": text,
                "model_used": client.model,
                "error": f"Failed to parse structured response: {e}",
                "raw": gen,
            }
            
    except Exception as e:
        return {"error": str(e), "model_used": client.model}
