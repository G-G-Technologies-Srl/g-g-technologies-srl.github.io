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
MARK = "mark"          # a bar the drawing wants to single out, in the accent colour


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


def lifespan(w=BANNER_W, h=BANNER_H):
    """The shortest component decides when the whole device stops.

    Bars of different length are the parts of a product, each with its own useful life. One of
    them — the battery — is much shorter than the others, and a line drawn at its end cuts the
    rest short: everything past that line is life the product had and does not get to use.

    Same rules as the other drawings: no text, no random numbers, parametric on width and height.
    """
    box_x, box_y = 0.040 * w, 0.157 * h
    box_w, box_h = 0.920 * w, 0.686 * h

    # The bars live inside the enclosure, with a margin on both sides.
    span_x = box_x + 0.045 * box_w
    span_w = box_w * 0.910
    shortest = 0.34                       # the battery, as a fraction of the full span
    cut = span_x + shortest * span_w

    shapes = [
        {"role": GLOW, "cx": 0.30 * w, "cy": 0.50 * h, "rx": 0.34 * w, "ry": 0.52 * h},
        {"role": PANEL, "x": box_x, "y": box_y, "w": box_w, "h": box_h, "r": 0.052 * h},
        {"role": EDGE, "x1": box_x + 0.057 * box_w, "y1": box_y,
         "x2": box_x + 0.943 * box_w, "y2": box_y},
    ]

    # Five bars, not more: the card band is very flat, and seven would come out as hairlines.
    bar_h = 0.055 * h
    row_top, row_step = box_y + 0.150 * box_h, 0.165 * box_h
    # The third bar is the short one. The others outlive it by different margins, which is the
    # whole point: they are not wasted equally.
    for i, share in enumerate([1.000, 0.830, shortest, 0.640, 0.930]):
        y = row_top + i * row_step
        if share <= shortest:
            shapes.append({"role": MARK, "x": span_x, "y": y,
                           "w": share * span_w, "h": bar_h, "opacity": 1.0})
            continue
        # what the part actually gets to serve, then what it had left when the device stopped
        shapes.append({"role": ROW, "x": span_x, "y": y,
                       "w": shortest * span_w, "h": bar_h, "opacity": 0.52})
        shapes.append({"role": ROW, "x": cut, "y": y,
                       "w": (share - shortest) * span_w, "h": bar_h, "opacity": 0.14})

    # the line where the device stops, drawn past the enclosure so it reads as a limit
    shapes.append({"role": EDGE, "x1": cut, "y1": box_y - 0.062 * h,
                   "x2": cut, "y2": box_y + box_h + 0.062 * h})
    return shapes


def inventory(w=BANNER_W, h=BANNER_H):
    """You already own more sensors than the project needs; the pilot says which ones.

    A regular grid of cells is everything the device carries. A handful are picked out in the
    accent colour: the ones that turn out to matter. The regularity is the point — this is an
    inventory, not a dispersion, and it has to read differently from the other drawings.
    """
    box_x, box_y = 0.040 * w, 0.157 * h
    box_w, box_h = 0.920 * w, 0.686 * h

    shapes = [
        {"role": GLOW, "cx": 0.50 * w, "cy": 0.50 * h, "rx": 0.38 * w, "ry": 0.52 * h},
        {"role": PANEL, "x": box_x, "y": box_y, "w": box_w, "h": box_h, "r": 0.052 * h},
        {"role": EDGE, "x1": box_x + 0.057 * box_w, "y1": box_y,
         "x2": box_x + 0.943 * box_w, "y2": box_y},
    ]

    cols, rows = 15, 5
    span_x, span_y = box_x + 0.045 * box_w, box_y + 0.150 * box_h
    span_w, span_h = box_w * 0.910, box_h * 0.700
    # The cell is sized from whichever spacing is tighter. Deriving it from the width alone made
    # the rows overlap into vertical bars on the card, where the band is far flatter than the
    # banner: two measures pulled from two different dimensions cannot both be right.
    cell = 0.60 * min(span_w / cols, span_h / rows)
    step_x = (span_w - cell) / (cols - 1)
    step_y = (span_h - cell) / (rows - 1)

    # Fixed, not sampled: the same five cells light up on every build and at every size.
    chosen = {(1, 2), (0, 6), (3, 4), (2, 9), (4, 12)}
    for r in range(rows):
        for c in range(cols):
            picked = (r, c) in chosen
            shapes.append({
                "role": MARK if picked else ROW,
                "x": span_x + c * step_x, "y": span_y + r * step_y,
                "w": cell, "h": cell,
                "opacity": 1.0 if picked else 0.22 + 0.05 * ((r + c) % 3),
            })
    return shapes


