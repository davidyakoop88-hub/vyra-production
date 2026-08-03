'use strict';

const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

function text(value, max = 500) {
  return String(value ?? '').slice(0, max);
}

function number(value, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : 0;
}

// Mirrors tiktok-bridge/normalizer.js's profileImageOf: take the largest avatar TikTok offers
// (avatarLarger 1080, avatarMedium 720) before falling back to profilePictureUrl, whose variant is
// unspecified, and to avatarThumb, which is only 100x100. Keeping web and desktop identical here
// matters because both feed the same widgets.
function avatarOf(data) {
  const user = data?.user || data;
  return text(
    user?.avatarLarge?.urlList?.[0] || user?.avatarLarge?.urlListList?.[0]
    || user?.avatarLarger?.urlList?.[0] || user?.avatarLarger?.urlListList?.[0]
    || user?.avatarMedium?.urlList?.[0] || user?.avatarMedium?.urlListList?.[0]
    || data?.profilePictureUrl || user?.profilePictureUrl
    || user?.avatarThumb?.urlList?.[0] || user?.avatarThumb?.urlListList?.[0]
    || '', 2048);
}

// userIdentity (isModeratorOfAnchor/isSubscriberOfAnchor/isFollowerOfAnchor) only exists on chat,
// gift and emote messages in TikTok's protocol — join/like/follow/share/member messages don't carry
// it, so those event types always report false here regardless of the viewer's real status. Mirrors
// tiktok-bridge/normalizer.js's identityOf.
function identityOf(data) {
  const id = data?.userIdentity;
  return { isModerator: !!id?.isModeratorOfAnchor, isFollower: !!id?.isFollowerOfAnchor, isSubscriber: !!id?.isSubscriberOfAnchor };
}

function baseUser(data) {
  const user = data?.user || data;
  return {
    username: text(data?.uniqueId || data?.user?.uniqueId, 100),
    name: text(data?.nickname || data?.user?.nickname || data?.uniqueId, 500),
    profileImage: avatarOf(data),
    // TikTok's "Enigma" mode lets a viewer browse/gift anonymously (mask on). Surfacing this lets
    // Events optionally exclude them, same as tiktok-live-proto exposes it on every User struct.
    isAnonymous: !!(data?.user?.enigmaInfo?.isEnigmaMaskOn || data?.enigmaInfo?.isEnigmaMaskOn),
    ...identityOf(data),
    // "Team" level in TikTok's own UI = the viewer's Fan Club level with this streamer specifically.
    fanClubLevel: number(user?.fansClub?.data?.level)
  };
}

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
        giftName: text(data?.giftName || data?.gift?.name, 160),
        giftImage: text(data?.giftPictureUrl || data?.gift?.image?.url_list?.[0], 2048),
        // Total diamond cost of the forwarded event, identical to the cloud path. Reading only
        // diamondCount made the same gift worth repeatCount times less over the desktop connection.
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
    connection.on(WebcastEvent.LINK_MIC_BATTLE, data => emit('battle', {
      scoreUs: number(data?.battleUsers?.[0]?.score || data?.scoreUs, 1e12),
      scoreThem: number(data?.battleUsers?.[1]?.score || data?.scoreThem, 1e12)
    }, data));
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
