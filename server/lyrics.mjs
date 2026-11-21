// Seven-source lyric adapter. The full lirik.js was supplied by the project
// owner and is vendored in server/vendor/lirik-sync.mjs.
// Provider availability, per-word timing and licensing remain best-effort.
import LirikSync, { SOURCES, parseLrc as parseEnhanced } from './vendor/lirik-sync.mjs';

const ids=['lrclib','netease','qq','kugou','musixmatch','genius','lyricsovh'];
const labels={lrclib:'LRCLIB',netease:'Netease Cloud Music',qq:'QQ Music',
  kugou:'Kugou Music',musixmatch:'Musixmatch',genius:'Genius',lyricsovh:'lyrics.ovh'};
export const LYRIC_SOURCES=Object.freeze(ids.map(id=>Object.freeze({
  id,name:labels[id],synced:!!SOURCES[id]?.caps.synced,
  wordLevel:!!SOURCES[id]?.caps.word,availability:'best-effort'
})));
const client=new LirikSync({
  sources:ids,wordLevelFirst:true,timeoutMs:4900,cacheTtlMs:20*60_000,
  userAgent:'AurelisSymphony/2.4 (+https://github.com/TerserahGw/aurelis-symphony)'
});
const cache=new Map(), pending=new Map(),TTL=15*60_000;
function safe(s,max=150){return String(s||'').trim().slice(0,max);}
function normal(s){return safe(s).normalize('NFKD').toLowerCase()
  .replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}\s]/gu,' ')
  .replace(/\s+/g,' ').trim();}
