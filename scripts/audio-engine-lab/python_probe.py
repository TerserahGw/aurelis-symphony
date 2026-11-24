# Public/authorized test media only. No credentials or access-challenge overrides.
import json
import sys
import urllib.request
from pytubefix import YouTube

failed = False
for video_id in sys.argv[1:]:
    result = {"engine": "pytubefix", "videoId": video_id, "ok": False}
    try:
        stream = YouTube("https://www.youtube.com/watch?v=" + video_id).streams.filter(only_audio=True).order_by("abr").desc().first()
        if stream is None:
            raise RuntimeError("no audio-only format")
        req = urllib.request.Request(stream.url, headers={"Range": "bytes=0-4095", "Accept-Encoding": "identity"})
        with urllib.request.urlopen(req, timeout=12) as response:
            mime = response.headers.get_content_type()
            data = response.read(4096)
            result.update(http=response.status, mime=mime, bytes=len(data))
            result["ok"] = response.status in (200, 206) and mime.startswith("audio/") and len(data) == 4096
    except Exception as error:
        result["errorType"] = type(error).__name__
    failed |= not result["ok"]
    print(json.dumps(result), flush=True)
sys.exit(1 if failed else 0)
