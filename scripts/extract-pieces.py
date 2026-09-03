#!/usr/bin/env python3
"""Cut individual pieces of snack out of the torn-open pack photography.

The line-up cards tear a pack open on hover and throw its contents out. The
pieces thrown are cut from the photographs in sources/open/ -- the shots of
each pack being emptied -- because in those the snack is airborne against a
flat studio backdrop, lit hard and shot sharp. Every piece is already
separated from every other one; nothing has to be prised out of a bowl or off
a table, and nothing carries a shadow it was casting on something else.

That is the whole reason these are the source. An earlier version cut from
the lifestyle photography, where the snack lies in a heap on a dark table:
the pieces were small, soft, and half of what the key caught was shadow.

How it works: the backdrop is smooth and the food is not, so a heavy median
of the photograph at a fraction of its size models the backdrop, and anything
far enough from that model is snack. Components are then kept on size -- big
enough to be a piece, small enough not to be the heap or the pack itself --
and on where they sit, since only the airborne ones are cleanly separated.

Pieces are exported at roughly twice the size they are drawn on a card, so
they downscale on every screen and stay sharp on a dense one, and all the
pieces of one pack are scaled by the same factor so a crumb stays a crumb
next to a whole stick.

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
SRC = ROOT / "sources" / "open"
OUT = ROOT / "assets" / "img" / "bits"

# The card draws a pack about 300px wide; in these photographs it is about
# 1250px. Pieces are exported at twice that ratio so there is something left
# for a retina screen to use.
CARD_RATIO = 300.0 / 1250.0
EXPORT = CARD_RATIO * 2

BG_SCALE = 8       # the backdrop is modelled at 1/8 size, which is plenty
BG_RADIUS = 7      # ... so this window is a 56px one on the full photograph

# "scale" trims a pack whose snack is chunky in the frame -- a peanut fills
# far more of the photograph than a strand of bhujia does, and drawn at the
# same factor it arrives on the card looking like a potato.
SOURCES = {
    "masala-bhujia": {"cutoff": 70, "area": (500, 26000), "keep": 14},
    "pudina-bhujia": {"cutoff": 70, "area": (500, 26000), "keep": 14},
    # Orange chakli on coral, gold chakli on yellow, orange peanuts on orange:
    # the backdrop is close enough to the food that the cut has to be loose,
    # or it eats into the lit side of a piece and leaves it looking chewed.
    # `close` then seals what the looser threshold leaves ragged.
    "sweet-chilli-chakli": {"cutoff": 34, "area": (500, 26000), "keep": 14, "scale": 0.9},
    "cheddar-cheese-chakli": {"cutoff": 24, "area": (500, 26000), "keep": 14, "close": 5,
                              "scale": 0.85},
    "korean-bbq-peanuts": {"cutoff": 24, "area": (900, 30000), "keep": 14, "close": 5,
                           "scale": 0.6},
}

# Only the top of the frame: below this the burst thickens into the heap in
# the mouth of the pack, where nothing is separable.
AIRBORNE = 0.52


def background(im):
    """A smooth model of the backdrop the snack is flying against.

    A median at a fraction of the size: a studio sweep is all low frequency,
    and doing it at full resolution costs a hundred times as much for a
    picture of the same thing.
    """
    small = im.resize((im.width // BG_SCALE, im.height // BG_SCALE), Image.BOX)
    small = small.filter(ImageFilter.MedianFilter(BG_RADIUS))
    return np.asarray(small.resize(im.size, Image.BILINEAR), float)


def sharpness(gray):
    """Variance of a Laplacian -- high where a piece is in focus."""
    k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], float)
    return float(ndimage.convolve(gray, k).var())


def find(path, spec):
    im = Image.open(path).convert("RGB")
    rgb = np.asarray(im, float)
    dist = np.sqrt(((rgb - background(im)) ** 2).sum(axis=2))

    k = spec.get("close", 3)
    mask = dist > spec["cutoff"]
    mask = ndimage.binary_closing(mask, np.ones((k, k)))
    mask = ndimage.binary_fill_holes(mask)

    lab, _ = ndimage.label(mask)
    gray = rgb.mean(axis=2)
    lo, hi = spec["area"]
    limit = im.height * AIRBORNE

    found = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None:
            continue
        if sl[0].stop > limit:          # into the heap; not a separable piece
            continue
        piece = lab[sl] == i
        area = int(piece.sum())
        if not lo <= area <= hi:
            continue
        h, w = piece.shape
        if w < 18 and h < 18:
            continue
        found.append({
            "slice": sl,
            "mask": piece,
            "long": max(w, h),
            "score": sharpness(gray[sl]) * min(area, 6000),
        })

    found.sort(key=lambda c: -c["score"])
    return rgb, found


def carve(rgb, cand, factor, pad=6):
    sl, solid = cand["slice"], cand["mask"]
    y0 = max(0, sl[0].start - 4)
    x0 = max(0, sl[1].start - 4)
    y1 = min(rgb.shape[0], sl[0].stop + 4)
    x1 = min(rgb.shape[1], sl[1].stop + 4)

    full = np.zeros(rgb.shape[:2], bool)
    full[sl] = solid
    alpha = Image.fromarray((full[y0:y1, x0:x1] * 255).astype(np.uint8), "L")
    # Median first to shed the single-pixel fringe the threshold leaves
    # behind, then a light blur so the outline is not a staircase.
    alpha = alpha.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(0.8))

    rgba = Image.fromarray(rgb[y0:y1, x0:x1].astype(np.uint8), "RGB").convert("RGBA")
    rgba.putalpha(alpha)
    bbox = alpha.point(lambda p: 255 if p > 30 else 0).getbbox()
    if not bbox:
        return None
    rgba = rgba.crop(bbox)

    w = max(6, round(rgba.width * factor))
    h = max(6, round(rgba.height * factor))
    rgba = rgba.resize((w, h), Image.LANCZOS)

    # Pad so a CSS rotation never clips a corner.
    canvas = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
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
        src = SRC / f"{slug}.webp"
        if not src.exists():
            sys.exit(f"no source for {slug} (expected {src})")
        rgb, found = find(src, spec)
        keep = found[:spec["keep"]]
        print(f"{slug}: {len(found)} candidates")

        row, n = [], 0
        for cand in keep:
            piece = carve(rgb, cand, EXPORT * spec.get("scale", 1.0))
            if piece is None:
                continue
            n += 1
            total += 1
            path = OUT / f"{slug}-{n}.webp"
            piece.save(path, "WEBP", quality=92, method=6)
            row.append(piece)
        print(f"  {n} pieces, "
              f"{min(p.width for p in row)}-{max(p.width for p in row)}px wide")
        rows.append((slug, row))

    print(f"{total} pieces")

    if args.sheet:
        cell = 120
        cols = max(len(r) for _, r in rows)
        sheet = Image.new("RGB", (cols * cell, len(rows) * cell), (16, 32, 84))
        for y, (_slug, row) in enumerate(rows):
            for x, piece in enumerate(row):
                thumb = piece.copy()
                thumb.thumbnail((cell - 10, cell - 10))
                sheet.paste(thumb, (x * cell + 5, y * cell + 5), thumb)
        sheet.save("/tmp/bits-sheet.png")
        print("contact sheet: /tmp/bits-sheet.png")


if __name__ == "__main__":
    main()
