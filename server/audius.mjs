// Authorized direct-audio catalog via Audius REST API.
// Audius explicitly exposes search, trending and MP3 stream endpoints for
// third-party music clients. Tracks carry their own provider label.
const API = 'https://api.audius.co/v1';
const APP = 'AurelisSymphony';
const ID = /^[A-Za-z0-9_-]{2,60}$/;
const cache = new Map();
const LIMIT = 60;
async function getJson(path) {
  const response = await fetch(API + path, {
    headers: { Accept:'application/json', 'User-Agent':'AurelisSymphony/2.2' },
    signal:AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error('Audius API HTTP '+response.status);
  const body = await response.json();
  if (!Array.isArray(body?.data)) throw new Error('Audius returned no track list');
  return body.data;
}
function sourceArt(t) {
  const art = t.artwork;
  for (const value of [art?.['1000x1000'],art?.['480x480'],art?.['150x150']]) {
    if (typeof value==='string' && value.startsWith('https://')) return value;
  }
  return '';
}
export function normalizeAudius(t) {
  const raw=String(t?.id||'');
  if (!ID.test(raw) || !t?.title || t.is_streamable===false) return null;
  const audio=API+'/tracks/'+encodeURIComponent(raw)+'/stream?app_name='+APP;
  const url = typeof t.permalink==='string' && /^https:\/\/(www\.)?audius\.co\//.test(t.permalink) ? t.permalink : 'https://audius.co';
  return {
    id:'au-'+raw,audiusId:raw,
    title:String(t.title).slice(0,180),
    artist:String(t.user?.name||t.user?.handle||'Audius Artist').slice(0,120),
    album:String(t.album_name||'').slice(0,100),
    duration:Number(t.duration)||0,
    artwork:sourceArt(t),
    url, audio,
    provider:'audius', type:'online',
    playback:{mode:'authorized-direct-audio',provider:'Audius'}
  };
}
function save(key, tracks) {
  if (cache.size>60) cache.delete(cache.keys().next().value);
  cache.set(key,{expires:Date.now()+180_000,tracks});
  return tracks;
}
async function fetchTracks(key,path,limit) {
  const hit=cache.get(key);
  if (hit && hit.expires>Date.now()) return hit.tracks.slice(0,limit);
  const all=await getJson(path);
  return save(key,all.map(normalizeAudius).filter(Boolean).slice(0,LIMIT)).slice(0,limit);
}
export async function searchAudius(query, limit=20) {
  const q=String(query||'').trim().slice(0,130);
  if(!q)return [];
  limit=Math.min(30,Math.max(1,Number(limit)||20));
  return fetchTracks('q:'+q.toLowerCase(),'/tracks/search?'+new URLSearchParams({
    query:q,limit:String(limit),app_name:APP
  }),limit);
}
export async function trendingAudius(limit=18) {
  limit=Math.min(30,Math.max(1,Number(limit)||18));
  return fetchTracks('trending','/tracks/trending?'+new URLSearchParams({limit:String(limit),app_name:APP}),limit);
}
