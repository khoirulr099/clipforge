import os
import sys
import subprocess
import base64
from pathlib import Path
import yt_dlp
from config import settings


def ensure_temp_dir(path: str):
    os.makedirs(path, exist_ok=True)


def load_cookies() -> str | None:
    """Load cookies.txt from file or env var (base64 encoded)."""
    # Locate cookies.txt in the backend root directory (parent of services directory)
    cookies_path = Path(__file__).parent.parent / "cookies.txt"
    print(f"[downloader] Checking cookies path: {cookies_path.resolve()} (exists: {cookies_path.exists()})")
    if cookies_path.exists():
        return str(cookies_path)
    
    # Fallback to current working directory
    cwd_cookies = Path("cookies.txt")
    print(f"[downloader] Checking fallback cookies path: {cwd_cookies.resolve()} (exists: {cwd_cookies.exists()})")
    if cwd_cookies.exists():
        return str(cwd_cookies)

    env_b64 = os.environ.get("YOUTUBE_COOKIES_BASE64", "")
    if env_b64:
        try:
            decoded = base64.b64decode(env_b64).decode("utf-8", errors="ignore")
            cookies_path.write_text(decoded, encoding="utf-8")
            print(f"[downloader] Created cookies file from env: {cookies_path.resolve()}")
            return str(cookies_path)
        except Exception as e:
            print(f"[downloader] Failed to write env cookies: {e}")
            pass
    return None


def build_format_selector(quality: str) -> str:
    """
    Build yt-dlp format string for the given quality (e.g. '720p').

    IMPORTANT: Do NOT restrict to ext=mp4 — YouTube 1080p+ is almost exclusively
    webm/VP9 or AV1. Restricting to mp4 causes yt-dlp to silently fall back to
    a much lower quality mp4 stream (e.g. 360p). We use --merge-output-format mp4
    in the download command, so yt-dlp will remux to mp4 automatically.
    """
    h = quality.replace("p", "")
    return (
        # Prefer exact height; accept any codec/container
        f"bestvideo[height={h}]+bestaudio"
        f"/bestvideo[height<={h}][height>={int(h)//2}]+bestaudio"
        f"/bestvideo+bestaudio"
        f"/best"
    )


def download_video(url: str, job_id: str, quality: str = "720p", progress_callback=None) -> dict:
    """Download video from URL using yt-dlp. Returns info dict with local path."""
    import re
    output_dir = os.path.join(settings.TEMP_DIR, job_id)
    ensure_temp_dir(output_dir)

    downloaded_path = os.path.join(output_dir, "original.%(ext)s")
    format_selector = build_format_selector(quality)
    cookies_file = load_cookies()

    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-f", format_selector,
        "-o", downloaded_path,
        "--merge-output-format", "mkv",
        "--no-check-certificate",
        "-N", "8",
    ]
    if cookies_file:
        cmd.extend(["--cookies", cookies_file])
    cmd.append(url)

    # Use Popen to capture stdout in real-time
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="ignore"
    )

    # Regex to match: [download]  12.3% of ~50.00MiB at  1.20MiB/s ETA 00:30
    download_re = re.compile(r"\[download\]\s+(\d+\.\d+)%\s+of\s+\S+\s+at\s+(\S+)\s+ETA\s+(\S+)")

    for line in iter(process.stdout.readline, ""):
        match = download_re.search(line)
        if match and progress_callback:
            try:
                percent = float(match.group(1))
                speed = match.group(2)
                eta = match.group(3)
                # Map 0-100% to 10-30% in the pipeline progress
                pipeline_progress = 10 + int(percent * 0.2)
                progress_callback(pipeline_progress, speed, eta)
            except Exception:
                pass

    process.stdout.close()
    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError("yt-dlp download failed.")

    # Find the downloaded file
    candidates = list(Path(output_dir).glob("original*"))
    if not candidates:
        candidates = list(Path(output_dir).glob("*.mp4"))
    if not candidates:
        raise RuntimeError("Downloaded file not found after yt-dlp completed.")

    actual_path = str(candidates[0])

    if not _is_valid_video(actual_path):
        raise RuntimeError("Downloaded file is corrupt or invalid.")

    # Get info via yt-dlp extract (no re-download)
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        **({"cookiefile": cookies_file} if cookies_file else {}),
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    w, h = get_video_resolution(actual_path)

    return {
        "job_id": job_id,
        "title": info.get("title", ""),
        "duration": info.get("duration", 0),
        "local_path": actual_path,
        "thumbnail": info.get("thumbnail", ""),
        "description": info.get("description", ""),
        "resolution": f"{w}x{h}",
        "actual_quality": f"{h}p",
        "requested_quality": quality,
    }


def get_video_metadata(url: str) -> dict:
    """Fetch metadata only, no download."""
    cookies_file = load_cookies()
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        **({"cookiefile": cookies_file} if cookies_file else {}),
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return {
        "title": info.get("title", ""),
        "duration": info.get("duration", 0),
        "thumbnail": info.get("thumbnail", ""),
        "uploader": info.get("uploader", ""),
        "view_count": info.get("view_count", 0),
        "available_qualities": _extract_qualities(info),
    }


def get_video_resolution(path: str) -> tuple[int, int]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
        capture_output=True, text=True,
    )
    try:
        w, h = result.stdout.strip().split(",")
        return int(w), int(h)
    except Exception:
        return 0, 0


def _is_valid_video(path: str) -> bool:
    if not os.path.exists(path) or os.path.getsize(path) < 1024:
        return False
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1", path],
        capture_output=True, text=True,
    )
    return result.returncode == 0 and "duration" in result.stdout


def _extract_qualities(info: dict) -> list[str]:
    formats = info.get("formats", [])
    heights = sorted(set(
        f.get("height") for f in formats
        if f.get("height") and f.get("vcodec") != "none"
    ))
    return [f"{h}p" for h in heights if h]
