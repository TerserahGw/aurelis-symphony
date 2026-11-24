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

test('modern YouTube.js 18.3 LockupView playlist: all 39 tracks in order',async()=>{
  const lockup=(i)=>({
    content_type:'VIDEO',content_id:'DCYmJDO2_IE',
    metadata:{title:{text:'Song '+i},metadata:{metadata_rows:[
      {metadata_parts:[{text:{text:'Artist '+i,endpoint:{payload:{browseId:'UC123456789'}}}}]},
      {metadata_parts:[{text:{text:'1M views'}}]}
    ]}},
    content_image:{image:[{url:'https://i.ytimg.com/vi/DCYmJDO2_IE/hqdefault.jpg'}]},
    duration:{text:'3:25',seconds:205}
  });
  const entries=Array.from({length:39},(_,i)=>lockup(i+1));
  const yt={getPlaylist:async()=>({info:{title:'Lagu 1',total_items:'39 videos'},items:entries,has_continuation:false})};
  const r=await collectPlaylist(yt,id);
  assert.equal(r.count,39);assert.equal(r.skipped,0);assert.equal(r.truncated,false);
  assert.equal(r.tracks[0].videoId,'DCYmJDO2_IE');
  assert.equal(r.tracks[0].artist,'Artist 1');assert.equal(r.tracks[0].duration,205);
  assert.equal(r.tracks[38].title,'Song 39');assert.equal(r.tracks[38].position,39);
  assert.equal(r.tracks[0].artwork,'https://i.ytimg.com/vi/DCYmJDO2_IE/hqdefault.jpg');
});
test('shorts and unsupported items are handled explicitly',async()=>{
  const short={on_tap_endpoint:{payload:{videoId:'DCYmJDO2_IE'}},overlay_metadata:{primary_text:{text:'Short video'}},thumbnail:[{url:'https://i.ytimg.com/vi/DCYmJDO2_IE/default.jpg'}]};
  const yt={getPlaylist:async()=>({info:{title:'Mixed'},items:[short,{content_type:'PLAYLIST',content_id:'DCYmJDO2_IE',metadata:{title:{text:'Not a song'}}},{...video,is_playable:false}],has_continuation:false})};
  const r=await collectPlaylist(yt,id);
  assert.equal(r.count,1);assert.equal(r.tracks[0].title,'Short video');
  assert.deepEqual(r.skippedReasons,{unavailable:1,unrecognized:1});
});
test('unknown nonempty playlist does not return misleading success',async()=>{
  const yt={getPlaylist:async()=>({info:{title:'Unknown'},items:[{type:'Unknown'}],has_continuation:false})};
  await assert.rejects(collectPlaylist(yt,id),/could not recognize/);
});
