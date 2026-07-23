from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parents[1] / ".codex-video-tools"))
import cv2
import numpy as np


VIDEOS = [
    Path(r"C:\Users\A\Downloads\7x0t29.mp4"),
    Path(r"C:\Users\A\Desktop\tiktok\FullSizeRender (35).mov"),
    Path(r"C:\Users\A\Desktop\tiktok\FullSizeRender (37).mov"),
]

out_dir = Path("reference_frames")
out_dir.mkdir(exist_ok=True)

for index, video in enumerate(VIDEOS, start=1):
    cap = cv2.VideoCapture(str(video))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = frame_count / fps if fps else 0

    samples = []
    for sample_index, fraction in enumerate(np.linspace(0, 1, 9)):
        frame_number = min(frame_count - 1, int(fraction * max(frame_count - 1, 0)))
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ok, frame = cap.read()
        if not ok:
            continue
        target_width = 320
        target_height = max(1, round(frame.shape[0] * target_width / frame.shape[1]))
        frame = cv2.resize(frame, (target_width, target_height))
        label = f"{frame_number / fps:.2f}s"
        cv2.rectangle(frame, (0, 0), (95, 25), (0, 0, 0), -1)
        cv2.putText(frame, label, (7, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
        samples.append(frame)

    if samples:
        row_height = max(frame.shape[0] for frame in samples)
        rows = []
        for start in range(0, len(samples), 3):
            row = samples[start:start + 3]
            while len(row) < 3:
                row.append(np.zeros_like(samples[0]))
            rows.append(cv2.hconcat(row))
        sheet = cv2.vconcat(rows)
        cv2.imwrite(str(out_dir / f"reference_{index}_contact_sheet.png"), sheet)

    print(f"{index}: {video.name} | {width}x{height} | {fps:.3f} fps | {duration:.2f}s | {frame_count} frames")
    cap.release()
