'use strict';
// Räknarna ska delas i drift och hållas isär i testerna — och de två får aldrig byta plats.
//
// Delad rymd i drift är hela poängen: två instanser bakom samma lastdelare måste räkna ihop, annars
// är gränsen per instans. Men i testsviten kommer varje fil från 127.0.0.1 mot samma Redis, och då
// blev API-gränsen (nycklad på IP) en gemensam budget för hela körningen. Måltesterna gjorde slut
// på den och studio-goal-stream fick 429 där den väntade 202 — grön ensam, röd i grupp.
//
// Det här testet kör i en node:test-process, alltså är NODE_TEST_CONTEXT satt här. Just därför
// testas rymden som en ren funktion med en påhittad miljö: annars hade provet bara kunnat se
// sitt eget fall.
const test = require('node:test'), assert = require('node:assert/strict');
const { RateLimiter, nyckelrymd } = require('../rate-limit');

test('drift delar rymd: ingen markör, inget prefix', () => {
  assert.equal(nyckelrymd({}, 4711), '');
  assert.equal(nyckelrymd({ NODE_ENV: 'production' }, 4711), '');
});

test('node:test ger en egen rymd per process', () => {
  assert.equal(nyckelrymd({ NODE_TEST_CONTEXT: 'child-v8' }, 4711), 'p4711:');
  assert.notEqual(nyckelrymd({ NODE_TEST_CONTEXT: 'child-v8' }, 4711),
                  nyckelrymd({ NODE_TEST_CONTEXT: 'child-v8' }, 4712));
});

test('RATE_LIMIT_NAMESPACE går före markören', () => {
  assert.equal(nyckelrymd({ RATE_LIMIT_NAMESPACE: 'auto' }, 4711), 'p4711:');
  assert.equal(nyckelrymd({ RATE_LIMIT_NAMESPACE: 'staging' }, 4711), 'staging:');
  assert.equal(nyckelrymd({ RATE_LIMIT_NAMESPACE: 'staging', NODE_TEST_CONTEXT: 'child-v8' }, 4711), 'staging:');
});

test('vi kör i en testprocess, så rymden är vår egen', () => {
  assert.equal(nyckelrymd(), `p${process.pid}:`,
    'testerna måste ha en egen rymd, annars räknar filerna ihop varandras trafik igen');
});

// Utan Redis faller exceeded() tillbaka på den lokala räknaren. Den ska namnge sina hinkar
// likadant — annars läcker delningen tillbaka in via reservvägen.
test('den lokala reservräknaren använder samma rymd', async () => {
  const utanRedis = { connect: async () => { throw new Error('ingen Redis') } };
  const limiter = new RateLimiter(utanRedis);
  for (let i = 0; i < 3; i++) assert.equal(await limiter.exceeded('1.2.3.4:api', 3), false);
  assert.equal(await limiter.exceeded('1.2.3.4:api', 3), true, 'fjärde anropet över gränsen 3');

  const nycklar = [...limiter.local.keys()];
  assert.deepEqual(nycklar, [`p${process.pid}:1.2.3.4:api`],
    'den lokala hinken saknar processrymden och skulle delas mellan testfiler');
});
