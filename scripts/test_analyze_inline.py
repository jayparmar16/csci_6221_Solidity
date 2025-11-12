import sys
import base64
import json
import requests


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/test_analyze_inline.py <image_path> [base_url]", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    base_url = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8000"

    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")

    payload = {"base64_image": b64, "prompt": "Is this AI-generated? Short reason."}
    r = requests.post(f"{base_url}/images/analyze-inline", json=payload)
    print(r.status_code)
    try:
        print(json.dumps(r.json(), indent=2))
    except Exception:
        print(r.text)


if __name__ == "__main__":
    main()
