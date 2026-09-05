'use strict';
const S=require('./security'),Vault=require('./token-vault');
// HUR MÅNGA OANVÄNDA LÄNKAR SOM FÅR LEVA SAMTIDIGT, per syfte.
//
// Tidigare raderades ALLA oanvända token vid varje nytt utskick. Det gjorde att det mejl användaren
// mest sannolikt klickar på — det som kom när kontot skapades — dog i samma stund som hen tryckte
// "Skicka verifieringsmejl" för att det första dröjde. Mejlen ser identiska ut i inkorgen, så det
// fanns inget sätt att veta vilket som gällde. Svaret löd "Länken är ogiltig eller har gått ut",
// vilket var osant på båda punkterna: länken var varken ogiltig eller utgången — den var ERSATT.
// Meddelandet säger numera det rakt ut, så den som ändå hamnar där vet vad hen ska göra.
//
// Uppmätt på ett riktigt konto 2026-09-05: registrering → knapptryck → klick i det första mejlet →
// avvisad. En ny kund som tycker att mejlet dröjer hamnar i exakt samma fälla, och utan verifierad
// e-post kan hen varken spara något eller starta en provperiod.
//
// VERIFIERING tål flera levande länkar: de är engångs, slumpade över 32 byte, lagras hashade och
// lever ett dygn. Att tre av dem fungerar gör ingen skada — den som redan har inkorgen kommer in
// ändå. ÅTERSTÄLLNING av lösenord är en annan sak: en sådan länk ÄR ett kontoövertagande, så där
// behålls exakt en. Skillnaden är medveten.
//
// TAKET ÄR INTE ENDA SPÄRREN, och det är avsiktligt. Att sluta radera gamla token utan att begränsa
// utskicken hade bytt en irriterande bugg mot en väg att skicka obegränsat med mejl. Rutten
// `/api/auth/email/send-verification` har därför ett EGET tak, nycklat på användar-id (index.js).
//
// Första försöket la den i den delade auth-hinken i stället, och det var fel: den hinken nycklas på
// `req.socket.remoteAddress`, vilket bakom Caddy är PROXYNS adress — samma sträng för varje besökare.
// Den är alltså global, inte per klient. En otålig kund som klickade elva gånger hade låst ute alla
// andra från inloggning och verifiering under resten av minuten — och användarens EGET klick på
// verifieringslänken går mot samma hink, så felet hade dykt upp som "Länken fungerar inte": exakt
// symtomet den här ändringen finns till för att ta bort.
//
// ⚠️ Att adressen är proxyns är ett SEPARAT och kvarstående problem: det gör AUTH_RATE_LIMIT globalt
// för hela sajten och gör `ip_hash` identisk för alla sessioner. Det kräver att X-Forwarded-For läses
// med rätt tillitsgräns och hör inte hemma i den här ändringen.
const LEVANDE_TAK={verify_email:3,reset_password:1};

async function issue(pool,user,purpose,minutes){
  const raw=S.token(32),hash=S.digest(raw),expires=new Date(Date.now()+minutes*60000),
    path=purpose==='verify_email'?'verify-email':'reset-password',
    url=`${String(process.env.APP_ORIGIN||'').replace(/\/$/,'')}/studio.html?${path}=${encodeURIComponent(raw)}`,
    template=purpose==='verify_email'?'verify_email':'reset_password';
  // Behåll de nyaste, radera resten. `behall` är taket MINUS den vi är på väg att lägga till.
  // LIMIT 0 ger en tom mängd, och `id NOT IN (tom)` är sant för alla rader — alltså exakt det gamla
  // beteendet för reset_password, utan ett andra kodvägsfall att hålla i huvudet.
  const behall=Math.max(0,(LEVANDE_TAK[purpose]||1)-1);
  await pool.query(
    `DELETE FROM auth_tokens WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL
       AND id NOT IN (SELECT id FROM auth_tokens
                       WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL
                       ORDER BY created_at DESC LIMIT $3)`,
    [user.id,purpose,behall]);
  const token=await pool.query('INSERT INTO auth_tokens(user_id,purpose,token_hash,expires_at) VALUES($1,$2,$3,$4) RETURNING id',[user.id,purpose,hash,expires]);
  await pool.query('INSERT INTO notification_outbox(recipient,template,payload,dedupe_key) VALUES($1,$2,$3,$4)',[user.email,template,{sealedActionUrl:Vault.seal(url)},`${purpose}:${token.rows[0].id}`]);
  return expires;
}
async function requestReset(pool,email){const q=await pool.query('SELECT id,email FROM users WHERE email=$1 AND disabled_at IS NULL',[S.normalizeEmail(email)]);if(q.rows[0])await issue(pool,q.rows[0],'reset_password',30)}
async function consume(pool,raw,purpose){const hash=S.digest(String(raw||'')),q=await pool.query('SELECT t.id,t.user_id,u.email FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.purpose=$2 AND t.consumed_at IS NULL AND t.expires_at>now() FOR UPDATE',[hash,purpose]);return q.rows[0]||null}
async function verifyEmail(pool,raw){const c=await pool.connect();try{await c.query('BEGIN');const token=await consume(c,raw,'verify_email');if(!token)throw Object.assign(new Error('Länken är använd, utgången eller ersatt av ett nyare mejl. Öppna i så fall det senaste.'),{status:400});await c.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1',[token.user_id]);await c.query('UPDATE auth_tokens SET consumed_at=now() WHERE id=$1',[token.id]);await c.query('COMMIT')}catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}}
async function resetPassword(pool,raw,password){password=S.validatePassword(password);const c=await pool.connect();try{await c.query('BEGIN');const token=await consume(c,raw,'reset_password');if(!token)throw Object.assign(new Error('Länken är använd, utgången eller ersatt av ett nyare mejl. Öppna i så fall det senaste.'),{status:400});await c.query('UPDATE users SET password_hash=$1 WHERE id=$2',[S.hashPassword(password),token.user_id]);await c.query("UPDATE auth_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose='reset_password' AND consumed_at IS NULL",[token.user_id]);await c.query('DELETE FROM sessions WHERE user_id=$1',[token.user_id]);await c.query('COMMIT')}catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}}
module.exports={issue,requestReset,verifyEmail,resetPassword,LEVANDE_TAK};
