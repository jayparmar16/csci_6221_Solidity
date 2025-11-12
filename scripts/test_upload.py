import sys
import requests


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/test_upload.py <image_path> [base_url]", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    base_url = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8000"

    with open(path, "rb") as f:
        files = {"file": (path, f, "application/octet-stream")}
        r = requests.post(f"{base_url}/images/upload", files=files)
    print(r.status_code)
    print(r.text)


if __name__ == "__main__":
    main()
