import sys
import json
import requests


def list_images(base_url: str):
    r = requests.get(f"{base_url}/images?limit=10&offset=0")
    print("LIST status:", r.status_code)
    try:
        data = r.json()
        print(json.dumps(data, indent=2))
        return data
    except Exception:
        print(r.text)
        return None


def get_image(base_url: str, image_id: int):
    r = requests.get(f"{base_url}/images/{image_id}")
    print("GET status:", r.status_code)
    try:
        data = r.json()
        print(json.dumps(data, indent=2))
    except Exception:
        print(r.text)


def main():
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
    data = list_images(base_url)
    if data and data.get("items"):
        first_id = data["items"][0]["id"]
        get_image(base_url, first_id)


if __name__ == "__main__":
    main()
