<div align="center">

# ✦ Aurelis Symphony

**Feel every note. Find yourself in the lyrics.**

A lightweight, self-hosted music web app with an original responsive UI, real playback controls, NewPipe-powered music discovery, and **seven best-effort lyric integrations**.

![Java 17](https://img.shields.io/badge/Backend-Java%2017-9cbab1) ![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-b8dcca) ![License: GPL v3+](https://img.shields.io/badge/License-GPL--3.0--or--later-blue)

</div>

## What works

- Responsive, mobile-first player: play/pause, next/previous, seeking, volume, shuffle, repeat, Media Session, keyboard shortcuts and reduced-motion mode.
- Real demo audio: three **original synthesized compositions** are bundled so the app is functional immediately after startup. These are clearly labeled demos, not commercial songs.
- Search: local catalog immediately; external YouTube, SoundCloud, Bandcamp, PeerTube and media.ccc.de via **NewPipeExtractor v0.27.1** when the Gradle distribution is built with the dependency.
- Synchronized lyrics: Java-native adapters for **LRCLIB, NetEase, QQ Music, Kugou, Musixmatch, Genius, lyrics.ovh**. The first five can supply synced lyrics; word-level depends on song/provider. Plain lyrics fall back gracefully.
- Smooth, word-progress highlighting, animated lyric transitions, click-to-seek synced lines, lyric provider switcher and automatic best-match ranking.
- Queue, suggestions, likes, recently played, playlist creation, adding songs to playlists; local browser persistence by default.
- Optional multi-device library sync via bearer-token-protected JSON endpoint, **disabled by default**.
- OpenAPI 3 endpoint, JSON REST API, Dockerfile, GitHub Actions, and no front-end build step.
- Media URL discovery does **not** proxy arbitrary audio through the server. Browser playback depends on the provider, its restrictions, stream format and regional availability. **Searchable does not always mean playable.**
- **Playback improvement:** YouTube and SoundCloud search results now open their official visible embedded players rather than attempting unreliable cross-device raw stream URLs. Use provider controls within the embedded player. Other providers still depend on the audio stream and may not play in-browser.
- The **Aurelis Demos** catalog is only three bundled original MP3 tracks. It is not an online catalog of commercial music. The mobile Library page now also shows these demos alongside your playlists. Search defaults to YouTube; switch to **Aurelis Demos** to search the local files.

## Stack and resource budget

- **Backend:** Java 17, built-in `com.sun.net.httpserver.HttpServer`, JDK HttpClient, no Spring Boot / Ktor / Netty framework.
- **Extractor:** NewPipeExtractor GPL-3.0-or-later from JitPack; its transitive dependencies are included in the Gradle runtime distribution.
- **Frontend:** HTML/CSS/ES2022, no React/Vue/Next.js and no npm build step.
- **Server memory:** start with `-Xms32m -Xmx256m`; heap is **not** total JVM resident memory. Tune after measuring real workload and request concurrency. NewPipeExtractor adds dependencies and memory overhead.
- **Static samples:** approximately 0.7 MB total of self-produced MP3 audio.

## Deploy with Docker

```bash
docker build -t aurelis-symphony .
docker run -d --name aurelis -p 8080:8080 \
  -e PORT=8080 -e JAVA_TOOL_OPTIONS='-Xms32m -Xmx256m' \
  --restart unless-stopped aurelis-symphony
```

Visit `http://YOUR_SERVER:8080`.

### Deploy to Java hosting (without Docker)

Java 17+ **and Gradle** are required to build, then only a Java runtime is required to run the distribution.

```bash
gradle --no-daemon installDist
PORT=8080 ./build/install/aurelis-symphony/bin/aurelis-symphony
```

Alternatively zip `build/install/aurelis-symphony/` and upload to your Java host. On a host without shell access, use the provider's startup command and classpath settings; `installDist` contains all dependencies.

> In this environment, offline compilation and smoke tests of the dependency-free server code are supported. The complete Gradle + JitPack build and external music/lyrics integrations require network access and are not claimed as live-verified.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Listening interface |
| `PORT` | `8080` | Listening port |
| `JAVA_TOOL_OPTIONS` | unset | JVM options, e.g. `-Xms32m -Xmx256m` |
| `AURELIS_CORS_ORIGIN` | empty | Optional explicit allowed cross-origin for the API |
| `AURELIS_CLOUD_LIBRARY` | `false` | Enable bearer-token-based server library sync |
| `AURELIS_DATA_DIR` | `./data` | Local folder for cloud library JSON records |

**Security:** Serve on HTTPS for public deployments, keep the data volume persistent for sync, and rate-limit at a reverse proxy for large public instances. No public uploads, URL-proxying, or admin API are exposed. Cloud library tokens are secrets. Browser local favorites work without cloud mode.

## Quick API examples

```bash
# Status and tracks
curl http://localhost:8080/api/v1/health
curl 'http://localhost:8080/api/v1/catalog?q=aether'

# Search online, when NewPipeExtractor resolves successfully
curl 'http://localhost:8080/api/v1/search?q=Another%20Love&provider=youtube'

# Multi-source synchronized lyrics
curl 'http://localhost:8080/api/v1/lyrics?track=Another%20Love&artist=Tom%20Odell'
curl 'http://localhost:8080/api/v1/lyrics/sources'
curl 'http://localhost:8080/api/v1/lyrics/lrc?track=Another%20Love&artist=Tom%20Odell&format=enhanced'
```

Full reference: [`docs/API.md`](docs/API.md) and live `/api/v1/openapi.json`.

## Diagnose playback on your deployed site

Open these URLs, replacing `YOUR_HOST` with the actual Altare domain:

1. `https://YOUR_HOST/api/v1/health` should return `"ok":true`.
2. `https://YOUR_HOST/api/v1/catalog` should return `"total":3` and three demo entries.
3. `https://YOUR_HOST/demo/aether-bloom.mp3` should play an original bundled MP3 or download a valid audio file.
4. Search for a song with **YouTube** or **SoundCloud** in Explore and tap Play. An official embedded player should appear; press its play button if autoplay is blocked.

If (1) or (2) fails, inspect Altare application logs and route/port configuration. If (3) fails while (2) works, inspect MP3 serving, HTTP Range requests, or the deployed image version. If (4) fails, confirm the track permits embedding and that the provider is accessible in your browser/region. Official embeds cannot play videos/tracks blocked by their owners or by network policies.

**Note:** Embedded playback is controlled by the provider's player; the custom Aurelis seek bar, auto-next and synchronized lyric timeline are **not** yet connected to it. They continue to function for locally hosted audio.

## Getting more music into the app

The bundled `src/main/resources/web/catalog.json` lists three original audio samples. You can replace these with your own **licensed or self-owned** MP3s and metadata; add audio under `web/demo/` and set `audio` to its public path. The current catalog is packaged into the application build and is not an authenticated upload API.

## Lyrics notes

The Java provider implementation was adapted from the user-provided [`reference/lirik.js`](reference/lirik.js), including preference for word-level timestamps and formats LRC, YRC, KRC, QRC, RichSync and Lyricsfile. Some providers rely on **unofficial, rate-limited, region-dependent endpoints** and may be unavailable without advance notice. No lyric database is redistributed.

LRCLIB identifies clients using an application user agent. This app uses `AurelisSymphony/1.0 (+https://github.com/TerserahGw/aurelis-symphony)`; adjust it to your actual project homepage if you change the repo.

## Known limitations / roadmap

- YouTube and other services can block raw audio playback, impose regional restrictions, or alter their APIs. A direct source link is shown when a stream is unavailable. No upstream 302/Range proxy workaround is promised.
- NewPipe search and stream resolution are implemented but need an **online Gradle build and live network testing**; provider changes may require future extractor updates.
- Advanced library features (accounts, shared playlists, social, uploads, offline downloads, subscription management) are not present in v1.
- The app intentionally does not proxy media or bypass DRM, subscriptions, or provider access checks.
- This is a lightweight self-hosted v1, not a licensed music streaming catalog.

## Credits & licensing

- [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor), GPL-3.0-or-later.
- Lyrics services: [LRCLIB](https://lrclib.net), Netease, QQ Music, Kugou, Musixmatch, Genius, lyrics.ovh; each provider retains its own terms and ownership.
- The sample tracks and CSS artwork are original demo material generated for this project.

Distributed under **GNU GPL-3.0-or-later**. See [`LICENSE`](LICENSE).
