# ✦ Aurelis Symphony 2.3.0

Music listening room with a responsive web player, YouTube music metadata, artist-and-vibe radio, karaoke lyric display and a first-party API reference.

## What's new in 2.3

- **Preferences:** desktop dialog / Android bottom-sheet style settings. The controls change actual playback, AutoPlay, repeat, shuffle, radio diversity, volume, lyric size and offset, translations, romanization, glow effects, compact cards, animation reduction, artwork background, and browser data management. Saved in browser storage.
- **API reference:** `/docs/api` is a responsive developer documentation webpage with request examples, copy controls and safe interactive GET/POST demos. `/api/v1/openapi.json` remains available.
- **Artist-and-vibe radio:** `/api/v1/recommendations` uses three YouTube searches, title/artist de-duplication across uploads and versions, prior song context, manual queue exclusions, and artist diversity. Modes: `familiar`, `balanced`, `discover`. This is rules-based metadata ranking, not audio embeddings or actual waveform similarity.
- **Lyrics:** Enhanced LRC `<mm:ss.xx>` word markers are parsed when present. Real word timing drives karaoke glow; normal line-level LRC optionally shows **estimated line progress**, not fabricated per-word timing. Long lines wrap within the mobile viewport. Global lyric offset, plus per-track offset from the three-dot menu.
- **Compact track popover:** anchored near the three-dot button instead of opening a large modal. Play, queue, like, playlists, source and per-song sync adjustment.
- Fullscreen player and mini player remain one audio engine. Up Next is generated from the same source and avoids replaying the current title or recently played songs.

## Playback restrictions

**Online discovery is YouTube-only.** No Audius or YouTube iframe. The experimental direct-audio backend tries `youtubei.js` and then `@distube/ytdl-core` for the same video ID. Both can fail due to upstream restrictions and anti-bot challenges, even with successful search results. These unofficial streaming interfaces are not endorsed by YouTube, and extracting audio can violate YouTube's terms. No DRM or authentication bypass is included. Original demo MP3 tracks remain available.

## Altare Global deployment

GitHub Actions publishes the following image after all checks pass:

    ghcr.io/terserahgw/aurelis-symphony:2.3.0

Keep the same domain, default Docker command and port **8080**. Example environment:

    HOST=0.0.0.0
    PORT=8080
    SEARCH_BACKEND=youtubei
    AURELIS_DIRECT_AUDIO=true
    AURELIS_YTDL_FALLBACK=true
    AURELIS_STREAM_EVAL=false
    AURELIS_MAX_STREAMS=3
    AURELIS_CLOUD_LIBRARY=false
    NODE_OPTIONS=--max-old-space-size=256

Requires Node.js 22.22.2 or later. Upgrading does not remove platform streaming restrictions.

## Development

    npm install
    npm run check
    npm test
    npm start

Explore `/docs/api` for search, radio, home, lyrics, translation and streaming endpoint details. Browser collection is local by default. This project is GPL-3.0-or-later; respect copyright and music licensing.
