import os
import sys
from pathlib import Path
import yt_dlp

def main():
    print("=== ClipForge Cookies Diagnostic Script ===")
    
    # Check cookies file
    backend_dir = Path(__file__).parent
    cookies_path = backend_dir / "cookies.txt"
    
    print(f"Checking cookies.txt location: {cookies_path.resolve()}")
    if not cookies_path.exists():
        print("[-] ERROR: cookies.txt does NOT exist in this directory!")
        return
        
    print("[+] File exists!")
    
    # Read and inspect file header
    try:
        with open(cookies_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = [f.readline().strip() for _ in range(10)]
        
        print("\nFirst few lines of cookies.txt (sensitive values masked):")
        for i, line in enumerate(lines, 1):
            if not line:
                continue
            # Mask sensitive cookie values
            parts = line.split("\t")
            if len(parts) >= 7:
                parts[6] = parts[6][:5] + "..." if len(parts[6]) > 5 else "***"
                masked_line = "\t".join(parts)
            else:
                masked_line = line
            print(f"Line {i}: {masked_line}")
            
        # Check Netscape header
        has_header = any("Netscape" in l or "cookies" in l.lower() for l in lines)
        if has_header:
            print("[+] Found Netscape HTTP Cookie File header!")
        else:
            print("[-] WARNING: Could not find Netscape HTTP Cookie File header! The format might be wrong.")
            
    except Exception as e:
        print(f"[-] ERROR reading file: {e}")
        return

    # Run yt-dlp test with verbose logging
    print("\nRunning yt-dlp test with cookies...")
    url = "https://www.youtube.com/watch?v=uPao0S_Fobw"
    
    ydl_opts = {
        "quiet": False,
        "verbose": True,
        "skip_download": True,
        "cookiefile": str(cookies_path),
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print("[*] Calling extract_info...")
            info = ydl.extract_info(url, download=False)
            print(f"[+] SUCCESS! Video Title: {info.get('title')}")
            print(f"[+] Video Duration: {info.get('duration')} seconds")
    except Exception as e:
        print("\n[-] yt-dlp call FAILED!")
        print(f"[-] Error details:\n{e}")

if __name__ == "__main__":
    main()