def directive(w=BANNER_W, h=BANNER_H):
    """One line among the others is an instruction, and only its shape says so: nothing.

    The enclosure holds the lines of a document, all alike. One of them is in the accent colour —
    same length, same height, same place in the stack, so it is singled out by nothing a reader
    could use. From that line alone a train of squares crosses the boundary and grows on the way
    out: the content did not leak, it acted.

    This is the deliberate opposite of `perimeter()`, where every row scatters and the fragments
    fade as they travel. Here a single row produces the stream, and it arrives.

    Same rules as the others: no text, no random numbers, parametric on width and height.
    """
    box_x, box_y = 0.040 * w, 0.157 * h
    box_w, box_h = 0.470 * w, 0.686 * h
    gate = box_x + box_w

    shapes = [
        {"role": GLOW, "cx": 0.80 * w, "cy": 0.50 * h, "rx": 0.30 * w, "ry": 0.50 * h},
        {"role": PANEL, "x": box_x, "y": box_y, "w": box_w, "h": box_h, "r": 0.052 * h},
        {"role": EDGE, "x1": box_x + 0.057 * box_w, "y1": box_y,
         "x2": box_x + 0.943 * box_w, "y2": box_y},
    ]

    # Seven lines, one of which is the instruction. Index 3 keeps it in the middle of the stack:
    # first or last would read as a heading or a footnote, which is the opposite of the point.
    speaking = 3
    rows, row_h = 7, 0.021 * h
    row_top, row_step = box_y + 0.160 * box_h, 0.115 * box_h
    # The marked row is not the longest and not the shortest — its width sits among the others.
    widths = [0.836, 0.702, 0.615, 0.744, 0.788, 0.660, 0.810]
    for i, share in enumerate(widths):
        shapes.append({
            "role": MARK if i == speaking else ROW,
            "x": box_x + 0.089 * box_w, "y": row_top + i * row_step,
            "w": share * box_w, "h": row_h,
            "opacity": 1.0 if i == speaking else 0.30 + 0.06 * (i % 3),
        })

    shapes.append({"role": EDGE, "x1": gate, "y1": box_y - 0.062 * h,
                   "x2": gate, "y2": box_y + box_h + 0.062 * h})

    # The stream leaves the marked row and only that one. Even spacing, because this is a sequence
    # of steps and not a dispersion: an action that carries through, not data blowing away.
    y = row_top + speaking * row_step + row_h / 2
    # The margin on the right is wider than the square, so the last one stops short of the edge
    # instead of touching it: a stream that runs off the canvas reads as cropped, not as arriving.
    x, step = gate + 0.032 * w, 0.042 * w
    while x < w - 0.058 * w:
        travel = (x - gate) / (w - gate)
        size = (0.0075 + 0.0080 * travel) * w
        shapes.append({
            "role": PACKET,
            "x": x, "y": y - size / 2, "size": size,
            "opacity": min(1.0, 0.34 + 0.72 * travel),
        })
        x += step

    return shapes


# The registry the renderers read. A new article needs a drawing here and an "art" entry with
# title and desc in content.py — build.py stops if it finds one without the other.
ARTICLE_ART = {
    "ai-act-dati-clienti": perimeter,
    "durabilita-per-progetto": lifespan,
    "telefono-come-sensore": inventory,
    "agenti-autonomi-perimetro": directive,
}
