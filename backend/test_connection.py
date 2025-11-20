#!/usr/bin/env python3
from gemini_client import gemini_client

print("✓ Gemini client initialized successfully")
models = list(gemini_client.list_models())
print(f"✓ Found {len(models)} models available")
print("\nAvailable models:")
for model in models[:5]:  # Show first 5
    print(f"  - {model.name}")
