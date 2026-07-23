import bpy
import os

video = r"C:\Users\A\Downloads\kling_20260714_VIDEO_Create_a_v_913_0.mp4"
out_dir = r"C:\Users\A\Documents\hemsidan\video-review"
os.makedirs(out_dir, exist_ok=True)

scene = bpy.context.scene
scene.sequence_editor_create()
strip = scene.sequence_editor.strips.new_movie("review", video, channel=1, frame_start=1)
scene.render.resolution_x = strip.elements[0].orig_width
scene.render.resolution_y = strip.elements[0].orig_height
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False

duration = strip.frame_final_duration
frames = sorted(set([1, max(1, duration // 4), max(1, duration // 2), max(1, duration * 3 // 4), duration]))
for index, frame in enumerate(frames, 1):
    scene.frame_set(frame)
    scene.render.filepath = os.path.join(out_dir, f"frame-{index}.png")
    bpy.ops.render.render(write_still=True)

print(f"SIZE={scene.render.resolution_x}x{scene.render.resolution_y} DURATION_FRAMES={duration} FPS={scene.render.fps}")
