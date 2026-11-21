import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../src/main/resources/web/', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const js = fs.readFileSync(new URL('assets/v21.js', root), 'utf8');
const css = fs.readFileSync(new URL('assets/v21.css', root), 'utf8');

test('v2.1 page uses native audio and not YouTube iframe', () => {
  assert.match(html, /id="audio"/);
  assert.match(html, /assets\/v21\.js/);
  assert.match(html, /assets\/v21\.css/);
  assert.doesNotMatch(html, /<iframe\b/i);
  assert.doesNotMatch(js, /youtube-nocookie\.com\/embed/i);
  assert.match(js, /\/api\/v2\/audio\//);
});
test('every javascript UI element reference exists in the new HTML', () => {
  const ids = [...js.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map(x => x[1]);
  const available = new Set([...html.matchAll(/id="([^"]+)"/g)].map(x => x[1]));
  const missing = [...new Set(ids)].filter(id => !available.has(id));
  assert.deepEqual(missing, [], 'missing HTML element IDs: ' + missing.join(', '));
});
test('UI remains responsive and has clear playback and error feedback', () => {
  assert.match(css, /@media\(max-width:800px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(js, /audio\.addEventListener\('error'/);
  assert.match(js, /mediaSession/);
  assert.match(js, /data-action="queue-remove"/);
});
