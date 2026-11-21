// Aurelis 2.0 discovery adapter. Metadata only; no raw media extraction or proxy.
let clientPromise;
const cache = new Map();
const TTL = 4 * 60_000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function readText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readText).filter(Boolean).join(' ');
  if (typeof value.text === 'string') return value.text;
  if (Array.isArray(value.runs)) return value.runs.map(r => r.text || '').join('');
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
    const out = String(value.toString());
    if (out !== '[object Object]') return out;
  }
  return '';
}
function thumbnail(node) {
  const sources = [
    node?.thumbnails, node?.thumbnail?.contents, node?.thumbnail?.thumbnails,
    node?.thumbnail, node?.thumbnail?.image?.sources
  ];
  for (const source of sources) {
    if (Array.isArray(source) && source.length) {
      const img = source[source.length - 1];
      if (typeof img?.url === 'string' && /^https:/.test(img.url)) return img.url;
    }
  }
  return '';
}
function durationSeconds(value) {
  if (Number.isFinite(value?.seconds)) return Number(value.seconds);
  if (Number.isFinite(value)) return Number(value);
  const text = readText(value);
  if (!/^\d{1,3}(:\d\d){1,2}$/.test(text)) return 0;
  return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}
function normalize(node) {
  if (!node || typeof node !== 'object') return null;
  const candidate = node.video_id || node.videoId || node.id || node.endpoint?.payload?.videoId ||
    node.navigation_endpoint?.payload?.videoId || node.play_endpoint?.payload?.videoId;
  const id = String(candidate || '');
  if (!VIDEO_ID.test(id)) return null;
  const title = readText(node.title || node.name);
  if (!title) return null;
  const artists = Array.isArray(node.artists) ? node.artists.map(a => readText(a.name || a)).join(', ') : '';
  const author = readText(node.author?.name || node.author || node.artist?.name || node.artist || node.owner);
  return {
    id: 'yt-' + id, videoId: id,
    title, artist: artists || author || 'YouTube',
    album: readText(node.album?.name || node.album) || '',
    duration: durationSeconds(node.duration || node.length),
    artwork: thumbnail(node), url: 'https://www.youtube.com/watch?v=' + id,
    provider: 'youtube', type: 'online', playback: { mode: 'experimental-direct-audio', provider: 'youtubei.js' }
  };
}
function gather(root, limit = 100) {
  const queue = [root], seen = new WeakSet(), out = [], used = new Set();
  while (queue.length && out.length < limit) {
    const x = queue.shift();
    if (!x || typeof x !== 'object' || seen.has(x)) continue;
    seen.add(x);
    if (Array.isArray(x)) { queue.push(...x.slice(0, 50)); continue; }
    const track = normalize(x);
    if (track && !used.has(track.id)) { out.push(track); used.add(track.id); }
    for (const key of ['contents', 'videos', 'songs', 'results', 'items', 'sections', 'shelf', 'music_shelf']) {
      if (x[key]) queue.push(x[key]);
    }
  }
  return out;
}
async function client() {
  if (!clientPromise) clientPromise = import('youtubei.js').then(async ({ Innertube }) =>
    Innertube.create({ lang: 'en', generate_session_locally: true })).catch(err => { clientPromise = null; throw err; });
  return clientPromise;
}
function timeout(promise, ms = 12000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Discovery timeout')), ms);
  })]).finally(() => clearTimeout(timer));
}
async function unofficialSearch(query, limit) {
  const yt = await client();
  let tracks = [];
  try {
    const music = await timeout(yt.music.search(query, { type: 'song' }));
    tracks = gather(music, limit + 10);
  } catch (error) {
    console.warn('YouTube Music discovery fallback:', error.message);
  }
  if (tracks.length < Math.min(4, limit)) {
    const regular = await timeout(yt.search(query));
    const more = gather(regular, limit + 10);
    const known = new Set(tracks.map(t => t.id));
    for (const item of more) if (!known.has(item.id)) { tracks.push(item); known.add(item.id); }
  }
  return tracks.slice(0, limit);
}
async function officialSearch(query, limit) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY not configured');
  const params = new URLSearchParams({ part: 'snippet', q: query, type: 'video', maxResults: String(limit), key });
  const res = await fetch('https://www.googleapis.com/youtube/v3/search?' + params, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error('YouTube Data API returned ' + res.status);
  const json = await res.json();
  return (json.items || []).map(item => normalize({
    video_id: item.id?.videoId, title: item.snippet?.title,
    author: item.snippet?.channelTitle,
    thumbnails: Object.values(item.snippet?.thumbnails || {})
  })).filter(Boolean);
}
export async function searchMusic(query, limit = 20) {
  if (typeof query !== 'string' || !query.trim()) return [];
  const backend = process.env.SEARCH_BACKEND || 'youtubei';
  const k = backend + ':' + query.toLowerCase().trim() + ':' + limit;
  const entry = cache.get(k);
  if (entry && Date.now() < entry.expires) return entry.tracks;
  let tracks;
  if (backend === 'official') tracks = await officialSearch(query, limit);
  else if (backend === 'youtubei') tracks = await unofficialSearch(query, limit);
  else throw new Error('Unsupported SEARCH_BACKEND');
  if (cache.size >= 80) cache.delete(cache.keys().next().value);
  cache.set(k, { tracks, expires: Date.now() + (tracks.length ? TTL : 30_000) });
  return tracks;
}
export function lookupYouTube(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    let id = '';
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2] || '';
    }
    if (!VIDEO_ID.test(id)) return null;
    return { id: 'yt-' + id, videoId: id, url: 'https://www.youtube.com/watch?v=' + id, provider: 'youtube', type: 'online' };
  } catch { return null; }
}
export function getSearchStatus() {
  return { backend: process.env.SEARCH_BACKEND || 'youtubei', provider: 'youtube', mode: 'metadata-and-experimental-audio',
    rawAudioProxy: true, unofficial: (process.env.SEARCH_BACKEND || 'youtubei') === 'youtubei' };
}
