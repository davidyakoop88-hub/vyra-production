import bpy
import math
import random

ROOT = r"C:\Users\A\Documents\hemsidan"
OUT_BLEND = ROOT + r"\assets\blender\royal-dragon-tap.blend"
OUT_FRAMES = ROOT + r"\assets\renders\royal-dragon-tap\frame_"


def material(name, color, metallic=0, roughness=.35, emission=None, strength=0):
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


def key(o, f, loc=None, rot=None, scale=None):
    if loc is not None:
        o.location = loc
        o.keyframe_insert("location", frame=f)
    if rot is not None:
        o.rotation_euler = rot
        o.keyframe_insert("rotation_euler", frame=f)
    if scale is not None:
        o.scale = scale
        o.keyframe_insert("scale", frame=f)


def add_text(body, z, size, parent):
    bpy.ops.object.text_add(location=(0, -1.08, z), rotation=(math.radians(90), 0, 0))
    o = bpy.context.object
    o.data.body = body
    o.data.align_x = "CENTER"
    o.data.align_y = "CENTER"
    o.data.size = size
    o.data.extrude = .24
    o.data.bevel_depth = .045
    o.data.bevel_resolution = 5
    o.data.materials.append(gold_glow)
    o.parent = parent
    return o


def cube(name, loc, scale, mat, bevel=.1, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new("Carved bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 5
    o.data.materials.append(mat)
    o.parent = parent
    return o


def shield_mesh(parent):
    outline = [(-2.65, 3.5), (2.65, 3.5), (3.05, 2.7), (2.8, -.8),
               (1.8, -3.25), (0, -4.3), (-1.8, -3.25), (-2.8, -.8), (-3.05, 2.7)]
    depth = .5
    verts = [(x, -depth, z) for x, z in outline] + [(x, depth, z) for x, z in outline]
    n = len(outline)
    faces = [tuple(range(n)), tuple(range(2*n-1, n-1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n+j, n+i))
    mesh = bpy.data.meshes.new("Dragon shield mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Royal dragon shield", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(obsidian)
    bevel = obj.modifiers.new("Forged edges", "BEVEL")
    bevel.width = .22
    bevel.segments = 6
    obj.parent = parent
    return obj


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
random.seed(44)

obsidian = material("Crimson obsidian", (.045, .002, .006), .72, .2)
gold = material("Royal gold", (.58, .16, .012), .95, .16)
gold_glow = material("Royal gold energy", (.95, .38, .018), .8, .13, (1, .17, .008), 4.5)
red_energy = material("Dragon fire", (.8, .004, .01), .25, .18, (1, .0, .008), 12)
white_energy = material("Impact core", (1, .55, .18), .2, .12, (1, .2, .02), 18)

bpy.ops.object.empty_add(type="PLAIN_AXES")
root = bpy.context.object
root.name = "Royal Dragon Tap Pack"
shield = shield_mesh(root)

# Gold border follows a simplified shield outline.
for name, loc, scale, angle in [
    ("top", (0, -.72, 3.42), (2.55, .13, .11), 0),
    ("left", (-2.63, -.72, .8), (.11, .13, 2.45), math.radians(-4)),
    ("right", (2.63, -.72, .8), (.11, .13, 2.45), math.radians(4)),
    ("lower left", (-1.5, -.72, -3.15), (.11, .13, 1.65), math.radians(-54)),
    ("lower right", (1.5, -.72, -3.15), (.11, .13, 1.65), math.radians(54)),
]:
    bar = cube("Shield border " + name, loc, scale, gold, .08, root)
    bar.rotation_euler.y = angle

# Crown.
cube("Crown band", (0, -.9, 3.75), (1.25, .14, .16), gold, .08, root)
for i, x in enumerate((-1.0, -.5, 0, .5, 1.0)):
    h = 1.15 if i == 2 else (.88 if i in (1, 3) else .6)
    p = cube(f"Crown spike {i}", (x, -.9, 4.15+h/2), (.11, .13, h/2), gold, .07, root)
    p.rotation_euler.y = math.radians(-x*13)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.14, location=(x, -1.0, 4.15+h))
    bpy.context.object.data.materials.append(red_energy if i == 2 else gold_glow)
    bpy.context.object.parent = root

# Stylized dragon horns and eye gems.
for side in (-1, 1):
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=.48, radius2=.06, depth=2.1,
                                   location=(side*2.15, -.88, 2.5), rotation=(0, math.radians(side*34), 0))
    horn = bpy.context.object
    horn.data.materials.append(gold)
    horn.parent = root
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=.24,
                                        location=(side*.92, -1.0, 2.25))
    eye = bpy.context.object
    eye.scale = (1.25, .5, .6)
    eye.data.materials.append(red_energy)
    eye.parent = root

tap_top = add_text("TAP", .95, 1.85, root)
tap_bottom = add_text("TAP", -.75, 1.85, root)

# Energy button.
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.88, depth=.28,
                                    location=(0, -1.0, -2.65), rotation=(math.radians(90), 0, 0))
