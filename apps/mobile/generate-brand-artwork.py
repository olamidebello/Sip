"""Generate Android and Play artwork from the repository's original Olamide logo."""
from pathlib import Path
from PIL import Image, ImageOps
import json

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "apps/web/public/olamide-logo.jpg"
RES = ROOT / "apps/mobile/android/app/src/main/res"
OUT = ROOT / "apps/mobile/play-artwork"
OUT.mkdir(parents=True, exist_ok=True)
logo = Image.open(SOURCE).convert("RGB")
# The headset symbol is the left portion of the original horizontal logo.
symbol = logo.crop((int(logo.width*.055), int(logo.height*.19),
                    int(logo.width*.30), int(logo.height*.80)))

def canvas(art, size, fraction=.82):
    result = Image.new("RGB", size, "black")
    fitted = ImageOps.contain(art, (int(size[0]*fraction), int(size[1]*fraction)),
                              Image.Resampling.LANCZOS)
    result.paste(fitted, ((size[0]-fitted.width)//2, (size[1]-fitted.height)//2))
    return result

canvas(symbol, (512, 512)).save(OUT / "play-icon-512.png")
canvas(logo, (1024, 500), .94).save(OUT / "feature-graphic-1024x500.png")
logo.save(OUT / "olamide-logo.png")
if RES.exists():
    for density, pixels in {"mdpi":48,"hdpi":72,"xhdpi":96,"xxhdpi":144,"xxxhdpi":192}.items():
        folder = RES / ("mipmap-" + density)
        folder.mkdir(parents=True, exist_ok=True)
        for name in ("ic_launcher", "ic_launcher_round"):
            canvas(symbol, (pixels,pixels)).save(folder / (name + ".png"))
        # Foreground uses the adaptive icon safe zone to avoid clipping.
        canvas(symbol, (int(pixels*2.25),int(pixels*2.25)), .60).save(folder / "ic_launcher_foreground.png")
    adaptive = RES / "mipmap-anydpi-v26"
    adaptive.mkdir(parents=True, exist_ok=True)
    for name in ("ic_launcher", "ic_launcher_round"):
        (adaptive / (name + ".xml")).write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">'
            '<background android:drawable="@color/olamide_icon_background"/>'
            '<foreground android:drawable="@mipmap/ic_launcher_foreground"/>'
            '</adaptive-icon>\n')
    values = RES / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "olamide_brand.xml").write_text(
        '<resources><color name="olamide_icon_background">#000000</color></resources>\n')
    for splash in RES.glob("drawable*/splash.png"):
        with Image.open(splash) as old:
            size = old.size
        canvas(logo, size, .70).save(splash)
    (OUT / "ANDROID-ARTWORK.txt").write_text(
        "Original logo applied to launcher icons, round icons, adaptive foregrounds and generated splash screens.\n")
manifest = {"source":"apps/web/public/olamide-logo.jpg",
            "icon":"Headset symbol cropped from original logo",
            "feature_graphic":"Original full logo; no product screenshots fabricated"}
(OUT / "artwork-manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
print("Olamide artwork generated:", OUT)
