from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from stream_handler import stream_handler

router = APIRouter(tags=["Live Mode"])

@router.websocket("/ws/live")
async def live_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for Gemini 2.5 Flash Live API.
    Provides real-time bidirectional streaming for video/audio/text.
    """
    await websocket.accept()
    
    try:
        # Handle WebSocket connection with native audio model
        await stream_handler.handle_websocket(
            websocket,
            "gemini-live-2.5-flash-preview-native-audio-09-2025"
        )
    except WebSocketDisconnect:
        print("🔌 Client disconnected from Live Mode")
    except Exception as e:
        print(f"❌ Error in Live Mode: {e}")
        await websocket.close()