button = bpy.context.object
button.data.materials.append(red_energy)
button.parent = root
for radius, matl in ((1.08, gold), (1.28, gold_glow)):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=.065, major_segments=96,
                                    minor_segments=12, location=(0, -1.12, -2.65),
                                    rotation=(math.radians(90), 0, 0))
    bpy.context.object.data.materials.append(matl)
    bpy.context.object.parent = root

# Entrance: smoke/sparks first, then shield slams in.
key(root, 1, loc=(0, 0, -1.2), rot=(0, 0, math.radians(-18)), scale=(.01, .01, .01))
key(root, 28, loc=(0, 0, .25), rot=(0, 0, math.radians(3)), scale=(1.08, 1.08, 1.08))
key(root, 38, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1))
key(root, 126, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1))
key(root, 150, loc=(0, 0, 1.5), rot=(0, 0, math.radians(16)), scale=(.01, .01, .01))

# Text punches forward in sequence.
for obj, start in ((tap_top, 30), (tap_bottom, 38)):
    key(obj, start, scale=(.01, .01, .01), rot=(math.radians(90), math.radians(-30), 0))
    key(obj, start+12, scale=(1.18, 1.18, 1.18), rot=(math.radians(90), 0, 0))
    key(obj, start+19, scale=(1, 1, 1), rot=(math.radians(90), 0, 0))

# Two impact pulses around the button.
for start in (64, 94):
    key(button, start, scale=(1, 1, 1))
    key(button, start+5, scale=(.72, .72, .72))
    key(button, start+10, scale=(1.25, 1.25, 1.25))
    key(button, start+17, scale=(1, 1, 1))
    for ring_i in range(3):
        bpy.ops.mesh.primitive_torus_add(major_radius=1.15, minor_radius=.045, major_segments=72,
                                        minor_segments=10, location=(0, -1.35, -2.65),
                                        rotation=(math.radians(90), 0, 0))
        ring = bpy.context.object
        ring.data.materials.append(red_energy if ring_i < 2 else white_energy)
        key(ring, start+5+ring_i*2, scale=(.05, .05, .05))
        key(ring, start+20+ring_i*3, scale=(2.8, 2.8, 2.8))
        key(ring, start+25+ring_i*3, scale=(0, 0, 0))

# Rising embers and short impact streaks.
for i in range(110):
    start = random.randint(1, 124)
    x = random.uniform(-3.8, 3.8)
    z0 = random.uniform(-5.4, -3.2)
    z1 = random.uniform(-1.0, 6.0)
    radius = random.uniform(.025, .095)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius,
                                        location=(x, random.uniform(-1.25, -.75), z0))
    ember = bpy.context.object
    ember.data.materials.append(white_energy if i % 7 == 0 else red_energy)
    key(ember, start, scale=(0, 0, 0), loc=(x, ember.location.y, z0))
    key(ember, start+5, scale=(1, 1, 1))
    key(ember, min(149, start+random.randint(18, 34)), scale=(0, 0, 0),
        loc=(x+random.uniform(-.7, .7), ember.location.y, z1))

# Dramatic lights.
bpy.ops.object.light_add(type="AREA", location=(-3, -5, 5))
bpy.context.object.data.energy = 1100
bpy.context.object.data.color = (1, .08, .01)
bpy.context.object.data.size = 4
bpy.context.object.rotation_euler.x = math.radians(28)
bpy.ops.object.light_add(type="AREA", location=(3.5, -4, 0))
bpy.context.object.data.energy = 900
bpy.context.object.data.color = (1, .42, .04)
bpy.context.object.data.size = 3

bpy.ops.object.camera_add(location=(0, -18, .3), rotation=(math.radians(90), 0, 0))
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 13.2
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 150
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 540
scene.render.resolution_y = 960
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
