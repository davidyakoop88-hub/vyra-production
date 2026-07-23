# VYRA Theme SDK

Varje temamapp måste innehålla `manifest.json` och tio transparenta PNG-lager:

`x2-main.png`, `x3-main.png`, `tap-main.png`, `glove-main.png`, `platform.png`, `smoke.png`, `diamonds.png`, `hearts.png`, `lightning.png`, `particles.png`.

Alla lager är utbytbara master-assets. Animation, timing och triggers ligger i FX Engine och återanvänds mellan teman.

Validera ett tema:

```powershell
py -3.13 tools/theme_validator.py assets/themes/pink-princess
```

Placeholders är märkta `DEV PLACEHOLDER` och får ersättas fil för fil utan kodändring.
