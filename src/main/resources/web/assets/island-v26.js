/* Aurelis 2.6 — mobile Island controls and cover-driven ambience.
 * UI only: leaves the single native HTMLAudioElement and playback events intact. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const dock=$('mobileIslandDock'),input=$('islandSearchInput'),form=$('islandSearchForm');
  const trigger=$('islandSearchTrigger'),menu=$('islandMenuTrigger'),clear=$('islandSearchClear');
  const original=$('searchInput'),player=$('miniPlayer');
  const viewport=window.visualViewport;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  if(!dock || !input || !original || !player)return;
  let expanded=false,ambientRefresh=null,morphAnimation=null,storedRect=null,blurJobs=[];
  const mobile=()=>window.matchMedia('(max-width:800px)').matches;
  const reduced=()=>reduce.matches||document.documentElement.classList.contains('aurelis-reduce-motion');
  function keyboardPosition(){
    if(!expanded||!mobile()){dock.style.setProperty('--island-keyboard-inset','0px');return;}
    // The visual viewport becomes shorter when Android's IME opens. The dock
    // lives in layout-viewport coordinates; compensate for the occluded area.
    const occlusion=viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0;
    dock.style.setProperty('--island-keyboard-inset',Math.round(occlusion)+'px');
  }
  function setExpanded(next,focus=false){
    if(!mobile()&&next)return;
    expanded=!!next;
    dock.classList.toggle('is-searching',expanded);
    document.documentElement.classList.toggle('island-search-active',expanded);
    trigger.setAttribute('aria-expanded',String(expanded));
    menu.setAttribute('aria-expanded',String(expanded));
    form.setAttribute('aria-hidden',String(!expanded));
    input.tabIndex=expanded?0:-1;
    clear.tabIndex=expanded?0:-1;
    keyboardPosition();
    if(expanded){
      input.value=original.value||input.value;
      const page=document.querySelector('.mobile-nav .island-nav [data-nav="search"]');
      if(page && !page.classList.contains('active'))page.click();
      if(focus)requestAnimationFrame(()=>input.focus({preventScroll:true}));
    }else{
      input.blur();
      requestAnimationFrame(keyboardPosition);
    }
  }
  function openSearch(){setExpanded(true,true);}
  trigger.addEventListener('click',event=>{event.stopPropagation();openSearch();});
  menu.addEventListener('click',event=>{event.stopPropagation();setExpanded(false);});
  input.addEventListener('input',event=>{
    original.value=event.target.value;
    original.dispatchEvent(new Event('input',{bubbles:true}));
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    original.value=input.value;
    original.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    input.blur();
    keyboardPosition();
  });
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();setExpanded(false);}
  });
  clear.addEventListener('click',event=>{
    event.preventDefault();
    input.value='';original.value='';
    original.dispatchEvent(new Event('input',{bubbles:true}));
    input.focus({preventScroll:true});
  });
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-nav]');
    if(nav && nav.dataset.nav!=='search' && expanded)setExpanded(false);
  });
  original.addEventListener('input',()=>{
    if(input.value!==original.value)input.value=original.value;
  });
  viewport?.addEventListener('resize',keyboardPosition,{passive:true});
  viewport?.addEventListener('scroll',keyboardPosition,{passive:true});
  window.addEventListener('resize',keyboardPosition,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)keyboardPosition();});
  // A11y: Escape collapses a focused search input, even after blur.
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&expanded){
      if(document.activeElement===input)return;
      setExpanded(false);
    }
  });
  // Keep GPU blur count bounded (four static covers); no cross-origin pixels.
  const root=document.querySelector('.main-panel');
  let ambient=root?.querySelector('.island-ambient');
  if(!ambient&&root){
    ambient=document.createElement('div');ambient.className='island-ambient';ambient.setAttribute('aria-hidden','true');
    ambient.innerHTML=Array.from({length:4},(_,i)=>'<div class="island-wash" data-cover="'+i+'"></div>').join('');
    root.insertBefore(ambient,root.firstChild);
  }
  const washes=ambient?[...ambient.querySelectorAll('.island-wash')]:[];
  let lastUrls=['','','',''];
  let ambientToken=0;
  function updateAmbient(){
    ambientRefresh=null;
    if(!washes.length)return;
    const view=$('view');
    const candidates=[...(view?.querySelectorAll('.music-card .artwork img, .track-row .track-thumb img, .playlist-card img, .playlist-header img')||[])];
    const own=$('playerArt')?.querySelector('img');
    if(own)candidates.push(own);
    const urls=[];
    for(const el of candidates){
      const src=el.currentSrc||el.getAttribute('src')||'';
      try{
        const url=new URL(src,location.href);
        if(url.protocol!=='https:'&&url.origin!==location.origin)continue;
        if(urls.includes(url.href))continue;
        urls.push(url.href);
        if(urls.length===4)break;
      }catch{}
    }
    const token=++ambientToken;
    for(let i=0;i<washes.length;i++){
      const url=urls[i]||'';
      if(lastUrls[i]===url)continue;
      lastUrls[i]=url;
      const wash=washes[i];
      wash.classList.add('is-switching');
      clearTimeout(blurJobs[i]);
      blurJobs[i]=setTimeout(()=>{
        if(token!==ambientToken)return;
        wash.style.backgroundImage=url?'url('+JSON.stringify(url)+')':'none';
        wash.classList.remove('is-switching');
      },reduced()?0:160);
    }
  }
  function scheduleAmbient(){
    if(ambientRefresh!==null)return;
    ambientRefresh=requestAnimationFrame(updateAmbient);
  }
  const view=$('view');
  if(view){
    const observer=new MutationObserver(scheduleAmbient);
    observer.observe(view,{childList:true,subtree:true});
  }
  window.addEventListener('aurelis:track',scheduleAmbient);
  window.addEventListener('aurelis:favorites',scheduleAmbient);
  window.addEventListener('aurelis:preferences',scheduleAmbient);
  scheduleAmbient();
  // A genuine shared-surface morph: the mini-player island visually expands
  // to the existing fullscreen player while both keep the SAME audio element.
  function morph(direction){
    if(!mobile()||reduced())return;
    const full=direction==='open';
    const w=window.innerWidth,h=window.innerHeight;
    if(full){
      storedRect=player.getBoundingClientRect();
      if(storedRect.width<30||storedRect.height<20)return;
    }
    const rect=storedRect;
    if(!rect)return;
    morphAnimation?.cancel();
    const ghost=document.createElement('div');
    ghost.className='island-morph';
    const backdrop=getComputedStyle(document.documentElement).getPropertyValue('--aurelis-ambient-art');
    if(backdrop)ghost.style.setProperty('--aurelis-ambient-art',backdrop);
    document.body.appendChild(ghost);
    const mini='translate('+rect.left+'px,'+rect.top+'px) scale('+
      (rect.width/w)+','+(rect.height/h)+')';
    const start=full?mini:'none',end=full?'none':mini;
    morphAnimation=ghost.animate([
      {transform:start,borderRadius:full?'32px':'0px',opacity:full?.9:.2,offset:0},
      {transform:full?'translate(0,0) scale(.98)':'translate(0,0) scale(.98)',
       borderRadius:full?'15px':'12px',opacity:full?.48:.55,offset:.62},
      {transform:end,borderRadius:full?'0px':'32px',opacity:0,offset:1}
    ],{duration:full?570:420,easing:'cubic-bezier(.2,.8,.22,1)',fill:'both'});
    morphAnimation.finished.catch(()=>{}).finally(()=>{ghost.remove();morphAnimation=null;});
  }
  window.AurelisIsland=Object.freeze({
    openSearch,closeSearch:()=>setExpanded(false),morph,
    refreshAmbient:scheduleAmbient,
    get searching(){return expanded;}
  });
})();