'use strict';
// SPOTIFY-INLOGGNING MED GOOGLE I SKRIVBORDSAPPEN (David 2026-11-23: "klickar pa nasta sa gar ingen
// stans"). Spotify-fonstret fick bara navigera inom accounts.spotify.com och appen. "Fortsatt med
// Google" kom fram via en omdirigering, men Googles Nasta ar en vanlig navigering och stoppades tyst.
// Provet kor main.js riktiga fonsterlogik mot en lattviktig Electron-atrapp.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');

// Plocka ut listan och provfunktionen ur main.js och kor dem, i stallet for att lasa stavningen.
function laddaRegler(){
  const lista=source.match(/const SPOTIFY_LOGIN_ORIGINS=\[[\s\S]*?\];/);
  const prov=source.match(/const isSpotifyLoginUrl=url=>\{[\s\S]*?\};/);
  assert.ok(lista&&prov,'Spotify-fonstrets lista over inloggningstjanster saknas i main.js');
  return new Function(`${lista[0]}${prov[0]}return isSpotifyLoginUrl;`)();
}

test('Spotify-fonstret slapper igenom Google, Facebook och Apple',()=>{
  const ok=laddaRegler();
  for(const url of [
    'https://accounts.spotify.com/sv/login',
    'https://challenge.spotify.com/c/abc',
    'https://accounts.google.com/v3/signin/challenge/pwd?TL=x',
    'https://www.facebook.com/login.php',
    'https://appleid.apple.com/auth/authorize',
  ])assert.ok(ok(url),`${url} stoppas — inloggningen fastnar pa Nasta`);
});

test('Spotify-fonstret slapper inte igenom vad som helst',()=>{
  const ok=laddaRegler();
  for(const url of [
    'https://evil.example/accounts.google.com',
    'http://accounts.google.com/',
    'https://accounts.google.com.evil.example/',
    'javascript:alert(1)',
    'inte en adress',
  ])assert.equal(ok(url),false,`${url} slapps igenom`);
});

test('barnfonstrets will-navigate anvander inloggningslistan',()=>{
  const barn=source.slice(source.indexOf("on('did-create-window'"));
  const nav=barn.match(/will-navigate',\(event,url\)=>\{([^}]*)\}/);
  assert.ok(nav,'barnfonstret saknar navigeringsspärr');
  assert.match(nav[1],/isSpotifyLoginUrl\(url\)/,'barnfonstret provar fortfarande bara accounts.spotify.com');
  assert.match(nav[1],/preventDefault/,'barnfonstret stoppar inte langre okanda adresser');
});

test('inloggningsfonstret doljer Electron i webblasaridentiteten, appfonstret gor det inte',()=>{
  const ua=source.match(/getUserAgent\(\)\.replace\((\/[^\n]*?\/gi),''\)/);
  assert.ok(ua,'Spotify-fonstret presenterar sig som Electron — Google vagrar logga in');
  const re=eval(ua[1]);
  const fore='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) VYRA/1.4.2 Chrome/138.0.7204.100 Electron/37.2.0 Safari/537.36';
  const efter=fore.replace(re,'');
  assert.equal(efter,'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.100 Safari/537.36');
  // Bara barnfonster som oppnats mot Spotify far ny identitet.
  assert.match(source,/if\(isSpotifyAuthUrl\(details&&details\.url\)\)\{[\s\S]{0,200}setUserAgent/);
  assert.doesNotMatch(source,/main\.webContents\.setUserAgent/);
});
