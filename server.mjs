import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { searchMusic, lookupYouTube, getSearchStatus } from './server/youtube.mjs';
import { createRadio } from './server/recommend.mjs';
import { findLyrics, allLyrics, lyricsToLrc, LYRIC_SOURCES } from './server/lyrics.mjs';
import { relayAudio, directAudioStatus } from './server/stream.mjs';
import { translateLyrics } from './server/translation.mjs';

const APP_VERSION = '2.4.0';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(ROOT, 'src/main/resources/web');
const DATA = path.resolve(process.env.AURELIS_DATA_DIR || path.join(ROOT, 'data'));
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8080);
const cloudLibrary = process.env.AURELIS_CLOUD_LIBRARY === 'true';
const CORS = process.env.AURELIS_CORS_ORIGIN || '';
const catalog = JSON.parse(await fsp.readFile(path.join(WEB, 'catalog.json'), 'utf8'));
const buckets = new Map();
const limits = { max: 45, spanMs: 60_000 };

function response(res, status, body, head = false, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(head ? undefined : data);
}
function apiError(res, status, error, message, head = false) {
  response(res, status, { error, message }, head);
}
function bounded(value, fallback, max) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : fallback;
}
function capped(value, max = 180) { return String(value || '').slice(0, max).trim(); }
function rateLimited(req) {
  const addr = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (buckets.size > 8000) buckets.clear();
  let entry = buckets.get(addr);
  if (!entry || now - entry.started > limits.spanMs) entry = { started: now, count: 0 };
  entry.count++;
  buckets.set(addr, entry);
  return entry.count > limits.max;
}
async function readJson(req, limit = 100_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) { const e = new Error('Payload too large'); e.status = 413; throw e; }
    chunks.push(chunk);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const e = new Error('Expected a JSON object'); e.status = 400; throw e;
  }
  return data;
}
async function libraryApi(req, res, head) {
  if (!cloudLibrary) return apiError(res, 403, 'cloud_library_disabled', 'Library stays in your browser unless enabled.', head);
  const match = /^Bearer ([a-fA-F0-9]{64})$/.exec(req.headers.authorization || '');
  if (!match) return apiError(res, 401, 'library_token_required', 'Bearer token is required.', head);
  const id = crypto.createHash('sha256').update(match[1]).digest('hex');
  const folder = path.join(DATA, 'libraries');
  const target = path.join(folder, id + '.json');
  if (req.method === 'GET' || req.method === 'HEAD') {
    try { return response(res, 200, JSON.parse(await fsp.readFile(target, 'utf8')), head); }
    catch (e) { if (e.code === 'ENOENT') return response(res, 200, { favorites: [], playlists: [] }, head); throw e; }
  }
  if (req.method !== 'PUT') return apiError(res, 405, 'method_not_allowed', 'Use GET or PUT.', head);
  let input;
  try { input = await readJson(req); }
  catch (e) { if (e instanceof SyntaxError) e.status = 400; throw e; }
  await fsp.mkdir(folder, { recursive: true });
  const tmp = path.join(folder, id + '.' + crypto.randomBytes(5).toString('hex') + '.tmp');
  try { await fsp.writeFile(tmp, JSON.stringify(input), { mode: 0o600 }); await fsp.rename(tmp, target); }
  finally { await fsp.rm(tmp, { force: true }).catch(() => {}); }
  response(res, 200, { ok: true }, head);
}
function contextFromQuery(q,name,max=10) {
  const raw=q.get(name)||'';
  if (!raw||raw.length>2800)return [];
  try {
    const rows=JSON.parse(raw);
    if (!Array.isArray(rows))return [];
    return rows.slice(0,max).filter(row=>row&&typeof row==='object')
      .map(row=>({id:String(row.id||'').slice(0,40),
        title:String(row.title||'').slice(0,150),artist:String(row.artist||'').slice(0,100)}));
  }catch{return [];}
}
async function api(req, res, url, head) {
  const endpoint = url.pathname;
  const q = url.searchParams;
  const query = capped(q.get('q') || q.get('query'), 160);
  const track = capped(q.get('track') || query);
  const artist = capped(q.get('artist'));
  const duration = bounded(q.get('duration'), 0, 7200);

  if (endpoint === '/api/v1/health' || endpoint === '/health') {
    return response(res, 200, { ok: true, service: 'Aurelis Symphony', version: APP_VERSION, runtime: 'node', discovery: 'youtubei.js', playback: 'experimental-native-audio-and-licensed-audio', time: new Date().toISOString() }, head);
  }
  if (endpoint === '/api/v1/config') return response(res, 200, {
    name: 'Aurelis Symphony', version: APP_VERSION, cloudLibrary,
    searchProviders: ['youtube', 'catalog'], lyricsSources: LYRIC_SOURCES,
    discovery: getSearchStatus(), player: 'HTML5 Audio (no embed)', directAudio: directAudioStatus(), translation: {provider:'MyMemory',target:'id',optIn:true}
  }, head);
  if (endpoint.startsWith('/api/v2/audio/')) return relayAudio(req, res, endpoint, q);
  if (endpoint === '/api/v2/translate') {
    if (req.method !== 'POST') return apiError(res,405,'method_not_allowed','Use POST.',head);
    if (rateLimited(req)) return apiError(res,429,'rate_limited','Terlalu banyak permintaan terjemahan.',head);
    let input;
    try { input=await readJson(req,12_000); }
    catch(e){ e.status=400; throw e; }
    const output=await translateLyrics(input);
    return response(res,output.ok ? 200 : (output.code ? 400 : 503),output,head);
  }
  if (endpoint === '/api/v2/status') return response(res, 200, { ok: true, version: APP_VERSION, stream: directAudioStatus() }, head);
  if (endpoint === '/api/v2/home') {
    if (rateLimited(req)) return apiError(res,429,'rate_limited','Too many recommendation requests.',head);
    const recent=contextFromQuery(q,'recent',8);
    const hint=capped(q.get('mood')||q.get('seed'),65);
    const mode=['balanced','familiar','discover'].includes(q.get('mode'))?q.get('mode'):'balanced';
    const current=recent[0]||{title:'',artist:'',album:hint};
    try {
      const data=await createRadio({search:searchMusic,current,recent:recent.slice(1),
        hint:hint||'indie pop chill',mode,limit:18});
      if(data.tracks.length)return response(res,200,{title:'Dibuat untuk suasanamu',...data},head);
      return response(res,200,{title:'Aurelis Originals',tracks:catalog,fallback:true},head);
    }catch(e){console.warn('Home radio unavailable:',e.message);
      return response(res,200,{title:'Aurelis Originals',tracks:catalog,fallback:true},head);}
  }
  if (endpoint === '/api/tracks' || endpoint === '/api/v1/catalog') {
    const filtered = catalog.filter(t => !query || (t.title + ' ' + t.artist).toLowerCase().includes(query.toLowerCase()));
    return response(res, 200, { tracks: filtered.slice(0, bounded(q.get('limit'), 40, 100)), total: filtered.length }, head);
  }
  if (endpoint.startsWith('/api/v1/tracks/')) {
    const id = endpoint.slice('/api/v1/tracks/'.length);
    const hit = catalog.find(t => t.id === id);
    return hit ? response(res, 200, { track: hit }, head) : apiError(res, 404, 'not_found', 'Track not found.', head);
  }
  if (endpoint === '/api/v1/search' || endpoint === '/api/v1/recommendations') {
    const isRec = endpoint.endsWith('recommendations');
    const provider = q.get('provider') || 'youtube';
    if (!isRec && provider === 'catalog') {
      return api(req, res, new URL('/api/v1/catalog?q=' + encodeURIComponent(query), 'http://localhost'), head);
    }
    if (provider !== 'youtube') return apiError(res, 400, 'invalid_provider', 'Only youtube or catalog are supported.', head);
    if (rateLimited(req)) return apiError(res, 429, 'rate_limited', 'Too many search requests.', head);
    const term = isRec ? capped([artist, track].filter(Boolean).join(' '), 160) : query;
    if (!term) return apiError(res, 400, 'query_required', 'Provide q or track / artist.', head);
    try {
      const limit=bounded(q.get('limit'),20,30)||20;
      if (isRec) {
        const current={id:capped(q.get('exclude'),40),title:track,artist,
          album:capped(q.get('album'),100)};
        const recent=contextFromQuery(q,'recent',10), queued=contextFromQuery(q,'queued',10);
        const hint=capped(q.get('mood'),65);
        const mode=['balanced','familiar','discover'].includes(q.get('mode'))?q.get('mode'):'balanced';
        const radio=await createRadio({search:searchMusic,current,recent,queued,hint,mode,limit});
        return response(res,200,{provider:'youtube',...radio,
          notice:'Metadata-informed radio, not waveform/audio-embedding analysis. Actual audio can be unavailable.'},head);
      }
      const tracks=await searchMusic(term,limit);
      return response(res,200,{provider:'youtube',tracks,
        notice:'YouTube-only metadata. Audio playback uses two experimental engines.'},head);
    } catch (e) {
      console.warn('Discovery failed:', e.message);
      return response(res, 503, { error: 'search_unavailable', message: 'The music discovery service is temporarily unavailable.', tracks: [] }, head);
    }
  }
  if (endpoint === '/api/v1/info') {
    const urlValue = capped(q.get('url'), 500);
    const item = lookupYouTube(urlValue);
    if (!item) return apiError(res, 400, 'unsupported_url', 'Only recognized HTTPS YouTube URLs are supported.', head);
    return response(res, 200, { track: { ...item, audio: [], playback: { mode: 'experimental-direct-audio', provider: 'youtubei.js', url: '/api/v2/audio/' + item.videoId } } }, head);
  }
  if (endpoint === '/api/v1/lyrics/sources') return response(res, 200, { sources: LYRIC_SOURCES }, head);
  if (endpoint === '/api/v1/lyrics' || endpoint === '/api/v1/lyrics/all' || endpoint === '/api/v1/lyrics/lrc') {
    if (rateLimited(req)) return apiError(res, 429, 'rate_limited', 'Too many lyrics requests.', head);
    const source = capped(q.get('source'), 30);
    if (source && !LYRIC_SOURCES.some(s => s.id === source)) return apiError(res, 400, 'unknown_source', 'Unknown lyric source.', head);
    if (!track) return apiError(res, 400, 'track_required', 'Track name required.', head);
    if (endpoint.endsWith('/all')) return response(res, 200, { results: await allLyrics(track, artist, duration) }, head);
    const payload = await findLyrics(track, artist, duration, source);
    if (endpoint.endsWith('/lrc')) {
      if (!payload.result) return apiError(res, 404, 'lyrics_not_found', 'No lyrics found.', head);
      return response(res, 200, lyricsToLrc(payload.result), head, 'text/plain; charset=utf-8');
    }
    return response(res, 200, payload, head);
  }
  if (endpoint === '/api/v1/library') return libraryApi(req, res, head);
  if (endpoint === '/api/v1/openapi.json') {
    return serveStatic(req, res, '/openapi.json', head);
  }
  return apiError(res, 404, 'not_found', 'Unknown API route.', head);
}
const MIMES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.png': 'image/png', '.ico': 'image/x-icon' };
async function serveStatic(req, res, requestPath, head) {
  let pathname;
  try { pathname = decodeURIComponent(requestPath); } catch { return apiError(res, 400, 'bad_path', 'Invalid URL encoding.', head); }
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/docs/api' || pathname === '/docs/api/') pathname = '/docs/api.html';
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p => p === '..' || p.startsWith('.')))
    return apiError(res, 404, 'not_found', 'File not found.', head);
  const file = path.resolve(WEB, '.' + pathname);
  if (!file.startsWith(WEB + path.sep)) return apiError(res, 404, 'not_found', 'File not found.', head);
  let stat;
  try { stat = await fsp.stat(file); } catch { return apiError(res, 404, 'not_found', 'File not found.', head); }
  if (!stat.isFile()) return apiError(res, 404, 'not_found', 'File not found.', head);
  let start = 0, end = stat.size - 1, status = 200;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }); return res.end(); }
    if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, stat.size - suffix); }
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (start < 0 || start >= stat.size || end < start) { res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }); return res.end(); }
    status = 206;
  }
  const headers = { 'Content-Type': MIMES[path.extname(file)] || 'application/octet-stream',
    'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=300' : 'no-cache' };
  if (status === 206) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
  res.writeHead(status, headers);
  if (head) return res.end();
  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
