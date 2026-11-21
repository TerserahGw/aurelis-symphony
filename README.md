<div align="center">

# ✦ Aurelis Symphony 2.0
**Feel every note. Find yourself in the lyrics.**

A responsive music web application with **Node.js 22**, YouTube.js music discovery and **visible official YouTube playback**, personal playlists, smart related-search queue and synchronized lyrics for supported sources.

![Node 22](https://img.shields.io/badge/Backend-Node.js%2022-8ed2c5)
![YouTube.js 18.3](https://img.shields.io/badge/Discovery-YouTube.js%2018.3-a4b5d9)
![License GPL v3](https://img.shields.io/badge/License-GPL--3.0--or--later-blue)

</div>

## Version 2.0 — what changed

- The production backend moved from **Java 17 + NewPipeExtractor** to **Node.js 22 + youtubei.js 18.3.0**, while retaining the existing HTML/CSS/JS UI and original demo tracks.
- YouTube Music song search is attempted first and ordinary YouTube search is used as fallback. Requests are cached for four minutes and throttled. Results are **metadata**, not unlicensed audio streams.
- Play YouTube content with the **visible official YouTube IFrame Player API**. Player controls, lyric timing (where accessible), and end-of-song events use the IFrame API. Embeds can still fail due to restrictions, and browser autoplay can require user interaction.
- **Up Next:** recommends related tracks through another search; three suggestions appear in the queue and can be managed. This is not yet a personalized recommendation algorithm. Search results, bookmarks and playlists are stored locally in browser storage.
- Original self-produced demo MP3s still use HTML5 Audio with proper HTTP 206 Range handling.
- **Lyrics in the Node runtime:** LRCLIB synced/plain lyrics and lyrics.ovh plain fallback. The seven-provider Java prototype remains in legacy source but is **not running** in the Node production image. Lyrics are best-effort and subject to availability/rights.
- Optional API search mode using official YouTube Data API v3 via YOUTUBE_API_KEY. Local catalog/demo playback remains functional when discovery is offline.
- No media proxying, no signature deciphering, no raw YouTube audio extraction and no bypass of provider permissions. Searchable songs are not necessarily embeddable.

## Altare Global / GitHub Container Registry

The publishing workflow automatically builds these images on successful pushes to main:

- ghcr.io/terserahgw/aurelis-symphony:latest
- ghcr.io/terserahgw/aurelis-symphony:2.0.0

In Altare Global, use the Docker image **ghcr.io/terserahgw/aurelis-symphony:2.0.0** once it appears in GHCR. Keep your existing domain and routing, and set the service port to **8080**.

Recommended variables for a 512 MB RAM / 10% CPU plan:

    HOST=0.0.0.0
    PORT=8080
    SEARCH_BACKEND=youtubei
    AURELIS_CLOUD_LIBRARY=false
    NODE_OPTIONS=--max-old-space-size=192

If the hosting panel only has a Node runtime instead of Docker, use Node >=22 and:

    npm install --omit=dev
    npm start

Startup file: server.mjs. The image sets its own safe non-root user and heap limit; **192 MB V8 heap is not a guarantee of total process RAM**.

Optional source selection:

- SEARCH_BACKEND=youtubei: unofficial YouTube.js metadata discovery (default; may break when YouTube changes).
- SEARCH_BACKEND=official plus YOUTUBE_API_KEY=...: official YouTube Data API v3 video search. API key/quota required; this does not provide direct audio streams.

Optional library sync: AURELIS_CLOUD_LIBRARY=true with a persistent AURELIS_DATA_DIR volume. Without persistence, **do not enable** cloud sync, since data may be lost on redeploy. Browser-local playlists and likes do not require it.

## Test your deployment

Visit:

1. /api/v1/health — must show version 2.0.0 and ok:true.
2. /api/v1/catalog — three original demo tracks.
3. /demo/aether-bloom.mp3 — playable audio; Range requests should return 206.
4. /api/v1/config — selected discovery backend, available providers.
5. /api/v1/search?q=Another%20Love&provider=youtube — attempts live metadata discovery; **live availability is not guaranteed by CI**.
6. Search from Explore, choose a song, and use the **visible YouTube player**. Embedding/ads/availability are controlled by YouTube.

For API compatibility, /api/tracks is an alias of /api/v1/catalog. /api/v1/info returns a secure embed descriptor without raw audio URLs.

## REST API

See [docs/API.md](docs/API.md) or /api/v1/openapi.json. Key endpoints:

    GET /api/v1/health
    GET /api/v1/config
    GET /api/v1/catalog
    GET /api/v1/search?provider=youtube&q=Another%20Love
    GET /api/v1/recommendations?track=Another%20Love&artist=Tom%20Odell&exclude=yt-...
    GET /api/v1/info?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DMwpMEbgC7DA
    GET /api/v1/lyrics?track=Another%20Love&artist=Tom%20Odell
    GET /api/v1/lyrics/sources

## Local development and testing

    npm install
    npm run check
    npm test
    npm start

Node's built-in HTTP server keeps RAM usage modest, without Express/Next.js or a frontend bundler. CI checks JavaScript syntax, HTTP health, demo byte ranges, metadata-only playback descriptors and Docker image build.

## Limitations and licensing

YouTube's Developer Policies prohibit isolating audio from video and hidden/background playback using YouTube API Services. The YouTube IFrame is **not** equivalent to an independent licensed audio streaming service; access, autoplay and embedded playback vary. You may host original or appropriately licensed audio for independent playback using the catalog.

The old Java 17 + NewPipeExtractor files remain in the repo as legacy code only; the production Node 2.0 Docker image does not build or execute them.

This repository remains GPL-3.0-or-later. Refer to LICENSE. YouTube.js is MIT licensed and is not endorsed by YouTube. Lyrics belong to their owners/providers.

See https://developers.google.com/youtube/terms/developer-policies/ for the provider rules.
