#!/usr/bin/env python3
"""Cut individual pieces of snack out of the product photography.

The pack-tearing animation on the line-up cards throws real food around, not
clip art. This lifts the pieces out of the photographs you already have, on
transparency.

Every piece comes from a lifestyle photo (`*-snap-1-1200.webp`) rather than
from the pack artwork, because a strand lying loose on the table in one of
those is photographed three or four times larger than the same strand printed
on a pack -- and a burst is only ever as sharp as its source. Nothing here is
enlarged afterwards either: the card displays a piece at the size it was cut,
which is what keeps it crisp.

Three things happen to each piece:

  1. **Keying.** The background is modelled as a heavy median of the whole
     photo, so a wooden board, a stone table or a vignette is described rather
     than fought, and anything far enough from that local background is the
     subject. Distance alone would take the shadow a piece casts as readily as
     the piece, so each source also declares which side of its ground the food
     sits on -- lighter, on all four of the dark tables; darker, for the
     chakli shot on bright orange -- and only that side is kept. Whatever else
     a box catches is dropped by keeping only the largest connected blob, so a
     box only has to be roughly right.
  2. **A soft edge.** A median pass sheds the single-pixel fringe a threshold
     leaves behind, then a light blur stops the outline being a staircase
     against the navy of the card.
  3. **Colour.** These photographs are lit low and warm -- gorgeous on a dark
     table, muddy once a strand is flying against navy -- so each piece is
     scaled up to the colour the snack is on its own pack.

    python3 scripts/extract-pieces.py            # writes the pieces
    python3 scripts/extract-pieces.py --sheet    # and a contact sheet to check

Writes assets/img/bits/<slug>-<n>.webp.
"""

import argparse
import pathlib
import sys

try:
    from PIL import Image, ImageFilter
    import numpy as np
    from scipy import ndimage
except ImportError:
    sys.exit("needs Pillow, numpy and scipy")

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"
OUT = IMG / "bits"

# Boxes are (x, y, width, height) on the 1200x1200 source, drawn with a margin
# of background around the piece. "vivid" is the colour the snack is on the
# pack, which each cut-out is lifted to.
SOURCES = {
    "masala-bhujia": {
        "src": "masala-bhujia-snap-1-1200.webp",
        "vivid": (216, 132, 44),
        "cutoff": 34,
        "side": "lighter",
        # Strands scattered around the wooden spoon at the foot of the photo.
        "boxes": [
            (74, 852, 60, 44), (344, 876, 58, 96), (376, 1026, 80, 44),
            (292, 1042, 78, 44), (258, 1046, 58, 62), (204, 1074, 52, 52),
            (320, 1070, 62, 46),
        ],
    },
    "pudina-bhujia": {
        "src": "pudina-bhujia-snap-1-1200.webp",
        "vivid": (182, 196, 100),
        "cutoff": 34,
        "side": "lighter",
        # The mint bhujia spilled across the table below the bowl.
        "boxes": [
            (296, 948, 62, 58), (354, 958, 78, 68), (426, 980, 72, 60),
            (486, 1090, 70, 58), (376, 1050, 62, 60), (486, 1032, 66, 62),
            (596, 1026, 70, 60),
        ],
    },
    "sweet-chilli-chakli": {
        "src": "chakli-snap-1-1200.webp",
        "vivid": (228, 98, 32),
        # Chakli on a flat orange ground only a little brighter than they are,
        # so this one needs a finer cut than the photos shot on wood and stone.
        "cutoff": 26,
        "side": "darker",
        "boxes": [
            (131, 435, 65, 78), (261, 404, 74, 65), (198, 364, 72, 57),
            (169, 537, 59, 53), (224, 504, 63, 53), (254, 970, 79, 42),
        ],
    },
    "cheddar-cheese-chakli": {
        "src": "cheddar-chakli-snap-1-1200.webp",
        "vivid": (238, 172, 64),
        "cutoff": 40,
        "side": "lighter",
        # Sticks caught where they poke out of the top of the pile against the
        # dark background -- the only place in this photograph a whole chakli
        # is separable -- plus the crumbs scattered over the board.
        "boxes": [
            (498, 292, 68, 54), (612, 288, 78, 56), (556, 284, 58, 44),
            (330, 802, 58, 54), (384, 790, 60, 56), (458, 810, 56, 54),
            (344, 842, 56, 54), (416, 848, 58, 54),
        ],
    },
    "korean-bbq-peanuts": {
        "src": "korean-bbq-peanuts-snap-1-1200.webp",
        "vivid": (200, 110, 48),
        "cutoff": 40,
        "side": "lighter",
        # Single peanuts on the table beside the bowl.
        "boxes": [
            (294, 716, 72, 75), (485, 616, 71, 72), (466, 692, 79, 68),
            (284, 633, 72, 72), (383, 649, 71, 73), (489, 543, 72, 64),
            (333, 593, 77, 64), (425, 580, 66, 71), (365, 710, 65, 60),
        ],
    },
}

