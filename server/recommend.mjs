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
function playable(t) {
  if(!t?.id||!t?.title)return false;
  if(t.duration>0&&(t.duration<55||t.duration>700))return false;
  const lower=String(t.title||'').toLowerCase();
  return !/\b(reacts?|reaction|interview|documentary|tutorial|full album|1 hour|10 hours|playlist|compilation)\b/.test(lower);
}
function contextRows(input) {
  return (Array.isArray(input)?input:[]).slice(0,12).filter(x=>x && typeof x==='object')
    .map(x=>({title:String(x.title||'').slice(0,150),artist:String(x.artist||'').slice(0,100),
      id:String(x.id||'').slice(0,60)}));
}
export function rankRadio(candidates,options={}) {
  const current=options.current||{};
  const recent=contextRows(options.recent);
  const queued=contextRows(options.queued);
  const forbidden=[current,...recent.slice(0,7),...queued];
  const seenIds=new Set(forbidden.map(x=>x.id).filter(Boolean));
  const mode=['familiar','balanced','discover'].includes(options.mode)?options.mode:'balanced';
  const style=options.style||inferStyle(current,recent,options.hint);
  const perArtist=new Map(),seenSongs=[];
  const list=(candidates||[]).filter(playable).filter(x=>{
    if(seenIds.has(x.id))return false;
    if(forbidden.some(other=>sameSong(x,other)))return false;
    return true;
  }).map((x,i)=>{
    const currentArtist=artistLike(x,current);
    const historic=recent.filter(r=>artistLike(x,r)).length;
    const title=String(x.title||'').toLowerCase();
    const styleHits=(STYLES[style]||[]).filter(k=>title.includes(k)||String(x.album||'').toLowerCase().includes(k)).length;
    const sameArtistWeight=mode==='familiar'?6:mode==='balanced'?2.5:-3.5;
    const unseen=recent.every(r=>!artistLike(x,r));
    const score=(options.provenance?.[x.id]||0)*3+(currentArtist?sameArtistWeight:0)
      +Math.min(2,historic)*1.4+Math.min(2,styleHits)*2.4+(unseen&&mode==='discover'?3:0)
      -(x.duration===0?.4:0)-(i*.025);
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
  for(const track of list){ if(output.length>=(options.limit||12))break; add(track,maxArtist); }
  if(output.length<Math.min(5,options.limit||12))
    for(const track of list){if(output.length>=(options.limit||12))break;add(track,2);}
  return output;
}
export async function createRadio({search,current={},recent=[],queued=[],hint='',mode='balanced',limit=12}) {
  const context=contextRows(recent);
  const artist=String(current.artist||context[0]?.artist||'').trim().replace(/ - Topic$/i,'').slice(0,75);
  const recentArtist=String(context.find(x=>cleanArtist(x.artist)!==cleanArtist(artist))?.artist||'').slice(0,70);
  const style=inferStyle(current,context,hint);
  const sanitizedHint=String(hint||'').replace(/[^\w \u3040-\u30ff-]/g,'').slice(0,45).trim();
  const searches=[
    [artist ? artist+' radio similar artists songs' : style+' songs mix', 2.0],
    [sanitizedHint ? sanitizedHint+' similar vibe songs' : style+' '+(mode==='discover'?'underrated artists':'songs')+' mix',1.35],
    [recentArtist ? recentArtist+' '+style+' related music' : style+' alternative artists best songs',1.2]
  ];
  const unique=[...new Map(searches.map(([q,w])=>[q.toLowerCase(),[q,w]])).values()];
  const outcomes=await Promise.allSettled(unique.map(([q])=>search(q,20)));
  const pool=new Map(),provenance={};
  outcomes.forEach((result,index)=>{
    if(result.status!=='fulfilled')return;
    const weight=unique[index][1];
    for(const [i,t] of result.value.entries()){
      if(!t?.id)continue;
      if(!pool.has(t.id))pool.set(t.id,t);
      provenance[t.id]=(provenance[t.id]||0)+(weight*(1-i/45));
    }
  });
  return {style,strategy:'artist-and-vibe-radio-v1',personalized:false,
    searched:outcomes.filter(x=>x.status==='fulfilled').length,
    tracks:rankRadio([...pool.values()],{current,recent:context,queued,hint,style,mode,limit,provenance})};
}
