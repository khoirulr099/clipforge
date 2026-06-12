from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import video, clips, transcripts

app = FastAPI(title="ClipForge API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video.router, prefix="/api/video", tags=["Video"])
app.include_router(clips.router, prefix="/api/clips", tags=["Clips"])
app.include_router(transcripts.router, prefix="/api/transcripts", tags=["Transcripts"])

from fastapi.staticfiles import StaticFiles
import os
import shutil

# Automatically clean up old local static clips and subtitles from previous runs on startup to save disk space
if os.path.exists("static/clips"):
    shutil.rmtree("static/clips", ignore_errors=True)
if os.path.exists("static/subtitles"):
    shutil.rmtree("static/subtitles", ignore_errors=True)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def health_check():
    return {"status": "ok", "service": "ClipForge API"}
