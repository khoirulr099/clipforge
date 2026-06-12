import os
import json
import uuid
import shutil
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
from services.downloader import download_video
from services.transcriber import transcribe_video
from services.social import generate_social_post
from config import settings

router = APIRouter()

class TranscriptRequest(BaseModel):
    url: str
    gemini_api_key: Optional[str] = ""
    openai_api_key: Optional[str] = ""
    openai_base_url: Optional[str] = ""
    openai_chat_model: Optional[str] = ""

class SaveTranscriptRequest(BaseModel):
    url: str
    transcript: dict

class GenerateSocialRequest(BaseModel):
    clip_transcript: str
    provider: Literal["gemini", "openai"] = "gemini"
    gemini_api_key: Optional[str] = ""
    openai_api_key: Optional[str] = ""
    openai_base_url: Optional[str] = ""
    openai_chat_model: Optional[str] = ""


def get_youtube_id(url: str) -> str | None:
    try:
        reg_exp = r"^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*"
        match = re.match(reg_exp, url)
        return match.group(2) if (match and len(match.group(2)) == 11) else None
    except Exception:
        return None


@router.post("/check")
async def check_transcript(req: TranscriptRequest):
    video_id = get_youtube_id(req.url)
    if not video_id:
        return {"cached": False}
    cache_path = os.path.join("static", "transcripts", f"{video_id}.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {"cached": True, "transcript": data}
        except Exception:
            pass
    return {"cached": False}


@router.post("/fetch")
async def fetch_transcript(req: TranscriptRequest):
    video_id = get_youtube_id(req.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        
    os.makedirs(os.path.join("static", "transcripts"), exist_ok=True)
    cache_path = os.path.join("static", "transcripts", f"{video_id}.json")
    
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
            
    # Download at lowest quality (360p) for speed and audio extraction
    temp_job_id = f"transcribe_{uuid.uuid4()}"
    try:
        video_info = download_video(req.url, temp_job_id, quality="360p")
        local_path = video_info["local_path"]
        
        transcript = transcribe_video(
            local_path,
            gemini_api_key=req.gemini_api_key,
            openai_api_key=req.openai_api_key,
            openai_base_url=req.openai_base_url,
            openai_chat_model=req.openai_chat_model,
        )
        
        # Save to cache
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(transcript, f, ensure_ascii=False, indent=2)
            
        return transcript
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(os.path.join(settings.TEMP_DIR, temp_job_id), ignore_errors=True)


@router.post("/save")
async def save_transcript(req: SaveTranscriptRequest):
    video_id = get_youtube_id(req.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        
    os.makedirs(os.path.join("static", "transcripts"), exist_ok=True)
    cache_path = os.path.join("static", "transcripts", f"{video_id}.json")
    
    try:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(req.transcript, f, ensure_ascii=False, indent=2)
        return {"status": "ok", "message": "Transcript saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-social")
async def generate_social(req: GenerateSocialRequest):
    try:
        post = generate_social_post(
            clip_transcript=req.clip_transcript,
            provider=req.provider,
            gemini_api_key=req.gemini_api_key,
            openai_api_key=req.openai_api_key,
            openai_base_url=req.openai_base_url,
            openai_chat_model=req.openai_chat_model
        )
        return post
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
