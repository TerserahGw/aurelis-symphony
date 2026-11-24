import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {relayOwnedAudio} from '../server/owned-audio.mjs';
const id='DCYmJDO2_IE';
test('owned audio sends real bytes and correct range; misses do not impersonate another track',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'aurelis-audio-'));
  const bytes=Buffer.from('ID3abcdefghijklmnopqrstuvwxyz');
  await writeFile(path.join(dir,id+'.mp3'),bytes);
  const srv=http.createServer(async(req,res)=>{
    const u=new URL(req.url,'http://localhost');
    if(!await relayOwnedAudio(req,res,u.pathname.slice(1),u.searchParams,{folder:dir,base:null})){res.writeHead(404);res.end();}
  });
  srv.listen(0,'127.0.0.1');await once(srv,'listening');
  const url='http://127.0.0.1:'+srv.address().port+'/'+id;
  try{
    const full=await fetch(url);assert.equal(full.status,200);assert.deepEqual(Buffer.from(await full.arrayBuffer()),bytes);
    const range=await fetch(url,{headers:{Range:'bytes=0-2'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),'bytes 0-2/'+bytes.length);assert.equal(await range.text(),'ID3');
    const probe=await (await fetch(url+'?probe=1')).json();assert.equal(probe.engine,'owned-file');assert.equal(probe.ok,true);
    assert.equal((await fetch(url,{headers:{Range:'bytes=999-'}})).status,416);
    assert.equal((await fetch(url.replace(id,'MwpMEbgC7DA'))).status,404);
  }finally{srv.closeAllConnections();await new Promise(r=>srv.close(r));await rm(dir,{recursive:true,force:true});}
});
test('fixed origin supports genuine ranged bytes and refuses non-audio',async()=>{
  const fetcher=async(url,opts)=>{
    assert.equal(url.href,'https://media.example/audio/'+id);assert.equal(opts.headers.Authorization,'Bearer private');assert.equal(opts.redirect,'error');
    return new Response('ID3',{status:206,headers:{'content-type':'audio/mpeg','content-range':'bytes 0-2/3','content-length':'3'}});
  };
  const srv=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');await relayOwnedAudio(req,res,id,u.searchParams,{folder:'',base:new URL('https://media.example/audio/'),secret:'private',fetcher});});
  srv.listen(0,'127.0.0.1');await once(srv,'listening');
  try{const r=await fetch('http://127.0.0.1:'+srv.address().port+'/?probe=1');assert.equal(r.status,200);assert.equal((await r.json()).engine,'owned-origin');}
  finally{srv.closeAllConnections();await new Promise(r=>srv.close(r));}
});
