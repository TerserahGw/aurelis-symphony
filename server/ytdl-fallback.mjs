// Optional second engine for the same YouTube video selected by youtubei.js.
// Uses @distube/ytdl-core 5.x. No other catalog, no auth cookies, no DRM bypass.
// The module is imported lazily because its player discovery can be CPU-intensive.
import { once } from 'node:events';
import { contentDisposition } from './download.mjs';

let enginePromise;
let engine;
export function parseByteRange(raw, length) {
  const total = Number(length);
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  if (!raw) return { start:0, end:total-1, total, status:200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(raw);
  if (!match) return null;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start=Math.max(0,total-suffix); end=total-1;
  } else {
    start=Number(match[1]); end=match[2] ? Number(match[2]) : total-1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>=total || end<start) return null;
  end=Math.min(total-1,end);
  return {start,end,total,status:206};
}
function upstreamError(code, message, detail) {
  const err = new Error(message); err.code=code;err.detail=detail;return err;
}
async function getEngine() {
  if(!enginePromise) {
    enginePromise=import('@distube/ytdl-core').then(mod=>{
      engine={client:new mod.Ytdl({lang:'en',timeoutMs:18_000}), Quality:mod.Quality};
      return engine;
    }).catch(e=>{enginePromise=null;throw e;});
  }
  return enginePromise;
}
export async function fallbackAudio({id,req,res,range,probe,download=false,downloadTitle='',signal}) {
  const {client,Quality}=await getEngine();
  let info;
  try {
    // Same watch ID, preserving the song chosen from YouTube.js search.
    info=await client.getInfo('https://www.youtube.com/watch?v='+id,{signal});
  } catch(e) {
    const detail=String(e?.message||e).slice(0,140);
    if (/confirm you.?re not a bot|sign.?in.*bot|LOGIN_REQUIRED|SignInConfirmNotBot/i.test(detail)) {
      throw upstreamError('youtube_bot_challenge',
        'YouTube meminta verifikasi anti-bot dari IP server. Audio tidak tersedia tanpa sesi yang diizinkan.',detail);
    }
    throw upstreamError('alternate_lookup_failed','Modul alternatif tidak mendapatkan informasi audio YouTube.',detail);
  }
  const formats=(info?.formats || []).filter(f => f?.hasAudio===true && f?.hasVideo===false
    && !f.isDrm && !f.isLive && !f.isOtf && ['mp4','webm'].includes(f.container));
  if(!formats.length)throw upstreamError('alternate_no_audio','Tidak ada format audio-only yang dapat digunakan dari video ini.');
  // Prefer browser-compatible M4A with known byte length; allow WebM/Opus,
  // then adaptive SABR formats as a last resort (non-seekable).
  formats.sort((a,b)=>{
    const score=x => (x.url?4:0)+(x.contentLength>0?3:0)+(x.container==='mp4'?2:0)
      + Math.min(1,(Number(x.audioBitrate)||0)/256);
    return score(b)-score(a);
  });
  const format=formats[0];
  const length=Number(format.contentLength);
  const knownLength=Number.isSafeInteger(length)&&length>0;
  // SABR-only formats cannot currently seek by raw byte range.
  let rangeInfo=knownLength&&format.url ? parseByteRange(range,length) : null;
  if(range && !rangeInfo && !/^bytes=0-$/.test(range) && !probe) {
    throw upstreamError('alternate_seek_unavailable','Sumber alternatif tidak menyediakan byte-range untuk seek.');
  }
  const mime=(format.container==='mp4'?'audio/mp4':'audio/webm');
  const controller=new AbortController();
  const onAbort=()=>controller.abort();
  if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',onAbort,{once:true});
  let stream;
  try {
    const requested=rangeInfo ? {start:rangeInfo.start,end:rangeInfo.end}
      : probe&&knownLength&&format.url ? {start:0,end:Math.min(length-1,16383)} : undefined;
    stream=client.download(info, {
      format, quality:Quality.HighestAudio,
      ...(requested?{range:requested}:{}),
      signal:controller.signal, chunkSize:384*1024, highWaterMark:64*1024
    });
    const iterator=stream[Symbol.asyncIterator]();
    let firstTimer, first;
    try {
      first=await Promise.race([
        iterator.next(),
        new Promise((_,reject)=>{firstTimer=setTimeout(()=>reject(upstreamError('alternate_timeout','Alternatif tidak mengirimkan audio tepat waktu.')),18_000);})
      ]);
    } finally {clearTimeout(firstTimer);}
    if(first.done || !first.value?.length) {
      throw upstreamError('alternate_empty','Alternatif tidak menghasilkan byte audio.');
    }
    if(probe) {
      stream.destroy();
      return {ok:true,engine:'@distube/ytdl-core',mime,firstBytes:first.value.length,
        rangeSupported:!!rangeInfo,format:format.container,codecAvailability:'unverified'};
    }
    if(req.method==='HEAD'){
      stream.destroy();
      const h={'Content-Type':mime,'Cache-Control':'no-store','Accept-Ranges':knownLength&&format.url?'bytes':'none'};
      if(download)h['Content-Disposition']=contentDisposition(downloadTitle,id,mime);
      if(rangeInfo){
        h['Content-Range']='bytes '+rangeInfo.start+'-'+rangeInfo.end+'/'+length;
        h['Content-Length']=String(rangeInfo.end-rangeInfo.start+1);
      }else if(knownLength)h['Content-Length']=String(length);
      const headStatus=download&&!req.headers.range?200:(rangeInfo?206:200);
      if(headStatus===200)delete h['Content-Range'];
      res.writeHead(headStatus,h);res.end();return {ok:true,engine:'@distube/ytdl-core'};
    }
    const headers={
      'Content-Type':mime,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Accept-Ranges':knownLength&&format.url?'bytes':'none'
    };
    if(download)headers['Content-Disposition']=contentDisposition(downloadTitle,id,mime);
    if(rangeInfo){
      headers['Content-Range']='bytes '+rangeInfo.start+'-'+rangeInfo.end+'/'+length;
      headers['Content-Length']=String(rangeInfo.end-rangeInfo.start+1);
    }else if(knownLength){
      headers['Content-Length']=String(length);
    }
    const clientStatus=download&&!req.headers.range?200:(rangeInfo?206:200);
    if(clientStatus===200)delete headers['Content-Range'];
    res.writeHead(clientStatus,headers);
    let count=0;
    async function writeChunk(chunk) {
      if (!chunk?.length||res.destroyed)return;
      count+=chunk.length;
      if(!res.write(chunk)) await Promise.race([once(res,'drain'),once(res,'close')]);
    }
    await writeChunk(first.value);
    for await(const chunk of iterator){
      if(res.destroyed||signal?.aborted)break;
      await writeChunk(chunk);
    }
    if(!res.destroyed && !signal?.aborted) {
      if(headers['Content-Length'] && count!==Number(headers['Content-Length']))
        throw upstreamError('alternate_truncated','Audio alternatif terputus sebelum selesai.');
      res.end();
    }
    return {ok:true,engine:'@distube/ytdl-core',bytes:count};
  } catch(e) {
    if(!res.headersSent && e.code)throw e;
    if(res.headersSent)res.destroy();
    throw upstreamError(e.code||'alternate_failed',
      'Engine alternatif gagal mendapatkan audio video ini.',String(e?.message||e).slice(0,120));
  } finally {
    signal?.removeEventListener('abort',onAbort);
    if(stream && !stream.destroyed)stream.destroy();
  }
}
