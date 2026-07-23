import bpy
import math
import random


ROOT = r"C:\Users\A\Documents\hemsidan"
OUT_BLEND = ROOT + r"\assets\blender\baroque-gold-tap.blend"
OUT_FRAMES = ROOT + r"\assets\renders\baroque-gold-tap\frame_"


def mat(name, color, metallic=0.0, roughness=0.35, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    if emission:
        p.inputs["Emission Color"].default_value = (*emission, 1)
        p.inputs["Emission Strength"].default_value = strength
    return m


def cube(name, loc, scale, material, bevel=0.12):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new("Soft carved edges", "BEVEL")
        mod.width = bevel
        mod.segments = 5
    o.data.materials.append(material)
    return o


def text_obj(text, loc, size, material, name):
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(90), 0, 0))
    o = bpy.context.object
    o.name = name
    o.data.body = text
    o.data.align_x = "CENTER"
    o.data.align_y = "CENTER"
    o.data.extrude = 0.16
    o.data.bevel_depth = 0.035
    o.data.bevel_resolution = 5
    o.data.size = size
    o.data.materials.append(material)
    return o


def key(obj, frame, location=None, rotation=None, scale=None):
    if location is not None:
        obj.location = location
        obj.keyframe_insert("location", frame=frame)
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert("rotation_euler", frame=frame)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert("scale", frame=frame)


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
random.seed(27)

gold = mat("Antique polished gold", (0.62, 0.19, 0.018), 0.92, 0.18)
bright_gold = mat("Bright gold glow", (1.0, 0.43, 0.025), 0.75, 0.16, (1.0, 0.18, 0.01), 2.5)
velvet = mat("Burgundy velvet", (0.095, 0.002, 0.008), 0.05, 0.5)
velvet_hi = mat("Velvet ornaments", (0.3, 0.004, 0.016), 0.22, 0.32)
pink = mat("Button pink", (0.8, 0.005, 0.16), 0.5, 0.18, (1.0, 0.0, 0.15), 7)
skin = mat("Warm skin", (0.75, 0.29, 0.15), 0.0, 0.42)
sleeve_mat = mat("Black sleeve", (0.008, 0.006, 0.012), 0.15, 0.28)
spark_mat = mat("Gold sparks", (1.0, 0.5, 0.05), 0.3, 0.14, (1.0, 0.2, 0.01), 12)

# Entire card is parented so its entrance feels like one premium product.
bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
card = bpy.context.object
card.name = "Baroque Gold Tap Card"

panel = cube("Velvet card", (0, 0.18, 0), (3.15, 0.28, 3.85), velvet, 0.35)
panel.parent = card
inner = cube("Raised velvet inset", (0, -0.18, 0), (2.78, 0.12, 3.48), velvet_hi, 0.3)
inner.parent = card

# Layered frame bars and corner medallions.
for name, loc, scale in [
    ("Frame top", (0, -0.42, 3.55), (2.75, 0.13, 0.12)),
    ("Frame bottom", (0, -0.42, -3.55), (2.75, 0.13, 0.12)),
    ("Frame left", (-2.85, -0.42, 0), (0.12, 0.13, 3.35)),
    ("Frame right", (2.85, -0.42, 0), (0.12, 0.13, 3.35)),
]:
    cube(name, loc, scale, gold, 0.08).parent = card

for sx in (-1, 1):
    for sz in (-1, 1):
        for n, radius in enumerate((0.38, 0.26, 0.14)):
            bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.055,
                                            major_segments=48, minor_segments=10,
                                            location=(sx * (2.72 - n * 0.12), -0.55, sz * (3.38 - n * 0.12)),
                                            rotation=(math.radians(90), 0, 0))
            bpy.context.object.data.materials.append(bright_gold if n == 2 else gold)
            bpy.context.object.parent = card

# Crown with five points.
crown_parts = []
crown_parts.append(cube("Crown base", (0, -0.68, 2.82), (0.95, 0.12, 0.14), gold, 0.08))
for i, x in enumerate((-0.72, -0.36, 0, 0.36, 0.72)):
    h = 0.72 if i == 2 else (0.55 if i in (1, 3) else 0.38)
    part = cube(f"Crown point {i}", (x, -0.68, 3.08 + h / 2), (0.09, 0.1, h / 2), gold, 0.055)
    part.rotation_euler.y = math.radians(-x * 16)
    crown_parts.append(part)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.12, location=(x, -0.7, 3.08 + h))
    gem = bpy.context.object
    gem.data.materials.append(pink if i == 2 else bright_gold)
    crown_parts.append(gem)
for o in crown_parts:
    o.parent = card

tap1 = text_obj("TAP", (0, -0.72, 1.28), 1.62, bright_gold, "Gold TAP top")
tap2 = text_obj("TAP", (0, -0.72, -0.1), 1.62, bright_gold, "Gold TAP bottom")
tap1.parent = card
tap2.parent = card

# Circular button and concentric illuminated trim.
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.72, depth=0.24,
                                    location=(0, -0.72, -2.18), rotation=(math.radians(90), 0, 0))
