import bpy
import math
import random
from mathutils import Vector


OUT_BLEND = r"C:\Users\A\Documents\hemsidan\assets\blender\tap-neon-alpha.blend"
OUT_VIDEO = r"C:\Users\A\Documents\hemsidan\assets\videos\tap-neon-alpha.webm"
OUT_FRAMES = r"C:\Users\A\Documents\hemsidan\assets\renders\tap-neon-alpha\frame_"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.curves, bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name, base, metallic=0.0, roughness=0.3, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*base, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def smooth_keys(obj):
    if obj.animation_data and obj.animation_data.action and hasattr(obj.animation_data.action, "fcurves"):
        for fc in obj.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"


def add_text(text, location, scale, delay, name):
    bpy.ops.object.text_add(location=location, rotation=(math.radians(90), 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.extrude = 0.18
    obj.data.bevel_depth = 0.045
    obj.data.bevel_resolution = 5
    obj.data.materials.append(red_metal)
    obj.data.materials.append(pink_glow)
    obj.scale = (0.01, 0.01, 0.01)
    obj.rotation_euler = (math.radians(90), math.radians(-24), math.radians(-18))
    obj.location.x -= 6.0
    obj.keyframe_insert("location", frame=1 + delay)
    obj.keyframe_insert("rotation_euler", frame=1 + delay)
    obj.keyframe_insert("scale", frame=1 + delay)
    obj.location.x += 6.0
    obj.rotation_euler = (math.radians(90), 0, 0)
    obj.scale = (scale, scale, scale)
    obj.keyframe_insert("location", frame=24 + delay)
    obj.keyframe_insert("rotation_euler", frame=24 + delay)
    obj.keyframe_insert("scale", frame=24 + delay)
    obj.scale = (scale * 1.07, scale * 1.07, scale * 1.07)
    obj.keyframe_insert("scale", frame=38 + delay)
    obj.scale = (scale, scale, scale)
    obj.keyframe_insert("scale", frame=48 + delay)
    obj.keyframe_insert("location", frame=104)
    obj.keyframe_insert("rotation_euler", frame=104)
    obj.location.x += 7.0
    obj.rotation_euler.z = math.radians(22)
    obj.keyframe_insert("location", frame=120)
    obj.keyframe_insert("rotation_euler", frame=120)
    smooth_keys(obj)
    return obj


def add_energy_ring(radius, z, delay):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.035, major_segments=96, minor_segments=12,
                                    location=(0, 0.25, z), rotation=(math.radians(90), 0, 0))
    ring = bpy.context.object
    ring.data.materials.append(pink_glow)
    ring.scale = (0.05, 0.05, 0.05)
    ring.keyframe_insert("scale", frame=18 + delay)
    ring.scale = (1.0, 1.0, 1.0)
    ring.keyframe_insert("scale", frame=42 + delay)
    ring.scale = (1.18, 1.18, 1.18)
    ring.keyframe_insert("scale", frame=74 + delay)
    ring.scale = (0.02, 0.02, 0.02)
    ring.keyframe_insert("scale", frame=112)
    smooth_keys(ring)


clear_scene()
random.seed(11)

red_metal = material("Ruby chrome", (0.34, 0.002, 0.018), metallic=0.86, roughness=0.16)
pink_glow = material("Hot pink energy", (0.8, 0.005, 0.12), roughness=0.22,
                     emission=(1.0, 0.0, 0.16), strength=8.0)
white_glow = material("White spark", (1.0, 0.7, 0.85), roughness=0.2,
                      emission=(1.0, 0.28, 0.55), strength=12.0)

add_text("TAP", (0, 0, 1.05), 1.5, 0, "TAP top")
add_text("TAP", (0, 0, -0.75), 1.5, 7, "TAP bottom")

for radius, z, delay in [(2.4, -2.25, 0), (3.1, -2.35, 5), (3.8, -2.45, 10)]:
    add_energy_ring(radius, z, delay)

for i in range(52):
    x = random.uniform(-4.2, 4.2)
    z0 = random.uniform(-3.0, -2.0)
    z1 = random.uniform(-1.4, 3.2)
    size = random.uniform(0.025, 0.09)
    start = random.randint(18, 68)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size, location=(x, random.uniform(-0.1, 0.3), z0))
    spark = bpy.context.object
    spark.name = f"Spark {i:02d}"
    spark.data.materials.append(white_glow if i % 4 == 0 else pink_glow)
    spark.scale = (0, 0, 0)
    spark.keyframe_insert("scale", frame=start)
    spark.keyframe_insert("location", frame=start)
    spark.scale = (1, 1, 1)
    spark.location.z = z1
    spark.location.x += random.uniform(-0.45, 0.45)
    spark.keyframe_insert("scale", frame=start + random.randint(18, 38))
    spark.keyframe_insert("location", frame=start + random.randint(18, 38))
    spark.scale = (0, 0, 0)
    spark.keyframe_insert("scale", frame=min(118, start + 48))
    smooth_keys(spark)

bpy.ops.object.light_add(type="AREA", location=(0, -3.5, 4.5))
key = bpy.context.object
key.data.energy = 1050
key.data.shape = "DISK"
key.data.size = 5.0
key.data.color = (1.0, 0.08, 0.24)
key.rotation_euler = (math.radians(25), 0, 0)

bpy.ops.object.light_add(type="AREA", location=(3.8, -2.0, 0.5))
rim = bpy.context.object
rim.data.energy = 850
rim.data.size = 3.0
rim.data.color = (0.3, 0.02, 1.0)
rim.rotation_euler = (math.radians(75), 0, math.radians(55))

bpy.ops.object.camera_add(location=(0, -14.5, 0.1), rotation=(math.radians(90), 0, 0))
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 10.5
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
