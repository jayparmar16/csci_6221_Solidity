import sys
import base64
import json
import requests


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/test_embed_analyze_id.py <image_id> <image_path> [base_url]", file=sys.stderr)
        sys.exit(2)
    image_id = int(sys.argv[1])
    path = sys.argv[2]
    base_url = sys.argv[3] if len(sys.argv) > 3 else "http://127.0.0.1:8000"

    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    payload = {"base64_image": b64}
    r = requests.post(f"{base_url}/images/{image_id}/analyze", json=payload)
    print(r.status_code)
    try:
        print(json.dumps(r.json(), indent=2))
    except Exception:
        print(r.text)


if __name__ == "__main__":
    main()
