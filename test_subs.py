
import sys
import os
import json

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from utils.media import get_embedded_subtitles

video_path = os.path.abspath("videos/Jobs/Jobs.mp4")

if not os.path.exists(video_path):
    print(f"File not found: {video_path}")
    sys.exit(1)

print(f"Analyzing: {video_path}")
subs = get_embedded_subtitles(video_path)
print(json.dumps(subs, indent=2))
