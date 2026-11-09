"""Gera os ícones PNG do app em public/. Uso: python tools/icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public"


def icon(size: int, pad_ratio: float = 0.0) -> Image.Image:
    img = Image.new("RGB", (size, size), "#F6F7FB")
    # gradiente diagonal teal -> roxo
    grad = Image.new("RGB", (size, size))
    a, b = (42, 157, 143), (123, 94, 167)
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    pad = int(size * pad_ratio)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, size - pad, size - pad], radius=int(size * 0.22), fill=255)
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arialbd.ttf", int(size * 0.34))
    except OSError:
        font = ImageFont.load_default()
    d.text((size / 2, size / 2), "R$", font=font, fill="white", anchor="mm")
    return img


icon(192).save(OUT / "icon-192.png")
icon(512).save(OUT / "icon-512.png")
icon(180).save(OUT / "apple-touch-icon.png")
print("ok")
