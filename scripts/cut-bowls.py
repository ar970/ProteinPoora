"""Cut a bowl of the snack out of each lifestyle photograph, on transparency.

The five photographs are marketing layouts, not product shots, so two things
are in the way.

Hand-drawn white callout arrows cross the bowls. Those are painted out by
diffusion from the pixels around them, inside boxes given per photograph --
an automatic "pale and thin" test finds the strokes, but three of the bowls
are themselves white, so it is only trusted where a stroke is known to be.

And nothing separates these bowls from their grounds by colour alone: brass in
shadow on dark stone, a black bowl on deep red, orange chakli on orange paper.
So each bowl is cut by a silhouette fitted to the photograph -- a rim ellipse,
two sides and a base arc -- and where a mound of snack rises above the rim with
a ragged edge a smooth curve would chop, that part is keyed on local variance
instead: the grounds are flat, the snack is not.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

IMG = '/home/user/ProteinPoora/assets/img/%s'


def _disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def _bez(p0, p1, p2, n):
    t = np.linspace(0, 1, n)[:, None]
    return ((1 - t) ** 2) * p0 + 2 * (1 - t) * t * p1 + (t ** 2) * p2


def outline(rim, base, bulge):
    rcx, rcy, ra, rb = rim
    bcx, bcy, ba, bb = base
    kx, ky = bulge
    pts = [(rcx + ra * np.cos(t), rcy + rb * np.sin(t))
           for t in np.linspace(np.pi, 2 * np.pi, 260)]
    pts += [tuple(q) for q in _bez(np.array([rcx + ra, rcy]),
                                   np.array([rcx + ra - kx * ra, rcy + ky * (bcy - rcy)]),
                                   np.array([bcx + ba, bcy]), 90)]
    pts += [(bcx + ba * np.cos(t), bcy + bb * np.sin(t))
            for t in np.linspace(0, np.pi, 160)]
    pts += [tuple(q) for q in _bez(np.array([bcx - ba, bcy]),
                                   np.array([rcx - ra + kx * ra, rcy + ky * (bcy - rcy)]),
                                   np.array([rcx - ra, rcy]), 90)]
    return pts


def _raster(size, draw):
    """Draw at 4x and shrink, so a curved edge is properly resolved."""
    S = 4
    big = Image.new('L', (size[0] * S, size[1] * S), 0)
    draw(ImageDraw.Draw(big), S)
    return np.asarray(big.resize(size, Image.LANCZOS), float) / 255.0


def bowl_mask(size, job):
    pts = outline(job['rim'], job['base'], job['bulge'])
    return _raster(size, lambda d, S: d.polygon([(x * S, y * S) for x, y in pts], fill=255))


def dome_mask(size, dome):
    cx, cy, a, b = dome
    return _raster(size, lambda d, S: d.ellipse(
        [(cx - a) * S, (cy - b) * S, (cx + a) * S, (cy + b) * S], fill=255))


def texture(a, job, within):
    """The snack, found by local variance -- the grounds are flat, it is not."""
    g = a.mean(axis=2)
    sd = np.sqrt(np.maximum(ndimage.uniform_filter(g * g, 7)
                            - ndimage.uniform_filter(g, 7) ** 2, 0))
    m = ndimage.maximum_filter(sd, 5) >= job.get('std', 9.0)
    m &= within
    m = ndimage.binary_closing(m, _disk(3))
    # Fill gaps between pieces, but not the crescent of bare ground between
    # the mound and the back of the rim -- that is a hole too, and filling it
    # brings the photograph's background back in as a halo.
    gaps = ndimage.binary_fill_holes(m) & ~m
    lab, n = ndimage.label(gaps)
    if n:
        keep = np.zeros_like(m)
        for i, sz in enumerate(ndimage.sum(gaps, lab, range(1, n + 1)), start=1):
            if sz <= job.get('gap', 900):
                keep |= lab == i
        m |= keep
    m = ndimage.binary_opening(m, _disk(4))
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = lab == int(np.argmax(sizes)) + 1
    return m.astype(float)


def depaint(a, job, inside):
    """Paint the callout strokes out of the bowl before it is cut."""
    boxes = job.get('arrows', [])
    if not boxes:
        return a, 0
    zone = np.zeros(a.shape[:2], bool)
    for x0, y0, x1, y1 in boxes:
        zone[y0:y1, x0:x1] = True
    pale = (a.min(axis=2) > 175) & zone & inside
    hole = ndimage.binary_dilation(pale, _disk(5)) & inside
    if not hole.any():
        return a, 0
    out = a.copy()
    known = ~hole
    for c in range(3):
        seed = np.where(known, a[:, :, c], 0.0)
        wgt = known.astype(float)
        for _ in range(260):
            seed = ndimage.uniform_filter(seed, 9)
            wgt = ndimage.uniform_filter(wgt, 9)
            seed = np.where(known, a[:, :, c], seed / np.maximum(wgt, 1e-6))
            wgt = np.where(known, 1.0, np.minimum(wgt + 0.05, 1.0))
        out[:, :, c] = seed
    return out, int(hole.sum())


def pale(a, job, shape):
    """Where a fitted rim runs above the real one it covers bare ground. On the
    white bowls that is easy to take back: the bowl is unsaturated, every one
    of these grounds is not.

    Only above the rim's widest line. Lower down the bowl's own shadow is warm
    enough to fail the same test, and the shape is right there anyway."""
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    ys = np.arange(a.shape[0])[:, None]
    upper = ys < job['rim'][1]
    m = ((sat <= job['pale']) | ~upper) & shape
    m = ndimage.binary_closing(m, _disk(6))
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = lab == int(np.argmax(sizes)) + 1
    return ndimage.binary_fill_holes(m)


def run(name, job, preview=False):
    im = Image.open(IMG % job['src']).convert('RGB')
    a = np.asarray(im, float)
    shape = bowl_mask(im.size, job)
    envelope = shape > 0.02
    if 'dome' in job:
        envelope |= dome_mask(im.size, job['dome']) > 0.5

    # Repaint first: a stroke left in place would be found by the variance
    # test and cut out as part of the snack's own edge.
    rgb, n = depaint(a, job, envelope)

    alpha = shape
    if 'pale' in job:
        alpha = alpha * ndimage.gaussian_filter(
            pale(rgb, job, shape > 0.5).astype(float), 1.0)
    if 'dome' in job:
        alpha = np.maximum(alpha, texture(rgb, job, dome_mask(im.size, job['dome']) > 0.5))

    out = Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')).convert('RGBA')
    am = Image.fromarray((np.clip(alpha, 0, 1) * 255).astype('uint8')).filter(
        ImageFilter.GaussianBlur(0.7))
    out.putalpha(am)
    out = out.crop(am.getbbox())
    if preview:
        out.save('bowl-%s.png' % name)
    if preview:      # judge it the way it will be seen, on the hero's navy
        navy = Image.new('RGB', (out.width + 120, out.height + 120), (30, 45, 120))
        navy.paste(out, (60, 60), out)
        navy.save('nav-%s.png' % name)
    print('%-22s %s  repainted=%d' % (name, out.size, n))
    return out


# The fitted silhouettes, one per photograph. rim and base are ellipses given
# as centre x, centre y, semi-axis x, semi-axis y, in the 1200px source; bulge
# is how far the sides bow in between them. dome bounds the part cut by
# variance rather than by shape, where a mound of snack rises above the rim.
# arrows are the boxes a callout stroke reaches into.
JOBS = {
    "masala-bhujia": {
        "src": "masala-bhujia-snap-1-1200.webp",
        "rim": [
            612,
            545,
            268,
            146
        ],
        "base": [
            628,
            801,
            156,
            17
        ],
        "bulge": [
            0.1,
            0.78
        ],
        "arrows": [
            [
                340,
                420,
                430,
                500
            ],
            [
                820,
                640,
                900,
                720
            ],
            [
                370,
                700,
                470,
                800
            ],
            [
                640,
                760,
                760,
                830
            ]
        ]
    },
    "sweet-chilli-chakli": {
        "src": "chakli-snap-1-1200.webp",
        "rim": [
            585,
            515,
            288,
            140
        ],
        "base": [
            580,
            796,
            140,
            18
        ],
        "bulge": [
            0.12,
            0.76
        ],
        "dome": [
            590,
            470,
            300,
            200
        ],
        "std": 9.0,
        "pale": 0.45,
        "arrows": [
            [
                440,
                300,
                580,
                430
            ],
            [
                840,
                580,
                960,
                690
            ]
        ]
    },
    "cheddar-cheese-chakli": {
        "src": "cheddar-chakli-snap-1-1200.webp",
        "rim": [
            565,
            545,
            292,
            150
        ],
        "base": [
            565,
            764,
            100,
            14
        ],
        "bulge": [
            0.12,
            0.76
        ],
        "dome": [
            570,
            470,
            300,
            200
        ],
        "std": 13.0,
        "pale": 0.45,
        "arrows": [
            [
                400,
                250,
                500,
                350
            ],
            [
                510,
                200,
                600,
                320
            ],
            [
                830,
                400,
                960,
                500
            ]
        ],
        "gap": 400
    },
    "pudina-bhujia": {
        "src": "pudina-bhujia-snap-1-1200.webp",
        "rim": [
            658,
            583,
            370,
            250
        ],
        "base": [
            654,
            946,
            258,
            24
        ],
        "bulge": [
            0.04,
            0.78
        ],
        "arrows": [
            [
                560,
                280,
                660,
                380
            ],
            [
                280,
                540,
                380,
                640
            ],
            [
                980,
                580,
                1080,
                680
            ],
            [
                780,
                880,
                900,
                980
            ]
        ]
    },
    "korean-bbq-peanuts": {
        "src": "korean-bbq-peanuts-snap-1-1200.webp",
        "rim": [
            800,
            360,
            248,
            250
        ],
        "base": [
            790,
            543,
            124,
            22
        ],
        "bulge": [
            0.1,
            0.7
        ],
        "arrows": [
            [
                490,
                230,
                600,
                300
            ],
            [
                700,
                480,
                900,
                640
            ],
            [
                960,
                380,
                1110,
                520
            ]
        ]
    }
}

# Displayed at about 165 CSS px in the hero, so 340 covers a 2x screen and
# nothing is ever shown above its natural size.
WIDTHS = (340, 180)
SLUG = {
    'masala-bhujia': 'masala-bhujia',
    'pudina-bhujia': 'pudina-bhujia',
    'sweet-chilli-chakli': 'chakli',
    'cheddar-cheese-chakli': 'cheddar-chakli',
    'korean-bbq-peanuts': 'korean-bbq-peanuts',
}


def export(name, cut):
    for w in WIDTHS:
        h = round(cut.height * w / cut.width)
        p = IMG % ('%s-bowl-%d.webp' % (SLUG[name], w))
        cut.resize((w, h), Image.LANCZOS).save(p, 'WEBP', quality=88, method=6)
        print('   ', p.split('/')[-1], '%dx%d' % (w, h))


if __name__ == '__main__':
    for name in (sys.argv[1:] or JOBS):
        export(name, run(name, JOBS[name], preview=False))
