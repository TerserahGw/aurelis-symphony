/* Aurelis 2.4 Android media controls — Media Session API.
 * Works in supported browsers only; the OS decides notification presentation.
 * One media session for the existing HTMLAudioElement, never a second player. */
(() => {
  'use strict';
  const audio=document.getElementById('audio');
  const session=navigator.mediaSession;
  if(!audio||!session||typeof MediaMetadata==='undefined')return;
  const app=()=>window.Aurelis;
  let lastTrack='',lastPosition=0;
  function thumbnail(t){
    const img=String(t?.artwork||'').trim();
    if(/^https:\/\/[^ ]+$/i.test(img)){try{return new URL(img).href;}catch{}}
    const id=String(t?.videoId||(String(t?.id||'').startsWith('yt-')?t.id.slice(3):''));
    if(/^[A-Za-z0-9_-]{11}$/.test(id))return 'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
    return new URL('/assets/aurelis.svg',location.origin).href;
  }
  function ambient(t){
    const img=thumbnail(t);
    // CSS variable is used only as an image URL. Escape CSS delimiters so
    // remote title/artwork metadata can never inject styles or scripts.
    const encoded=img.replace(/["'()\\\s]/g,x=>encodeURIComponent(x));
    document.documentElement.style.setProperty('--aurelis-ambient-art','url("'+encoded+'")');
  }
  function metadata(){
    const t=app()?.snapshot?.().current;
    if(!t)return;
    const art=thumbnail(t);
    const key=JSON.stringify([t.id,t.title,t.artist,t.album,art]);
    if(key===lastTrack)return;
    lastTrack=key;
    try{
      session.metadata=new MediaMetadata({
        title:String(t.title||'Untitled'),
        artist:String(t.artist||'Unknown artist'),
        album:String(t.album||'Aurelis Symphony'),
        artwork:[{src:art}]
      });
    }catch(err){console.warn('Aurelis MediaMetadata unavailable',err?.message);}
    ambient(t);
    position(true);
  }
  function state(){
    try{
      const t=app()?.snapshot?.().current;
      session.playbackState=!t?'none':audio.paused?'paused':'playing';
    }catch{}
  }
  function position(force=false){
    if(typeof session.setPositionState!=='function')return;
    const now=performance.now();
    if(!force&&now-lastPosition<1000)return;
    lastPosition=now;
    const duration=Number.isFinite(audio.duration)&&audio.duration>0?
      audio.duration:Number(app()?.snapshot?.().duration)||0;
    if(!Number.isFinite(duration)||duration<=0)return;
    const current=Math.max(0,Math.min(duration,Number(audio.currentTime)||0));
    try{session.setPositionState({duration,playbackRate:audio.playbackRate||1,position:current});}
    catch{}
  }
  function act(key,fn){
    try{session.setActionHandler(key,fn);}catch{}
  }
  act('play',()=>{const a=app();if(audio.paused)a?.toggle?.();});
  act('pause',()=>{const a=app();if(!audio.paused)a?.toggle?.();});
  act('previoustrack',()=>app()?.previous?.());
  act('nexttrack',()=>app()?.next?.());
  act('seekto',details=>{
    if(Number.isFinite(details?.seekTime)&&audio.seekable?.length)
      app()?.seek?.(details.seekTime);
    position(true);
  });
  act('seekbackward',details=>{
    if(audio.seekable?.length)app()?.seek?.(audio.currentTime-(details.seekOffset||10));
  });
  act('seekforward',details=>{
    if(audio.seekable?.length)app()?.seek?.(audio.currentTime+(details.seekOffset||10));
  });
  act('stop',()=>{if(!audio.paused)audio.pause();state();});
  window.addEventListener('aurelis:track',()=>{lastTrack='';metadata();state();});
  window.addEventListener('aurelis:player',()=>{metadata();state();position();});
  audio.addEventListener('play',()=>{metadata();state();position(true);});
  audio.addEventListener('pause',()=>{state();position(true);});
  audio.addEventListener('loadedmetadata',()=>{metadata();position(true);});
  audio.addEventListener('durationchange',()=>position(true));
  audio.addEventListener('timeupdate',()=>position());
  audio.addEventListener('seeked',()=>position(true));
  audio.addEventListener('ratechange',()=>position(true));
  audio.addEventListener('error',()=>state());
  metadata();state();
})();
