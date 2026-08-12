# -*- coding: utf-8 -*-
"""The manifest icons of the apps, painted with Pillow.

Deliberately NOT `article_art.signal()` asked for a square. That was tried, and it fails for a
reason no amount of parameters fixes: an icon has to read at 48 px on a home screen, and a chart
at 48 px is a smudge. So the icon keeps the motif — sampled points, a marked range, the enclosure
— and throws away everything else: five squares instead of forty-five, no second channel, no
filament thinner than the eye can hold.

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

def _paint(size, inset, rounded):
    """One icon. `inset` is the share of the canvas the art occupies, centred."""
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


def _blend(colour, opacity, over):
    return tuple(round(over[i] + (colour[i] - over[i]) * opacity) for i in range(3))


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", default="csv-scope")
    args = parser.parse_args()

    out = ROOT / "app" / args.app / "run"
    if not out.is_dir():
        raise SystemExit(f"{out} non esiste: l'app va creata prima delle sue icone")

    # 0.74 for the plain icons, which the system draws as they are. The maskable one is cropped to
    # a shape the platform picks, so its art stays inside the safe circle — 0.56 keeps every corner
    # of the enclosure inside it even when the crop is a circle.
    for size in (192, 512):
        _paint(size, 0.74, rounded=True).save(out / f"icon-{size}.png")
    _paint(512, 0.56, rounded=False).save(out / "icon-maskable-512.png")

    print(f"scritte icon-192.png, icon-512.png e icon-maskable-512.png in app/{args.app}/run/")


if __name__ == "__main__":
    main()
