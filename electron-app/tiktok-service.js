'use strict';

const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const { text, number, avatarOf, identityOf, baseUser, arGuardianEntrance } = require('./tiktok-fields');

function eventKey(type, data, fields) {
  const nativeId = data?.common?.msgId || data?.msgId || data?.messageId || data?.logId || data?.id;
  return nativeId
    ? `${type}:${nativeId}`
    : `${type}:${fields.username || ''}:${fields.giftName || ''}:${fields.count || ''}:${Math.floor(Date.now() / 1000)}`;
}

function createTikTokService({ onStatus, onEvent, log = () => {} }) {
  let activeConnection = null;
  let activeUsername = '';
  let connectToken = 0;

  function emit(type, fields, data) {
    onEvent({ type, eventKey: eventKey(type, data, fields), source: 'tiktok-live', ...fields });
  }

  async function disconnect(reason = 'Frånkopplad') {
    connectToken++;
    const connection = activeConnection;
    activeConnection = null;
    activeUsername = '';
    try { await connection?.disconnect?.(); } catch {}
    onStatus({ connected: false, username: '', mode: 'live', state: 'disconnected', roomId: '', reason });
  }

  async function connect(rawUsername) {
    const username = text(rawUsername, 100).trim().replace(/^@+/, '');
    if (!username) throw new Error('Skriv ditt TikTok-användarnamn');

    await disconnect('Byter TikTok-konto');
    const token = ++connectToken;
    const connection = new TikTokLiveConnection(username, {});
    activeConnection = connection;
    activeUsername = username;
    onStatus({ connected: false, username, mode: 'live', state: 'connecting', roomId: '' });

    connection.on(WebcastEvent.CHAT, data => {
      const comment = text(data?.comment, 500);
      emit(comment.trim().startsWith('!') ? 'chatcommand' : 'chat', { ...baseUser(data), name: comment }, data);
    });
    connection.on(WebcastEvent.GIFT, data => {
      // v3 keeps the type in gift.type and repeatEnd as a number; older shapes kept both flat.
      const streakable = (data?.gift?.type ?? data?.giftType ?? data?.giftDetails?.giftType) === 1;
      const finalFrame = data?.repeatEnd === undefined ? true : !!Number(data.repeatEnd);
      if (streakable && !finalFrame) return;
      emit('gift', {
        ...baseUser(data),
        // PARITET MED MOLNVÄGEN. Desktop skickade tidigare inget giftId alls, bara namnet — så
        // lärläget (docs/gavoidentitet-inlarning.md) hade varit omöjligt över den här vägen: utan
        // id finns ingen identitet att lära in. Samma precedens som tiktok-bridge/normalizer.js:68.
        giftId: text(data?.giftId || data?.giftDetails?.giftId || data?.gift?.id, 160),
        giftName: text(data?.giftName || data?.gift?.name, 160),
        giftImage: text(data?.giftPictureUrl || data?.gift?.image?.url_list?.[0], 2048),
        // Total diamond cost of the forwarded event, identical to the cloud path. Reading only
        // diamondCount made the same gift worth repeatCount times less over the desktop connection.
        // Talet ar DIAMANTER (kallfaltet heter diamondCount). `diamonds` ar det riktiga namnet;
        // `coins` bevaras som alias sa lange en publicerad .exe och cachad widgetkod laser det. #133
        diamonds: number(data?.diamondCount ?? data?.gift?.diamondCount ?? data?.gift?.diamond_count, 1e9) * Math.max(1, number(data?.repeatCount || 1, 1e7)),
        coins: number(data?.diamondCount ?? data?.gift?.diamondCount ?? data?.gift?.diamond_count, 1e9) * Math.max(1, number(data?.repeatCount || 1, 1e7)),
        count: number(data?.repeatCount || 1, 1e7)
      }, data);
    });
    connection.on(WebcastEvent.FOLLOW, data => emit('follow', baseUser(data), data));
    connection.on(WebcastEvent.SHARE, data => emit('share', baseUser(data), data));
    connection.on(WebcastEvent.MEMBER, data => emit('member', baseUser(data), data));
    connection.on(WebcastEvent.SUB_NOTIFY, data => emit('subscribe', baseUser(data), data));
    connection.on(WebcastEvent.ROOM_USER, data => emit('viewer', { count: number(data?.viewerCount || data?.userCount, 1e9) }, data));
    connection.on(WebcastEvent.LIKE, data => emit('likes', {
      ...baseUser(data),
      count: number(data?.likeCount, 1e9),
      points: number(data?.totalLikeCount, 1e12)
    }, data));
    connection.on(WebcastEvent.EMOTE, data => {
      const emote = data?.emoteList?.[0];
      emit('subscriberemote', {
        ...baseUser(data),
        emote: text(emote?.emoteId, 160),
        giftImage: text(emote?.image?.urlList?.[0], 2048)
      }, data);
    });
    // GUARDIAN. Uppmatt i skarp sandning 2026-09-01: BARRAGE med subType 'guardian_entrance',
    // atta event, alla fran samma person av ~59 tittare. Regeln delas MED BRYGGAN
    // (normalizer.arGuardianEntrance) i stallet for att kopieras: tva kopior av "vad ar ett
    // guardian-event" glider isar, och en delstrangssokning hade tant emblemet for TikToks gava
    // "Guardian Wings". Molnvagen fick den i #304; utan raden nedan ar emblemet dott pa desktop.
    connection.on(WebcastEvent.BARRAGE, data => {
      if (!arGuardianEntrance(data)) return;
      emit('guardian', baseUser(data), data);
    });
    connection.on(WebcastEvent.LINK_MIC_BATTLE, data => emit('battle', {
      scoreUs: number(data?.battleUsers?.[0]?.score || data?.scoreUs, 1e12),
      scoreThem: number(data?.battleUsers?.[1]?.score || data?.scoreThem, 1e12)
    }, data));
    // PAUS OCH ATERUPPTAGANDE (Davids fraga 2026-08-21).
    //
    // Vart bibliotek har INGEN egen pauhandelse — 68 typer och ingen heter nagot med pause.
    // Pausen kommer in som CONTROL_MESSAGE med ett action-falt, och koderna star i
    // tiktok-live-proto/v3 som biblioteket sjalvt bygger pa:
    //   1 STREAM_PAUSED   2 STREAM_UNPAUSED   3 STREAM_ENDED   4 STREAM_SUSPENDED
    //
    // ANSLUTNINGEN STAR KVAR VID PAUS. connected forblir true: en paus ar inte ett avbrott,
    // hjartslaget fortsatter var 5:e sekund, och satter vi connected:false startar
    // ateranslutningen och sidhuvudet sager "Anslut TikTok" mitt i en pagaende sandning.
    // Bara `state` byts, sa gransnittet kan saga sanningen utan att nagot ateransluts.
    connection.on(WebcastEvent.CONTROL_MESSAGE, data => {
      if (activeConnection !== connection) return;
      const action = Number(data?.action);
      if (action === 1) onStatus({ connected: true, username, mode: 'live', state: 'paused', reason: 'Sandningen pausad' });
      else if (action === 2) onStatus({ connected: true, username, mode: 'live', state: 'live', reason: '' });
      else if (action === 4) onStatus({ connected: true, username, mode: 'live', state: 'suspended', reason: 'Sandningen stoppad av TikTok' });
      // action 3 (ENDED) hanteras av STREAM_END nedan — en och samma sak ska inte stangas
      // ner fran tva hall, da kan de tavla om vem som nollar activeConnection.
    });
    connection.on(WebcastEvent.STREAM_END, () => {
      if (activeConnection === connection) {
        activeConnection = null;
        onStatus({ connected: false, username, mode: 'live', state: 'ended', roomId: '', reason: 'TikTok LIVE avslutades' });
      }
    });
    connection.on(ControlEvent.DISCONNECTED, () => {
      if (activeConnection === connection) {
        activeConnection = null;
        onStatus({ connected: false, username, mode: 'live', state: 'disconnected', roomId: '', reason: 'TikTok kopplades från' });
      }
    });
    connection.on(ControlEvent.ERROR, error => log('TikTok connection error:', error?.message || error));

    try {
      const state = await connection.connect();
      if (token !== connectToken || activeConnection !== connection) {
        await connection.disconnect?.();
        throw new Error('TikTok-anslutningen avbröts');
      }
      const roomId = text(state?.roomId, 100);
      onStatus({ connected: true, username, mode: 'live', state: 'live', roomId });
      return { username, roomId };
    } catch (error) {
      if (activeConnection === connection) activeConnection = null;
      onStatus({ connected: false, username, mode: 'live', state: 'failed', roomId: '', reason: error?.message || 'Kunde inte ansluta' });
      throw new Error(`Kunde inte ansluta till @${username}. Kontrollera att kontot sänder LIVE.`);
    }
  }

  return { connect, disconnect, get username() { return activeUsername; } };
}

module.exports = { createTikTokService };
