#!/usr/bin/env python3
"""
Generate all platform icons from a single source icon.png.
Usage: python3 scripts/generate-icons.py
"""

from PIL import Image, ImageDraw
import subprocess, os, shutil, sys

RESOURCES = os.path.join(os.path.dirname(__file__), "..", "resources")
SRC = os.path.join(RESOURCES, "icon.png")

def get_dominant_color(img):
    """Sample the center pixel for the background fill color."""
    return img.getpixel((img.width // 2, img.height // 2))[:3]

def make_fullbleed(src, size=1024):
    """Create a full-bleed square: logo fills canvas, bg color extends to edges."""
    color = get_dominant_color(src)
    scaled = src.resize((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (*color, 255))
    canvas.paste(scaled, (0, 0), scaled)
    return canvas

def make_squircle_mask(size, n=5.0):
    """Generate a macOS-style superellipse mask."""
    mask = Image.new("L", (size, size), 0)
    cx, cy = size / 2, size / 2
    r = size / 2 - 1
    for y in range(size):
        for x in range(size):
            nx = abs((x - cx) / r)
            ny = abs((y - cy) / r)
            dist = nx ** n + ny ** n
            if dist <= 0.97:
                mask.putpixel((x, y), 255)
            elif dist <= 1.0:
                alpha = int(255 * (1.0 - (dist - 0.97) / 0.03))
                mask.putpixel((x, y), max(0, min(255, alpha)))
    return mask

def generate_dock_icon(src):
    """macOS dev dock icon: squircle with padding."""
    size = 1024
    icon_size = 824  # ~80% of canvas = ~10% padding each side
    padding = (size - icon_size) // 2

    color = get_dominant_color(src)
    scaled = src.resize((icon_size, icon_size), Image.LANCZOS)
    icon_canvas = Image.new("RGBA", (icon_size, icon_size), (*color, 255))
    icon_canvas.paste(scaled, (0, 0), scaled)

    mask = make_squircle_mask(icon_size)
    masked = Image.new("RGBA", (icon_size, icon_size), (0, 0, 0, 0))
    masked.paste(icon_canvas, (0, 0), mask)

    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(masked, (padding, padding))
    result.save(os.path.join(RESOURCES, "icon_dock.png"))
    print("  icon_dock.png (macOS dev dock)")

def generate_icns(src):
    """macOS .icns from full-bleed square via iconutil."""
    fullbleed = make_fullbleed(src)
    iconset = "/tmp/_convexpress_icon.iconset"
    os.makedirs(iconset, exist_ok=True)

    for name, sz in [
        ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
    ]:
        fullbleed.resize((sz, sz), Image.LANCZOS).save(os.path.join(iconset, name))

    out = os.path.join(RESOURCES, "icon.icns")
    subprocess.run(["iconutil", "-c", "icns", iconset, "-o", out], check=True)
    shutil.rmtree(iconset)
    print("  icon.icns (macOS packaged)")

def generate_ico(src):
    """Windows .ico with multiple sizes."""
    fullbleed = make_fullbleed(src)
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    imgs = [fullbleed.resize(s, Image.LANCZOS) for s in sizes]
    out = os.path.join(RESOURCES, "icon.ico")
    imgs[0].save(out, format="ICO", sizes=sizes, append_images=imgs[1:])
    print("  icon.ico (Windows)")

if __name__ == "__main__":
    src = Image.open(SRC).convert("RGBA")
    print(f"Source: {SRC} ({src.width}x{src.height})")
    print("Generating:")
    generate_dock_icon(src)
    generate_icns(src)
    generate_ico(src)
    print("Done. Tray icons (iconTemplate.png) must be created manually (monochrome).")
