/* Aurelis 2.3 API Reference — intentionally small, dependency-free. */
(() => {
  'use strict';
  const base=location.origin;
  const endpointGroups=[
    {label:'Sistem',items:[
      {id:'health',method:'GET',path:'/api/v1/health',description:'Status server, versi, runtime, dan waktu respons.',params:[],sample:'/api/v1/health',code:'{"ok":true,"service":"Aurelis Symphony","version":"2.3.1","runtime":"node"}'},
      {id:'config',method:'GET',path:'/api/v1/config',description:'Backend, sumber pencarian, ketersediaan lirik, serta kemampuan pemutar.',params:[],sample:'/api/v1/config',code:'{"name":"Aurelis Symphony","searchProviders":["youtube","catalog"],"player":"HTML5 Audio (no embed)"}'},
      {id:'status',method:'GET',path:'/api/v2/status',description:'Status eksperimen audio: engine, jumlah koneksi aktif, kode kegagalan terakhir.',params:[],sample:'/api/v2/status',code:'{"ok":true,"stream":{"engines":{"primary":"youtubei.js","fallback":"@distube/ytdl-core"}}}'}
    ]},
    {label:'Penemuan musik',items:[
      {id:'search',method:'GET',path:'/api/v1/search',description:'Pencarian metadata lagu dari YouTube / YouTube Music. Hasil bukan jaminan audio dapat diputar.',params:[['q','Judul, artis, atau kata kunci (wajib).'],['provider','youtube (default), atau catalog untuk demo lokal.'],['limit','Jumlah hasil; maksimum 30.']],sample:'/api/v1/search?q=Another%20Love&provider=youtube&limit=5',code:'{"provider":"youtube","tracks":[{"id":"yt-…","title":"…","artist":"…","videoId":"…","duration":240}]}'},
      {id:'radio',method:'GET',path:'/api/v1/recommendations',description:'Radio berdasarkan artis/suasana dan riwayat lokal yang dikirim pemanggil. Mengurangi judul sama dan menyebar artis; bukan AI analisis audio.',params:[['track','Judul lagu acuan.'],['artist','Artis lagu acuan.'],['recent','JSON URL-encoded: array maksimal 10 objek {id,title,artist}.'],['queued','JSON URL-encoded: item antrean agar tidak terulang.'],['mood','Kata kunci suasana (opsional).'],['mode','familiar / balanced / discover.'],['limit','Jumlah lagu sampai 30.']],sample:'/api/v1/recommendations?track=Another%20Love&artist=Tom%20Odell&mode=balanced&limit=8',code:'{"provider":"youtube","strategy":"artist-and-vibe-radio-v1","style":"pop","tracks":[{"title":"…","artist":"…"}]}'},
      {id:'home',method:'GET',path:'/api/v2/home',description:'Pilihan beranda berbasis riwayat yang boleh dikirim lewat query recent, mood, dan mode.',params:[['recent','JSON URL-encoded array lagu terakhir; opsional.'],['mood','Preferensi genre/suasana.'],['mode','balanced / familiar / discover.']],sample:'/api/v2/home?mood=chill&mode=balanced',code:'{"title":"Dibuat untuk suasanamu","tracks":[…],"style":"chill"}'},
      {id:'catalog',method:'GET',path:'/api/v1/catalog',description:'Katalog lagu asli/demo Aurelis dengan jalur MP3 berlisensi.',params:[['q','Penyaringan judul/artis (opsional).'],['limit','Jumlah hasil maksimal 100.']],sample:'/api/v1/catalog',code:'{"tracks":[{"id":"demo-aether","title":"Aether Bloom","audio":"/demo/aether-bloom.mp3"}]}'},
      {id:'info',method:'GET',path:'/api/v1/info',description:'Normalisasi URL video YouTube menjadi metadata ID dan informasi pemutaran eksperimental.',params:[['url','URL HTTPS YouTube yang dikenali.']],sample:'/api/v1/info?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DMwpMEbgC7DA',code:'{"track":{"id":"yt-MwpMEbgC7DA","videoId":"MwpMEbgC7DA"}}'}
    ]},
    {label:'Lirik dan terjemahan',items:[
      {id:'lyrics',method:'GET',path:'/api/v1/lyrics',description:'Cari lirik dengan timestamp baris; Enhanced LRC berisi timestamp kata jika tersedia.',params:[['track','Judul lagu (wajib).'],['artist','Nama artis.'],['duration','Durasi dalam detik untuk mencocokkan sumber.'],['source','lrclib / lyricsovh (opsional).']],sample:'/api/v1/lyrics?track=Another%20Love&artist=Tom%20Odell',code:'{"result":{"source":"lrclib","synced":true,"wordLevel":false,"lines":[{"time":1.2,"text":"…","words":[]}]}}'},
      {id:'lyricall',method:'GET',path:'/api/v1/lyrics/all',description:'Ambil hasil semua sumber lirik yang tersedia.',params:[['track','Judul lagu (wajib).'],['artist','Nama artis.']],sample:'/api/v1/lyrics/all?track=Another%20Love&artist=Tom%20Odell',code:'{"results":{"lrclib":{"lines":[…]},"lyricsovh":null}}'},
      {id:'lyriclrc',method:'GET',path:'/api/v1/lyrics/lrc',description:'Ekspor lirik sinkron sebagai teks .lrc jika ditemukan.',params:[['track','Judul lagu (wajib).'],['artist','Nama artis.']],sample:'/api/v1/lyrics/lrc?track=Another%20Love&artist=Tom%20Odell',code:'[00:01.20]Contoh baris lirik'},
      {id:'sources',method:'GET',path:'/api/v1/lyrics/sources',description:'Daftar provider lirik dan dukungan sinkronisasi.',params:[],sample:'/api/v1/lyrics/sources',code:'{"sources":[{"id":"lrclib","synced":true},{"id":"lyricsovh","synced":false}]}'},
      {id:'translate',method:'POST',path:'/api/v2/translate',description:'Terjemahkan 1–16 baris ke bahasa Indonesia melalui MyMemory. Kirim hanya teks yang kamu punya hak untuk proses. Dapat terkena kuota.',params:[['texts','Array berisi 1–16 string; maksimal 250 karakter per baris.'],['target','id atau en.']],sample:'/api/v2/translate',body:{texts:['Hello world'],target:'id'},code:'{"ok":true,"provider":"MyMemory","translations":["Halo dunia"]}'}
    ]},
    {label:'Pemutaran dan data',items:[
      {id:'audio',method:'GET',path:'/api/v2/audio/:videoId',description:'Audio YouTube langsung tidak resmi. Mendukung Range bila upstream mengizinkan, ?download=1 untuk unduh, dan HTTP 424 jika sumber gagal.',params:[['videoId','ID video YouTube 11 karakter.'],['probe','Set 1 untuk menguji byte pertama tanpa streaming penuh.'],['download','Set 1 untuk Content-Disposition attachment.'],['title','Nama file unduhan (disanitasi).']],sample:'/api/v2/audio/MwpMEbgC7DA?probe=1',code:'{"ok":false,"code":"youtube_bot_challenge","retryable":true}'},
      {id:'library',method:'GET',path:'/api/v1/library',description:'Koleksi cloud bersifat opsional. Default dimatikan; data favorit/playlist umumnya disimpan di browser.',params:[],sample:'/api/v1/library',code:'{"ok":false,"error":"cloud_library_disabled"}'},
      {id:'openapi',method:'GET',path:'/api/v1/openapi.json',description:'Spesifikasi OpenAPI yang dapat digunakan oleh tooling eksternal.',params:[],sample:'/api/v1/openapi.json',code:'{"openapi":"3.1.0","info":{"title":"Aurelis Symphony API"}}'}
    ]}
  ];
  const esc=str=>String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nav=document.getElementById('docsNav'),list=document.getElementById('endpointList');
  for(const group of endpointGroups){
    const header=document.createElement('span');
    header.style.cssText='font-size:10px;color:#738b7b;letter-spacing:1px;padding:15px 10px 4px';
    header.textContent=group.label.toUpperCase();
    nav.append(header);
    for(const e of group.items){
      const link=document.createElement('a');link.href='#'+e.id;link.textContent=e.path;
      nav.append(link);
      const item=document.createElement('article');item.id=e.id;item.className='docs-endpoint';
      item.innerHTML='<div class="docs-endpoint-head"><span class="docs-method '+(e.method==='POST'?'post':'')+'">'+e.method+'</span><h3>'+esc(e.id.charAt(0).toUpperCase()+e.id.slice(1))+'</h3></div>'+
        '<code class="docs-endpoint-path">'+esc(e.path)+'</code><p>'+esc(e.description)+'</p>'+
        (e.params.length?'<dl class="docs-params">'+e.params.map(([key,desc])=>'<dt>'+esc(key)+'</dt><dd>'+esc(desc)+'</dd>').join('')+'</dl>':'')+
        '<div class="docs-code"><div class="code-toolbar"><span>'+(e.body?'REQUEST BODY':'CONTOH RESPONS')+'</span><button data-copy="'+esc(e.body?JSON.stringify(e.body,null,2):e.code)+'">Salin</button></div><pre><code>'+esc(e.body?JSON.stringify(e.body,null,2):e.code)+'</code></pre></div>'+
        '<div class="docs-tools"><button class="docs-btn" data-try="'+esc(e.id)+'">Coba permintaan</button>'+
        '<button class="docs-btn secondary" data-url="'+esc(e.sample)+'">Salin endpoint</button></div>'+
        '<div class="docs-result" id="result-'+esc(e.id)+'" hidden><div class="docs-result-head">HASIL PERMINTAAN</div><pre class="docs-output"></pre></div>';
      list.append(item);
    }
  }
  const byId=new Map(endpointGroups.flatMap(group=>group.items).map(e=>[e.id,e]));
  let toastTimer;
  function flash(label='Tersalin'){
    const el=document.getElementById('docsToast');el.hidden=false;el.textContent=label;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,2200);
  }
  async function copy(s){
    try{await navigator.clipboard.writeText(s);flash();}catch{flash('Clipboard tidak tersedia');}
  }
  document.getElementById('copyBase').addEventListener('click',()=>copy(base));
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-copy],[data-url],[data-try]');if(!b)return;
    if(b.dataset.copy!==undefined){copy(b.dataset.copy);return;}
    if(b.dataset.url!==undefined){copy(base+b.dataset.url);return;}
    const spec=byId.get(b.dataset.try);if(!spec)return;
    const target=document.getElementById('result-'+spec.id);
    const head=target.querySelector('.docs-result-head'),pre=target.querySelector('pre');
    target.hidden=false;b.disabled=true;head.textContent='MEMINTA…';pre.textContent='Menghubungi '+spec.path;
    try{
      const opts=spec.body?{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(spec.body)}:{headers:{Accept:'application/json'}};
      const res=await fetch(spec.sample,{...opts,signal:AbortSignal.timeout(16000)});
      const text=await res.text();
      let pretty=text;
      try{pretty=JSON.stringify(JSON.parse(text),null,2);}catch{}
      head.textContent='HTTP '+res.status+' · '+(res.ok?'BERHASIL':'RESPONS SERVER');
      head.classList.toggle('error',!res.ok);
      pre.textContent=pretty.slice(0,10000);
    }catch(e){head.textContent='PERMINTAAN GAGAL';head.classList.add('error');pre.textContent=e.message||'Jaringan tidak tersedia';}
    finally{b.disabled=false;}
  });
  const io=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){
      nav.querySelectorAll('a').forEach(a=>a.classList.toggle('active',a.hash==='#'+entry.target.id));
    }
  },{rootMargin:'-20% 0px -68% 0px'});
  document.querySelectorAll('.docs-endpoint').forEach(el=>io.observe(el));
})();
