'use strict';
// Mockad TikTok-livestrom. CI har ingen riktig stream — och ska inte ha det: en riktig stream ar
// inte reproducerbar, kraver ett konto och gar inte att fa att skicka 100 gavor pa kommando.
//
// Formen kommer fran tiktok-bridge/normalizer.js, inte fran fantasin:
//   coins = varde per gava * repeatCount   (summan)
//   count = repeatCount                    (combolangden)
// Blandas de ihop mater Top Gift och Top Streak samma sak — bugg A2.
//
// Anvands av bade Playwright-scenariona och som fristaende generator:
//   node tests/e2e/mock-live.js --gifts 100 --seed 42

const GIFTS = [
  { name: 'Rose', coinsEach: 1, image: 'assets/gifts/part1/gifts/0001_Rose.png' },
  { name: 'Galaxy', coinsEach: 1000, image: 'assets/gifts/part8/gifts/7973_Galaxy.png' },
  { name: 'Lion', coinsEach: 29999, image: 'assets/gifts/part9/gifts/8371_Lion.png' },
  { name: 'Community Heart', coinsEach: 1, image: 'assets/gifts/part1/gifts/0002_Community_Heart.png' }
];
const USERS = ['wpwer17', 'mia_l', 'leo_s', 'sara_s', 'piiikabom'];

// Deterministisk PRNG. Ett fel som bara intraffar i en av tusen ordningar maste ga att kora om
// exakt fran seeden i felrapporten.
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 };
}

function gift(rand, i) {
  const g = GIFTS[Math.floor(rand() * GIFTS.length)];
  const count = Math.floor(rand() * 20) + 1;
  return {
    id: `mock-gift-${i}`, type: 'gift', at: 1785000000000 + i * 1000,
    username: USERS[Math.floor(rand() * USERS.length)],
    userId: 'u' + Math.floor(rand() * 1000),
    giftId: 'g' + g.name, giftName: g.name, giftImage: g.image,
    coins: g.coinsEach * count, count
  };
}

function like(rand, i) {
  return { id: `mock-like-${i}`, type: 'like', at: 1785000000000 + i * 1000,
    username: USERS[Math.floor(rand() * USERS.length)], count: Math.floor(rand() * 30) + 1 };
}

function follow(rand, i) {
  return { id: `mock-follow-${i}`, type: 'follow', at: 1785000000000 + i * 1000,
    username: USERS[Math.floor(rand() * USERS.length)] };
}

/** En serie gavor med stigande combolangd — for streak-scenariot. */
function streakRun(length, seed = 1) {
  const rand = rng(seed);
  const g = GIFTS[0];
  return Array.from({ length }, (_, i) => ({
    id: `mock-streak-${i}`, type: 'gift', at: 1785000000000 + i * 1000,
    username: USERS[Math.floor(rand() * USERS.length)],
    giftId: 'g' + g.name, giftName: g.name, giftImage: g.image,
    coins: g.coinsEach * (i + 1), count: i + 1
  }));
}

/** Blandad strom: 70 % gavor, 15 % likes, 15 % follows. */
function stream(count, seed = 42) {
  const rand = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const r = rand();
    if (r < 0.7) return gift(rand, i);
    if (r < 0.85) return like(rand, i);
    return follow(rand, i);
  });
}

/** Samma event upprepat — for dubblettskyddet. */
function duplicates(count) {
  const one = { id: 'mock-duplicate', type: 'gift', at: 1785000000000,
    username: 'wpwer17', giftId: 'gRose', giftName: 'Rose',
    giftImage: GIFTS[0].image, coins: 1, count: 1 };
  return Array.from({ length: count }, () => ({ ...one }));
}

module.exports = { stream, streakRun, duplicates, gift, like, follow, rng, GIFTS, USERS };

if (require.main === module) {
  const arg = n => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] };
  const n = Number(arg('--gifts') || 100), seed = Number(arg('--seed') || 42);
  process.stdout.write(JSON.stringify(stream(n, seed), null, 1) + '\n');
}
