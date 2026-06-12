import os
import subprocess
from config import settings


def detect_active_speaker_x(video_path: str, start_time: float, duration: float, iw: int, ih: int, crop_w: int) -> int:
    """Detect the active speaker's average X coordinate using Haar Cascade face detection."""
    try:
        import cv2
    except ImportError:
        print("OpenCV not found, falling back to center crop.")
        return (iw - crop_w) // 2

    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return (iw - crop_w) // 2

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            fps = 30.0

        start_frame = int(start_time * fps)
        # Sample 1 frame per second to keep processing fast
        step = max(1, int(fps * 1.0))

        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        detected_xs = []

        total_frames_to_read = int(duration * fps)
        frames_read = 0

        while frames_read < total_frames_to_read:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Convert to grayscale for face detection
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            # Detect faces (cap minSize at 8% of video height to avoid false positives in background)
            min_size = int(ih * 0.08)
            faces = face_cascade.detectMultiScale(
                gray, 
                scaleFactor=1.15, 
                minNeighbors=4, 
                minSize=(min_size, min_size)
            )

            if len(faces) > 0:
                # Select the largest face by area (most likely primary subject/singer/speaker)
                largest_face = max(faces, key=lambda f: f[2] * f[3])
                x, y, w, h = largest_face
                detected_xs.append(x + w / 2)

            # Skip forward
            frames_read += step
            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame + frames_read)

        cap.release()

        if detected_xs:
            # Get median X position to filter out camera movement spikes
            detected_xs.sort()
            median_x = detected_xs[len(detected_xs) // 2]
            
            # Center the crop box on the detected face
            crop_x = int(median_x - crop_w / 2)
            # Clamp crop box to video frame boundaries
            crop_x = max(0, min(iw - crop_w, crop_x))
            return (crop_x // 2) * 2

    except Exception as e:
        print(f"Error in active speaker face tracking: {e}. Falling back to center crop.")
        
    return (iw - crop_w) // 2


def cut_clip(
    input_path: str,
    output_path: str,
    start: float,
    duration: float,
    format: str = "reels",
    auto_tracking: bool = False,
    srt_path: str = None,
    subtitle_style: str = "none",
    quality: str = "720p",
) -> str:
    """Cut and encode a clip. Never upscales — always at or below source quality."""
    out_dir = os.path.dirname(output_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    # ── Quality height target ──────────────────────────────────────────────
    quality_h = {"360p": 360, "480p": 480, "720p": 720, "1080p": 1080}.get(quality, 720)

    # ── Bitrate cap per quality ────────────────────────────────────────────
    bitrate_map = {"360p": "1000k", "480p": "2000k", "720p": "4000k", "1080p": "8000k"}
    video_bitrate = bitrate_map.get(quality, "4000k")

    # ── Read actual source resolution ──────────────────────────────────────
    info = get_video_info(input_path)
    iw = info.get("width", 1920)
    ih = info.get("height", 1080)
    print(f"[cutter] source={iw}x{ih}  quality={quality}  format={format}")

    # ── Build filter chain ─────────────────────────────────────────────────
    filters = []
    out_h = ih

    if format == "reels":
        # Step 1: Crop a 9:16 vertical slice from the landscape source
        crop_w = (int(ih * 9 / 16) // 2) * 2   # width of 9:16 crop at source height
        if auto_tracking:
            crop_x = detect_active_speaker_x(input_path, start, duration, iw, ih, crop_w)
        else:
            crop_x = (iw - crop_w) // 2
        crop_x = max(0, min(iw - crop_w, (crop_x // 2) * 2))
        filters.append(f"crop={crop_w}:{ih}:{crop_x}:0")
        # After crop: frame is crop_w × ih  (e.g. 608×1080 from a 1080p source)

        # Step 2: Scale DOWN only if source portrait height exceeds target quality.
        # NEVER upscale — upscaling always looks worse, not better.
        if ih > quality_h:
            target_portrait_h = (quality_h // 2) * 2
            target_portrait_w = ((target_portrait_h * 9 // 16) // 2) * 2
            filters.append(f"scale={target_portrait_w}:{target_portrait_h}:flags=lanczos")
            print(f"[cutter] reels: downscale to {target_portrait_w}x{target_portrait_h}")
            out_h = target_portrait_h
        else:
            # Source height <= requested quality: keep as-is (608×1080 for 1080p reels)
            print(f"[cutter] reels: keep at {crop_w}x{ih} (no upscale)")
            out_h = ih

    else:  # landscape
        # Scale DOWN only if source is larger than the requested quality.
        # Keep original if source is smaller — upscaling adds no quality.
        target_w = {"360p": 640, "480p": 854, "720p": 1280, "1080p": 1920}.get(quality, 1280)
        target_h = quality_h

        if iw > target_w or ih > target_h:
            # Downscale: preserve exact aspect ratio, pad to even dimensions
            filters.append(
                f"scale='if(gt(iw,{target_w}),{target_w},iw)':"
                f"'if(gt(ih,{target_h}),{target_h},ih)':flags=lanczos"
            )
            filters.append(f"scale=trunc(iw/2)*2:trunc(ih/2)*2")  # ensure even dims
            print(f"[cutter] landscape: downscale toward {target_w}x{target_h}")
            out_h = min(ih, target_h)
        else:
            print(f"[cutter] landscape: keep at {iw}x{ih} (no upscale)")
            out_h = ih


    # ── Subtitle burn-in ───────────────────────────────────────────────────
    if srt_path and os.path.exists(srt_path) and subtitle_style != "none":
        escaped_srt = srt_path.replace("\\", "/").replace(":", "\\:")
        font_size = max(16, min(48, int(out_h * 0.028)))
        outline_thickness = max(1.0, float(font_size / 8.0))

        style = ""
        if subtitle_style == "capcut":
            style = f"FontName=Arial,FontSize={font_size},PrimaryColour=&H00FFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline={outline_thickness:.1f},Shadow=0,Alignment=2,MarginV=45"
        elif subtitle_style == "tiktok":
            style = f"FontName=Arial,FontSize={font_size},PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline={outline_thickness:.1f},Shadow=0,Alignment=2,MarginV=45"
        elif subtitle_style == "karaoke":
            style = f"FontName=Arial,FontSize={font_size},PrimaryColour=&HFFFF00&,OutlineColour=&H000000&,BorderStyle=1,Outline={outline_thickness:.1f},Shadow=0,Alignment=2,MarginV=45"
        elif subtitle_style == "minimal":
            style = f"FontName=Arial,FontSize={max(12,font_size-6)},PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=1.0,Shadow=0,Alignment=2,MarginV=35"

        if style:
            filters.append(f"subtitles='{escaped_srt}':force_style='{style}'")
        else:
            filters.append(f"subtitles='{escaped_srt}'")

    vf = ",".join(filters) if filters else None

    # ── Build base FFmpeg args (shared) ────────────────────────────────────
    base = [
        "ffmpeg", "-y",
        "-ss", str(start),
        "-i", input_path,
        "-t", str(duration),
    ]
    audio_args = ["-c:a", "aac", "-b:a", "192k"]
    output_args = ["-pix_fmt", "yuv420p", "-movflags", "+faststart", output_path]
    vf_args = ["-vf", vf] if vf else []

    # ── Primary: libx264 with quality-based CRF ────────────────────────────
    crf_map = {"360p": "23", "480p": "21", "720p": "19", "1080p": "17"}
    crf = crf_map.get(quality, "19")

    cmd_x264 = base + vf_args + [
        "-c:v", "libx264",
        "-preset", "veryfast",   # low CPU usage; quality still controlled by CRF
        "-crf", crf,
        "-maxrate", video_bitrate,
        "-bufsize", str(int(video_bitrate.replace("k", "")) * 2) + "k",
    ] + audio_args + output_args
    print(f"[cutter] cmd: {' '.join(cmd_x264)}")

    result = subprocess.run(cmd_x264, capture_output=True, text=True)
    if result.returncode == 0:
        return output_path

    # ── Fallback: try GPU encoders if libx264 somehow fails ────────────────
    def hw_cmd(encoder: str) -> list:
        cmd = base + vf_args + ["-c:v", encoder, "-b:v", video_bitrate]
        if encoder == "h264_nvenc":
            cmd += ["-preset", "p4", "-rc", "vbr", "-cq", "20"]
        elif encoder == "h264_amf":
            cmd += ["-rc", "vbr_latency", "-qp_i", "20", "-qp_p", "22"]
        elif encoder == "h264_qsv":
            cmd += ["-global_quality", "20", "-look_ahead", "1"]
        return cmd + audio_args + output_args

    for encoder in ["h264_nvenc", "h264_amf", "h264_qsv"]:
        result = subprocess.run(hw_cmd(encoder), capture_output=True, text=True)
        if result.returncode == 0:
            return output_path

    raise RuntimeError(
        f"All encoders failed for {output_path}.\n"
        f"libx264 error: {result.stderr[-800:]}"
    )



def get_video_info(video_path: str) -> dict:
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        video_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    import json
    data = json.loads(result.stdout)
    video_stream = next(
        (s for s in data.get("streams", []) if s["codec_type"] == "video"), {}
    )
    return {
        "width": video_stream.get("width", 0),
        "height": video_stream.get("height", 0),
        "duration": float(video_stream.get("duration", 0)),
    }