function related(expected,actual){
  const a=normal(expected),b=normal(actual);
  if(!a||!b)return 0;
  if(a===b)return 1;
  const aa=new Set(a.split(' ')),bb=new Set(b.split(' '));
  let count=0;for(const v of aa)if(bb.has(v))count++;
  return (2*count)/(aa.size+bb.size);
}
function wordTimes(words,lineStart,lineEnd){
  if(!Array.isArray(words))return [];
  const result=[];
  for(const w of words.slice(0,160)){
    const start=Number(w.start),end=Number(w.end);
    if(typeof w.text!=='string'||!w.text.trim() || !Number.isFinite(start) ||
       !Number.isFinite(end)||end<=start||start<0||
       (lineStart!==null && start<lineStart-.25) ||
       (lineEnd!==null && start>lineEnd+.5))continue;
    result.push({text:w.text.slice(0,140),start,end});
  }
  return result;
}
export function normalizeLyrics(result,expected={}){
  if(!result||!Array.isArray(result.lines)||!result.lines.length)return null;
  const source=String(result.source||'');
  if(!ids.includes(source))return null;
  const t=result.track||{};
  const expectedTitle=safe(expected.title),expectedArtist=safe(expected.artist);
  const titleMatch=expectedTitle?related(expectedTitle,t.title):1;
  const artistMatch=expectedArtist&&t.artist?related(expectedArtist,t.artist):.65;
  // Do not display lyrics from a different track merely because a title
  // contains a common word. Unknown artist is permitted only with strong title.
  if(titleMatch<.62 || (expectedArtist && artistMatch<.35))return null;
  const duration=Number(expected.duration)||0, foundDuration=Number(t.duration)||0;
  if(duration>0&&foundDuration>0&&Math.abs(duration-foundDuration)>Math.max(16,duration*.13))return null;
  const lines=result.lines.slice(0,350).map(l=>{
    const rawTime=l.time;
    const time=rawTime===null||rawTime===undefined?null:Number(rawTime);
    const rawEnd=l.endTime;
    const endTime=rawEnd===null||rawEnd===undefined?null:Number(rawEnd);
    const text=safe(l.text,900);
    const words=wordTimes(l.words,Number.isFinite(time)?time:null,Number.isFinite(endTime)?endTime:null);
    return {
      time:Number.isFinite(time)?time:null,
      endTime:Number.isFinite(endTime)?endTime:null,
      text,translation:safe(l.translation,900),words
    };
  }).filter(l=>l.text);
  if(!lines.length)return null;
  const synced=lines.some(l=>l.time!==null);
  const wordLevel=lines.some(l=>l.words.length>0);
  return {source,sourceLabel:labels[source],track:{
    title:safe(t.title)||expectedTitle,artist:safe(t.artist)||expectedArtist,
    album:safe(t.album),duration:foundDuration||duration
  },synced,wordLevel,instrumental:!!result.instrumental,lines};
}
export function parseLrc(value){return parseEnhanced(String(value||'')).lines.map(l=>({
  time:l.time,endTime:l.endTime,text:l.text,translation:l.translation||'',words:l.words||[]
})).filter(l=>l.text);}
function rank(result){
  if(!result)return -1;
  const words=result.lines.reduce((n,l)=>n+(l.words?.length||0),0);
  const synced=result.lines.filter(l=>l.time!==null).length;
  // Prefer genuine word markers above line-level; LRCLIB over others on ties.
  return (words>=2?1000:0)+(synced?120:0)+Math.min(25,words)+
    (result.source==='lrclib'?5:0)+(result.source==='netease'?3:0);
}
function requestKey(track,artist,duration,source){
  return JSON.stringify([normal(track),normal(artist),Math.round(Number(duration)||0),source]);
}
async function providerResult(id,query){
  const provider=client.provider(id);
  if(!provider)return {result:null,attempt:{source:id,ok:false,note:'unknown source'}};
  try{
    const v=await provider.find(query,{maxCandidates:2});
    const result=normalizeLyrics(v,query);
    return {result,attempt:{source:id,ok:!!result,wordLevel:!!result?.wordLevel,
      ...(v&&!result?{note:'metadata mismatch'}:{})}};
  }catch(e){
    return {result:null,attempt:{source:id,ok:false,note:String(e?.message||e).slice(0,95)}};
  }
}
async function fetchResults(track,artist,duration,source){
  const query={track,artist,duration};
  const selected=source?[source]:ids;
  // Stage 1: timed providers run concurrently. Their requests are bounded by
  // per-provider timeouts (no app-specific cookies or credentials).
  const timed=selected.filter(id=>SOURCES[id]?.caps?.synced);
  const plain=selected.filter(id=>!SOURCES[id]?.caps?.synced);
  const results=await Promise.all(timed.map(id=>providerResult(id,query)));
  let best=results.map(x=>x.result).filter(Boolean).sort((a,b)=>rank(b)-rank(a))[0]||null;
  const attempts=results.map(x=>x.attempt);
  // Only query HTML/plain sources when no timed provider matched.
  if(!best){
    const fallbacks=await Promise.all(plain.map(id=>providerResult(id,query)));
    attempts.push(...fallbacks.map(x=>x.attempt));
    best=fallbacks.map(x=>x.result).filter(Boolean).sort((a,b)=>rank(b)-rank(a))[0]||null;
  }
  return {result:best,attempts};
}
export async function findLyrics(title,artist,duration=0,source=''){
  title=safe(title);artist=safe(artist);duration=Math.max(0,Math.min(2000,Number(duration)||0));
  if(!title)return {result:null,attempts:[]};
  if(source&&!ids.includes(source))return {result:null,attempts:[{source,ok:false,note:'unknown source'}]};
  const key=requestKey(title,artist,duration,source);
  const c=cache.get(key);if(c&&c.expires>Date.now())return c.payload;
  if(pending.has(key))return pending.get(key);
  const p=fetchResults(title,artist,duration,source).then(payload=>{
    if(cache.size>160)cache.delete(cache.keys().next().value);
    cache.set(key,{payload,expires:Date.now()+(payload.result?TTL:45000)});
    return payload;
  }).finally(()=>pending.delete(key));
  pending.set(key,p);
  return p;
}
export async function allLyrics(title,artist,duration=0){
  const entries=await Promise.all(ids.map(async id=>{
    const payload=await findLyrics(title,artist,duration,id);
    return [id,payload.result];
  }));
  return Object.fromEntries(entries);
}
export function lyricsToLrc(result){
  if(!result?.lines?.length)return '';
  const stamp=sec=>{
    const n=Math.max(0,Number(sec)||0),min=String(Math.floor(n/60)).padStart(2,'0');
    return min+':'+(n%60).toFixed(2).padStart(5,'0');
  };
  return result.lines.map(l=>{
    if(l.time===null)return l.text;
    const tag='['+stamp(l.time)+']';
    if(l.words?.length) return tag+l.words.map(w=>'<'+stamp(w.start)+'>'+w.text).join('');
    return tag+l.text;
  }).join('\n')+'\n';
}
