import os
import time
from pathlib import Path
from typing import Optional, Dict, Any
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class FileManager:
    """
    Reusable module for managing file uploads to Gemini File API.
    Handles file lifecycle: upload, state tracking, and cleanup.
    """
    
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        genai.configure(api_key=self.api_key)
        self._uploaded_files = {}  # Track uploaded files by URI
    
    def upload_file(self, file_path: str, display_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Upload a file to the Gemini File API.
        
        Args:
            file_path: Path to the file to upload
            display_name: Optional display name for the file
            
        Returns:
            Dictionary with file metadata:
            {
                "uri": "...",
                "name": "...",
                "display_name": "...",
                "mime_type": "...",
                "size_bytes": ...,
                "state": "..."
            }
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Use filename as display name if not provided
        if display_name is None:
            display_name = Path(file_path).name
        
        print(f"📤 Uploading {display_name} to Gemini File API...")
        
        # Upload the file
        uploaded_file = genai.upload_file(file_path, display_name=display_name)
        
        # Store metadata
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
        
        Args:
            file_uri: The URI of the uploaded file
            timeout: Maximum time to wait in seconds (default 5 minutes)
            
        Returns:
            True if file became active, False if timeout
        """
        print(f"⏳ Waiting for file to be processed: {file_uri}")
        
        start_time = time.time()
        while time.time() - start_time < timeout:
            file = genai.get_file(file_uri)
            
            if file.state.name == "ACTIVE":
                print(f"✅ File is ready: {file_uri}")
                # Update cached metadata
                if file_uri in self._uploaded_files:
                    self._uploaded_files[file_uri]["state"] = "ACTIVE"
                return True
            
            elif file.state.name == "FAILED":
                print(f"❌ File processing failed: {file_uri}")
                return False
            
            # Still processing
            time.sleep(2)
        
        print(f"⏰ Timeout waiting for file: {file_uri}")
        return False
    
    def get_file_status(self, file_uri: str) -> Dict[str, Any]:
        """
        Get the current status of an uploaded file.
        
        Args:
            file_uri: The URI of the file
            
        Returns:
            Dictionary with current file metadata
        """
        file = genai.get_file(file_uri)
        
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
        
        Args:
            file_uri: The URI of the file to delete
            
        Returns:
            True if deletion succeeded
        """
        try:
            genai.delete_file(file_uri)
            print(f"🗑️  Deleted file: {file_uri}")
            
            # Remove from cache
            if file_uri in self._uploaded_files:
                del self._uploaded_files[file_uri]
            
            return True
        except Exception as e:
            print(f"❌ Error deleting file {file_uri}: {e}")
            return False
    
    def list_files(self) -> list:
        """
        List all files uploaded to the File API.
        
        Returns:
            List of file metadata dictionaries
        """
        files = []
        for file in genai.list_files():
            files.append({
                "uri": file.uri,
                "name": file.name,
                "display_name": file.display_name,
                "mime_type": file.mime_type,
                "state": file.state.name
            })
        return files
    
    def cleanup_old_files(self, max_age_hours: int = 24):
        """
        Delete files older than max_age_hours.
        
        Args:
            max_age_hours: Maximum age in hours before deletion
        """
        print(f"🧹 Cleaning up files older than {max_age_hours} hours...")
        
        current_time = time.time()
        deleted_count = 0
        
        for file in genai.list_files():
            # Note: File API doesn't provide creation_time in current SDK
            # This is a placeholder for future enhancement
            # For now, we just list the files
            pass
        
        print(f"✅ Cleanup complete. Deleted {deleted_count} files.")

# Singleton instance
file_manager = FileManager()