const server = http.createServer(async (req, res) => {
  const head = req.method === 'HEAD';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; media-src 'self' blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'");
  if (CORS) { res.setHeader('Access-Control-Allow-Origin', CORS); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS'); }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return apiError(res, 400, 'bad_url', 'Invalid URL.', head); }
  const isApi = url.pathname.startsWith('/api/') || url.pathname === '/health';
  if (isApi && !['GET', 'HEAD'].includes(req.method) && !(url.pathname === '/api/v1/library' && req.method === 'PUT') && !(url.pathname === '/api/v2/translate' && req.method === 'POST'))
    return apiError(res, 405, 'method_not_allowed', 'Unsupported method.', head);
  if (!isApi && !['GET', 'HEAD'].includes(req.method)) return apiError(res, 405, 'method_not_allowed', 'Unsupported method.', head);
  try {
    if (isApi) await api(req, res, url, head);
    else await serveStatic(req, res, url.pathname, head);
  } catch (e) {
    console.error('Request failed:', url.pathname, e.message);
    if (!res.headersSent) apiError(res, e.status || 500, e.status === 413 ? 'payload_too_large' : 'internal_error', e.status ? e.message : 'Server error.', head);
    else res.destroy();
  }
});
server.listen(PORT, HOST, () => console.log('Aurelis Symphony ' + APP_VERSION + ' listening at http://' + HOST + ':' + PORT));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
