// Aurelis 2.3: metadata-informed diversity-first radio for YouTube Music.
// Doesn't claim to analyze acoustic sound, personal YouTube history or embeddings.
const STOP = /\b(official|music|video|audio|lyrics?|lyric|visualizer|hd|hq|4k|mv|performance|reaction|sped\s*up|slowed|reverb|extended|radio\s*edit|clean\s*version|remastered|edit|remix|cover|live|acoustic|nightcore|version|instrumental|subtitle|subtitles)\b/ig;
const LABELS = /\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g;
export function cleanArtist(text='') {
  return String(text||'').toLowerCase().normalize('NFKD')
    .replace(/\b(official|vevo|topic|channel|records|music|ytmusic)\b/gi,'')
    .replace(/^\s*@/,'').replace(/\s*(,|&| x | feat\.? | ft\.? | and )\s*.*/i,'')
    .replace(/[^a-z0-9\u00c0-\u024f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g,' ').trim();
}
export function cleanTitle(text='',artist='') {
  let title=String(text||'').normalize('NFKD').toLowerCase().trim();
  const artistNorm=cleanArtist(artist);
  if(title.includes(' - ')){
    const pieces=title.split(/\s+[-–—]\s+/);
    if(pieces.length>=2 && artistNorm && cleanArtist(pieces[0])===artistNorm)
      title=pieces.slice(1).join(' - ');
  }
  return title.replace(LABELS,' ').replace(STOP,' ').replace(/\b(feat|ft)\.? .*/,'')
    .replace(/[^a-z0-9\u00c0-\u024f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g,' ')
    .replace(/\s+/g,' ').trim();
}
function singer(item) {return cleanArtist(item?.artist||'');}
function name(item) {return cleanTitle(item?.title||'',item?.artist||'');}
export function sameSong(a,b) {
  if(!a||!b)return false;
  if(a.id && b.id && a.id===b.id)return true;
  const x=name(a),y=name(b);
  if(!x||!y)return false;
  if(x===y)return true;
  const short=Math.min(x.length,y.length),long=Math.max(x.length,y.length);
  return short>=12 && short/long>=.78 && (x.startsWith(y)||y.startsWith(x));
}
const STYLES = {
  chill:['chill','soft','mellow','lofi','relax','calm','slow','dream','sleep','peace','ambient','quiet'],
  energetic:['dance','workout','edm','club','house','electro','hyperpop','party','energy','upbeat'],
  indie:['indie','alternative','bedroom','dream pop','shoegaze','folk'],
  rock:['rock','metal','punk','grunge','guitar','emo'],
  rap:['hip hop','hiphop','rap','trap','r&b','rnb','soul','drill'],
  jpop:['jpop','j-pop','japanese','anime','vocaloid','city pop','ボカロ'],
  kpop:['kpop','k-pop','korean','케이팝'],
  acoustic:['acoustic','unplugged','piano','ballad','singer songwriter'],
  jazz:['jazz','blues','funk','fusion'],
  classical:['classical','orchestra','symphony','instrumental']
};
export function inferStyle(current={},recent=[],hint='') {
  const sample=[hint,current.album||'',current.title||'',current.artist||'',
    ...recent.slice(0,4).flatMap(x=>[x.title||'',x.artist||''])].join(' ').toLowerCase();
  const counts=Object.entries(STYLES).map(([style,keywords])=>({
    style,points:keywords.reduce((n,word)=>n+(sample.includes(word)?1:0),0)
  })).sort((a,b)=>b.points-a.points);
  return counts[0]?.points ? counts[0].style : 'pop';
}
function artistLike(a,b) {
  const x=singer(a),y=singer(b);return !!x && !!y && (x===y || (x.length>=6&&y.startsWith(x+' ')));
}
// Music-first filtering: don't turn a search for an artist into a podcast,
// compilation, mashup, tutorial or slowed/sped-up duplicate.
const UNWANTED = /\b(reaction|interview|documentary|tutorial|podcast|full album|1 hour|10 hours|playlist|compilation|mashup|nightcore|sped\s*up|slowed|reverb|karaoke|bass boosted|looped|8d audio|trailer|teaser|fanmade)\b/i;
function playable(t) {
  if(!t?.id||!t?.title)return false;
  if(t.duration>0&&(t.duration<70||t.duration>540))return false;
  if(UNWANTED.test(String(t.title)))return false;
  return true;
}
function contextRows(input) {
  return (Array.isArray(input)?input:[]).slice(0,12).filter(x=>x && typeof x==='object')
    .map(x=>({title:String(x.title||'').slice(0,150),artist:String(x.artist||'').slice(0,100),
      album:String(x.album||'').slice(0,120),id:String(x.id||'').slice(0,60)}));
}
function styleAffinity(t,style){
  const text=[t?.title,t?.album,t?.artist].join(' ').toLowerCase();
  const tags=STYLES[style]||[];
  return Math.min(3,tags.reduce((count,tag)=>count+(text.includes(tag)?1:0),0));
}
function artistBonus(t,recent,liked,mode){
  const likedMatch=liked.some(x=>artistLike(t,x));
  const recentMatch=recent.some(x=>artistLike(t,x));
  return (likedMatch?(mode==='discover'?.7:3.3):0)
    +(recentMatch?(mode==='familiar'?1.8:.8):0);
}
export function rankRadio(candidates,options={}) {
  const current=options.current||{};
  const recent=contextRows(options.recent);
  const liked=contextRows(options.liked);
  const queued=contextRows(options.queued);
  const forbidden=[current,...recent.slice(0,10),...queued];
  const seenIds=new Set(forbidden.map(x=>x.id).filter(Boolean));
  const mode=['familiar','balanced','discover'].includes(options.mode)?options.mode:'balanced';
  const style=options.style||inferStyle(current,[...liked,...recent],options.hint);
  const perArtist=new Map(),seenSongs=[];
  const list=(candidates||[]).filter(playable).filter(x=>{
    if(seenIds.has(x.id))return false;
    if(forbidden.some(other=>sameSong(x,other)))return false;
    return true;
  }).map((x,i)=>{
    const currentArtist=artistLike(x,current);
    const duration=Number(x.duration)||0;
    const quality=duration>=125&&duration<=360?1.1:(duration>0&&duration<=480?.25:-.8);
    const styled=styleAffinity(x,style);
    const knownProfile=artistBonus(x,recent,liked,mode);
    const familiar=mode==='familiar'?3.5:mode==='balanced'?1.4:-2.3;
    // The search itself supplies most relevance; context is a bounded rerank,
    // never claimed to be Spotify-style acoustic embeddings or BPM analysis.
    const provenance=Number(options.provenance?.[x.id])||0;
    const score=provenance*3.4+
      (currentArtist?familiar:0)+
      knownProfile+
      styled*2.1+quality+
      (String(x.album||'').trim().length>2?.5:0)-
      (i*.012);
    return {...x,_score:score};
  }).sort((a,b)=>b._score-a._score || String(a.id).localeCompare(String(b.id)));
  const output=[];
  const maxArtist=mode==='familiar'?2:1;
  function add(t,max){
    const key=singer(t)||'unknown';
    if((perArtist.get(key)||0)>=max || seenSongs.some(x=>sameSong(x,t)))return false;
    perArtist.set(key,(perArtist.get(key)||0)+1);
    seenSongs.push(t);
    const {_score,...clean}=t;
    output.push(clean);
    return true;
  }
  for(const track of list){if(output.length>=(options.limit||12))break;add(track,maxArtist);}
  // In balanced/discover mode, artist variety outranks filling the last few
  // slots with repetitive choices; familiar mode may deliberately repeat artists.
  if(mode==='familiar' && output.length<Math.min(6,options.limit||12))
    for(const track of list){if(output.length>=(options.limit||12))break;add(track,2);}
  return output;
}
export async function createRadio({search,current={},recent=[],liked=[],queued=[],hint='',mode='balanced',limit=12}) {
  const context=contextRows(recent),likedRows=contextRows(liked);
  const artist=String(current.artist||context[0]?.artist||likedRows[0]?.artist||'').trim().replace(/ - Topic$/i,'').slice(0,70);
  const previousArtist=String([...likedRows,...context].find(x=>
    cleanArtist(x.artist)&&cleanArtist(x.artist)!==cleanArtist(artist))?.artist||'').slice(0,70);
  const style=inferStyle(current,[...likedRows,...context],hint);
  const mood=String(hint||'').replace(/[^\p{L}\p{N} -]/gu,'').trim().slice(0,48);
  // Queries target SONGS, not playlists or the exact title of the current
  // recording. Multiple independent seeds avoid a generic, repetitive Up Next.
  const searches=[
    [artist ? artist+' similar artists songs official audio' : style+' songs official audio',2.15],
    [(mood||style)+' songs official audio',1.8],
    [previousArtist ? previousArtist+' similar songs official audio' : style+' new artists official audio',1.45]
  ];
  const unique=[...new Map(searches.map(([q,w])=>[q.toLowerCase(),[q,w]])).values()];
  const outcomes=await Promise.allSettled(unique.map(([q])=>search(q,22)));
  const pool=new Map(),provenance={};
  outcomes.forEach((result,index)=>{
    if(result.status!=='fulfilled'||!Array.isArray(result.value))return;
    const weight=unique[index][1];
    for(const [i,t] of result.value.entries()){
      if(!t?.id)continue;
      if(!pool.has(t.id))pool.set(t.id,t);
      provenance[t.id]=(provenance[t.id]||0)+weight*(1-i/42);
    }
  });
  return {style,strategy:'artist-profile-and-mood-radio-v2',personalized:likedRows.length>0||context.length>0,
    searched:outcomes.filter(x=>x.status==='fulfilled').length,
    tracks:rankRadio([...pool.values()],{current,recent:context,liked:likedRows,queued,hint,style,mode,limit,provenance})};
}
