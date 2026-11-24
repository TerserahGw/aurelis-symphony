// Aurelis v2.2 experimental native-audio proxy for accessible YouTube.js formats.
// No cookies, DRM bypass, CAPTCHA solving, PoToken forging, or arbitrary URL proxy.
// Status and diagnostics use HTTP 424 (Failed Dependency) to distinguish an
// unavailable upstream format from an origin crash / reverse-proxy HTTP 502.
import { once } from 'node:events';
import { Script } from 'node:vm';
import { Innertube, Platform } from 'youtubei.js';
import { fallbackAudio, parseByteRange } from './ytdl-fallback.mjs';
import { contentDisposition } from './download.mjs';
import { relayOwnedAudio, ownedAudioStatus } from './owned-audio.mjs';

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const FORMAT_TTL = 90_000;
const formatCache = new Map();
const MAX_STREAMS = Math.min(12, Math.max(1, Number(process.env.AURELIS_MAX_STREAMS) || 4));
const STREAM_ENABLED = process.env.AURELIS_DIRECT_AUDIO !== 'false';
const DECIPHER_ENABLED = process.env.AURELIS_STREAM_EVAL === 'true';
let active = 0;
let upstreamCooldownUntil=0;
let clientPromise;
const formatPending = new Map();
const ALTERNATE_ENABLED = process.env.AURELIS_YTDL_FALLBACK !== 'false';
const stats = { ok:0, failed:0, lastError:null, lastAt:null, lastEngine:null, alternativeSuccess:0 };

