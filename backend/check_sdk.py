from google import genai
import os
import inspect
import traceback

try:
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        print("WARNING: GEMINI_API_KEY not found in env")
    
    client = genai.Client(api_key=api_key)
    print("Client created successfully.")
    
    if hasattr(client, 'files'):
        print("Files module contents:", dir(client.files))
        if hasattr(client.files, 'upload'):
            print("Upload signature:", inspect.signature(client.files.upload))
            print("Upload doc:", client.files.upload.__doc__)
        else:
            print("client.files has no 'upload' method")
    else:
        print("Client has no 'files' attribute")
        
except Exception as e:
    print("Error:", e)
    traceback.print_exc()
