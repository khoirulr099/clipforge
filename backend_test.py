import yt_dlp
ydl = yt_dlp.YoutubeDL({'skip_download': True, 'quiet': True})
try:
    info = ydl.extract_info('https://youtu.be/n7kFRxFIPrl', download=False)
    print("Resolved ID:", info.get('id'))
except Exception as e:
    print("Failed to extract:", e)
