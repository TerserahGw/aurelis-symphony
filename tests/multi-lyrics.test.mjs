import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc as parseExtendedLrc,parseYrc,parseKrc,parseRichsync } from '../server/lirik-sync.mjs';
import { adaptMultiResult,providerCapabilities } from '../server/lyrics-multi.mjs';

test('7 real lyric provider adapters are discoverable',()=>{
  const s=providerCapabilities();
  assert.deepEqual(s.map(x=>x.id),['lrclib','netease','qq','kugou','musixmatch','genius','lyricsovh']);
});
test('ordinary line LRC does not gain artificial word timing',()=>{
  const source=parseExtendedLrc('[00:01.00]First line\n[00:03.00]Second line').lines;
  const r=adaptMultiResult({source:'lrclib',track:{title:'Original Song',artist:'Singer'},lines:source});
  assert.equal(r.synced,true);
  assert.equal(r.wordLevel,false);
  assert.ok(r.lines.every(line=>line.words.length===0));
});
test('Enhanced LRC real word timestamps survive normalization',()=>{
  const source=parseExtendedLrc('[00:03.00]<00:03.00>Hi <00:03.50>there').lines;
  const r=adaptMultiResult({source:'lrclib',lines:source});
  assert.equal(r.wordLevel,true);
  assert.equal(r.lines[0].words.length,2);
  assert.equal(r.lines[0].words[0].start,3);
  assert.equal(r.lines[0].words[0].end,3.5);
});
test('NetEase YRC and Kugou KRC preserve real timing',()=>{
  const yrc=adaptMultiResult({source:'netease',lines:parseYrc('[1000,1500](1000,300,0)Hello (1300,800,0)world')});
  const krc=adaptMultiResult({source:'kugou',lines:parseKrc('[1000,1500]<0,300,0>Hello <300,700,0>world')});
  assert.equal(yrc.wordLevel,true);
  assert.equal(krc.wordLevel,true);
  assert.equal(yrc.lines[0].words[1].start,1.3);
  assert.equal(krc.lines[0].words[1].end,2);
});
test('Musixmatch Richsync does not fabricate missing words',()=>{
  const rich=adaptMultiResult({source:'musixmatch',lines:parseRichsync([{ts:1,te:2.2,x:[{c:'Hello ',o:0},{c:'world',o:.4}]}])});
  assert.equal(rich.wordLevel,true);
  assert.equal(rich.lines[0].words[1].start,1.4);
  const bad=adaptMultiResult({source:'demo',lines:[{time:1,text:'line-only',words:[{text:'fake',start:1,end:null}]}]});
  assert.equal(bad.wordLevel,false);
  assert.deepEqual(bad.lines[0].words,[]);
});
