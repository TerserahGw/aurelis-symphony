/* Aurelis Symphony 2.1 — native audio web client */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const all = q => Array.from(document.querySelectorAll(q));
const ICONS = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  library:'<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="13" y="7" width="7" height="14" rx="1"/><path d="M13 11h7"/>',
  heart:'<path d="M20.5 5.8a5.2 5.2 0 0 0-7.4 0L12 6.9l-1.1-1.1a5.2 5.2 0 1 0-7.4 7.4L12 22l8.5-8.8a5.2 5.2 0 0 0 0-7.4z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',
  x:'<path d="M5 5l14 14M19 5 5 19"/>',
  play:'<path d="m8 5 12 7-12 7z"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  'skip-forward':'<path d="M19 5v14M5 5l11 7-11 7z"/>',
  'skip-back':'<path d="M5 5v14M19 5 8 12l11 7z"/>',
  shuffle:'<path d="M3 7h3c6 0 7 10 12 10h3M18 14l3 3-3 3M3 17h3c2 0 3-1 4-3M14 10c1-2 3-3 4-3h3M18 4l3 3-3 3"/>',
  repeat:'<path d="M3 9V7a3 3 0 0 1 3-3h12l-3-3M18 4l3 3-3 3M21 15v2a3 3 0 0 1-3 3H6l3 3M6 20l-3-3 3-3"/>',
  volume:'<path d="M11 5 6 9H3v6h3l5 4zM16 9a5 5 0 0 1 0 6M19 6a9 9 0 0 1 0 12"/>',
  mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 12a6 6 0 0 0 12 0M12 18v4M8 22h8"/>',
  list:'<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
  expand:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m12 2 2 2 2.5-.3 1 2.3L20 7l-.2 3 2.2 2-2.2 2 .2 3-2.5 1-1 2.3L14 20l-2 2-2-2-2.5.3-1-2.3L4 17l.2-3L2 12l2.2-2L4 7l2.5-1 1-2.3L10 4z"/>',
  'chevron-left':'<path d="m15 18-6-6 6-6"/>',
  'arrow-right':'<path d="M4 12h16M14 6l6 6-6 6"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  music:'<path d="M9 18V5l12-2v13M9 18a3 2 0 1 1-6 0 3 2 0 0 1 6 0zM21 16a3 2 0 1 1-6 0 3 2 0 0 1 6 0z"/>',
  disc:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  external:'<path d="M13 4h7v7M20 4l-9 9M19 14v5H5V5h5"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>'
};
const ic = name => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.disc) + '</svg>';
for (const node of all('[data-i]')) node.innerHTML = ic(node.dataset.i);
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validArt = url => /^https:\/\//i.test(String(url || '')) ? String(url) : '';
const read = (key, def) => { try { return JSON.parse(localStorage.getItem('aurelis:' + key)) ?? def; } catch { return def; } };
const store = (key, val) => { try { localStorage.setItem('aurelis:' + key, JSON.stringify(val)); } catch {} };
const audio = $('audio');
const state = {
  view: 'home', activePlaylist: null, query: '',
  catalog: [], home: [], results: [], favorite: new Set(read('favorites', [])),
  history: read('history', []), playlists: read('playlists', []),
  queue: read('queue', []), suggestions: [], cache: read('trackCache', {}),
  current: null, shuffle: read('shuffle', false), repeat: read('repeat', false),
  drawer: '', lyrics: null, lyricsSource: '', lyricsIndex: -1, loading: false,
  searching: false, sequence: 0, lyricSequence: 0, panelError: '',
  menuTrack: null, initial: true
};
const TRACK_LIMIT = 240;
let searchTimer = null;
let currentGenre = '';
let playerInit = false;
const genres = [
  ['Untukmu',''],['Santai','chill relaxing music'],['Pop','pop songs'],['J-Pop','japanese pop music'],
  ['K-Pop','kpop music'],['Lofi','lofi beats'],['Workout','workout music'],['Indie','indie pop songs']
];
const formatTime = n => {
  n = Math.max(0, Math.floor(Number(n) || 0));
  return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
};
const art = (track, type = 'artwork') => {
  const url = validArt(track?.artwork);
  return '<div class="' + type + '">' + (url
    ? '<img src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
    : '<span class="art-placeholder">✦</span>') + '</div>';
};
function remember(track) {
  if (!track?.id) return;
  state.cache[track.id] = track;
  const keys = Object.keys(state.cache);
  if (keys.length > TRACK_LIMIT) {
    for (const k of keys.slice(0, keys.length - TRACK_LIMIT)) delete state.cache[k];
  }
}
function save() {
  store('favorites', [...state.favorite]);
  store('history', state.history.slice(0, 70));
  store('playlists', state.playlists);
  store('queue', state.queue);
  store('trackCache', state.cache);
  store('shuffle', state.shuffle);
  store('repeat', state.repeat);
}
function trackById(id) {
  if (state.cache[id]) return state.cache[id];
  return [...state.catalog, ...state.home, ...state.results, ...state.queue, ...state.suggestions]
    .find(t => t?.id === id) || null;
}
function uniq(tracks) {
  const seen = new Set();
  return (tracks || []).filter(t => t?.id && !seen.has(t.id) && seen.add(t.id));
}
function toast(message, error = false) {
  const item = document.createElement('div');
  item.className = 'toast' + (error ? ' error' : '');
  item.textContent = message;
  $('toasts').append(item);
  setTimeout(() => item.remove(), 4200);
}
async function api(route, options = {}) {
  const res = await fetch(route, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Tidak dapat menghubungi server');
  return data;
}
function skeleton(count = 6) {
  return '<div class="album-grid">' + Array.from({ length: count }, () =>
    '<div class="skeleton-card"><div class="skeleton"></div><div class="skeleton sk-line"></div></div>').join('') + '</div>';
}
function empty(title, message, icon = 'music') {
  return '<div class="search-empty">' + ic(icon) + '<h3>' + esc(title) + '</h3><p>' + esc(message) + '</p></div>';
}
function section(title, body, tag = '', extra = '') {
  return '<div class="section-head"><div>' + (tag ? '<div class="eyebrow">' + esc(tag) + '</div>' : '') +
    '<h2>' + esc(title) + '</h2></div>' + extra + '</div>' + body;
}
function card(t, index) {
  if (!t?.id) return '';
  remember(t);
  const id = esc(t.id), delay = Math.min(index * 22, 220);
  return '<article class="music-card" style="animation-delay:' + delay + 'ms">' +
    '<div class="artwork"><button data-action="play" data-id="' + id + '" aria-label="Putar ' + esc(t.title) +
    '" style="position:absolute;inset:0;width:100%;z-index:1"></button>' +
    (validArt(t.artwork) ? '<img src="' + esc(t.artwork) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="art-placeholder">✦</span>') +
    '<button class="card-play" data-action="play" data-id="' + id + '" aria-label="Putar">' + ic('play') + '</button></div>' +
    '<button class="card-more" data-action="menu" data-id="' + id + '" aria-label="Opsi lagu">' + ic('more') + '</button>' +
    '<div class="card-copy"><button class="card-title" data-action="play" data-id="' + id + '" title="' + esc(t.title) +
    '">' + esc(t.title) + '</button><p>' + esc(t.artist || 'Unknown artist') + '</p></div></article>';
}
function cards(tracks, limit = 12) {
  const slice = uniq(tracks).slice(0, limit);
  if (!slice.length) return empty('Belum ada musik', 'Coba cari artis atau lagu yang kamu suka.');
  return '<div class="album-grid">' + slice.map(card).join('') + '</div>';
}
function row(t, i, opts = {}) {
  remember(t);
  const id = esc(t.id);
  return '<div class="track-row">' +
    '<span class="track-index">' + String(i + 1).padStart(2, '0') + '</span>' +
    art(t, 'track-thumb') +
    '<div class="track-info"><button data-action="play" data-id="' + id + '">' + esc(t.title || 'Untitled') +
    '</button><small>' + esc(t.artist || 'Unknown artist') + (t.album ? ' · ' + esc(t.album) : '') + '</small></div>' +
    '<span class="track-duration">' + formatTime(t.duration) + '</span>' +
    '<button class="row-action ' + (state.favorite.has(t.id) ? 'liked' : '') + '" data-action="like" data-id="' + id +
    '" aria-label="Sukai">' + ic('heart') + '</button>' +
    '<button class="row-action" data-action="' + (opts.remove ? 'remove-track' : 'menu') + '" data-id="' + id +
    '" aria-label="Opsi">' + ic(opts.remove ? 'x' : 'more') + '</button></div>';
}
function rows(tracks, options = {}) {
  const list = uniq(tracks);
  if (!list.length) return empty('Belum ada lagu', 'Mulai dengan mencari musik atau menambahkan lagu.');
  return '<div class="track-list">' + list.map((t, i) => row(t, i, options)).join('') + '</div>';
}
function chips() {
  return '<div class="chip-row">' + genres.map(([label, term]) =>
    '<button class="chip ' + (currentGenre === term ? 'active' : '') + '" data-action="genre" data-term="' + esc(term) +
    '">' + esc(label) + '</button>').join('') + '</div>';
}
function hero() {
  return '<div class="feature-hero"><div class="hero-copy"><div class="eyebrow">✦ YOUR SOUND, YOUR SPACE</div>' +
    '<h2>Feel every<br>frequency.</h2><p>Setiap lagu punya cerita. Temukan soundtrack untuk momenmu.</p>' +
    '<button class="primary-button" data-action="explore">Jelajahi musik ' + ic('arrow-right') + '</button></div>' +
    '<div class="hero-visual" aria-hidden="true">♫</div></div>';
}
function homeView() {
  const featured = uniq(state.home.length ? state.home : state.catalog);
  const recentTracks = uniq(state.history.map(trackById).filter(Boolean));
  return '<div class="eyebrow">GOOD VIBES ONLY · AURELIS 2.1</div><h1 class="greeting">Musik untuk <span>harimu.</span></h1>' +
    '<p class="subheading">Temukan lagu, buat playlist, dan dengarkan dengan pemutar audio Aurelis.</p>' +
    hero() + chips() +
    section('Pilihan untukmu', state.loading ? skeleton() : cards(featured, 12), 'DENGARKAN SEKARANG',
      '<button class="see-all" data-action="explore">Jelajahi ' + ic('arrow-right') + '</button>') +
    (recentTracks.length ? section('Terakhir kamu dengar', cards(recentTracks, 8), 'RECENTLY PLAYED') : '') +
    section('Aurelis Originals', cards(state.catalog, 8), 'ORIGINAL DEMO AUDIO') +
    '<p class="note">Lagu YouTube menggunakan relay audio eksperimental melalui YouTube.js, bukan embed. Tidak semua hasil pencarian pasti dapat diputar.</p>';
}
function searchView() {
  const title = state.query ? 'Hasil pencarian' : 'Jelajahi musik';
  const subtitle = state.query ? 'Menampilkan musik untuk “' + esc(state.query) + '”' : 'Coba genre favoritmu atau ketik judul lagu di atas.';
  return '<div class="heading-page"><div class="eyebrow">EXPLORE THE SOUND</div><h1>' + title +
    '</h1><p>' + subtitle + '</p></div>' + chips() +
    (state.searching ? skeleton(8) : state.results.length
      ? section('Lagu dan video musik', rows(state.results), 'HASIL DARI YOUTUBE.JS')
      : state.query ? empty('Belum ada hasil', 'Coba kata kunci lain atau periksa akses pencarian YouTube.js.', 'search')
        : section('Mulai dari sini', cards(state.home.length ? state.home : state.catalog, 12), 'REKOMENDASI'));
}
function libraryView() {
  return '<div class="heading-page"><div class="eyebrow">YOUR COLLECTION</div><h1>Koleksi musikmu</h1><p>Semua yang kamu simpan, ada di sini.</p></div>' +
    section('Playlist kamu', '<div class="playlist-grid"><button class="playlist-card create" data-action="new-playlist"><span class="playlist-cover">' +
      ic('plus') + '</span><strong>Buat playlist</strong><small>Koleksi baru</small></button>' +
      state.playlists.map(p => '<button class="playlist-card" data-action="open-playlist" data-id="' + esc(p.id) +
        '"><span class="playlist-cover">♫</span><strong>' + esc(p.name) + '</strong><small>' +
        (p.tracks || []).length + ' lagu</small></button>').join('') + '</div>', 'YOUR PLAYLISTS') +
    section('Aurelis Originals', cards(state.catalog, 8), 'LAGU SIAP DIPUTAR');
}
function playlistView() {
  const p = state.playlists.find(p => p.id === state.activePlaylist);
  if (!p) return empty('Playlist tidak ditemukan', 'Buat playlist baru di halaman koleksi.');
  const tracks = (p.tracks || []).map(t => typeof t === 'string' ? trackById(t) : t).filter(Boolean);
  return '<div class="playlist-header"><div class="playlist-header-art">♫</div><div>' +
    '<div class="eyebrow">PLAYLIST PRIBADI</div><h1>' + esc(p.name) + '</h1><p>' + tracks.length +
    ' lagu · Aurelis Symphony</p><button class="primary-button" data-action="play-first" style="margin-top:13px">' +
    ic('play') + ' Putar playlist</button></div></div>' + rows(tracks, { remove:true });
}
function simpleView(kind) {
  const recent = kind === 'recent';
  const tracks = recent ? uniq(state.history.map(trackById).filter(Boolean))
    : uniq([...state.favorite].map(trackById).filter(Boolean));
  return '<div class="heading-page"><div class="eyebrow">YOUR COLLECTION</div><h1>' +
    (recent ? 'Baru diputar' : 'Lagu disukai') + '</h1><p>' +
    (recent ? 'Putar kembali lagu yang pernah kamu dengar.' : 'Semua lagu yang bikin kamu jatuh cinta.') +
    '</p></div>' + rows(tracks);
}
function render() {
  all('[data-nav]').forEach(n => n.classList.toggle('active', n.dataset.nav === state.view));
  const page = state.view === 'home' ? homeView() : state.view === 'search' ? searchView() :
    state.view === 'library' ? libraryView() : state.view === 'playlist' ? playlistView() :
    simpleView(state.view);
  $('view').innerHTML = page;
  renderSidePlaylists();
}
function renderSidePlaylists() {
  $('sidePlaylists').innerHTML = state.playlists.map(p =>
    '<button class="side-playlist" data-action="open-playlist" data-id="' + esc(p.id) +
    '">' + ic('disc') + ' ' + esc(p.name) + '</button>').join('');
}
function navigate(view, playlistId) {
  state.view = view;
  if (view === 'playlist') state.activePlaylist = playlistId;
  if (view === 'search' && $('searchInput').value.trim()) state.query = $('searchInput').value.trim();
  render();
  $('scrollArea').scrollTo({ top: 0, behavior: 'smooth' });
}
async function search(term) {
  term = String(term || '').trim();
  state.query = term;
  if (term.length < 2) { state.searching = false; state.results = []; render(); return; }
  const seq = ++state.sequence;
  state.searching = true;
  state.view = 'search';
  render();
  try {
    const data = await api('/api/v1/search?provider=youtube&q=' + encodeURIComponent(term) + '&limit=30');
    if (seq !== state.sequence) return;
    state.results = uniq(data.tracks || []);
    state.results.forEach(remember);
    save();
  } catch (e) {
    if (seq !== state.sequence) return;
    state.results = [];
    toast('Pencarian gagal: ' + e.message, true);
  } finally {
    if (seq === state.sequence) { state.searching = false; render(); }
  }
}
async function loadHome() {
  state.loading = true;
  render();
  try {
    const [catalogResult, homeResult] = await Promise.allSettled([
      api('/api/v1/catalog'), api('/api/v2/home')
    ]);
    if (catalogResult.status === 'fulfilled') state.catalog = catalogResult.value.tracks || [];
    if (homeResult.status === 'fulfilled') state.home = homeResult.value.tracks || [];
    [...state.catalog, ...state.home].forEach(remember);
  } catch {} finally {
    state.loading = false;
    if (state.view === 'home') render();
    else renderSidePlaylists();
    save();
  }
}
function audioUrl(t) {
  if (t?.audio && typeof t.audio === 'string' && t.audio.startsWith('/')) return t.audio;
  const id = t?.videoId || (String(t?.id || '').startsWith('yt-') ? String(t.id).slice(3) : '');
  return /^[a-zA-Z0-9_-]{11}$/.test(id) ? '/api/v2/audio/' + id : '';
}
function currentTime() { return Number(audio.currentTime) || 0; }
function currentDuration() {
  return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(state.current?.duration) || 0;
}
function setPlayer() {
  const t = state.current;
  $('playerTitle').textContent = t?.title || 'Belum ada lagu';
  $('playerArtist').textContent = t?.artist || 'Putar lagu favoritmu';
  $('playerArt').innerHTML = validArt(t?.artwork)
    ? '<img src="' + esc(t.artwork) + '" alt="Artwork">' : '<span>✦</span>';
  $('playerLike').classList.toggle('liked', !!t && state.favorite.has(t.id));
  $('playButton').innerHTML = ic(audio.paused ? 'play' : 'pause');
  $('shuffleButton').classList.toggle('active', state.shuffle);
  $('repeatButton').classList.toggle('active', state.repeat > 0);
  updateTime();
}
function updateTime() {
  const duration = currentDuration();
  const percent = duration ? Math.max(0, Math.min(100, currentTime() / duration * 100)) : 0;
  $('elapsed').textContent = formatTime(currentTime());
  $('duration').textContent = formatTime(duration);
  if (!state.seeking) $('seek').value = String(Math.round(percent * 10));
  $('seek').style.setProperty('--pct', percent + '%');
  $('mobileProgress').style.width = percent + '%';
  syncLyrics();
}
async function play(t) {
  if (!t) return;
  if (!t.id) return;
  const seq = ++state.sequence;
  state.current = t;
  remember(t);
  state.history = [t.id, ...state.history.filter(id => id !== t.id)].slice(0, 70);
  state.lyrics = null;
  state.lyricsIndex = -1;
  state.panelError = '';
  save();
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  setPlayer();
  if (state.drawer) renderPanel();
  loadLyrics(t);
  recommend(t, seq);
  const url = audioUrl(t);
  if (!url) { toast('Lagu ini belum punya sumber audio yang didukung.', true); return; }
  audio.src = url;
  audio.load();
  try {
    await audio.play();
  } catch (e) {
    if (seq === state.sequence) {
      state.panelError = 'Pemutaran langsung tidak tersedia untuk lagu ini.';
      toast('Tidak dapat memutar sumber audio. Coba lagu lain.', true);
      if (state.drawer) renderPanel();
    }
  }
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title || 'Untitled', artist: t.artist || 'Unknown', album: t.album || 'Aurelis Symphony',
        artwork: validArt(t.artwork) ? [{ src: t.artwork }] : []
      });
      navigator.mediaSession.playbackState = 'playing';
    } catch {}
  }
}
async function recommend(t, seq) {
  const others = uniq([...state.results, ...state.home, ...state.catalog])
    .filter(x => x.id !== t.id && !state.queue.some(q => q.id === x.id));
  state.suggestions = others.slice(0, 3);
  if (state.drawer === 'queue') renderPanel();
  if (t.provider !== 'youtube' && !t.videoId && !String(t.id).startsWith('yt-')) return;
  try {
    const params = new URLSearchParams({ track: t.title || '', artist: t.artist || '', exclude: t.id, limit: '15' });
    const result = await api('/api/v1/recommendations?' + params);
    if (seq !== state.sequence || state.current?.id !== t.id) return;
    state.suggestions = uniq(result.tracks || [])
      .filter(x => x.id !== t.id && !state.queue.some(q => q.id === x.id)).slice(0, 3);
    state.suggestions.forEach(remember);
    save();
    if (state.drawer === 'queue') renderPanel();
  } catch {}
}
function next() {
  const queued = state.queue.shift();
  const suggested = !queued && state.suggestions.shift();
  const selected = queued || suggested;
  if (!selected) {
    if (state.repeat) { audio.currentTime = 0; audio.play().catch(() => {}); }
    else { audio.pause(); toast('Antrean sudah selesai.'); }
    return;
  }
  save();
  play(selected);
}
function previous() {
  if (currentTime() > 3) { audio.currentTime = 0; return; }
  const ids = state.history.filter(id => id !== state.current?.id);
  const hit = ids.map(trackById).find(Boolean);
  if (hit) play(hit); else audio.currentTime = 0;
}
function toggle() {
  if (!state.current) return play(state.home[0] || state.catalog[0] || state.results[0]);
  if (audio.paused) audio.play().catch(() => toast('Audio tidak tersedia saat ini.', true));
  else audio.pause();
}
function like(t) {
  if (!t) return;
  if (state.favorite.has(t.id)) state.favorite.delete(t.id);
  else state.favorite.add(t.id);
  remember(t);
  save();
  setPlayer();
  render();
  toast(state.favorite.has(t.id) ? 'Ditambahkan ke lagu disukai' : 'Dihapus dari lagu disukai');
}
function addQueue(t, first = false) {
  if (!t) return;
  remember(t);
  if (first) state.queue.unshift(t); else state.queue.push(t);
  save();
  if (state.drawer === 'queue') renderPanel();
  toast(first ? 'Akan diputar selanjutnya' : 'Ditambahkan ke antrean');
}
function openPanel(type) {
  state.drawer = type || 'now';
  $('sidePanel').classList.add('open');
  $('sidePanel').setAttribute('aria-hidden', 'false');
  $('scrim').hidden = false;
  renderPanel();
}
function closePanel() {
  state.drawer = '';
  $('sidePanel').classList.remove('open');
  $('sidePanel').setAttribute('aria-hidden', 'true');
  $('scrim').hidden = true;
}
function renderPanel() {
  const t = state.current;
  const label = { now: 'Sedang Diputar', lyrics: 'Lirik Realtime', queue: 'Antrean Berikutnya' };
  $('panelHeading').textContent = label[state.drawer] || 'Sedang Diputar';
  all('[data-panel]').forEach(el => el.classList.toggle('selected', el.dataset.panel === state.drawer));
  if (state.drawer === 'lyrics') {
    if (!t) return $('panelContent').innerHTML = empty('Belum ada lagu', 'Putar musik untuk mencari lirik.');
    if (!state.lyrics) return $('panelContent').innerHTML = empty('Mencari lirik...', 'LRCLIB dan lyrics.ovh akan dicoba secara otomatis.', 'mic');
    const lines = state.lyrics.lines || [];
    $('panelContent').innerHTML = '<span class="lyrics-credit">' + esc((state.lyrics.source || 'Aurelis').toUpperCase()) +
      (state.lyrics.synced ? ' · SINKRON' : ' · TANPA TIMESTAMP') + '</span>' +
      (lines.length ? lines.map((l,i) => '<div class="lyrics-line" data-action="lyric-seek" data-index="' + i +
        '" data-time="' + (l.time === null ? '' : Number(l.time)) + '">' + esc(l.text) +
        (l.translation ? '<p class="translation">' + esc(l.translation) + '</p>' : '') + '</div>').join('')
        : empty('Lirik tidak ditemukan', 'Lagu mungkin instrumental atau tidak tersedia.'));
    syncLyrics(true);
    return;
  }
  if (state.drawer === 'queue') {
    const q = [...(t ? [{ ...t, kind:'current' }] : []), ...state.queue.map(x => ({...x,kind:'manual'})),
      ...state.suggestions.map(x => ({...x,kind:'auto'}))];
    $('panelContent').innerHTML = '<p class="note">Up Next menggabungkan lagu yang kamu tambahkan dengan rekomendasi otomatis.</p>' +
      (q.length ? q.map((x,i) => '<div class="queue-line">' +
        (validArt(x.artwork) ? '<img src="' + esc(x.artwork) + '" alt="">' : '<div class="q-art">✦</div>') +
        '<div class="q-text"><strong>' + esc(x.title) + '</strong><small>' +
        (x.kind === 'current' ? 'Sedang diputar' : x.kind === 'manual' ? 'Ditambahkan' : 'Rekomendasi') +
        ' · ' + esc(x.artist) + '</small></div>' +
        (x.kind === 'current' ? '' : '<button class="q-remove" data-action="queue-remove" data-kind="' +
          x.kind + '" data-index="' + (x.kind === 'manual' ? state.queue.findIndex(t => t.id === x.id) :
          state.suggestions.findIndex(t => t.id === x.id)) + '" aria-label="Hapus">' + ic('x') + '</button>') +
        '</div>').join('') : empty('Antrean kosong', 'Cari musik untuk mulai mendengarkan.'));
    return;
  }
  if (!t) return $('panelContent').innerHTML = empty('Belum ada lagu', 'Temukan lagu favoritmu di halaman Jelajahi.');
  $('panelContent').innerHTML = art(t, 'panel-big-art') + '<h3 class="panel-song-name">' + esc(t.title) +
    '</h3><p class="panel-song-artist">' + esc(t.artist || '') + '</p><div class="panel-divider"></div>' +
    '<div class="eyebrow">SUMBER AUDIO</div><p class="note">' +
    (t.audio ? 'Original / berlisensi · HTML5 Audio' :
      'YouTube.js · audio langsung eksperimental. Tanpa iframe. Dapat gagal karena pembatasan dari YouTube.') +
    '</p>' + (state.panelError ? '<p class="note" style="color:#ffbcbf">' + esc(state.panelError) + '</p>' : '') +
    (t.url ? '<a class="secondary-button" target="_blank" rel="noopener noreferrer" href="' +
      esc(t.url) + '">Buka sumber ' + ic('external') + '</a>' : '');
}
async function loadLyrics(t) {
  const token = ++state.lyricSequence;
  if (Array.isArray(t.lyrics) && t.lyrics.length) {
    state.lyrics = { source:'Aurelis Originals', synced:true, lines:t.lyrics };
    if (state.drawer === 'lyrics') renderPanel();
    return;
  }
  try {
    const title = String(t.title || '').replace(/\s*[\[(](official|music video|lyrics|audio|4k).*?[\])]/gi, '').trim();
    const qs = new URLSearchParams({ track:title, artist:String(t.artist || '').replace(/ - Topic$/i, ''),
      duration:String(Math.round(t.duration || 0)) });
    const data = await api('/api/v1/lyrics?' + qs);
    if (token !== state.lyricSequence || state.current?.id !== t.id) return;
    state.lyrics = data.result || { source:'unavailable', synced:false, lines:[] };
    if (state.drawer === 'lyrics') renderPanel();
  } catch {
    if (token === state.lyricSequence) {
      state.lyrics = { source:'unavailable', synced:false, lines:[] };
      if (state.drawer === 'lyrics') renderPanel();
    }
  }
}
function syncLyrics(force = false) {
  if (state.drawer !== 'lyrics' || !state.lyrics?.synced) return;
  const lines = state.lyrics.lines || [];
  let pos = -1;
  for (let i = 0; i < lines.length; i++) if (Number.isFinite(lines[i].time) && lines[i].time <= currentTime() + .05) pos = i;
  if (pos !== state.lyricsIndex || force) {
    state.lyricsIndex = pos;
    const nodes = all('.lyrics-line');
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('active', i === pos);
      nodes[i].classList.toggle('past', i < pos);
    }
    if (pos >= 0 && nodes[pos] && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      nodes[pos].scrollIntoView({ behavior:'smooth', block:'center' });
  }
}
function showTrackMenu(t) {
  if (!t) return;
  state.menuTrack = t;
  $('menuTitle').textContent = t.title || 'Opsi lagu';
  $('menuArtist').textContent = t.artist || '';
  const liked = state.favorite.has(t.id);
  const opts = [
    ['play','Putar sekarang'], ['next','Putar berikutnya'], ['queue','Tambahkan ke antrean'],
    ['like', liked ? 'Hapus dari lagu disukai' : 'Sukai lagu']
  ];
  let content = opts.map(([action,label]) => '<button class="menu-action" data-menu="' + action + '">' +
    ic(action === 'like' ? 'heart' : action === 'queue' ? 'list' : 'play') + esc(label) + '</button>').join('');
  if (state.playlists.length) {
    content += '<p class="note">TAMBAHKAN KE PLAYLIST</p>' +
      state.playlists.map(p => '<button class="menu-action" data-menu="playlist" data-playlist="' + esc(p.id) +
        '">' + ic('plus') + esc(p.name) + '</button>').join('');
  } else content += '<button class="menu-action" data-menu="new-playlist">' + ic('plus') + 'Buat playlist baru</button>';
  if (t.url) content += '<button class="menu-action" data-menu="open-source">' + ic('external') + 'Buka sumber asli</button>';
  $('songMenuOptions').innerHTML = content;
  $('trackDialog').showModal();
}
function newPlaylist() {
  $('playlistName').value = '';
  $('playlistDialog').showModal();
  $('playlistName').focus();
}
function createPlaylist(name) {
  name = String(name || '').trim().slice(0,70);
  if (!name) return;
  const id = 'pl-' + Date.now();
  state.playlists.push({ id, name, tracks:[] });
  save(); render(); toast('Playlist dibuat: ' + name);
}
function removeFromPlaylist(id) {
  const p = state.playlists.find(x => x.id === state.activePlaylist);
  if (!p) return;
  p.tracks = (p.tracks || []).filter(t => (typeof t === 'string' ? t : t.id) !== id);
  save(); render(); toast('Lagu dihapus dari playlist');
}
function handleMenu(action, button) {
  const t = state.menuTrack;
  $('trackDialog').close();
  if (!t) return;
  if (action === 'play') play(t);
  if (action === 'queue') addQueue(t);
  if (action === 'next') addQueue(t, true);
  if (action === 'like') like(t);
  if (action === 'new-playlist') newPlaylist();
  if (action === 'open-source' && t.url && /^https:\/\//i.test(t.url)) window.open(t.url, '_blank', 'noopener,noreferrer');
  if (action === 'playlist') {
    const p = state.playlists.find(x => x.id === button.dataset.playlist);
    if (!p) return;
    if (!p.tracks.some(x => (typeof x === 'string' ? x : x.id) === t.id)) {
      p.tracks.push(t); save(); toast('Ditambahkan ke ' + p.name); render();
    } else toast('Lagu sudah ada di playlist');
  }
}
function openGenre(term) {
  currentGenre = term;
  if (!term) { navigate('home'); return; }
  $('searchInput').value = term;
  search(term);
}
function handleClick(event) {
  const nav = event.target.closest('[data-nav]');
  if (nav) { navigate(nav.dataset.nav); return; }
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const type = btn.dataset.action;
  const t = btn.dataset.id ? trackById(btn.dataset.id) : null;
  if (type === 'play') play(t);
  else if (type === 'like') like(t);
  else if (type === 'menu') showTrackMenu(t);
  else if (type === 'genre') openGenre(btn.dataset.term);
  else if (type === 'explore') { navigate('search'); $('searchInput').focus(); }
  else if (type === 'new-playlist') newPlaylist();
  else if (type === 'open-playlist') navigate('playlist', btn.dataset.id);
  else if (type === 'play-first') {
    const p = state.playlists.find(x => x.id === state.activePlaylist);
    const tracks = (p?.tracks || []).map(x => typeof x === 'string' ? trackById(x) : x).filter(Boolean);
    if (tracks.length) { state.queue = tracks.slice(1); play(tracks[0]); }
  }
  else if (type === 'remove-track') removeFromPlaylist(btn.dataset.id);
  else if (type === 'queue-remove') {
    const index = Number(btn.dataset.index);
    if (btn.dataset.kind === 'manual') state.queue.splice(index, 1);
    else state.suggestions.splice(index, 1);
    save(); renderPanel();
  }
  else if (type === 'lyric-seek' && btn.dataset.time !== '') {
    const time = Number(btn.dataset.time);
    if (Number.isFinite(time) && audio.seekable.length) audio.currentTime = time;
  }
}
function setupEvents() {
  document.addEventListener('click', handleClick);
  $('searchInput').addEventListener('input', event => {
    clearTimeout(searchTimer);
    const term = event.target.value;
    if (!term.trim()) { state.query = ''; state.results = []; state.searching = false; navigate('search'); return; }
    state.view = 'search';
    searchTimer = setTimeout(() => search(term), 390);
  });
  $('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); search(e.target.value); } });
  $('navBack').addEventListener('click', () => navigate('home'));
  $('playButton').addEventListener('click', toggle);
  $('nextButton').addEventListener('click', next);
  $('prevButton').addEventListener('click', previous);
  $('playerLike').addEventListener('click', () => like(state.current));
  $('shuffleButton').addEventListener('click', () => {
    state.shuffle = !state.shuffle; if (state.shuffle) state.queue.sort(() => Math.random() - .5);
    save(); setPlayer(); toast(state.shuffle ? 'Mode acak aktif' : 'Mode acak mati');
  });
  $('repeatButton').addEventListener('click', () => {
    state.repeat = (state.repeat + 1) % 3;
    save(); setPlayer();
    toast(['Ulang mati','Ulang antrean','Ulang satu lagu'][state.repeat]);
  });
  $('volume').value = String(Math.round((Number(read('volume', .75)) || .75) * 100));
  audio.volume = Number($('volume').value) / 100;
  $('volume').addEventListener('input', e => {
    audio.volume = Number(e.target.value) / 100;
    e.target.style.setProperty('--pct', e.target.value + '%');
    store('volume', audio.volume);
  });
  $('volume').style.setProperty('--pct', $('volume').value + '%');
  $('seek').addEventListener('pointerdown', () => { state.seeking = true; });
  $('seek').addEventListener('pointerup', () => { state.seeking = false; });
  $('seek').addEventListener('change', e => {
    const duration = currentDuration();
    if (duration > 0 && Number.isFinite(duration)) audio.currentTime = duration * Number(e.target.value) / 1000;
    state.seeking = false;
  });
  $('queueButton').addEventListener('click', () => openPanel('queue'));
  $('lyricsButton').addEventListener('click', () => openPanel('lyrics'));
  $('expandButton').addEventListener('click', () => openPanel('now'));
  $('playerArt').addEventListener('click', () => openPanel('now'));
  $('playerTitle').addEventListener('click', () => openPanel('now'));
  $('closePanel').addEventListener('click', closePanel);
  $('scrim').addEventListener('click', closePanel);
  all('[data-panel]').forEach(b => b.addEventListener('click', () => openPanel(b.dataset.panel)));
  $('newPlaylistSide').addEventListener('click', newPlaylist);
  $('playlistCancel').addEventListener('click', () => $('playlistDialog').close());
  $('playlistForm').addEventListener('submit', e => {
    e.preventDefault();
    createPlaylist($('playlistName').value);
    $('playlistDialog').close();
  });
  $('songMenuOptions').addEventListener('click', e => {
    const button = e.target.closest('[data-menu]');
    if (button) handleMenu(button.dataset.menu, button);
  });
  $('closeTrackMenu').addEventListener('click', () => $('trackDialog').close());
  $('settingsButton').addEventListener('click', () => $('settingsDialog').showModal());
  $('settingsClose').addEventListener('click', () => $('settingsDialog').close());
  audio.addEventListener('play', () => { setPlayer(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
  audio.addEventListener('pause', () => { setPlayer(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
  audio.addEventListener('timeupdate', updateTime);
  audio.addEventListener('durationchange', updateTime);
  audio.addEventListener('loadedmetadata', updateTime);
  audio.addEventListener('ended', () => {
    if (state.repeat === 2) { audio.currentTime = 0; audio.play().catch(() => {}); } else next();
  });
  audio.addEventListener('error', () => {
    if (!state.current) return;
    state.panelError = 'Stream gagal / format tidak didukung / upstream membatasi akses. Coba lagu lain.';
    toast('Tidak bisa memutar ' + state.current.title + '. Sumber audio membatasi akses.', true);
    if (state.drawer === 'now') renderPanel();
  });
  document.addEventListener('keydown', e => {
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (e.key === '/' && !editing) { e.preventDefault(); $('searchInput').focus(); }
    if (e.code === 'Space' && !editing && !document.querySelector('dialog[open]')) { e.preventDefault(); toggle(); }
    if (e.key === 'Escape') closePanel();
  });
  if ('mediaSession' in navigator) {
    const handlers = {
      play: () => audio.play().catch(() => {}), pause: () => audio.pause(),
      nexttrack: next, previoustrack: previous,
      seekto: e => { if (Number.isFinite(e.seekTime)) audio.currentTime = e.seekTime; }
    };
    for (const [action, fn] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action, fn); } catch {}
    }
  }
}
async function boot() {
  setupEvents();
  setPlayer();
  render();
  await loadHome();
  api('/api/v1/config').then(d => {
    $('backendLabel').textContent = d.discovery?.backend === 'official' ? 'YouTube API' : 'YouTube.js';
    if (!d.directAudio?.enabled) {
      $('sourceStatus').textContent = 'Audio eksperimen dinonaktifkan';
      toast('Streaming langsung YouTube dinonaktifkan oleh server.', true);
    }
  }).catch(() => {});
}
boot();
})();
