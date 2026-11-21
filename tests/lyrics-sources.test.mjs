import test from 'node:test';
import assert from 'node:assert/strict';
import {LYRIC_SOURCES,normalizeLyrics,parseLrc,lyricsToLrc} from '../server/lyrics.mjs';
import {parseYrc,parseLrcFile} from '../server/vendor/lirik-sync.mjs';

test('seven user-provided lyric providers are registered',()=>{
  assert.deepEqual(new Set(LYRIC_SOURCES.map(s=>s.id)),
    new Set(['lrclib','netease','qq','kugou','musixmatch','genius','lyricsovh']));
  assert.equal(LYRIC_SOURCES.filter(s=>s.wordLevel).length,5);
});
test('line-only timestamps never create word timings',()=>{
  const lines=parseLrc('[00:01.20]Just a normal line\n[00:04.25]Another line');
  assert.equal(lines.length,2);
  assert.ok(lines.every(line=>!line.words?.length));
  const normalized=normalizeLyrics({source:'lrclib',track:{title:'Love Story',artist:'Taylor Swift'},
    lines},{title:'Love Story',artist:'Taylor Swift'});
  assert.equal(normalized.wordLevel,false);
  assert.equal(normalized.synced,true);
});
test('Enhanced LRC words remain synchronized and exportable',()=>{
  const lines=parseLrc('[00:10.00]<00:10.00>Hello <00:10.40>world\n[00:11.20]Next line');
  const normalized=normalizeLyrics({source:'lrclib',track:{title:'Love Story',artist:'Taylor Swift'},
    lines},{title:'Love Story',artist:'Taylor Swift'});
  assert.equal(normalized.wordLevel,true);
  assert.equal(normalized.lines[0].words[0].end,10.4);
  const lrc=lyricsToLrc(normalized);
  assert.match(lrc,/<00:10.00>Hello/);
  assert.match(lrc,/<00:10.40>world/);
  assert.match(lrc,/\[00:11.20\]Next line/);
});
test('reject unrelated lyric matches and broken fake word timestamps',()=>{
  const context={title:'Love Story',artist:'Taylor Swift',duration:220};
  const result={source:'qq',track:{title:'Shape of You',artist:'Ed Sheeran',duration:220},
    lines:[{time:1,endTime:2,text:'Different words'}]};
  assert.equal(normalizeLyrics(result,context),null);
  const bad={source:'netease',track:{title:'Love Story',artist:'Taylor Swift',duration:220},
    lines:[{time:1,endTime:2,text:'A word',words:[{text:'A',start:1,end:1},{text:'word',start:100,end:100.4}]}]};
  const normalized=normalizeLyrics(bad,context);
  assert.equal(normalized.wordLevel,false);
});
test('word-based YRC parser retains real word start/end',()=>{
  const parsed=parseYrc('[10000,1200](10000,400,0)Hello (10400,800,0)world');
  assert.equal(parsed.length,1);
  assert.equal(parsed[0].words[0].start,10);
  assert.equal(parsed[0].words[0].end,10.4);
  assert.equal(parsed[0].words[1].end,11.2);
});
