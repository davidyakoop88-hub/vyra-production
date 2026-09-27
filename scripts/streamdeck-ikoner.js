// Ritar om Stream Deck-pluginets ikoner (streamdeck-plugin/se.vyra.live.sdPlugin/sd-*.png och sdk-*.png)
// ur SVG i Chromium. Kör: VYRA_CHROMIUM=<sökväg> node scripts/streamdeck-ikoner.js
// Ritar Stream Deck-ikoner (PNG) ur SVG i Chromium: action-ikoner 20/40 px (vita streck, transparent)
// och knappbilder 72/144 px (mörk platta med VYRA-lila glöd och ikonen i mitten).
const {startaWebblasare}=require('../tests/helpers/webblasare.js');
const DIR=require('path').join(__dirname,'..','streamdeck-plugin','se.vyra.live.sdPlugin')+'/';
const S='fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const IK={
 action:`<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>`,
 ljud:`<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>`,
 tts:`<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8"/><path d="M8 12h5"/>`,
 spotify:`<circle cx="12" cy="12" r="9"/><path d="M7.5 9.5c3-1 6.5-.8 9 .7"/><path d="M8 12.7c2.5-.7 5.2-.5 7.3.7"/><path d="M8.6 15.6c2-.5 3.9-.3 5.5.5"/>`,
 latonsk:`<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>`,
 scen:`<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="m10 9 4 2-4 2z"/>`,
 timer:`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>`,
 widget:`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>`
};
(async()=>{const b=await startaWebblasare();const p=await b.newPage();
for(const [id,d] of Object.entries(IK)){
 for(const [namn,px] of [[`sd-${id}.png`,20],[`sd-${id}@2x.png`,40]]){
  await p.setViewportSize({width:px,height:px});
  await p.setContent(`<html><body style="margin:0;background:transparent"><svg width="${px}" height="${px}" viewBox="0 0 24 24" ${S} style="color:#fff">${d}</svg></body></html>`);
  await p.screenshot({path:DIR+namn,omitBackground:true});
 }
 for(const [namn,px] of [[`sdk-${id}.png`,72],[`sdk-${id}@2x.png`,144]]){
  await p.setViewportSize({width:px,height:px});
  await p.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${px}px;height:${px}px;border-radius:${px*.18}px;background:radial-gradient(circle at 50% 40%,#3a1a5c,#120a1c 70%);box-shadow:inset 0 0 0 ${px/48}px #b13cff66;display:grid;place-items:center"><svg width="${px*.5}" height="${px*.5}" viewBox="0 0 24 24" ${S} style="color:#e9d6ff;filter:drop-shadow(0 0 ${px/24}px #b13cff)">${d}</svg></div></body></html>`);
  await p.screenshot({path:DIR+namn,omitBackground:true});
 }
}
await b.close();console.log('klart',Object.keys(IK).length*4,'bilder')})();
