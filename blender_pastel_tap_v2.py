import bpy, math, random

ROOT=r"C:\Users\A\Documents\hemsidan"; SLUG="pastel-tap-v2"
OUT=ROOT+"\\assets\\blender\\"+SLUG+".blend"; FR=ROOT+"\\assets\\renders\\"+SLUG+"\\frame_"
def mat(n,c,emit=None,s=0,metal=0,rough=.28):
 m=bpy.data.materials.new(n); m.use_nodes=True; p=m.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value=(*c,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 if emit: p.inputs['Emission Color'].default_value=(*emit,1); p.inputs['Emission Strength'].default_value=s
 return m
def key(o,f,loc=None,rot=None,scale=None):
 if loc is not None:o.location=loc;o.keyframe_insert('location',frame=f)
 if rot is not None:o.rotation_euler=rot;o.keyframe_insert('rotation_euler',frame=f)
 if scale is not None:o.scale=scale;o.keyframe_insert('scale',frame=f)
def cube(n,loc,sc,ma,bev=.18,parent=None):
 bpy.ops.mesh.primitive_cube_add(location=loc);o=bpy.context.object;o.name=n;o.scale=sc;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);q=o.modifiers.new('Soft bevel','BEVEL');q.width=bev;q.segments=6;o.data.materials.append(ma);o.parent=parent;return o
def text(body,z,ma,parent):
 bpy.ops.object.text_add(location=(0,-1.28,z),rotation=(math.pi/2,0,math.radians(-5)));o=bpy.context.object;o.data.body=body;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.size=1.65;o.data.extrude=.3;o.data.bevel_depth=.075;o.data.bevel_resolution=6;o.data.materials.append(ma);o.parent=parent;return o
def sphere(n,loc,sc,ma,parent=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=loc);o=bpy.context.object;o.name=n;o.scale=sc;o.data.materials.append(ma);o.parent=parent;return o

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);random.seed(8)
pink=mat('Candy pink',(.95,.16,.48),(.95,.03,.3),4); cyan=mat('Pastel cyan',(.18,.75,1),(0,.35,1),3); lilac=mat('Lilac glass',(.48,.16,.72),(.3,.03,.8),2); white=mat('Pearl text',(1,.72,.88),(1,.12,.45),2.5,metal=.25); skin=mat('Soft skin',(1,.48,.30),rough=.5); sleeve=mat('Black sleeve',(.012,.006,.015),rough=.22); dark=mat('Card core',(.08,.015,.14),rough=.2); glow=mat('Button glow',(.9,.05,.7),(1,.02,.8),12)
bpy.ops.object.empty_add(type='PLAIN_AXES');root=bpy.context.object;root.name='Pastel Tap V2'
card=cube('Pastel glass card',(0,0,.5),(2.75,.48,3.65),dark,.38,root)
for x,z,ma in [(-2.7,.5,pink),(2.7,.5,cyan),(0,4.08,white),(0,-3.08,lilac)]: cube('Neon rim',(x,-.58,z),(.08,.08,3.35) if x else (2.48,.08,.08),ma,.07,root)
t1=text('TAP',1.65,white,root);t2=text('TAP',-.05,cyan,root)
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.82,depth=.22,location=(0,-1.2,-2.15),rotation=(math.pi/2,0,0));button=bpy.context.object;button.data.materials.append(glow);button.parent=root
for r,ma in [(1.05,pink),(1.28,lilac)]:
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=.07,major_segments=64,minor_segments=10,location=(0,-1.3,-2.15),rotation=(math.pi/2,0,0));bpy.context.object.data.materials.append(ma);bpy.context.object.parent=root
# Hand made from palm and five soft fingers, animated separately.
bpy.ops.object.empty_add(type='PLAIN_AXES');hand=bpy.context.object;hand.name='Animated pressing hand'
palm=sphere('Palm',(0,0,0),(1.15,.38,.8),skin,hand);palm.rotation_euler.y=math.radians(-18)
for i,(x,z,l,a) in enumerate([(-.72,.35,1.0,-22),(-.28,.65,1.15,-8),(.18,.7,1.1,5),(.62,.55,.92,16),(-.8,-.15,.8,-52)]):
 f=sphere('Finger '+str(i),(x,-.05,z),(.23,.25,l),skin,hand);f.rotation_euler.y=math.radians(a)
