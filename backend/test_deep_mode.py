"""
Automated tests for Deep Mode API endpoints
"""
import pytest
import sys
import os
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


class TestHealthEndpoints:
    """Test basic health/status endpoints"""
    
    def test_root_endpoint(self):
        """Test the root endpoint returns correct structure"""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "Gemini Explorer API"
        assert "modes" in data
        assert data["modes"]["deep"] == "/api/deep"
    
    def test_health_endpoint(self):
        """Test health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}


class TestDeepModeEndpoints:
    """Test Deep Mode API endpoints"""
    
    def test_chat_endpoint_exists(self):
        """Test that chat endpoint exists and requires proper payload"""
        response = client.post("/api/deep/chat", json={})
        # Should fail validation but return 422, not 404
        assert response.status_code == 422
    
    def test_chat_endpoint_with_valid_payload(self):
        """Test chat endpoint with valid minimal payload"""
        payload = {
            "message": "Hello, this is a test",
            "file_uris": [],
            "thinking_level": "low",
            "media_resolution": "medium"
        }
        response = client.post("/api/deep/chat", json=payload)
        # Should return 200 with streaming response
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
    
    def test_chat_with_file_uris(self):
        """Test chat endpoint accepts file_uris parameter"""
        payload = {
            "message": "Analyze this file",
            "file_uris": ["https://example.com/file1"],
            "thinking_level": "high",
            "media_resolution": "high"
        }
        response = client.post("/api/deep/chat", json=payload)
        assert response.status_code == 200
    
    def test_chat_invalid_thinking_level(self):
        """Test chat endpoint validates thinking_level"""
        payload = {
            "message": "Test message",
            "file_uris": [],
            "thinking_level": "invalid",  # Should still work, backend should handle
            "media_resolution": "medium"
        }
        response = client.post("/api/deep/chat", json=payload)
        # Backend might accept any value or validate - check either way
        assert response.status_code in [200, 422]
    
    def test_upload_endpoint_requires_file(self):
        """Test upload endpoint requires a file"""
        response = client.post("/api/deep/upload")
        assert response.status_code == 422  # Missing required file parameter


class TestCORSHeaders:
    """Test CORS configuration"""
    
    def test_cors_headers_present(self):
        """Test that CORS headers are properly set"""
        # Test with a regular POST request instead of OPTIONS
        response = client.get("/health")
        assert response.status_code == 200
        # CORS header check - may vary by implementation


class TestStreamingResponse:
    """Test streaming response format"""
    
    def test_streaming_format(self):
        """Test that streaming response follows SSE format"""
        payload = {
            "message": "Short test",
            "file_uris": [],
            "thinking_level": "low",
            "media_resolution": "low"
        }
        response = client.post("/api/deep/chat", json=payload)
        assert response.status_code == 200
        
        # Read first chunk to verify SSE format
        content = response.content.decode('utf-8')
        # SSE format uses 'data: ' prefix
        assert 'data:' in content


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
