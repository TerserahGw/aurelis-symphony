<div align="center">

# ✦ Aurelis Symphony 2.1
### Music, your way.

**A redesigned mobile-first music web app, native audio controls, YouTube.js discovery, personal playlists and synchronized lyrics.**

![Node.js 22](https://img.shields.io/badge/Node.js-22-9eeac1)
![YouTube.js](https://img.shields.io/badge/youtubei.js-18.3.0-9caff5)
![Experimental direct audio](https://img.shields.io/badge/Direct%20audio-experimental-orange)

</div>

## What's new in 2.1

- **Complete frontend redesign:** dark Spotify / YouTube Music-inspired layout, compact side navigation, responsive album cards, search results, library, saved tracks, playlist screens, song menu, native mini-player, mobile navigation, lyrics, and queue panel.
- The new frontend is in assets/v21.js and assets/v21.css; index.html loads them. Previous HTML is backed up as index-v20.html and the old JS/CSS remain in the repository.
- **No YouTube iframe in the 2.1 frontend.** HTMLAudioElement plays original MP3 files and requests experimental direct audio from /api/v2/audio/:id for YouTube.js results.
- YouTube.js 18.3.0 searches music, retrieves public format information and, when possible, relays audio as a stream with byte-range support. Direct streaming **can fail** due to provider restrictions, IP blocking, token requirements, unsupported codecs or HTTP Range behavior. We do not bypass DRM, paywalls, access checks, or authentication.
- **Three Up Next recommendations** are refreshed by a related-song search. This is not a real personalized recommendation model.
- Favorites, history and playlists reuse the same existing localStorage keys as 2.0. No account login and no guaranteed cross-device sync.
- Lyrics: LRCLIB synced/plain lyrics and lyrics.ovh fallback. Lyrics with no timestamp don't animate in sync.

## Important: service terms and security

YouTube's Developer Policies do not permit separating audio from video through YouTube API Services; this experimental mode is **not a supported or officially compliant YouTube integration**. Do not assume unrestricted access or redistribution rights. For a public service, use recordings you own or have permission to distribute, or use an authorized platform integration.

The optional AURELIS_STREAM_EVAL=true setting follows YouTube.js's documented mechanism to execute code used to decipher playback URLs. This executes upstream-supplied script in the Node process and **carries security risk**. It is disabled by default. Only enable when you understand and accept that risk on a suitably isolated host; it is not recommended for sensitive production infrastructure. Even enabled, audio playback can fail.

See https://developers.google.com/youtube/terms/developer-policies/ and https://ytjs.dev/guide/getting-started

## Altare Global redeploy

The CI workflow builds an image after successful tests on main:

    ghcr.io/terserahgw/aurelis-symphony:2.1.0

**Docker Image hosting:** change the old image reference to the 2.1.0 tag, preserve the domain, leave Docker CMD as default, keep service port **8080**, and select Redeploy / Pull new image.

Suggested environment values:

    HOST=0.0.0.0
    PORT=8080
    SEARCH_BACKEND=youtubei
    AURELIS_DIRECT_AUDIO=true
    AURELIS_STREAM_EVAL=false
    AURELIS_MAX_STREAMS=5
    AURELIS_CLOUD_LIBRARY=false
    NODE_OPTIONS=--max-old-space-size=192

For larger instances, adjust AURELIS_MAX_STREAMS and Node heap based on actual usage, not RAM alone. Real limits include upstream bandwidth, connection count and hosting egress. If your Altare deployment is connected to GitHub rather than GHCR, set Node >= 22, npm install --omit=dev, and npm start.

To enable the risky experimental decipher evaluator, **explicitly** set AURELIS_STREAM_EVAL=true only if you accept the security and service-terms limitations described above. Leave AURELIS_DIRECT_AUDIO=false to disable experimental streaming completely.

## Verify deployment

1. /api/v1/health must show version 2.1.0 and playback experimental-direct-audio-and-licensed-audio.
2. /api/v2/status reports whether direct audio and the optional evaluator are enabled.
3. /api/v1/catalog returns the three original demo tracks.
4. /demo/aether-bloom.mp3 should play and support HTTP byte-range 206.
5. /api/v1/search?q=Another%20Love&provider=youtube should return metadata if YouTube.js can access the provider.
6. /api/v2/audio/MwpMEbgC7DA is the **experimental** direct audio route; success is not guaranteed. If it returns 502, inspect Altare logs for error codes and verify network conditions before changing settings. Do not confuse passing CI with successfully streaming YouTube from Altare.

Browser users may need to clear cache once after redeploy; index.html now points to versioned v21 assets.

## Develop

    npm install
    npm run check
    npm test
    npm start

Backend: Node.js 22 built-in HTTP; no frontend bundler or Chromium. The tests are offline and intentionally never require access to YouTube. CI also builds the production Docker image.

## API

- GET /api/v1/health
- GET /api/v1/config
- GET /api/v1/catalog
- GET /api/v1/search?q=...&provider=youtube
- GET /api/v1/recommendations?track=...&artist=...
- GET /api/v2/home
- GET /api/v2/status
- GET /api/v2/audio/:videoId (experimental streaming)
- GET /api/v1/lyrics?track=...&artist=...
- GET /api/v1/library and PUT /api/v1/library (optional)

Full reference: docs/API.md and /api/v1/openapi.json.

## Notes

The repository remains GPL-3.0-or-later. Original demo tracks are included. youtubei.js is distributed under the MIT license and is not affiliated with YouTube. Third-party music and lyric rights remain with the respective owners.
