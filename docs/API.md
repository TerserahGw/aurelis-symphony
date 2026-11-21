# Aurelis Symphony 2.0 API

Base path: /api/v1 (HTTP JSON unless noted). Backend: Node.js 22.

| Method | Path | Function |
| --- | --- | --- |
| GET | /health | Health, current version 2.0.0 |
| GET | /config | Capabilities and current backend |
| GET | /catalog?q=&limit= | Bundled playable music |
| GET | /tracks/:id | Bundled track lookup |
| GET | /search?provider=youtube&q=&limit=20 | YouTube music metadata, not raw audio |
| GET | /recommendations?track=&artist=&exclude=&limit=12 | Related search suggestions (not personalized) |
| GET | /info?url= | Safe YouTube embed descriptor; audio array always empty |
| GET | /lyrics/sources | LRCLIB, lyrics.ovh capabilities |
| GET | /lyrics?track=&artist=&duration=&source= | Best-effort lyric lines |
| GET | /lyrics/all?track=&artist= | Both lyric sources |
| GET | /lyrics/lrc?track=&artist= | LRC text |
| GET | /openapi.json | API OpenAPI spec |
| GET, PUT | /library | Optional bearer-token cloud library |

GET /api/tracks remains an alias for catalog. All timestamps are seconds.

### Playback separation

For YouTube results, the track URL is a youtube.com/watch?v=... link and playback.mode is official-embed. Do not pass video metadata into a raw audio proxy. The browser opens the YouTube IFrame API; if embedding is disabled, the user must open the content at the source.

For bundled audio tracks, the audio property points to a hosted demo MP3 and supports Range 206 requests. You can add your own original/licensed tracks to src/main/resources/web/catalog.json before rebuilding.

### Search limitations

Default discovery uses youtubei.js 18.3.0 and may be restricted by network/IP/rate limits or API changes. Optional SEARCH_BACKEND=official requires YOUTUBE_API_KEY and the official YouTube Data API v3, which searches videos, not playable audio streams. A 503 indicates unavailable discovery, not a playable link.

The recommendation endpoint searches related terms and is not a personal/collaborative ranking engine.

### Lyrics

Sources: lrclib (best-effort synchronized lyrics) and lyricsovh (plain text). Response shape remains:
    { "result": { "source": "lrclib", "track": {...}, "synced": true, "wordLevel": false, "lines": [{"time": 12.5, "endTime": 14.3, "text": "...", "words": []}] }, "attempts": [...] }

Word-level karaoke is only available when provider data supports it. Live endpoints can fail.

### Cloud library

Disabled by default. Enable with AURELIS_CLOUD_LIBRARY=true and persistent storage. Each client uses a random 64-character hexadecimal bearer token. GET/PUT data stored under SHA-256-derived filenames, 100 KB max per write. There is no password recovery, dedicated account system, or shared playlists.

### Safety

- Allowlisted HTTPS YouTube URLs in /info.
- No arbitrary URL fetch/proxy endpoints.
- Input length and response limits; per-IP basic request throttling.
- Server-bound API keys; use HTTPS and upstream rate limits for public hosting.
