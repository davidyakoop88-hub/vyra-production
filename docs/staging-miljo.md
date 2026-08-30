# Staging — vad den är, och hur man får igång den

Staging finns redan. Den ska inte skapas på nytt, och den ska **aldrig** skapas med Railways
"Duplicate Environment": den kopierar produktionens variabler, alltså `APP_ENCRYPTION_KEY`, live
Stripe-nycklar och prods `DATABASE_URL`. En sådan "staging" är produktionen med ett annat namn.

| | |
|---|---|
| Projekt | VYRA Production (Railway) |
| Environment | `staging` |
| URL | `vyra-api-staging-staging.up.railway.app` |
| Tjänster | `vyra-api-staging`, `vyra-tiktok-manager-staging` |
| Databas | `Postgres-YTeJ` — **egen instans**, egen volym |
| Redis | `Redis-3LP9` — **egen instans**, egen volym |
| Variabler | 29 egna, helt skilda från produktionens |
| Gren | `main`, rot `/server`, Dockerfile via `server/railway.json` |

`APP_ORIGIN` är en referens till `RAILWAY_PUBLIC_DOMAIN` och pekar därför på stagings egen domän.
Railways varningsikon på den raden gäller egress-avgifter, inte felkonfiguration.

## Ingenting är mjukare i staging

`production-config.js` säger det uttryckligen, och 24 påståenden i `test/production-config.test.js`
kör varje kontroll under **båda** `APP_ENV`-värdena:

> Nothing below is RELAXED for staging. Every secret, URL and token check applies identically in
> both; staging is strictly not weaker, and in one respect stricter (`OBJECT_KEY_PREFIX`).

Om någon någon gång vill "tillfälligt lätta på en kontroll i staging" är svaret nej. Det fäller
prov, och det som fälls är precis det som gör staging till en miljö man kan lita på ett körprov i.

## Två fällor som redan kostat tid

### 1. Död gren ⇒ fossil miljö

Servicen var kopplad till `bridge-capacity-limits` — en gren som raderades när den mergades.
Railway visade **"Connected branch does not exist"**, och tjänsten stod som **`Completed`**.

`Completed` ser ut som scale-to-zero men är det inte. Replicas var 1 hela tiden, serverless av.
Miljön var inte nedskalad — den var **utan källa**.

**Kontroll:** Settings → Source → "Branch connected to staging" ska vara `main`.

### 2. Härdningar är retroaktiva mot vilande miljöer

