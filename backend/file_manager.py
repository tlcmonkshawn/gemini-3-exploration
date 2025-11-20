import os
import time
from pathlib import Path
from typing import Optional, Dict, Any
from google import genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class FileManager:
    """
    Reusable module for managing file uploads to Gemini File API.
    Handles file lifecycle: upload, state tracking, and cleanup.
    Uses google-genai SDK (v1.0+).
    """
    
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        
        # Initialize the client with the new SDK structure
        self.client = genai.Client(api_key=self.api_key)
        self._uploaded_files = {}  # Track uploaded files by URI
    
    def upload_file(self, file_path: str, display_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Upload a file to the Gemini File API.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Use filename as display name if not provided
        if display_name is None:
            display_name = Path(file_path).name
        
        print(f"📤 Uploading {display_name} to Gemini File API...")
        
        # Upload the file using new SDK
        # client.files.upload(file=..., config=...)
        try:
            uploaded_file = self.client.files.upload(
                file=file_path,
                config={'display_name': display_name}
            )
        except TypeError:
            # Fallback if config is not accepted or signature is different
            print("⚠️ Upload with config failed, trying simple upload...")
            uploaded_file = self.client.files.upload(path=file_path)
        
        # Store metadata
        # Note: New SDK might have different property names, checking common ones
        # Assuming: uri, name, display_name, mime_type, size_bytes, state
        file_metadata = {
            "uri": uploaded_file.uri,
            "name": uploaded_file.name,
            "display_name": uploaded_file.display_name,
            "mime_type": uploaded_file.mime_type,
            "size_bytes": uploaded_file.size_bytes,
            "state": uploaded_file.state.name
        }
        
        self._uploaded_files[uploaded_file.uri] = file_metadata
        
        print(f"✅ Upload complete: {uploaded_file.uri}")
        return file_metadata
    
    def wait_for_file_active(self, file_uri: str, timeout: int = 300) -> bool:
        """
        Wait for a file to reach ACTIVE state.
        """
        print(f"⏳ Waiting for file to be processed: {file_uri}")
        
        # Extract file name from URI if needed, or pass URI if SDK supports it
        # Usually SDK get_file takes the 'name' (files/...) not the URI
        # But let's try to find the name from our cache or the URI
        file_name = self._get_name_from_uri(file_uri)
        
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                file = self.client.files.get(name=file_name)
                
                if file.state.name == "ACTIVE":
                    print(f"✅ File is ready: {file_uri}")
                    # Update cached metadata
                    if file_uri in self._uploaded_files:
                        self._uploaded_files[file_uri]["state"] = "ACTIVE"
                    return True
                
                elif file.state.name == "FAILED":
                    print(f"❌ File processing failed: {file_uri}")
                    return False
                
            except Exception as e:
                print(f"⚠️ Error checking file status: {e}")
            
            # Still processing
            time.sleep(2)
        
        print(f"⏰ Timeout waiting for file: {file_uri}")
        return False
    
    def get_file_status(self, file_uri: str) -> Dict[str, Any]:
        """
        Get the current status of an uploaded file.
        """
        file_name = self._get_name_from_uri(file_uri)
        file = self.client.files.get(name=file_name)
        
        metadata = {
            "uri": file.uri,
            "name": file.name,
            "display_name": file.display_name,
            "mime_type": file.mime_type,
            "size_bytes": file.size_bytes,
            "state": file.state.name
        }
        
        # Update cache
        self._uploaded_files[file_uri] = metadata
        return metadata
    
    def delete_file(self, file_uri: str) -> bool:
        """
        Delete a file from the Gemini File API.
        """
        try:
            file_name = self._get_name_from_uri(file_uri)
            self.client.files.delete(name=file_name)
            print(f"🗑️  Deleted file: {file_uri}")
            
            # Remove from cache
            if file_uri in self._uploaded_files:
                del self._uploaded_files[file_uri]
            
            return True
        except Exception as e:
            print(f"❌ Error deleting file {file_uri}: {e}")
            return False
    
    def _get_name_from_uri(self, file_uri: str) -> str:
        """
        Helper to extract 'files/...' name from URI or cache.
        """
        # print(f"DEBUG: Looking for {file_uri} in cache keys: {list(self._uploaded_files.keys())}")
        if file_uri in self._uploaded_files:
            return self._uploaded_files[file_uri]["name"]
        
        # Fallback: try to extract from URI if it follows standard format
        # https://generativelanguage.googleapis.com/v1beta/files/xyz
        name = file_uri
        if "/files/" in file_uri:
            name = "files/" + file_uri.split("/files/")[-1]
        elif "files/" in file_uri:
            name = "files/" + file_uri.split("files/")[-1]
            
        # Strip query params
        if "?" in name:
            name = name.split("?")[0]
            
        print(f"DEBUG: Extracted name '{name}' from URI '{file_uri}'")
        return name

# Singleton instance
file_manager = FileManager()
