# -*- coding: utf-8 -*-
"""Geometry of the article illustrations, described once and rendered twice.

`build.py` turns these primitives into inline SVG that follows the light and dark theme.
`make_og_cards.py` paints the same primitives with Pillow onto the social card. Keeping the
geometry here is the whole point: a banner and a card drawn from two different sources would
drift apart, and nobody would notice until they sat side by side in a feed.

The primitives carry no colour. Each renderer maps the `role` to its own palette — CSS variables
in the SVG, RGB tuples in the JPEG — because the banner has to invert with the theme and the card
never does.

Everything is parametric on width and height, so the same drawing survives being asked for a
1000x420 banner and a 1200x184 card band.

Pure Python, no dependencies: `build.py` has to keep running with nothing installed.
"""

# The banner sits right under the article title, so it is wide and low: a taller one pushes the
# first paragraph off the screen and opens a hole between the title and the drawing.
BANNER_W, BANNER_H = 1000, 340
# The card thumbnail on /insights. Lower still, because under it come kicker, title and summary.
THUMB_W, THUMB_H = 800, 200

# Roles a renderer has to know how to paint.
GLOW = "glow"          # the soft halo behind everything, or nothing at all on a flat surface
PANEL = "panel"        # the enclosure
EDGE = "edge"          # the 2px accent filament and the perimeter line
ROW = "row"            # a line of the document, still intact
PACKET = "packet"      # a fragment that has left the perimeter


# -----------------------------------------------------------------------------------------------------------------
#  d r a w i n g s
# -----------------------------------------------------------------------------------------------------------------

def perimeter(w=BANNER_W, h=BANNER_H):
    """A client file, whole while it is enclosed and scattering once it crosses the boundary.

    Deliberately text-free, so one drawing serves both languages and only the accessible
    description is translated.

    Nothing here is random. Size, opacity and spacing of the fragments are functions of the
    distance travelled, so two runs produce the same picture and a rebuild never silently
    reshuffles the artwork.
    """
    box_x, box_y = 0.040 * w, 0.157 * h
    box_w, box_h = 0.384 * w, 0.686 * h
    gate = box_x + box_w

    shapes = [
        {"role": GLOW, "cx": 0.82 * w, "cy": 0.36 * h, "rx": 0.30 * w, "ry": 0.50 * h},
        {"role": PANEL, "x": box_x, "y": box_y, "w": box_w, "h": box_h, "r": 0.052 * h},
        # the filament along the top edge of the enclosure — the site's own "riquadro in evidenza"
        {"role": EDGE, "x1": box_x + 0.057 * box_w, "y1": box_y,
         "x2": box_x + 0.943 * box_w, "y2": box_y},
    ]

    rows, row_h = 7, 0.021 * h
    row_top, row_step = box_y + 0.160 * box_h, 0.115 * box_h
    for i, share in enumerate([0.828, 0.688, 0.604, 0.651, 0.781, 0.781, 0.797]):
        shapes.append({
            "role": ROW,
            "x": box_x + 0.089 * box_w, "y": row_top + i * row_step,
            "w": share * box_w, "h": row_h,
            "opacity": 0.30 + 0.06 * (i % 3),
        })

    # the boundary itself, drawn past the enclosure on both sides so it reads as a line, not a wall
    shapes.append({"role": EDGE, "x1": gate, "y1": box_y - 0.062 * h,
                   "x2": gate, "y2": box_y + box_h + 0.062 * h})

    for i in range(rows):
        y = row_top + i * row_step + row_h / 2
        # Rows start at slightly different distances, otherwise the fragments line up into a grid.
        x, step = gate + (0.026 + 0.005 * (i % 3)) * w, 0.015 * w
        while x < w - 0.024 * w:
            travel = (x - gate) / (w - gate)
            size = (0.0090 - 0.0060 * travel) * w
            swing = 1 if (i + int(x)) % 2 else -1
            # Drift is measured in row steps, not in canvas height: a short wide band and a tall
            # one have to disperse by the same amount relative to the lines they came from.
            drift = 0.80 * row_step * travel ** 1.7 * swing * ((i % 3) + 1) / 3
            shapes.append({
                "role": PACKET,
                "x": x, "y": y + drift - size / 2, "size": size,
                "opacity": max(0.06, 0.92 - 0.86 * travel ** 0.85),
            })
            x += step
            step *= 1.13

    return shapes


# The registry the renderers read. A new article needs a drawing here and an "art" entry with
# title and desc in content.py — build.py stops if it finds one without the other.
ARTICLE_ART = {
    "ai-act-dati-clienti": perimeter,
}
