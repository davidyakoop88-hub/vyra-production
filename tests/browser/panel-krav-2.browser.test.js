'use strict';
// Del 2 av 4 av panelkraven. Allt innehåll bor i panel-krav.browser.test.js; se kommentaren vid
// DELAD I FYRA där. Den här filen finns för att scripts/browser-skarva.js fördelar filer, inte prov.
// Riggen avgör skip synkront här också (tests/browser-rigg.test.js kräver det av varje fil); själva
// proven i huvudfilen läser sin egen skip på samma sätt.
const { hoppaOver } = require('../helpers/webblasare.js');
const skip = hoppaOver();
process.env.PANEL_KRAV_DEL = '2/4';

require('./panel-krav.browser.test.js');
