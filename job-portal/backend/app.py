from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import motor.motor_asyncio
import os
import uvicorn

from routes import router as api_router

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/jobportal")

client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URI)
db = client.jobportal

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        await client.admin.command('ping')
        print("Successfully connected to MongoDB")
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}")
    
    yield
    # Shutdown (if needed)
    client.close()

app = FastAPI(title="Hired.io API", version="1.0.0", lifespan=lifespan)

@app.exception_handler(500)
async def internal_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error: " + str(exc)},
    )

app.state.db = db

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static for resumes
os.makedirs("uploads/resumes", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# API routes
app.include_router(api_router, prefix="/api")

@app.get("/health")
async def health():
    return {"status": "ok"}

# Mount frontend
# Assuming frontend is at ../frontend relative to backend/app.py
# We need to use absolute path or correct relative path.
# Since app.py is in backend/, frontend is in ../frontend
current_dir = os.path.dirname(os.path.abspath(__file__))
frontend_dir = os.path.join(current_dir, "..", "frontend")

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    print(f"Warning: Frontend directory not found at {frontend_dir}")

if __name__ == "__main__":
    print("Starting Job Portal...")
    print("Open http://localhost:8000 to view the app")
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