button = bpy.context.object
button.name = "Tap button"
button.data.materials.append(pink)
button.parent = card
for r in (0.86, 1.02):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.055, major_segments=96,
                                    minor_segments=12, location=(0, -0.86, -2.18),
                                    rotation=(math.radians(90), 0, 0))
    bpy.context.object.data.materials.append(bright_gold)
    bpy.context.object.parent = card

# Decorative side scrollwork.
for side in (-1, 1):
    for z in (-1.8, 0.0, 1.8):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.28, minor_radius=0.055, major_segments=48,
                                        minor_segments=9, location=(side * 2.56, -0.56, z),
                                        rotation=(math.radians(90), 0, 0))
        scroll = bpy.context.object
        scroll.scale.x = 0.68
        scroll.data.materials.append(gold)
        scroll.parent = card

# Card entrance animation.
key(card, 1, (0, 0, -0.7), (0, 0, math.radians(-10)), (0.02, 0.02, 0.02))
key(card, 26, (0, 0, 0.1), (0, 0, math.radians(2)), (1.04, 1.04, 1.04))
key(card, 36, (0, 0, 0), (0, 0, 0), (1, 1, 1))
key(card, 108, (0, 0, 0), (0, 0, 0), (1, 1, 1))
key(card, 120, (0, 0, 0.5), (0, 0, math.radians(7)), (0.02, 0.02, 0.02))

# Button pulse.
key(button, 42, scale=(1, 1, 1))
key(button, 52, scale=(1.16, 1.16, 1.16))
key(button, 62, scale=(1, 1, 1))
key(button, 76, scale=(1, 1, 1))
key(button, 82, scale=(0.84, 0.84, 0.84))
key(button, 88, scale=(1.08, 1.08, 1.08))
key(button, 94, scale=(1, 1, 1))

# Stylized hand: palm, sleeve, thumb and index finger, all parented to one controller.
bpy.ops.object.empty_add(type="PLAIN_AXES")
hand = bpy.context.object
hand.name = "Animated tapping hand"

bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=(1.72, -1.1, -2.65))
palm = bpy.context.object
palm.scale = (0.72, 0.28, 0.9)
palm.data.materials.append(skin)
palm.parent = hand

bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.3, depth=1.65,
                                    location=(0.75, -1.08, -2.02), rotation=(0, math.radians(56), 0))
finger = bpy.context.object
finger.scale.y = 0.75
finger.data.materials.append(skin)
finger.parent = hand

bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=(0.05, -1.08, -1.58))
tip = bpy.context.object
tip.scale = (0.32, 0.24, 0.32)
tip.data.materials.append(skin)
tip.parent = hand

bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.72, depth=1.7,
                                    location=(2.28, -0.96, -3.62), rotation=(0, math.radians(-20), 0))
sleeve = bpy.context.object
sleeve.scale.y = 0.65
sleeve.data.materials.append(sleeve_mat)
sleeve.parent = hand

key(hand, 1, (4.8, 0, -3.8), scale=(0.7, 0.7, 0.7))
key(hand, 66, (4.8, 0, -3.8), scale=(0.7, 0.7, 0.7))
key(hand, 78, (0.28, 0, 0.05), rotation=(0, 0, math.radians(-3)), scale=(1, 1, 1))
key(hand, 84, (-0.1, 0, -0.2), rotation=(0, 0, math.radians(-6)), scale=(1, 1, 1))
key(hand, 91, (0.35, 0, 0.12), rotation=(0, 0, 0), scale=(1, 1, 1))
key(hand, 106, (4.8, 0, -3.8), scale=(0.72, 0.72, 0.72))

# Sparkles around the frame, strongest after the tap.
for i in range(60):
    angle = random.uniform(0, math.tau)
    radius = random.uniform(3.0, 4.8)
    x = math.cos(angle) * radius
    z = math.sin(angle) * radius * 0.82
    start = random.randint(12, 72)
    if i > 35:
        start = random.randint(82, 94)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=random.uniform(0.025, 0.095),
                                        location=(x, -0.95, z))
    s = bpy.context.object
    s.name = f"Gold sparkle {i:02d}"
    s.data.materials.append(spark_mat)
    key(s, start, scale=(0, 0, 0))
    key(s, start + 5, scale=(1, 1, 1))
    key(s, start + 13, scale=(0, 0, 0))

# Lighting and camera.
bpy.ops.object.light_add(type="AREA", location=(-3.5, -5, 4.8))
bpy.context.object.data.energy = 1000
bpy.context.object.data.color = (1.0, 0.3, 0.04)
bpy.context.object.data.size = 4
bpy.context.object.rotation_euler.x = math.radians(28)

bpy.ops.object.light_add(type="AREA", location=(4.0, -4, 1.0))
bpy.context.object.data.energy = 780
bpy.context.object.data.color = (1.0, 0.02, 0.16)
bpy.context.object.data.size = 3

bpy.ops.object.camera_add(location=(0, -16.5, 0), rotation=(math.radians(90), 0, 0))
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 10.2
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 120
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 720
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.filepath = OUT_FRAMES
scene.view_settings.look = "AgX - Medium High Contrast"

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.render.render(animation=True)
print("RENDER_COMPLETE", OUT_FRAMES)
