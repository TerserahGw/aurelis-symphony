/* Aurelis 2.7 — real audio streaming walkthrough + editable API requests.
 * Probes are small JSON checks; never fetch full binary audio into a <pre>. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const input=$('streamTrackInput'),form=$('streamWorkbench');
  const result=$('streamResult'),status=$('streamStatus'),audio=$('streamPreview');
  const probe=$('streamProbe'),listen=$('streamListen'),copy=$('streamCopy');
  let descriptor=null,sequence=0;
  const flash=text=>{
    const el=$('docsToast');if(!el)return;
    el.textContent=text;el.hidden=false;
    setTimeout(()=>{el.hidden=true;},1900);
  };
  const pretty=value=>JSON.stringify(value,null,2);
  function state(text,failed=false){
    status.textContent=text;status.classList.toggle('error',failed);
  }
  function validTrack(text){
    const raw=text.trim();
    if(/^https:\/\//i.test(raw)){
      try{
        const u=new URL(raw);
        if(u.hostname==='youtu.be'||u.hostname==='www.youtu.be')return u.pathname.split('/')[1];
        if(['youtube.com','www.youtube.com','music.youtube.com','m.youtube.com'].includes(u.hostname)){
          if(u.pathname==='/watch')return u.searchParams.get('v')||'';
          if(/^\/(shorts|live)\//.test(u.pathname))return u.pathname.split('/')[2]||'';
        }
      }catch{return '';}
      return '';
    }
    return raw;
  }
  async function jsonGet(url,timeout=17000){
    const target=new URL(url,location.origin);
    if(target.origin!==location.origin)throw Error('URL harus berasal dari domain Aurelis');
    const response=await fetch(target.pathname+target.search,{
      headers:{Accept:'application/json'},signal:AbortSignal.timeout(timeout)
    });
    const value=await response.json().catch(()=>({ok:false,message:'Respons bukan JSON.'}));
    return {response,value};
  }
  function reset(){
    descriptor=null;probe.disabled=true;listen.disabled=true;copy.disabled=true;
    audio.pause();audio.removeAttribute('src');audio.load();audio.hidden=true;
  }
  async function resolve(event){
    event.preventDefault();
    const current=++sequence;
    reset();
    const id=validTrack(input.value);
    if(!/^(?:[A-Za-z0-9_-]{11}|yt-[A-Za-z0-9_-]{11}|demo-[A-Za-z0-9_-]{1,65})$/.test(id)){
      state('Masukkan demo-aether atau video ID YouTube sepanjang 11 karakter.',true);return;
    }
    state('Meminta URL stream dari server...');
    result.textContent='GET /api/v2/playback/'+encodeURIComponent(id);
    try{
      const {response,value}=await jsonGet('/api/v2/playback/'+encodeURIComponent(id));
      if(current!==sequence)return;
      result.textContent=pretty(value);
      if(!response.ok||!value?.ok||!value.streamUrl){
        state('Resolver gagal · HTTP '+response.status+' · '+(value.message||value.error||'ID tidak ditemukan'),true);return;
      }
      descriptor=value;
      probe.disabled=!value.probeUrl;
      listen.disabled=false;copy.disabled=false;
      state(value.type==='original'?'Demo Aurelis siap diputar.':'URL internal tersedia. Uji probe lebih dulu; playback YouTube tidak dijamin.');
    }catch(e){
      if(current!==sequence)return;
      state('Tidak bisa mengakses resolver: '+(e.message||'Jaringan gagal'),true);
      result.textContent=String(e.message||e);
    }
  }
  form?.addEventListener('submit',resolve);
  probe?.addEventListener('click',async()=>{
    if(!descriptor?.probeUrl)return;
    probe.disabled=true;state('Menguji byte pertama dari upstream (probe) …');
    try{
      const {response,value}=await jsonGet(descriptor.probeUrl,21000);
      result.textContent=pretty(value);
      if(response.ok&&value.ok){
        state('Probe berhasil · MIME '+String(value.mime||'unknown')+' · '+Number(value.firstBytes||0)+' byte awal. Pemutaran penuh masih perlu diuji.');
      }else{
        state('Probe gagal · HTTP '+response.status+' · '+String(value.code||value.message||'stream belum tersedia')+'. Pembatasan sumber tidak bisa dilewati dari API.',true);
      }
    }catch(e){state('Probe tidak selesai: '+(e.message||'timeout'),true);}
    finally{probe.disabled=false;}
  });
  listen?.addEventListener('click',async()=>{
    if(!descriptor?.streamUrl)return;
    const route=new URL(descriptor.streamUrl,location.origin);
    if(route.origin!==location.origin){state('URL audio harus berasal dari Aurelis.',true);return;}
    audio.src=route.pathname+route.search;audio.hidden=false;
    state('Meminta audio dari URL stream...');
    try{
      await audio.play();
      state('Pemutaran dimulai. Ketersediaan sampai akhir lagu tetap bergantung pada sumber.');
    }catch(e){state('Browser tidak dapat memutar audio: '+(e.message||'codec/stream error'),true);}
  });
  audio?.addEventListener('error',()=>{
    if(!audio.hidden)state('Sumber audio gagal atau codec tidak didukung browser. Periksa probe dan jaringan.',true);
  });
  copy?.addEventListener('click',async()=>{
    if(!descriptor?.streamUrl)return;
    try{await navigator.clipboard.writeText(new URL(descriptor.streamUrl,location.origin).href);flash('URL stream disalin');}
    catch{flash('Salin manual dari respons JSON');}
  });
  const base=$('docsBaseUrl');
  if(base)base.textContent=location.origin;
  // Endpoint explorer: use editable same-origin inputs to avoid surprising
  // binary downloads or cross-origin requests from user-entered URLs.
  const cards=[...document.querySelectorAll('.docs-endpoint')];
  for(const card of cards){
    const tools=card.querySelector('.docs-tools'),tryBtn=card.querySelector('[data-try]');
    const copyUrl=card.querySelector('[data-url]'),method=card.querySelector('.docs-method')?.textContent?.trim()||'GET';
    if(!tools||!tryBtn||!copyUrl)continue;
    const fields=document.createElement('div');fields.className='docs-try-fields';
    const label=document.createElement('label');label.textContent='Request URL · dapat diedit';
    const route=document.createElement('input');route.className='docs-try-url';
    route.value=copyUrl.dataset.url||'';route.setAttribute('aria-label','URL untuk '+card.id);
    label.append(route);fields.append(label);
    if(method==='POST'){
      const bodyLabel=document.createElement('label');bodyLabel.textContent='JSON body · dapat diedit';
      const body=document.createElement('textarea');body.className='docs-try-body';
      body.setAttribute('aria-label','JSON body untuk '+card.id);
      body.value=card.querySelector('.docs-code pre code')?.textContent||'{}';
      bodyLabel.append(body);fields.append(bodyLabel);
    }
    tools.before(fields);
    route.addEventListener('input',()=>{copyUrl.dataset.url=route.value;});
  }
  document.addEventListener('click',async e=>{
    const button=e.target.closest('[data-try]');
    if(!button)return;
    e.stopPropagation(); // Override old fixed-sample handler with edited fields.
    e.preventDefault();
    const card=button.closest('.docs-endpoint');if(!card)return;
    const path=card.querySelector('.docs-try-url')?.value||'';
    const method=card.querySelector('.docs-method')?.textContent?.trim()||'GET';
    const output=card.querySelector('.docs-result'),head=output?.querySelector('.docs-result-head'),
          pre=output?.querySelector('pre');
    if(!output||!head||!pre)return;
    output.hidden=false;button.disabled=true;head.classList.remove('error');
    head.textContent='MEMINTA…';pre.textContent=method+' '+path;
    try{
      const url=new URL(path,location.origin);
      if(url.origin!==location.origin)throw Error('Hanya endpoint dari domain Aurelis yang dapat diuji.');
      if(url.pathname.startsWith('/api/v2/audio/')&&url.searchParams.get('probe')!=='1')
        throw Error('Untuk audio biner gunakan playground. Endpoint tester hanya menjalankan ?probe=1.');
      const opts={method,headers:{Accept:'application/json'},signal:AbortSignal.timeout(17000)};
      if(method==='POST'){
        const raw=card.querySelector('.docs-try-body')?.value||'{}';
        opts.headers['Content-Type']='application/json';
        opts.body=JSON.stringify(JSON.parse(raw));
      }
      const response=await fetch(url.pathname+url.search,opts);
      const raw=await response.text();
      let decoded=raw;
      try{decoded=pretty(JSON.parse(raw));}catch{}
      head.textContent='HTTP '+response.status+' · '+(response.ok?'RESPONS DITERIMA':'RESPONS ERROR');
      head.classList.toggle('error',!response.ok);
      pre.textContent=decoded.slice(0,14000);
    }catch(err){
      head.textContent='PERMINTAAN GAGAL';head.classList.add('error');pre.textContent=String(err.message||err);
    }finally{button.disabled=false;}
  },true);
  const filter=$('docsFilter');
  filter?.addEventListener('input',()=>{
    const value=filter.value.toLowerCase().trim();
    let hits=0;
    for(const card of cards){
      const matched=!value||(card.textContent+' '+card.id).toLowerCase().includes(value);
      card.hidden=!matched;if(matched)hits++;
    }
    filter.setAttribute('aria-description',hits+' endpoint cocok');
  });
})();