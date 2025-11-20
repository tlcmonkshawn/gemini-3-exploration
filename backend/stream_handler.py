import asyncio
import json
import os
from typing import Optional, Dict, Any
from fastapi import WebSocket
import websockets
from dotenv import load_dotenv

load_dotenv()

class StreamHandler:
    """
    Reusable WebSocket handler for Gemini Live API connections.
    Manages bidirectional streaming between client and Gemini.
    """
    
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        
        # Gemini Live API WebSocket URL
        self.live_api_url = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={self.api_key}"
    
    async def handle_websocket(
        self, 
        client_ws: WebSocket, 
        model_name: str = "gemini-live-2.5-flash-preview-native-audio-09-2025",
        config: Optional[Dict[str, Any]] = None
    ):
        """
        Handle WebSocket connection, proxying data between client and Gemini Live API.
        
        Args:
            client_ws: FastAPI WebSocket connection from client
            model_name: Gemini model to use
            config: Optional configuration for the model
        """
        gemini_ws = None
        
        try:
            # Connect to Gemini Live API
            print(f"🔌 Connecting to Gemini Live API with model: {model_name}")
            gemini_ws = await websockets.connect(
                self.live_api_url,
                extra_headers={"Content-Type": "application/json"}
            )
            
            # Send initial setup message to Gemini
            setup_message = {
                "setup": {
                    "model": f"models/{model_name}",
                }
            }
            
            if config:
                setup_message["setup"]["generation_config"] = config
            
            await gemini_ws.send(json.dumps(setup_message))
            print("✅ Connected to Gemini Live API")
            
            # Send debug info to client
            await self._send_debug(client_ws, "connection", {
                "status": "connected",
                "model": model_name
            })
            
            # Create bidirectional streaming tasks
            client_to_gemini = asyncio.create_task(
                self._forward_client_to_gemini(client_ws, gemini_ws)
            )
            gemini_to_client = asyncio.create_task(
                self._forward_gemini_to_client(gemini_ws, client_ws)
            )
            
            # Wait for either task to complete (or error)
            done, pending = await asyncio.wait(
                [client_to_gemini, gemini_to_client],
                return_when=asyncio.FIRST_COMPLETED
            )
            
            # Cancel remaining tasks
            for task in pending:
                task.cancel()
                
        except websockets.exceptions.WebSocketException as e:
            print(f"❌ WebSocket error: {e}")
            await self._send_debug(client_ws, "error", {"message": str(e)})
            
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            await self._send_debug(client_ws, "error", {"message": str(e)})
            
        finally:
            # Clean up connections
            if gemini_ws and not gemini_ws.closed:
                await gemini_ws.close()
                print("🔌 Closed Gemini Live API connection")
    
    async def _forward_client_to_gemini(self, client_ws: WebSocket, gemini_ws):
        """Forward messages from client to Gemini."""
        try:
            while True:
                # Receive from client
                data = await client_ws.receive_text()
                message = json.loads(data)
                
                # Log for debugging
                print(f"📤 Client → Gemini: {message.get('type', 'unknown')}")
                
                # Send debug info to client's inspector
                await self._send_debug(client_ws, "request", message)
                
                # Forward to Gemini
                await gemini_ws.send(json.dumps(message))
                
        except Exception as e:
            print(f"❌ Error forwarding client → Gemini: {e}")
            raise
    
    async def _forward_gemini_to_client(self, gemini_ws, client_ws: WebSocket):
        """Forward messages from Gemini to client."""
        try:
            while True:
                # Receive from Gemini
                response = await gemini_ws.recv()
                message = json.loads(response)
                
                # Log for debugging
                print(f"📥 Gemini → Client: {list(message.keys())}")
                
                # Send debug info to client's inspector
                await self._send_debug(client_ws, "response", message)
                
                # Forward to client (with type tag for processing)
                await client_ws.send_json({
                    "type": "gemini_response",
                    "data": message
                })
                
        except Exception as e:
            print(f"❌ Error forwarding Gemini → Client: {e}")
            raise
    
    async def _send_debug(self, client_ws: WebSocket, debug_type: str, data: Dict[str, Any]):
        """Send debug information to client's inspector panel."""
        try:
            await client_ws.send_json({
                "type": "debug",
                "debug_type": debug_type,
                "data": data
            })
        except Exception as e:
            print(f"⚠️  Failed to send debug info: {e}")

# Singleton instance
stream_handler = StreamHandler()
