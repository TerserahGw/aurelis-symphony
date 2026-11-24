# Aurelis Symphony 2.1 API

**Runtime:** Node.js 22. **Discovery:** youtubei.js 18.3.0 (unofficial). **Player:** HTML5 Audio (no iframe). Experimental external streaming may fail or conflict with source terms.

| Method | Endpoint | Response |
| --- | --- | --- |
| GET | /api/v1/health | ok, version 2.1.0, playback kind |
| GET | /api/v1/config | discovery, providers, directAudio |
| GET | /api/v1/catalog | original demo tracks |
| GET | /api/v1/tracks/:id | original track by ID |
| GET | /api/v1/search?provider=youtube&q=... | YouTube.js metadata only |
| GET | /api/v1/recommendations?track=&artist=&exclude= | related-search suggestions |
| GET | /api/v2/home | home recommendations or local fallback |
| GET | /api/v2/status | experimental directAudio settings and current stream count |
| GET/HEAD | /api/v2/audio/:videoId | unverified direct audio stream; 200/206, 403/502/503 |
| GET | /api/v1/info?url=... | audio descriptor without raw third-party URL |
| GET | /api/v1/lyrics/sources | LRCLIB / lyrics.ovh |
| GET | /api/v1/lyrics | best matching lyrics |
| GET | /api/v1/lyrics/all | all lyric sources |
| GET | /api/v1/lyrics/lrc | LRC text |
| GET/PUT | /api/v1/library | optional cloud library sync |

The experimental audio proxy:
- accepts only valid 11-character YouTube video IDs
- allows only HTTPS googlevideo.com destinations; rejects other hosts
- does not decrypt DRM or bypass authentication, paywalls, consent, access controls, or token requirements
- uses a small capped number of concurrent streams
- forwards HTTP byte ranges only when the upstream confirms 206
- never exposes extracted URLs directly through the JSON API
- may return 502 / unsupported_delivery / upstream_range_unsupported / upstream_restricted if the provider cannot serve a direct compatible stream

The YouTube.js decoder evaluator is **disabled by default**. Enabling AURELIS_STREAM_EVAL=true runs upstream decipher script using a documented dynamic JavaScript evaluator; understand its security implications first. This does not guarantee success.

YouTube's developer policies restrict isolated audio playback from YouTube content. For a compliant public service, use your own recordings, properly licensed audio, or an authorized integration. Search results do not provide redistribution rights.

Local and personal-library routes remain backward compatible with Aurelis 2.0. No password login or advanced collaborative recommendations in this release.


## Playlist import (v2.7.1)

```sh
curl -G 'https://aurelis-symphony.go.altare.global/api/v1/playlists/import' \
  --data-urlencode 'url=https://youtube.com/playlist?list=PLEBFqiHTFkcY_ZCW2Sro17E5b_TCFIbZ3'
```

Returns `{ok, playlist, tracks, count, scanned, skipped, truncated, notice}`. Playlist fields: id, title, description, author, artwork, url, provider, totalItemsText (provider display text). Tracks use the existing search metadata shape plus position, streamUrl, playbackUrl and probeUrl. Resolve relative links against the Aurelis API origin. Missing metadata can be empty or zero. Source order and duplicate video IDs are preserved. `limit` defaults to 1000 (1–1000 entries scanned, including unavailable entries); `truncated` indicates more entries remain or the 20-page safety cap was reached. HTTP 400 invalid input, 429 busy/rate limit, 503 unavailable/upstream failure. No private playlists or generated mixes; no download or persistence. Metadata does not imply playable audio. Browser cross-origin callers require the existing AURELIS_CORS_ORIGIN setting.

In v2.7.2, modern LockupView and ShortsLockupView items are recognized. `skippedReasons` separates explicitly unavailable from unrecognized entries. HTTP 502 `playlist_parse_failed` indicates that a nonempty selection could not be parsed at all. The Developer Hub sample no longer sets limit=10.
