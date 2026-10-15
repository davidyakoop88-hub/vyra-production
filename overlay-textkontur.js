'use strict';
// TEXTKONTUR I OVERLAY-UTGÅNGEN.
//
// I overlay-läget är bakgrunden genomskinlig: streamarens kamera eller spel avgör vad texten
// hamnar mot. I studion ligger samma text mot det mörka temat och syns fint — därför märks felet
// bara i sändningen.
//
// UPPMÄTT 2026-10-15, hela katalogen (179 nycklar, 650 textelement) i ?overlay=1: 566 element
// klarade inte kontrastkvot 3 mot BÅDE vit och svart bakgrund utan tät kontur. Fjorton familjer
// hade text helt utan egen platta: battlemvp, giftcampaign, pgpodium, pggoal, socialgoal, lastx,
// gifterlevel, guardianemblem, fanlevel, topstreak, topgift, custom m.fl. Användarnamnet i Battle
// MVP Aurora (vitt, en ensam skugga 0 1px 4px) var nästan osynligt mot ljus bakgrund medan
// "MVP" ovanför — fyrsidig 1 px-kontur — syntes. EN MJUK SKUGGA RÄCKER ALLTSÅ INTE; en kontur gör.
//
// VARFÖR EN MÄTANDE FIL OCH INTE CSS PER FAMILJ. text-shadow går inte att lägga TILL i CSS, bara
// ersätta — en regel per familj hade släckt designernas glöd. Här läses den beräknade skuggan och
// konturen läggs FÖRE den, så glöden ligger kvar. Och en ny familj ärver skyddet utan att någon
// behöver minnas det.
//
// GRÄNSER, med flit:
//  - Bara html.overlay-output. Studions färger och skuggor rörs inte.
//  - Text som redan har tät kontur (stroke, eller minst två skuggor med blur <= 2px) lämnas.
//  - Text på widgetens egen täckande platta (bakgrundsfärg >= 0.6 eller bakgrundsbild) lämnas —
//    där är det designen, inte kameran, som är bakgrunden.
//  - Ren emoji/symboltext lämnas; en kontur runt en emoji ändrar teckningen.
//  - Gradientklippt text (background-clip:text) får drop-shadow i stället: text-shadow ritas
//    under den genomskinliga fyllningen och skulle grumla gradienten.
(function () {
  const RGBA = /rgba?\(([^)]+)\)/;
  const rgba = s => {
    const m = String(s || '').match(RGBA); if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) };
  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const over = (c, bg) => [0, 1, 2].map(i => c[i] * c[3] + bg[i] * (1 - c[3]));
  const kvot = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) };
  const VIT = [255, 255, 255], SVART = [0, 0, 0];
  const KRAV = 3; // WCAG-gränsen för stor/fet text och grafik — overlaytext är nästan alltid det

  // "rgb(0, 0, 0) 0px 1px 4px, ..." -> [{c, blur}]
  const skuggor = s => (!s || s === 'none') ? [] : String(s).split(/,(?![^(]*\))/).map(d => {
    const px = (d.replace(RGBA, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
    return { c: rgba(d), blur: px.length > 2 ? px[2] : 0 };
  }).filter(x => x.c && x.c[3] >= 0.45);

  // Tät kontur som syns mot bakgrunden bg: stroke, eller minst två täta skuggor.
  function harKontur(cs, bg) {
    const syns = c => kvot(over(c, bg), bg) >= KRAV;
    const sw = parseFloat(cs.webkitTextStrokeWidth) || 0;
    const st = rgba(cs.webkitTextStrokeColor);
    if (sw >= 0.5 && st && st[3] >= 0.45 && syns(st)) return true;
    const alla = skuggor(cs.textShadow);
    const tata = alla.filter(x => x.blur <= 2);
    const giltig = tata.length >= 2 || (tata.length === 1 && alla.length >= 2);
    return giltig && tata.some(x => syns(x.c));
  }

  function harPlatta(el, rot) {
    for (let n = el; n && n !== rot.parentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const bg = rgba(cs.backgroundColor);
      if (bg && bg[3] >= 0.6) return true;
      const klipp = cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text';
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !klipp) return true;
    }
    return false;
  }

  const EGEN_TEXT = /[\p{L}\p{N}]/u;
  function egenText(el) {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.trim();
  }

  // Bedömer ETT element. Returnerar null (lämnas) eller {farg, gradient} för konturen.
  function bedom(el, rot) {
    const txt = egenText(el);
    if (!txt || !EGEN_TEXT.test(txt)) return null;
    const cs = getComputedStyle(el);
    const klipp = cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text';
    let c = rgba(cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color);
    if (!c) return null;
    if (klipp || c[3] < 0.05) {
      // Gradienttext: färgen syns inte i color. Gradienterna i katalogen är ljusa på mörk
      // design, så den behandlas som ljus text.
      c = [255, 255, 255, 1];
    }
    const motVit = kvot(over(c, VIT), VIT) >= KRAV || harKontur(cs, VIT);
    const motSvart = kvot(over(c, SVART), SVART) >= KRAV || harKontur(cs, SVART);
    if (motVit && motSvart) return null;
    if (harPlatta(el, rot)) return null;
    // Ljus text får mörk kontur, mörk text ljus.
    const ljus = lum(c) > 0.18;
    return { farg: ljus ? 'rgba(8,8,14,.88)' : 'rgba(255,255,255,.9)', gradient: klipp,
             px: parseFloat(cs.fontSize) || 16, skugga: cs.textShadow, filter: cs.filter };
  }

  // Konturens tjocklek följer textstorleken: 1 px gjorde 7 px-text i Gift Campaign klumpig.
  const bredd = px => px < 12 ? 0.6 : px >= 28 ? 1.5 : 1;
  function kontur({ farg, px }) {
    const d = bredd(px);
    return `${farg} ${d}px 0 0, ${farg} -${d}px 0 0, ${farg} 0 ${d}px 0, ${farg} 0 -${d}px 0, ${farg} 0 0 ${d + 1}px`;
  }

  const KLAR = new WeakSet();
  function behandla(el, rot) {
    if (KLAR.has(el)) return false;
    // Ett element utan egen text märks inte: renderare fyller ofta namnet EFTER att noden skapats.
    if (!egenText(el)) return false;
    KLAR.add(el);
    const b = bedom(el, rot);
    if (!b) return false;
    if (b.gradient) {
      const d = bredd(b.px);
      const ds = `drop-shadow(${d}px 0 0 ${b.farg}) drop-shadow(-${d}px 0 0 ${b.farg}) drop-shadow(0 ${d}px 0 ${b.farg}) drop-shadow(0 -${d}px 0 ${b.farg})`;
      el.style.filter = b.filter && b.filter !== 'none' ? ds + ' ' + b.filter : ds;
    } else {
      const egen = b.skugga && b.skugga !== 'none';
      el.style.textShadow = egen ? kontur(b) + ', ' + b.skugga : kontur(b);
      if (getComputedStyle(el).textShadow === b.skugga) {
        // En stilmall vann med !important. Har designen en egen skugga läggs konturen FÖRE den,
        // också med important — glöden följer med, så inget av designen försvinner (topstreak).
        // Har designen uttryckligen släckt skuggan (`none !important`) vinner designen:
        // ranking-sixpack.css (#604) gör det på siffror som ligger på egna plattor.
        if (!egen) { el.style.removeProperty('text-shadow'); return false }
        el.style.setProperty('text-shadow', kontur(b) + ', ' + b.skugga, 'important');
      }
    }
    el.dataset.vyraKontur = '1';
    return true;
  }

  function skanna(scope) {
    let antal = 0;
    const rotter = (scope || document).querySelectorAll('[data-id]');
    rotter.forEach(rot => {
      if (behandla(rot, rot)) antal++;
      rot.querySelectorAll('*').forEach(el => { if (behandla(el, rot)) antal++ });
    });
    return antal;
  }

  // SYNKRONT, I OBSERVATÖRENS EGET ANROP. Första versionen väntade 120 ms och skannade sedan hela
  // sidan. Det gav en bildruta utan kontur varje gång en renderare ritade om sin nod — en
  // nedräkning blinkade varje sekund, och den visuella riggen (som väntar på två lika bilder i
  // rad, tak 12 s per nyckel) fick aldrig stillhet: referensjobbet slog i sitt 30-minuterstak
  // (körning 38747148233). MutationObserver-anropet körs som mikrouppgift FÖRE nästa målning, så
  // en ny nod har sin kontur redan i första bildrutan den syns i. Bara det som ändrats behandlas.
  // En tillagd nod: inne i en widget behandlas den och allt under den; utanför (en hel widget
  // eller duken som byggts om) skannas bara de widgetar den innehåller.
  function tillagd(n) {
    if (n.nodeType !== 1) return;
    const rot = n.closest('[data-id]');
    if (rot) {
      behandla(n, rot);
      n.querySelectorAll('*').forEach(x => behandla(x, rot));
    } else if (n.querySelector('[data-id]')) {
      skanna(n);
    }
  }
  function vidAndring(poster) {
    if (!aktiv()) return;
    for (const p of poster) {
      // Ny text i ett befintligt element kommer som en ersatt textnod: elementet själv bedöms.
      const t = p.target;
      if (t && t.nodeType === 1) { const rot = t.closest('[data-id]'); if (rot) behandla(t, rot) }
      p.addedNodes.forEach(tillagd);
    }
  }

  const aktiv = () => document.documentElement.classList.contains('overlay-output');

  window.VyraTextKontur = { kvot, harKontur, bedom, skanna, KRAV };

  if (!aktiv()) return;
  skanna();
  new MutationObserver(vidAndring).observe(document.body, { childList: true, subtree: true });
})();
