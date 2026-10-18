"""
Sube la calidad de las imágenes del catálogo reescalándolas con Lanczos +
leve enfoque (unsharp), para evitar el pixelado al mostrarlas en tamaños
grandes (tarjetas grandes, modal de producto, etc.).

Trabaja EN EL LUGAR (sobrescribe el archivo original, sin subcarpetas hd/).
Los PNG se convierten a JPG con fondo blanco. Las imágenes cuyo lado corto
ya es >= MIN_SIDE se saltan, así se puede volver a ejecutar sin re-escalar.

Requiere Pillow:
    pip install Pillow
    python upscale.py
"""

import os
from PIL import Image, ImageFilter

BASE     = r"c:\Users\ledes\OneDrive\Escritorio\Girltrack\img"
FOLDERS  = ["Tenis", "Golf", "Equitacion", "Natacion", "Remo", "Hockey"]

MIN_SIDE   = 900    # lado corto mínimo deseado
MAX_FACTOR = 4.0    # no ampliar más de 4x (origen muy chico)
MAX_DIM    = 1400   # límite del lado largo
QUALITY    = 95


def process(src_path, dst_path):
    im = Image.open(src_path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")

    w, h = im.size
    factor = max(MIN_SIDE / min(w, h), 1.0)
    factor = min(factor, MAX_FACTOR)
    nw, nh = int(round(w * factor)), int(round(h * factor))
    if max(nw, nh) > MAX_DIM:
        k = MAX_DIM / max(nw, nh)
        nw, nh = int(nw * k), int(nh * k)

    up = im.resize((nw, nh), Image.LANCZOS)
    up = up.filter(ImageFilter.UnsharpMask(radius=2, percent=110, threshold=3))
    up.save(dst_path, "JPEG", quality=QUALITY, subsampling=0, optimize=True)
    return nw, nh


def main():
    for folder in FOLDERS:
        src_dir = os.path.join(BASE, folder)

        for name in sorted(os.listdir(src_dir)):
            src_path = os.path.join(src_dir, name)
            if not os.path.isfile(src_path):
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext not in (".jpg", ".jpeg", ".png"):
                continue

            try:
                with Image.open(src_path) as probe:
                    short = min(probe.size)
                if ext == ".jpg" and short >= MIN_SIDE:
                    print(f"SKIP {folder}/{name}  (ya tiene {short}px)")
                    continue

                dst_path = os.path.join(src_dir, os.path.splitext(name)[0] + ".jpg")
                nw, nh = process(src_path, dst_path)
                if dst_path != src_path:
                    os.remove(src_path)
                kb = os.path.getsize(dst_path) // 1024
                print(f"OK  {folder}/{name} -> {os.path.basename(dst_path)}  {nw}x{nh}  {kb}KB")
            except Exception as e:
                print(f"ERR {folder}/{name}: {e}")

    print("FIN")


if __name__ == "__main__":
    main()
