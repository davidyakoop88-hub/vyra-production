# TikTok LIVE-integration

## Händelsekedja

1. `tiktok-bridge/bridge.js` ansluter till ett live-rum.
2. `tiktok-bridge/normalizer.js` gör användare, gifts, likes, prenumerationer, tittare och matchdata till säkra VYRA-fält.
3. Eventet skickas till lokal server och, när molnvariabler finns, till det autentiserade molningestet.
4. Redis deduplicerar och distribuerar eventet till Studio/OBS via SSE.
5. `tiktok-event-adapter.js` aktiverar premium-gåvan och meddelar övriga live-widgets.

## Stödda event

- Gift och giftstreak
- Like
- Follow
- Share
- Join/viewer
- Subscription
- Viewer count
- Battle score/multiplier
- Chat och chatbot-kommandon
- Stream end, disconnect och reconnect

Giftens namn visas inte i premiumtexten. Giftbild, profilbild, användarnamn, antal och coin-värde finns kvar. Om en annan tittare skickar samma gift flyttas giftägarskapet och eventet `vyra-top-gift-change` skickas. Top Likes visar bara personer som varit aktiva under de senaste tio minuterna.

## Riktigt live-test

Det enda som inte kan verifieras offline är TikToks verkliga livesignal. Vid live-test:

1. Starta VYRA.
2. Kör `ANSLUT-TIKTOK-LIVE.cmd` och ange användarnamnet utan `@`.
3. Skicka en liten och en större gift, likes, follow, share och subscription.
4. Starta en match och kontrollera score/multiplier.
5. Bryt nätverket kort och bekräfta återanslutning.

Connectorn använder TikToks interna Webcast-flöde via ett tredjepartsbibliotek och är inte TikToks officiella API. Därför ska connectorstatus och återanslutningar alltid övervakas.
