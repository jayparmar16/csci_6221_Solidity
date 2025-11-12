import sys
import json
import requests


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/test_vote.py <image_id> <ai|human> [voter_id] [base_url]", file=sys.stderr)
        sys.exit(2)
    image_id = int(sys.argv[1])
    stance = sys.argv[2].lower()
    is_ai = True if stance == "ai" else False
    voter_id = sys.argv[3] if len(sys.argv) > 3 else None
    base_url = sys.argv[4] if len(sys.argv) > 4 else "http://127.0.0.1:8000"

    payload = {"is_ai": is_ai, "voter_id": voter_id}
    r = requests.post(f"{base_url}/images/{image_id}/vote", json=payload)
    print(r.status_code)
    try:
        print(json.dumps(r.json(), indent=2))
    except Exception:
        print(r.text)


if __name__ == "__main__":
    main()
