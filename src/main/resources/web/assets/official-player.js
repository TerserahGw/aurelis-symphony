// Visible official provider players. No hidden playback or media URL extraction.
(function () {
  'use strict';
  const panel = document.getElementById('officialPlayer');
  const frame = document.getElementById('officialFrame');
  const title = document.getElementById('officialTrackTitle');
  const note = document.getElementById('officialTrackNote');
  const external = document.getElementById('officialOpenOriginal');
  const closeBtn = document.getElementById('officialClose');
  if (!panel || !frame) return;
  let player = null, activeUrl = '', isPlaying = false, apiPromise = null;
  function parse(track) {
    if (!track?.url) return null;
    try {
      const url = new URL(track.url);
      if (url.protocol !== 'https:') return null;
      const h = url.hostname;
      let id = '';
      if (h === 'youtu.be') id = url.pathname.split('/')[1] || '';
      else if (['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','www.youtube-nocookie.com'].includes(h)) {
        if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
        else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2] || '';
      }
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return { kind: 'youtube', id };
      if (['soundcloud.com','www.soundcloud.com','m.soundcloud.com'].includes(h)) return { kind: 'soundcloud', url: url.href };
    } catch {}
    return null;
  }
  function notify(state) {
    window.dispatchEvent(new CustomEvent('aurelis:embed-state', { detail: { playing: state } }));
  }
  function loadYT() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (typeof previous === 'function') previous(); resolve(window.YT); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { apiPromise = null; reject(new Error('YouTube API unavailable')); };
      document.head.append(script);
    });
    return apiPromise;
  }
  function close() {
    activeUrl = ''; isPlaying = false;
    if (player?.destroy) { try { player.destroy(); } catch {} }
    player = null;
    frame.removeAttribute('src');
    panel.hidden = true;
    notify(false);
  }
  function open(track) {
    const parsed = parse(track);
    if (!parsed) return false;
    close();
    const session = track.url;
    activeUrl = session;
    panel.hidden = false;
    title.textContent = track.title || 'Music player';
    external.href = track.url;
    if (parsed.kind === 'soundcloud') {
      frame.style.height = '166px';
      frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(parsed.url) + '&auto_play=true';
      note.textContent = 'SoundCloud · Use the visible provider player';
      return true;
    }
    frame.style.height = '225px';
    frame.src = 'https://www.youtube-nocookie.com/embed/' + parsed.id + '?autoplay=1&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    note.textContent = 'YouTube · The official player must stay visible';
    loadYT().then(YT => {
      if (activeUrl !== session) return;
      player = new YT.Player(frame, { events: {
        onStateChange: event => {
          if (activeUrl !== session) return;
          isPlaying = event.data === YT.PlayerState.PLAYING;
          notify(isPlaying);
          if (event.data === YT.PlayerState.ENDED) window.dispatchEvent(new Event('aurelis:embed-ended'));
        },
        onError: () => { if (activeUrl === session) note.textContent = 'This track cannot be embedded. Open on YouTube.'; }
      }});
    }).catch(() => { if (activeUrl === session) note.textContent = 'YouTube controls unavailable. Use the embedded player.'; });
    return true;
  }
  function getTime() { try { return player?.getCurrentTime?.() || 0; } catch { return 0; } }
  function getDuration() { try { return player?.getDuration?.() || 0; } catch { return 0; } }
  function seek(s) { try { player?.seekTo?.(Math.max(0, s), true); } catch {} }
  function setVolume(v) { try { player?.setVolume?.(Math.max(0, Math.min(100, v))); } catch {} }
  function toggle() {
    if (player?.playVideo && player?.pauseVideo) {
      try { isPlaying ? player.pauseVideo() : player.playVideo(); return; } catch {}
    }
    focus();
  }
  function focus() { if (activeUrl) { panel.hidden = false; panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }
  closeBtn?.addEventListener('click', close);
  window.AurelisEmbeds = { open, close, focus, toggle, active: () => !!activeUrl,
    getTime, getDuration, seek, setVolume };
})();
