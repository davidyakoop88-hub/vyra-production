# Licenser för VYRA:s egna röster

VYRA:s egna text-till-tal-röster (märkta **VYRA-röst** i röstlistan) körs på VYRA:s server med den
öppna talmotorn [Piper](https://github.com/OHF-Voice/piper1-gpl) (GPL-3.0, körs som tjänst på
servern och distribueras inte). Rösterna hämtas från
[rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) på commit
`e9ab671f2a0e50a701b34361136ba3e6a3a9eb0c`, med kontrollsummor i `server/piper-roster.txt`.

VYRA är en betaltjänst, så **bara röster vars data tillåter kommersiell användning** finns med.
Kontrollerat mot varje rösts modellkort 2026-11-16.

| Röst i VYRA | Modell | Språk | Data och licens |
|---|---|---|---|
| NST | `sv_SE-nst-medium` | Svenska | Språkbanken, Nasjonalbiblioteket (`oai-nb-no-sbr-17`) — **CC0** |
| Alma | `sv_SE-alma-medium` | Svenska | NST Swedish TTS Dataset, Språkbanken — **CC BY 4.0** |
| Kristin | `en_US-kristin-medium` | Engelska (USA) | Inspelningar från LibriVox — **public domain** |
| Cori (USA) | `en_US-hifi_tts_92-medium` | Engelska (USA) | Hi-Fi Multi-Speaker English TTS Dataset, NVIDIA (OpenSLR 109), läsare Cori Samuel — **CC BY 4.0** |
| Cori | `en_GB-cori-medium` | Engelska (Storbritannien) | Hi-Fi Multi-Speaker English TTS Dataset, NVIDIA (OpenSLR 109), läsare Cori Samuel — **CC BY 4.0** |
| John | `en_US-john-medium` | Engelska (USA) | Inspelningar från LibriVox — **public domain** |
| Bryce | `en_US-bryce-medium` | Engelska (USA) | Röstskaparens egna inspelningar — **public domain** |

**Namnangivelse (CC BY 4.0):** Alma bygger på NST Swedish TTS Dataset från Språkbanken vid
Nasjonalbiblioteket. Cori och Cori (USA) bygger på Hi-Fi Multi-Speaker English TTS Dataset från
NVIDIA, inläst av Cori Samuel för LibriVox. Licens: https://creativecommons.org/licenses/by/4.0/

## Medvetet utelämnade

- **Alla röster som bygger på "lessac"** (bl.a. `en_US-lessac-*`, `en_GB-vctk-medium`,
  `en_US-libritts_r-medium`, `en_US-hfc_male-medium`): lessac-datan har en licens som inte tillåter
  kommersiell användning, och de stora flerröstpaketen vctk (109 röster) och libritts (904 röster)
  är finjusterade från den.
- **Hi-Fi Captain** (`en_US-hfc_female-medium`, `en_US-hfc_male-medium`): CC BY-NC-SA 4.0.
- **Lisa** (`sv_SE-lisa-medium`): modellkortet anger ingen licens.

Ska en röst läggas till: läs modellkortet, kontrollera både datan och modellen den finjusterats
från, och lägg den här — med licens — i samma ändring.
