import sys
import json
import requests


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/test_similar.py <image_id> [k] [base_url]", file=sys.stderr)
        sys.exit(2)
    image_id = int(sys.argv[1])
    k = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    base_url = sys.argv[3] if len(sys.argv) > 3 else "http://127.0.0.1:8000"

    r = requests.get(f"{base_url}/images/{image_id}/similar", params={"k": k})
    print(r.status_code)
    try:
        print(json.dumps(r.json(), indent=2))
    except Exception:
        print(r.text)


if __name__ == "__main__":
    main()
