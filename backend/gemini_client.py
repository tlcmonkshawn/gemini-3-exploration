import os
from google import genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class GeminiClient:
    """
    A reusable wrapper for the Google GenAI SDK (v1.0+).
    Handles configuration and client instantiation.
    """
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        
        # Initialize the client with the new SDK structure
        self.client = genai.Client(api_key=self.api_key)

    def get_client(self):
        """
        Returns the initialized GenAI Client instance.
        """
        return self.client

# Singleton instance for easy import
try:
    gemini_client = GeminiClient()
except ValueError:
    gemini_client = None
