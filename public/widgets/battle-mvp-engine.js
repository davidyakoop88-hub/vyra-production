// Shared engine behind every Battle MVP tribute theme.
//
// Each of the seven designs ships as its own standalone widget file
// (battle-mvp-<theme>.html) so a streamer can point an OBS Browser Source straight at the look
// they want. Those files are deliberately thin: they set <body data-theme="..."> and load this
// engine plus battle-mvp.css. All shared behaviour — the four-phase timeline, the text hierarchy,
// configuration, queueing and the real Battle-MVP trigger — lives here exactly once.
//
// Themes: crystal-tribute, royal-ascension, diamond-throne, celestial-honor, emerald-legacy,
// dragon-crest, velvet-spotlight (+ liquid-chrome, reachable via ?theme=liquid-chrome).
'use strict';
(function (root) {

  const params = new URLSearchParams(location.search);
  function num(v, f) { if (v === null || v === '') return f; const n = Number(v); return Number.isFinite(n) ? n : f }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)) }

  // Facet shading derived from the accent colour itself, so gems stay luminous and inside their
  // own colour family rather than sinking toward black.
  function shade(color, amount) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color).trim());
    if (!m) return color;
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    const t = amount < 0 ? 0 : 255, k = Math.abs(amount);
    return '#' + rgb.map(v => Math.round(v + (t - v) * k).toString(16).padStart(2, '0')).join('');
  }

  /* ================= Shared artwork helpers ================= */
  const GOLD = '#e8be6c';

  // NOTE on the two-<g> nesting used by gem() and shard(): a CSS `transform` (which every theme's
  // entrance animation applies) completely REPLACES an SVG element's `transform` presentation
  // attribute rather than composing with it. Putting both on one <g> therefore wipes out the
  // element's placement the moment the animation starts, collapsing every gem onto the origin.
  // Positioning lives on the outer <g>; only the inner <g> carries the animated class.

  // A faceted gem: lit face, shadow face and a top table, so it reads as cut stone.
  function gem(x, y, w, h, rot, color, delay) {
    const l = -w / 2, r = w / 2, sh = -h * 0.28;
    return `<g transform="translate(${x} ${y}) rotate(${rot})"><g class="orn-gem" style="--gd:${delay}s">
      <path d="M${l} 0 L${l} ${sh} L0 ${-h} L${r} ${sh} L${r} 0 Z" fill="${shade(color, -0.25)}"/>
      <path d="M${l} 0 L${l} ${sh} L0 ${-h} L0 0 Z" fill="${shade(color, 0.3)}"/>
      <path d="M0 ${-h} L${r} ${sh} L${r} 0 L0 0 Z" fill="${shade(color, -0.5)}"/>
      <path d="M${l} ${sh} L0 ${-h} L${r} ${sh} L0 ${sh + h * 0.16} Z" fill="#ffffff" opacity=".3"/>
    </g></g>`;
  }

  // Long tapered shard, for icy / spiked frames.
  function shard(x, y, w, h, rot, color, delay) {
    return `<g transform="translate(${x} ${y}) rotate(${rot})"><g class="orn-gem" style="--gd:${delay}s">
      <path d="M${-w / 2} 0 L0 ${-h} L${w / 2} 0 L0 ${h * 0.16} Z" fill="${shade(color, -0.2)}"/>
      <path d="M${-w / 2} 0 L0 ${-h} L0 ${h * 0.16} Z" fill="${shade(color, 0.45)}"/>
      <path d="M0 ${-h} L0 ${h * 0.16} L${w / 2} 0 Z" fill="${shade(color, -0.45)}" opacity=".9"/>
    </g></g>`;
  }

  // Gold laurel spray curving up one side.
  function laurel(side, color) {
    const d = side === 'left' ? -1 : 1;
    let out = `<path d="M${200 + d * 58} 214 C ${200 + d * 104} 208, ${200 + d * 134} 168, ${200 + d * 138} 116"
                  fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
    for (let i = 0; i < 7; i++) {
      const t = i / 6, x = 200 + d * (58 + 80 * t), y = 214 - 98 * t - 6 * Math.sin(t * 3), rot = d * (-70 + t * 40);
      out += `<ellipse cx="${x}" cy="${y}" rx="15" ry="6.5" fill="${color}" opacity="${(0.95 - t * 0.18).toFixed(2)}" transform="rotate(${rot} ${x} ${y})"/>`;
    }
    return out;
  }

  // Ornate gold ring behind the portrait — every one of the designs carries one.
  function goldRing(color) {
    return `<circle cx="200" cy="120" r="76" fill="none" stroke="${color}" stroke-width="4" opacity=".95"/>
            <circle cx="200" cy="120" r="83" fill="none" stroke="${color}" stroke-width="1.4" opacity=".65"/>
            <circle cx="200" cy="120" r="70" fill="none" stroke="#fff3cf" stroke-width=".8" opacity=".45"/>`;
  }

  function crown(fill, gemColor) {
    return `<g class="orn-top">
      <path d="M148 56 L160 22 L178 44 L200 12 L222 44 L240 22 L252 56 Z" fill="url(#crownG)" stroke="${shade(GOLD, -0.35)}" stroke-width="1.4"/>
      <rect x="146" y="56" width="108" height="13" rx="4" fill="url(#crownG)" stroke="${shade(GOLD, -0.35)}" stroke-width="1.2"/>
      <path d="M200 4 L206 14 L200 24 L194 14 Z" fill="${gemColor}"/>
      <circle cx="160" cy="20" r="4.5" fill="${gemColor}"/><circle cx="240" cy="20" r="4.5" fill="${gemColor}"/>
      <circle cx="200" cy="62" r="4" fill="${gemColor}"/>
    </g>`;
  }

  /* ================= Themes ================= */
  const THEMES = {
    // 1 — gold + violet crystals assemble around the portrait and dissolve into particles
    'crystal-tribute': {
      title: 'Crystal Tribute',
      vars: { '--beam-a': '#f6c76b', '--beam-b': '#b478ff', '--frame': GOLD, '--glow-1': 'rgba(246,199,107,.7)', '--glow-2': 'rgba(180,120,255,.5)', '--banner-hi': '#4a2170', '--banner-lo': '#2a1146', '--soft': '#d9c9ff' },
      art() {
        const cols = ['#b478ff', '#f6c76b', '#8fd4ff', '#c79bff', '#f0d79a'];
        let out = '';
        // Gems sit on an arc around the portrait centre (200,120) and are rotated to point
        // outward, so the wreath fans open like wings. Angles run from straight up (0deg),
        // negative counter-clockwise; each gem is mirrored to the other side by 400-x / -angle.
        // Bases sit inside the gold ring so the crystals appear to emerge from behind the portrait.
        for (let i = 0; i < 9; i++) {
          const t = i / 8;
          const a = -34 - t * 92;                       // -34deg (upper) .. -126deg (lower-left)
          const rad = a * Math.PI / 180;
          const R = 58 + (i % 2) * 9;                   // alternating depth reads as layered
          const x = 200 + Math.sin(rad) * R;
          const y = 120 - Math.cos(rad) * R;
          const h = 50 + Math.sin(t * Math.PI) * 38;    // longest in the middle of the fan
          const w = 16 + Math.sin(t * Math.PI) * 9;
          const color = cols[i % cols.length];
          out += gem(x, y, w, h, a, color, i * 0.05);
          out += gem(400 - x, y, w, h, -a, color, i * 0.05);
        }
        out += gem(200, 62, 19, 44, 0, '#d8a7ff', 0.46); // crown gem, straight up
        return out + goldRing(GOLD);                     // ring last so it sits over the bases
      }
    },

    // 2 — crown, baroque ornament and rising light pillars
    'royal-ascension': {
      title: 'Royal Ascension',
      vars: { '--beam-a': '#f6d68e', '--beam-b': '#f0a6d8', '--frame': GOLD, '--glow-1': 'rgba(246,214,142,.75)', '--glow-2': 'rgba(255,215,120,.45)', '--banner-hi': '#48206e', '--banner-lo': '#291043', '--soft': '#f3e2c1' },
      art() {
        let out = '';
        [112, 150, 250, 288].forEach((x, i) => {
          out += `<g class="orn-beam" style="--gd:${(i * 0.08).toFixed(2)}s"><rect x="${x - 6}" y="46" width="12" height="176" rx="6" fill="url(#pillar)" opacity=".8"/></g>`;
        });
        out += goldRing(GOLD);
        [-1, 1].forEach(d => {
          out += `<g class="${d < 0 ? 'orn-left' : 'orn-right'}">
            <path d="M${200 + d * 82} 150 C ${200 + d * 128} 146, ${200 + d * 136} 106, ${200 + d * 112} 86
                     C ${200 + d * 146} 96, ${200 + d * 152} 152, ${200 + d * 104} 168 Z" fill="${GOLD}" opacity=".95"/>
            <path d="M${200 + d * 88} 176 C ${200 + d * 124} 182, ${200 + d * 140} 200, ${200 + d * 132} 218
                     C ${200 + d * 112} 206, ${200 + d * 96} 196, ${200 + d * 82} 190 Z" fill="${shade(GOLD, -0.2)}"/>
          </g>`;
        });
        return out + crown('url(#crownG)', '#e07ab8');
      }
    },

    // 3 — ice shards fly in and lock into a monumental diamond frame
    'diamond-throne': {
      title: 'Diamond Throne',
      vars: { '--beam-a': '#dff1ff', '--beam-b': '#8fd0ff', '--frame': '#dbeeff', '--glow-1': 'rgba(190,225,255,.8)', '--glow-2': 'rgba(120,190,255,.5)', '--banner-hi': '#1d3856', '--banner-lo': '#0d1e33', '--soft': '#dcecff' },
      art() {
        const cols = ['#eaf6ff', '#b9dcff', '#8fc8f5', '#d6ecff'];
        let out = '';
        for (let i = 0; i < 13; i++) {
          const t = i / 12, ang = -118 + t * 236, rad = 104;
          const x = 200 + Math.sin(ang * Math.PI / 180) * rad * 0.98;
          const y = 138 - Math.cos(ang * Math.PI / 180) * rad * 0.72;
          out += shard(x, y, 17 + (i % 3) * 3, 64 + Math.sin(t * Math.PI) * 46, ang, cols[i % cols.length], i * 0.04);
        }
        out += goldRing('#cfe8ff');
        return out + `<path d="M200 30 L212 52 L200 74 L188 52 Z" fill="#f2fbff" opacity=".95"/>`;
      }
    },

    // 4 — crescent moon, stars and slowly turning orbital rings
    'celestial-honor': {
      title: 'Celestial Honor',
      vars: { '--beam-a': '#cfe0ff', '--beam-b': '#9a7bff', '--frame': '#dfe8ff', '--glow-1': 'rgba(190,205,255,.75)', '--glow-2': 'rgba(140,110,255,.5)', '--banner-hi': '#232a5c', '--banner-lo': '#121538', '--soft': '#cdd6ff' },
      art() {
        let out = `<g class="orn-back"><path d="M120 118 A 74 74 0 1 1 196 44 A 58 58 0 1 0 120 118 Z" fill="url(#moonG)"/></g>`;
        out += `<g class="orn-orbit"><ellipse cx="200" cy="120" rx="132" ry="52" fill="none" stroke="#b9c6ff" stroke-width="1.4" opacity=".65"/></g>`;
        out += `<g class="orn-orbit rev"><ellipse cx="200" cy="120" rx="112" ry="106" fill="none" stroke="#9a7bff" stroke-width="1.2" opacity=".5"/></g>`;
        out += goldRing('#d6e0ff');
        [[92, 52], [300, 44], [336, 110], [76, 168], [318, 182], [142, 30], [256, 26], [360, 72], [52, 104]].forEach(([x, y], i) => {
          out += `<path class="orn-gem" style="--gd:${(i * 0.22).toFixed(2)}s" d="M${x} ${y - 8} L${x + 2.4} ${y - 2.4} L${x + 8} ${y} L${x + 2.4} ${y + 2.4} L${x} ${y + 8} L${x - 2.4} ${y + 2.4} L${x - 8} ${y} L${x - 2.4} ${y - 2.4} Z" fill="#f2f5ff"/>`;
        });
        return out;
      }
    },

    // 5 — faceted emerald shield with gold laurels
    'emerald-legacy': {
      title: 'Emerald Legacy',
      vars: { '--beam-a': '#8ef0c0', '--beam-b': '#f6d68e', '--frame': GOLD, '--glow-1': 'rgba(120,240,180,.65)', '--glow-2': 'rgba(246,214,142,.45)', '--banner-hi': '#0f5540', '--banner-lo': '#07301f', '--soft': '#c9f5de' },
      art() {
        let out = '<g class="orn-back">';
        [[200, 18, 120, 64], [120, 64, 200, 132], [280, 64, 200, 132], [120, 64, 200, 18], [280, 64, 200, 18],
         [120, 132, 200, 200], [280, 132, 200, 200], [200, 200, 120, 132], [200, 200, 280, 132]].forEach((f, i) => {
          out += `<path d="M${f[0]} ${f[1]} L${f[2]} ${f[3]} L200 120 Z" fill="${shade('#2ecf8f', i % 2 ? -0.25 : 0.15)}" opacity=".9"/>`;
        });
        out += '</g>';
        out += `<g class="orn-left">${laurel('left', GOLD)}</g><g class="orn-right">${laurel('right', GOLD)}</g>`;
        out += goldRing(GOLD);
        [[96, 58], [304, 58], [80, 140], [320, 140], [200, 22]].forEach(([x, y], i) => {
          out += gem(x, y, 16, 30, i % 2 ? 14 : -14, '#3ff0a8', i * 0.4);
        });
        return out;
      }
    },

    // 6 — two golden dragons meet and form an honour crest
    'dragon-crest': {
      title: 'Dragon Crest',
      vars: { '--beam-a': '#f6cf7f', '--beam-b': '#ff7a6a', '--frame': GOLD, '--glow-1': 'rgba(246,207,127,.75)', '--glow-2': 'rgba(200,40,40,.45)', '--banner-hi': '#7a1420', '--banner-lo': '#420a12', '--soft': '#f7d9c4' },
      art() {
        let out = `<g class="orn-back"><path d="M104 200 C 112 116 152 60 200 44 C 248 60 288 116 296 200 Z" fill="url(#velvetR)" opacity=".92"/></g>`;
        [-1, 1].forEach(d => {
          out += `<g class="${d < 0 ? 'orn-left' : 'orn-right'}">
            <path d="M${200 + d * 100} 226 C ${200 + d * 168} 214, ${200 + d * 176} 132, ${200 + d * 126} 84
                     C ${200 + d * 150} 74, ${200 + d * 164} 44, ${200 + d * 138} 26"
                  fill="none" stroke="url(#dragonG)" stroke-width="15" stroke-linecap="round"/>
            <path d="M${200 + d * 100} 226 C ${200 + d * 168} 214, ${200 + d * 176} 132, ${200 + d * 126} 84"
                  fill="none" stroke="#fff2cf" stroke-width="3.5" opacity=".55" stroke-linecap="round"/>
            <path d="M${200 + d * 138} 26 c ${d * 16} -8 ${d * 26} 4 ${d * 20} 16 c ${d * -12} 8 ${d * -26} 2 ${d * -20} -16 Z" fill="${GOLD}"/>
            <circle cx="${200 + d * 146}" cy="30" r="2.6" fill="#ff5d4d"/>
            ${[0, 1, 2, 3].map(i => {
              const t = (i + 1) / 5, px = 200 + d * (100 + 66 * t), py = 226 - 118 * t - 8 * Math.sin(t * 2.6);
              return `<path d="M${px} ${py} l ${d * 13} -9 l ${d * -3} 13 Z" fill="${shade(GOLD, -0.15)}" opacity=".95"/>`;
            }).join('')}
          </g>`;
        });
        out += goldRing(GOLD);
        return out + `<g class="orn-top"><path d="M176 44 L188 18 L200 34 L212 18 L224 44 Z" fill="#b81f2c" stroke="${GOLD}" stroke-width="1.6"/>
              <path d="M200 6 L206 16 L200 26 L194 16 Z" fill="#ff6a5a"/></g>`;
      }
    },

    // 7 — gala staging: wine-red velvet, gold linework, sweeping spotlights
    'velvet-spotlight': {
      title: 'Velvet Spotlight',
      vars: { '--beam-a': '#ffe6b8', '--beam-b': '#ff8fa0', '--frame': GOLD, '--glow-1': 'rgba(255,230,184,.75)', '--glow-2': 'rgba(190,30,60,.45)', '--banner-hi': '#7d1226', '--banner-lo': '#450a15', '--soft': '#f6d7dd' },
      art() {
        let out = '';
        [[132, -16], [268, 16]].forEach(([x, tilt], i) => {
          out += `<g class="orn-beam" style="--gd:${(i * 0.14).toFixed(2)}s" transform="translate(${x} 6) rotate(${tilt})">
            <path d="M0 0 L-42 214 L42 214 Z" fill="url(#spotG)"/>
            <circle cx="0" cy="0" r="9" fill="#fff3d2"/>
          </g>`;
        });
        [-1, 1].forEach(d => {
          out += `<g class="${d < 0 ? 'orn-left' : 'orn-right'}">
            <path d="M${200 + d * 70} 84 C ${200 + d * 140} 70, ${200 + d * 172} 124, ${200 + d * 150} 208
                     C ${200 + d * 118} 176, ${200 + d * 92} 140, ${200 + d * 70} 128 Z" fill="url(#velvetR)"/>
            <path d="M${200 + d * 74} 96 C ${200 + d * 132} 92, ${200 + d * 156} 134, ${200 + d * 142} 190"
                  fill="none" stroke="${GOLD}" stroke-width="2.2" opacity=".85"/>
          </g>`;
        });
        out += goldRing(GOLD);
        return out + `<g class="orn-top"><path d="M180 48 L190 24 L200 38 L210 24 L220 48 Z" fill="#b81f3a" stroke="${GOLD}" stroke-width="1.5"/></g>`;
      }
    },

    // Bonus (not one of the seven files) — flowing silver / violet / cyan chrome
    'liquid-chrome': {
      title: 'Liquid Chrome',
      vars: { '--beam-a': '#dfe7f5', '--beam-b': '#9a7bff', '--frame': '#e4ecf7', '--glow-1': 'rgba(220,232,248,.75)', '--glow-2': 'rgba(120,220,255,.5)', '--banner-hi': '#2b2f52', '--banner-lo': '#14162c', '--soft': '#dde6f7' },
      art() {
        let out = `<g class="orn-back"><path d="M200 22 C 268 30 320 74 314 128 C 308 186 254 222 200 218 C 146 222 92 186 86 128 C 80 74 132 30 200 22 Z" fill="url(#chromeG)" opacity=".92"/></g>`;
        out += `<g class="orn-left">
          <path d="M108 196 C 66 162 74 96 122 66 C 96 108 100 156 132 186 Z" fill="url(#chromeV)" opacity=".9"/>
          <path d="M120 208 C 88 184 92 132 124 106 C 108 142 110 178 138 200 Z" fill="url(#chromeC)" opacity=".75"/></g>`;
        out += `<g class="orn-right">
          <path d="M292 196 C 334 162 326 96 278 66 C 304 108 300 156 268 186 Z" fill="url(#chromeV)" opacity=".9"/>
          <path d="M280 208 C 312 184 308 132 276 106 C 292 142 290 178 262 200 Z" fill="url(#chromeC)" opacity=".75"/></g>`;
        return out + goldRing('#e8f0fa');
      }
    }
  };

  const SVG_DEFS = `<defs>
    <linearGradient id="pillar" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f6d68e" stop-opacity="0"/><stop offset="1" stop-color="#fff3cf"/></linearGradient>
    <linearGradient id="crownG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6dc"/><stop offset=".5" stop-color="#e8be6c"/><stop offset="1" stop-color="#9d6f2c"/></linearGradient>
    <linearGradient id="dragonG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3cf"/><stop offset=".5" stop-color="#e0ab4e"/><stop offset="1" stop-color="#8f6021"/></linearGradient>
    <linearGradient id="velvetR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a4162c"/><stop offset="1" stop-color="#4b0a15"/></linearGradient>
    <linearGradient id="chromeG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f8ff"/><stop offset=".35" stop-color="#9aa8c4"/><stop offset=".6" stop-color="#e8f0fb"/><stop offset="1" stop-color="#7f8aa8"/></linearGradient>
    <linearGradient id="chromeV" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9a8ff"/><stop offset="1" stop-color="#6a4bd0"/></linearGradient>
    <linearGradient id="chromeC" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a8f0ff"/><stop offset="1" stop-color="#3fa8d0"/></linearGradient>
    <linearGradient id="spotG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3d2" stop-opacity=".85"/><stop offset="1" stop-color="#fff3d2" stop-opacity="0"/></linearGradient>
    <radialGradient id="moonG" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9c6ff"/></radialGradient>
  </defs>`;

  const SILHOUETTE = `<svg viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-9 2.2-9 5v3h18v-3c0-2.8-4.6-5-9-5Z"/></svg>`;

  /* ================= Boot ================= */
  // Theme resolution order: ?theme= wins (handy for previewing), otherwise the theme baked into
  // the hosting file's <body data-theme>, otherwise the first design.
  const bodyTheme = document.body.dataset.theme;
  const themeName = THEMES[params.get('theme')] ? params.get('theme')
    : (THEMES[bodyTheme] ? bodyTheme : 'crystal-tribute');

  document.body.innerHTML = `
    <div id="stage">
      <div id="beams"></div>
      <div id="emblem">
        <svg id="ornament" viewBox="0 0 400 300" aria-hidden="true"></svg>
        <div id="portrait-wrap"><div id="portrait">${SILHOUETTE}</div></div>
      </div>
      <div id="tribute-text">
        <div id="thanks"></div>
        <div id="label-wrap"><div id="label">BATTLE MVP</div></div>
        <div id="username">@ANVÄNDARNAMN</div>
        <div id="subtitle">DU GJORDE SKILLNADEN</div>
        <div id="score-wrap"><div id="score-plaque"><span id="score">0</span> <span id="score-unit">POÄNG</span></div></div>
      </div>
      <div id="particles"></div>
    </div>` + document.body.innerHTML;

  const stage = document.getElementById('stage');
  const beamsEl = document.getElementById('beams');
  const ornamentEl = document.getElementById('ornament');
  const particlesEl = document.getElementById('particles');
  const portraitEl = document.getElementById('portrait');
  const rootStyle = document.documentElement.style;

  function applyTheme(name) {
    stage.dataset.theme = name;
    document.body.dataset.theme = name;
    Object.entries(THEMES[name].vars).forEach(([k, v]) => rootStyle.setProperty(k, v));
    // Author-supplied overrides win over the theme's own palette.
    if (params.get('accent')) { rootStyle.setProperty('--glow-1', params.get('accent')); rootStyle.setProperty('--beam-a', params.get('accent')) }
    if (params.get('frameColor')) rootStyle.setProperty('--frame', params.get('frameColor'));
  }

  rootStyle.setProperty('--name-size', clamp(num(params.get('nameSize'), 58), 18, 140) / 16 + 'rem');
  rootStyle.setProperty('--label-size', clamp(num(params.get('labelSize'), 27), 10, 60) / 16 + 'rem');
  rootStyle.setProperty('--sub-size', clamp(num(params.get('subSize'), 17), 8, 40) / 16 + 'rem');
  rootStyle.setProperty('--score-size', clamp(num(params.get('scoreSize'), 15), 8, 40) / 16 + 'rem');
  rootStyle.setProperty('--emblem-w', clamp(num(params.get('emblemWidth'), 544), 220, 1100) / 16 + 'rem');
  rootStyle.setProperty('--portrait', clamp(num(params.get('portraitPct'), 34), 18, 52) + '%');
  applyTheme(themeName);

  const holdMs = clamp(num(params.get('duration'), 5000), 1500, 20000);
  const PHASE = { light: 0, entrance: 1000, tribute: 3000, end: 3000 + holdMs, done: 3000 + holdMs + 1000 };

  function buildBeams() {
    let out = '';
    for (let i = 0; i < 8; i++) out += `<div class="beam" style="--a:${i * 45}deg;--d:${(Math.random() * 0.2).toFixed(2)}s"></div>`;
    beamsEl.innerHTML = out + '<div id="core-spark"></div>';
  }

  function buildOrnament(name) { ornamentEl.innerHTML = SVG_DEFS + THEMES[name].art() }

  function applyContent(d) {
    document.getElementById('thanks').textContent = d.thanks || params.get('thanks') || '';
    document.getElementById('label').textContent = d.label || params.get('label') || 'BATTLE MVP';
    document.getElementById('username').textContent = d.username ? '@' + String(d.username).replace(/^@/, '') : '@ANVÄNDARNAMN';
    document.getElementById('subtitle').textContent = d.subtitle || params.get('subtitle') || 'DU GJORDE SKILLNADEN';
    document.getElementById('score-unit').textContent = d.scoreUnit || params.get('scoreUnit') || 'POÄNG';

    const raw = d.score != null ? d.score : params.get('score');
    const n = Number(raw);
    document.getElementById('score').textContent =
      raw !== null && raw !== '' && Number.isFinite(n) ? n.toLocaleString('sv-SE') : (raw || '0');

    portraitEl.querySelector('img')?.remove();
    const src = d.profileUrl || params.get('profile');
    if (src) {
      const img = document.createElement('img');
      img.src = src; img.alt = '';
      img.onerror = () => img.remove(); // falls back to the silhouette underneath
      portraitEl.append(img);
    }
  }

  function spawnParticles() {
    let out = '';
    for (let i = 0; i < 30; i++) {
      const size = (3 + Math.random() * 6).toFixed(1);
      out += `<div class="mote" style="width:${size}px;height:${size}px;left:${(44 + Math.random() * 12).toFixed(1)}%;--mx:${(Math.random() * 160 - 80).toFixed(0)}px;--md:${(1.1 + Math.random() * 0.9).toFixed(2)}s;--mdl:${(Math.random() * 0.6).toFixed(2)}s"></div>`;
    }
    particlesEl.innerHTML = out;
  }

  let playing = false;
  const queue = [];

  function playSequence(data) {
    playing = true;
    const useTheme = data.theme && THEMES[data.theme] ? data.theme : themeName;
    applyContent(data);
    applyTheme(useTheme);
    buildBeams();
    buildOrnament(useTheme); // rebuilt per run so each theme's entrance animation restarts cleanly
    stage.className = '';
    void stage.offsetWidth;

    setTimeout(() => stage.classList.add('p-light'), PHASE.light);
    setTimeout(() => stage.classList.add('p-entrance'), PHASE.entrance);
    setTimeout(() => stage.classList.add('p-tribute'), PHASE.tribute);
    setTimeout(() => { stage.classList.add('p-end'); spawnParticles() }, PHASE.end);
    setTimeout(() => {
      stage.className = '';
      particlesEl.innerHTML = '';
      ornamentEl.innerHTML = '';
      beamsEl.innerHTML = '';
      playing = false;
      const next = queue.shift();
      if (next) playSequence(next);
    }, PHASE.done);
  }

  // Back-to-back tributes queue rather than cutting a ceremony off mid-sentence.
  function trigger(data) {
    if (!data) return;
    if (playing) { queue.push(data); return }
    playSequence(data);
  }

  /* ================= Real Battle MVP trigger =================
     Who the MVP *is* isn't carried by any single TikTok event, so it's derived here: gift value is
     accumulated per user, and the running leader can be crowned on demand or automatically when a
     battle ends. Auto-firing is opt-in (?autoBattle=1) because battleStatus wording comes from an
     unofficial upstream library and shouldn't silently drive an on-stream ceremony. */
  const contributions = new Map();
  function recordGift(event) {
    const key = String(event.userId || event.username || '').toLowerCase();
    if (!key) return;
    const prev = contributions.get(key) || { username: event.username || event.userId, score: 0, profileUrl: event.profileUrl };
    prev.score += Number(event.value) || 0;
    if (event.profileUrl) prev.profileUrl = event.profileUrl;
    contributions.set(key, prev);
  }
  function triggerTopContributor(extra) {
    let best = null;
    for (const entry of contributions.values()) if (!best || entry.score > best.score) best = entry;
    if (!best) { root.VyraWidget?.warn('Ingen gåvogivare registrerad ännu — kan inte utse MVP.'); return false }
    trigger({ username: best.username, score: Math.round(best.score), profileUrl: best.profileUrl, ...(extra || {}) });
    return true;
  }

  root.VyraBattleMvpWidget = {
    render: trigger, trigger,
    triggerTopContributor,
    recordGift,
    contributions: () => [...contributions.values()].sort((a, b) => b.score - a.score),
    resetContributions: () => contributions.clear(),
    theme: () => stage.dataset.theme,
    themes: Object.keys(THEMES)
  };

  const autoBattle = params.get('autoBattle') === '1' || params.get('autoBattle') === 'true';
  const uid = params.get('uid');
  if (uid) {
    root.VyraWidget.connect({ uid, onEvent(event) {
      if (!event) return;
      if (event.type === 'gift') recordGift(event);
      if (autoBattle && event.type === 'battle' && /end|finish|over|complete/i.test(String(event.battleStatus || ''))) triggerTopContributor();
    }});
  } else {
    root.VyraWidget.warn('Inget uid — ansluter inte till någon live-ström (förhandsgranskningsläge).');
  }

  if (params.get('auto') === '1' || params.get('auto') === 'true') {
    trigger({ username: params.get('username') || 'Användarnamn', score: params.get('score') || 15000 });
  }

})(typeof window !== 'undefined' ? window : globalThis);
