(function () {
  'use strict';

  const CLIENT_ID = '98200bcc03394a56889e42c9ac53eba2';
  const TOKEN_KEY = 'vyra-spotify-token-v1';
  const OAUTH_KEY = 'vyra-spotify-oauth-v1';
  const SCOPES = [
    'user-read-private',
    'user-read-currently-playing',
    'user-read-playback-state',
    'user-modify-playback-state'
  ];

  const readJson = (key) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  };
  const toBase64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const randomValue = () => {
    const bytes = new Uint8Array(48);
    crypto.getRandomValues(bytes);
    return toBase64Url(bytes);
  };
  const sha256 = async (value) => crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  const redirectUri = () => location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:4173/spotify-callback.html'
    : 'https://vyralive.app/spotify-callback.html';

  function saveToken(payload, previous) {
    const token = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || previous?.refreshToken || '',
      expiresAt: Date.now() + (Number(payload.expires_in || 3600) * 1000) - 30_000,
      scope: payload.scope || previous?.scope || ''
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    return token;
  }

  async function exchange(body) {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error_description || 'Spotify-inloggningen misslyckades');
    return payload;
  }

  async function refreshToken(token) {
    if (!token?.refreshToken) return null;
    try {
      const payload = await exchange({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken
      });
      return saveToken(payload, token);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
  }

  async function validToken() {
    let token = readJson(TOKEN_KEY);
    if (!token) return null;
    if (token.expiresAt <= Date.now()) token = await refreshToken(token);
    return token;
  }

  async function api(path, options = {}, retry = true) {
    const token = await validToken();
    if (!token) throw new Error('Spotify är inte anslutet');
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    if (response.status === 401 && retry) {
      token.expiresAt = 0;
      localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
      return api(path, options, false);
    }
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || 'Spotify kunde inte utföra åtgärden';
      throw new Error(response.status === 403
        ? `${message}. Uppspelning kräver Spotify Premium.`
        : message);
    }
    return payload;
  }

  // INGEN AKTIV ENHET (David 2026-10-21, uppmätt i hans studio): Spotify-appen var öppen på datorn
  // ("JOKERO", Computer, is_active: false), Premium, ansluten — men play() svarade "Player command
  // failed: No active device found". Spotify räknar en enhet som aktiv först när den spelat nyligen,
  // och ett spelarkommando utan device_id går bara till en aktiv enhet. Med datorns device_id angivet
  // spelade samma anrop direkt (play 204, queue 200, next 200, uppmätt samma kväll).
  //
  // Därför: kommandot försöker som förut, och bara när Spotify svarar "no active device" väljs en enhet
  // — den aktiva om någon finns, annars datorn, annars den första — och kommandot skickas igen med
  // device_id. Finns ingen enhet alls säger felet vad streamern ska göra.
  async function valjEnhet() {
    const svar = await api('/me/player/devices');
    const enheter = (svar && svar.devices || []).filter(d => d && d.id && !d.is_restricted);
    return enheter.find(d => d.is_active) || enheter.find(d => d.type === 'Computer') || enheter[0] || null;
  }
  async function spelare(path, options) {
    try {
      return await api(path, options);
    } catch (error) {
      if (!/no active device/i.test(String(error && error.message))) throw error;
      const enhet = await valjEnhet();
      if (!enhet) throw new Error('Öppna Spotify på datorn eller mobilen, så VYRA har en enhet att spela på');
      return api(path + (path.includes('?') ? '&' : '?') + 'device_id=' + encodeURIComponent(enhet.id), options);
    }
  }

  async function connect() {
    const verifier = randomValue();
    const state = randomValue();
    const challenge = toBase64Url(await sha256(verifier));
    localStorage.setItem(OAUTH_KEY, JSON.stringify({
      verifier,
      state,
      redirectUri: redirectUri(),
      createdAt: Date.now()
    }));
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri(),
      scope: SCOPES.join(' '),
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      show_dialog: 'true'
    });
    const popup = window.open(
      `https://accounts.spotify.com/authorize?${params}`,
      'vyra-spotify',
      'popup,width=520,height=760'
    );
    if (!popup) throw new Error('Tillåt popup-fönstret för att ansluta Spotify');
  }

  async function handleCallback() {
    const params = new URLSearchParams(location.search);
    const oauth = readJson(OAUTH_KEY);
    const error = params.get('error');
    if (error) throw new Error(error === 'access_denied' ? 'Spotify-anslutningen avbröts' : error);
    if (!oauth || Date.now() - oauth.createdAt > 10 * 60 * 1000) {
      throw new Error('Spotify-inloggningen har gått ut. Försök igen.');
    }
    if (!params.get('code') || params.get('state') !== oauth.state) {
      throw new Error('Spotify kunde inte verifiera inloggningen');
    }
    const payload = await exchange({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: params.get('code'),
      redirect_uri: oauth.redirectUri,
      code_verifier: oauth.verifier
    });
    saveToken(payload);
    localStorage.removeItem(OAUTH_KEY);
    try { window.opener?.postMessage({ type: 'vyra:spotify-connected' }, location.origin); } catch {}
    try { new BroadcastChannel('vyra-spotify').postMessage({ type: 'connected' }); } catch {}
  }

  // Ett Spotify-svar som säger VARFÖR kontot inte får användas ska fram till streamern (David
  // 2026-10-21: "Spotify funkar inte" — studion sa bara "Inte ansluten" och slängde orsaken).
  // Vanligast: VYRA:s Spotify-app är i utvecklingsläge, och då får bara konton som lagts till under
  // User Management på developer.spotify.com logga in. Spotify svarar då 403 på /me.
  function lasbarOrsak(error) {
    const text = String(error && error.message || '');
    if (/not be registered|not registered|user may not/i.test(text)) {
      return 'Spotify-kontot är inte tillagt i VYRA:s Spotify-app. Lägg till kontots e-post under User Management på developer.spotify.com och anslut igen.';
    }
    return text.replace(/\. Uppspelning kräver Spotify Premium\.$/, '') || 'Spotify svarade inte';
  }

  async function status() {
    const token = await validToken();
    if (!token) return { connected: false };
    try {
      const profile = await api('/me');
      return { connected: true, profile };
    } catch (error) {
      return { connected: false, fel: lasbarOrsak(error) };
    }
  }

  async function current() {
    return api('/me/player/currently-playing');
  }

  async function play(query) {
    const value = String(query || '').trim();
    if (!value) throw new Error('Välj en Spotify-låt först');
    let uri = value;
    if (!value.startsWith('spotify:')) {
      const result = await api(`/search?type=track&limit=1&q=${encodeURIComponent(value)}`);
      uri = result?.tracks?.items?.[0]?.uri;
      if (!uri) throw new Error('Låten hittades inte på Spotify');
    }
    await spelare('/me/player/play', { method: 'PUT', body: JSON.stringify({ uris: [uri] }) });
    return uri;
  }

  // LÅTÖNSKNINGAR (latonskningar.js): lägg en låt SIST i streamerns Spotify-kö i stället för att
  // byta låt direkt. Spotify spelar sedan kön i ordning. Samma behörighet som play()
  // (user-modify-playback-state), och Spotify Premium krävs precis som där.
  async function queue(query) {
    const value = String(query || '').trim();
    if (!value) throw new Error('Ingen låt att lägga i kön');
    let track = null;
    if (value.startsWith('spotify:track:')) track = { uri: value, name: '', artists: [] };
    else {
      const result = await api(`/search?type=track&limit=1&q=${encodeURIComponent(value)}`);
      track = result?.tracks?.items?.[0] || null;
      if (!track) throw new Error('Låten hittades inte på Spotify');
    }
    await spelare(`/me/player/queue?uri=${encodeURIComponent(track.uri)}`, { method: 'POST' });
    return { uri: track.uri, titel: track.name || '', artist: (track.artists || []).map(a => a.name).join(', '),
      bild: track.album?.images?.[track.album.images.length > 1 ? 1 : 0]?.url || '', sekunder: Math.round((track.duration_ms || 0) / 1000) };
  }

  async function next() {
    return spelare('/me/player/next', { method: 'POST' });
  }

  function disconnect() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(OAUTH_KEY);
    window.dispatchEvent(new CustomEvent('vyra:spotify-changed'));
  }

  window.addEventListener('message', (event) => {
    if (event.origin === location.origin && event.data?.type === 'vyra:spotify-connected') {
      window.dispatchEvent(new CustomEvent('vyra:spotify-changed'));
    }
  });
  try {
    const channel = new BroadcastChannel('vyra-spotify');
    channel.onmessage = () => window.dispatchEvent(new CustomEvent('vyra:spotify-changed'));
  } catch {}

  window.VyraSpotify = { connect, disconnect, status, current, play, queue, next, handleCallback };
})();
