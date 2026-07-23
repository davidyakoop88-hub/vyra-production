import bpy
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(r"C:\Users\A\Documents\hemsidan")
STAGE = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "x2"
FRAMES = 180
FPS = 60


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def mat(name, color, metallic=0, rough=.25, emission=None, strength=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = rough
    if emission:
        p.inputs["Emission Color"].default_value = (*emission, 1)
        p.inputs["Emission Strength"].default_value = strength
    return m


def key(o, frame, scale=None, loc=None, rot=None):
    if scale is not None:
        o.scale = scale
        o.keyframe_insert("scale", frame=frame)
    if loc is not None:
        o.location = loc
        o.keyframe_insert("location", frame=frame)
    if rot is not None:
        o.rotation_euler = rot
        o.keyframe_insert("rotation_euler", frame=frame)


def text(body, z, size=3.2, depth=.30):
    bpy.ops.object.text_add(location=(0, 0, z), rotation=(math.pi / 2, 0, 0))
    o = bpy.context.object
    o.data.body = body
    o.data.align_x = "CENTER"
    o.data.align_y = "CENTER"
    o.data.size = size
    o.data.extrude = depth
    o.data.bevel_depth = .075
    o.data.bevel_resolution = 5
    o.data.materials.append(pink_metal)
    o.data.materials.append(gold)
    return o


def cube(name, loc, scale, material, bevel=.15):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    b = o.modifiers.new("Luxury bevel", "BEVEL")
    b.width = bevel
    b.segments = 5
    o.data.materials.append(material)
    return o


def platform():
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=3.0, depth=.42, location=(0, .45, -3.0), rotation=(math.pi / 2, 0, 0))
    p = bpy.context.object
    p.data.materials.append(dark_pink)
    for radius, minor, material in [(3.0, .09, gold), (2.55, .07, glow), (1.8, .045, white)]:
        bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=minor, major_segments=96, minor_segments=12, location=(0, -.12, -3.0), rotation=(math.pi / 2, 0, 0))
        r = bpy.context.object
        r.data.materials.append(material)
        key(r, 1, scale=(.02, .02, .02))
        key(r, 42, scale=(1.1, 1.1, 1.1))
        key(r, 58, scale=(1, 1, 1))
        key(r, 140, scale=(1, 1, 1))
        key(r, 178, scale=(.02, .02, .02))
    key(p, 1, scale=(.02, .02, .02))
    key(p, 40, scale=(1.1, 1.1, 1.1))
    key(p, 56, scale=(1, 1, 1))
    key(p, 150, scale=(1, 1, 1))
    key(p, 180, scale=(.02, .02, .02))


def heart(i):
    x = random.uniform(-4.2, 4.2)
    z = random.uniform(-3.4, 4.6)
    bpy.ops.object.text_add(location=(x, random.uniform(-.6, .4), z), rotation=(math.pi / 2, 0, random.uniform(-.5, .5)))
    o = bpy.context.object
    o.data.body = "♥"
    o.data.align_x = "CENTER"
    o.data.align_y = "CENTER"
    o.data.size = random.uniform(.28, .8)
    o.data.extrude = .08
    o.data.bevel_depth = .025
    o.data.materials.append(glow if i % 3 else white)
    start = random.randint(8, 105)
    key(o, start, scale=(0, 0, 0), loc=(x, o.location.y, z - .4))
    key(o, start + 12, scale=(1.18, 1.18, 1.18), loc=(x, o.location.y, z))
    key(o, start + 22, scale=(1, 1, 1))
    key(o, min(178, start + 62), scale=(0, 0, 0), loc=(x + random.uniform(-.5, .5), o.location.y, z + 1.6))


def diamond(i):
    x = random.uniform(-4.4, 4.4)
    z = random.uniform(-3.1, 4.7)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=random.uniform(.13, .38), location=(x, random.uniform(-.5, .25), z))
    o = bpy.context.object
    o.scale = (1, .55, 1.35)
    o.data.materials.append(gem)
    start = random.randint(16, 108)
    key(o, start, scale=(0, 0, 0), rot=(0, 0, 0))
    key(o, start + 10, scale=(1, .55, 1.35), rot=(0, 1.2, .5))
    key(o, min(178, start + 52), scale=(0, 0, 0), rot=(1.5, 3.5, 2.0))


def lightning(i):
    curve = bpy.data.curves.new(f"Lightning {i}", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = .025 if STAGE != "glove" else .04
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(5)
    x = random.uniform(-4, 4)
    z = random.uniform(-2, 4.5)
    for j, p in enumerate(spline.points):
        p.co = (x + random.uniform(-.45, .45), .18, z - j * .65, 1)
    o = bpy.data.objects.new(f"Lightning {i}", curve)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(white)
    start = random.randint(48, 122)
    key(o, start, scale=(0, 0, 0))
    key(o, start + 2, scale=(1, 1, 1))
    key(o, start + 7, scale=(0, 0, 0))


def make_tap():
    phone = cube("Pink phone", (0, .5, .1), (2.65, .45, 4.45), black, .42)
    screen = cube("Screen", (0, -.02, .1), (2.35, .08, 4.08), dark_pink, .28)
    t1 = text("TAP", 1.6, 2.0)
    t2 = text("TAP", -.3, 2.0)
    for o in (phone, screen, t1, t2):
        key(o, 1, scale=(.02, .02, .02), rot=(0, 0, -.18))
        key(o, 38, scale=(1.08, 1.08, 1.08), rot=(0, 0, .03))
        key(o, 52, scale=(1, 1, 1), rot=(0, 0, 0))
        key(o, 150, scale=(1, 1, 1))
        key(o, 180, scale=(.02, .02, .02), rot=(0, 0, .22))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, location=(1.15, -1.1, -2.25))
    finger = bpy.context.object
    finger.scale = (.48, .34, 1.8)
    finger.rotation_euler.y = -.72
    finger.data.materials.append(skin)
    key(finger, 1, loc=(6, -1.1, -4), scale=(.48, .34, 1.8))
    key(finger, 72, loc=(1.45, -1.1, -2.0))
    key(finger, 84, loc=(.8, -1.1, -2.65))
    key(finger, 96, loc=(1.45, -1.1, -2.0))
    key(finger, 110, loc=(.8, -1.1, -2.65))
    key(finger, 126, loc=(1.45, -1.1, -2.0))
    key(finger, 180, loc=(6, -1.1, -4))
    platform()


