(function () {
  'use strict';

  // SPELLAYOUT (2026-10-15). Davids beställning: "gaming layout — varje design innehåller top like /
  // top coins / top poäng, top gifter och mål följare och gift campaign". Konsten kommer från
  // designleveransen VYRALIVE-Till-Claude-13-Stilar: statiska PNG-delar per tema, här som WebP i
  // assets/spellayout/<tema>/ (beskurna till innehållet och nerskalade till den storlek OBS ritar
  // dem i — Fortnite gick från 9,5 MB till 0,7 MB).
  //
  // INGA NYA DATAVÄGAR. Delarna med data är befintliga widgettyper som bär `spelTema`/`spelDel`
  // (widget-factory.js, familjen 'spellayout'), och skinnet här behåller exakt de noder som
  // livedatan redan skriver i:
  //   topplistan   .vyra-toplike + :scope>h3 + .toplike-row (strong/small/em/img)
  //                — live-leaderboard.js och rankingcykeln i media.js (likes → coins → poäng)
  //   Top Gifter   .vyra-topgift + .vyra-profile-face img/.vyra-gift-face img + .topgift-copy strong/em
  //                — gift-event-images.js SHAPES.templateTopGift
  //   följarmålet  [data-goal] + [data-goal-value]/[data-goal-target]/[data-goal-fill]
  //                — patchGoalDom i media.js
  //   kampanjen    .vyra-campaign + article .campaign-gift-image img
  //                — gift-event-images.js patchCampaignWidget
  //
  // ROTEN BYGGS HÄR, INTE UR KEDJAN. De fyra familjernas egna renderare sätter var sin hög klasser
  // med !important-regler (premium-topgift, rk6-*, goal-motion, vyra-campaign-aura) som annars
  // hade ritat om skinnet. Rotens stil räknas därför här med samma fält som media.js:s styledWh
  // läser — position, bredd, opacitet, lager och dold — så att en dold del aldrig syns i OBS.
  //
  // OBS: overlayn är EN genomskinlig källa ovanpå kamera och spel. Bakgrunden ritas därför med
  // genomskinliga hål precis där temats kamera- och spelram har sina öppningar, räknat ur ramarnas
  // FAKTISKA läge på duken — flyttar streamern en ram följer hålet med.

  // Geometrin i procent av den beskurna bilden. Hålen är uppmätta som inneslutna genomskinliga
  // ytor (alfa < 60) i varje WebP. TEXTFÄLTEN är uppmätta som mörka, täckande ytor i konsten —
  // Davids regel 2026-10-16: "texten ska inte vara utanför någon ram". All text ligger därför inuti
  // ett sådant fält, och storleken räknas i cqw (andel av konstens bredd), så den stannar kvar
  // inuti även när widgeten görs större eller mindre.
  const TEMAN = Object.freeze({
    fortnite: Object.freeze({
      label: 'Fortnite', ljus: '#8ff0ff', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild: [1080, 616], hal: [2.69, 5.41, 94.62, 89.19] },
      spelram: { bild: [1080, 608], hal: [2.69, 4.11, 94.62, 91.1] },
      bakgrund: { bild: [941, 1672] },
      lista: { bild: [520, 759], rad: 20.09, forsta: 4.47, foto: [19.62, 17.31, 12.37], namn: [44.5, 47, 14, 74], text: 'mork' },
      gifter: { bild: [480, 555], foto: [26.15, 30.56, 47.69, 40.53], rubrik: [14, 7, 72, 16], namn: [13, 79.5, 74, 7.8], varde: [13, 87.2, 74, 7.6], text: 'mork' },
      mal: { bild: [1100, 80], spar: [37.6, 31.8, 24.6, 32], text: 'mork' },
      kampanj4: { bild: [1100, 263], hal: [[3.46, 14.52, 17.69, 72.58], [28.46, 14.52, 18.08, 72.58], [53.46, 14.52, 18.08, 72.58], [78.85, 14.52, 17.69, 72.58]] },
      kampanj6: { bild: [1100, 174], hal: [[2.31, 14.63, 11.15, 70.73], [18.85, 14.63, 11.54, 70.73], [35.77, 14.63, 11.54, 70.73], [52.69, 14.63, 11.54, 70.73], [69.62, 14.63, 11.92, 70.73], [86.54, 14.63, 11.54, 70.73]] }
    }),
    // De tolv övriga temana ur samma leverans (2026-10-16). Hål, textfält och ljusfärg är uppmätta
    // ur respektive WebP på samma sätt som Fortnite; `text` säger om plattan under texten är mörk
    // eller ljus, och därmed om texten ritas ljus eller mörk.
    'call-of-duty': Object.freeze({
      label: 'Call of Duty', ljus: '#f5d490', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  608],  hal:  [3.0,  5.92,  94.33,  88.17] },
      spelram: { bild:  [1080,  608],  hal:  [2.67,  5.33,  94.33,  88.76] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 873], rad: 20.29, forsta: 3.37, foto: [19.67, 19.67, 12.7], namn: [46.87, 45.6, 21.5, 58.8], text: 'mork' },
      gifter: { bild:  [480,  637],  foto:  [23.67,  30.15,  52.67,  38.94],  namn:  [13.33,  76.8,  75.33,  8.94],  varde:  [13.33,  85.3,  75.33,  8.5],  rubrik:  [13.33,  6.95,  73.67,  16.0],  text:  'mork' },
      mal: { bild:  [1100,  76],  spar:  [57.67,  23.81,  30.33,  47.62],  text:  'mork' },
      kampanj4: { bild:  [1100,  264],  hal:  [[2.67,  11.11,  19.0,  77.78],  [27.67,  11.11,  19.33,  77.78],  [53.0,  11.11,  19.33,  77.78],  [78.0,  11.11,  19.33,  77.78]] },
      kampanj6: { bild:  [1100,  176],  hal:  [[2.0,  12.5,  12.67,  75.0],  [18.67,  12.5,  12.67,  75.0],  [35.33,  12.5,  12.67,  75.0],  [52.0,  12.5,  12.67,  75.0],  [68.67,  12.5,  12.67,  75.0],  [85.33,  12.5,  12.67,  75.0]] }
    }),
    'cyber-cherry': Object.freeze({
      label: 'Cyber Cherry', ljus: '#f6a1bd', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  595],  hal:  [2.67,  4.85,  94.67,  90.91] },
      spelram: { bild:  [1080,  600],  hal:  [2.0,  4.19,  96.0,  92.22] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 570], rad: 19.15, forsta: 6.99, foto: [9.33, 14.33, 13.37], namn: [33.2, 55.93, 33.2, 47.3], text: 'mork' },
      gifter: { bild:  [480,  500],  foto:  [18.0,  23.72,  64.0,  57.37],  namn:  [22.0,  85.52,  56.33,  4.1],  varde:  [22.0,  89.42,  56.33,  3.9],  text:  'ljus' },
      mal: { bild:  [1100,  102],  spar:  [33.0,  32.14,  44.0,  39.29],  text:  'mork' },
      kampanj4: { bild:  [1100,  255],  hal:  [[2.33,  11.43,  19.33,  77.14],  [27.67,  11.43,  19.33,  78.57],  [52.67,  11.43,  19.67,  78.57],  [78.0,  11.43,  19.33,  78.57]] },
      kampanj6: { bild:  [1100,  172],  hal:  [[1.67,  10.64,  12.33,  76.6],  [18.33,  10.64,  12.67,  76.6],  [35.33,  10.64,  12.33,  76.6],  [52.0,  10.64,  12.33,  76.6],  [69.0,  10.64,  12.33,  76.6],  [85.67,  10.64,  12.33,  76.6]] }
    }),
    'emerald-queen': Object.freeze({
      label: 'Emerald Queen', ljus: '#80dba6', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  604],  hal:  [2.67,  5.36,  94.67,  89.88] },
      spelram: { bild:  [1080,  614],  hal:  [2.67,  5.26,  95.0,  87.72] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 556], rad: 19.55, forsta: 6.23, foto: [11.33, 14.33, 13.08], namn: [34.2, 50.93, 21.5, 57.2], text: 'mork' },
      gifter: { bild:  [480,  568],  foto:  [14.33,  20.28,  71.33,  57.75],  namn:  [21.67,  85.69,  56.67,  3.94],  varde:  [21.67,  89.44,  56.67,  3.75],  text:  'mork' },
      mal: { bild:  [1100,  87],  spar:  [27.0,  29.17,  49.67,  41.67],  text:  'mork' },
      kampanj4: { bild:  [1100,  310],  hal:  [[3.0,  21.18,  20.33,  68.24],  [27.33,  21.18,  20.67,  68.24],  [52.0,  21.18,  20.33,  68.24],  [76.67,  21.18,  20.33,  68.24]] },
      kampanj6: { bild:  [1100,  195],  hal:  [[2.33,  16.98,  12.67,  73.58],  [18.67,  16.98,  13.0,  73.58],  [35.33,  16.98,  12.67,  73.58],  [52.0,  16.98,  12.67,  73.58],  [68.67,  16.98,  12.67,  73.58],  [85.0,  16.98,  13.0,  73.58]] }
    }),
    'gta-v': Object.freeze({
      label: 'GTA V', ljus: '#84d6a0', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  608],  hal:  [2.33,  4.73,  95.33,  89.35] },
      spelram: { bild:  [1080,  608],  hal:  [2.33,  4.14,  95.33,  91.12] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 717], rad: 19.99, forsta: 3.14, foto: [16.0, 19.0, 13.29], namn: [41.53, 50.6, 22.5, 64.0], text: 'mork' },
      gifter: { bild:  [480,  525],  foto:  [24.33,  28.35,  51.0,  46.04],  namn:  [14.67,  78.6,  70.67,  7.93],  varde:  [14.67,  86.13,  70.67,  7.53],  rubrik:  [14.0,  5.38,  72.0,  10.88],  text:  'mork' },
      mal: { bild:  [1100,  93],  spar:  [33.0,  20.0,  33.67,  52.0],  text:  'mork' },
      kampanj4: { bild:  [1100,  259],  hal:  [[2.33,  9.86,  20.0,  77.46],  [27.33,  9.86,  20.0,  77.46],  [52.67,  9.86,  19.67,  77.46],  [77.67,  9.86,  20.0,  77.46]] },
      kampanj6: { bild:  [1100,  189],  hal:  [[2.33,  19.23,  12.33,  69.23],  [19.0,  19.23,  12.33,  69.23],  [35.33,  19.23,  12.67,  69.23],  [52.0,  19.23,  12.67,  69.23],  [68.67,  19.23,  12.67,  69.23],  [85.67,  19.23,  12.33,  69.23]] }
    }),
    'ice-pearl': Object.freeze({
      label: 'Ice Pearl', ljus: '#96e2f6', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  609],  hal:  [4.33,  8.88,  91.33,  85.8] },
      spelram: { bild:  [1080,  607],  hal:  [4.67,  8.88,  90.67,  81.07] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 778], rad: 19.43, forsta: 5.79, foto: [15.67, 19.0, 12.03], namn: [40.53, 50.93, 21.0, 63.7], text: 'ljus' },
      gifter: { bild:  [480,  508],  foto:  [25.33,  21.07,  49.67,  44.97],  namn:  [16.0,  69.41,  67.67,  7.04],  varde:  [16.0,  76.1,  67.67,  6.69],  text:  'ljus' },
      mal: { bild:  [1100,  239],  spar:  [23.0,  53.85,  49.0,  15.38],  text:  'mork' },
      kampanj4: { bild:  [1100,  260],  hal:  [[3.0,  11.27,  19.33,  80.28],  [28.0,  11.27,  19.33,  80.28],  [52.67,  11.27,  19.67,  80.28],  [77.67,  11.27,  19.67,  80.28]] },
      kampanj6: { bild:  [1100,  190],  hal:  [[2.0,  13.46,  12.67,  71.15],  [18.67,  13.46,  12.67,  71.15],  [35.33,  13.46,  12.67,  71.15],  [52.0,  13.46,  12.67,  71.15],  [68.67,  13.46,  12.67,  71.15],  [85.33,  13.46,  12.67,  71.15]] }
    }),
    'minecraft': Object.freeze({
      label: 'Minecraft', ljus: '#80efe0', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  612],  hal:  [7.33,  10.59,  85.33,  78.24] },
      spelram: { bild:  [1080,  608],  hal:  [6.33,  8.88,  87.67,  80.47] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 871], rad: 19.57, forsta: 4.78, foto: [17.33, 20.67, 12.15], namn: [46.2, 45.6, 19.9, 66.9], text: 'mork' },
      gifter: { bild:  [480,  614],  foto:  [30.67,  30.99,  37.33,  27.86],  namn:  [15.33,  66.0,  68.33,  9.06],  varde:  [15.33,  74.61,  68.33,  8.61],  rubrik:  [18.33,  10.01,  62.67,  15.13],  text:  'mork' },
      mal: { bild:  [1100,  239],  spar:  [16.33,  50.77,  52.0,  15.38],  text:  'mork' },
      kampanj4: { bild:  [1100,  265],  hal:  [[4.67,  18.06,  16.0,  65.28],  [29.67,  18.06,  16.0,  65.28],  [54.67,  18.06,  16.0,  65.28],  [79.67,  18.06,  16.33,  65.28]] },
      kampanj6: { bild:  [1100,  169],  hal:  [[2.67,  17.39,  10.67,  63.04],  [19.67,  17.39,  10.33,  63.04],  [36.33,  17.39,  10.67,  63.04],  [53.0,  17.39,  10.67,  63.04],  [70.0,  17.39,  10.33,  63.04],  [86.67,  17.39,  10.67,  63.04]] }
    }),
    'moonlight-silver': Object.freeze({
      label: 'Moonlight Silver', ljus: '#e0d1c5', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  603],  hal:  [3.0,  6.55,  94.0,  87.5] },
      spelram: { bild:  [1080,  604],  hal:  [2.33,  5.36,  95.33,  89.88] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 580], rad: 19.26, forsta: 7.16, foto: [9.33, 15.67, 14.33], namn: [31.2, 57.6, 18.6, 65.0], text: 'ljus' },
      gifter: { bild:  [480,  520],  foto:  [19.0,  18.15,  62.33,  55.08],  namn:  [21.0,  76.7,  58.0,  8.49],  varde:  [21.0,  84.77,  58.0,  8.07],  text:  'ljus' },
      mal: { bild:  [1100,  161],  spar:  [29.33,  54.55,  47.67,  15.91],  text:  'mork' },
      kampanj4: { bild:  [1100,  275],  hal:  [[2.0,  12.0,  20.67,  80.0],  [27.0,  12.0,  21.0,  80.0],  [52.33,  12.0,  20.67,  80.0],  [77.33,  12.0,  20.67,  80.0]] },
      kampanj6: { bild:  [1100,  177],  hal:  [[2.0,  16.67,  11.67,  68.75],  [19.0,  16.67,  11.67,  68.75],  [35.67,  16.67,  12.0,  70.83],  [52.67,  14.58,  11.67,  70.83],  [69.33,  14.58,  12.0,  70.83],  [86.33,  16.67,  11.67,  68.75]] }
    }),
    'peach-bloom': Object.freeze({
      label: 'Peach Bloom', ljus: '#f7d2a4', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  601],  hal:  [4.0,  7.19,  92.0,  86.23] },
      spelram: { bild:  [1080,  603],  hal:  [5.0,  9.52,  90.0,  83.93] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 758], rad: 19.34, forsta: 3.89, foto: [13.67, 17.67, 11.9], namn: [39.53, 46.6, 26.1, 55.4], text: 'ljus' },
      gifter: { bild:  [480,  505],  foto:  [23.67,  23.1,  52.67,  47.78],  namn:  [21.33,  76.1,  57.67,  3.67],  varde:  [21.33,  79.59,  57.67,  3.49],  text:  'ljus' },
      mal: { bild:  [1100,  268],  spar:  [25.67,  45.21,  46.33,  15.07],  text:  'mork' },
      kampanj4: { bild:  [1100,  273],  hal:  [[2.67,  10.81,  20.33,  79.73],  [27.33,  10.81,  20.67,  79.73],  [52.33,  10.81,  20.33,  79.73],  [77.33,  10.81,  20.33,  79.73]] },
      kampanj6: { bild:  [1100,  192],  hal:  [[1.33,  11.54,  13.33,  73.08],  [18.0,  11.54,  13.33,  73.08],  [35.0,  11.54,  13.0,  73.08],  [51.67,  11.54,  13.33,  73.08],  [68.33,  11.54,  13.33,  73.08],  [85.33,  11.54,  13.0,  73.08]] }
    }),
    'rose-gold': Object.freeze({
      label: 'Rose Gold', ljus: '#fdc6a4', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  601],  hal:  [5.67,  4.19,  88.67,  88.62] },
      spelram: { bild:  [1080,  604],  hal:  [6.33,  6.55,  87.33,  85.12] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 717], rad: 19.87, forsta: 4.35, foto: [13.33, 17.0, 12.32], namn: [36, 52, 22, 56], text: 'ljus' },
      gifter: { bild:  [480,  495],  foto:  [24.0,  23.62,  52.0,  48.22],  namn:  [26.33,  76.45,  47.33,  3.5],  varde:  [26.33,  79.77,  47.33,  3.32],  text:  'ljus' },
      mal: { bild:  [1100,  229],  spar:  [23.0,  61.29,  46.67,  16.13],  text:  'mork' },
      kampanj4: { bild:  [1100,  272],  hal:  [[2.67,  12.16,  19.67,  77.03],  [27.67,  12.16,  19.67,  77.03],  [53.0,  12.16,  19.33,  77.03],  [78.0,  12.16,  19.67,  77.03]] },
      kampanj6: { bild:  [1100,  177],  hal:  [[1.67,  10.42,  13.67,  79.17],  [18.0,  10.42,  14.0,  79.17],  [34.67,  10.42,  13.67,  79.17],  [51.33,  10.42,  13.67,  79.17],  [68.0,  10.42,  13.67,  79.17],  [84.33,  10.42,  14.0,  79.17]] }
    }),
    'ruby-eclipse': Object.freeze({
      label: 'Ruby Eclipse', ljus: '#f47d66', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  607],  hal:  [3.67,  7.1,  92.67,  86.98] },
      spelram: { bild:  [1080,  610],  hal:  [3.0,  5.92,  94.0,  86.39] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 554], rad: 19.45, forsta: 5.32, foto: [12.33, 14.67, 13.44], namn: [37.5, 45.6, 26, 52], text: 'mork' },
      gifter: { bild:  [480,  562],  foto:  [15.67,  17.38,  68.33,  54.7],  namn:  [23.0,  75.88,  53.67,  6.04],  varde:  [23.0,  81.62,  53.67,  5.74],  text:  'mork' },
      mal: { bild:  [1100,  109],  spar:  [29.67,  23.33,  48.67,  53.33],  text:  'mork' },
      kampanj4: { bild:  [1100,  292],  hal:  [[2.33,  13.75,  19.67,  72.5],  [27.33,  13.75,  20.0,  71.25],  [52.67,  13.75,  20.0,  71.25],  [78.0,  13.75,  19.67,  72.5]] },
      kampanj6: { bild:  [1100,  200],  hal:  [[1.67,  20.0,  12.67,  65.45],  [18.67,  20.0,  12.67,  65.45],  [35.33,  20.0,  12.67,  65.45],  [52.0,  20.0,  12.67,  65.45],  [69.0,  20.0,  12.67,  65.45],  [85.67,  20.0,  12.67,  65.45]] }
    }),
    'sakura': Object.freeze({
      label: 'Sakura', ljus: '#fbaeb7', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  584],  hal:  [3.0,  4.32,  94.0,  91.36] },
      spelram: { bild:  [1080,  605],  hal:  [6.0,  9.52,  88.0,  82.14] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 841], rad: 17.06, forsta: 8.45, foto: [14.33, 19.0, 11.75], namn: [39.87, 45.6, 24.3, 53.4], text: 'ljus' },
      gifter: { bild:  [480,  447],  foto:  [28.0,  25.81,  44.0,  45.88],  namn:  [25.33,  76.29,  48.0,  8.17],  varde:  [25.33,  84.06,  48.0,  7.76],  text:  'ljus' },
      mal: { bild:  [1100,  187],  spar:  [35.0,  50.98,  41.67,  21.57],  text:  'mork' },
      kampanj4: { bild:  [1100,  265],  hal:  [[1.67,  9.72,  20.67,  81.94],  [27.0,  9.72,  20.33,  81.94],  [52.0,  9.72,  20.67,  81.94],  [77.33,  9.72,  20.67,  81.94]] },
      kampanj6: { bild:  [1100,  187],  hal:  [[1.67,  11.76,  13.67,  76.47],  [18.33,  11.76,  13.67,  76.47],  [35.0,  11.76,  13.67,  76.47],  [51.67,  11.76,  13.67,  76.47],  [68.67,  11.76,  13.33,  76.47],  [85.0,  11.76,  13.67,  76.47]] }
    }),
    'solar-butterfly': Object.freeze({
      label: 'Solar Butterfly', ljus: '#edd8ad', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild:  [1080,  614],  hal:  [1.67,  4.68,  96.67,  90.06] },
      spelram: { bild:  [1080,  594],  hal:  [2.67,  5.45,  94.67,  89.7] },
      bakgrund: { bild:  [941,  1672] },
      lista: { bild: [520, 683], rad: 20.24, forsta: 1.78, foto: [7.0, 18.33, 14.21], namn: [39.87, 41.27, 45.6, 37.1], text: 'mork' },
      gifter: { bild:  [480,  535],  foto:  [16.0,  18.26,  68.0,  58.38],  namn:  [21.33,  81.08,  57.33,  4.79],  varde:  [21.33,  85.63,  57.33,  4.55],  text:  'mork' },
      mal: { bild:  [1100,  127],  spar:  [31.33,  40.0,  45.33,  28.57],  text:  'mork' },
      kampanj4: { bild:  [1100,  271],  hal:  [[4.0,  14.86,  17.67,  68.92],  [29.0,  14.86,  17.67,  68.92],  [54.0,  14.86,  17.67,  68.92],  [79.0,  14.86,  17.67,  68.92]] },
      kampanj6: { bild:  [1100,  199],  hal:  [[2.67,  22.22,  12.0,  64.81],  [19.33,  22.22,  12.0,  64.81],  [36.0,  22.22,  12.0,  64.81],  [52.67,  22.22,  12.0,  64.81],  [69.33,  22.22,  12.0,  64.81],  [86.0,  22.22,  12.0,  64.81]] }
    })
  });
  const DELAR = ['bakgrund', 'kameraram', 'spelram', 'lista', 'gifter', 'mal', 'kampanj4', 'kampanj6'];
  // Hela layouten: bakgrund och ramar först, sedan allt med data. Kampanjen med sex gåvor är
  // standard; fyra väljs i kampanjens egen panel (Antal gåvor), och skinnet byter då till fyrkonsten.
  const HELA = ['bakgrund', 'kameraram', 'spelram', 'lista', 'gifter', 'mal', 'kampanj6'];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tal = (v, f) => Number.isFinite(+v) ? +v : f;
  const iOverlay = () => typeof VYRA_OVERLAY !== 'undefined' ? !!VYRA_OVERLAY : new URLSearchParams(location.search).has('overlay');
  const arVald = w => typeof selected !== 'undefined' && selected === w.id;
  const temaFor = w => w && w.spelTema && Object.hasOwn(TEMAN, w.spelTema) ? TEMAN[w.spelTema] : null;
  const mapp = id => 'assets/spellayout/' + id + '/';
  const pct = a => `left:${a[0]}%;top:${a[1]}%;width:${a[2]}%;height:${a[3]}%`;
  // TEXTSTORLEKEN RÄKNAS UR FÄLTETS HÖJD, inte ur konstens bredd. En bred lista (Emerald Queen) har
  // lägre rader än en smal (Fortnite) vid samma bredd; en storlek i bredd fyllde Fortnites plattor och
  // klippte de breda. hojdProcent är fältets höjd i % av bildens höjd; svaret är cqw.
  const cqw = (bild, hojdProcent, andel) => +(hojdProcent / 100 * bild[1] / bild[0] * 100 * andel).toFixed(3);
  const sakerUrl = (u, f) => (typeof VyraSafe !== 'undefined' && VyraSafe.url) ? VyraSafe.url(u, f) : (u || f);

  function delFor(w) {
    if (!temaFor(w)) return null;
    if (w.type === 'templateSpelram') return ['bakgrund', 'kameraram', 'spelram'].includes(w.spelDel) ? w.spelDel : null;
    if (['templateTopLike', 'templateTopCoins', 'templateTopPoints'].includes(w.type)) return 'lista';
    if (w.type === 'templateTopGift') return 'gifter';
    if (w.type === 'templateSocialGoal') return 'mal';
    if (w.type === 'templateGiftCampaign') return 'kampanj';
    return null;
  }

  // Samma fält som media.js:s styledWh skriver på varje annan widget.
  function rot(w, klasser, extraStil, attr) {
    const bredd = Math.max(40, tal(w.width, 300));
    const zoom = Math.min(4, Math.max(0.2, tal(w.widgetScale, 1)));
    const stil = `left:${tal(w.x, 0)}px;top:${tal(w.y, 0)}px;width:${bredd}px;opacity:${tal(w.opacity, 100) / 100};`
      + `z-index:${tal(w.layer, 1)};zoom:${zoom};${w.hidden ? 'display:none;' : ''}${extraStil || ''}`;
    return `<div class="widget spel ${klasser}${arVald(w) ? ' selected' : ''}" data-id="${esc(w.id)}" data-spel="${esc(w.spelTema)}"${attr || ''} style="${stil}">`;
  }
  const handtag = w => arVald(w) ? '<span class="resize-handle">↘</span>' : '';
  // Ljuset GÅR RUNT RAMARNA (David 2026-10-15: "ljuset ska gå runtom ramarna"). Det maskas med
  // delens kantmask, <del>-kant.webp: konstens kontur — yttre kant och öppningarnas kanter — som ett
  // smalt band, genererat ur bildens alfa. Ljuspunkterna färdas alltså bara längs kanterna, i vilket
  // tema som helst, utan en handritad bana per tema.
  const ljus = src => `<i class="spel-ljus" aria-hidden="true" style="--spel-mask:url('${src.replace(/\.webp$/, '-kant.webp')}')"></i>`;
  const konst = (src, bild) => `<div class="spel-konst" style="aspect-ratio:${bild[0]}/${bild[1]}"><img class="spel-glod" src="${src}" alt="" aria-hidden="true" draggable="false"><img class="spel-bild" src="${src}" alt="" draggable="false">${ljus(src)}`;

  // ---- ramar och bakgrund -----------------------------------------------------------------------
  function ram(w, t) {
    const src = mapp(w.spelTema) + w.spelDel + '.webp';
    return rot(w, `spel-${w.spelDel}`, `--spel-ljusfarg:${t.ljus}`) + konst(src, t[w.spelDel].bild) + '</div>' + handtag(w) + '</div>';
  }

  // Ramens öppning i dukens koordinater, ur ramwidgetens faktiska läge och storlek.
  function oppning(r, t) {
    const g = t[r.spelDel], z = Math.min(4, Math.max(0.2, tal(r.widgetScale, 1)));
    const b = tal(r.width, 432) * z, h = b * g.bild[1] / g.bild[0];
    return [tal(r.x, 0) + b * g.hal[0] / 100, tal(r.y, 0) + h * g.hal[1] / 100, b * g.hal[2] / 100, h * g.hal[3] / 100];
  }

  function bakgrund(w, t) {
    const src = mapp(w.spelTema) + 'bakgrund.webp';
    const z = Math.min(4, Math.max(0.2, tal(w.widgetScale, 1)));
    const b = tal(w.width, 432), h = b * t.bakgrund.bild[1] / t.bakgrund.bild[0];
    const bx = tal(w.x, 0), by = tal(w.y, 0);
    const lista = typeof state !== 'undefined' && state && Array.isArray(state.widgets) ? state.widgets : [];
    // Bara synliga ramar i SAMMA tema skär hål: en dold kameraram ska inte lämna ett tomt fönster.
    const hal = lista.filter(r => r && r.type === 'templateSpelram' && r.spelTema === w.spelTema && !r.hidden
      && (r.spelDel === 'kameraram' || r.spelDel === 'spelram')).map(r => oppning(r, t))
      .map(([x, y, bb, hh]) => [(x - bx) / z, (y - by) / z, bb / z, hh / z]);
    const id = 'spel-hal-' + String(w.id).replace(/[^a-zA-Z0-9_-]/g, '');
    // evenodd: hela ytan minus varje hål. Hålen ritas i bakgrundens egna enheter (viewBox = b × h).
    const vag = `M0 0H${b}V${h}H0Z` + hal.map(([x, y, bb, hh]) => `M${x.toFixed(1)} ${y.toFixed(1)}h${bb.toFixed(1)}v${hh.toFixed(1)}h${(-bb).toFixed(1)}Z`).join('');
    return rot(w, 'spel-bakgrund')
      + `<svg class="spel-bakgrund-svg" viewBox="0 0 ${b.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="none" aria-hidden="true">`
      + `<defs><clipPath id="${id}"><path clip-rule="evenodd" d="${vag}"/></clipPath></defs>`
      + `<image href="${src}" x="0" y="0" width="${b.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/></svg>`
      + handtag(w) + '</div>';
  }

  // ---- topplistan ---------------------------------------------------------------------------------
  const IKON = { templateTopLike: '♥', templateTopCoins: '●', templateTopPoints: '◆' };
  const RUBRIK = { templateTopLike: 'TOP LIKES', templateTopCoins: 'TOP COINS', templateTopPoints: 'TOP POINTS' };
  function lista(w, t) {
    const g = t.lista, src = mapp(w.spelTema) + 'likes-lista.webp';
    const demo = typeof topLikePeople !== 'undefined' && Array.isArray(topLikePeople) ? topLikePeople : [];
    // Overlay ritar nolläget direkt: publiken ska aldrig se påhittade personer (live-zero-state.js).
    const nolla = iOverlay();
    const foto = esc(sakerUrl(w.profileImage, 'assets/images/test-profile.svg'));
    // ANTAL PLATSER, 1–10 (Davids beslut 2026-10-16), ur samma reglage som de andra listorna
    // (likeCount, "Antal profiler"). Konsten har fem numrerade platser, så listan byggs av block:
    //   block 1 — plats 1–5, konsten som den är
    //   block 2 — plats 6–10 UNDER block 1 ("de ska vara under varandra"), samma konst men med
    //             rangbrickorna och kronorna maskade och egna brickor 6–10
    // Varje block klipps strax under sin sista plats, så färre än fem ger inga tomma platser.
    // Livedatan fyller raderna i DOM-ordning, så rad 6–10 får plats 6–10 utan något eget.
    const n = Math.max(1, Math.min(10, Math.round(tal(w.likeCount, 5))));
    const bild = `<img class="spel-glod" src="${src}" alt="" aria-hidden="true" draggable="false"><img class="spel-bild" src="${src}" alt="" draggable="false">${ljus(src)}`;
    // TUNNA PLATTOR: ger två rader (namn över värde) under 5 px text vid listans bredd, läggs namn och
    // värde på EN rad — namnet till vänster, värdet till höger — och texten blir dubbelt så stor.
    // Uppmätt 2026-10-16: Solar Butterflys plattor gav 3,7 px på två rader.
    const falthojd = g.namn[3] / 100 * g.foto[2];
    const enRad = cqw(g.bild, falthojd, 1 / 2.35) * tal(w.width, 136) / 100 < 5;
    const fs = enRad ? cqw(g.bild, falthojd, .6) : cqw(g.bild, falthojd, 1 / 2.35);
    const block = (forsta, antal) => {
      const klipp = antal < 5 ? Math.min(100, g.forsta + (antal - 1) * g.rad + g.foto[2] + 3.5) : 100;
      let rader = '';
      for (let j = 0; j < antal; j++) {
        const i = forsta + j, p = demo[i] || ['', ''];
        rader += `<div class="toplike-row rank-${i + 1}" style="--spel-rad-top:${g.forsta + j * g.rad}%;--spel-rad-h:${g.foto[2]}%">`
          + (forsta ? `<b class="spel-rang">${i + 1}</b>` : '')
          + `<i class="spel-foto" style="--spel-x:${g.foto[0]}%;--spel-b:${g.foto[1]}%"><img src="${foto}" alt=""></i>`
          + `<span class="spel-rad-text" style="--spel-x:${g.namn[0]}%;--spel-b:${g.namn[1]}%;--spel-y:${g.namn[2]}%;--spel-h:${g.namn[3]}%;--spel-fs:${fs}cqw"><strong>${nolla ? '' : esc(p[0])}</strong><small></small>`
          + `<em>${IKON[w.type]} ${nolla ? '0' : esc(p[1] || '0')}</em></span></div>`;
      }
      // Ytterlådan har den klippta höjden, den inre hela konstens — så att radernas procent, ljusets
      // mask och glöden räknas mot samma bild som förut.
      return `<div class="spel-konst${klipp < 100 ? ' spel-klippt' : ''}${forsta ? ' spel-fortsattning' : ''}" style="aspect-ratio:${g.bild[0]}/${(g.bild[1] * klipp / 100).toFixed(2)}">`
        + `<div class="spel-konst-inre" style="height:${(10000 / klipp).toFixed(3)}%">` + bild + rader + '</div></div>';
    };
    return rot(w, `vyra-toplike spel-lista${enRad ? ' spel-en-rad' : ''}`, `--spel-ljusfarg:${t.ljus};--spel-accent:${t.accent}`, ` data-spel-text="${g.text || 'mork'}"`)
      + `<h3>${esc(w.templateTitle || RUBRIK[w.type])}</h3>`
      + block(0, Math.min(5, n)) + (n > 5 ? block(5, n - 5) : '') + handtag(w) + '</div>';
  }

  // ---- Top Gifter ---------------------------------------------------------------------------------
  function gifter(w, t) {
    const g = t.gifter, src = mapp(w.spelTema) + 'top-gifter.webp';
    const nolla = iOverlay() && !w.dataName;
    const namn = nolla ? '' : esc(w.dataName || '@StreamQueen');
    const varde = esc(w.dataValue == null ? '44 999' : w.dataValue);
    return rot(w, 'vyra-topgift spel-gifter', `--spel-ljusfarg:${t.ljus};--spel-accent:${t.accent}`, ` data-spel-text="${g.text || 'mork'}"`)
      + konst(src, g.bild)
      // Rubriken bara där konsten har ett fält för den — åtta av temana har ingen övre platta, och
      // text utanför en ram är inte tillåten.
      + (g.rubrik ? `<div class="spel-gifter-rubrik" style="${pct(g.rubrik)};font-size:${Math.min(7.4, cqw(g.bild, g.rubrik[3], .55))}cqw">${esc(w.templateTitle || 'TOP GIFTER')}</div>` : '')
      + `<div class="spel-flip" style="${pct(g.foto)}">`
      + `<div class="vyra-profile-face"><img src="${esc(sakerUrl(w.profileImage, 'assets/images/test-profile.svg'))}" alt=""></div>`
      + `<div class="vyra-gift-face"><img src="${esc(sakerUrl(w.giftImage, 'assets/gifts/events/0001_Rose.png'))}" alt=""></div></div>`
      + kopia(g, w, namn, varde)
      + '</div>' + handtag(w) + '</div>';
  }

  // Namn och coins i den nedre plattan: två rader där plattan rymmer dem, annars en rad (namnet till
  // vänster, coins till höger).
  function kopia(g, w, namn, varde) {
    const dold = w.showDataValue === false ? 'display:none;' : '';
    const W = tal(w.width, 110);
    // 6,5 px och 0,72 av radens höjd: Linux-typsnitten i CI är något högre än Windows, och Ruby
    // Eclipse (6,0 px på två rader) klipptes där men inte lokalt (uppmätt 2026-10-16).
    if (cqw(g.bild, g.namn[3], .78) * W / 100 >= 6.5) {
      return `<div class="topgift-copy"><strong style="${pct(g.namn)};font-size:${cqw(g.bild, g.namn[3], .72)}cqw">${namn}</strong>`
        + `<em style="${pct(g.varde)};font-size:${cqw(g.bild, g.varde[3], .74)}cqw;${dold}">◉ ${varde}</em></div>`;
    }
    const ruta = [g.namn[0], g.namn[1], g.namn[2], g.varde[1] + g.varde[3] - g.namn[1]];
    return `<div class="topgift-copy spel-en-rad" style="${pct(ruta)};font-size:${cqw(g.bild, ruta[3], .62)}cqw">`
      + `<strong>${namn}</strong><em style="${dold}">◉ ${varde}</em></div>`;
  }

  // ---- följarmålet --------------------------------------------------------------------------------
  function mal(w, t) {
    const g = t.mal, src = mapp(w.spelTema) + 'malwidget.webp';
    const live = window.VyraGoals && window.VyraGoals.read ? window.VyraGoals.read(w.id) : null;
    const nu = live ? live.value : Math.max(0, tal(w.goalCurrent, 0));
    const mal = live ? live.target : Math.max(1, tal(w.goalTarget, 1000));
    const p = Math.min(100, Math.round(nu / mal * 100));
    const fmt = n => Number(n || 0).toLocaleString('sv-SE');
    return rot(w, 'spel-mal', `--spel-ljusfarg:${t.ljus};--spel-accent:${t.accent};--goal-fill:${p}%`, ` data-goal="social" data-spel-text="${g.text || 'mork'}"`)
      + konst(src, g.bild)
      + `<div class="spel-mal-spar" style="${pct(g.spar)}"><i data-goal-fill style="width:${p}%"></i>`
      + `<span class="spel-mal-text" style="font-size:${cqw(g.bild, g.spar[3], .64)}cqw"><span class="spel-mal-rubrik">${esc(w.goalTitle || 'FÖLJARE')}</span>`
      + `<span class="spel-mal-varde"><b data-goal-value>${fmt(nu)}</b>/<b data-goal-target>${fmt(mal)}</b></span></span></div>`
      + '</div>' + handtag(w) + '</div>';
  }

  // ---- Gift Campaign ------------------------------------------------------------------------------
  // Davids korrigering (BORJA-HAR.md): 4 eller 6 valda gåvobilder när streamern pushar ett event.
  // Inga räknare, poängkrav eller timers — de dolda <span><b> finns bara för att patchCampaignWidget
  // ska hitta sina noder utan att något visas.
  function kampanj(w, t) {
    const sex = tal(w.giftCount, 4) > 4;
    const g = sex ? t.kampanj6 : t.kampanj4, src = mapp(w.spelTema) + (sex ? 'gift-campaign-6.webp' : 'gift-campaign-4.webp');
    const varor = typeof window.VyraCampaignItems === 'function' ? window.VyraCampaignItems(w) : [];
    const platser = g.hal.map((h, i) => {
      const v = varor[i];
      // En tom plats visas tom — den ska aldrig se ut som en extra gåva.
      const bild = v && v.image ? `<img src="${esc(sakerUrl(v.image, ''))}" alt="${esc(v.name)}">` : '';
      return `<article class="spel-gava" data-gift-index="${i}" style="${pct(h)};--spel-fas:${(i * 0.35).toFixed(2)}s">`
        + `<div class="campaign-gift-image">${bild}</div><span hidden><b>${v ? Math.max(0, tal(v.current, 0)) : 0}</b></span></article>`;
    }).join('');
    return rot(w, `vyra-campaign spel-kampanj spel-kampanj-${sex ? 6 : 4}`, `--spel-ljusfarg:${t.ljus}`)
      + konst(src, g.bild) + platser + '</div>' + handtag(w) + '</div>';
  }

  function html(w) {
    const t = temaFor(w), del = delFor(w);
    if (!t || !del) return null;
    if (del === 'bakgrund') return bakgrund(w, t);
    if (del === 'kameraram' || del === 'spelram') return ram(w, t);
    if (del === 'lista') return lista(w, t);
    if (del === 'gifter') return gifter(w, t);
    if (del === 'mal') return mal(w, t);
    return kampanj(w, t);
  }

  // ---- egenskapspanelen för ramarna och bakgrunden --------------------------------------------------
  function ramProps(w) {
    const t = temaFor(w);
    const namn = { bakgrund: 'BAKGRUND', kameraram: 'KAMERARAM', spelram: 'SPELRAM' }[w.spelDel] || 'SPELRAM';
    return `<h3>${namn}</h3><div class="template-badge">${esc(t ? t.label : '')} · SPELLAYOUT</div>`
      + `<div hidden><input id="pt" value="${esc(w.title || '')}"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>INNEHÅLL</h4><p>${w.spelDel === 'bakgrund'
        ? 'Bakgrunden har genomskinliga hål där kameraramen och spelramen sitter, så kameran och spelet syns igenom i OBS.'
        : 'Ramens mitt är genomskinlig. Lägg kamera- eller spelkällan under overlayn i OBS.'}</p></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid">`
      + `<label>X<input id="propX" type="number" value="${tal(w.x, 0)}"></label><label>Y<input id="propY" type="number" value="${tal(w.y, 0)}"></label>`
      + `<label>Bredd<input id="propWidth" type="number" min="80" max="1200" value="${tal(w.width, 432)}"></label><label>Lager<input id="propLayer" type="number" value="${tal(w.layer, 1)}"></label></div></div>`
      + '<button class="delete" id="del">Ta bort</button>';
  }

  // ---- sidan GAMING OVERLAY ---------------------------------------------------------------------
  // Davids beslut 2026-10-15: delarna ligger INTE i widgetkatalogen. Streamern väljer ett tema på en
  // egen sida i menyn och får hela paketet — ramar, bakgrund och alla widgetar — på en gång. Varje
  // del är ändå en egen widget i layouten, så den kan flyttas, döljas eller tas bort för sig.

  // EN gaming overlay i taget: alla delar från ett tidigare tema tas bort först, så att ett byte av
  // tema inte lämnar två kameraramar ovanpå varandra. Andra widgetar i layouten rörs inte.
  function skapaHela(tema) {
    if (!Object.hasOwn(TEMAN, tema)) return;
    state.widgets = state.widgets.filter(w => !(w && w.spelTema));
    HELA.forEach(del => { state.widgets.push(VyraWidgets.create(`catalog:spellayout:${tema}:${del}`)); });
    selected = null;
    save();
    if (typeof toast === 'function') toast(`${TEMAN[tema].label}: hela gaming overlayn är lagd i din layout`);
  }

  const aktivtTema = () => {
    const w = (typeof state !== 'undefined' && state && state.widgets || []).find(x => x && x.spelTema);
    return w ? w.spelTema : null;
  };

  const INNEHALL = ['Kameraram och spelram', 'Bakgrund med plats för kamera och spel', 'Topplista: likes → coins → poäng',
    'Top Gifter', 'Följarmål', 'Gift Campaign med 6 gåvor', 'Rörligt ljus runt ramarna'];

  function sida() {
    const knapp = document.querySelector('[data-extra="gaming"]');
    if (!knapp || !knapp.classList.contains('active')) return;
    const vy = document.querySelector('#view'), titel = document.querySelector('#title');
    if (!vy) return;
    if (titel) titel.textContent = 'Gaming overlay';
    const aktiv = aktivtTema();
    vy.innerHTML = '<section class="card spel-sida-head"><div><h2>Gaming overlay</h2>'
      + '<p>Välj ett tema så får du hela paketet på en gång: kamera överst, spelet under och dina widgetar i samma stil. '
      + 'Lägg kamera- och spelkällan under VYRA-overlayn i OBS — ramarnas mitt är genomskinlig.</p></div></section>'
      + '<section class="spel-teman">' + Object.entries(TEMAN).map(([id, t]) =>
        `<article class="card spel-tema${aktiv === id ? ' aktiv' : ''}" data-spel-tema="${id}">`
        + `<img class="spel-tema-bild" src="${mapp(id)}forhandsvisning.webp" alt="${esc(t.label)}">`
        + `<div class="spel-tema-text"><h3>${esc(t.label)}</h3><ul>${INNEHALL.map(r => `<li>${r}</li>`).join('')}</ul>`
        + `<button type="button" class="spel-anvand" data-spel-anvand="${id}">${aktiv === id ? 'Lägg om temat' : 'Använd tema'}</button>`
        + (aktiv === id ? '<small>Används i din layout nu</small>' : '') + '</div></article>').join('')
      + '</section>';
    vy.querySelectorAll('[data-spel-anvand]').forEach(b => {
      b.onclick = () => {
        const tema = b.dataset.spelAnvand;
        const annat = aktivtTema();
        if (annat && !confirm(annat === tema
          ? `${TEMAN[tema].label} ligger redan i din layout. Lägga om det? Flyttade och ändrade delar återställs.`
          : `Byta från ${TEMAN[annat].label} till ${TEMAN[tema].label}? Delarna från ${TEMAN[annat].label} tas bort.`)) return;
        skapaHela(tema);
        // Till layouteditorn, där streamern ser scenen och kan finjustera den. Via menyns egen
        // Layout-länk, som byter vy utan omladdning — en omladdning direkt efter save() hann före
        // skrivningen och gav en tom layout (uppmätt 2026-10-15).
        const lank = document.querySelector('aside a[href="layout.html"]');
        if (lank) lank.click(); else if (typeof toast === 'function') toast('Öppna Layout för att se din gaming overlay');
      };
    });
  }
  document.addEventListener('click', e => {
    if (e.target && e.target.closest && e.target.closest('[data-extra="gaming"]')) setTimeout(sida, 0);
  }, true);
  // Ett klick direkt efter sidladdningen hann före startsidans egen ritning, som sedan skrev över
  // #view (uppmätt 2026-10-16: rubriken sade Gaming overlay, innehållet var Översikt). Så länge
  // menyknappen är aktiv ritas sidan om när någon annan har skrivit över den.
  new MutationObserver(() => {
    const knapp = document.querySelector('[data-extra="gaming"]');
    const vy = document.querySelector('#view');
    if (knapp && vy && knapp.classList.contains('active') && !vy.querySelector('.spel-teman')) sida();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ---- installation, ytterst i kedjan --------------------------------------------------------------
  // Samma vakt som ranking-sixpack.js (rang 2): wrappern lägger sig ytterst igen efter varje sent
  // skript, så att Gift Campaign Aura (laddas asynkront ur media.js) inte hamnar utanför skinnet.
  const RANG = 3;
  const djup = { wh: 0, props: 0 };
  function vakt(nyckel, forra, gor) {
    const f = function () {
      if (djup[nyckel]) return forra.apply(this, arguments);
      djup[nyckel]++;
      try { return gor.apply(this, arguments); } finally { djup[nyckel]--; }
    };
    f.__vyraYtter = RANG;
    return f;
  }
  function install() {
    let andrat = false;
    if (typeof wh === 'function' && !(wh.__vyraYtter >= RANG)) {
      const tidigare = wh;
      wh = vakt('wh', tidigare, function (w) {
        const egen = html(w);
        return egen === null ? tidigare(w) : egen;
      });
      andrat = true;
    }
    if (typeof props === 'function' && !(props.__vyraYtter >= RANG)) {
      const tidigare = props;
      props = vakt('props', tidigare, function () {
        const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
        return w && w.type === 'templateSpelram' ? ramProps(w) : tidigare();
      });
      andrat = true;
    }
    if (andrat) { try { if (typeof render === 'function') render(); } catch (e) {} }
  }

  install();
  document.addEventListener('load', e => { if (e.target && e.target.tagName === 'SCRIPT') install(); }, true);
  addEventListener('load', install, { once: true });

  window.VyraSpellayout = Object.freeze({ teman: TEMAN, delar: DELAR, hela: HELA, html, delFor, skapaHela, sida });
})();
