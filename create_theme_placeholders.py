from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, sys

THEMES={
 "pink-princess":("Pink Princess","#ff3e9f","#f1c75b"),"chanel-tweed":("Tweed Luxury","#e9e3dc","#c9a760"),
 "gucci-dionysus":("Dionysus","#b99352","#e1c27b"),"carbon-fiber":("Carbon Fiber","#3c424a","#bfc7d2"),
 "royal-blue":("Royal Blue","#1269d3","#efc24b"),"neon":("Neon","#d13cff","#39eaff"),
 "cyber":("Cyber","#14dcec","#e72bff"),"marble":("Black Marble","#25232a","#d4af72")}
LAYERS=("x2-main","x3-main","tap-main","glove-main","platform","smoke","diamonds","hearts","lightning","particles")
root=Path(sys.argv[1] if len(sys.argv)>1 else "assets/themes")
font_path=Path("C:/Windows/Fonts/arialbd.ttf")
font=ImageFont.truetype(str(font_path),180) if font_path.exists() else ImageFont.load_default()
small=ImageFont.truetype(str(font_path),42) if font_path.exists() else ImageFont.load_default()
for slug,(name,a,b) in THEMES.items():
    folder=root/slug;folder.mkdir(parents=True,exist_ok=True)
    manifest={"id":slug,"name":name,"version":1,"placeholder":True,"durationMs":6000,"layers":{k:k+".png" for k in LAYERS},"layout":{"mainWidth":.62,"platformWidth":.70,"bottom":.03}}
    (folder/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    for layer in LAYERS:
        path=folder/(layer+".png")
        if path.exists(): continue
        im=Image.new("RGBA",(2048,2048),(0,0,0,0));d=ImageDraw.Draw(im)
        label={"x2-main":"X2","x3-main":"X3","tap-main":"TAP","glove-main":"GLOVE"}.get(layer,layer.upper())
        box=d.textbbox((0,0),label,font=font);tw,th=box[2]-box[0],box[3]-box[1]
        x,y=(2048-tw)//2,(2048-th)//2
        d.rounded_rectangle((x-100,y-100,x+tw+100,y+th+100),45,fill=a+"44",outline=b,width=18)
        d.text((x,y),label,font=font,fill=a,stroke_width=8,stroke_fill=b)
        d.text((70,1900),"DEV PLACEHOLDER · "+name,font=small,fill=(255,255,255,145))
        im.save(path)
print(f"Created/checked {len(THEMES)} themes")
