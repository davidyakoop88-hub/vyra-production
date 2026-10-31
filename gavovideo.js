// gavovideo.js — spelar TikToks EGNA gåvoanimationer med genomskinlig bakgrund.
//
// UPPMÄTT 2026-10-30 (gåva 5660, @jas_alexis, 28 gåvomeddelanden på fem minuter):
//   • Gåvomeddelandet bär `asset.videoResourceList[]` med typerna h264, 480p, 480p_bvc1, bytevc1opt,
//     h264_encrypt och trantor_crop_bvc1. Varje länk pekar på en ZIP på sf16-webcast.tiktokcdn.com.
//   • Zip-filen svarar 200 utan headers och med `access-control-allow-origin: *`, så en overlay i
//     OBS kan hämta den direkt. Ingen utgångstid i adressen.
//   • Innehåll: `output.mp4` (H.264, yuv420p, 30 fps, 3 s, 90 rutor) och `config.json`. Filerna är
//     deflate-komprimerade.
//   • Videon har INGEN alfakanal. Färgen ligger i ena halvan och genomskinligheten som gråskala i
//     den andra; config.json säger exakt var: {"portrait":{"videoW":1440,"videoH":1280,"w":720,
//     "h":1280,"rgbFrame":[0,0,720,1280],"aFrame":[720,0,720,1280],…}}.
//   • Bara 1 av 28 meddelanden bar `asset` — vilka gåvor som får det, och när, är ännu omätt.
//
// Därför: hämta zip → packa upp i webbläsaren → spela mp4:an dold → rita varje ruta i WebGL där
// färgen tas ur rgbFrame och alfan ur aFrame. Canvasen är genomskinlig, så det som inte är gåva syns
// inte i OBS. Utan WebGL faller den tillbaka på 2D-canvas (långsammare, samma resultat).
(function (root) {
  'use strict';

  // ---- ZIP: läser centralkatalogen, stöder lagrat (0) och deflate (8) -------------------------
  // En hel zip-bibliotek är onödigt för två filer. Centralkatalogen läses i stället för de lokala
  // huvudena, eftersom storleken kan stå noll i ett lokalt huvud (bit 3, data descriptor).
  async function lasZip(buffer, inflate) {
    const b = new Uint8Array(buffer), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Ingen giltig zip-fil');
    const antal = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true);
    const filer = {};
    const avkoda = new TextDecoder();
    for (let n = 0; n < antal; n++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Trasig zip-katalog');
      const metod = v.getUint16(p + 10, true);
      const packad = v.getUint32(p + 20, true);
      const namnLangd = v.getUint16(p + 28, true), extraLangd = v.getUint16(p + 30, true), kommentarLangd = v.getUint16(p + 32, true);
      const lokal = v.getUint32(p + 42, true);
      const namn = avkoda.decode(b.subarray(p + 46, p + 46 + namnLangd));
      const start = lokal + 30 + v.getUint16(lokal + 26, true) + v.getUint16(lokal + 28, true);
      const data = b.subarray(start, start + packad);
      if (metod === 0) filer[namn] = data;
      else if (metod === 8) filer[namn] = await inflate(data);
      else throw new Error(`Okänd komprimering ${metod} i ${namn}`);
      p += 46 + namnLangd + extraLangd + kommentarLangd;
    }
    return filer;
  }

  async function inflateWebblasare(data) {
    if (typeof DecompressionStream !== 'function') throw new Error('Webbläsaren saknar DecompressionStream');
    const strom = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(strom).arrayBuffer());
  }

  // ---- config.json → var färgen och alfan ligger ----------------------------------------------
  // TikTok har en "portrait"-nyckel; en "landscape" finns troligen för liggande gåvor (omätt). Den
  // första som har giltiga rutor används. Fel form ger ett tydligt fel i stället för en svart ruta.
  //
  // ÄLDRE FORMAT (uppmätt 2026-10-30: Love You 6671 och Mystery Firework 7529, filer från 2021–22):
  // config.json är bara {"portrait":{"path":"1_720.mp4","align":8}} — inga rutor, inga mått. Videon
  // är ändå 1440×1280 delad på mitten, men SPEGELVÄND: alfan till vänster, färgen till höger. Utan
  // mått returneras { gammalt: true }; rutorna fylls i av fyllGammal när videons storlek är känd.
  function lasKonfig(text) {
    const j = typeof text === 'string' ? JSON.parse(text) : text;
    const ruta = r => Array.isArray(r) && r.length === 4 && r.every(x => Number.isFinite(x) && x >= 0) && r[2] > 0 && r[3] > 0;
    const lagen = ['portrait', 'landscape', ...Object.keys(j || {})];
    for (const lage of lagen) {
      const k = j && j[lage];
      if (!k || !ruta(k.rgbFrame) || !ruta(k.aFrame) || !(k.videoW > 0) || !(k.videoH > 0)) continue;
      return { lage, videoB: k.videoW, videoH: k.videoH, b: k.w || k.rgbFrame[2], h: k.h || k.rgbFrame[3],
        farg: k.rgbFrame.slice(), alfa: k.aFrame.slice(), fil: k.path || 'output.mp4', ljud: !!k.has_audio };
    }
    for (const lage of lagen) {
      const k = j && j[lage];
      if (k && typeof k.path === 'string' && k.path && !k.rgbFrame && !k.aFrame) return { lage, gammalt: true, fil: k.path, ljud: false };
    }
    throw new Error('config.json saknar rgbFrame/aFrame');
  }

  // Äldre formatet: halva bredden var, alfa vänster och färg höger.
  function fyllGammal(konfig, videoB, videoH) {
    if (!(videoB > 0) || !(videoH > 0)) throw new Error('Videons storlek är okänd');
    const b = Math.floor(videoB / 2);
    return { ...konfig, videoB, videoH, b, h: videoH, alfa: [0, 0, b, videoH], farg: [b, 0, b, videoH] };
  }

  // ---- hämta och packa upp ---------------------------------------------------------------------
  // EN GÅVA HÄMTAS EN GÅNG PER SIDA. På en livlig sändning kommer samma gåva tiotals gånger i
  // minuten; utan minnet laddades zip-filen (0,5–3 MB) ner och packades upp varje gång. Minnet
  // håller den uppackade videon som Blob och ger varje uppspelning en egen objekt-URL, eftersom
  // spela().stoppa() återkallar sin. En misslyckad hämtning glöms så att nästa gåva försöker igen.
  const MINNE_MAX = 60;
  const minne = new Map();
  function hamtaFil(zipUrl) {
    let p = minne.get(zipUrl);
    if (!p) {
      p = (async () => {
        const svar = await fetch(zipUrl);
        if (!svar.ok) throw new Error(`Hämtningen svarade ${svar.status}`);
        const filer = await lasZip(await svar.arrayBuffer(), inflateWebblasare);
        const konfigFil = Object.keys(filer).find(n => /(^|\/)config\.json$/.test(n));
        if (!konfigFil) throw new Error('Zip-filen saknar config.json');
        const konfig = lasKonfig(new TextDecoder().decode(filer[konfigFil]));
        const videoFil = Object.keys(filer).find(n => n.endsWith(konfig.fil)) || Object.keys(filer).find(n => /\.mp4$/.test(n));
        if (!videoFil) throw new Error('Zip-filen saknar video');
        return { konfig, blob: new Blob([filer[videoFil]], { type: 'video/mp4' }) };
      })();
      p.catch(() => { if (minne.get(zipUrl) === p) minne.delete(zipUrl); });
      minne.set(zipUrl, p);
      if (minne.size > MINNE_MAX) minne.delete(minne.keys().next().value);
    }
    return p;
  }
  async function hamta(zipUrl) {
    const { konfig, blob } = await hamtaFil(zipUrl);
    return { konfig, videoUrl: URL.createObjectURL(blob) };
  }

  // ---- ritning ---------------------------------------------------------------------------------
  const VS = 'attribute vec2 p;varying vec2 t;void main(){t=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const FS = 'precision mediump float;varying vec2 t;uniform sampler2D v;uniform vec4 f;uniform vec4 a;' +
    'void main(){vec3 c=texture2D(v,f.xy+t*f.zw).rgb;float al=texture2D(v,a.xy+t*a.zw).r;gl_FragColor=vec4(c*al,al);}';

  function normera(r, k) { return [r[0] / k.videoB, r[1] / k.videoH, r[2] / k.videoB, r[3] / k.videoH]; }

  function webglRitare(canvas, konfig) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return null;
    const shader = (typ, kalla) => { const s = gl.createShader(typ); gl.shaderSource(s, kalla); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, val);
    gl.uniform4fv(gl.getUniformLocation(prog, 'f'), normera(konfig.farg, konfig));
    gl.uniform4fv(gl.getUniformLocation(prog, 'a'), normera(konfig.alfa, konfig));
    gl.clearColor(0, 0, 0, 0);
    return {
      typ: 'webgl',
      rita(video) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
  }

  function canvas2dRitare(canvas, konfig) {
    const ut = canvas.getContext('2d');
    const hj = document.createElement('canvas');
    hj.width = konfig.b; hj.height = konfig.h;
    const hc = hj.getContext('2d', { willReadFrequently: true });
    return {
      typ: '2d',
      rita(video) {
        const [fx, fy, fb, fh] = konfig.farg, [ax, ay, ab, ah] = konfig.alfa;
        hc.drawImage(video, ax, ay, ab, ah, 0, 0, konfig.b, konfig.h);
        const alfa = hc.getImageData(0, 0, konfig.b, konfig.h).data;
        hc.drawImage(video, fx, fy, fb, fh, 0, 0, konfig.b, konfig.h);
        const bild = hc.getImageData(0, 0, konfig.b, konfig.h);
        for (let i = 0; i < alfa.length; i += 4) bild.data[i + 3] = alfa[i];
        hc.putImageData(bild, 0, 0);
        ut.clearRect(0, 0, canvas.width, canvas.height);
        ut.drawImage(hj, 0, 0, canvas.width, canvas.height);
      }
    };
  }

  // Spelar en gåvovideo i `canvas`. Returnerar { typ, stoppa, video }. `loopa` = börja om när den
  // är slut; annars anropas `klar` en gång efter sista rutan.
  async function spela(canvas, zipUrl, { loopa = true, klar, tvinga2d = false } = {}) {
    let { konfig, videoUrl } = await hamta(zipUrl);
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.loop = loopa; video.src = videoUrl;
    if (konfig.gammalt) {
      if (video.readyState < 1) await new Promise((klart, fel) => { video.addEventListener('loadedmetadata', klart, { once: true }); video.addEventListener('error', () => fel(new Error('Videon gick inte att läsa')), { once: true }); });
      konfig = fyllGammal(konfig, video.videoWidth, video.videoHeight);
    }
    canvas.width = konfig.b; canvas.height = konfig.h;
    const ritare = (!tvinga2d && webglRitare(canvas, konfig)) || canvas2dRitare(canvas, konfig);
    let igang = true, raf = 0;
    const steg = () => {
      if (!igang) return;
      if (video.readyState >= 2) ritare.rita(video);
      raf = (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(steg) : requestAnimationFrame(steg));
    };
    video.addEventListener('ended', () => { if (!loopa && typeof klar === 'function') klar(); });
    await video.play();
    steg();
    return {
      typ: ritare.typ, konfig, video,
      stoppa() { igang = false; video.pause(); URL.revokeObjectURL(videoUrl); if (!video.requestVideoFrameCallback) cancelAnimationFrame(raf); }
    };
  }

  const api = { lasZip, lasKonfig, fyllGammal, hamta, spela, glomMinnet: () => minne.clear() };
  root.VyraGavovideo = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
