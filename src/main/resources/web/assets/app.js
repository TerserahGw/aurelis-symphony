(() => {
'use strict';
const $ = id => document.getElementById(id);
const $$ = s => [...document.querySelectorAll(s)];
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const enc = encodeURIComponent;
const safe = s => String(s ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const validImage = url => /^https:\/\//i.test(String(url||'')) ? String(url) : '';
const getLocal = (k, fallback) => { try { return JSON.parse(localStorage.getItem('aurelis:'+k)) ?? fallback; } catch { return fallback; } };
const putLocal = (k, value) => { try { localStorage.setItem('aurelis:'+k, JSON.stringify(value)); } catch {} };
const audio = $('audio');
let catalog=[], visible=[], current=null, currentView='home', activeFilter='all', source='catalog', playing=false;
let favorites=new Set(getLocal('favorites',[])), history=getLocal('history',[]), playlists=getLocal('playlists',[]);
let trackCache=getLocal('trackCache',{}), actionTrack=null;
let queue=getLocal('queue',[]), autoQueue=[], shuffle=getLocal('shuffle',false), repeat=getLocal('repeat',false);
let words=[], currentLine=-1, lyricsAbort=null, lyricSyncActive=false, searchTimer=null, resultId=0, currentSearch='';
let draggingSeek=false, musicRequestAbort=null, playSequence=0, animationId=null, lastAnimation=0, cloudToken=getLocal('cloudToken',null);
const formatTime = sec => {sec=Math.max(0,Math.floor(Number(sec)||0));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');};
const duration = t => formatTime(t?.duration||0);
const toast = message => {let el=document.createElement('div');el.className='toast';el.textContent=message;$('toasts').append(el);setTimeout(()=>{el.style.opacity='0';el.style.transition='opacity .3s';setTimeout(()=>el.remove(),300);},3600);};
const save = () => {putLocal('favorites',[...favorites]);putLocal('playlists',playlists);putLocal('history',history.slice(0,40));putLocal('trackCache',trackCache);putLocal('queue',queue);putLocal('shuffle',shuffle);putLocal('repeat',repeat);};
const cover = (t, cls) => {let img=validImage(t?.artwork);return `<div class="${cls}">${img?`<img src="${safe(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<div class="art-shape"></div>'}</div>`;};
const empty = (mark,title,subtitle) => `<div class="empty-state"><span class="empty-mark">${safe(mark)}</span><h3>${safe(title)}</h3><p>${safe(subtitle)}</p></div>`;

async function api(path, options={}) {const res=await fetch(path,{...options,headers:{'Accept':'application/json',...(options.headers||{})}});let body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.message||body.error||'Server is unavailable');return body;}
async function init() {
  audio.volume=getLocal('volume',.7);$('volume').value=String(Math.round(audio.volume*100));$('volume').style.setProperty('--pct',`${audio.volume*100}%`);
  $('reduceMotion').checked=getLocal('reduceMotion',false);document.documentElement.classList.toggle('reduce-motion',$('reduceMotion').checked);
  $('cloudSync').checked=getLocal('cloudSync',false);$('repeatButton').classList.toggle('active',repeat);$('shuffleButton').classList.toggle('active',shuffle);
  try {let body=await api('/api/v1/catalog');catalog=Array.isArray(body.tracks)?body.tracks:[];visible=[...catalog];render();}catch(err){$('musicGrid').innerHTML=empty('!', 'Cannot load your library', 'The music server is unavailable. '+err.message);}
  renderPlaylists();renderQueue();setupEvents();setView('home');
  if($('cloudSync').checked)await pullCloud();
  if('mediaSession' in navigator){navigator.mediaSession.setActionHandler('play',()=>audio.play().catch(()=>{}));navigator.mediaSession.setActionHandler('pause',()=>audio.pause());navigator.mediaSession.setActionHandler('nexttrack',next);navigator.mediaSession.setActionHandler('previoustrack',previous);}
}
function render(){
  let tracks=visible;
  if(activeFilter==='favorites'&&currentView!=='favorites')tracks=tracks.filter(t=>favorites.has(t.id));
  if(activeFilter==='recent')tracks=[...history].map(id=>findTrack(id)).filter(Boolean);
  const title=currentView==='favorites'?'Songs you love':currentView==='library'?'Your collections':currentView==='playlist'?(playlists.find(p=>p.id===window.activePlaylistId)?.name||'Your playlist'):currentView==='explore'?'Explore the universe':'Find something beautiful';
  $('listTitle').textContent=title;
  if(currentView==='library'){
    $('resultsStatus').textContent=playlists.length+' playlists';
    $('musicGrid').innerHTML=`<button class="playlist-creation" data-create-playlist="true"><span>+</span><strong>Create playlist</strong><small>Start something new</small></button>`+playlists.map(p=>`<button class="playlist-creation playlist-card" data-playlistcard="${safe(p.id)}"><span>♫</span><strong>${safe(p.name)}</strong><small>${p.tracks.length} tracks</small></button>`).join('');
    return;
  }
  $('resultsStatus').textContent=`${tracks.length} ${tracks.length===1?'track':'tracks'}`;
  if(!tracks.length){$('musicGrid').innerHTML=empty('✧',currentView==='favorites'?'No liked songs yet':'A quiet moment','Try another search or save songs you love.');return;}
  $('musicGrid').innerHTML=tracks.map((t,i)=>`<article class="music-card" style="animation-delay:${Math.min(i*28,240)}ms" data-id="${safe(t.id)}">
    ${cover(t,'card-art')}<button class="card-add" data-action="menu" data-index="${i}" title="More actions" aria-label="Actions for ${safe(t.title)}">${icon('plus')}</button><span class="card-duration" style="left:auto;right:16px">${duration(t)}</span><button class="card-play" title="Play ${safe(t.title)}" data-action="play" data-index="${i}" aria-label="Play ${safe(t.title)}">${icon('play')}</button>
    <div class="card-info"><div><h3 title="${safe(t.title)}">${safe(t.title)}</h3><p>${safe(t.artist||'Unknown artist')}</p></div><button class="icon-button card-more ${favorites.has(t.id)?'card-liked':''}" data-action="like" data-index="${i}" aria-label="${favorites.has(t.id)?'Unlike':'Like'} ${safe(t.title)}" title="Like">${icon('heart')}</button></div></article>`).join('');
  window.displayedTracks=tracks;
}
function findTrack(id){return [...catalog,...visible,...queue,...autoQueue].find(t=>t?.id===id)||trackCache[id]||null;}
function renderPlaylists(){
  $('playlistNav').innerHTML=playlists.map(p=>`<button class="playlist-link ${window.activePlaylistId===p.id?'active':''}" data-playlist="${safe(p.id)}">${icon('disc')}<span>${safe(p.name)}</span></button>`).join('');
}
function setView(view){currentView=view;$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('currentCrumb').textContent=view==='home'?'DISCOVER':view.toUpperCase();
  if(view==='explore'){$('hero').hidden=true;$('exploreSection').scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('searchInput').focus(),240);}
  else if(view==='home'){$('hero').hidden=false;activeFilter='all';$$('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));}
  else if(view==='library'){$('hero').hidden=true;visible=[...catalog];}
  else if(view==='favorites'){$('hero').hidden=true;visible=[...catalog,...history.map(findTrack).filter(Boolean),...queue].filter((v,i,a)=>v&&favorites.has(v.id)&&a.findIndex(t=>t.id===v.id)===i);}
  if(view==='home'){source='catalog';$('musicSource').value='catalog';$('searchInput').value='';visible=[...catalog];}
  render();
}
function showPanel(panel='lyrics'){$('lyricsPanel').classList.add('open');$$('.panel-tab').forEach(x=>x.classList.toggle('active',x.dataset.panel===panel));$$('.panel-view').forEach(x=>x.classList.toggle('active',x.id===(panel==='lyrics'?'lyricsView':'queueView')));if(panel==='queue')renderQueue();}
function closePanel(){$('lyricsPanel').classList.remove('open');}
function makeAutoQueue(){const all=[...visible,...catalog].filter(t=>t&&t.id!==current?.id&&!queue.some(q=>q.id===t.id));const unique=[...new Map(all.map(t=>[t.id,t])).values()];if(shuffle)unique.sort(()=>Math.random()-.5);else{let n=unique.findIndex(t=>t.id===current?.id);if(n>=0)unique.push(...unique.splice(0,n));}autoQueue=unique.slice(0,3);renderQueue();}
function updatePlayer(){
  $('playerTitle').textContent=current?.title||'Nothing playing yet';$('playerArtist').textContent=current?.artist||'Your next favorite starts here';
  $('playerCover').innerHTML=validImage(current?.artwork)?`<img src="${safe(current.artwork)}" alt="">`:'✦';
  $('playerFav').classList.toggle('liked',!!current&&favorites.has(current.id));
  $('playButton').innerHTML=icon(playing?'pause':'play');$('elapsed').textContent=formatTime(audio.currentTime);$('total').textContent=formatTime(Number.isFinite(audio.duration)?audio.duration:(current?.duration||0));
  if(current&&'mediaSession' in navigator){try{navigator.mediaSession.metadata=new MediaMetadata({title:current.title,artist:current.artist,album:current.album||'Aurelis Symphony',artwork:validImage(current.artwork)?[{src:current.artwork}]:[]});}catch{}}
}
async function playTrack(t){
  if(!t)return;const seq=++playSequence;
  current=t;playing=false;audio.pause();audio.removeAttribute('src');audio.load();
  trackCache[t.id]=t;history=[t.id,...history.filter(x=>x!==t.id)].slice(0,40);save();updatePlayer();makeAutoQueue();
  updateLyricHeader();loadLyrics();
  if(t.audio){audio.src=t.audio;try{await audio.play();if(seq!==playSequence)return;}catch(e){if(seq===playSequence)toast('Tap play again to start audio.');}return;}
  if(!t.url){toast('This song has no playable audio source.');return;}
  toast('Checking available audio…');
  try{
    const result=await api('/api/v1/info?url='+enc(t.url));if(seq!==playSequence)return;
    const formats=Array.isArray(result.track?.audio)?result.track.audio:[];
    const direct=formats.find(f=>f.url&&/^https:\/\//.test(f.url)&&!String(f.delivery||'').toLowerCase().includes('dash'))||formats[0];
    if(!direct?.url){unplayable(t);return;}
    audio.src=direct.url;audio.load();try{await audio.play();}catch{if(seq===playSequence)unplayable(t);}
  }catch(e){if(seq===playSequence)unplayable(t);}
}
function unplayable(t){
  toast('Playback is restricted by the music provider. Open the original source.');
  $('lyricNote').innerHTML=`PLAYBACK UNAVAILABLE · <a class="external-link" href="${safe(t.url||'#')}" target="_blank" rel="noopener">OPEN ORIGINAL ${icon('external')}</a>`;
}
function togglePlay(){if(!current){playTrack(visible[0]||catalog[0]);return;}if(audio.paused)audio.play().catch(()=>toast('This source cannot be played here.'));else audio.pause();}
function next(){let item=queue.shift();if(!item){item=autoQueue.shift();}if(!item){if(!repeat){audio.pause();return;}item=current;}save();playTrack(item);}
function previous(){if(audio.currentTime>3){audio.currentTime=0;return;}let prev=history.slice(1).map(findTrack).find(Boolean);if(prev)playTrack(prev);else audio.currentTime=0;}
function openPlaylist(id){window.activePlaylistId=id;const p=playlists.find(p=>p.id===id);currentView='playlist';$('hero').hidden=true;visible=(p?.tracks||[]).map(x=>typeof x==='string'?findTrack(x):x).filter(Boolean);renderPlaylists();render();}
function showSongActions(t){if(!t)return;actionTrack=t;trackCache[t.id]=t;$('actionTrackName').textContent=t.title;$('actionTrackArtist').textContent=t.artist||'Unknown artist';$('actionLike').innerHTML=icon('heart')+(favorites.has(t.id)?' Unlike track':' Like track');$('actionPlaylist').innerHTML='<option value="">Choose a playlist...</option>'+playlists.map(p=>`<option value="${safe(p.id)}">${safe(p.name)}</option>`).join('');$('songActionDialog').showModal();}
function toggleFavorite(t){if(!t)return;favorites.has(t.id)?favorites.delete(t.id):favorites.add(t.id);save();render();updatePlayer();toast(favorites.has(t.id)?'Added to liked songs':'Removed from liked songs');}
function addQueue(t){if(!t)return;trackCache[t.id]=t;queue.push(t);save();makeAutoQueue();toast('Added to your queue');}
function renderQueue(){let items=[...(current?[{...current,now:true}]:[]),...queue,...autoQueue];$('queueList').innerHTML=items.length?items.map((t,i)=>`<div class="queue-row"><div class="queue-thumb">${validImage(t.artwork)?`<img src="${safe(t.artwork)}" alt="">`:'✦'}</div><div class="queue-text"><strong>${safe(t.title)}</strong><small>${t.now?'Now playing':i<=queue.length?'Added to queue':'Suggested next'} · ${safe(t.artist)}</small></div>${!t.now?`<button class="icon-button" data-remove-queue="${i-1}" aria-label="Remove from queue">${icon('close')}</button>`:''}</div>`).join(''):empty('♫','Your queue is empty','Choose a song to start your listening journey.');}
function updateLyricHeader(){
  $('lyricTrackTitle').textContent=current?.title||'Find your frequency';$('lyricTrackArtist').textContent=current?.artist||'Pick a song to begin';
  $('lyricArt').innerHTML=validImage(current?.artwork)?`<img src="${safe(current.artwork)}" alt="Album artwork">`:'<span class="lyric-art-icon">✦</span>';
  $('lyricNote').textContent='SYNCED LYRICS · TIME WITH THE MUSIC';
}
async function loadLyrics(){
  if(lyricsAbort)lyricsAbort.abort();lyricsAbort=new AbortController();let seq=current?.id;words=[];currentLine=-1;lyricSyncActive=false;
  if(!current){$('lyricContent').innerHTML='<div class="lyric-intro"><p>Music, in its own words.</p></div>';return;}
  if(current.lyrics?.length){renderLyrics(current.lyrics,{source:'Aurelis demo',synced:true});return;}
  $('lyricContent').innerHTML='<div class="lyric-intro"><div class="intro-symbol">✧</div><p>Finding the words...</p><span>Searching multiple lyric sources</span></div>';
  let cleanTitle=String(current.title).replace(/\s*[\[(](official|music video|lyrics?|audio|HD|4K).*?[\])]/gi,'').replace(/\s*[-–|]\s*Official.*/i,'').trim();
  try{
    const qs=new URLSearchParams({track:cleanTitle,artist:String(current.artist||'').replace(/\s*-\s*Topic$/i,''),duration:Math.round(current.duration||0)});
    if($('lyricSource').value)qs.set('source',$('lyricSource').value);
    let data=await api('/api/v1/lyrics?'+qs,{signal:lyricsAbort.signal});if(current?.id!==seq)return;
    if(data.result)renderLyrics(data.result.lines,data.result);
    else{$('lyricContent').innerHTML='<div class="lyric-intro"><div class="intro-symbol">✧</div><p>No lyrics found.</p><span>Try another source or song.</span></div>';$('lyricNote').textContent='NO MATCH · TRY ANOTHER SOURCE';}
  }catch(e){if(e.name==='AbortError')return;$('lyricContent').innerHTML='<div class="lyric-intro"><p>Lyrics unavailable.</p><span>The provider may be temporarily offline.</span></div>';}
}
function renderLyrics(lines,meta={}){
  words=Array.isArray(lines)?lines.filter(l=>String(l.text||'').trim()):[];
  if(!words.length){$('lyricContent').innerHTML='<div class="lyric-intro"><p>Instrumental journey.</p></div>';return;}
  lyricSyncActive=words.some(l=>Number.isFinite(Number(l.time))&&l.time!==null);
  $('lyricContent').innerHTML=words.map((l,i)=>{
    let wordMarkup=Array.isArray(l.words)&&l.words.length?l.words.map((w,j)=>`<span class="word" data-word="${j}" data-start="${Number(w.start)||0}" data-end="${Number(w.end)||0}">${safe(w.text)}</span>`).join(' '):safe(l.text);
    return `<div class="lyric-line future" data-line="${i}" data-start="${l.time===null?'':Number(l.time)||0}">${wordMarkup}${l.translation?`<p class="translation">${safe(l.translation)}</p>`:''}</div>`;
  }).join('');
  $('lyricNote').textContent=`${safe(meta.source||'Aurelis').toUpperCase()} · ${meta.wordLevel?'WORD-SYNC':lyricSyncActive?'LINE-SYNC':'PLAIN LYRICS'}`;
  syncLyrics(true);
}
function syncLyrics(force=false){if(!words.length||!lyricSyncActive)return;let now=audio.currentTime;
  let pos=-1;for(let i=0;i<words.length;i++)if(words[i].time!=null&&Number(words[i].time)<=now+.06)pos=i;
  if(pos!==currentLine||force){
    currentLine=pos;$$('#lyricContent .lyric-line').forEach((el,i)=>{el.classList.toggle('active',i===pos);el.classList.toggle('future',i>pos);if(i<pos)el.classList.remove('future');});
    const target=$(`lyricContent`).querySelector(`[data-line="${pos}"]`);if(target&&(!document.documentElement.classList.contains('reduce-motion')))target.scrollIntoView({behavior:'smooth',block:'center'});
  }
  let active=$('lyricContent').querySelector('.lyric-line.active');if(active)active.querySelectorAll('.word').forEach(el=>{let s=Number(el.dataset.start),e=Number(el.dataset.end)||s+.4;let ratio=Math.max(0,Math.min(100,((now-s)/Math.max(.05,e-s))*100));el.style.setProperty('--fill',ratio.toFixed(1)+'%');});
}
function lyricLoop(time){if(time-lastAnimation>55){lastAnimation=time;syncLyrics();}animationId=requestAnimationFrame(lyricLoop);}
function setTimeUI(){let length=Number.isFinite(audio.duration)?audio.duration:Number(current?.duration)||0;
  $('elapsed').textContent=formatTime(audio.currentTime);$('total').textContent=formatTime(length);
  let value=length>0?Math.min(1,audio.currentTime/length):0;
  if(!draggingSeek){$('seek').value=String(Math.round(value*1000));$('seek').style.setProperty('--pct',(value*100).toFixed(2)+'%');}
  $('playerMobileFill').style.width=(value*100).toFixed(2)+'%';
}
async function search(){const seq=++resultId;let q=$('searchInput').value.trim();currentSearch=q;
  source=$('musicSource').value;
  if(!q){visible=[...catalog];render();return;}
  $('resultsStatus').textContent='Searching…';$('musicGrid').innerHTML=Array.from({length:6},()=>'<div class="loading-card"></div>').join('');
  try{
    const res=await api(source==='catalog'?'/api/v1/catalog?q='+enc(q):'/api/v1/search?provider='+enc(source)+'&q='+enc(q));
    if(seq!==resultId)return;visible=Array.isArray(res.tracks)?res.tracks:[];
    if(!visible.length&&source!=='catalog')toast('No results. This source might be restricting access.');render();
  }catch(e){if(seq!==resultId)return;visible=[];render();$('musicGrid').innerHTML=empty('!', 'Search not available', e.message+' · Try Aurelis Library instead.');}
}
async function pullCloud(){
  try{const config=await api('/api/v1/config');if(!config.cloudLibrary){toast('Cloud library is disabled on this server. Your data stays in this browser.');$('cloudSync').checked=false;return;}
    if(!cloudToken){let bytes=crypto.getRandomValues(new Uint8Array(32));cloudToken=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');putLocal('cloudToken',cloudToken);}
    let data=await api('/api/v1/library',{headers:{Authorization:'Bearer '+cloudToken}});
    if(data.favorites||data.playlists){favorites=new Set(data.favorites||[]);playlists=data.playlists||[];save();renderPlaylists();render();}
  }catch(e){toast('Could not load cloud library: '+e.message);}
}
async function pushCloud(){if(!$('cloudSync').checked||!cloudToken)return;try{await api('/api/v1/library',{method:'PUT',headers:{Authorization:'Bearer '+cloudToken,'Content-Type':'application/json'},body:JSON.stringify({favorites:[...favorites],playlists})});}catch(e){toast('Cloud sync did not finish: '+e.message);}}
function setupEvents(){
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('heroExplore').addEventListener('click',()=>setView('explore'));
  $('searchInput').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,340);});
  $('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(searchTimer);search();}});
  $('musicSource').addEventListener('change',()=>{source=$('musicSource').value;search();});
  $$('.filter').forEach(b=>b.addEventListener('click',()=>{activeFilter=b.dataset.filter;$$('.filter').forEach(x=>x.classList.toggle('active',x===b));render();}));
  $('musicGrid').addEventListener('click',e=>{
    const created=e.target.closest('[data-create-playlist]');if(created){$('playlistName').value='';$('playlistDialog').showModal();return;}
    const chosen=e.target.closest('[data-playlistcard]');if(chosen){openPlaylist(chosen.dataset.playlistcard);return;}
    const b=e.target.closest('[data-action]');if(!b)return;let t=window.displayedTracks?.[Number(b.dataset.index)];if(!t)return;
    if(b.dataset.action==='play'){playTrack(t);}
    if(b.dataset.action==='like'){toggleFavorite(t);}
    if(b.dataset.action==='menu'){showSongActions(t);}
  });
  $('musicGrid').addEventListener('contextmenu',e=>{const card=e.target.closest('.music-card');if(!card)return;const t=findTrack(card.dataset.id);if(!t)return;e.preventDefault();addQueue(t);});
  $('playButton').addEventListener('click',togglePlay);$('nextButton').addEventListener('click',next);$('prevButton').addEventListener('click',previous);
  $('playerFav').addEventListener('click',()=>toggleFavorite(current));
  $('repeatButton').addEventListener('click',()=>{repeat=!repeat;$('repeatButton').classList.toggle('active',repeat);save();toast(repeat?'Repeat on':'Repeat off');});
  $('shuffleButton').addEventListener('click',()=>{shuffle=!shuffle;$('shuffleButton').classList.toggle('active',shuffle);makeAutoQueue();save();toast(shuffle?'Shuffle on':'Shuffle off');});
  $('volume').addEventListener('input',e=>{audio.volume=Number(e.target.value)/100;putLocal('volume',audio.volume);e.target.style.setProperty('--pct',e.target.value+'%');});
  $('seek').addEventListener('pointerdown',()=>draggingSeek=true);$('seek').addEventListener('pointerup',()=>draggingSeek=false);
  $('seek').addEventListener('input',e=>{let max=Number.isFinite(audio.duration)?audio.duration:Number(current?.duration)||0;let time=max*Number(e.target.value)/1000;$('elapsed').textContent=formatTime(time);e.target.style.setProperty('--pct',Number(e.target.value)/10+'%');if(audio.seekable.length&&max>0)audio.currentTime=time;});
  $('playerTouchProgress').addEventListener('click',e=>{if(!Number.isFinite(audio.duration))return;let r=e.currentTarget.getBoundingClientRect();audio.currentTime=audio.duration*((e.clientX-r.left)/r.width);});
  $('lyricsButton').addEventListener('click',()=>showPanel('lyrics'));
  $('mobileLyrics').addEventListener('click',()=>showPanel('lyrics'));
  $('queueButton').addEventListener('click',()=>showPanel('queue'));
  $('closePanel').addEventListener('click',closePanel);
  $$('.panel-tab').forEach(b=>b.addEventListener('click',()=>showPanel(b.dataset.panel)));
  $('lyricSource').addEventListener('change',loadLyrics);
  $('lyricContent').addEventListener('click',e=>{const el=e.target.closest('[data-line]');if(!el)return;let n=Number(el.dataset.start);if(Number.isFinite(n)&&Number.isFinite(audio.duration))audio.currentTime=n;});
  $('queueList').addEventListener('click',e=>{let b=e.target.closest('[data-remove-queue]');if(!b)return;let i=Number(b.dataset.removeQueue);if(i<queue.length)queue.splice(i,1);else autoQueue.splice(i-queue.length,1);save();renderQueue();});
  $('clearQueue').addEventListener('click',()=>{queue=[];autoQueue=[];save();renderQueue();toast('Queue cleared');});
  $('closeActions').addEventListener('click',()=>$('songActionDialog').close());
  $('actionPlay').addEventListener('click',()=>{if(actionTrack)playTrack(actionTrack);$('songActionDialog').close();});
  $('actionQueue').addEventListener('click',()=>{if(actionTrack)addQueue(actionTrack);$('songActionDialog').close();});
  $('actionLike').addEventListener('click',()=>{if(actionTrack)toggleFavorite(actionTrack);$('songActionDialog').close();});
  $('actionPlaylistSave').addEventListener('click',()=>{const p=playlists.find(p=>p.id===$('actionPlaylist').value);if(!p){toast('Create or select a playlist first.');return;}if(!p.tracks.some(t=>t.id===actionTrack.id)){p.tracks.push(actionTrack);save();pushCloud();toast('Added to '+p.name);}else toast('Already in this playlist');$('songActionDialog').close();});
  $('createPlaylist').addEventListener('click',()=>{$('playlistName').value='';$('playlistDialog').showModal();});
  $('playlistSave').addEventListener('click',e=>{let name=$('playlistName').value.trim();if(!name){e.preventDefault();$('playlistName').focus();return;}let id='pl-'+Date.now();playlists.push({id,name,tracks:[]});save();renderPlaylists();if(currentView==='library')render();pushCloud();toast('Playlist created');});
  $('playlistNav').addEventListener('click',e=>{let b=e.target.closest('[data-playlist]');if(!b)return;openPlaylist(b.dataset.playlist);});
  $('settingsButton').addEventListener('click',()=>$('settingsDialog').showModal());
  $('reduceMotion').addEventListener('change',e=>{document.documentElement.classList.toggle('reduce-motion',e.target.checked);putLocal('reduceMotion',e.target.checked);});
  $('cloudSync').addEventListener('change',async e=>{putLocal('cloudSync',e.target.checked);if(e.target.checked)await pullCloud();});
  audio.addEventListener('play',()=>{playing=true;updatePlayer();if(!animationId)animationId=requestAnimationFrame(lyricLoop);});
  audio.addEventListener('pause',()=>{playing=false;updatePlayer();cancelAnimationFrame(animationId);animationId=null;});
  audio.addEventListener('timeupdate',setTimeUI);audio.addEventListener('durationchange',setTimeUI);
  audio.addEventListener('ended',()=>{if(repeat){audio.currentTime=0;audio.play().catch(()=>{});}else next();});
  audio.addEventListener('error',()=>{if(current&&!current.audio)unplayable(current);else if(current)toast('This audio file could not be played.');});
  document.addEventListener('keydown',e=>{let tag=document.activeElement?.tagName;if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(tag)){e.preventDefault();$('searchInput').focus();}if(e.code==='Space'&&!['INPUT','TEXTAREA','BUTTON','SELECT'].includes(tag)){e.preventDefault();togglePlay();}if(e.key==='Escape')closePanel();});
  window.addEventListener('storage',e=>{if(e.key==='aurelis:favorites'){favorites=new Set(getLocal('favorites',[]));render();updatePlayer();}});
  // Queue controls are discoverable with right-click on cards, while touch users can long-press.
  let hold=null;$('musicGrid').addEventListener('touchstart',e=>{const card=e.target.closest('.music-card');if(!card)return;hold=setTimeout(()=>{let t=findTrack(card.dataset.id);if(t)addQueue(t);hold=null;},650);},{passive:true});
  for(let ev of ['touchend','touchmove','touchcancel'])$('musicGrid').addEventListener(ev,()=>{if(hold){clearTimeout(hold);hold=null;}},{passive:true});
  // Browser storage remains the default; optional cloud sync is explicit opt-in.
  window.addEventListener('pagehide',()=>{if($('cloudSync').checked)pushCloud();});
}
init();
})();
