import os
import uuid
import shutil
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Literal, List, Optional
from services.downloader import download_video, get_video_metadata
from services.transcriber import transcribe_video, generate_srt
from services.analyzer import find_highlights
from services.cutter import cut_clip
from services.storage import upload_clip, upload_srt, delete_single_clip, delete_job_files
from config import settings

router = APIRouter()

# In-memory job store (replace with Redis/DB for production)
jobs: dict = {}


class ManualClip(BaseModel):
    start: float
    end: float


class ProcessRequest(BaseModel):
    url: str
    mode: Literal["auto", "ai", "manual"] = "ai"
    provider: Literal["gemini", "openai"] = "gemini"
    quality: Literal["360p", "480p", "720p", "1080p"] = "720p"
    target_duration: int = 60          # seconds per clip
    max_clips: int = 3
    format: Literal["reels", "landscape", "square"] = "reels"
    auto_tracking: bool = False
    output_prefix: str = "clip"
    use_variation: bool = False
    manual_clips: Optional[List[ManualClip]] = None
    gemini_api_key: Optional[str] = ""
    openai_api_key: Optional[str] = ""
    openai_base_url: Optional[str] = ""
    openai_chat_model: Optional[str] = ""
    subtitle_style: Optional[str] = "none"
    audio_fade: Optional[bool] = False
    watermark_text: Optional[str] = ""
    subtitle_position: Optional[str] = "bottom"
    split_screen: Optional[bool] = False
    clip_summary: Optional[bool] = False
    transcription_provider: Optional[str] = "gemini"
    custom_transcribe_key: Optional[str] = ""
    custom_transcribe_base: Optional[str] = ""
    custom_transcribe_model: Optional[str] = ""


class DeleteClipRequest(BaseModel):
    job_id: str
    clip_index: int
    clip_url: str
    srt_url: Optional[str] = ""


class DeleteJobRequest(BaseModel):
    job_id: str


class MetadataRequest(BaseModel):
    url: str


@router.post("/metadata")
async def fetch_metadata(req: MetadataRequest):
    try:
        meta = get_video_metadata(req.url)
        return meta
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/process")
async def process_video(req: ProcessRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "queued", "progress": 0, "clips": [], "format": req.format}
    background_tasks.add_task(run_pipeline, job_id, req)
    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]


@router.post("/cleanup")
def cleanup_local_files():
    shutil.rmtree(os.path.join("static", "clips"), ignore_errors=True)
    shutil.rmtree(os.path.join("static", "subtitles"), ignore_errors=True)
    os.makedirs(os.path.join("static", "clips"), exist_ok=True)
    os.makedirs(os.path.join("static", "subtitles"), exist_ok=True)
    return {"status": "ok", "message": "Local files cleaned up"}


@router.post("/delete-clip")
def delete_clip_endpoint(req: DeleteClipRequest):
    delete_single_clip(req.job_id, req.clip_index, req.clip_url, req.srt_url)
    return {"status": "ok"}


@router.post("/delete-job")
def delete_job_endpoint(req: DeleteJobRequest):
    delete_job_files(req.job_id)
    return {"status": "ok"}