cube('Sleeve',(1.05,.1,-.45),(1.25,.42,.75),sleeve,.32,hand).rotation_euler.y=math.radians(-28)
# Entrance, floating text and two presses.
key(root,1,loc=(0,0,-10),rot=(0,0,math.radians(-8)),scale=(.72,.72,.72));key(root,28,loc=(0,0,.25),rot=(0,0,math.radians(2)),scale=(1.06,1.06,1.06));key(root,38,loc=(0,0,0),rot=(0,0,0),scale=(1,1,1));key(root,132,loc=(0,0,0),scale=(1,1,1));key(root,150,loc=(0,0,8),rot=(0,0,math.radians(8)),scale=(.7,.7,.7))
for o,start,d in [(t1,24,-1),(t2,32,1)]:
 key(o,start,scale=(.01,.01,.01),rot=(math.pi/2,0,math.radians(25*d)));key(o,start+12,scale=(1.2,1.2,1.2),rot=(math.pi/2,0,math.radians(-8*d)));key(o,start+20,scale=(1,1,1),rot=(math.pi/2,0,math.radians(-5)))
 for f in (55,78,101,124): key(o,f,loc=(0,-1.28,o.location.z+.12*d),rot=(math.pi/2,0,math.radians((-7 if f%2 else -3))))
key(hand,1,loc=(7,-1.5,-3),rot=(0,0,math.radians(-28)),scale=(.72,.72,.72));key(hand,52,loc=(4.8,-1.5,-2),rot=(0,0,math.radians(-22)));key(hand,68,loc=(1.45,-1.5,-1.75),rot=(0,0,math.radians(-8)));key(hand,74,loc=(.85,-1.5,-2.18));key(hand,82,loc=(1.45,-1.5,-1.75));key(hand,98,loc=(.9,-1.5,-2.18));key(hand,108,loc=(1.45,-1.5,-1.75));key(hand,132,loc=(4.8,-1.5,-2));key(hand,150,loc=(8,-1.5,-3))
for st in (70,96):
 key(button,st,scale=(1,1,1));key(button,st+4,scale=(.68,.68,.68));key(button,st+9,scale=(1.28,1.28,1.28));key(button,st+16,scale=(1,1,1))
 for j,ma in enumerate((pink,cyan,white)):
  bpy.ops.mesh.primitive_torus_add(major_radius=.9,minor_radius=.045,major_segments=48,location=(0,-1.45,-2.15),rotation=(math.pi/2,0,0));o=bpy.context.object;o.data.materials.append(ma);key(o,st+j*2,scale=(.05,.05,.05));key(o,st+18+j*2,scale=(3.4,3.4,3.4));key(o,st+23+j*2,scale=(0,0,0))
# Pastel smoke blobs behind card and spark hearts/dots.
for i in range(24):
 x=random.uniform(-3.8,3.8);z=random.uniform(-4.5,4);o=sphere('Pastel smoke',(x,.45,z),(random.uniform(.22,.62),.12,random.uniform(.12,.34)),(pink,cyan,lilac)[i%3]);st=random.randint(1,55);key(o,st,scale=(0,0,0));key(o,st+18,scale=o.scale);key(o,min(145,st+70),loc=(x+random.uniform(-1,1),.45,z+random.uniform(1,3)),scale=(.04,.04,.04))
for i in range(70):
 x=random.uniform(-4,4);z=random.uniform(-4,4);o=sphere('Spark',(x,-1.5,z),(.04,.04,.04),(pink,cyan,white)[i%3]);st=random.randint(25,125);key(o,st,scale=(0,0,0));key(o,st+4,scale=(1,1,1));key(o,min(149,st+18),loc=(x+random.uniform(-.8,.8),-1.5,z+random.uniform(.5,2)),scale=(0,0,0))
for loc,col,en in [((-4,-6,5),(1,.08,.45),1000),((4,-5,2),(.1,.45,1),950)]: bpy.ops.object.light_add(type='AREA',location=loc);bpy.context.object.data.energy=en;bpy.context.object.data.color=col;bpy.context.object.data.size=5
bpy.ops.object.camera_add(location=(0,-19,.25),rotation=(math.pi/2,0,0));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=12.5;bpy.context.scene.camera=cam
s=bpy.context.scene;s.frame_start=1;s.frame_end=150;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=540;s.render.resolution_y=960;s.render.resolution_percentage=100;s.render.fps=30;s.render.film_transparent=True;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.filepath=FR;s.view_settings.look='AgX - Medium High Contrast'
bpy.ops.wm.save_as_mainfile(filepath=OUT);bpy.ops.render.render(animation=True);print('DONE',OUT)
