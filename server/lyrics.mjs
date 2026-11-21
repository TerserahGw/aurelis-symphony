// Lightweight lyrics integrations for the Node runtime.
export const LYRIC_SOURCES = Object.freeze([
  { id: 'lrclib', name: 'LRCLIB', synced: true, wordLevel: true, availability: 'best-effort' },
  { id: 'lyricsovh', name: 'lyrics.ovh', synced: false, wordLevel: false, availability: 'best-effort' }
]);
const cache = new Map();
function clean(s) { return String(s || '').trim(); }
async function getJson(url, timeoutMs = 7500) {
  const r = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'AurelisSymphony/2.0 (+https://github.com/TerserahGw/aurelis-symphony)' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!r.ok) throw new Error('Lyrics service returned ' + r.status);
  return r.json();
}
function seconds(token) {
  const parts = token.split(':');
  if (parts.length !== 2) return null;
  const time = Number(parts[0]) * 60 + Number(parts[1]);
  return Number.isFinite(time) ? time : null;
}
export function parseLrc(value) {
  const lines = [];
  for (const raw of clean(value).split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}:\d{2}(?:[.,]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const lyric = raw.replace(/\[(\d{1,3}:\d{2}(?:[.,]\d{1,3})?)\]/g, '').trim();
    if (!lyric) continue;
    for (const stamp of stamps) {
      const time = seconds(stamp[1].replace(',', '.'));
      if (time !== null) lines.push({ time, endTime: null, text: lyric, translation: '', words: [] });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  for (let i = 0; i < lines.length - 1; i++) lines[i].endTime = lines[i + 1].time;
  return lines;
}
function score(expected, actual) {
  const norm = s => clean(s).toLowerCase().replace(/[()[\]{}.,!?-]/g, ' ').replace(/\s+/g, ' ').trim();
  const a = norm(expected), b = norm(actual);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return .7;
  const aa = new Set(a.split(' ')), bb = new Set(b.split(' '));
  return [...aa].filter(w => bb.has(w)).length / Math.max(aa.size, bb.size);
}
function standard(source, title, artist, album, duration, lines, instrumental = false) {
  return {
    source, track: { title, artist, album: album || '', duration: Number(duration) || 0 },
    synced: lines.some(l => l.time !== null), wordLevel: lines.some(l => l.words?.length),
    instrumental, lines
  };
}
async function fromLrclib(title, artist, duration) {
  const query = new URLSearchParams({ track_name: title });
  if (artist) query.set('artist_name', artist);
  const list = await getJson('https://lrclib.net/api/search?' + query);
  if (!Array.isArray(list) || !list.length) return null;
  const matched = list.map(row => {
    let rank = score(title, row.trackName) * .72 + (artist ? score(artist, row.artistName) * .28 : .28);
    if (duration > 0 && row.duration) rank -= Math.min(.16, Math.abs(row.duration - duration) / duration * .2);
    return { row, rank };
  }).sort((a, b) => b.rank - a.rank)[0];
  if (!matched || matched.rank < .49) return null;
  const row = matched.row;
  const detail = row.id ? await getJson('https://lrclib.net/api/get/' + encodeURIComponent(String(row.id))) : row;
  let lines = detail.syncedLyrics ? parseLrc(detail.syncedLyrics) : [];
  if (!lines.length && detail.plainLyrics) {
    lines = detail.plainLyrics.split(/\r?\n/).map(text => clean(text)).filter(Boolean)
      .map(text => ({ time: null, endTime: null, text, translation: '', words: [] }));
  }
  if (!lines.length && !detail.instrumental) return null;
  return standard('lrclib', detail.trackName || title, detail.artistName || artist,
    detail.albumName || '', detail.duration || duration, lines, !!detail.instrumental);
}
async function fromLyricsOvh(title, artist) {
  if (!artist) return null;
  const data = await getJson('https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title));
  if (!data?.lyrics) return null;
  const lines = data.lyrics.split(/\r?\n/).map(clean).filter(Boolean)
    .map(text => ({ time: null, endTime: null, text, translation: '', words: [] }));
  return standard('lyricsovh', title, artist, '', 0, lines);
}
async function provider(source, title, artist, duration) {
  if (source === 'lrclib') return fromLrclib(title, artist, duration);
  if (source === 'lyricsovh') return fromLyricsOvh(title, artist);
  return null;
}
export async function findLyrics(title, artist, duration = 0, source = '') {
  const key = JSON.stringify([title.toLowerCase(), artist.toLowerCase(), duration, source]);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.payload;
  const attempts = [];
  let result = null;
  for (const id of (source ? [source] : ['lrclib', 'lyricsovh'])) {
    try {
      const value = await provider(id, title, artist, duration);
      attempts.push({ source: id, ok: !!value, wordLevel: !!value?.wordLevel });
      if (value) { result = value; break; }
    } catch (e) { attempts.push({ source: id, ok: false, note: String(e.message).slice(0, 110) }); }
  }
  const payload = { result, attempts };
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(key, { payload, expires: Date.now() + (result ? 20 * 60_000 : 45_000) });
  return payload;
}
export async function allLyrics(title, artist, duration = 0) {
  const values = await Promise.all(LYRIC_SOURCES.map(async s => [s.id, (await findLyrics(title, artist, duration, s.id)).result]));
  return Object.fromEntries(values);
}
export function lyricsToLrc(result) {
  return result.lines.map(l => {
    if (l.time === null) return l.text;
    const mm = Math.floor(l.time / 60), ss = (l.time % 60).toFixed(2).padStart(5, '0');
    return '[' + String(mm).padStart(2, '0') + ':' + ss + ']' + l.text;
  }).join('\n') + '\n';
}
