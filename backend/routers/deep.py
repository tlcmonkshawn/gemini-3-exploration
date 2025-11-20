import os
import tempfile
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from gemini_client import gemini_client
from file_manager import file_manager

router = APIRouter(prefix="/api/deep", tags=["Deep Mode"])

# Request/Response models
class ChatRequest(BaseModel):
    message: str
    file_uris: List[str] = []
    thinking_level: Optional[str] = "low"  # "low" or "high"
    media_resolution: Optional[str] = "medium"  # "low", "medium", or "high"

class UploadResponse(BaseModel):
    file_uri: str
    display_name: str
    mime_type: str
    state: str

@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a file to Gemini File API.
    Returns file URI for use in chat requests.
    """
    try:
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename}") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        # Upload to Gemini File API
        file_metadata = file_manager.upload_file(tmp_path, display_name=file.filename)
        
        # Wait for file to be ready
        if not file_manager.wait_for_file_active(file_metadata["uri"], timeout=120):
            raise HTTPException(status_code=500, detail="File processing timeout")
        
        # Clean up temp file
        os.unlink(tmp_path)
        
        return UploadResponse(
            file_uri=file_metadata["uri"],
            display_name=file_metadata["display_name"],
            mime_type=file_metadata["mime_type"],
            state="ACTIVE"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
async def chat(request: ChatRequest):
    """
    Send a message to Gemini 3 Pro with optional file attachments.
    Streams the response back as Server-Sent Events.
    """
    try:
        # Build generation config
        generation_config = {}
        
        # Configure thinking level (for Gemini 3)
        if request.thinking_level:
            generation_config["thinking_level"] = request.thinking_level.upper()
        
        # Get Gemini 3 Pro model
        model = gemini_client.get_model(
            "gemini-3-pro-preview",
            generation_config=generation_config
        )
        
        # Build prompt content
        content_parts = []
        
        # Add file references if provided
        for file_uri in request.file_uris:
            # Get file metadata to include proper reference
            file_metadata = file_manager.get_file_status(file_uri)
            content_parts.append({
                "file_data": {
                    "mime_type": file_metadata["mime_type"],
                    "file_uri": file_uri
                }
            })
        
        # Add text message
        content_parts.append(request.message)
        
        # Stream response
        async def generate():
            try:
                # Send initial debug info
                yield f"data: {json.dumps({'type': 'debug', 'data': {'request': {'message': request.message, 'files': len(request.file_uris), 'thinking_level': request.thinking_level}}})}\n\n"
                
                # Generate content
                response = model.generate_content(
                    content_parts,
                    stream=True
                )
                
                # Stream chunks
                for chunk in response:
                    if chunk.text:
                        yield f"data: {json.dumps({'type': 'text', 'content': chunk.text})}\n\n"
                
                # Send completion signal
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import json
