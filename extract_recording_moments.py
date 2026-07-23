from pathlib import Path
import sys

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / ".codex-video-tools"))
import cv2

video = Path(sys.argv[1])
times = [12.9, 17.2, 21.5, 34.5, 38.8, 51.7, 56.0, 60.3, 64.6, 68.9, 86.2, 94.8]
out = ROOT / "reference_frames" / "tikcontrol_moments"
out.mkdir(parents=True, exist_ok=True)

cap = cv2.VideoCapture(str(video))
for seconds in times:
    cap.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000)
    ok, frame = cap.read()
    if ok:
        cv2.imwrite(str(out / f"moment_{seconds:05.1f}.png"), frame)
cap.release()
print(out)