Stagings `APP_ENCRYPTION_KEY` sattes 2026-08-03. Den strikta nyckeltolkningen kom 2026-08-28
(`b6b8d8c`, #283). Nyckeln var giltig när den sattes och ogiltig när miljön väcktes:

```
Error: Produktionskonfiguration blockerad:
- APP_ENCRYPTION_KEY måste vara en kanonisk base64url-nyckel som avkodar till exakt 32 bytes
  code: 'VYRA_PRODUCTION_CONFIG'   at index.js:2
```

**Healthcheck-felet efter 4:51 var symptomet, aldrig orsaken.** Processen levde aldrig länge nog
för att svara. Exakt samma slutsats står i en deploynotering från 2026-08-03, där orsaken i stället
var en fil utanför Dockerfilens COPY-lista.

Läs alltid **Deploy Logs**, inte healthcheck-raden, när en staging-deploy faller.

## Rotera `APP_ENCRYPTION_KEY` — endast staging

Kräver någon med skrivrättigheter i Railway. Värdet ska aldrig klistras in i en chatt, ett ärende
eller en commit.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

43 tecken, ingen `=`-padding. Sista tecknet är ett av sexton: `048AEIMQUYcgkosw` — de fyra
signifikanta bitarna i sista sextetten. (En äldre anteckning påstod fyra möjliga tecken; det gällde
en annan nyckellängd.)

Sätt värdet på **`vyra-api-staging`** med miljöväljaren på **`staging`**. Samma variabelnamn finns i
`production`, och förväxlingen är den enda som gör verklig skada här.

### ⛔ Produktionens nyckel roteras aldrig som en del av det här

`APP_ENCRYPTION_KEY` förseglar **lagrade MFA-hemligheter** och härleder **Heart Me-pseudonymiseringen**.
En rotation i produktion låser ut varje användare med tvåfaktor och gör att samma person kan räknas
en gång till i en pågående sändning. Se `docs/heart-me-goal-design.md`.

I staging är bytet ofarligt: gammal krypterad data blir oläsbar, men den datan är testdata.

## Efter rotationen — verifiera i den här ordningen

```bash
curl -i https://vyra-api-staging-staging.up.railway.app/health/ready   # 200
curl -i https://vyra-api-staging-staging.up.railway.app/api/health     # 200, postgres+redis true

# Adminrutten ska stoppa FÖRE body-validering
curl -i -X POST https://vyra-api-staging-staging.up.railway.app/api/admin/gavokatalog \
  -H 'content-type: application/json' --data '{"region":"SE","gifts":[]}'   # 401
```

Ett `401` här bevisar två saker på en gång: rutten är utrullad, och spärren ligger före
validering.

## Seedningens körprov i staging

Skala ned `vyra-tiktok-manager-staging` under provet — inte för produktionens skull, utan för att
varje rad som dyker upp i stagings databas ska gå att härleda till seedningen.

### Före

```sql
select 'gavokatalog' as tabell, count(*) as n from gavokatalog
union all select 'gavoobservation', count(*) from gavoobservation
union all select 'gavoseedning',    count(*) from gavoseedning;
```

Förväntat i STAGING: `0 / 0 / 0`.

**I produktion gäller inte den siffran, och det är inte ett fel.** `gavokatalog` fylls också
organiskt: etiketter lärs in ur gåvor som faktiskt dyker upp i riktiga sändningar. Mätt i
produktionen 2026-08-30, före all seedning: `katalog=21`, `observation=0`, `seedning=0`,
`regel=0`.

⛔ **Töm inte katalogen för att nå noll.** Det raderar organiskt inlärda rader utan att göra
seedningen mer korrekt. Tre mätta skäl till att befintliga rader är ofarliga:

1. Katalogen upsertar — `ON CONFLICT (gift_id) DO UPDATE`. Befintliga rader uppdateras med de
   officiellt uppmätta värdena i stället för att krocka.
2. Kontrollräkningen som avgör `status='klar'` går mot **`gavoobservation`**, inte katalogen:
   `SELECT count(*) FROM gavoobservation WHERE region=$1 AND seedning_id=$2`. Bara rader från
   den här körningen räknas, så en icke-tom katalog kan aldrig förvränga antalet.
3. Seedningen raderar ingenting. Enda `DELETE` i `server/gavokatalog.js` ligger i borttagningen
   av en enskild godkänd regel — en annan rutt.

Det som FAKTISKT måste vara noll före ett körprov är `gavoseedning`, så att ett `klar` från en
tidigare körning inte läses som den här körningens facit.

### Plattformsadmin i stagings databas

```sql
update users set is_platform_admin = true where email = '<din e-post>';
```

Ofarligt här. I produktionsdatabasen är samma åtgärd en rättighetshöjning som kräver MFA — se
`docs/SUPPORT_OPERATIONS.md`.

### Canary: rätt kardinalitet, fel innehåll

Kroppen bär **bara** `region` och `gifts`. Kontrolltalen och medlemskapsbeviset kommer ur
`server/seedningskontrakt.js` och får inte skickas med — en kropp som bär `forvantat` avvisas med
400.

```bash
node -e "const K=require('./server/seedningskontrakt').for('SE');const p=(id,n)=>({id,name:n,diamond_count:1,image:{url_list:['https://p16.example.invalid/'+id+'.png']}});const g=[];for(let i=0;i<K.unikaId;i++)g.push(p('canary-'+(30000+i),'G'+i));for(let i=0;i<K.poster-K.unikaId;i++)g.push(p('canary-'+(30000+i),'G'+i));console.log(JSON.stringify({region:'SE',gifts:g}))" > canary.json
```

783 poster, 779 unika id, 0 utan id — och fel innehåll. Förväntat: **422**, `fel:
"digest-stammer-inte"`.

**Det som faktiskt bevisar något är inte statuskoden utan att tomhetschecken ovan fortfarande ger
`0 / 0 / 0`.** 422 visar att svaret är rätt; noll rader visar att transaktionen rullade tillbaka.

### Riktig seedning

```sql
select region, status, antal_poster, antal_unika,
       forv_poster, forv_unika, forv_utan_id,
       kontrakt_digest = '7f5b53a17079709f8f625ee49b59c155e8a34b81af7b36c2dfeb380e8084fdff'
         as digest_matchar,
       klar_at
from gavoseedning order by klar_at desc nulls last limit 5;

select count(*) as observationer from gavoobservation where region = 'SE';
```

Förväntat: `status='klar'`, `antal_poster=783`, `antal_unika=779`, `forv_utan_id=0`,
`digest_matchar=true`, `klar_at` satt — och **779 observationer**, inte 783. De fyra dubbletterna
kollapsar, och `antal_unika` ska vara samma siffra.

`gavoseedning` har ingen `skapad_at`. Kolumnerna är `startad_at` och `klar_at`.

### Efteråt

Skala upp `vyra-tiktok-manager-staging` igen, och sätt tillbaka `is_platform_admin = false` om
miljön ska stå låst.

## Logga körningen

Fyra rader räcker, och de gör provet granskningsbart i efterhand:

- main-SHA som deployades
- staging-URL
- `gavoseedning.id` för körningen
- utfallet: canary 422 med noll skrivningar, riktig seedning 200 med `status='klar'` och antalen
