'use strict';
// A real DOM for the real renderers.
//
// media.js cannot be required: it reads `document` at load, injects a dozen scripts, and depends on
// studio.js's globals (state, view, selected, wh, props, bind, render, save, toast). So the harness
// builds the page skeleton studio.html provides, loads the production files into it in the order the
// page does, and hands back the window.
//
// jsdom is the only devDependency in the repo root. Nothing here ships: the Electron packaging
// filter excludes package.json, package-lock.json, node_modules and tests.
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');

// media.js schemalagger timers och laddar script vid load. Utan att stanga fonstren lever de kvar
// och node --test avslutas aldrig, sa varje harness registreras och rivs av closeAll().
const living = [];
const closeAll = () => { while (living.length) living.pop().destroy() };

// The parts of studio.html the renderers and the patcher actually touch.
const SKELETON = `<!doctype html><html><body>
  <div id="title"></div>
  <div id="view"></div>
  <div class="toast"></div>
</body></html>`;

function createDom({ url = 'https://vyralive.app/studio.html', state = null } = {}) {
  // runScripts:'dangerously' with injected <script> elements, not window.eval: a classic script's
  // top-level `const` lands in the shared global lexical environment, and eval's does not. studio.js
  // declares `const state` there and media.js reads it, so eval would break the very chain under test.
  // pretendToBeVisual startar en rAF-loop som haller processen vid liv efter sista testet. Den
  // behovs inte har: patcharen anropas direkt, och batchningen bevisas i goal-client.test.js.
  const dom = new JSDOM(SKELETON, { url, pretendToBeVisual: false, runScripts: 'dangerously' });
  const { window } = dom;

  // Web Locks is not implemented by jsdom. The session owner falls back to read-only without it,
  // which is exactly what these tests want: no persistence, no marker, pure in-memory projection.
  window.navigator.locks = undefined;

  const load = file => {
    const script = window.document.createElement('script');
    script.textContent = fs.readFileSync(path.join(ROOT, file), 'utf8');
    window.document.body.append(script);
  };
  const run = source => {
    const script = window.document.createElement('script');
    script.textContent = source;
    window.document.body.append(script);
  };

  load('session-state.js');
  load('widget-factory.js');
  load('studio.js');
  if (state) run(`Object.keys(state).forEach(k=>delete state[k]);Object.assign(state, ${JSON.stringify(state)})`);
  load('media.js');

  // A canvas with exactly the widgets the test asked for, built by the REAL renderer chain.
  const paint = widgets => {
    const view = window.document.getElementById('view');
    view.innerHTML = `<div class="canvas-frame"><div class="canvas">${widgets.map(window.wh).join('')}</div></div>`;
    return view.querySelector('.canvas');
  };
  // A preview card, the way overlay-preview.js builds one — same markup, different container.
  const paintPreview = widget => {
    const host = window.document.createElement('div');
    host.innerHTML = `<div class="owg-thumb-inner">${window.wh(widget)}</div>`;
    window.document.body.append(host);
    return host;
  };

  const harness = { dom, window, document: window.document, load, paint, paintPreview,
    destroy: () => { try { window.close() } catch (_) {} } };
  living.push(harness);
  return harness;
}

const socialGoal = (id, over = {}) => ({ id, type: 'templateSocialGoal', goalKind: 'follows',
  goalCurrent: 0, goalTarget: 1000, x: 10, y: 20, ...over });
const heartGoal = (id, over = {}) => ({ id, type: 'templateHeartGoal', heartCurrent: 0,
  heartTarget: 50, x: 10, y: 20, ...over });

module.exports = { createDom, closeAll, socialGoal, heartGoal };
