#!/usr/bin/env python3
"""Generate native and desktop icons from the canonical Olamide SVG."""
from pathlib import Path
from io import BytesIO
import json
import cairosvg
from PIL import Image
root=Path(__file__).resolve().parents[1]
source=root/'apps/web/public/olamide-icon.svg'
image=Image.open(BytesIO(cairosvg.svg2png(url=str(source),output_width=1024,output_height=1024))).convert('RGBA')
# Opaque background is required for iOS; preserve the same logo on every platform.
base=Image.new('RGBA',image.size,'#070d1c');base.alpha_composite(image)
def png(path,size):
 path.parent.mkdir(parents=True,exist_ok=True);base.resize((size,size),Image.Resampling.LANCZOS).convert('RGB').save(path)
build=root/'apps/desktop/build';build.mkdir(parents=True,exist_ok=True)
png(build/'icon.png',512)
base.save(build/'icon.ico',sizes=[(n,n) for n in (16,24,32,48,64,128,256)])
base.save(build/'icon.icns')
for size in (192,512):png(root/f'apps/web/public/icon-{size}.png',size)
png(root/'apps/web/public/apple-touch-icon.png',180)
android=root/'apps/mobile/android/app/src/main/res'
if android.exists():
 for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
  for name in ('ic_launcher','ic_launcher_round'):png(android/f'mipmap-{density}/{name}.png',size)
  foreground_size=round(size*108/48);foreground=Image.new('RGBA',(foreground_size,foreground_size));mark=base.resize((round(size*66/48),round(size*66/48)),Image.Resampling.LANCZOS);offset=(foreground_size-mark.width)//2;foreground.alpha_composite(mark,(offset,offset));foreground.save(android/f'mipmap-{density}/ic_launcher_foreground.png')
 # Replace generated adaptive icons so Android never displays the Capacitor artwork.
 for folder in ('mipmap-anydpi-v26','mipmap-anydpi-v33'):
  for name in ('ic_launcher','ic_launcher_round'):
   path=android/folder/f'{name}.xml'
   if path.exists():path.write_text('<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/olamide_icon_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>')
 colors=android/'values/olamide-icon.xml';colors.parent.mkdir(exist_ok=True);colors.write_text('<resources><color name="olamide_icon_background">#070d1c</color></resources>')
assets=root/'apps/mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset'
if assets.exists():
 entries=[]
 for idiom,sizes,scales in [('iphone',[20,29,40,60],[2,3]),('ipad',[20,29,40,76],[1,2]),('ipad',[83.5],[2]),('ios-marketing',[1024],[1])]:
  for size in sizes:
   for scale in scales:
    filename=f'icon-{idiom}-{size}-{scale}.png';png(assets/filename,round(size*scale));entries.append({'idiom':idiom,'size':f'{size}x{size}','scale':f'{scale}x','filename':filename})
 (assets/'Contents.json').write_text(json.dumps({'images':entries,'info':{'version':1,'author':'Olamide'}},indent=2))
print('Generated Olamide browser, desktop and available native project icons.')
