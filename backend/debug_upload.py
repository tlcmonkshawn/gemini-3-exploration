from file_manager import file_manager
import os
import traceback

# Create dummy file
with open("test_debug.txt", "w") as f:
    f.write("This is a test file for debugging upload.")

try:
    print("Attempting upload...")
    res = file_manager.upload_file("test_debug.txt")
    print("Success:", res)
except Exception as e:
    print("Error:", e)
    traceback.print_exc()
