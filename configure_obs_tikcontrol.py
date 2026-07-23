import json
import os
import shutil
import uuid
from pathlib import Path


config = Path(os.environ["APPDATA"]) / "obs-studio" / "basic" / "scenes" / "Namnlös.json"
backup = config.with_suffix(".json.codex-backup")
shutil.copy2(config, backup)

data = json.loads(config.read_text(encoding="utf-8-sig"))
scene = next(source for source in data["sources"] if source.get("name") == "tikcontrol-inspelning")

source_name = "TikControl skärminspelning"
monitor_id = r"\\?\DISPLAY#HPN345F#5&1df70d4&0&UID4357#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}"
existing = next((source for source in data["sources"] if source.get("name") == source_name), None)
if existing is None:
    source_uuid = str(uuid.uuid4())
    source = {
        "prev_ver": data.get("prev_ver", 536936450),
        "name": source_name,
        "uuid": source_uuid,
        "id": "monitor_capture",
        "versioned_id": "monitor_capture",
        "settings": {"monitor_id": monitor_id, "monitor": 0, "capture_cursor": True, "method": 0},
        "mixers": 0,
        "sync": 0,
        "flags": 0,
        "volume": 1.0,
        "balance": 0.5,
        "enabled": True,
        "muted": False,
        "push-to-mute": False,
        "push-to-mute-delay": 0,
        "push-to-talk": False,
        "push-to-talk-delay": 0,
        "hotkeys": {},
        "deinterlace_mode": 0,
        "deinterlace_field_order": 0,
        "monitoring_type": 0,
        "canvas_uuid": data.get("canvas_uuid", "6c69626f-6273-4c00-9d88-c5136d61696e"),
        "private_settings": {},
    }
    data["sources"].append(source)
else:
    source_uuid = existing["uuid"]
    existing.setdefault("settings", {}).update({
        "monitor_id": monitor_id,
        "monitor": 0,
        "capture_cursor": True,
        "method": 0,
    })

items = scene.setdefault("settings", {}).setdefault("items", [])
if not any(item.get("source_uuid") == source_uuid for item in items):
    next_id = max([item.get("id", 0) for item in items] + [0]) + 1
    items.append({
        "name": source_name,
        "source_uuid": source_uuid,
        "visible": True,
        "locked": False,
        "rot": 0.0,
        "scale_ref": {"x": 1920.0, "y": 1080.0},
        "align": 5,
        "bounds_type": 0,
        "bounds_align": 0,
        "bounds_crop": False,
        "crop_left": 0,
        "crop_top": 0,
        "crop_right": 0,
        "crop_bottom": 0,
        "id": next_id,
        "group_item_backup": False,
        "pos": {"x": 0.0, "y": 0.0},
        "pos_rel": {"x": -1.0, "y": -1.0},
        "scale": {"x": 1.0, "y": 1.0},
        "scale_rel": {"x": 1.0, "y": 1.0},
        "bounds": {"x": 0.0, "y": 0.0},
        "bounds_rel": {"x": 0.0, "y": 0.0},
        "scale_filter": "disable",
        "blend_method": "default",
        "blend_type": "normal",
        "show_transition": {"duration": 0},
        "hide_transition": {"duration": 0},
        "private_settings": {},
    })
    scene["settings"]["id_counter"] = max(scene["settings"].get("id_counter", 0), next_id)

data["current_scene"] = "tikcontrol-inspelning"
data["current_program_scene"] = "tikcontrol-inspelning"

temporary = config.with_suffix(".json.tmp")
temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
temporary.replace(config)
print("OBS scene configured")
