import os
import shutil
import time
from supabase import create_client
from config import settings

# Initialize Supabase client safely
supabase = None
if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
    try:
        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    except Exception as e:
        print(f"Warning: Failed to initialize Supabase client: {e}")


def upload_clip(local_path: str, job_id: str, clip_index: int) -> str:
    """Upload video clip to Supabase Storage. Falls back to local static directory if it fails."""
    filename = os.path.basename(local_path)
    safe_filename = f"{clip_index:02d}_{filename}"
    
    # Check if Supabase is configured
    if supabase is not None:
        storage_path = f"{job_id}/clips/{safe_filename}"
        max_retries = 2
        for attempt in range(max_retries):
            try:
                with open(local_path, "rb") as f:
                    supabase.storage.from_(settings.SUPABASE_BUCKET).upload(
                        storage_path,
                        f,
                        {"content-type": "video/mp4", "upsert": "true"},
                    )
                # Success! Return Supabase public URL
                url = supabase.storage.from_(settings.SUPABASE_BUCKET).get_public_url(storage_path)
                return url
            except Exception as e:
                print(f"Supabase upload attempt {attempt + 1} failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2)
                
    # Fallback: Save locally and serve via static files
    print("Falling back to local storage for clip...")
    local_static_dir = os.path.join("static", "clips", job_id)
    os.makedirs(local_static_dir, exist_ok=True)
    dest_path = os.path.join(local_static_dir, safe_filename)
    shutil.copy2(local_path, dest_path)
    
    # Return local URL served by FastAPI
    return f"{settings.BACKEND_BASE_URL}/static/clips/{job_id}/{safe_filename}"


def upload_srt(srt_content: str, job_id: str, clip_index: int) -> str:
    """Upload SRT file to Supabase Storage. Falls back to local static directory if it fails."""
    safe_filename = f"{clip_index:02d}.srt"
    
    # Check if Supabase is configured
    if supabase is not None:
        storage_path = f"{job_id}/subtitles/{safe_filename}"
        max_retries = 2
        for attempt in range(max_retries):
            try:
                supabase.storage.from_(settings.SUPABASE_BUCKET).upload(
                    storage_path,
                    srt_content.encode("utf-8"),
                    {"content-type": "text/plain", "upsert": "true"},
                )
                # Success! Return Supabase public URL
                url = supabase.storage.from_(settings.SUPABASE_BUCKET).get_public_url(storage_path)
                return url
            except Exception as e:
                print(f"Supabase SRT upload attempt {attempt + 1} failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2)

    # Fallback: Save locally and serve via static files
    print("Falling back to local storage for SRT...")
    local_static_dir = os.path.join("static", "subtitles", job_id)
    os.makedirs(local_static_dir, exist_ok=True)
    dest_path = os.path.join(local_static_dir, safe_filename)
    with open(dest_path, "w", encoding="utf-8") as f:
        f.write(srt_content)
        
    return f"{settings.BACKEND_BASE_URL}/static/subtitles/{job_id}/{safe_filename}"


def delete_job_files(job_id: str):
    """Clean up all files for a job from storage and local static folder."""
    # 1. Clean from Supabase if configured
    if supabase is not None:
        try:
            files = supabase.storage.from_(settings.SUPABASE_BUCKET).list(job_id)
            paths = [f"{job_id}/{f['name']}" for f in files]
            if paths:
                supabase.storage.from_(settings.SUPABASE_BUCKET).remove(paths)
        except Exception as e:
            print(f"Warning: Failed to delete job files from Supabase: {e}")
            
    # 2. Clean from local static folder
    local_clips_dir = os.path.join("static", "clips", job_id)
    local_subs_dir = os.path.join("static", "subtitles", job_id)
    shutil.rmtree(local_clips_dir, ignore_errors=True)
    shutil.rmtree(local_subs_dir, ignore_errors=True)


def delete_single_clip(job_id: str, clip_index: int, clip_url: str, srt_url: str = ""):
    """Delete a single clip and its subtitle file from storage/local disk."""
    # 1. Delete from Supabase if configured
    if supabase is not None:
        try:
            files = supabase.storage.from_(settings.SUPABASE_BUCKET).list(f"{job_id}/clips")
            paths_to_remove = []
            if isinstance(files, list):
                for f in files:
                    if isinstance(f, dict) and f.get('name', '').startswith(f"{clip_index:02d}_"):
                        paths_to_remove.append(f"{job_id}/clips/{f['name']}")
            
            sub_files = supabase.storage.from_(settings.SUPABASE_BUCKET).list(f"{job_id}/subtitles")
            if isinstance(sub_files, list):
                for f in sub_files:
                    if isinstance(f, dict) and f.get('name', '').startswith(f"{clip_index:02d}."):
                        paths_to_remove.append(f"{job_id}/subtitles/{f['name']}")
                    
            if paths_to_remove:
                supabase.storage.from_(settings.SUPABASE_BUCKET).remove(paths_to_remove)
        except Exception as e:
            print(f"Warning: Failed to delete single clip from Supabase: {e}")
            
    # 2. Delete from local static folder
    local_clips_dir = os.path.join("static", "clips", job_id)
    if os.path.exists(local_clips_dir):
        for fname in os.listdir(local_clips_dir):
            if fname.startswith(f"{clip_index:02d}_"):
                try:
                    os.remove(os.path.join(local_clips_dir, fname))
                except Exception:
                    pass
                
    local_subs_dir = os.path.join("static", "subtitles", job_id)
    if os.path.exists(local_subs_dir):
        for fname in os.listdir(local_subs_dir):
            if fname.startswith(f"{clip_index:02d}."):
                try:
                    os.remove(os.path.join(local_subs_dir, fname))
                except Exception:
                    pass
