'use strict';
// The measured frames, transcribed from the staging diagnostic run on 2026-08-03.
// Only the fields the diagnostic was allowed to log are here — shapes and counts, no identities.
//
// Each entry is one gift: the cumulative repeatCount series TikTok actually sent, the matching
// repeatEnd series, and what the gift is really worth. Checked in so the permanent suite pins real
// traffic without needing a live room or a diagnostic deploy to re-run.
const MEASURED = [
  { name: 'Streak A · 10 rosor',
    repeatCounts: [1, 3, 5, 7, 9, 10, 10],
    repeatEnds:   [0, 0, 0, 0, 0, 0, 1],
    diamondCount: 1, expectCount: 10, expectDiamonds: 10 },

  { name: 'Enstaka gåva · 10 diamanter',
    repeatCounts: [1, 1],
    repeatEnds:   [0, 1],
    diamondCount: 10, expectCount: 1, expectDiamonds: 10 },

  { name: 'Streak B · 8 rosor',
    repeatCounts: [5, 8, 8],
    repeatEnds:   [0, 0, 1],
    diamondCount: 1, expectCount: 8, expectDiamonds: 8 }
];

// Rebuilds the v3 message shape around each measured frame. giftType is deliberately absent: the
// diagnostic reported giftTypeOf "undefined" on all 14 frames, and the type lives in gift.type.
function frames(measured) {
  return measured.repeatCounts.map((repeatCount, i) => ({
    common: { msgId: `${measured.name}#${i}` },
    gift: { id: '5655', name: 'Rose', type: 1, diamondCount: measured.diamondCount },
    giftId: '5655',
    repeatCount,
    repeatEnd: measured.repeatEnds[i],
    user: { idStr: 'u1', displayId: 'tittare', nickname: 'Tittare',
      avatarLarge: { urlList: ['https://example.invalid/a.webp'] } }
  }));
}

module.exports = { MEASURED, frames };
