#!/usr/bin/env python3
"""Turn the torn-open pack photography into the line-up cards' hover state.

Each product has a photograph of its pack torn open, contents heaped in the
mouth and thrown into the air, shot on a solid backdrop. They arrive as
landscape crops of the top of a pack (1402x1122); the card's media box is
portrait, at an aspect of 0.73.

Cropping straight to portrait would cut the ends off the burst, which is the
whole point of the picture. So the backdrop is continued upwards instead: a
band from the top of the photograph is smoothed hard along x -- the sensor
noise in one row of a flat backdrop turns into vertical streaks the moment it
is repeated eight hundred times -- and the vertical gradient it sits on is
carried on up, so the extension does not band against the photograph.

It is extended to 0.88 rather than all the way to 0.73, and the card's
`object-fit: cover` takes the remaining 8% off each side. Going the whole way
would leave a field of empty backdrop over the burst; 8% is inside the margin
the photographer left, so no flying piece is lost.

    python3 scripts/build-open-shots.py

Reads sources/open/<slug>.webp, writes assets/img/<slug>-open-{720,1080}.webp.
"""

import pathlib
import sys

try:
    from PIL import Image, ImageFilter
    import numpy as np
except ImportError:
    sys.exit("needs Pillow and numpy")

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "sources" / "open"
OUT = ROOT / "assets" / "img"

ASPECT = 0.88            # padded taller than the photo, then cropped by `cover`
WIDTHS = (720, 1080)
SLUGS = ["masala-bhujia", "pudina-bhujia", "sweet-chilli-chakli",
         "cheddar-cheese-chakli", "korean-bbq-peanuts"]


def backdrop_row(a, y0, y1):
    """One smooth row of backdrop, sampled across a band and de-noised."""
    row = a[y0:y1].mean(axis=0)
    blurred = Image.fromarray(row.reshape(1, -1, 3).astype("uint8"), "RGB")
    return np.asarray(blurred.filter(ImageFilter.GaussianBlur(60)), float)[0]


def extend_top(im, pad):
    a = np.asarray(im, float)
    top = backdrop_row(a, 0, 40)            # at the photograph's own edge
    deep = backdrop_row(a, 260, 340)        # and 300px into it
    slope = (top - deep) / 300.0            # per row, going up
    out = np.empty((pad + a.shape[0], a.shape[1], 3), float)
    for i in range(pad):
        out[i] = top + slope * (pad - i)
    out[pad:] = a
    return Image.fromarray(np.clip(out, 0, 255).astype("uint8"), "RGB")


def main():
    missing = [s for s in SLUGS if not (SRC / f"{s}.webp").exists()]
    if missing:
        sys.exit(f"no source for: {', '.join(missing)} (expected in {SRC})")

    for slug in SLUGS:
        im = Image.open(SRC / f"{slug}.webp").convert("RGB")
        tall = extend_top(im, round(im.width / ASPECT) - im.height)
        for w in WIDTHS:
            path = OUT / f"{slug}-open-{w}.webp"
            tall.resize((w, round(w / ASPECT)), Image.LANCZOS).save(
                path, "WEBP", quality=84, method=6)
            print(f"  {path.name:44} {w}x{round(w / ASPECT):<5} {path.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
