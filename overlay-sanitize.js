// Every widget renderer builds its markup as a template string and hands it to innerHTML, and the
// fields it interpolates are written straight from the TikTok event stream — gift-event-images.js
// sets w.dataName from detail.username, live-leaderboard.js sets w.profileImage/w.giftImage, and the
// alert widgets do the same for their own fields. A viewer picks their own display name, so a name
// like  "><img src=x onerror=…>  used to close the surrounding tag and run script in the overlay and
// in the streamer's Studio. It is stored, not reflected: save() writes the widget back to
// localStorage and cloud-sync pushes it to the overlay state, so the payload survives a reload.
//
// This file is the single place that decides what may reach innerHTML. Renderers call it; they do
// not roll their own escaping. Loaded before every renderer so `VyraSafe` is defined by the time the
// first render() runs.
(function (root) {
  'use strict';

  const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

  // Backtick and single quote are escaped alongside the obvious three because renderers interpolate
  // into unquoted and single-quoted attributes as well as into text nodes, and an unquoted attribute
  // can be broken out of with a backtick in some parsers. Escaping more than a given context
  // strictly needs costs nothing visually — a name without HTML metacharacters comes back unchanged.
  function text(value, fallback = '') {
    const raw = value === undefined || value === null || value === '' ? fallback : value;
    if (raw === undefined || raw === null) return '';
    return String(raw).replace(/[&<>"'`]/g, ch => ENTITIES[ch]);
  }

  // http(s) and bitmap data: URIs only. Everything else falls back to the shipped asset.
  //
  // - javascript:/vbscript: are inert in <img src>, but the same values are also assigned to .src by
  //   live code and stored in the cloud state, so they are refused here rather than trusted to keep
  //   landing somewhere harmless.
  // - data:image/svg+xml is refused even though SVG script does not run inside <img>: the same URL
  //   in an <object>, an <iframe> or a direct navigation does run it, and nothing in VYRA needs
  //   inline SVG avatars.
  // - A scheme-less value is a relative asset path (assets/gifts/…), which is what every shipped
  //   fallback is. A protocol-relative //host/x is refused because its origin is whatever the page
  //   happens to be served over.
  const SAFE_URL = /^(?:https?:|data:image\/(?:png|jpe?g|gif|webp|avif);)/;

  // Control characters are dropped before the scheme is read: "java\tscript:alert(1)" is a
  // javascript: URL to the HTML parser but not to a regex run over the raw string. Done by code
  // point rather than a character class so no raw control byte has to live in this source file.
  function schemeProbe(raw) {
    let out = '';
    for (let i = 0; i < raw.length; i += 1) if (raw.charCodeAt(i) > 0x20) out += raw[i];
    return out.toLowerCase();
  }

  function src(value, fallback = '') {
    const raw = String(value === undefined || value === null ? '' : value).trim();
    if (!raw) return fallback;
    const probe = schemeProbe(raw);
    if (probe.startsWith('//')) return fallback;
    const hasScheme = /^[a-z][a-z0-9+.-]*:/.test(probe);
    if (hasScheme && !SAFE_URL.test(probe)) return fallback;
    // A relative path stays a path. Anything carrying a quote, an angle bracket or whitespace is
    // not one, and is the shape an attribute break-out takes.
    if (/["'<>`\s]/.test(raw)) return fallback;
    return raw;
  }

  // Attribute context: validate the URL, then escape whatever survives. Both steps are needed —
  // validation alone still lets  assets/x.png" onerror="…  break out of src="…".
  function url(value, fallback = '') {
    return text(src(value, fallback));
  }

  // Numbers interpolated into style and sizing attributes. A widget field can hold anything once it
  // has been through the cloud, and "16px;background:url(…)" in a style attribute is an injection
  // without a single angle bracket in it.
  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : (Number(fallback) || 0);
  }

  root.VyraSafe = { text, src, url, num };

  if (typeof module === 'object' && module.exports) module.exports = root.VyraSafe;
})(typeof window !== 'undefined' ? window : globalThis);
