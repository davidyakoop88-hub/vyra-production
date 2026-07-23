from pathlib import Path
import sys

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / ".codex-video-tools"))
import cv2
import numpy as np

video = Path(sys.argv[1])
output = ROOT / "reference_frames" / "tikcontrol_walkthrough.png"
cap = cv2.VideoCapture(str(video))
count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
fps = cap.get(cv2.CAP_PROP_FPS) or 30
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
duration = count / fps

frames = []
for fraction in np.linspace(0, 1, 25):
    number = min(count - 1, int(fraction * max(count - 1, 0)))
    cap.set(cv2.CAP_PROP_POS_FRAMES, number)
    ok, frame = cap.read()
    if not ok:
        continue
    target_width = 384
    target_height = round(frame.shape[0] * target_width / frame.shape[1])
    frame = cv2.resize(frame, (target_width, target_height))
    timestamp = number / fps
    cv2.rectangle(frame, (0, 0), (110, 25), (0, 0, 0), -1)
    cv2.putText(frame, f"{timestamp:.1f}s", (7, 18), cv2.FONT_HERSHEY_SIMPLEX,
                0.55, (255, 255, 255), 1, cv2.LINE_AA)
    frames.append(frame)

rows = []
for start in range(0, len(frames), 5):
    row = frames[start:start + 5]
    while len(row) < 5:
        row.append(np.zeros_like(frames[0]))
    rows.append(cv2.hconcat(row))
sheet = cv2.vconcat(rows)
cv2.imwrite(str(output), sheet)
cap.release()
print(f"{width}x{height} | {fps:.3f} fps | {duration:.2f}s | {count} frames")
print(output)
