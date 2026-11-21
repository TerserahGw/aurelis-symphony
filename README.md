# ✦ Aurelis Symphony 2.5.0

Responsive music player with a native HTML5 Audio element, YouTube-only search and recommendations, lyric sources, customizable fullscreen player and open REST API.

## What's new in 2.5

- **Fullscreen song menu fix:** one tap now opens exactly one anchored three-dot menu, retaining working queue, favorites, downloads, playlists and lyric offset actions. Closing the fullscreen player dismisses the menu and resets accessible button state.
- **Extended Ambient Glass:** artwork-tinted, softly transparent layers now cover the mini player, mobile navigation, topbar, side panel, expanded player controls, settings and song menus. The glass is restrained, preserves contrast, and is disabled when the Reduce Transparency or Blur setting requires it.
- **Fine animation polish:** spring transitions, more tactile press feedback, relaxed lyric focus, subtler queue motion, and consistent focus states. Reduced Motion preference is fully supported.
- **Stability:** word-karaoke 30 FPS animation is only active when real per-word timings exist and playback is active/visible. Paused, background and ordinary line-only lyrics are updated by native audio events instead. API calls time out rather than hanging, obsolete searches are canceled, and audio failures trigger just one bounded diagnostic probe per song.
- **Regression checks:** mobile and desktop Chromium tests cover fullscreen popover toggle, offset/favorite action, viewport bounds, close cleanup, ambient glass and pre-existing playback controls.

## What's new in 2.4

- **Correct lyric behaviour:** no fabricated progress fill for line-timed LRC or plain lyrics. Only genuine word-level timestamps activate a smooth per-word karaoke fill; ordinary line timestamps highlight the active line and scroll.
- **Seven lyric providers:** the user-supplied `lirik.js` has been integrated as `server/vendor/lirik-sync.mjs`. LRCLIB, Netease Cloud Music, QQ Music, Kugou Music, Musixmatch, Genius and lyrics.ovh are available as best-effort sources. The backend checks artist/title/duration and prefers real per-word data. This does not guarantee each provider is reachable or licensed for every track; some use unofficial endpoints and can stop working.
- **Ambient glass:** the three-dot popover and settings sheet use subtle artwork-tinted translucent layers, frosted blur, and readable borders. Can be reduced with accessibility/transparency preferences.
- **Android media notification:** dedicated Media Session synchronization for title, artist, artwork (YouTube thumbnails or Aurelis fallback), transport buttons, playback state and position/duration. Actual Android lockscreen/notification display is controlled by the browser and OS, and may differ from a native app.
- Fullscreen player, playlists, synced LRC downloads, translations, romanization, radio queue and Spotify-style browsing remain available.

## Streaming note

Online discovery uses YouTube.js; native streaming is attempted via `youtubei.js` and `@distube/ytdl-core` for the exact video ID. This is not an official YouTube playback integration. YouTube may impose anti-bot restrictions. Audio and downloads cannot be guaranteed by passing CI. Original licensed Aurelis demo tracks are available.

## Docker image / Altare

After CI publishes, deploy `ghcr.io/terserahgw/aurelis-symphony:2.5.0` on port **8080**, preserving the current domain. Suggested variables:

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

Requires Node.js 22.22.2+.

## Developer

```sh
npm install
npm run check
npm test
npm start
```

- `/api/v1/lyrics/sources` lists 7 providers and their timing capabilities.
- `/api/v1/lyrics?track=...&artist=...&source=...` searches best matching lyrics or a specific provider.
- `/api/v1/lyrics/all` collects all available sources.
- `/docs/api` explains the REST API.

The original `lirik.js` is provided by the project owner. Third-party provider names and lyrics remain owned by their respective owners. Respect source licensing and terms. GPL-3.0-or-later.