BG_SCALE = 8       # the background is modelled at 1/8 size, which is plenty
BG_RADIUS = 7      # ... so this window is a 56px one on the full photo


def background(im):
    """A smooth model of the ground the food is lying on.

    Taken as a median at a fraction of the size: a table, a board or a
    vignette is all low frequency, and doing it at full resolution costs a
    hundred times as much for a picture of the same thing.
    """
    small = im.resize((im.width // BG_SCALE, im.height // BG_SCALE), Image.BOX)
    small = small.filter(ImageFilter.MedianFilter(BG_RADIUS))
    return np.asarray(small.resize(im.size, Image.BILINEAR), float)


def largest_blob(mask):
    """Keep only the biggest run of set pixels, so a box may catch a neighbour."""
    lab, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def vivify(rgba, target, ceiling=2.3):
    """Bring a piece up to the colour the snack is on its own pack.

    Each channel is scaled so the piece's own average lands on the product's
    colour, which lifts it without flattening the highlights that make it read
    as food rather than as a shape.
    """
    arr = np.asarray(rgba, float)
    lit = arr[..., 3] > 40
    if not lit.any():
        return rgba
    gain = np.clip(np.array(target, float) / np.maximum(arr[..., :3][lit].mean(axis=0), 1.0),
                   0.6, ceiling)
    arr[..., :3] = np.clip(arr[..., :3] * gain, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def luma(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def cut(rgb, dist, lit, box, cutoff, pad=8):
    x, y, w, h = box
    patch = rgb[y:y + h, x:x + w]
    solid = largest_blob((dist[y:y + h, x:x + w] > cutoff) & lit[y:y + h, x:x + w])
    if solid.sum() < 60:
        return None

    alpha = Image.fromarray((solid * 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(0.8))

    rgba = Image.fromarray(patch.astype(np.uint8), "RGB").convert("RGBA")
    rgba.putalpha(alpha)
    bbox = alpha.point(lambda p: 255 if p > 30 else 0).getbbox()
    if not bbox:
        return None
    rgba = rgba.crop(bbox)

    # Pad so a CSS rotation never clips a corner.
    canvas = Image.new("RGBA", (rgba.width + pad * 2, rgba.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(rgba, (pad, pad))
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", action="store_true", help="also write /tmp/bits-sheet.png")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        old.unlink()

    rows, total = [], 0
    for slug, spec in SOURCES.items():
        im = Image.open(IMG / spec["src"]).convert("RGB")
        rgb = np.asarray(im, float)
        bg = background(im)
        dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
        # A shadow is just as far from the ground as the food is, so only the
        # side the food is actually on counts.
        if spec["side"] == "lighter":
            lit = luma(rgb) > luma(bg) + 8
        else:
            lit = luma(rgb) < luma(bg) - 8

        row, n = [], 0
        for box in spec["boxes"]:
            piece = cut(rgb, dist, lit, box, spec["cutoff"])
            if piece is None:
                print(f"  (box {box} for {slug} yielded nothing)")
                continue
            piece = vivify(piece, spec["vivid"])
            # Numbered by what actually came out, not by which box it came
            # from, so the files are always 1..n with no gap for the page to
            # trip over.
            n += 1
            total += 1
            path = OUT / f"{slug}-{n}.webp"
            piece.save(path, "WEBP", quality=92, method=6)
            row.append(piece)
            print(f"  {path.name:30} {piece.width:>3}x{piece.height:<3} {path.stat().st_size:>5}B")
        print(f"{slug}: {n} pieces")
        rows.append((slug, row))

    print(f"{total} pieces")

    if args.sheet:
        cell = 170
        cols = max(len(r) for _, r in rows)
        sheet = Image.new("RGB", (cols * cell, len(rows) * cell), (16, 32, 84))
        for y, (_slug, row) in enumerate(rows):
            for x, piece in enumerate(row):
                thumb = piece.copy()
                thumb.thumbnail((cell - 12, cell - 12))
                sheet.paste(thumb, (x * cell + 6, y * cell + 6), thumb)
        sheet.save("/tmp/bits-sheet.png")
        print("contact sheet: /tmp/bits-sheet.png")


if __name__ == "__main__":
    main()
