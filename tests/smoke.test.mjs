import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { lookupYouTube } from '../server/youtube.mjs';
import { parseLrc, lyricsToLrc } from '../server/lyrics.mjs';
import { validSingleRange, allowedMediaHost } from '../server/stream.mjs';
import { detectLyricLanguage, translateLyrics } from '../server/translation.mjs';
import { parseByteRange } from '../server/ytdl-fallback.mjs';
import { safeFilename, contentDisposition } from '../server/download.mjs';

test('download filenames are safe and correct for MP4 and WebM audio', () => {
  assert.equal(safeFilename('Tom Odell - Another Love'),'Tom Odell - Another Love');
  assert.equal(safeFilename('bad\\r\\nContent-Type: text/html'),'bad r nContent-Type text html');
  assert.equal(contentDisposition('Aurelis Demo','MwpMEbgC7DA','audio/mp4'),
    'attachment; filename="Aurelis Demo.m4a"');
  assert.equal(contentDisposition('Demo','MwpMEbgC7DA','audio/webm'),
    'attachment; filename="Demo.webm"');
  assert.doesNotMatch(contentDisposition('\r\nX-Test: injected','abc', 'audio/mp4'),/[\r\n]/);
});
test('YouTube URL whitelist', () => {
  assert.equal(lookupYouTube('https://youtube.com/watch?v=MwpMEbgC7DA')?.videoId, 'MwpMEbgC7DA');
  assert.equal(lookupYouTube('https://youtu.be/MwpMEbgC7DA')?.videoId, 'MwpMEbgC7DA');
  assert.equal(lookupYouTube('https://youtube.com.evil.example/watch?v=MwpMEbgC7DA'), null);
  assert.equal(lookupYouTube('http://youtube.com/watch?v=MwpMEbgC7DA'), null);
});
test('LRC timestamps', () => {
  const lines = parseLrc('[00:01.50]Hello\n[00:02.10]World');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].time, 1.5);
  assert.equal(lines[0].endTime, 2.1);
  assert.match(lyricsToLrc({ lines }), /\[00:01.50\]Hello/);
});
test('stream safety and range input', () => {
  assert.equal(validSingleRange('bytes=0-1023'),true);
  assert.equal(validSingleRange('bytes=0-'),true);
  assert.equal(validSingleRange('bytes=-1024'),true);
  assert.equal(validSingleRange('bytes=0-100,200-300'),false);
  assert.equal(allowedMediaHost('https://r5---sn-xx.googlevideo.com/videoplayback?id=x'),true);
  assert.equal(allowedMediaHost('https://googlevideo.com.attacker.example/audio'),false);
  assert.equal(allowedMediaHost('http://googlevideo.com/audio'),false);
});
test('translation language detection and strict input', async () => {
  assert.equal(detectLyricLanguage('君といっしょに'), 'ja');
  assert.equal(detectLyricLanguage('안녕하세요'), 'ko');
  assert.equal(detectLyricLanguage('你好世界'), 'zh-CN');
  assert.equal(detectLyricLanguage('hello my love'), 'en');
  const input=await translateLyrics({texts:['', ...Array(20).fill('x')], target:'id'});
  assert.equal(input.ok,false);
  assert.equal(input.code,'invalid_texts');
});
test('Fallback HTTP byte ranges', () => {
  assert.deepEqual(parseByteRange('bytes=0-1023',10000),{start:0,end:1023,total:10000,status:206});
  assert.deepEqual(parseByteRange('bytes=-500',10000),{start:9500,end:9999,total:10000,status:206});
  assert.deepEqual(parseByteRange('bytes=300-',10000),{start:300,end:9999,total:10000,status:206});
  assert.equal(parseByteRange('bytes=5000-1000',10000),null);
  assert.equal(parseByteRange('bytes=0-100,200-300',10000),null);
  assert.equal(parseByteRange('bytes=100000-',10000),null);
});
test('HTTP smoke test: health, demos, native playback descriptor, byte ranges', async () => {
  const port = 19000 + Math.floor(Math.random() * 3000);
  const proc = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), AURELIS_CLOUD_LIBRARY: 'false', AURELIS_DIRECT_AUDIO: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = 'http://127.0.0.1:' + port;
  try {
    let up = false;
    for (let i = 0; i < 50; i++) {
      try { up = (await fetch(base + '/api/v1/health')).ok; if (up) break; }
      catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.equal(up, true, 'server starts');
    assert.equal((await (await fetch(base + '/api/v1/health')).json()).version, '2.7.0');
    const homepage=await (await fetch(base + '/')).text();
    assert.match(homepage,/assets\/v21\.js/);
    assert.match(homepage,/assets\/full-player\.js/);
    assert.match(homepage,/assets\/full-player\.css/);
    assert.match(homepage,/assets\/preferences\.js/);
    assert.match(homepage,/assets\/island-v26\.js/);
    assert.match(homepage,/assets\/island-v26\.css/);
    assert.equal((await fetch(base+'/assets/island-v26.js')).status,200);
    assert.equal((await fetch(base+'/assets/island-v26.css')).status,200);
    assert.match(homepage,/assets\/lyrics-v23\.css/);
    assert.equal((await fetch(base+'/assets/preferences.js')).status,200);
    assert.equal((await fetch(base+'/assets/lyrics-v23.css')).status,200);
    assert.equal((await fetch(base+'/assets/glass-v24.css')).status,200);
    assert.equal((await fetch(base+'/assets/glass-v25.css')).status,200);
    assert.match(homepage,/assets\/glass-v25\.css/);
    assert.equal((await fetch(base+'/assets/media-session.js')).status,200);
    const sourceList=await (await fetch(base+'/api/v1/lyrics/sources')).json();
    assert.equal(sourceList.sources.length,7);
    assert.ok(sourceList.sources.some(x=>x.id==='netease'));
    assert.ok(sourceList.sources.some(x=>x.id==='musixmatch'));
    const docs=await fetch(base+'/docs/api');
    assert.equal(docs.status,200);
    assert.match(await docs.text(),/API Reference/);
    assert.equal((await fetch(base+'/assets/docs.js')).status,200);
    assert.equal((await fetch(base+'/assets/docs.css')).status,200);
    const openapi=await (await fetch(base+'/api/v1/openapi.json')).json();
    assert.equal(openapi.info.version,'2.7.0');
    assert.equal((await fetch(base+'/assets/full-player.js')).status,200);
    assert.equal((await fetch(base+'/assets/full-player.css')).status,200);
    const invalidTranslation=await fetch(base+'/api/v2/translate',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({texts:[],target:'id'})
    });
    assert.equal(invalidTranslation.status,400);
    assert.equal((await fetch(base + '/api/v2/audio/MwpMEbgC7DA')).status, 403);
    assert.equal((await fetch(base + '/api/v2/audio/MwpMEbgC7DA?download=1')).status,403);
    assert.equal((await fetch(base + '/api/v1/search?provider=audius&q=test')).status, 400);
    assert.equal((await (await fetch(base + '/api/v2/status')).json()).stream.enabled, false);
    assert.equal((await (await fetch(base + '/api/v1/catalog')).json()).tracks.length, 3);
    const info = await (await fetch(base + '/api/v1/info?url=' + encodeURIComponent('https://youtube.com/watch?v=MwpMEbgC7DA'))).json();
    assert.equal(info.track.playback.mode, 'experimental-direct-audio');
    assert.deepEqual(info.track.audio, []);
    const range = await fetch(base + '/demo/aether-bloom.mp3', { headers: { Range: 'bytes=0-99' } });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 100);
    const head = await fetch(base + '/demo/aether-bloom.mp3', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('accept-ranges'), 'bytes');
    assert.equal((await fetch(base + '/api/v1/search?provider=invalid&q=test')).status, 400);
    assert.equal((await fetch(base + '/api/v1/library')).status, 403);
  } finally {
    proc.kill();
    await new Promise(resolve => proc.once('exit', resolve));
  }
});
