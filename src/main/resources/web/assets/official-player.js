// Official provider embeds: no media proxying or stream URL extraction.
(function () {
  'use strict';
  var panel = document.getElementById('officialPlayer');
  var frame = document.getElementById('officialFrame');
  var title = document.getElementById('officialTrackTitle');
  var note = document.getElementById('officialTrackNote');
  var external = document.getElementById('officialOpenOriginal');
  var closeButton = document.getElementById('officialClose');
  var currentUrl = '';
  if (!panel || !frame || !closeButton || !external) return;

  function embedFor(track) {
    if (!track || !track.url) return null;
    var u;
    try { u = new URL(track.url); } catch (_) { return null; }
    if (u.protocol !== 'https:') return null;
    var host = u.hostname.toLowerCase();
    var videoId = '';
    if (host === 'youtu.be') videoId = u.pathname.split('/')[1] || '';
    else if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'www.youtube-nocookie.com') {
      if (u.pathname === '/watch') videoId = u.searchParams.get('v') || '';
      else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/live/') || u.pathname.startsWith('/embed/')) videoId = u.pathname.split('/')[2] || '';
    }
    if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return {
        provider: 'YouTube',
        url: 'https://www.youtube-nocookie.com/embed/' + videoId + '?autoplay=1&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin),
        height: 225
      };
    }
    if (host === 'soundcloud.com' || host === 'www.soundcloud.com' || host === 'm.soundcloud.com') {
      return {
        provider: 'SoundCloud',
        url: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(u.href) + '&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false',
        height: 166
      };
    }
    return null;
  }

  function close() {
    panel.hidden = true;
    frame.removeAttribute('src'); // stops playback immediately
    currentUrl = '';
  }

  function open(track) {
    var embed = embedFor(track);
    if (!embed) return false;
    close();
    currentUrl = track.url;
    frame.title = embed.provider + ' — ' + (track.title || 'Music');
    frame.style.height = embed.height + 'px';
    panel.classList.toggle('official-player-soundcloud', embed.provider === 'SoundCloud');
    title.textContent = track.title || 'Official music player';
    note.textContent = embed.provider + ' · Use the controls below. Some tracks cannot be embedded or autoplayed.';
    external.href = track.url;
    frame.src = embed.url;
    panel.hidden = false;
    return true;
  }

  closeButton.addEventListener('click', close);
  window.AurelisEmbeds = {
    open: open,
    close: close,
    active: function () { return !!currentUrl; },
    focus: function () { panel.hidden = false; panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  };
})();
