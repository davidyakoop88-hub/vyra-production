from __future__ import annotations
import json, sys
from pathlib import Path
from PIL import Image

def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: theme_validator.py assets/themes/<theme>"); return 2
    root=Path(sys.argv[1]); schema_path=root.parent/"theme.schema.json"
    if not schema_path.exists():
        print("FAIL schema: theme.schema.json saknas"); return 1
    schema=json.loads(schema_path.read_text(encoding="utf-8")); missing=[]; invalid=[]
    manifest=root/"manifest.json"
    manifest_data={}
    if not manifest.exists(): missing.append("manifest.json")
    else:
        manifest_data=json.loads(manifest.read_text(encoding="utf-8"))
        if manifest_data.get("placeholder") is True:
            invalid.append("manifest.json: theme contains DEV PLACEHOLDER assets")
    for filename in schema["requiredLayers"]:
        path=root/filename
        if not path.exists(): missing.append(filename); continue
        try:
            with Image.open(path) as image:
                if image.format!="PNG" or image.mode!="RGBA": invalid.append(f"{filename}: måste vara RGBA PNG")
                if min(image.size)<schema["minimumSize"]: invalid.append(f"{filename}: {image.width}×{image.height}, minst {schema['minimumSize']}×{schema['minimumSize']}")
                if image.mode=="RGBA":
                    a=image.getchannel("A"); corners=(a.getpixel((0,0)),a.getpixel((image.width-1,0)),a.getpixel((0,image.height-1)),a.getpixel((image.width-1,image.height-1)))
                    if any(corners): invalid.append(f"{filename}: hörnen är inte transparenta {corners}")
                    if a.getbbox() is None: invalid.append(f"{filename}: lagret är helt tomt")
        except Exception as exc: invalid.append(f"{filename}: {exc}")
    for item in missing: print(f"MISSING: {item}")
    for item in invalid: print(f"INVALID: {item}")
    if missing or invalid:
        print(f"THEME NOT READY · missing={len(missing)} invalid={len(invalid)}"); return 1
    print(f"THEME READY · {root.name} · {len(schema['requiredLayers'])} lager"); return 0

if __name__=="__main__": raise SystemExit(main())
