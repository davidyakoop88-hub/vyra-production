from pathlib import Path
import os
import subprocess
import sys

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / ".codex-video-tools"))
try:
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
except (ImportError, AttributeError):
    ffmpeg = str(Path(os.environ["LOCALAPPDATA"]) / "Programs" / "TikControl" / "resources" / "app.asar.unpacked" / "resources" / "ffmpeg" / "bin" / "ffmpeg.exe")
slug = sys.argv[1] if len(sys.argv) > 1 else "tap-neon-alpha"
fps = 60 if slug.startswith("pink-princess-") else 30
frames = ROOT / "assets" / "renders" / slug / "frame_%04d.png"
output = ROOT / "assets" / "videos" / f"{slug}.webm"

command = [
    ffmpeg,
    "-y",
    "-framerate", str(fps),
    "-i", str(frames),
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuva420p",
    "-crf", "24",
    "-b:v", "0",
    "-auto-alt-ref", "0",
    "-metadata:s:v:0", "alpha_mode=1",
    str(output),
]
subprocess.run(command, check=True)
print(output)
