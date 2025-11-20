import requests
import json
import os

# Use the GCE IP
API_URL = "http://34.31.217.123:8001/api/deep/chat"

def test_stream():
    payload = {
        "message": "Hello, say 'test' and nothing else.",
        "file_uris": [],
        "thinking_level": "low",
        "media_resolution": "medium"
    }
    
    print(f"Connecting to {API_URL}...")
    try:
        with requests.post(API_URL, json=payload, stream=True) as r:
            r.raise_for_status()
            print("Connected. Listening for stream...")
            for line in r.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8')
                    print(f"Received: {decoded_line}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_stream()