if (DECIPHER_ENABLED) {
  // YouTube.js requires a JS interpreter for signature deciphering. Execute
  // only the library-generated script in an isolated context with a time limit.
  // Node VM is not a complete security boundary; disable with
  // AURELIS_STREAM_EVAL=false when this risk is unacceptable.
  Platform.shim.eval = async (data) => {
    const body = String(data?.output || '');
    if (body.length > 180_000) throw new Error('Player interpreter script too large');
    const script = new Script('(function(){\n' + body + '\n})()');
    return script.runInNewContext(Object.create(null), { timeout: 850, microtaskMode:'afterEvaluate' });
  };
}
export function allowedMediaHost(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' &&
      (url.hostname === 'googlevideo.com' || url.hostname.endsWith('.googlevideo.com'));
  } catch { return false; }
}
export function validSingleRange(range) {
  return !range || /^bytes=(?:\d+-\d*|-\d+)$/.test(range);
}
function makeError(code, message, detail) {
  const error = new Error(message);
  error.code = code;
  error.detail = detail;
  return error;
}
function redact(error) {
  const msg = String(error?.message || error).slice(0, 150);
  return msg.replace(/https?:\/\/\S+/g, '[upstream-url]');
}
function json(res, status, data) {
  if (res.headersSent) return;
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
async function tube() {
  if (!clientPromise) {
    clientPromise = Innertube.create({ lang:'en', generate_session_locally: true, fetch: (input, init) => {
      const signals = [AbortSignal.timeout(12000), init?.signal, input instanceof Request ? input.signal : null].filter(Boolean);
      return fetch(input,{...init,signal:AbortSignal.any(signals)});
    } })
      .catch(error => { clientPromise = null; throw error; });
  }
  return clientPromise;
}
async function formatFor(id, force = false) {
  const hit = formatCache.get(id);
  if (!force && hit && hit.expires > Date.now()) return hit.url;
  if (formatPending.has(id)) return formatPending.get(id);
  const pending = resolveFormat(id);
  formatPending.set(id,pending);
  try { return await pending; }
  finally { if(formatPending.get(id)===pending) formatPending.delete(id); }
}
async function resolveFormat(id) {
  const yt = await tube();
  let format;
  try {
    format = await yt.getStreamingData(id, { type:'audio', quality:'best', format:'mp4' });
  } catch (first) {
    try {
      format = await yt.getStreamingData(id, { type:'audio', quality:'best', format:'any' });
    } catch (second) {
      throw makeError('format_unavailable',
        'YouTube.js tidak memberikan format audio yang dapat diputar.', redact(second));
    }
  }
  if (!allowedMediaHost(format?.url)) {
    throw makeError('format_unsupported', 'Format audio tidak tersedia sebagai HTTP audio biasa.');
  }
  if (formatCache.size > 60) formatCache.delete(formatCache.keys().next().value);
  formatCache.set(id, { url:format.url, expires:Date.now()+FORMAT_TTL });
  return format.url;
}
async function upstreamFetch(url, range, signal) {
  for (let redirects=0; redirects<3; redirects++) {
    if (!allowedMediaHost(url)) throw makeError('upstream_host_blocked', 'Host sumber audio tidak diizinkan.');
    const headerTimeout = new AbortController();
    const timer = setTimeout(() => headerTimeout.abort(), 12_000);
    let res;
    try {
      res = await fetch(url, {
        headers: {
          ...(range ? {'Range':range} : {}),
          'Accept-Encoding':'identity'
        },
        signal:AbortSignal.any([signal,headerTimeout.signal]),
        redirect:'manual'
      });
    } finally { clearTimeout(timer); }
    if ([301,302,303,307,308].includes(res.status)) {
      const next = res.headers.get('location');
      await res.body?.cancel();
      if (!next) throw makeError('upstream_redirect', 'Redirect sumber audio tidak valid.');
      url = new URL(next,url).href;
      continue;
    }
    return res;
  }
  throw makeError('upstream_redirect_limit', 'Redirect sumber audio terlalu banyak.');
}
// Validate the returned byte interval before committing downstream headers.
export function verifyContentRange(headers, range) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(headers.get('content-range') || '');
  if (!match) throw makeError('range_invalid','Sumber mengembalikan Content-Range yang tidak valid.');
  const [start,end,total] = match.slice(1).map(Number);
  const expected = parseByteRange(range,total);
  if (!expected || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start!==expected.start || end!==expected.end) {
    throw makeError('range_mismatch','Sumber mengembalikan rentang byte yang berbeda dari permintaan.');
  }
  const length = headers.get('content-length');
  if (length!==null && Number(length)!==end-start+1)
    throw makeError('range_mismatch','Sumber mengembalikan panjang audio yang tidak sesuai rentang.');
  return {start,end,total};
}
function inspect(response, range) {
  if (response.status===403 || response.status===410) throw makeError('source_denied','Sumber menolak akses audio (403/410).');
  if (![200,206].includes(response.status) || !response.body) {
    throw makeError('upstream_status','Sumber audio tidak mengembalikan data media.',String(response.status));
  }
  if (range && response.status!==206) {
    throw makeError('range_not_supported','Sumber tidak mengizinkan seek/range audio.');
  }
  if (response.status===206) verifyContentRange(response.headers,range);
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!/^(audio\/(mp4|mpeg|webm|ogg|aac|x-m4a)|video\/(mp4|webm)|application\/octet-stream)$/.test(type)) {
    throw makeError('invalid_content_type','Sumber tidak mengembalikan format media HTML5.',type);
  }
  return type==='application/octet-stream' ? 'audio/mp4' : type;
}
function pathId(path) {
  return /^\/api\/v2\/audio\/(?:yt-)?([a-zA-Z0-9_-]{11})$/.exec(path)?.[1] || '';
}
export function directAudioStatus() {
  return {
    enabled: STREAM_ENABLED, mode:'experimental-native-audio',
    active, maxConcurrent:MAX_STREAMS, ownedAudio:ownedAudioStatus(),
    upstreamCooldownSeconds:Math.max(0,Math.ceil((upstreamCooldownUntil-Date.now())/1000)),
    evaluatorEnabled:DECIPHER_ENABLED,
    evaluator:'node-vm-limited',
    engines:{discovery:'youtubei.js',primary:'youtubei.js',fallback:ALTERNATE_ENABLED?'@distube/ytdl-core':'disabled'},
    lastEngine:stats.lastEngine, alternativeSuccess:stats.alternativeSuccess,
    probe:'GET /api/v2/audio/:id?probe=1',
    successfulResponses:stats.ok,
    failedResponses:stats.failed,
    lastError:stats.lastError,
    lastErrorAt:stats.lastAt,
    notice:'YouTube.js + @distube/ytdl-core menggunakan video yang sama. Pemutaran tetap dapat gagal karena pembatasan jaringan atau YouTube.'
  };
}
export async function relayAudio(req, res, pathname, searchParams = new URLSearchParams()) {
  const id = pathId(pathname);
  if (!VIDEO_ID.test(id)) return json(res,400,{ok:false,code:'invalid_id',message:'ID lagu tidak valid.'});
  if (!validSingleRange(req.headers.range)) return json(res,416,{ok:false,code:'invalid_range',message:'Range audio harus tunggal.'});
  if (active>=MAX_STREAMS) return json(res,429,{ok:false,code:'busy',message:'Sumber audio sedang sibuk, coba lagi.'});
  const probe = searchParams.get('probe')==='1';
  const download = !probe && searchParams.get('download')==='1';
  const downloadTitle = String(searchParams.get('title')||'').slice(0,130);
  const range = probe ? 'bytes=0-16383' : (req.headers.range || 'bytes=0-');
  const abort = new AbortController();
  let disposed = false, reader, started = false, response;
  const onClose = () => { if (!res.writableEnded) { disposed=true; abort.abort(); reader?.cancel().catch(()=>{}); } };
  res.on('close',onClose);
  active++;
  try {
    if(await relayOwnedAudio(req,res,id,searchParams))return;
    if(!STREAM_ENABLED)return json(res,403,{ok:false,code:'disabled',message:'Streaming audio YouTube eksperimental dimatikan.'});
    if(Date.now()<upstreamCooldownUntil){
      res.setHeader('Retry-After',String(Math.ceil((upstreamCooldownUntil-Date.now())/1000)));
      return json(res,503,{ok:false,code:'youtube_cooldown',message:'YouTube recently required bot verification. No authorized audio source is configured for this track.',retryable:true});
    }
    let url = await formatFor(id);
    // Stale signed format URLs are refreshed once. No attestation bypass.
    for (let attempt=0; attempt<2; attempt++) {
      response = await upstreamFetch(url,range,abort.signal);
      if (![403,410].includes(response.status) || attempt===1) break;
      await response.body?.cancel();
      formatCache.delete(id);
      url = await formatFor(id,true);
    }
    const mime = inspect(response,range);
    reader = response.body.getReader();
    // Read first bytes *before* writing HTTP headers. This prevents Cloudflare
    // receiving a 206 with an empty/truncated body if upstream fails immediately.
    let first, firstTimer;
    try {
      first = await Promise.race([
        reader.read(),
        new Promise((_,reject)=>{ firstTimer=setTimeout(()=>reject(makeError('first_byte_timeout','Sumber audio tidak mengirim byte pertama.')),12_000); })
      ]);
    } finally { clearTimeout(firstTimer); }
    if (first.done || !first.value?.byteLength) {
      throw makeError('empty_stream','Sumber audio tidak menghasilkan data.');
    }
    if (probe) {
      await reader.cancel().catch(()=>{});
      stats.ok++; stats.lastEngine='youtubei.js';
      return json(res,200,{ok:true,mode:'experimental-native-audio',mime,rangeSupported:response.status===206,
        firstBytes:first.value.byteLength,codecAvailability:'unverified'});
    }
    const out = {
      'Content-Type': mime,
      'Cache-Control':'no-store',
      'Accept-Ranges':'bytes',
      'X-Content-Type-Options':'nosniff'
    };
    const cr = response.headers.get('content-range');
    const cl = response.headers.get('content-length');
    if (response.status===206 && cr) out['Content-Range']=cr;
    if (cl && /^\d+$/.test(cl)) out['Content-Length']=cl;
    if(download)out['Content-Disposition']=contentDisposition(downloadTitle,id,mime);
    // A full download requested without Range must be a 200 response, not a
    // misleading 206 partial response from the upstream bytes=0- request.
    const clientStatus=!req.headers.range?200:response.status;
    if(clientStatus===200)delete out['Content-Range'];
    if (req.method==='HEAD') { await reader.cancel().catch(()=>{}); res.writeHead(clientStatus,out); return res.end(); }
    res.writeHead(clientStatus,out);
    started = true;
    let bytes = 0;
    let chunk = first.value;
    while (!disposed) {
      if (chunk?.byteLength) {
        bytes+=chunk.byteLength;
        if (!res.write(chunk)) await Promise.race([once(res,'drain'),once(res,'close')]);
      }
      const next = await reader.read();
      if (next.done) break;
      chunk = next.value;
    }
    if (!disposed) {
      if (out['Content-Length'] && bytes!==Number(out['Content-Length'])) {
        throw makeError('truncated_upstream','Transfer audio terhenti sebelum seluruh byte terkirim.');
      }
      stats.ok++;stats.lastEngine='youtubei.js';
      res.end();
    }
  } catch (primaryError) {
    let e=primaryError;
    // Release rejected primary response before the alternative opens another connection.
    if (!started) {
      if (reader) { await reader.cancel().catch(()=>{}); reader=undefined; }
      else if (response?.body) await response.body.cancel().catch(()=>{});
      response=undefined;
    }
    // Fall back only before any HTTP header or bytes were emitted. Both engines
    // use the exact YouTube video ID chosen by the user (no replacement song).
    if (ALTERNATE_ENABLED && !res.headersSent && !disposed && !abort.signal.aborted) {
      try {
        const alternate=await fallbackAudio({id,req,res,range,probe,download,downloadTitle,signal:abort.signal});
        stats.ok++;
        stats.alternativeSuccess++;
        stats.lastEngine='@distube/ytdl-core';
        if (probe && !res.headersSent) {
          return json(res,200,{...alternate,fallbackFrom:primaryError.code||'youtubei_failed'});
        }
        return;
      } catch (fallbackError) {
        e=fallbackError;
        console.warn('[aurelis-audio] youtubei.js and fallback failed',id,
          primaryError.code||'primary_unavailable', fallbackError.code||'fallback_unavailable');
      }
    }
    stats.failed++;
    stats.lastError=e.code || 'audio_error';
    if(stats.lastError==='youtube_bot_challenge')upstreamCooldownUntil=Date.now()+60000;
    stats.lastAt=new Date().toISOString();
    console.warn('[aurelis-audio]',id,stats.lastError,redact(e),e.detail || '');
    if (!res.headersSent) json(res,424,{ok:false,code:stats.lastError,
      message:e?.message?.startsWith('Sumber') || e?.message?.startsWith('YouTube') || e?.message?.startsWith('Alternatif')
        || e?.message?.startsWith('Engine') || e?.message?.startsWith('Modul')
        ? e.message : 'Streaming audio YouTube belum tersedia pada jaringan ini.',
      primaryCode:primaryError.code||'primary_unavailable',
      fallbackCode:e===primaryError?null:(e.code||'fallback_unavailable'),
      enginesTried:ALTERNATE_ENABLED?['youtubei.js','@distube/ytdl-core']:['youtubei.js'],
      retryable:true});
    else { if (!res.destroyed) res.destroy(); }
  } finally {
    active--;
    abort.abort();
    res.off('close',onClose);
    if (!started && reader) await reader.cancel().catch(()=>{});
    if (!started && !reader && response?.body) await response.body.cancel().catch(()=>{});
    if (!res.writableEnded && !res.destroyed) res.end();
  }
}
