import os
import subprocess
import json
from typing import List
from pydantic import BaseModel
from openai import OpenAI
import google.generativeai as genai
from config import settings

class TranscriptionSegment(BaseModel):
    id: int
    start: float
    end: float
    text: str

class TranscriptionResponse(BaseModel):
    language: str
    full_text: str
    segments: List[TranscriptionSegment]


def _extract_audio(video_path: str) -> str:
    """Extract audio from video file to a lightweight mono mp3 file."""
    base, _ = os.path.splitext(video_path)
    audio_path = f"{base}_audio.mp3"
    
    # Run ffmpeg to extract audio
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "libmp3lame",
        "-ar", "16000", "-ac", "1", "-ab", "64k",
        audio_path
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        # Fallback to original path if ffmpeg fails
        return video_path
    return audio_path

def transcribe_video(
    video_path: str,
    gemini_api_key: str = None,
    openai_api_key: str = None,
    openai_base_url: str = None,
    openai_chat_model: str = None
) -> dict:
    """Transcribe video and return full transcript with word-level timestamps using cloud APIs."""
    audio_path = _extract_audio(video_path)
    
    eff_gemini_key = gemini_api_key if gemini_api_key else settings.GEMINI_API_KEY
    eff_openai_key = openai_api_key if openai_api_key else settings.OPENAI_API_KEY
    eff_openai_base = openai_base_url if openai_base_url else settings.OPENAI_BASE_URL
    eff_openai_model = openai_chat_model if openai_chat_model else settings.OPENAI_CHAT_MODEL
    
    try:
        is_custom_openai = eff_openai_base != "" and "api.openai.com" not in eff_openai_base
        gemini_configured = eff_gemini_key != "" and not eff_gemini_key.startswith("AIza...")
        
        # If using official OpenAI, use OpenAI. Otherwise, if Gemini is configured, prefer Gemini.
        if eff_openai_key and not is_custom_openai:
            return _transcribe_openai(audio_path, eff_openai_key, eff_openai_base, eff_openai_model)
        elif gemini_configured:
            return _transcribe_gemini(audio_path, eff_gemini_key)
        elif eff_openai_key:
            # Fallback to custom OpenAI if Gemini is not set up
            return _transcribe_openai(audio_path, eff_openai_key, eff_openai_base, eff_openai_model)
        else:
            raise ValueError("Neither a valid GEMINI_API_KEY nor an official OPENAI_API_KEY is configured for transcription.")
    finally:
        # Clean up the temp audio file if it was created
        if audio_path != video_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except Exception:
                pass

def _transcribe_openai(audio_path: str, api_key: str, base_url: str, chat_model: str) -> dict:
    client = OpenAI(
        api_key=api_key,
        base_url=base_url if base_url else None
    )
    
    # Determine the Whisper model name.
    # For custom OpenAI-compatible proxies (like dinoiki), the transcription model is often gpt-4o-mini-transcribe or similar.
    # If the custom model ends with -transcribe, use it. Otherwise map.
    whisper_model = settings.OPENAI_WHISPER_MODEL
    if chat_model and "gemini" in chat_model:
        whisper_model = chat_model + "-transcribe" if not chat_model.endswith("-transcribe") else chat_model
    
    with open(audio_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            file=audio_file,
            model=whisper_model,
            response_format="verbose_json",
            timestamp_granularities=["segment"]
        )
        
    segments = []
    if hasattr(response, "segments") and response.segments:
        for i, seg in enumerate(response.segments):
            # seg could be a dict or an object depending on version
            if isinstance(seg, dict):
                start = seg.get("start", 0.0)
                end = seg.get("end", 0.0)
                text = seg.get("text", "").strip()
            else:
                start = getattr(seg, "start", 0.0)
                end = getattr(seg, "end", 0.0)
                text = getattr(seg, "text", "").strip()
                
            segments.append({
                "id": i,
                "start": start,
                "end": end,
                "text": text,
            })
    else:
        # fallback if verbose_json didn't return segments or SDK structure differs
        raw_dict = response if isinstance(response, dict) else getattr(response, "__dict__", {})
        raw_segs = raw_dict.get("segments", [])
        for i, seg in enumerate(raw_segs):
            segments.append({
                "id": i,
                "start": seg.get("start", 0.0),
                "end": seg.get("end", 0.0),
                "text": seg.get("text", "").strip(),
            })
            
    return {
        "language": getattr(response, "language", "en") if not isinstance(response, dict) else response.get("language", "en"),
        "full_text": getattr(response, "text", "") if not isinstance(response, dict) else response.get("text", ""),
        "segments": segments,
    }

def _transcribe_gemini(audio_path: str, api_key: str) -> dict:
    genai.configure(api_key=api_key)
    
    # Read audio file directly as bytes
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()
        
    model = genai.GenerativeModel("gemini-2.5-flash")
    
    prompt = """
    Please transcribe this audio file. Format your response ONLY as a JSON object with this exact structure:
    {
      "language": "en",
      "full_text": "the entire transcription text...",
      "segments": [
        {
          "id": 0,
          "start": 0.0,
          "end": 3.5,
          "text": "first segment text"
        }
      ]
    }
    Make sure timestamps are accurate. Just return the raw JSON object.
    """
    
    import time
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = model.generate_content([
                {
                    "mime_type": "audio/mp3",
                    "data": audio_bytes
                },
                prompt
            ], generation_config={
                "response_mime_type": "application/json",
                "response_schema": TranscriptionResponse
            })
            break
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(3)
            else:
                raise e
        
    raw = response.text.strip()
    parsed = json.loads(raw)
    return parsed

def generate_srt(segments: list) -> str:
    """Convert segments to SRT subtitle format."""
    srt_lines = []
    for i, seg in enumerate(segments, 1):
        start = _seconds_to_srt_time(seg["start"])
        end = _seconds_to_srt_time(seg["end"])
        srt_lines.append(f"{i}\n{start} --> {end}\n{seg['text']}\n")
    return "\n".join(srt_lines)

def _seconds_to_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
