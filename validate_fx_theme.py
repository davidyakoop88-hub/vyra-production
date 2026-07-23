from __future__ import annotations
import json
import sys
from pathlib import Path
from PIL import Image

REQUIRED = ("main", "platform", "smoke", "diamonds", "hearts", "lightning", "glow")

def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)

def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: validate_fx_theme.py <theme-directory>")
    root = Path(sys.argv[1])
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        fail("manifest.json saknas")
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    layers = data.get("layers", {})
    for key in REQUIRED:
        if key not in layers:
            fail(f"lager saknas i manifest: {key}")
        path = root / layers[key]
        if not path.is_file():
            fail(f"fil saknas: {path.name}")
        with Image.open(path) as image:
            if image.format != "PNG" or image.mode != "RGBA":
                fail(f"{path.name} måste vara RGBA PNG")
            if image.width < 2048 or image.height < 2048:
                fail(f"{path.name} är {image.width}×{image.height}; minst 2048×2048 krävs")
            alpha = image.getchannel("A")
            corners = (alpha.getpixel((0, 0)), alpha.getpixel((image.width-1, 0)), alpha.getpixel((0, image.height-1)), alpha.getpixel((image.width-1, image.height-1)))
            if any(corners):
                fail(f"{path.name} har icke-transparenta hörn: {corners}")
            if alpha.getbbox() is None:
                fail(f"{path.name} är helt tom")
            print(f"OK: {path.name} · {image.width}×{image.height} · RGBA")
    print("THEME READY")

if __name__ == "__main__":
    main()
