#!/usr/bin/env python3
"""Cut individual pieces of snack out of the product photography.

The pack-tearing animation on the line-up cards throws real food around, not
clip art. This lifts the pieces out of the artwork you already have, on
transparency.

Where each product's pieces come from:

  masala / pudina bhujia   loose strands printed beside the bowl on the pack
  sweet chilli chakli      the spiral chakli scattered on the pack
  korean bbq peanuts       single peanuts on the table in the lifestyle photo
  cheddar cheese chakli    the cheddar cubes on the board in its photo — the
                           chakli itself only ever appears as a dense pile, and
                           a cube reads instantly at 40px anyway

Keying is by distance from the local background rather than a fixed colour,
because the grounds vary from cream to mint to dark maroon. Distance alone
also selects shadows, so each source declares whether its food sits lighter
or darker than its ground and only that side is kept. Whatever a box still
catches beyond the subject is dropped by keeping the largest connected blob,
so the boxes below only have to be roughly right.

    python3 scripts/extract-pieces.py

Writes assets/img/bits/<slug>-<n>.webp.
"""

import pathlib
import sys
from collections import deque

try:
    from PIL import Image, ImageFilter
    import numpy as np
except ImportError:
    sys.exit("needs Pillow and numpy")

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"
OUT = IMG / "bits"

SOURCES = {
    "masala-bhujia": {
        "src": "masala-bhujia-pack-1054.webp",
        "side": "darker",
        "origin": (579, 574),
        "cutoff": 60,
        "boxes": [
            (178, 36, 302, 102), (252, 100, 342, 184), (222, 166, 312, 238),
            (100, 170, 218, 210), (190, 80, 218, 108), (204, 166, 232, 194),
        ],
    },
    "pudina-bhujia": {
        "src": "pudina-bhujia-pack-1066.webp",
        "side": "darker",
        "origin": (533, 545),
        "cutoff": 38,   # pale yellow on pale mint, so a gentler cut
        "boxes": [
            (255, 58, 345, 115), (296, 138, 370, 195), (258, 188, 350, 255),
            (232, 108, 262, 136), (278, 120, 308, 150), (346, 76, 376, 106),
        ],
    },
    "sweet-chilli-chakli": {
        "src": "chakli-pack-1050-v2.webp",
        "side": "darker",
        "origin": (546, 547),
        "cutoff": 46,
        "boxes": [
            (268, 136, 330, 198), (234, 188, 296, 250), (308, 304, 370, 366),
            (224, 76, 264, 116), (296, 86, 336, 126), (176, 240, 216, 280),
        ],
    },
    "cheddar-cheese-chakli": {
        "src": "cheddar-chakli-snap-1-1200.webp",
        "side": "lighter",
        "origin": (0, 0),
        "cutoff": 58,
        # Generous boxes: the border of a crop is what the background colour is
        # sampled from, so it has to be clear of the subject.
        "boxes": [
            (600, 720, 790, 890), (775, 630, 960, 800), (640, 780, 820, 945),
            # and a couple of real chakli crumbs off the board, so it is not
            # only cheese coming out of the pack
            (296, 792, 402, 886), (392, 820, 476, 898),
        ],
    },
    "korean-bbq-peanuts": {
        "src": "korean-bbq-peanuts-snap-1-1200.webp",
        "side": "lighter",
        "origin": (0, 0),
        "cutoff": 52,
        "boxes": [
            (462, 505, 552, 595), (410, 566, 500, 656), (283, 603, 373, 693),
            (338, 583, 428, 673), (478, 598, 568, 688), (288, 698, 378, 788),
        ],
    },
}


def largest_blob(mask):
    """Keep only the biggest 4-connected run of set pixels."""
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    best, best_size = None, 0

    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            blob = []
            while q:
                y, x = q.popleft()
                blob.append((y, x))
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(blob) > best_size:
                best, best_size = blob, len(blob)

    keep = np.zeros((h, w), dtype=bool)
    if best:
        ys, xs = zip(*best)
        keep[list(ys), list(xs)] = True
    return keep


def luma(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def cut(src, box, out_path, cutoff, side, pad=6):
    im = Image.open(src).convert("RGB").crop(box)
    rgb = np.array(im).astype(np.int32)

    # The background is whatever dominates the border of the crop, which is why
    # the boxes are drawn well clear of the subject.
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)

    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    # A shadow is just as far from the background as the food is. Keep only the
    # side the food is actually on.
    bright = luma(rgb)
    bg_bright = float(luma(bg.reshape(1, 1, 3))[0, 0])
    on_side = bright > bg_bright + 8 if side == "lighter" else bright < bg_bright - 8

    solid = largest_blob((dist > cutoff) & on_side)
    if not solid.any():
        return None

    alpha = Image.fromarray((solid * 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(0.7))

    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)

    bbox = alpha.point(lambda p: 255 if p > 40 else 0).getbbox()
    if not bbox:
        return None
    rgba = rgba.crop(bbox)

    # Pad so a CSS rotation never clips a corner.
    canvas = Image.new("RGBA", (rgba.width + pad * 2, rgba.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(rgba, (pad, pad))
    canvas.save(out_path, "WEBP", quality=90, method=6)
    return canvas.size


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for slug, spec in SOURCES.items():
        src = IMG / spec["src"]
        ox, oy = spec["origin"]
        # Numbered by what actually came out, not by which box it came from, so
        # the files are always 1..n with no gap for the page to trip over.
        n = 0
        for x1, y1, x2, y2 in spec["boxes"]:
            box = (ox + x1, oy + y1, ox + x2, oy + y2)
            probe = OUT / f"{slug}-{n + 1}.webp"
            size = cut(src, box, probe, spec["cutoff"], spec["side"])
            if size:
                n += 1
                total += 1
                print(f"  {probe.name:34} {size[0]:>3}x{size[1]:<3} {probe.stat().st_size:>5}B")
            else:
                print(f"  (box {x1},{y1} for {slug} yielded nothing)")
    print(f"{total} pieces")


if __name__ == "__main__":
    main()
