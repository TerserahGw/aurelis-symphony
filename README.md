# Aurelis Symphony 2.2.1

Music web app (Node.js 22.22.2+) with fullscreen lyrics player, animated mini-player expansion, queue, autoplay, playlists and recommendations.

## YouTube only — no Audius

- Search, home and recommendations: **youtubei.js 18.3.0** with YouTube / YouTube Music results.
- Audio first tries **youtubei.js**; on failure **@distube/ytdl-core 5.2.1** attempts to stream the **exact same YouTube video ID**. No alternative music catalog or silent song substitutions.
- HTML5 Audio plays the original Aurelis demo MP3s and experimentally relayed YouTube streams. There is **no YouTube embed**.
- The mobile player retains fullscreen animations, timed lyrics, Indonesian translate toggle (MyMemory third-party), basic Japanese/Korean romanization, play/pause, previous/next, repeat, shuffle, volume, auto-queue and autoplay toggle.
- If both engines fail, the API returns structured HTTP **424** with a source error; /api/v2/status shows engine diagnostics.

### Limitations

Both YouTube streaming libraries are unofficial. Video rights, hosting IP bans, missing formats, YouTube protocol changes or network restrictions may prevent playback even when search works. YouTube API terms restrict separating audio from video, so this is not a YouTube-authorized integration. No DRM or credential bypass is implemented. Passing CI does not guarantee real-world streaming.

For reliable public playback, provide audio you own/license or an authorized playback SDK. Original demo MP3s remain available.

## Altare redeploy

**Skip v2.2.0** — it was not deployed yet. After CI publishes, pull the image:

```
ghcr.io/terserahgw/aurelis-symphony:2.2.1
```

Keep the same domain, port **8080**, and default CMD. Environment:

```env
HOST=0.0.0.0
PORT=8080
SEARCH_BACKEND=youtubei
AURELIS_DIRECT_AUDIO=true
AURELIS_YTDL_FALLBACK=true
AURELIS_STREAM_EVAL=false
AURELIS_MAX_STREAMS=3
AURELIS_CLOUD_LIBRARY=false
NODE_OPTIONS=--max-old-space-size=256
```

Ensure Node **22.22.2+**, either via the patched node:22-alpine image or compatible later version. The alternative streamer can use more CPU/RAM. Leave AURELIS_STREAM_EVAL=false unless you specifically accept the risks of running upstream JavaScript in a Node VM.

Check /api/v1/health -> `2.2.1`, /api/v1/config -> only youtube/catalog, /api/v1/search?provider=youtube&q=Another%20Love -> metadata, and /api/v2/audio/MwpMEbgC7DA?probe=1 -> successful first bytes or HTTP 424 details. A successful first-byte probe does not prove uninterrupted playback.

## Developer

```sh
npm install
npm run check
npm test
npm start
```

GPL-3.0-or-later. Respect music copyrights and provider terms.
