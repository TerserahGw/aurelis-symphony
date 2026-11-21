// Aurelis 2.4 adapter for the user-provided lirik-sync aggregator.
// Seven real providers are available; unsupported/inaccessible APIs fail gracefully.
// No hard-coded word timestamps. The source parser controls words[].
import LirikSync, { SOURCES, scoreCandidate } from './lirik-sync.mjs';

export const MULTI_LYRIC_SOURCES=Object.freeze([
  {id:'lrclib',name:'LRCLIB',synced:true,wordLevel:true,availability:'best-effort'},
  {id:'netease',name:'NetEase Cloud Music',synced:true,wordLevel:true,availability:'best-effort'},
  {id:'qq',name:'QQ Music',synced:true,wordLevel:true,availability:'best-effort'},
  {id:'kugou',name:'Kugou Music',synced:true,wordLevel:true,availability:'best-effort'},
  {id:'musixmatch',name:'Musixmatch',synced:true,wordLevel:true,availability:'unofficial-best-effort'},
  {id:'genius',name:'Genius',synced:false,wordLevel:false,availability:'best-effort'},
  {id:'lyricsovh',name:'lyrics.ovh',synced:false,wordLevel:false,availability:'best-effort'}
]);
const engines = new LirikSync({
  sources:MULTI_LYRIC_SOURCES.map(s=>s.id),
  wordLevelFirst:true,
  timeoutMs:4300,
  cacheTtlMs:20*60_000,
  userAgent:'AurelisSymphony/2.4 (+https://github.com/TerserahGw/aurelis-symphony)',
  debug:false
});
const MAX_WAIT=9200;
const cooldown=new Map();
function query(title,artist,duration=0) {
  return {track:String(title||'').slice(0,135),artist:String(artist||'').slice(0,100),
    duration:Number(duration)>0?Number(duration):undefined};
}
function checkMatch(want, result) {
  if(!result?.lines?.length) return false;
  if(!want.artist)return true;
  const text=s=>String(s||'').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/gi,' ').trim();
  const artistResult=text(result.track?.artist), artistRequested=text(want.artist);
  const titleResult=text(result.track?.title), titleRequested=text(want.track);
  // A title mismatch is more damaging than an unavailable artist metadata
  // on independently hosted lyrics. Avoid matching karaoke of a different song.
  if(titleRequested && titleResult && titleResult!==titleRequested
    && !titleResult.includes(titleRequested) && !titleRequested.includes(titleResult))return false;
  if(artistRequested && artistResult && !artistResult.includes(artistRequested) &&
     !artistRequested.includes(artistResult)){
    const score=scoreCandidate(want,{track:result.track?.title,artist:result.track?.artist,
      duration:result.track?.duration});
    if(score<.63)return false;
  }
  return true;
}
function validWords(line){
  return Array.isArray(line.words)&&line.words.some(w=>
    w&&typeof w.text==='string'&&w.text.trim() &&
    Number.isFinite(Number(w.start)) &&
    Number.isFinite(Number(w.end)) &&
    Number(w.end)>Number(w.start));
}
export function adaptMultiResult(item){
  if(!item || !Array.isArray(item.lines))return null;
  const lines=item.lines.slice(0,600).map(line=>{
    const time=line.time==null?null:Number(line.time);
    const endTime=line.endTime==null?null:Number(line.endTime);
    const words=Array.isArray(line.words)?line.words.slice(0,160).filter(w=>
      w&&typeof w.text==='string'&&Number.isFinite(Number(w.start))&&
      Number.isFinite(Number(w.end))&&Number(w.end)>Number(w.start)
    ).map(w=>({text:String(w.text),start:Number(w.start),end:Number(w.end)})):[];
    return {time:Number.isFinite(time)?time:null,
      endTime:Number.isFinite(endTime)?endTime:null,
      text:String(line.text||'').slice(0,1600),
      translation:String(line.translation||'').slice(0,1600),
      words};
  }).filter(line=>line.text.trim());
  const wordLevel=lines.some(validWords);
  return {source:item.source||'unknown',track:{title:item.track?.title||'',
    artist:item.track?.artist||'',album:item.track?.album||'',
    duration:Number(item.track?.duration)||0},
    synced:lines.some(l=>l.time!==null),wordLevel,
    instrumental:!!item.instrumental,lines};
}
function quality(item,id){
  if(!item)return -1;
  const rank=item.wordLevel?300:item.synced?180:80;
  // Prefer sources which preserve exact word markers; tie break in a stable way.
  return rank+Math.min(40,item.lines.length/5)+(id==='lrclib'?9:0);
}
async function askOne(id,want) {
  const instance=engines.provider(id);
  if(!instance)return {source:id,ok:false,note:'not configured',result:null};
  if(cooldown.get(id)>Date.now())return {source:id,ok:false,note:'cooldown',result:null};
  let timer;
  try{
    const value=await Promise.race([
      instance.find(want,{maxCandidates:1}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),MAX_WAIT);})
    ]);
    const result=adaptMultiResult(value);
    if(!result||!checkMatch(want,result))return {source:id,ok:false,note:'no suitable match',result:null};
    cooldown.delete(id);
    return {source:id,ok:true,wordLevel:result.wordLevel,result};
  }catch(e){
    cooldown.set(id,Date.now()+60_000);
    return {source:id,ok:false,note:String(e?.message||e).slice(0,90),result:null};
  }finally{clearTimeout(timer);}
}
export async function queryMultiLyrics(title,artist,duration=0,source='') {
  const want=query(title,artist,duration);
  if(!want.track)return {result:null,attempts:[]};
  const ids=source?[source]:['lrclib','netease','qq','kugou','musixmatch'];
  const results=await Promise.all(ids.map(id=>askOne(id,want)));
  // Only check plain-text providers when the timed providers returned nothing.
  if(!source && !results.some(x=>x.result)){
    const extra=await Promise.all(['genius','lyricsovh'].map(id=>askOne(id,want)));
    results.push(...extra);
  }
  const selected=results.filter(x=>x.result).sort((a,b)=>quality(b.result,b.source)-quality(a.result,a.source))[0];
  return {result:selected?.result||null,
    attempts:results.map(({source,ok,wordLevel,note})=>({source,ok,wordLevel:!!wordLevel,...(note?{note}:{})}))};
}
export async function allMultiLyrics(title,artist,duration=0) {
  const wanted=query(title,artist,duration);
  const arr=await Promise.all(MULTI_LYRIC_SOURCES.map(s=>askOne(s.id,wanted)));
  return Object.fromEntries(arr.map(r=>[r.source,r.result]));
}
export function providerCapabilities() {
  return MULTI_LYRIC_SOURCES.map(s=>({...s,homepage:SOURCES[s.id]?.homepage}));
}
