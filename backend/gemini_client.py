import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class GeminiClient:
    """
    A reusable wrapper for the Google Generative AI SDK.
    Handles configuration and model instantiation.
    """
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        
        genai.configure(api_key=self.api_key)

    def get_model(self, model_name: str, generation_config: dict = None, system_instruction: str = None):
        """
        Returns a configured GenerativeModel instance.
        """
        return genai.GenerativeModel(
            model_name=model_name,
            generation_config=generation_config,
            system_instruction=system_instruction
        )

    def list_models(self):
        """
        Lists available models.
        """
        return genai.list_models()

# Singleton instance for easy import
try:
    gemini_client = GeminiClient()
except ValueError:
    gemini_client = None
