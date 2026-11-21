// Aurelis v2.4: seven sources powered by the user-provided LirikSync module.
// Existing LRCLIB/lyrics.ovh routes remain as fallback when the adapter fails.
import { providerCapabilities,queryMultiLyrics,allMultiLyrics } from './lyrics-multi.mjs';
export const LYRIC_SOURCES=Object.freeze(providerCapabilities());
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
// Enhanced LRC uses <mm:ss.xx>word markers after an ordinary [line timestamp].
// Keep word boundaries exact; never synthesize word timestamps when absent.
export function parseLrc(value) {
  const lines=[];
  for(const raw of clean(value).split(/\r?\n/)) {
    const lineTags=[...raw.matchAll(/\[(\d{1,3}:\d{2}(?:[.,]\d{1,3})?)\]/g)];
    if(!lineTags.length)continue;
    const body=raw.replace(/\[(\d{1,3}:\d{2}(?:[.,]\d{1,3})?)\]/g,'');
    const markers=[...body.matchAll(/<(\d{1,3}:\d{2}(?:[.,]\d{1,3})?)>/g)];
    const text=body.replace(/<\d{1,3}:\d{2}(?:[.,]\d{1,3})?>/g,'').trim();
    if(!text)continue;
    for(const tag of lineTags){
      const time=seconds(tag[1].replace(',','.'));
      if(time===null)continue;
      const words=[];
      if(markers.length) {
        const prefix=body.slice(0,markers[0].index);
        if(prefix.trim())words.push({start:time,end:null,text:prefix});
        for(let i=0;i<markers.length;i++){
          const marker=markers[i], next=markers[i+1];
          const start=seconds(marker[1].replace(',','.'));
          if(start===null)continue;
          const piece=body.slice(marker.index+marker[0].length,next?.index??body.length);
          if(!piece)continue;
          const nextStart=next?seconds(next[1].replace(',','.')):null;
          words.push({start:Math.max(time,start),end:nextStart!==null?nextStart:null,text:piece});
        }
      }
      lines.push({time,endTime:null,text,translation:'',words});
    }
  }
  lines.sort((a,b)=>a.time-b.time);
  for(let i=0;i<lines.length;i++){
    const line=lines[i];line.endTime=lines[i+1]?.time??null;
    for(let j=0;j<line.words.length;j++){
      const word=line.words[j];
      const next=line.words[j+1];
      word.end=Math.max(word.start,Number(next?.start??line.endTime??(word.start+.45)));
      // Avoid karaoke gradient filling earlier than the word begins.
      if(!Number.isFinite(word.end))word.end=word.start+.45;
    }
  }
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
export async function findLyrics(title,artist,duration=0,source='') {
  const key=JSON.stringify([title.toLowerCase(),artist.toLowerCase(),duration,source]);
  const hit=cache.get(key);
  if(hit&&hit.expires>Date.now())return hit.payload;
  const multi=await queryMultiLyrics(title,artist,duration,source);
  let result=multi.result;
  const attempts=multi.attempts;
  // Keep the historically stable two sources as a graceful fallback. Do not
  // replace existing word-level lyrics with a weaker line-level result.
  if(!result&&(!source||source==='lrclib'||source==='lyricsovh')){
    for(const id of (source?[source]:['lrclib','lyricsovh'])){
      try{
        const value=await provider(id,title,artist,duration);
        attempts.push({source:id+'-fallback',ok:!!value,wordLevel:!!value?.wordLevel});
        if(value){result=value;break;}
      }catch(e){attempts.push({source:id+'-fallback',ok:false,note:String(e.message).slice(0,90)});}
    }
  }
  const payload={result,attempts};
  if(cache.size>200)cache.delete(cache.keys().next().value);
  cache.set(key,{payload,expires:Date.now()+(result?20*60_000:45_000)});
  return payload;
}
export async function allLyrics(title,artist,duration=0) {
  const results=await allMultiLyrics(title,artist,duration);
  for(const id of ['lrclib','lyricsovh']){
    if(results[id])continue;
    try{results[id]=await provider(id,title,artist,duration);}catch{results[id]=null;}
  }
  return results;
}
export function lyricsToLrc(result) {
  return result.lines.map(l => {
    if (l.time === null) return l.text;
    const mm = Math.floor(l.time / 60), ss = (l.time % 60).toFixed(2).padStart(5, '0');
    return '[' + String(mm).padStart(2, '0') + ':' + ss + ']' + l.text;
  }).join('\n') + '\n';
}
