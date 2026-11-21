/* Aurelis 2.7 — scroll-entry motion and lightweight exit ghosts.
 * Runs only on navigations and visibility intersections, never audio timeupdate.
 * Degrades instantly under reduced motion or unavailable Web Animations API. */
(() => {
  'use strict';
  const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches||
    document.documentElement.classList.contains('aurelis-reduce-motion');
  const view=document.getElementById('view');
  const scroller=document.getElementById('scrollArea');
  let observer,scanFrame=0;
  function visible(element){
    if(reduced()||document.hidden)return true;
    const b=element.getBoundingClientRect();
    return b.top<innerHeight-44&&b.bottom>55;
  }
  function applyItem(node){
    if(node.classList.contains('v27-scroll-item'))return;
    node.classList.add('v27-scroll-item');
    if(visible(node)){node.classList.add('v27-visible');return;}
    node.classList.add('v27-pending');
    observer?.observe(node);
  }
  if('IntersectionObserver' in window){
    observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        const el=entry.target;
        if(!el.isConnected){observer.unobserve(el);continue;}
        if(entry.isIntersecting){
          el.classList.remove('v27-pending','v27-exiting');
          el.classList.add('v27-visible');
          observer.unobserve(el);
        }
      }
    },{root:scroller,rootMargin:'0px 0px 25px 0px',threshold:.025});
  }
  function scan(){
    scanFrame=0;
    if(!view||reduced())return;
    const items=view.querySelectorAll('.music-card,.track-row,.playlist-card,.feature-hero,.section-head');
    // Bound to visible/nearby content: reserve GPU budget for lyrics and glass.
    for(const node of Array.from(items).slice(0,130))applyItem(node);
  }
  function schedule(){
    if(scanFrame)return;
    scanFrame=requestAnimationFrame(scan);
  }
  const mutation=view&&new MutationObserver(schedule);
  mutation?.observe(view,{childList:true,subtree:true});
  function pageChanged(){
    if(reduced()||!view)return;
    view.classList.remove('v27-page-enter');
    // Force a frame, not synchronous layout recalculation.
    requestAnimationFrame(()=>{
      if(!view.isConnected)return;
      view.classList.add('v27-page-enter');
      setTimeout(()=>view.classList.remove('v27-page-enter'),610);
      schedule();
    });
  }
  function ghost(rect,kind){
    if(!rect||rect.width<20||rect.height<15||reduced())return;
    const node=document.createElement('div');
    node.setAttribute('aria-hidden','true');
    node.className=kind==='menu'?'song-popover v27-exit-ghost':'asp-panel v27-exit-ghost';
    node.style.cssText='position:fixed!important;z-index:400!important;pointer-events:none!important;'+
      'left:'+rect.left+'px!important;top:'+rect.top+'px!important;'+
      'width:'+rect.width+'px!important;height:'+rect.height+'px!important;'+
      'max-height:none!important;transform-origin:top right;';
    document.body.append(node);
    if(!node.animate){node.remove();return;}
    const anim=node.animate([
      {opacity:.75,transform:'translate3d(0,0,0) scale(1)',filter:'blur(0)'},
      {opacity:0,transform:'translate3d(0,-7px,0) scale(.965)',filter:'blur(2px)'}
    ],{duration:210,easing:'cubic-bezier(.35,0,.6,1)',fill:'forwards'});
    anim.finished.catch(()=>{}).finally(()=>node.remove());
  }
  function menuClosing(el){
    if(el && !el.hidden)ghost(el.getBoundingClientRect(),'menu');
  }
  function settingsClosing(el){
    if(!el||el.hidden)return;
    const pane=el.querySelector('.asp-panel');
    if(pane)ghost(pane.getBoundingClientRect(),'settings');
  }
  const pages=Object.freeze({pageChanged,menuClosing,settingsClosing,scan:schedule});
  window.AurelisMotion=pages;
  window.addEventListener('aurelis:preferences',()=>{if(reduced()){
    observer?.disconnect();
    view?.querySelectorAll('.v27-scroll-item').forEach(el=>
      el.classList.remove('v27-pending','v27-exiting'));
  }else schedule();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  schedule();
})();