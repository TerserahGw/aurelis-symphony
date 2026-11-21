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
