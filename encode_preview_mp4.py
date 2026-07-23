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
slug = sys.argv[1] if len(sys.argv) > 1 else "royal-dragon-tap"
fps = 60 if slug.startswith("pink-princess-") else 30
frames = ROOT / "assets" / "renders" / slug / "frame_%04d.png"
output = ROOT / "assets" / "videos" / f"{slug}-preview.mp4"
frame_count = len(list((ROOT / "assets" / "renders" / slug).glob("frame_*.png")))
if frame_count == 0:
    raise SystemExit(f"No rendered frames found for {slug}")
duration = frame_count / fps

command = [
    ffmpeg,
    "-y",
    "-f", "lavfi",
    "-i", f"color=c=#160814:s=540x960:r={fps}:d={duration}",
    "-framerate", str(fps),
    "-i", str(frames),
    "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p",
    "-t", str(duration),
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-movflags", "+faststart",
    str(output),
]
subprocess.run(command, check=True)
print(output)
