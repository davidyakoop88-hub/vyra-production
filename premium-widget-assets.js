// premium-widget-assets.js — Premium Widget Design System, shared visual asset helpers
// (Roadmap Phase 4, see docs/PREMIUM_WIDGET_SPEC.md). No DOM mounting here — this file only
// provides pure functions (SVG glyph strings, URL sanitization, initials/fallback helpers)
// consumed by premium-widget-core.js. No dependency on any Recognition Engine file — this is
// a separate, additive system (see the spec's "Scope" section).
//
// All SVG glyphs are hand-authored inline strings (no external files, no icon font, no
// WebGL) — the same "proven, already-accepted quality bar" this codebase already uses for
// several of its existing profile-frame placeholder assets.
(function (root) {
  'use strict';

  function sanitizeImageUrl(url) {
    if (typeof url !== 'string') return null;
    var trimmed = url.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^data:image\//i.test(trimmed)) return trimmed;
    if (/^blob:/i.test(trimmed)) return trimmed;
    return null;
  }

  function initialsFromName(name) {
    var safe = (typeof name === 'string' ? name : '').trim();
    if (!safe) return '?';
    // Split on whitespace so "Robin Larsson" -> "RL"; a single word/emoji-only name -> first
    // 1-2 code points (String iteration, not .charAt, so surrogate pairs/emoji don't split).
    var parts = safe.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (firstChar(parts[0]) + firstChar(parts[1])).toUpperCase();
    }
    var chars = Array.from(parts[0] || safe);
    return chars.slice(0, 2).join('').toUpperCase();
  }

  function firstChar(str) {
    var chars = Array.from(str || '');
    return chars[0] || '';
  }

  // ---- inline SVG glyphs -------------------------------------------------------------
  // Every glyph uses currentColor (or an explicit gradient stop tied to the family's own CSS
  // custom properties via inline style on the returned markup's root) so it can be recolored
  // per family/theme without regenerating the string.

  function giftFallbackGlyphSvg() {
    return '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<rect x="3" y="9" width="18" height="11" rx="1.5" fill="currentColor" opacity=".9"/>'
      + '<rect x="2" y="6" width="20" height="4" rx="1" fill="currentColor"/>'
      + '<rect x="11" y="6" width="2" height="14" fill="rgba(0,0,0,.28)"/>'
      + '<path d="M12 6c-1.2-3-4.4-3.6-5.4-1.8C5.8 5.6 7 6 12 6z" fill="currentColor"/>'
      + '<path d="M12 6c1.2-3 4.4-3.6 5.4-1.8C18.2 5.6 17 6 12 6z" fill="currentColor"/>'
      + '</svg>';
  }

  function crownGlyphSvg() {
    return '<svg viewBox="0 0 48 28" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<path d="M4 24 L2 8 L14 17 L24 3 L34 17 L46 8 L44 24 Z" fill="currentColor" opacity=".95"/>'
      + '<circle cx="24" cy="3" r="3" fill="currentColor"/>'
      + '<circle cx="2" cy="8" r="2.4" fill="currentColor"/>'
      + '<circle cx="46" cy="8" r="2.4" fill="currentColor"/>'
      + '<rect x="4" y="24" width="40" height="3" rx="1" fill="currentColor"/>'
      + '</svg>';
  }

  function portalRingSvg() {
    return '<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<circle cx="50" cy="50" r="48" stroke="currentColor" stroke-width="1.5" opacity=".55"/>'
      + '<circle cx="50" cy="50" r="38" stroke="currentColor" stroke-width="1" opacity=".35"/>'
      + '</svg>';
  }

  function crystalFacetSvg() {
    return '<svg viewBox="0 0 120 90" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<polygon points="0,20 30,0 60,14 40,40" fill="currentColor" opacity=".14"/>'
      + '<polygon points="90,0 120,10 118,45 88,35" fill="currentColor" opacity=".10"/>'
      + '</svg>';
  }

  root.VyraPremiumWidgetAssets = Object.freeze({
    sanitizeImageUrl: sanitizeImageUrl,
    initialsFromName: initialsFromName,
    giftFallbackGlyphSvg: giftFallbackGlyphSvg,
    crownGlyphSvg: crownGlyphSvg,
    portalRingSvg: portalRingSvg,
    crystalFacetSvg: crystalFacetSvg
  });
})(typeof window !== 'undefined' ? window : globalThis);
