#!/usr/bin/env python3
"""
Generate all platform icons from a single source icon.png.
Usage: python3 scripts/generate-icons.py
"""

from PIL import Image
import subprocess, os, shutil, sys

RESOURCES = os.path.join(os.path.dirname(__file__), "..", "resources")
SRC = os.path.join(RESOURCES, "icon.png")

def generate_icns(src):
    """macOS .icns from the source artwork, preserving transparency."""
    iconset = "/tmp/_convexpress_icon.iconset"
    os.makedirs(iconset, exist_ok=True)

    for name, sz in [
        ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
    ]:
        src.resize((sz, sz), Image.LANCZOS).save(os.path.join(iconset, name))

    out = os.path.join(RESOURCES, "icon.icns")
    subprocess.run(["iconutil", "-c", "icns", iconset, "-o", out], check=True)
    shutil.rmtree(iconset)
    print("  icon.icns (macOS packaged)")

def generate_ico(src):
    """Windows .ico with multiple sizes."""
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    imgs = [src.resize(s, Image.LANCZOS) for s in sizes]
    out = os.path.join(RESOURCES, "icon.ico")
    imgs[0].save(out, format="ICO", sizes=sizes, append_images=imgs[1:])
    print("  icon.ico (Windows)")

if __name__ == "__main__":
    src = Image.open(SRC).convert("RGBA")
    print(f"Source: {SRC} ({src.width}x{src.height})")
    print("Generating:")
    generate_icns(src)
    generate_ico(src)
    print("Done. Tray icons (iconTemplate.png) must be created manually (monochrome).")
