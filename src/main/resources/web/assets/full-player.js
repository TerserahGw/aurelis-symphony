/* Aurelis Symphony 2.2 — standalone immersive fullscreen UI. The audio element
 * remains in v21.js; this module never starts a second audio player. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const ico = (name) => {
  const p = {
    down:'<path d="m5 9 7 7 7-7"/>',
    star:'<path d="m12 2 3.2 6.7 7.4 1.1-5.4 5.3 1.3 7.4-6.5-3.5-6.6 3.5 1.3-7.4-5.4-5.3 7.5-1.1z"/>',
    more:'<circle cx="4" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="20" cy="12" r="1.5"/>',
    play:'<path d="m8 4 13 8-13 8z"/>',
    pause:'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    next:'<path d="m4 5 12 7-12 7zM20 5v14"/>',
    prev:'<path d="m20 5-12 7 12 7zM4 5v14"/>',
    shuffle:'<path d="M3 7h3c6 0 6 10 12 10h3m-3-3 3 3-3 3M3 17h3c2 0 3-2 4-4m4-3c1-2 2-3 4-3h3m-3-3 3 3-3 3"/>',
    repeat:'<path d="M3 9V7a3 3 0 0 1 3-3h14m-3-3 3 3-3 3M21 15v2a3 3 0 0 1-3 3H4m3-3-3 3 3 3"/>',
    volume:'<path d="m11 5-5 4H3v6h3l5 4zM16 9a5 5 0 0 1 0 6M19 6a9 9 0 0 1 0 12"/>',
    volume2:'<path d="m11 5-5 4H3v6h3l5 4zM19 12H16"/>',
    words:'<path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM7 10h5M7 14h9"/>',
    queue:'<path d="M3 6h3M10 6h11M3 12h3M10 12h11M3 18h3M10 18h11"/>',
    translate:'<path d="M3 5h13M9 3v2M6 9a11 11 0 0 0 8 8M13 8c-1 5-4 8-9 10M14 21l4-10 4 10m-6.5-3h5"/>',
    roman:'<path d="M3 20V4h9a4 4 0 0 1 0 8H3m9 0 5 8M20 4v16"/>',
    cast:'<path d="M2 8V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6M2 13a8 8 0 0 1 8 8M2 17a4 4 0 0 1 4 4M2 21h.01"/>',
    up:'<path d="m6 14 6-6 6 6"/>',
    x:'<path d="M5 5l14 14M19 5 5 19"/>',
    music:'<path d="M10 18V5l11-2v13M10 18a3 2.5 0 1 1-6 0 3 2.5 0 0 1 6 0zM21 16a3 2.5 0 1 1-6 0 3 2.5 0 0 1 6 0z"/>'
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (p[name]||p.music) + '</svg>';
};
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const art = url => /^https:\/\//i.test(String(url||'')) ? String(url) : '';
const secs = v => { v=Math.max(0,Math.floor(Number(v)||0));return Math.floor(v/60)+':'+String(v%60).padStart(2,'0');};
const safeId = value => /^[A-Za-z0-9_-]{1,160}$/.test(String(value||'')) ? String(value) : '';
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem('aurelis:'+key)) ?? fallback; } catch {return fallback;} };
const save = (key,value) => { try { localStorage.setItem('aurelis:'+key,JSON.stringify(value)); } catch {} };
const box = document.createElement('div');
box.id='fullPlayer';
box.className='full-player';
box.hidden=true;
box.setAttribute('aria-hidden','true');
box.setAttribute('role','dialog');
box.setAttribute('aria-label','Aurelis Music Player');
box.innerHTML = `
  <div class="fp-backdrop"><img id="fpBackdrop" alt=""></div><div class="fp-wash"></div>
  <div class="fp-shell" id="fpShell">
    <span class="fp-handle" id="fpHandle"></span>
    <div class="fp-top">
      <button id="fpClose" class="fp-close" aria-label="Tutup pemutar">${ico('down')}</button>
      <div class="fp-small-art" id="fpArt"><span>✦</span></div>
      <div class="fp-track-head"><strong id="fpTitle">Belum ada lagu</strong><small id="fpArtist">Aurelis Symphony</small></div>
      <button id="fpLike" class="fp-icon" aria-label="Sukai lagu">${ico('star')}</button>
      <button id="fpMore" class="fp-icon" aria-label="Opsi lagu">${ico('more')}</button>
    </div>
    <div class="fp-main" id="fpMain">
      <section class="fp-pane fp-lyrics-pane current" id="fpLyricsPane" aria-label="Lirik lagu"></section>
      <section class="fp-pane fp-queue-pane" id="fpQueuePane" aria-label="Antrean musik"></section>
      <div class="fp-floating-tools" id="fpLyricsTools">
        <button id="fpTranslate" class="fp-round" aria-label="Tampilkan terjemahan Bahasa Indonesia" title="Terjemahkan">${ico('translate')}</button>
        <button id="fpRomanize" class="fp-round" aria-label="Tampilkan romanisasi" title="Romanisasi">${ico('roman')}</button>
      </div>
    </div>
    <div class="fp-bottom">
      <div id="fpBottomLabel" class="fp-bottom-label">Temukan musik favoritmu</div>
      <div class="fp-timeline"><input id="fpSeek" type="range" min="0" max="1000" value="0" aria-label="Posisi lagu"></div>
      <div class="fp-time"><span id="fpElapsed">0:00</span><span id="fpRemain">-0:00</span></div>
      <div class="fp-controls">
        <button id="fpPrev" class="fp-control" aria-label="Lagu sebelumnya">${ico('prev')}</button>
        <button id="fpPlay" class="fp-control primary" aria-label="Putar atau jeda">${ico('play')}</button>
        <button id="fpNext" class="fp-control" aria-label="Lagu berikutnya">${ico('next')}</button>
      </div>
      <div class="fp-volume-row">
        ${ico('volume2')}<input id="fpVolume" type="range" min="0" max="100" value="75" aria-label="Volume">${ico('volume')}
      </div>
      <div class="fp-menu">
        <button id="fpLyricsTab" class="fp-tab active" aria-label="Lirik">${ico('words')}</button>
        <div class="fp-middle-toggles">
          <button id="fpShuffle" aria-label="Acak">${ico('shuffle')}</button>
          <button id="fpRepeat" aria-label="Ulang">${ico('repeat')}</button>
          <button id="fpAutoplayIcon" aria-label="AutoPlay">\u221e</button>
        </div>
        <button id="fpQueueTab" class="fp-tab" aria-label="Lihat antrean">${ico('queue')}</button>
      </div>
      <div class="fp-device">AURELIS SYMPHONY · WEB PLAYER</div>
    </div>
  </div><div class="fp-toast" id="fpToast" aria-live="polite"></div>`;
document.body.appendChild(box);
const app = () => window.Aurelis;
let opened=false,closingTimer,tab='lyrics',trackId='',lastLyrics=null;
let translationEnabled=read('playerTranslation',false);
let romanEnabled=read('playerRomanization',true);
let translations=new Map(),translationBusy=false,lastFocus=-2,lastSeek=false;
let timerToast,touchY=0,touchX=0,lastTranslateIndex=-1;
let frame=0,lastFrame=0,lastKaraokeIndex=-999;
let lastKaraokeEnabled=true,lastLineGlowEnabled=true;
const prefs=()=>window.AurelisPreferences?.values || {karaoke:true,lineGlow:true,lyricSize:31,romanization:romanEnabled,translation:translationEnabled};
const lyricClock=s=>(Number(s.time)||0)+(window.AurelisPreferences?.getOffset(s.current)||0);
function flash(text) {
  $('fpToast').textContent=text;
  $('fpToast').classList.add('show');
  clearTimeout(timerToast);
  timerToast=setTimeout(()=>$('fpToast').classList.remove('show'),2600);
}
function formatArt(track) {
  const url=art(track?.artwork);
  return url?'<img alt="" src="'+esc(url)+'" referrerpolicy="no-referrer">':'<span>✦</span>';
}
function resetVisualTrack(t) {
  $('fpTitle').textContent=t?.title||'Belum ada lagu';
  $('fpArtist').textContent=t?.artist||'Aurelis Symphony';
  $('fpArt').innerHTML=formatArt(t);
  $('fpBackdrop').style.opacity=t?.artwork?'1':'0';
  if(art(t?.artwork)) $('fpBackdrop').src=t.artwork;
  else $('fpBackdrop').removeAttribute('src');
  $('fpBottomLabel').textContent=t?.title||'Pilih lagu dari katalog';
  $('fpMore').dataset.action=t?'menu':'';
  $('fpMore').dataset.id=safeId(t?.id);
}
function snapshot() {
  return app()?.snapshot() || {queue:[],suggestions:[],lyrics:null,autoplay:true,favorites:[],paused:true,duration:0,time:0};
}
function refresh() {
  if(!opened)return;
  const s=snapshot(), id=String(s.current?.id||'');
  if(id!==trackId){
    trackId=id;
    lastLyrics=null;lastFocus=-2;lastTranslateIndex=-1;
    resetVisualTrack(s.current);
    renderLyrics(true);renderQueue();
  }
  $('fpLike').classList.toggle('favored',!!id && s.favorites?.includes(id));
  $('fpPlay').innerHTML=ico(s.paused?'play':'pause');
  $('fpShuffle').classList.toggle('active',!!s.shuffle);
  $('fpRepeat').classList.toggle('active',!!s.repeat);
  $('fpAutoplayIcon').classList.toggle('active',!!s.autoplay);
  $('fpVolume').value=String(Math.round(s.volume*100));
  $('fpTranslate').classList.toggle('selected',!!translationEnabled);
  $('fpRomanize').classList.toggle('selected',!!romanEnabled);
  updateClock();
}
function updateClock() {
  if(!opened)return;
  const s=snapshot(), time=Number(s.time)||0, duration=Number(s.duration)||0;
  const ratio=duration?Math.min(1,Math.max(0,time/duration)):0;
  $('fpElapsed').textContent=secs(time);
  $('fpRemain').textContent='-'+secs(Math.max(0,duration-time));
  if(!lastSeek)$('fpSeek').value=String(Math.round(ratio*1000));
  $('fpSeek').style.setProperty('--pct',(ratio*100)+'%');
  updateFocus(s);
}
function focusIndex(lyrics,time) {
  if(!lyrics?.synced || !Array.isArray(lyrics.lines))return -1;
  let index=-1;
  for(let i=0;i<lyrics.lines.length;i++) {
    if(typeof lyrics.lines[i].time==='number' && lyrics.lines[i].time<=time+.07)index=i;
  }
  return index;
}
function paintKaraoke(s,index){
  if(tab!=='lyrics')return;
  const settings=prefs(),time=lyricClock(s);
  const lines=s.lyrics?.lines||[];
  const nodes=$('fpLyricsPane').querySelectorAll('[data-lyric-index]');
  // Repaint past/future lines only when the current line changes; animate
  // the active one at 30 fps to keep Android CPU and battery use predictable.
  if(index!==lastKaraokeIndex){
    lastKaraokeIndex=index;
    for(let i=0;i<nodes.length;i++){
      const fill=i<index?'100%':'0%';
      for(const span of nodes[i].querySelectorAll('[data-word-start],.fp-line-progress')){
        span.style.setProperty('--fill',fill);
      }
    }
  }
  if(index<0||!nodes[index])return;
  const node=nodes[index],line=lines[index];
  if(!line)return;
  const words=node.querySelectorAll('[data-word-start]');
  if(words.length&&settings.karaoke!==false){
    for(const span of words){
      const start=Number(span.dataset.wordStart),end=Math.max(start+.05,Number(span.dataset.wordEnd)||start+.45);
      const fill=time<=start?0:time>=end?100:Math.min(100,Math.max(0,(time-start)/(end-start)*100));
      span.style.setProperty('--fill',fill.toFixed(1)+'%');
    }
  }
  const lineElement=node.querySelector('.fp-line-progress');
  if(lineElement){
    const start=Number(line.time)||0,end=Math.max(start+.25,Number(line.endTime)||start+3);
    const fill=settings.lineGlow===false?0:time<=start?0:time>=end?100:Math.min(100,(time-start)/(end-start)*100);
    lineElement.style.setProperty('--fill',fill.toFixed(1)+'%');
  }
}
function animateWords(now){
  if(!opened)return;
  if(now-lastFrame>=32){
    lastFrame=now;
    if(tab==='lyrics')updateClock();
  }
  frame=requestAnimationFrame(animateWords);
}
function updateFocus(s) {
  if(tab!=='lyrics')return;
  const index=focusIndex(s.lyrics,lyricClock(s));
  paintKaraoke(s,index);
  if(index===lastFocus)return;
  lastFocus=index;
  const children=$('fpLyricsPane').querySelectorAll('[data-lyric-index]');
  children.forEach((el,i)=>{
    el.classList.toggle('active',i===index);
    el.classList.toggle('past',i<index);
  });
  if(opened&&index>=0&&children[index]){
    const pane=$('fpLyricsPane'), node=children[index];
    pane.scrollTo({top:node.offsetTop-pane.offsetTop-pane.clientHeight*.22,
      behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches||prefs().reduceMotion?'auto':'smooth'});
  }
  if(translationEnabled && index!==lastTranslateIndex) requestTranslations();
}
function tabTo(value) {
  tab=value;
  $('fpLyricsPane').classList.toggle('current',value==='lyrics');
  $('fpQueuePane').classList.toggle('current',value==='queue');
  $('fpLyricsTab').classList.toggle('active',value==='lyrics');
  $('fpQueueTab').classList.toggle('active',value==='queue');
  $('fpLyricsTools').hidden=value!=='lyrics';
  if(value==='lyrics'){renderLyrics();updateClock();}else renderQueue();
}
// Offline romanization of Japanese kana and modern Hangul. Chinese characters
// require a dictionary and remain unchanged; never fabricate pronunciations.
const KANA = {
  'あ':'a','い':'i','う':'u','え':'e','お':'o','か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
  'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so','た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
  'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no','は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
  'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo','や':'ya','ゆ':'yu','よ':'yo','ら':'ra','り':'ri',
  'る':'ru','れ':'re','ろ':'ro','わ':'wa','を':'o','ん':'n','が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge',
  'ご':'go','ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo','だ':'da','ぢ':'ji','づ':'zu',
  'で':'de','ど':'do','ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo','ぱ':'pa','ぴ':'pi',
  'ぷ':'pu','ぺ':'pe','ぽ':'po','ゃ':'ya','ゅ':'yu','ょ':'yo','ぁ':'a','ぃ':'i','ぅ':'u',
  'ぇ':'e','ぉ':'o','ゔ':'vu','ー':'-'
};
const DIGRAPHS={ 'し':'sh','ち':'ch','じ':'j','ぢ':'j' };
function kanaRomaji(value) {
  const kana=String(value).replace(/[\u30a1-\u30f6]/g,x=>String.fromCharCode(x.charCodeAt(0)-96));
  let result='';
  for(let i=0;i<kana.length;i++){
    const ch=kana[i],next=kana[i+1];
    if(ch==='っ' && next){const nextSound=(DIGRAPHS[next] || KANA[next] || '');result+=nextSound[0]||'';continue;}
    if('ゃゅょ'.includes(next||'')&&KANA[ch]){
      const base=DIGRAPHS[ch] || KANA[ch].replace(/i$/,'');
      result+=base+(KANA[next]||'');i++;continue;
    }
    if(ch==='ー'){const v=/[aeiou]$/.exec(result);if(v)result+=v[0];continue;}
    result+=KANA[ch]??ch;
  }
  return result;
}
const L=['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
const V=['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
const T=['','k','k','ks','n','nj','nh','t','l','lk','lm','lb','ls','lt','lp','lh','m','p','ps','t','t','ng','t','t','k','t','p','t'];
function hangulRomaji(value) {
  return [...value].map(ch=>{
    const cp=ch.codePointAt(0),n=cp-0xac00;
    if(n<0||n>11171)return ch;
    return L[Math.floor(n/588)]+V[Math.floor((n%588)/28)]+T[n%28];
  }).join('');
}
function romanize(value) {
  const txt=String(value||'');
  let result=kanaRomaji(txt);
  result=hangulRomaji(result);
  return result!==txt?result:'';
}
function renderLyrics(force=false) {
  if(!opened||tab!=='lyrics')return;
  const s=snapshot(),l=s.lyrics;
  if(l===lastLyrics&&!force)return;
  lastLyrics=l;
  const pane=$('fpLyricsPane');
  if(!s.current){pane.innerHTML='<p class="fp-lyrics-empty">✦<br>Putar lagu untuk membuka lirik</p>';return;}
  if(!l){pane.innerHTML='<p class="fp-lyrics-empty">Mencari lirik untuk lagu ini…</p>';return;}
  if(!l.lines?.length){pane.innerHTML='<p class="fp-lyrics-empty">Lirik belum tersedia untuk lagu ini.</p>';return;}
  const key=String(s.current.id),options=prefs(),hasWords=l.lines.some(line=>line.words?.length);
  pane.innerHTML='<div class="fp-translation-credit">Lirik oleh '+esc(l.source||'Aurelis')+
    ' · '+(hasWords?'Timestamp per kata':l.synced?'Sinkron per baris':'Tanpa timestamp')+
    (translationEnabled?' · Terjemahan Indonesia (MyMemory)':'')+'</div>'+
    l.lines.map((line,i)=>{
      const words=romanEnabled?romanize(line.text):'';
      const translated=translationEnabled?(translations.get(key+':'+i)||line.translation||''):'';
      let text;
      if(options.karaoke!==false&&Array.isArray(line.words)&&line.words.length){
        text='<span class="fp-line-words">'+line.words.map(w=>'<span class="fp-word" data-word-start="'+
          Number(w.start||0)+'" data-word-end="'+Number(w.end||w.start+.45)+'">'+esc(w.text||'')+'</span>').join('')+'</span>';
      }else if(l.synced&&options.lineGlow!==false&&typeof line.time==='number'){
        text='<span class="fp-line-progress">'+esc(line.text)+'</span>';
      }else{
        text='<span class="fp-line-plain">'+esc(line.text)+'</span>';
      }
      return '<div class="fp-lyric" data-lyric-index="'+i+'" data-time="'+
        (typeof line.time==='number'?line.time:'')+'"><span class="fp-lyric-body">'+text+'</span>'+
        (words?'<div class="fp-lyric-roman">'+esc(words)+'</div>':'')+
        (translated?'<div class="fp-lyric-sub">'+esc(translated)+'</div>':'')+'</div>';
    }).join('');
  lastFocus=-2;lastKaraokeIndex=-999;
  updateFocus(s);
  if(translationEnabled)requestTranslations();
}
async function requestTranslations() {
  const s=snapshot(), lines=s.lyrics?.lines;
  if(!opened||!translationEnabled||translationBusy||tab!=='lyrics'||!lines?.length||!s.current)return;
  const idx=Math.max(0,focusIndex(s.lyrics,lyricClock(s)));
  const key=String(s.current.id);
  const wanted=Array.from({length:Math.min(10,lines.length)},(_,j)=>Math.min(lines.length-1,Math.max(0,idx-2)+j));
  const indices=[...new Set(wanted)].filter(i=>!translations.has(key+':'+i) && !!lines[i]?.text);
  if(!indices.length)return;
  translationBusy=true;
  lastTranslateIndex=idx;
  try {
    const response=await fetch('/api/v2/translate',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({texts:indices.map(i=>lines[i].text),target:'id'})});
    const data=await response.json();
    if(!data.ok)throw new Error(data.message||'Penerjemahan tidak tersedia');
    if(key!==snapshot().current?.id)return;
    indices.forEach((i,j)=>{if(data.translations?.[j])translations.set(key+':'+i,data.translations[j]);});
    lastLyrics=null;renderLyrics(true);
  } catch(e) { if(translationEnabled)flash('Terjemahan belum tersedia: '+e.message); }
  finally{translationBusy=false;}
}
function qRow(track,kind,i) {
  const img=art(track.artwork);
  return '<div class="fp-queue-row"><div class="fp-queue-img">'+(img?'<img src="'+esc(img)+'" alt="">':'✦')+
    '</div><button class="fp-q-text" data-qplay="'+kind+'" data-qindex="'+i+'"><strong>'+
    esc(track.title||'Unknown')+'</strong><small>'+esc(track.artist||'Unknown artist')+'</small></button>'+
    (kind==='current'?'<span style="font-size:20px;opacity:.8">♫</span>':
      (kind==='manual'?
      '<button class="fp-q-button" aria-label="Naikkan lagu" data-qmove="-1" data-qindex="'+i+'">'+ico('up')+'</button>':'')+
      '<button class="fp-q-button" aria-label="Hapus dari antrean" data-qremove="'+kind+'" data-qindex="'+i+'">'+ico('x')+'</button>')+'</div>';
}
function renderQueue() {
  if(!opened||tab!=='queue')return;
  const s=snapshot();
  $('fpQueuePane').innerHTML='<h2 class="fp-queue-title">Antrean</h2>'+
    (s.current?'<div class="fp-group-head">Sedang diputar</div>'+qRow(s.current,'current',0):'')+
    (s.queue?.length?'<div class="fp-group-head">Ditambahkan berikutnya</div>'+
      s.queue.map((t,i)=>qRow(t,'manual',i)).join(''):'')+
    '<div class="fp-autoplay"><span class="fp-infinity">∞</span>'+
    '<span class="fp-autoplay-copy"><strong>AutoPlay</strong><small>Musik serupa setelah antrean habis</small></span>'+
    '<button id="fpAutoSwitch" class="fp-switch '+(s.autoplay?'on':'')+
    '" role="switch" aria-checked="'+!!s.autoplay+'" aria-label="AutoPlay on/off"></button></div>'+
    (s.autoplay?(s.suggestions?.length?s.suggestions.map((t,i)=>qRow(t,'auto',i)).join(''):
      '<p class="fp-queue-placeholder">Rekomendasi akan muncul saat kamu mulai memutar musik.</p>'):
      '<p class="fp-queue-placeholder">AutoPlay dinonaktifkan. Hanya lagu dalam antrean yang akan diputar.</p>');
}
function open() {
  if(opened)return;
  opened=true;
  clearTimeout(closingTimer);
  box.hidden=false;
  box.classList.remove('closing');
  box.setAttribute('aria-hidden','false');
  tab='lyrics';trackId='';lastLyrics=null;
  document.body.classList.add('aurelis-fullscreen-open');
  tabTo('lyrics');
  requestAnimationFrame(()=>{box.classList.add('open');refresh();});
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(animateWords);
}
function close() {
  if(!opened)return;
  opened=false;
  cancelAnimationFrame(frame);
  box.classList.add('closing');
  box.classList.remove('open');
  box.setAttribute('aria-hidden','true');
  document.body.classList.remove('aurelis-fullscreen-open');
  clearTimeout(closingTimer);
  closingTimer=setTimeout(()=>{if(!opened){box.hidden=true;box.classList.remove('closing');}},440);
}
window.AurelisFullscreen={open,close};
$('fpClose').addEventListener('click',close);
$('fpHandle').addEventListener('click',close);
$('fpLike').addEventListener('click',()=>app()?.toggleLike());
$('fpPlay').addEventListener('click',()=>app()?.toggle());
$('fpNext').addEventListener('click',()=>app()?.next());
$('fpPrev').addEventListener('click',()=>app()?.previous());
$('fpLyricsTab').addEventListener('click',()=>tabTo('lyrics'));
$('fpQueueTab').addEventListener('click',()=>tabTo('queue'));
$('fpTranslate').addEventListener('click',()=>{
  translationEnabled=!translationEnabled;
  save('playerTranslation',translationEnabled);
  window.AurelisPreferences?.set('translation',translationEnabled);
  $('fpTranslate').classList.toggle('selected',translationEnabled);
  lastLyrics=null;renderLyrics(true);
  if(translationEnabled)flash('Terjemahan Indonesia dinyalakan');
});
$('fpRomanize').addEventListener('click',()=>{
  romanEnabled=!romanEnabled;
  save('playerRomanization',romanEnabled);
  window.AurelisPreferences?.set('romanization',romanEnabled);
  $('fpRomanize').classList.toggle('selected',romanEnabled);
  lastLyrics=null;renderLyrics(true);
  flash(romanEnabled?'Romanisasi Jepang / Korea aktif':'Romanisasi dimatikan');
});
$('fpShuffle').addEventListener('click',()=>app()?.toggleShuffle());
$('fpRepeat').addEventListener('click',()=>app()?.toggleRepeat());
$('fpAutoplayIcon').addEventListener('click',()=>{
  const enabled=app()?.toggleAutoplay();
  flash(enabled?'AutoPlay dinyalakan':'AutoPlay dimatikan');
  renderQueue();
});
$('fpQueuePane').addEventListener('click',event=>{
  const auto=event.target.closest('#fpAutoSwitch');
  if(auto){const enabled=app()?.toggleAutoplay();flash(enabled?'AutoPlay aktif':'AutoPlay mati');renderQueue();return;}
  const rm=event.target.closest('[data-qremove]');
  if(rm){app()?.removeItem(rm.dataset.qremove,Number(rm.dataset.qindex));renderQueue();return;}
  const move=event.target.closest('[data-qmove]');
  if(move){app()?.moveQueue(Number(move.dataset.qindex),Number(move.dataset.qmove));renderQueue();return;}
  const play=event.target.closest('[data-qplay]');
  if(play && play.dataset.qplay!=='current'){
    app()?.playItem(play.dataset.qplay,Number(play.dataset.qindex));
    tabTo('lyrics');
  }
});
$('fpLyricsPane').addEventListener('click',event=>{
  const line=event.target.closest('[data-lyric-index]');
  if(!line)return;
  const time=Number(line.dataset.time);
  if(line.dataset.time!==''&&Number.isFinite(time))app()?.seek(time);
});
$('fpSeek').addEventListener('pointerdown',()=>{lastSeek=true;});
$('fpSeek').addEventListener('pointerup',()=>{lastSeek=false;});
$('fpSeek').addEventListener('input',e=>{
  e.target.style.setProperty('--pct',(Number(e.target.value)/10)+'%');
});
$('fpSeek').addEventListener('change',e=>{
  const s=snapshot();
  app()?.seek((Number(e.target.value)/1000)*(Number(s.duration)||0));
  lastSeek=false;
});
$('fpVolume').addEventListener('input',e=>app()?.setVolume(Number(e.target.value)/100));
$('fpShell').addEventListener('touchstart',e=>{
  if(e.touches.length===1){touchY=e.touches[0].clientY;touchX=e.touches[0].clientX;}
},{passive:true});
$('fpShell').addEventListener('touchend',e=>{
  if(!touchY||!e.changedTouches?.length)return;
  const y=e.changedTouches[0].clientY-touchY;
  const x=e.changedTouches[0].clientX-touchX;
  const target=e.target;
  if(y>115 && Math.abs(y)>Math.abs(x)*1.8 && (target.closest('#fpHandle,#fpClose,.fp-top') ||
    target.closest('#fpLyricsPane')?.scrollTop<=2 || target.closest('#fpQueuePane')?.scrollTop<=2))close();
  else if(Math.abs(x)>95 && Math.abs(x)>Math.abs(y)*2 && target.closest('#fpMain'))tabTo(x<0?'queue':'lyrics');
  touchY=0;touchX=0;
},{passive:true});
document.addEventListener('keydown',event=>{if(opened&&event.key==='Escape')close();});
window.addEventListener('aurelis:preferences',()=>{
  const current=prefs();
  const newTranslation=!!current.translation,newRoman=!!current.romanization;
  const rerender=newTranslation!==translationEnabled || newRoman!==romanEnabled
    || current.karaoke!==lastKaraokeEnabled || current.lineGlow!==lastLineGlowEnabled;
  translationEnabled=newTranslation;romanEnabled=newRoman;
  lastKaraokeEnabled=current.karaoke;lastLineGlowEnabled=current.lineGlow;
  if(opened){refresh();if(rerender){lastLyrics=null;renderLyrics(true);}else updateFocus(snapshot());}
});
window.addEventListener('aurelis:track',()=>{if(opened){refresh();renderLyrics(true);renderQueue();}});
window.addEventListener('aurelis:player',()=>refresh());
window.addEventListener('aurelis:time',()=>updateClock());
window.addEventListener('aurelis:lyrics',()=>{lastLyrics=null;renderLyrics(true);});
window.addEventListener('aurelis:queue',()=>{if(opened){renderQueue();refresh();}});
window.addEventListener('aurelis:favorites',()=>refresh());
window.addEventListener('aurelis:error',()=>{
  if(opened){const s=snapshot();if(s.error)flash(s.error);}
});
})();
