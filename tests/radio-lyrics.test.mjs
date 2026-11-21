import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle,sameSong,inferStyle,rankRadio,createRadio } from '../server/recommend.mjs';
import { parseLrc } from '../server/lyrics.mjs';

const track=(id,title,artist,duration=230)=>({id,title,artist,duration,provider:'youtube',videoId:id});
test('same recording across music-video, lyrics, reupload and remix titles',()=>{
  const original=track('yt-aaa','Another Love','Tom Odell');
  assert.equal(cleanTitle('Tom Odell - Another Love (Official Music Video)','Tom Odell'),'another love');
  assert.equal(sameSong(original,track('yt-bbb','Another Love (Official Music Video)','Tom Odell')),true);
  assert.equal(sameSong(original,track('yt-ccc','Tom Odell - Another Love [Lyrics]','Tom Odell')),true);
  assert.equal(sameSong(original,track('yt-ddd','Another Love (Acoustic Version)','Tom Odell')),true);
  assert.equal(sameSong(original,track('yt-eee','Just Love Me','Tom Odell')),false);
});
test('radio excludes current and recent duplicate titles while balancing artists',()=>{
  const current=track('yt-current','Another Love','Tom Odell');
  const candidates=[
    track('yt-duplicate','Another Love (Lyrics)','Tom Odell'),
    track('yt-duplicate2','Tom Odell - Another Love (Music Video)','Tom Odell'),
    track('yt-one','Youth','Daughter'),
    track('yt-two','Smother','Daughter'),
    track('yt-three','Holocene','Bon Iver'),
    track('yt-four','Roslyn','Bon Iver'),
    track('yt-five','To Build A Home','The Cinematic Orchestra'),
    track('yt-six','The Night We Met','Lord Huron'),
    track('yt-seven','Anchor','Novo Amor')
  ];
  const results=rankRadio(candidates,{current,limit:6,mode:'balanced',recent:[track('yt-history','Youth [Official]','Daughter')]});
  assert.equal(results.some(t=>sameSong(t,current)),false);
  assert.equal(results.some(t=>t.title==='Youth'),false);
  assert.equal(new Set(results.map(x=>x.artist)).size,results.length);
  assert.ok(results.length>=4);
});
test('radio queries vibe and artist instead of the precise song title',async()=>{
  const searched=[];
  const current=track('yt-now','Another Love','Tom Odell');
  const sample=[
    track('yt-a','Keep the Streets Empty for Me','Fever Ray'),
    track('yt-b','I Found','Amber Run'),
    track('yt-c','Holocene','Bon Iver'),
    track('yt-d','Saturn','Sleeping at Last')
  ];
  const result=await createRadio({
    search:async query=>{searched.push(query);return [current,...sample];},
    current,recent:[{title:'Younger',artist:'Ruel'}],hint:'indie mellow',mode:'discover',limit:4
  });
  assert.equal(searched.length,3);
  assert.ok(searched.every(s=>!s.toLowerCase().includes('another love')));
  assert.ok(result.tracks.length>=3);
  assert.ok(result.tracks.every(x=>!sameSong(x,current)));
  assert.equal(result.strategy,'artist-and-vibe-radio-v1');
  assert.equal(inferStyle({title:'Chill Night'},[]),'chill');
});
test('Enhanced LRC preserves actual per-word timestamps and boundaries',()=>{
  const lines=parseLrc('[00:10.00]<00:10.00>Hello <00:10.40>world\n[00:11.20]Next line');
  assert.equal(lines.length,2);
  assert.equal(lines[0].time,10);
  assert.equal(lines[0].text,'Hello world');
  assert.equal(lines[0].words.length,2);
  assert.equal(lines[0].words[0].start,10);
  assert.equal(lines[0].words[0].end,10.4);
  assert.equal(lines[0].words[1].end,11.2);
  assert.equal(lines[1].words.length,0,'ordinary LRC must not fabricate word timestamps');
});
