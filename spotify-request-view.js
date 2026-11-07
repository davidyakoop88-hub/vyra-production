// SPOTIFY-LÅTÖNSKNINGAR · VISNINGEN (David 2026-11-07). Två designer i den befintliga Låtönskningar-widgeten
// (templateSongRequests, källan Spotify): "Spotifykö" (kort) och "Ren musikrad" (linje). YouTube rörs inte.
//
// Studion läser Spotify (aktuell låt + Spotifys egen kö) och gör en ögonblicksbild med snapshot(). Den bilden
// innehåller bara titel, artist, albumomslag, längd och — när låten är en känd önskan i den här sessionen —
// önskarens visningsnamn. Spotify vet inte vilken tittare som önskade en låt; okänd önskare lämnas tom.
// Overlayn i OBS får samma bild via servern (POST /api/workspaces/:id/spotify-visning -> SSE `spotify`),
// aldrig via localStorage och aldrig med en token. html() ritar bara text genom esc().
(function (root) {
  'use strict';
  var FARSK_MS = 30000;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Bara Spotifys bild-CDN, samma vitlista som servern (server/goal-sse.js SPOTIFY_BILD).
  function image(url) { return /^https:\/\/i\.scdn\.co\/image\/[A-Za-z0-9]{8,64}$/.test(String(url || '')) ? String(url) : ''; }
  function track(t) {
    if (!t || t.type === 'episode' || !t.uri) return null;
    var bilder = t.album && t.album.images || [];
    return { uri: String(t.uri), title: String(t.name || 'Okänd låt'),
      artist: (t.artists || []).map(function (a) { return a && a.name; }).filter(Boolean).join(', '),
      image: image(bilder[bilder.length > 1 ? 1 : 0] && bilder[bilder.length > 1 ? 1 : 0].url),
      seconds: Math.max(0, Math.round(Number(t.duration_ms || 0) / 1000)) };
  }
  // Önskarens namn kopplas via låtens uri mot kända önskningar. Samma uri två gånger förbrukar en önskan var.
  function snapshot(current, queue, requests, at) {
    var known = (requests || []).filter(function (r) { return r && r.lat && r.lat.uri && r.status !== 'fel'; }).slice();
    function match(t) {
      if (!t) return null;
      var i = -1;
      for (var k = 0; k < known.length; k++) if (known[k].lat.uri === t.uri) { i = k; break; }
      var av = i < 0 ? '' : String(known.splice(i, 1)[0].av || '');
      return { title: t.title, artist: t.artist, image: t.image, seconds: t.seconds, requester: av };
    }
    var ko = queue && Array.isArray(queue.queue) ? queue.queue : [];
    return { at: at || Date.now(), playing: !!(current && current.is_playing), current: match(track(current && current.item)),
      queue: ko.slice(0, 10).map(track).filter(Boolean).map(match), error: '' };
  }
  function time(n) { return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); }
  function cover(t) { var url = t && image(t.image); return url ? '<img class="sr-cover" src="' + esc(url) + '" alt="">' : '<span class="sr-cover sr-placeholder" aria-hidden="true">♫</span>'; }
  function html(w, data, now) {
    var fresh = !!data && Number.isFinite(data.at) && (now || Date.now()) - data.at < FARSK_MS;
    var d = fresh ? data : null, current = d && d.current;
    var count = Math.max(0, Math.min(10, Number.isFinite(Number(w.latVisa)) ? Math.round(Number(w.latVisa)) : 3));
    var rows = w.latVisaKo === false ? [] : (d && d.queue || []).slice(0, count);
    var mode = w.latSpotifyDesign === 'line' ? ' sr-line' : '';
    var command = esc(w.latKommando || '!play');
    var status = !fresh ? 'Väntar på Spotify' : d.error ? 'Spotify kunde inte uppdateras' : d.exempel ? 'EXEMPEL · SPOTIFY INTE ANSLUTET' : current ? (d.playing ? 'NU SPELAS' : 'PAUSAD') : 'Ingen låt spelas';
    var body = '<div class="sr-now">' + cover(current) + '<div class="sr-info"><small>' + status + '</small><b title="' + esc(current && current.title) + '">' + esc(current ? current.title : 'Spotify') + '</b>';
    body += '<span>' + esc(current && current.artist || (!fresh ? 'Studion med Spotify måste vara öppen' : '')) + '</span>';
    if (current && (current.requester || current.seconds)) body += '<span class="sr-requester">' + (current.requester ? 'Önskad av ' + esc(current.requester) : '') + (current.requester && current.seconds ? ' · ' : '') + (current.seconds ? time(current.seconds) : '') + '</span>';
    body += '</div></div>';
    if (w.latVisaKo !== false && count > 0) {
      body += '<div class="sr-queue-label">KOMMANDE LÅTAR</div><ol class="sr-list">';
      body += rows.map(function (t, i) {
        return '<li><em>' + (i + 1) + '</em>' + cover(t) + '<div class="sr-info"><b title="' + esc(t.title) + '">' + esc(t.title) + '</b><span>' + esc(t.artist) + (t.seconds ? ' · ' + time(t.seconds) : '') + '</span>'
          + (t.requester ? '<span class="sr-requester">Önskad av ' + esc(t.requester) + '</span>' : '') + '</div></li>';
      }).join('');
      body += '</ol>' + (!rows.length ? '<div class="sr-empty">' + (fresh && !d.error ? 'Kön är tom' : 'Kön är inte tillgänglig') + '</div>' : '');
    }
    var num = function (v, f) { return Number.isFinite(Number(v)) ? Number(v) : f; };
    return '<div class="widget latonskningar lat-spotify sr-widget' + mode + '" data-id="' + esc(w.id) + '" style="left:' + num(w.x, 0) + 'px;top:' + num(w.y, 0) + 'px;width:' + num(w.width, 320) + 'px;zoom:' + num(w.widgetScale, 1) + ';z-index:' + num(w.layer, 1) + '">'
      + body + '<footer>Skriv <b>' + command + ' &lt;låt + artist&gt;</b></footer></div>';
  }
  // Studions exempel när Spotify inte är anslutet (aldrig i OBS): tydligt märkt, så att ingen tror att
  // det är den riktiga kön. Samma roll som den gamla widgetens exempelönskan.
  function exempel(now) {
    return { at: now || Date.now(), exempel: true, playing: true, error: '',
      current: { title: 'Exempellåt', artist: 'Artist', image: '', seconds: 204, requester: 'tittare' },
      queue: [{ title: 'Nästa önskade låt', artist: 'Artist', image: '', seconds: 187, requester: 'tittare2' },
        { title: 'Låt från Spotifys kö', artist: 'Artist', image: '', seconds: 221, requester: '' }] };
  }
  var api = { track: track, snapshot: snapshot, html: html, exempel: exempel, FARSK_MS: FARSK_MS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VyraSpotifyRequestView = api;
})(typeof window !== 'undefined' ? window : globalThis);
