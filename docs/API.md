# Aurelis Symphony v1 API

Base path: `/api/v1`. JSON responses unless otherwise noted. Query strings are UTF-8 encoded. All times for lyrics are floating-point **seconds**.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Instance health and version |
| GET | `/config` | Available providers and cloud setting |
| GET | `/catalog?q=&limit=40` | Browse bundled playable tracks |
| GET | `/tracks/:id` | Get one bundled track |
| GET | `/search?q=&provider=youtube` | Search remote music metadata via NewPipe |
| GET | `/info?url=https://...` | Inspect stream details, selectable audio URLs |
| GET | `/lyrics/sources` | Provider capabilities and IDs |
| GET | `/lyrics?track=&artist=&duration=&source=` | Best matching lyrics and provider attempts |
| GET | `/lyrics/all?track=&artist=&duration=` | Compare providers |
| GET | `/lyrics/lrc?track=&artist=&format=enhanced` | Plain or enhanced LRC text |
| GET | `/openapi.json` | OpenAPI specification |
| GET | `/library` | Optional token-private library document |
| PUT | `/library` | Replace optional private document atomically |

### Search providers

`catalog`, `youtube`, `soundcloud`, `bandcamp`, `peertube`, `mediaccc`.

The remote search backend requires the NewPipeExtractor runtime. It gives a list of metadata objects with `id`, `url`, `title`, `artist`, `duration`, `artwork`, `provider`, and `type`. To attempt playback, call `/info?url=...`. A stream may not be compatible with the browser or available in the current region; no audio proxy is supplied.

### Lyrics providers

`lrclib`, `netease`, `qq`, `kugou`, `musixmatch`, `genius`, `lyricsovh`. Omit `source` for an automatic best-match across providers (priority: word-level → line sync → plain lyrics). Unofficial endpoints may stop working at any time.

Example:

```http
GET /api/v1/lyrics?track=Another%20Love&artist=Tom%20Odell
```

```json
{
  "result": {
    "source": "provider-id",
    "track": {"title": "...", "artist": "...", "album": "...", "duration": 0},
    "synced": true,
    "wordLevel": true,
    "instrumental": false,
    "lines": [
      {"time": 12.5, "endTime": 15.0, "text": "...", "translation": "...", "words": [{"text":"...", "start":12.5, "end":13.0}]}
    ]
  },
  "attempts": [{"source":"lrclib","ok":true,"wordLevel":true}]
}
```

Timestamps and lyrics above are **schema illustrations**, not a claim about a real track.

### Cloud library

Disabled by default. Set `AURELIS_CLOUD_LIBRARY=true`. Each client generates its own 32-byte random token encoded as 64 lowercase hex characters. Send it as `Authorization: Bearer TOKEN` on GET/PUT. Stored JSON is entirely client-defined and limited to 100 KiB per PUT. No server accounts or password reset are implemented: losing the token means losing access to the server-side document. The endpoint is not meant to store private or sensitive data without further authentication/security review.

### Errors and limits

`400` invalid parameters, `401` missing/invalid library token, `403` cloud library disabled, `404` missing resource/lyrics, `405` invalid method, `413` oversized payload, `429` basic per-IP request throttle, `502` internal/upstream errors, `503` NewPipe unavailable. External lyric provider failures are reported per-provider in `attempts` and often return `200` with a null result.

The server bounds inputs and uses fixed outbound service endpoints. For high-traffic public deployment use a reverse proxy/WAF, structured monitoring, TLS and persistent storage.
