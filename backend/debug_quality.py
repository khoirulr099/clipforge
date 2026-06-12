"""
Debug script: test quality pipeline without running the full web server.
Usage: python debug_quality.py <youtube_url> [quality]
Example: python debug_quality.py https://youtube.com/watch?v=xxx 1080p
"""
import sys, os, subprocess, json
sys.path.insert(0, os.path.dirname(__file__))

url = sys.argv[1] if len(sys.argv) > 1 else input("YouTube URL: ")
quality = sys.argv[2] if len(sys.argv) > 2 else "1080p"

print(f"\n=== STEP 1: Check available formats ===")
result = subprocess.run(
    [sys.executable, "-m", "yt_dlp", "--list-formats", url],
    capture_output=True, text=True
)
lines = [l for l in result.stdout.splitlines() if "video only" in l or "ID" in l]
for l in lines[:20]:
    print(l)

print(f"\n=== STEP 2: Download with quality={quality} ===")
from services.downloader import build_format_selector, ensure_temp_dir
fmt = build_format_selector(quality)
print(f"Format selector: {fmt}")

import uuid
job_id = "debug_" + str(uuid.uuid4())[:8]
out_dir = os.path.join("tmp", job_id)
ensure_temp_dir(out_dir)
out_path = os.path.join(out_dir, "original.mp4")

dl_cmd = [
    sys.executable, "-m", "yt_dlp",
    "-f", fmt,
    "-o", out_path,
    "--merge-output-format", "mp4",
    "--no-check-certificate",
    "-N", "4",
    url
]
print(f"Running: {' '.join(dl_cmd)}")
r = subprocess.run(dl_cmd, capture_output=True, text=True)
if r.returncode != 0:
    print(f"DOWNLOAD FAILED:\n{r.stderr[-500:]}")
    sys.exit(1)

import glob as globmod
candidates = globmod.glob(os.path.join(out_dir, "original*"))
actual = candidates[0] if candidates else out_path
print(f"Downloaded to: {actual}")

probe = subprocess.run(
    ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", actual],
    capture_output=True, text=True
)
data = json.loads(probe.stdout)
vs = next((s for s in data.get("streams", []) if s["codec_type"] == "video"), {})
print(f"\n=== STEP 3: Downloaded file info ===")
print(f"  Resolution : {vs.get('width')}x{vs.get('height')}")
print(f"  Codec      : {vs.get('codec_name')}")
print(f"  Bitrate    : {vs.get('bit_rate', 'N/A')} bps")
print(f"  File size  : {os.path.getsize(actual) // 1024} KB")

print(f"\n=== STEP 4: Cut 10s test clip ===")
from services.cutter import cut_clip
clip_path = os.path.join(out_dir, "test_clip.mp4")
cut_clip(actual, clip_path, 10, 10, format="reels", quality=quality)

probe2 = subprocess.run(
    ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", clip_path],
    capture_output=True, text=True
)
data2 = json.loads(probe2.stdout)
vs2 = next((s for s in data2.get("streams", []) if s["codec_type"] == "video"), {})
print(f"\n=== RESULT: Output clip ===")
print(f"  Resolution : {vs2.get('width')}x{vs2.get('height')}")
print(f"  Codec      : {vs2.get('codec_name')}")
print(f"  Bitrate    : {vs2.get('bit_rate', 'N/A')} bps")
print(f"  File size  : {os.path.getsize(clip_path) // 1024} KB")
print(f"  Saved to   : {os.path.abspath(clip_path)}")
print(f"\nOpen the clip above to check quality visually.")
