import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { lookupYouTube } from '../server/youtube.mjs';
import { parseLrc, lyricsToLrc } from '../server/lyrics.mjs';

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
    assert.equal((await (await fetch(base + '/api/v1/health')).json()).version, '2.1.0');
    assert.match(await (await fetch(base + '/')).text(), /assets\/v21\.js/);
    assert.equal((await fetch(base + '/api/v2/audio/MwpMEbgC7DA')).status, 403);
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