def make_multiplier(label):
    hero = text(label, .15, 4.6 if label == "X2" else 4.8, .42)
    key(hero, 1, scale=(.01, .01, .01), rot=(math.pi / 2, -.5, -.35))
    key(hero, 38, scale=(1.28, 1.28, 1.28), rot=(math.pi / 2, .1, .08))
    key(hero, 56, scale=(1, 1, 1), rot=(math.pi / 2, 0, 0))
    for f in (82, 112, 138):
        key(hero, f, scale=(1, 1, 1))
        key(hero, f + 5, scale=(1.1, 1.1, 1.1))
        key(hero, f + 11, scale=(1, 1, 1))
    key(hero, 154, scale=(1, 1, 1))
    key(hero, 180, scale=(.01, .01, .01), rot=(math.pi / 2, .5, .35))
    platform()


def make_glove():
    bpy.ops.object.empty_add(type="PLAIN_AXES")
    root = bpy.context.object
    root.rotation_euler = (0, -.15, -.35)
    for loc, scale in [((0, 0, .5), (2.2, .9, 2.3)), ((-1.5, 0, 1.45), (1.35, .85, 1.45)), ((0, 0, -1.75), (1.7, .9, 1.0))]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=loc)
        o = bpy.context.object
        o.scale = scale
        o.data.materials.append(pink_metal)
        o.parent = root
    cuff = cube("Black gold cuff", (0, 0, -2.55), (1.75, .9, .72), black, .25)
    cuff.data.materials.append(gold)
    cuff.parent = root
    crown = text("♛", 3.05, 1.35, .18)
    crown.data.materials.clear()
    crown.data.materials.append(gold)
    crown.parent = root
    key(root, 1, scale=(.01, .01, .01), loc=(5, 0, -5), rot=(0, -.5, -.8))
    key(root, 44, scale=(1.2, 1.2, 1.2), loc=(0, 0, 0), rot=(0, -.15, -.28))
    key(root, 62, scale=(1, 1, 1), rot=(0, -.15, -.35))
    key(root, 92, scale=(1, 1, 1), rot=(0, -.15, -.35))
    key(root, 104, scale=(1.35, 1.35, 1.35), rot=(0, .05, -.05))
    key(root, 118, scale=(1, 1, 1), rot=(0, -.15, -.35))
    key(root, 150, scale=(1, 1, 1), loc=(0, 0, 0), rot=(0, -.15, -.35))
    key(root, 180, scale=(.01, .01, .01), loc=(-5, 0, 5), rot=(0, .5, .8))


clear()
random.seed({"tap": 11, "x2": 22, "x3": 33, "glove": 44}[STAGE])
pink_metal = mat("Quilted pink chrome", (.82, .025, .22), .82, .14)
dark_pink = mat("Deep magenta", (.22, .002, .055), .55, .2)
gold = mat("Royal gold", (.95, .36, .035), .95, .12)
black = mat("Patent black", (.008, .003, .012), .75, .12)
glow = mat("Hot pink energy", (.95, .01, .25), .2, .18, (1, .0, .22), 9)
white = mat("White pink flash", (1, .72, .86), .1, .14, (1, .15, .45), 15)
gem = mat("Pink diamond", (1, .05, .4), .5, .08, (1, .01, .25), 5)
skin = mat("Soft skin", (1, .48, .3), 0, .45)

{"tap": make_tap, "x2": lambda: make_multiplier("X2"), "x3": lambda: make_multiplier("X3"), "glove": make_glove}[STAGE]()
for i in range(34 if STAGE != "glove" else 50):
    heart(i)
for i in range(22 if STAGE == "tap" else 34):
    diamond(i)
for i in range(8 if STAGE == "tap" else 15):
    lightning(i)

for loc, color, energy in [((-4, -6, 5), (1, .01, .18), 1100), ((4, -5, 1), (.45, .01, 1), 850), ((0, -4, -4), (1, .2, .02), 700)]:
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.object
    l.data.energy = energy
    l.data.color = color
    l.data.size = 5

bpy.ops.object.camera_add(location=(0, -19, .25), rotation=(math.pi / 2, 0, 0))
cam = bpy.context.object
cam.data.type = "ORTHO"
cam.data.ortho_scale = 12
bpy.context.scene.camera = cam

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = FRAMES
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 540
scene.render.resolution_y = 960
scene.render.resolution_percentage = 100
scene.render.fps = FPS
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.filepath = str(ROOT / "assets" / "renders" / f"pink-princess-{STAGE}" / "frame_")
scene.view_settings.look = "AgX - Medium High Contrast"
blend = ROOT / "assets" / "blender" / f"pink-princess-{STAGE}.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.render.render(animation=True)
print("PINK_PRINCESS_COMPLETE", STAGE)