def run_pipeline(job_id: str, req: ProcessRequest):
    try:
        # ── Step 1: Download ──
        jobs[job_id].update({
            "status": "downloading",
            "progress": 10,
            "download_speed": "0KB/s",
            "download_eta": "00:00"
        })
        
        def update_download_progress(progress_val, speed, eta):
            jobs[job_id].update({
                "progress": progress_val,
                "download_speed": speed,
                "download_eta": eta
            })
            
        video_info = download_video(req.url, job_id, req.quality, progress_callback=update_download_progress)

        # Warn if resolution mismatch
        if video_info["actual_quality"] != req.quality:
            jobs[job_id]["quality_note"] = (
                f"YouTube doesn't have {req.quality} for this video, "
                f"downloaded at {video_info['actual_quality']} instead."
            )

        clips_dir = os.path.join(settings.TEMP_DIR, job_id, "clips")
        os.makedirs(clips_dir, exist_ok=True)

        # ── Determine clip moments by mode ──
        moments = []

        # Check cache first for transcript (helps save API credits across runs)
        from routers.transcripts import get_youtube_id
        import json
        video_id = get_youtube_id(req.url)
        cache_path = os.path.join("static", "transcripts", f"{video_id}.json") if video_id else None
        
        transcript = None
        if cache_path and os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    transcript = json.load(f)
            except Exception:
                pass

        if req.mode == "manual":
            # Manual: use timestamps provided by user
            jobs[job_id].update({"status": "cutting", "progress": 50})
            if not req.manual_clips:
                raise ValueError("manual_clips is required for manual mode")
            for mc in req.manual_clips:
                moments.append({
                    "start": mc.start,
                    "end": mc.end,
                    "title": f"Manual clip",
                    "hook": "",
                    "reason": "Manually selected",
                    "score": 0,
                })
            
            # If subtitles are requested but we don't have transcript, fetch it now
            if req.subtitle_style != "none" and not transcript:
                jobs[job_id].update({"status": "transcribing", "progress": 40})
                transcript = transcribe_video(
                    video_info["local_path"],
                    gemini_api_key=req.gemini_api_key,
                    openai_api_key=req.openai_api_key,
                    openai_base_url=req.openai_base_url,
                    openai_chat_model=req.openai_chat_model,
                    transcription_provider=req.transcription_provider,
                    custom_transcribe_key=req.custom_transcribe_key,
                    custom_transcribe_base=req.custom_transcribe_base,
                    custom_transcribe_model=req.custom_transcribe_model,
                )
                if video_id:
                    os.makedirs(os.path.join("static", "transcripts"), exist_ok=True)
                    with open(cache_path, "w", encoding="utf-8") as f:
                        json.dump(transcript, f, ensure_ascii=False, indent=2)

        elif req.mode == "auto":
            # Auto: smart randomly-distributed clips across beginning, middle, and end to guarantee different moments on refresh/regeneration
            jobs[job_id].update({"status": "cutting", "progress": 40})
            total = video_info["duration"]
            import random
            
            if total > 0 and req.max_clips > 0:
                zone_duration = total / req.max_clips
                for i in range(req.max_clips):
                    zone_start = i * zone_duration
                    zone_end = (i + 1) * zone_duration
                    
                    # Clip duration we want to fit
                    clip_len = min(req.target_duration, zone_duration)
                    
                    # Pick a random start time within the zone that allows the clip to fit
                    max_possible_start = max(zone_start, zone_end - clip_len)
                    start = random.uniform(zone_start, max_possible_start)
                    
                    moments.append({
                        "start": start,
                        "end": min(start + clip_len, total),
                        "title": f"Auto clip {i + 1}",
                        "hook": "",
                        "reason": f"Smart auto-distributed (Zone {i + 1})",
                        "score": 0,
                    })

            # If subtitles are requested but we don't have transcript, fetch it now
            if req.subtitle_style != "none" and not transcript:
                jobs[job_id].update({"status": "transcribing", "progress": 40})
                transcript = transcribe_video(
                    video_info["local_path"],
                    gemini_api_key=req.gemini_api_key,
                    openai_api_key=req.openai_api_key,
                    openai_base_url=req.openai_base_url,
                    openai_chat_model=req.openai_chat_model,
                    transcription_provider=req.transcription_provider,
                    custom_transcribe_key=req.custom_transcribe_key,
                    custom_transcribe_base=req.custom_transcribe_base,
                    custom_transcribe_model=req.custom_transcribe_model,
                )
                if video_id:
                    os.makedirs(os.path.join("static", "transcripts"), exist_ok=True)
                    with open(cache_path, "w", encoding="utf-8") as f:
                        json.dump(transcript, f, ensure_ascii=False, indent=2)

        else:
            # AI mode: transcribe → analyze
            if not transcript:
                jobs[job_id].update({"status": "transcribing", "progress": 30})
                transcript = transcribe_video(
                    video_info["local_path"],
                    gemini_api_key=req.gemini_api_key,
                    openai_api_key=req.openai_api_key,
                    openai_base_url=req.openai_base_url,
                    openai_chat_model=req.openai_chat_model,
                    transcription_provider=req.transcription_provider,
                    custom_transcribe_key=req.custom_transcribe_key,
                    custom_transcribe_base=req.custom_transcribe_base,
                    custom_transcribe_model=req.custom_transcribe_model,
                )
                if video_id:
                    os.makedirs(os.path.join("static", "transcripts"), exist_ok=True)
                    with open(cache_path, "w", encoding="utf-8") as f:
                        json.dump(transcript, f, ensure_ascii=False, indent=2)

            jobs[job_id].update({"status": "analyzing", "progress": 55})
            raw_moments = find_highlights(
                transcript,
                req.provider,
                req.max_clips,
                variation=req.use_variation,
                gemini_api_key=req.gemini_api_key,
                openai_api_key=req.openai_api_key,
                openai_base_url=req.openai_base_url,
                openai_chat_model=req.openai_chat_model,
                include_summary=req.clip_summary,
            )
            # Normalize to duration-based end time
            for m in raw_moments:
                moments.append({
                    **m,
                    "end": m["start"] + req.target_duration,
                })
            jobs[job_id]["transcript"] = transcript["full_text"][:500] + "..."

        # ── Step 3: Cut + SRT + Upload ──
        jobs[job_id].update({"status": "cutting", "progress": 65})
        results = []

        # Get transcript segments if available (for SRT & burn-in)
        transcript_segments = transcript.get("segments", []) if transcript else []

        for i, moment in enumerate(moments):
            clip_name = f"{req.output_prefix}_{i + 1}.mp4"
            clip_path = os.path.join(clips_dir, clip_name)
            duration = moment["end"] - moment["start"]

            # Generate segment-specific SRT for burn-in and download link
            srt_url = ""
            temp_srt_path = None
            if transcript_segments:
                clip_segs = [
                    s for s in transcript_segments
                    if s["start"] >= moment["start"] and s["end"] <= moment["end"] + 1
                ]
                rel_segs = [
                    {**s, "start": s["start"] - moment["start"], "end": s["end"] - moment["start"]}
                    for s in clip_segs
                ]
                if rel_segs:
                    srt_content = generate_srt(rel_segs)
                    
                    # Save a temp SRT file for FFmpeg subtitle filter
                    temp_srt_dir = os.path.join("static", "subtitles")
                    os.makedirs(temp_srt_dir, exist_ok=True)
                    temp_srt_path = os.path.join(temp_srt_dir, f"temp_{job_id}_{i}.srt")
                    with open(temp_srt_path, "w", encoding="utf-8") as sf:
                        sf.write(srt_content)
                        
                    # Also upload it for download link in history cards
                    srt_url = upload_srt(srt_content, job_id, i)

            # Cut clip with optional subtitle burn-in
            cut_clip(
                video_info["local_path"],
                clip_path,
                moment["start"],
                duration,
                req.format,
                req.auto_tracking,
                srt_path=temp_srt_path,
                subtitle_style=req.subtitle_style,
                quality=req.quality,
                audio_fade=req.audio_fade,
                watermark_text=req.watermark_text,
                subtitle_position=req.subtitle_position,
                split_screen=req.split_screen,
            )

            # Clean up temp SRT file used for burning
            if temp_srt_path and os.path.exists(temp_srt_path):
                try:
                    os.remove(temp_srt_path)
                except Exception:
                    pass

            clip_url = upload_clip(clip_path, job_id, i)

            results.append({
                "index": i,
                "title": moment.get("title", f"Clip {i + 1}"),
                "hook": moment.get("hook", ""),
                "reason": moment.get("reason", ""),
                "score": moment.get("score", 0),
                "start": moment["start"],
                "end": moment["end"],
                "duration": round(duration, 1),
                "clip_url": clip_url,
                "srt_url": srt_url,
            })

            jobs[job_id]["progress"] = 65 + int((i + 1) / len(moments) * 30)

        # Cleanup temp
        shutil.rmtree(os.path.join(settings.TEMP_DIR, job_id), ignore_errors=True)

        jobs[job_id].update({
            "status": "done",
            "progress": 100,
            "clips": results,
            "video_title": video_info["title"],
            "video_duration": video_info["duration"],
            "resolution": video_info["resolution"],
            "format": req.format,
        })

    except Exception as e:
        jobs[job_id].update({"status": "error", "error": str(e), "progress": 0})
