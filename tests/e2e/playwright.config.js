'use strict';
// LAGER 3 & 4 — E2E i riktig webblasare respektive i Electron.
//
// Kraver ett beroende som inte finns i repot an:
//   npm i -D @playwright/test && npx playwright install --with-deps chromium
//
// Varfor Playwright och inte jsdom: jsdom loser CSS-kaskaden men ritar inga bildrutor. Tre av
// dagens buggar — Last-X-kaskaden, kroningsbilden pa 55 % opacitet, streakens <em>GOOD</em> — syntes
// bara mot en riktigt renderad sida. jsdom-lagret (npm test) ar snabbt och tackar logiken; det har
// lagret tackar det jsdom inte kan se.
//
// Studio ar statiska filer. Ingen build behovs, sa webServer serverar repot som det ar.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  // Configen ligger i tests/e2e/, sa testDir ar mappen den star i. Den lag i roten forut
  // och foljde da med i bade Railway-imagens dokumentrot och desktopinstallern — Dockerfilens
  // sajtbygge kopierar ALLA *.js i roten till /site/, sa den hade serverats publikt.
  testDir: '.',
  // Livescenarion ar tidsberoende: fasmaskiner, hall-fonster, koade alerts. Parallella arbetare
  // som slass om samma port gor dem flakiga utan att hitta nagot.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,                       // en flake ar ett fynd, inte nagot att kora om tills det tiger
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },

  webServer: {
    command: 'node static-server.js 4321',
    url: 'http://127.0.0.1:4321/layout.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },

  projects: [
    { name: 'web', testMatch: /live-scenarios\.spec\.js/, use: { browserName: 'chromium' } },
    // Electron startas av testet sjalvt via _electron.launch(), sa den har projektionen behover
    // ingen webblasare — men den behover samma webServer, eftersom appen proxar mot den.
    { name: 'desktop', testMatch: /desktop\.spec\.js/ }
  ]
});
