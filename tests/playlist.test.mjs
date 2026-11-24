import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlaylistId,collectPlaylist} from '../server/youtube.mjs';
const id='PLEBFqiHTFkcY_ZCW2Sro17E5b_TCFIbZ3';
const video={id:'MwpMEbgC7DA',title:{text:'Another Love'},author:{name:'Tom Odell'},duration:{seconds:248},thumbnails:[{url:'https://i.ytimg.com/vi/MwpMEbgC7DA/default.jpg'}],is_playable:true};
test('playlist URL whitelist',()=>{
  for(const host of ['youtube.com','music.youtube.com','www.youtube.com']) assert.equal(parsePlaylistId('https://'+host+'/playlist?list='+id),id);
  assert.equal(parsePlaylistId('https://youtube.com/watch?v=MwpMEbgC7DA&list='+id),id);
  for(const url of ['https://evil.example/playlist?list='+id,'https://youtube.com.evil.example/playlist?list='+id,'http://youtube.com/playlist?list='+id,'https://youtube.com/playlist?list=RD1234567890','https://youtube.com/playlist']) assert.equal(parsePlaylistId(url),null);
});
test('continuations retain order and duplicate tracks, skip unavailable',async()=>{
  const yt={getPlaylist:async()=>({info:{title:'Demo',author:{name:'Owner'}},items:[video,{...video,is_playable:false}],has_continuation:true,getContinuation:async()=>({items:[video],has_continuation:false})})};
  const r=await collectPlaylist(yt,id);
  assert.equal(r.playlist.title,'Demo');
  assert.equal(r.count,2);assert.equal(r.scanned,3);assert.equal(r.skipped,1);assert.equal(r.truncated,false);
  assert.deepEqual(r.tracks.map(t=>t.position),[1,3]);
  assert.deepEqual(r.tracks.map(t=>t.id),['yt-MwpMEbgC7DA','yt-MwpMEbgC7DA']);
  assert.equal(r.tracks[0].duration,248);
  assert.equal(r.tracks[0].streamUrl,'/api/v2/audio/MwpMEbgC7DA');
  const limited=await collectPlaylist(yt,id,1);
  assert.equal(limited.count,1);assert.equal(limited.truncated,true);
});
test('failed continuation is not reported as complete',async()=>{
  const yt={getPlaylist:async()=>({info:{title:'Demo'},items:[video],has_continuation:true,getContinuation:async()=>{throw Error('blocked')}})};
  await assert.rejects(collectPlaylist(yt,id),/blocked/);
});
