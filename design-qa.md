# MVP motion design QA

final result: blocked

Source visual truth: user attachments `ChatGPT Image 20 juli 2026 22_01_35.png`
(1672×941) and `exec-7b4be4fc-9ea0-4632-9801-f14cf866af15.png` (1672×941).
Scope: motion/effects of the six existing MVP frames, not replacement frames or
addition of gift names, quantities, or scores from the reference boards.

Implementation: cloud-browser review of the actual production renderer/CSS,
1363×936 viewport, 400 px widget, 9 second timeline. Draft preview is served
with the same files through an isolated test page; full Studio integration is
also covered by the repository browser tests.

Comparison history:
- V1: entrance crystal/petal sprites were too small compared with the reference
  effects. Increased motif sizes and kept the tribute quiet.
- V1: portal particles travelled through linear waypoints. Replaced the launch
  field with a continuous ellipse and opposing frame rotation.
- V2: captured `mvp-portal-entrance-v2.jpg` and `mvp-rose-exit-v2.jpg` after fixes.

Pending: final combined reference/implementation comparison, full Studio browser
checks, size checks and refreshed CI visual references. No readiness claim yet.
