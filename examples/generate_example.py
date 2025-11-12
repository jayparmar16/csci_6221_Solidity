import os
from gemini_client import GeminiClient


def main() -> None:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("API_KEY")
    if not api_key:
        raise SystemExit("Set GEMINI_API_KEY or API_KEY environment variable.")

    project_id = os.getenv("GEMINI_PROJECT_ID", "lyrical-marker-477423-q8")
    location = os.getenv("GEMINI_LOCATION", "global")
    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

    client = GeminiClient(
        api_key=api_key,
        project_id=project_id,
        location=location,
        model=model,
    )

    print("Calling generate_text()...\n")
    text = client.generate_text(
        prompt="List 3 reasons to write unit tests.",
        generation_config={"temperature": 0.7, "maxOutputTokens": 256},
    )
    print(text)


if __name__ == "__main__":
    main()
