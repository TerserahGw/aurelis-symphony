// Direct, administrator-provisioned audio only. No arbitrary URL input.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {parseByteRange} from './ytdl-fallback.mjs';
import {contentDisposition} from './download.mjs';
const types={'.m4a':'audio/mp4','.mp3':'audio/mpeg','.ogg':'audio/ogg','.webm':'audio/webm','.flac':'audio/flac','.aac':'audio/aac'};
const idPattern=/^[A-Za-z0-9_-]{11}$/;
const root=process.env.AURELIS_AUDIO_DIR || '';
const rawOrigin=process.env.AURELIS_AUDIO_ORIGIN || '';
const token=process.env.AURELIS_AUDIO_ORIGIN_TOKEN || '';
function originBase(value){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)return null;
    u.pathname=u.pathname.replace(/\/?$/,'/');return u;
  }catch{return null;}
}
const origin=originBase(rawOrigin);
export function ownedAudioStatus(){return {localConfigured:!!root,originConfigured:!!origin,originInvalid:!!rawOrigin&&!origin};}
function json(res,status,body,head=false){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(head?undefined:JSON.stringify(body));}
function mimeType(raw){const value=(raw||'').split(';')[0].trim().toLowerCase();return Object.values(types).includes(value)?value:null;}
async function localFile(id,folder){
  if(!folder)return null;
  const base=await fs.realpath(folder).catch(()=>null);if(!base)return null;
  for(const [ext,mime] of Object.entries(types)){
    const file=await fs.realpath(path.join(base,id+ext)).catch(()=>null);
    if(!file||!file.startsWith(base+path.sep))continue;
    const stat=await fs.stat(file).catch(()=>null);
    if(stat?.isFile()&&stat.size>0)return {file,mime,size:stat.size};
  }
  return null;
}
export async function relayOwnedAudio(req,res,id,q,{folder=root,base=origin,secret=token,fetcher=fetch}={}){
  if(!idPattern.test(id))return false;
  const head=req.method==='HEAD', probe=q.get('probe')==='1', download=q.get('download')==='1'&&!probe;
  const range=probe?'bytes=0-16383':req.headers.range;
  const file=await localFile(id,folder);
  if(file){
    const r=parseByteRange(range,file.size);
    if(!r){res.writeHead(416,{'Content-Range':'bytes */'+file.size});res.end();return true;}
    if(probe){json(res,200,{ok:true,engine:'owned-file',mime:file.mime,firstBytes:r.end-r.start+1,rangeSupported:true},head);return true;}
    const headers={'Content-Type':file.mime,'Content-Length':r.end-r.start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(r.status===206)headers['Content-Range']='bytes '+r.start+'-'+r.end+'/'+r.total;
    if(download)headers['Content-Disposition']=contentDisposition(q.get('title')||id,id,file.mime);
    res.writeHead(r.status,headers);
    if(head){res.end();return true;}
    try{await pipeline(createReadStream(file.file,{start:r.start,end:r.end}),res);}catch{if(!res.destroyed)res.destroy();}
    return true;
  }
  if(!base)return false;
  const abort=new AbortController();const close=()=>abort.abort();res.once('close',close);
  let upstream,reader;
  let timer=setTimeout(()=>abort.abort(),15000);
  try{
    // A trusted fixed origin implements GET /<videoId> with exact audio bytes.
    const url=new URL(id,base);
    upstream=await fetcher(url,{method:'GET',redirect:'error',signal:abort.signal,
      headers:{...(range?{Range:range}:{}),...(secret?{Authorization:'Bearer '+secret}:{}),'Accept-Encoding':'identity'}});
    if(upstream.status===404)return false;
    if(![200,206].includes(upstream.status)||!upstream.body)throw Error('origin status '+upstream.status);
    const mime=mimeType(upstream.headers.get('content-type'));
    if(!mime)throw Error('origin did not return supported audio');
    let length=upstream.headers.get('content-length'), cr=upstream.headers.get('content-range');
    if(range){
      const m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr||'');
      if(upstream.status!==206||!m)throw Error('origin did not return a valid byte range');
      const r=parseByteRange(range,Number(m[3]));
      if(!r||r.start!==Number(m[1])||r.end!==Number(m[2])||(length!==null&&Number(length)!==r.end-r.start+1))throw Error('origin byte range mismatch');
      length=String(r.end-r.start+1);
    }else if(upstream.status!==200)throw Error('unexpected partial origin response');
    reader=upstream.body.getReader();
    const first=await reader.read();
    clearTimeout(timer);
    if(first.done||!first.value?.byteLength)throw Error('empty audio');
    if(probe){json(res,200,{ok:true,engine:'owned-origin',mime,firstBytes:first.value.byteLength,rangeSupported:true},head);return true;}
    const headers={'Content-Type':mime,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(length!==null&&/^\d+$/.test(length))headers['Content-Length']=length;
    if(range)headers['Content-Range']=cr;
    if(download)headers['Content-Disposition']=contentDisposition(q.get('title')||id,id,mime);
    res.writeHead(upstream.status,headers);
    if(head){res.end();return true;}
    await pipeline(Readable.from((async function*(){yield first.value;for(;;){const n=await reader.read();if(n.done)break;yield n.value;}})()),res);
    return true;
  }catch(e){
    if(!res.headersSent&&!res.destroyed)json(res,502,{ok:false,code:'owned_origin_failed',message:'Configured media origin could not deliver valid audio.'},head);
    else if(!res.destroyed)res.destroy();
    return true;
  }finally{
    clearTimeout(timer);res.off('close',close);abort.abort();
    if(reader)await reader.cancel().catch(()=>{});
    else if(upstream?.body)await upstream.body.cancel().catch(()=>{});
  }
}
