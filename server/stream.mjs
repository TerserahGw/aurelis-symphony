// Experimental direct-audio relay. Not an official YouTube playback integration.
// Uses only public, playable format URLs returned by youtubei.js. Never handles
// DRM, authentication cookies, paywalls, PoToken forgery, or untrusted target URLs.
import { Readable } from 'node:stream';
import { Innertube, Platform } from 'youtubei.js';

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const ttlMs = 150_000;
const cache = new Map();
let ytPromise;
let active = 0;
const maxStreams = Math.max(1, Math.min(12, Number(process.env.AURELIS_MAX_STREAMS) || 5));
const enabled = process.env.AURELIS_DIRECT_AUDIO !== 'false';

if (process.env.AURELIS_STREAM_EVAL === 'true') {
  // Requires explicit operator opt-in: evaluates deciphering scripts supplied
  // by the upstream platform. Follow YouTube.js's documented shim mechanism.
  Platform.shim.eval = async data => new Function(data.output)();
}
function remoteIsAllowed(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && (u.hostname === 'googlevideo.com' || u.hostname.endsWith('.googlevideo.com'));
  } catch { return false; }
}
function idFromPath(p) {
  const match = /^\/api\/v2\/audio\/(?:yt-)?([a-zA-Z0-9_-]{11})$/.exec(p);
  return match?.[1] || null;
}
function requestError(code, message) {
  const e = new Error(message); e.code = code; return e;
}
function client() {
  if (!ytPromise) {
    ytPromise = Innertube.create({ lang: 'en', generate_session_locally: true })
      .catch(error => { ytPromise = undefined; throw error; });
  }
  return ytPromise;
}
async function resolve(id) {
  const hit = cache.get(id);
  if (hit && hit.until > Date.now()) return hit;
  // No credentials or access-control workarounds; the format must be available.
  const yt = await client();
  let format;
  try {
    format = await yt.getStreamingData(id, { type: 'audio', quality: 'best', format: 'mp4' });
  } catch (first) {
    try { format = await yt.getStreamingData(id, { type: 'audio', quality: 'best', format: 'any' }); }
    catch { throw requestError('format_unavailable', 'No accessible audio format was returned for this track.'); }
  }
  if (!remoteIsAllowed(format?.url)) throw requestError('unsupported_delivery', 'The available format cannot be relayed as direct HTTP audio.');
  const result = { url: format.url, until: Date.now() + ttlMs };
  if (cache.size > 48) cache.delete(cache.keys().next().value);
  cache.set(id, result);
  return result;
}
async function fetchRemote(url, opts) {
  for (let i = 0; i < 3; i++) {
    if (!remoteIsAllowed(url)) throw requestError('blocked_upstream', 'Unexpected upstream host.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let result;
    try { result = await fetch(url, { ...opts, redirect: 'manual', signal: controller.signal }); }
    finally { clearTimeout(timer); }
    if ([301,302,303,307,308].includes(result.status)) {
      const next = result.headers.get('location');
      if (!next) throw requestError('unexpected_redirect', 'Upstream redirected without a destination.');
      url = new URL(next, url).href;
      await result.body?.cancel();
      continue;
    }
    return result;
  }
  throw requestError('redirect_limit', 'Too many upstream redirects.');
}
export function directAudioStatus() {
  return { enabled, mode: 'experimental-unofficial-audio', active, maxConcurrent: maxStreams,
    evaluatorEnabled: process.env.AURELIS_STREAM_EVAL === 'true',
    notice: 'Direct YouTube audio can fail or conflict with YouTube terms. No bypass is implemented.' };
}
export async function relayAudio(req, res, pathname) {
  const id = idFromPath(pathname);
  if (!id || !VIDEO_ID.test(id)) return jsonError(res, 400, 'invalid_video_id', 'Invalid YouTube video ID.');
  if (!enabled) return jsonError(res, 403, 'direct_audio_disabled', 'The operator disabled experimental direct audio.');
  if (active >= maxStreams) return jsonError(res, 503, 'stream_capacity', 'Stream capacity reached.');
  const requestedRange = req.headers.range || '';
  if (requestedRange && !/^bytes=\d*-\d*$/.test(requestedRange))
    return jsonError(res, 416, 'invalid_range', 'Only one byte range is supported.');
  active++;
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  try {
    const entry = await resolve(id);
    let upstream = await fetchRemote(entry.url, {
      headers: { ...(requestedRange ? { Range: requestedRange } : {}), 'Accept-Encoding': 'identity' }
    });
    if ([403, 410].includes(upstream.status)) {
      cache.delete(id);
      return jsonError(res, 502, 'upstream_restricted', 'Source rejected the stream URL (403/410).');
    }
    if (![200,206].includes(upstream.status) || !upstream.body) {
      return jsonError(res, 502, 'upstream_unavailable', 'Upstream did not provide a playable audio response.');
    }
    if (requestedRange && upstream.status !== 206) {
      await upstream.body.cancel();
      return jsonError(res, 502, 'upstream_range_unsupported', 'Upstream does not support the requested audio byte range.');
    }
    const type = upstream.headers.get('content-type') || '';
    if (!/(audio\/|video\/webm|application\/octet-stream)/i.test(type)) {
      await upstream.body.cancel();
      return jsonError(res, 502, 'invalid_media_type', 'Upstream returned an unexpected media format.');
    }
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    };
    for (const key of ['content-length', 'content-range']) {
      const value = upstream.headers.get(key);
      if (value) headers[key] = value;
    }
    res.writeHead(upstream.status, headers);
    if (req.method === 'HEAD') {
      await upstream.body.cancel();
      return res.end();
    }
    const stream = Readable.fromWeb(upstream.body);
    await new Promise((resolve, reject) => {
      stream.on('error', reject);
      res.on('error', reject);
      stream.on('end', resolve);
      stream.pipe(res);
      controller.signal.addEventListener('abort', () => { stream.destroy(); resolve(); }, { once:true });
    });
  } catch (e) {
    if (!res.headersSent) jsonError(res, 502, e.code || 'audio_unavailable', String(e.message || 'Direct playback failed.').slice(0, 180));
    else res.destroy();
    console.warn('Direct audio:', id, e.code || e.name, String(e.message).slice(0, 140));
  } finally {
    active--;
    if (!res.writableEnded) res.end();
  }
}
function jsonError(res, status, code, message) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ ok:false, error:code, message }));
}
