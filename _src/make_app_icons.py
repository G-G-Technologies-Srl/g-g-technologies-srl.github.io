# -*- coding: utf-8 -*-
"""The manifest icons of the apps, painted with Pillow.

Deliberately NOT the app's drawing from `article_art` asked for a square. That was tried, and it
fails for a reason no amount of parameters fixes: an icon has to read at 48 px on a home screen,
and a chart at 48 px is a smudge — so is a cascade of eight squares. So each icon keeps the motif
and throws away everything else. The viewer's keeps sampled points and a marked range, five
squares instead of forty-five; the game's keeps one rock and the two pieces it broke into, three
shapes instead of fifteen.

One painter per app, in `ICONS` at the bottom. Not one painter with a parameter: two icons that
share code end up sharing a look, and two installed apps that look alike on a home screen are the
one failure an icon cannot recover from.

Usage:  python3 _src/make_app_icons.py [--app csv-scope]
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent

INK = (13, 18, 32)
PANEL = (30, 42, 67)
EMERALD = (52, 211, 153)
MUTED = (122, 133, 158)

# The trace, as fractions of the art box, and the two segments drawn in the accent — the range
# picked out of it.
#
# Squares were tried first, to echo the sampled points of `article_art.signal()`, and they do not
# survive the shrink: five separate blocks read as five blocks, not as a measurement. A thick
# unbroken line keeps the meaning at 48 px, where the meaning is all that fits.
TRACE = [(0.06, 0.64), (0.30, 0.38), (0.52, 0.68), (0.74, 0.28), (0.94, 0.48)]
PICKED = (2, 4)


# -----------------------------------------------------------------------------------------------------------------
#  p r i v a t e
# -----------------------------------------------------------------------------------------------------------------

def _csv_scope(size, inset, rounded):
    """One icon for the viewer. `inset` is the share of the canvas the art occupies, centred."""
    img = Image.new("RGB", (size, size), INK)
    draw = ImageDraw.Draw(img)

    if rounded:
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(0.22 * size), fill=INK)

    box = inset * size
    ox = oy = (size - box) / 2

    draw.rounded_rectangle([ox, oy, ox + box, oy + box], radius=int(0.14 * box), fill=PANEL)

    # The filament along the top edge, at a thickness that survives being shrunk to a home screen.
    thin = max(2, round(0.055 * box))
    draw.rounded_rectangle([ox + 0.16 * box, oy - thin / 2, ox + 0.84 * box, oy + thin / 2],
                           radius=thin // 2, fill=EMERALD)

    points = [(ox + fx * box, oy + fy * box) for fx, fy in TRACE]
    stroke = max(3, round(0.105 * box))

    # The whole trace first, then the picked segments over it. Overlapping beats abutting: two
    # lines that merely touch leave a notch at the joint, and at this size the notch is a gap.
    draw.line(points, fill=MUTED, width=stroke, joint="curve")
    draw.line(points[PICKED[0]:PICKED[1] + 1], fill=EMERALD, width=stroke, joint="curve")

    # Pillow draws no end caps, so a thick line ends square and looks cut. A dot at each vertex
    # rounds the joints and the two ends at once.
    for i, (x, y) in enumerate(points):
        colour = EMERALD if PICKED[0] <= i <= PICKED[1] else MUTED
        draw.ellipse([x - stroke / 2, y - stroke / 2, x + stroke / 2, y + stroke / 2], fill=colour)
    return img


def _astrodroid(size, inset, rounded):
    """One icon for the game: a rock, and the two pieces it just became.

    The banner drawing has four generations of squares. Three of them disappear here — at 48 px
    eight small blocks are a texture, not a rule — and what is left says the same thing with three
    shapes: the rock it was, and two pieces, the accent one being the smaller and the one worth
    more.

    The rock is a polygon and not a square, because at this size the outline is the only thing that
    tells it apart from the pieces. Its vertices are written out rather than generated: a shape
    this small is judged by eye once and then never again.
    """
    img = Image.new("RGB", (size, size), INK)
    draw = ImageDraw.Draw(img)

    if rounded:
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(0.22 * size), fill=INK)

    box = inset * size
    ox = oy = (size - box) / 2
    draw.rounded_rectangle([ox, oy, ox + box, oy + box], radius=int(0.14 * box), fill=PANEL)

    # The filament along the top edge, at a thickness that survives being shrunk to a home screen.
    thin = max(2, round(0.055 * box))
    draw.rounded_rectangle([ox + 0.16 * box, oy - thin / 2, ox + 0.84 * box, oy + thin / 2],
                           radius=thin // 2, fill=EMERALD)

    # The rock, low and left, as an irregular seven-sided lump.
    # The radii vary on purpose: a regular polygon at this size reads as a road sign, not a rock.
    rock = [(0.09, 0.49), (0.16, 0.30), (0.33, 0.26), (0.48, 0.37),
            (0.51, 0.57), (0.41, 0.75), (0.23, 0.78), (0.11, 0.67)]
    draw.polygon([(ox + fx * box, oy + fy * box) for fx, fy in rock], fill=MUTED)

    # The two pieces, up and to the right, the smaller one in the accent. Squares, because that is
    # the site's mark for one thing — and because two lumps at this size read as noise.
    piece = round(0.150 * box)
    px, py = ox + 0.60 * box, oy + 0.28 * box
    draw.rectangle([px, py, px + piece, py + piece], fill=MUTED)

    small = round(0.115 * box)
    sx, sy = ox + 0.70 * box, oy + 0.58 * box
    draw.rectangle([sx, sy, sx + small, sy + small], fill=EMERALD)
    return img


def _spronia(size, inset=0.74, rounded=True):
    """Two riders, two heights, and the higher one wins.

    The scheda's drawing asked for a square keeps two squares, two lances and two rules across the
    panel — nine shapes, and at 48 px the two rules turn into grey mush behind everything else. So
    this keeps the motif and throws the rest away: two blocks, two short lances, nothing else. The
    height difference is the whole subject, so it is exaggerated well past what the banner uses —
    at this size a subtle difference is no difference.

    Deliberately not the game's ornithopter. A winged machine at 48 px is a smudge with a smudge
    attached, and an icon that cannot be told from another app's on a home screen is the one failure
    an icon does not recover from.
    """
    img = Image.new("RGB", (size, size), INK)
    draw = ImageDraw.Draw(img)

    if rounded:
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(0.22 * size), fill=INK)

    box = inset * size
    ox = oy = (size - box) / 2
    draw.rounded_rectangle([ox, oy, ox + box, oy + box], radius=int(0.14 * box), fill=PANEL)

    # The filament along the top edge, the same mark every app icon here carries.
    thin = max(2, round(0.055 * box))
    draw.rounded_rectangle([ox + 0.16 * box, oy - thin / 2, ox + 0.84 * box, oy + thin / 2],
                           radius=thin // 2, fill=EMERALD)

    lance = max(2, round(0.075 * box))
    block = round(0.230 * box)

    # The winner, high and left, in the accent, with its lance pointing right.
    hx, hy = ox + 0.15 * box, oy + 0.24 * box
    draw.rectangle([hx + block, hy + block / 2 - lance / 2,
                    hx + block + 0.30 * box, hy + block / 2 + lance / 2], fill=EMERALD)
    draw.rectangle([hx, hy, hx + block, hy + block], fill=EMERALD)

    # The loser, low and right, muted, lance pointing left. Same size — the rule is about height,
    # not about distance, and two different sizes would say the wrong thing.
    lx, ly = ox + 0.85 * box - block, oy + 0.62 * box
    draw.rectangle([lx - 0.30 * box, ly + block / 2 - lance / 2,
                    lx, ly + block / 2 + lance / 2], fill=MUTED)
    draw.rectangle([lx, ly, lx + block, ly + block], fill=MUTED)
    return img


def _blend(colour, opacity, over):
    return tuple(round(over[i] + (colour[i] - over[i]) * opacity) for i in range(3))


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

# One painter per app. Using the company symbol for all of them was the tempting shortcut and is
# the one thing an icon must not do: two installed apps would be indistinguishable on the home
# screen of whoever opens them.
ICONS = {
    "csv-scope": _csv_scope,
    "astrodroid": _astrodroid,
    "spronia": _spronia,
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", default="csv-scope")
    args = parser.parse_args()

    out = ROOT / "app" / args.app / "run"
    if not out.is_dir():
        raise SystemExit(f"{out} non esiste: l'app va creata prima delle sue icone")
    if args.app not in ICONS:
        raise SystemExit(f"«{args.app}» non ha un disegno in ICONS dentro _src/make_app_icons.py")
    _paint = ICONS[args.app]

    # 0.74 for the plain icons, which the system draws as they are. The maskable one is cropped to
    # a shape the platform picks, so its art stays inside the safe circle — 0.56 keeps every corner
    # of the enclosure inside it even when the crop is a circle.
    for size in (192, 512):
        _paint(size, 0.74, rounded=True).save(out / f"icon-{size}.png")
    _paint(512, 0.56, rounded=False).save(out / "icon-maskable-512.png")

    print(f"scritte icon-192.png, icon-512.png e icon-maskable-512.png in app/{args.app}/run/")


if __name__ == "__main__":
    main()
