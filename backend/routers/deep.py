import os
import tempfile
import json
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from gemini_client import gemini_client
from file_manager import file_manager
from google.genai import types

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
async def chat_endpoint(request: ChatRequest):
    """
    Send a message to Gemini 3 Pro with optional file attachments.
    Streams the response back as Server-Sent Events.
    """
    try:
        client = gemini_client.get_client()
        
        # Build message contents
        contents = []
        
        # Add files if present
        for file_uri in request.file_uris:
            # The new SDK handles file URIs as Part objects
            # We assume the URI is a string like "https://..." or a File API URI
            # For File API URIs, we use types.Part.from_uri
            contents.append(types.Part.from_uri(file_uri=file_uri, mime_type="application/pdf")) # Defaulting to PDF for now, logic needed for others

        # Add text message
        contents.append(types.Part.from_text(text=request.message))
        
        # Configure thinking
        # thinking_level "HIGH" maps to include_thoughts=True in ThinkingConfig
        # "LOW" is not explicitly configurable in the same way in the initial preview, 
        # but we can omit the config or set it differently if supported.
        # For now, we enable thoughts if HIGH.
        
        thinking_config = None
        if request.thinking_level and request.thinking_level.upper() == "HIGH":
            thinking_config = types.ThinkingConfig(include_thoughts=True)
            
        config = types.GenerateContentConfig(
            thinking_config=thinking_config,
            response_mime_type="text/plain"
        )
        
        # Streaming response
        async def event_generator():
            try:
                # Use the new SDK's streaming method (async)
                response = await client.aio.models.generate_content_stream(
                    model='gemini-3-pro-preview',
                    contents=contents,
                    config=config
                )
                
                async for chunk in response:
                    # Check for text content
                    if chunk.text:
                        yield f"data: {json.dumps({'type': 'text', 'content': chunk.text})}\n\n"
                        
                    # Send debug metadata (full chunk structure)
                    # We convert to dict/str for safe serialization
                    yield f"data: {json.dumps({'type': 'debug', 'data': str(chunk)})}\n\n"
                    
                # Send completion signal
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
