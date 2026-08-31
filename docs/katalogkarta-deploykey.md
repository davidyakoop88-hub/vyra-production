# Kartjobbets deploy key

Sanningens karta genereras av CI och pushas till `main`. Den här filen beskriver **hur pushen får
ske** när `main` har obligatoriska statuskontroller.

## Varför en deploy key

`GITHUB_TOKEN` kan inte pusha till en gren med obligatoriska kontroller. Kartjobbet pushar *efter*
att kontrollerna redan kört, så det hade dött tyst den dag kravet slogs på.

Tre vägar utreddes. Deploy key valdes:

| väg | kostnad |
|---|---|
| **Deploy key + `bypass_actors`** | en credential, bunden till detta repo |
| Egen gren för kartan | ingen credential — men `docs/katalogkarta.md` lämnar `main` |
| PR-vägen | kräver PAT, plus PR-stapling, auto-merge och en ny fråga om `[skip ci]` |

Det avgörande: bypass-aktören är **en deploy key, inte rollen Write**. Repoägaren har Write och
bypassar alltså inte sitt eget krav. Nyckeln är en credential ingen bär i fickan, till ett enda
repo, utan koppling till något användarkonto.

`actor_type: "DeployKey"` är provat mot API:t på ett användarägt repo och accepteras.

## Ordningen spelar roll

Slås kravet på **innan** nyckeln finns är kartjobbet dött tills den läggs upp. Gör stegen i den här
ordningen:

### 1 · Skapa nyckelparet

```bash
ssh-keygen -t ed25519 -C "katalogkarta-bot" -f katalogkarta_key -N ""
```

### 2 · Lägg upp den publika halvan som deploy key

Repo → Settings → Deploy keys → Add deploy key. **Kryssa i "Allow write access"** — utan den kan
nyckeln läsa men inte pusha. Klistra in innehållet i `katalogkarta_key.pub`.

### 3 · Lägg upp den privata halvan som secret

Repo → Settings → Secrets and variables → Actions → New repository secret.
Namn: **`KATALOGKARTA_DEPLOY_KEY`**. Värde: hela innehållet i `katalogkarta_key`, inklusive
`-----BEGIN`- och `-----END`-raderna.

Radera sedan båda lokala filerna.

### 4 · Verifiera innan kravet slås på

Pusha något till `main` och se att jobbet `katalogkarta` blir grönt. Saknas secreten faller det på
förhandsgrinden med en mening som namnger exakt vad som saknas — inte med ett SSH-fel.

### 5 · Först nu: slå på kravet

Rulesetet är `21467306`. Lägg till `required_status_checks` med de sju kontexterna, och
deploy key:n som bypass-aktör:

```jsonc
{
  "bypass_actors": [
    { "actor_id": <deploy key-id>, "actor_type": "DeployKey", "bypass_mode": "always" }
  ],
  "rules": [
    { "type": "required_status_checks", "parameters": { "required_status_checks": [
      { "context": "test" }, { "context": "test-client" }, { "context": "test-tiktok-bridge" },
      { "context": "caddy" }, { "context": "goal-runtime" },
      { "context": "windows-installer" }, { "context": "dependency-review" }
    ], "strict_required_status_checks_policy": false } }
  ]
}
```

`katalogkarta` ska **inte** vara en obligatorisk kontroll — den skippas på PR:er och skulle blockera
varje merge.

## Följd att känna till

En deploy-key-push **triggar workflows**; en `GITHUB_TOKEN`-push gör det inte. Därmed går
`[skip ci]` i kartans commitmeddelande från bärsele till bärande — utan den startar varje kartpush
ett nytt CI-varv. Inget kretslopp, eftersom andra varvet ser "kartan är oförändrad", men ett helt
varv slösat per push. `tests/katalogkarta-leverans.test.js` låter den inte försvinna.
