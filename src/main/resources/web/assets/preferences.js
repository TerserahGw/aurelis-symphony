/* Aurelis 2.3 preferences: local, functional controls with a restrained mobile sheet. */
(() => {
'use strict';
const defaults={
  lyricSize:31, lyricOffset:0, karaoke:true, reduceMotion:false,
  compactCards:false, artworkBlur:true, radioMode:'balanced',
  romanization:true, romanLanguage:'auto', translation:false
};
const $=id=>document.getElementById(id);
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('aurelis:'+key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem('aurelis:'+key,JSON.stringify(value));}catch{}};
const values={...defaults,...(load('preferences',{})||{}),
  romanization:load('playerRomanization',true),
  translation:load('playerTranslation',false)};
const offsets=load('songLyricOffsets',{});
const icons={
  x:'<path d="M5 5l14 14M19 5 5 19"/>',
  sound:'<path d="m11 4-5 5H3v6h3l5 5V4zM16 9a5 5 0 0 1 0 6M19 6a9 9 0 0 1 0 12"/>',
  lyrics:'<path d="M3 6h18M3 11h13M3 16h17M3 21h9"/>',
  view:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 10h18M10 10v11"/>',
  data:'<path d="M12 3 3 7l9 4 9-4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  next:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  check:'<path d="m4 12 5 5L20 6"/>'
};
const ico=n=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[n]+'</svg>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,min,max)=>Math.min(max,Math.max(min,Number(v)||0));
const round=v=>Math.round(v*100)/100;
const details={
  audio:['PENGALAMAN MENDENGAR','Pemutaran','Atur bagaimana lagu diputar dan bagaimana antrean dibuat.'],
  lyrics:['SINKRONISASI','Lirik','Teks, waktu, dan efek karaoke.'],
  visual:['PERSONALISASI','Tampilan','Jaga antarmuka tetap nyaman dan ringan.'],
  data:['DATA & INTEGRASI','Data dan API','Koleksi tersimpan di browser, API tersedia untuk pengembang.']
};
const sections=[
  ['audio','sound','Audio'],['lyrics','lyrics','Lirik'],['visual','view','Tampilan'],['data','data','Data & API']
];
const shell=document.createElement('div');
shell.id='aurelisPreferences';
shell.className='asp-overlay';
shell.hidden=true;
shell.innerHTML='<div class="asp-panel" role="dialog" aria-modal="true" aria-labelledby="aspHeading">'+
  '<aside class="asp-sidebar"><h2>Pengaturan</h2><p>Aurelis Symphony</p>'+
  '<nav class="asp-nav" id="aspNavigation">'+sections.map(([id,icon,text])=>
    '<button type="button" data-tab="'+id+'">'+ico(icon)+esc(text)+'</button>').join('')+'</nav>'+
  '<div class="asp-side-bottom">AURELIS / 2.4</div></aside>'+
  '<div class="asp-main"><div class="asp-header"><div><div class="asp-kicker" id="aspKicker">PREFERENSI</div>'+
  '<h3 id="aspHeading">Pemutaran</h3><p id="aspSubtitle"></p></div>'+
  '<button type="button" class="asp-close" id="aspClose" aria-label="Tutup pengaturan">'+ico('x')+'</button></div>'+
  '<div class="asp-scroll" id="aspContent"></div></div></div>';
document.body.appendChild(shell);
let active='audio',beforeFocus=null;
const parts={
  heading:title=>'<div class="asp-section-title">'+esc(title)+'</div>',
  sw:(key,title,description,checked)=>'<div class="asp-setting"><div><strong>'+esc(title)+
    '</strong><small>'+esc(description)+'</small></div><div class="asp-control">'+
    '<button type="button" class="asp-switch" role="switch" aria-checked="'+!!checked+
    '" data-switch="'+esc(key)+'" aria-label="'+esc(title)+'"></button></div></div>',
  slide:(key,title,description,value,min,max,step,suffix='')=>
    '<div class="asp-setting"><div><strong>'+esc(title)+'</strong><small>'+esc(description)+
    '</small></div><div class="asp-control"><input type="range" data-range="'+esc(key)+
    '" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+
    '" aria-label="'+esc(title)+'"><output data-output="'+esc(key)+'">'+value+suffix+'</output></div></div>',
  sel:(key,title,description,value,items)=>
    '<div class="asp-setting"><div><strong>'+esc(title)+'</strong><small>'+esc(description)+
    '</small></div><div class="asp-control"><select data-select="'+esc(key)+'" aria-label="'+esc(title)+'">'+
    items.map(([v,name])=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(name)+'</option>').join('')+
    '</select></div></div>',
  action:(key,title,desc)=>'<button type="button" class="asp-action" data-action="'+esc(key)+
    '"><div><strong>'+esc(title)+'</strong><small>'+esc(desc)+'</small></div>'+ico('next')+'</button>'
};
const snap=()=>window.Aurelis?.snapshot?.()||{};
function persist(){
  save('preferences',values);
  save('playerRomanization',values.romanization);
  save('playerTranslation',values.translation);
  document.documentElement.style.setProperty('--aurelis-lyric-size',clamp(values.lyricSize,20,46)+'px');
  document.documentElement.classList.toggle('aurelis-reduce-motion',!!values.reduceMotion);
  document.documentElement.classList.toggle('aurelis-compact',!!values.compactCards);
  document.documentElement.classList.toggle('aurelis-no-blur',!values.artworkBlur);
  window.dispatchEvent(new CustomEvent('aurelis:preferences',{detail:{...values}}));
}
function getOffset(track) {
  const id=String(track?.id||'');
  return clamp(round(values.lyricOffset+Number(offsets[id]||0)),-8,8);
}
function changeSongOffset(track,delta,reset=false) {
  const id=String(track?.id||'');
  if(!id)return 0;
  if(reset)delete offsets[id];
  else offsets[id]=round(clamp(Number(offsets[id]||0)+delta,-8,8));
  save('songLyricOffsets',offsets);
  window.dispatchEvent(new CustomEvent('aurelis:preferences',{detail:{...values}}));
  return Number(offsets[id]||0);
}
function render(){
  sections.forEach(([id])=>{
    const n=shell.querySelector('[data-tab="'+id+'"]');
    if(n)n.classList.toggle('active',active===id);
  });
  const [kicker,title,subtitle]=details[active];
  $('aspKicker').textContent=kicker;
  $('aspHeading').textContent=title;
  $('aspSubtitle').textContent=subtitle;
  const p=snap();
  let html='';
  if(active==='audio'){
    html+=parts.heading('ANTREAN DAN RADIO');
    html+=parts.sw('autoplay','AutoPlay','Teruskan dengan musik bernuansa serupa setelah antrean selesai.',!!p.autoplay);
    html+=parts.sel('radioMode','Gaya rekomendasi','Seberapa dekat saran musik dengan artis yang sering diputar.',values.radioMode,
      [['familiar','Lebih familier'],['balanced','Seimbang'],['discover','Lebih beragam']]);
    html+=parts.sw('shuffle','Acak antrean','Acak antrean manual yang sudah kamu tambahkan.',!!p.shuffle);
    html+=parts.sel('repeat','Mode pengulangan','Pilih bagaimana pemutar mengulang lagu.',String(p.repeat||0),
      [['0','Tidak diulang'],['1','Ulang antrean'],['2','Ulang satu']]);
    html+=parts.heading('OUTPUT');
    html+=parts.slide('volume','Volume awal','Volume audio pada pemutar yang aktif.',Math.round((p.volume??.75)*100),0,100,1,'%');
    html+='<p class="asp-notice">Audio YouTube tanpa embed menggunakan dua engine eksperimental. Pengaturan ini tidak bisa mengatasi pembatasan penyedia atau blokir IP server.</p>';
  }
  if(active==='lyrics'){
    html+=parts.heading('SINKRONISASI');
    html+=parts.slide('lyricOffset','Offset lirik global','Positif mempercepat lirik; negatif memperlambatnya.',Number(values.lyricOffset),-4,4,.1,' dtk');
    const t=p.current;
    if(t){
      const own=Number(offsets[t.id]||0);
      html+='<div class="asp-setting"><div><strong>Offset khusus lagu ini</strong><small>'+esc(t.title||'Lagu ini')+
        ' — tersimpan terpisah untuk tiap lagu.</small></div><div class="asp-control">'+
        '<button class="asp-step" data-action="offset-minus" aria-label="Kurangi offset">−</button>'+
        '<span class="asp-offset">'+(own>=0?'+':'')+own.toFixed(1)+'s</span>'+
        '<button class="asp-step" data-action="offset-plus" aria-label="Tambah offset">+</button>'+
        '</div></div>';
      html+=parts.action('offset-reset','Reset offset lagu','Hapus penyesuaian waktu untuk lagu yang sedang diputar.');
    }
    html+=parts.heading('BACAAN');
    html+=parts.slide('lyricSize','Ukuran teks lirik','Atur teks lirik fullscreen untuk layar Android.',Number(values.lyricSize),20,46,1,' px');
    html+=parts.sw('karaoke','Progres per kata','Gunakan timestamp kata asli jika sumber menyediakannya.',values.karaoke);

    html+=parts.sw('romanization','Romanisasi','Tampilkan ejaan Latin yang dikonversi dari aksara asli.',values.romanization);
    html+=parts.sel('romanLanguage','Bahasa lirik','Auto mengenali aksara; paksa Jepang saat lagu hanya berisi Kanji.',values.romanLanguage,
      [['auto','Otomatis'],['ja','Jepang · Romaji'],['ko','Korea · RR'],['zh','Mandarin · Pinyin']]);
    html+=parts.sw('translation','Terjemahan Indonesia','Kirim baris lirik ke MyMemory hanya jika dinyalakan.',values.translation);
    html+='<p class="asp-notice">Romanisasi menggunakan kamus di server. Nama khusus dan Kanji dengan beberapa bacaan mungkin perlu koreksi. Karaoke hanya bergerak jika sumber punya timestamp per kata asli.</p>';
  }
  if(active==='visual'){
    html+=parts.heading('TAMPILAN');
    html+=parts.sw('reduceMotion','Kurangi animasi','Matikan animasi antarmuka saat terasa berat.',values.reduceMotion);
    html+=parts.sw('compactCards','Koleksi ringkas','Rapatkan jarak kartu dan daftar musik.',values.compactCards);
    html+=parts.sw('artworkBlur','Latar artwork blur','Gunakan artwork berwarna sebagai latar fullscreen player.',values.artworkBlur);
    html+='<p class="asp-notice">Preferensi disimpan di browser perangkat ini. Tidak ada akun atau sinkronisasi pengaturan otomatis.</p>';
  }
  if(active==='data'){
    html+=parts.heading('UNTUK PENGEMBANG');
    html+=parts.action('docs','Dokumentasi API','Jelajahi endpoint, parameter, respons JSON, dan coba permintaan langsung.');
    html+=parts.action('openapi','Unduh spesifikasi OpenAPI','Buka deskripsi mesin-baca API Aurelis.');
    html+=parts.heading('DATA LOKAL');
    html+=parts.action('export','Ekspor koleksi saya','Unduh playlist, favorit, riwayat, serta preferensi sebagai JSON.');
    html+=parts.action('clearHistory','Hapus riwayat diputar','Hapus riwayat dari perangkat ini, tanpa menghapus playlist.');
    html+=parts.action('reset','Reset preferensi','Kembalikan opsi aplikasi ke keadaan awal.');
    html+='<p class="asp-notice">API pencarian YouTube hanyalah metadata. Streaming langsung tetap eksperimental dan tidak menjamin ketersediaan audio.</p>';
  }
  $('aspContent').innerHTML=html;
}
function open(){
  beforeFocus=document.activeElement;
  active='audio';
  shell.hidden=false;
  render();
  shell.querySelector('#aspClose')?.focus();
}
function close(){
  window.AurelisMotion?.settingsClosing?.(shell);
  shell.hidden=true;
  beforeFocus?.focus?.();
}
shell.addEventListener('click',event=>{
  if(event.target===shell){close();return;}
  const tab=event.target.closest('[data-tab]');
  if(tab){active=tab.dataset.tab;render();return;}
  const sw=event.target.closest('[data-switch]');
  if(sw){
    const key=sw.dataset.switch;
    if(key==='autoplay'){window.Aurelis?.toggleAutoplay?.();}
    else if(key==='shuffle'){window.Aurelis?.toggleShuffle?.();}
    else values[key]=!values[key];
    persist();render();return;
  }
  const action=event.target.closest('[data-action]');
  if(action){
    const kind=action.dataset.action;
    if(kind==='docs')window.open('/docs/api','_blank','noopener,noreferrer');
    else if(kind==='openapi')window.open('/api/v1/openapi.json','_blank','noopener,noreferrer');
    else if(kind==='offset-minus'||kind==='offset-plus'){changeSongOffset(snap().current,kind==='offset-plus'?.25:-.25);render();}
    else if(kind==='offset-reset'){changeSongOffset(snap().current,0,true);render();}
    else if(kind==='export'){
      const keys=['favorites','history','playlists','queue','preferences','playerRomanization','playerTranslation','songLyricOffsets'];
      const data={exportedAt:new Date().toISOString(),version:'2.6.0'};
      keys.forEach(key=>data[key]=load(key,null));
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const a=document.createElement('a'),url=URL.createObjectURL(blob);
      a.href=url;a.download='aurelis-library.json';document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }else if(kind==='clearHistory'){
      if(confirm('Hapus riwayat lagu yang pernah diputar pada browser ini?')){save('history',[]);window.location.reload();}
    }else if(kind==='reset'){
      if(confirm('Kembalikan pengaturan Aurelis ke nilai awal?')){
        Object.assign(values,defaults);Object.keys(offsets).forEach(key=>delete offsets[key]);
        save('songLyricOffsets',{});persist();render();
      }
    }
  }
});
shell.addEventListener('input',event=>{
  const slider=event.target.closest('[data-range]');
  if(!slider)return;
  const key=slider.dataset.range,val=Number(slider.value);
  if(key==='volume')window.Aurelis?.setVolume?.(val/100);
  else values[key]=val;
  persist();
  const out=shell.querySelector('[data-output="'+key+'"]');
  if(out)out.textContent=val+(key==='volume'?'%':key==='lyricOffset'?' dtk':key==='lyricSize'?' px':'');
});
shell.addEventListener('change',event=>{
  const select=event.target.closest('[data-select]');if(!select)return;
  const key=select.dataset.select;
  if(key==='repeat'){
    let attempts=0;
    while(attempts++<3 && String(window.Aurelis?.snapshot?.().repeat||0)!==select.value)
      window.Aurelis?.toggleRepeat?.();
  }else{
    values[key]=select.value;
    persist();
  }
});
shell.querySelector('#aspClose').addEventListener('click',close);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!shell.hidden){event.stopPropagation();close();}
});
persist();
window.AurelisPreferences=Object.freeze({
  open,close,get values(){return {...values};},
  getOffset,changeSongOffset,
  set(key,value){
    if(!(key in defaults))return;
    values[key]=value;persist();
    if(!shell.hidden)render();
  }
});
})();
