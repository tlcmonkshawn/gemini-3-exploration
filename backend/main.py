import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Import routers
from routers import deep, live

# Load environment variables
load_dotenv()

# Create FastAPI app
app = FastAPI(
    title="Gemini Explorer API",
    description="Explore and test Gemini 3 Pro and 2.5 Flash capabilities",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "*"  # Allow all for development (restrict in production)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(deep.router)
app.include_router(live.router)

# Health check endpoint
@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "Gemini Explorer API",
        "version": "1.0.0",
        "modes": {
            "deep": "/api/deep",
            "live": "/ws/live"
        }
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

# Run with: uvicorn main:app --host 0.0.0.0 --port 8001 --reload
