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

import math

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


def separation(w=BANNER_W, h=BANNER_H):
    """The same document assembled twice: the dated lines mixed in, and the dated lines gathered.

    Left of the divider, the marked rows sit among the plain ones — the page where a value that
    expires is buried in a sentence that does not. Right of it, the same rows, with the marked ones
    collected into a block of their own at the foot of the stack. Nothing is added and nothing is
    removed: only the arrangement changes, which is the whole argument.

    The two stacks hold the same number of rows and the same widths, so a reader comparing them
    sees one difference and not several.

    Same rules as the other drawings: no text, no random numbers, parametric on width and height.
    """
    box_x, box_y = 0.040 * w, 0.157 * h
    box_w, box_h = 0.920 * w, 0.686 * h
    mid = box_x + box_w / 2

    shapes = [
        {"role": GLOW, "cx": 0.72 * w, "cy": 0.50 * h, "rx": 0.32 * w, "ry": 0.50 * h},
        {"role": PANEL, "x": box_x, "y": box_y, "w": box_w, "h": box_h, "r": 0.052 * h},
        {"role": EDGE, "x1": box_x + 0.057 * box_w, "y1": box_y,
         "x2": box_x + 0.943 * box_w, "y2": box_y},
    ]

    # Six rows per stack. Seven came out as hairlines on the card band, which is much flatter than
    # the banner, and a row nobody can see is a row that is not in the drawing.
    rows, row_h = 6, 0.024 * h
    row_top, row_step = box_y + 0.150 * box_h, 0.135 * box_h
    stack_w = box_w / 2 - 0.075 * box_w
    widths = [0.880, 0.700, 0.940, 0.640, 0.820, 0.760]
    # Which rows carry a value with an expiry date. Interleaved on the left, so they read as buried
    # in the text; the same three, gathered at the foot of the stack, on the right.
    mixed = {1, 3, 4}
    gathered = {3, 4, 5}

    for side, marked in ((0, mixed), (1, gathered)):
        stack_x = box_x + 0.050 * box_w + side * (box_w / 2)
        # Right of the divider the rows keep their widths and follow a new order: an exact
        # permutation, the plain rows first and the dated ones after. The two stacks have to be
        # the same six lines rearranged, or the drawing argues for rewriting the document instead
        # of reassembling it, which is the opposite of the point.
        order = range(rows) if side == 0 else [0, 2, 5, 1, 3, 4]
        for i, src in enumerate(order):
            shapes.append({
                "role": MARK if i in marked else ROW,
                "x": stack_x, "y": row_top + i * row_step,
                "w": widths[src] * stack_w, "h": row_h,
                "opacity": 1.0 if i in marked else 0.30 + 0.06 * (src % 3),
            })

    # The divider, drawn past the enclosure on both sides so it reads as a fold and not as a wall.
    shapes.append({"role": EDGE, "x1": mid, "y1": box_y - 0.062 * h,
                   "x2": mid, "y2": box_y + box_h + 0.062 * h})
    return shapes


def chain(w=BANNER_W, h=BANNER_H):
    """The same reading, once with a chain above it and once without.

    Two columns end in an identical accent bar: the number a person reads, the same on both
    screens. Above the left one, the links are joined by an unbroken line that runs all the way
    down — the documented chain of calibrations. Above the right one, the line stops after the
    first step and what follows drifts off the axis and fades.

    The two endpoints have to be identical in size, colour and position, or the drawing argues
    that the bad device shows a worse number, which is the opposite of the point: it shows the
    same number.

    Same rules as the other drawings: no text, no random numbers, parametric on width and height.
    """
    box_x, box_y = 0.040 * w, 0.157 * h
    box_w, box_h = 0.920 * w, 0.686 * h
    mid = box_x + box_w / 2

    shapes = [
        {"role": GLOW, "cx": 0.28 * w, "cy": 0.50 * h, "rx": 0.32 * w, "ry": 0.50 * h},
        {"role": PANEL, "x": box_x, "y": box_y, "w": box_w, "h": box_h, "r": 0.052 * h},
        {"role": EDGE, "x1": box_x + 0.057 * box_w, "y1": box_y,
         "x2": box_x + 0.943 * box_w, "y2": box_y},
    ]

    # Four links, not more: the card band is far flatter than the banner, and a fifth step would
    # come out as a hairline nobody can see.
    links = 4
    top = box_y + 0.165 * box_h
    step_y = (box_h * 0.660) / (links - 1)
    # Bars rather than squares, so the two renderers agree: the card rounds them by half their
    # height, and a square would become a circle there and stay a rounded square in the SVG.
    link_h = min(0.34 * step_y, 0.055 * h)
    link_w = 0.085 * box_w
    # Where the chain gives out on the right. The first step is drawn, so the column reads as a
    # chain that stops rather than as a column that never had one.
    breaks_after = 1

    for side, unbroken in ((0, True), (1, False)):
        col = box_x + (0.27 + 0.46 * side) * box_w
        for i in range(links):
            y = top + i * step_y
            if i == links - 1:
                # the reading itself, identical on both sides
                shapes.append({"role": MARK, "x": col - link_w / 2, "y": y - link_h / 2,
                               "w": link_w, "h": link_h, "opacity": 1.0})
                continue
            # a step nobody wrote down slides off the axis and fades
            loose = not unbroken and i > breaks_after
            drift = (0.052 * box_w) * (1 if i % 2 else -1) * (i / links) if loose else 0.0
            shapes.append({"role": ROW, "x": col + drift - link_w / 2, "y": y - link_h / 2,
                           "w": link_w, "h": link_h, "opacity": 0.18 if loose else 0.60})
            # the documented passage from one calibration to the next
            if unbroken or i < breaks_after:
                shapes.append({"role": EDGE, "x1": col, "y1": y + link_h / 2,
                               "x2": col, "y2": y + step_y - link_h / 2})

    # the divider between the two cases, drawn past the enclosure so it reads as a fold
    shapes.append({"role": EDGE, "x1": mid, "y1": box_y - 0.062 * h,
                   "x2": mid, "y2": box_y + box_h + 0.062 * h})
    return shapes


def signal(w=BANNER_W, h=BANNER_H):
    """Measurements read where they already are: a sampled trace that never leaves the enclosure.

    The drawing for the CSV viewer. Two channels share one axis and are plotted as discrete
    samples rather than as a smooth curve, for a reason that is not decorative: a CSV *is* a
    series of samples, and the square is already this site's mark for one piece of data.

    The contrast with `perimeter` is the whole point, and it is drawn with the same primitives.
    There, a line runs past the enclosure and the fragments cross it and fade. Here the two
    markers stop inside the panel and every sample stays within it: same visual language,
    opposite statement.

    The marked samples are the selected range — the interval the app can export. It is the one
    thing on the drawing that says this is a tool and not a chart.

    Same rules as the other drawings: no text, no random numbers, parametric on width and height.
    """
    box_x, box_y = 0.040 * w, 0.157 * h
    box_w, box_h = 0.920 * w, 0.686 * h

    shapes = [
        {"role": GLOW, "cx": 0.50 * w, "cy": 0.46 * h, "rx": 0.34 * w, "ry": 0.52 * h},
        {"role": PANEL, "x": box_x, "y": box_y, "w": box_w, "h": box_h, "r": 0.052 * h},
        {"role": EDGE, "x1": box_x + 0.057 * box_w, "y1": box_y,
         "x2": box_x + 0.943 * box_w, "y2": box_y},
    ]

    # The plotting area, inset from the enclosure on every side so no sample touches the border.
    plot_x, plot_w = box_x + 0.045 * box_w, 0.910 * box_w
    mid = box_y + 0.520 * box_h

    # How tall the enclosure is relative to its width, 0 on the card band and 1 on a square icon.
    # Everything below that has to change with the proportion reads this one number, so a banner
    # and an icon come out as the same drawing rather than one being a squashed copy of the other.
    tall = min(1.0, box_h / (0.42 * w))

    # The amplitude is capped against the width as well as the height. Left to the height alone, a
    # 512x512 icon sends the trace to the enclosure and turns the two markers into full-height
    # bars; capped against the width alone, the same icon comes out as a thin ribbon in an empty
    # square. The `tall` term is what lets the square fill and the band stay a band.
    amp = min(0.300 * box_h, 0.085 * w * (1.0 + 1.6 * tall))

    # Two channels on one axis, separated vertically. Overlaid they measured the same thing twice:
    # the samples interleaved and the pair read as a single fuzzy line, which is the opposite of
    # what the drawing is for.
    centre_a, centre_b = mid - 0.55 * amp, mid + 0.75 * amp

    # The selected range, as fractions of the plot width.
    sel_from, sel_to = 0.455, 0.680

    # Enough samples to read as a trace, few enough to stay separate. The three wide renditions
    # all take the same count; only a nearly square box thins out, because there the plotting area
    # is short and forty-four samples would crowd into a dotted line.
    count = round(44 - 18 * max(0.0, (tall - 0.55) / 0.45))
    size_a, size_b = 0.0105 * w, 0.0080 * w
    for i in range(count + 1):
        t = i / count
        x = plot_x + t * plot_w
        # Three frequencies on the first channel, two on the second, all with different phases:
        # enough to read as measured rather than drawn, and entirely deterministic — two builds
        # produce the same picture, and a rebuild never reshuffles it.
        y_a = centre_a - 0.55 * amp * (0.58 * math.sin(2 * math.pi * 1.45 * t + 0.40)
                                       + 0.28 * math.sin(2 * math.pi * 3.30 * t + 1.15)
                                       + 0.14 * math.sin(2 * math.pi * 7.10 * t + 2.60))
        y_b = centre_b - 0.38 * amp * (0.70 * math.sin(2 * math.pi * 0.85 * t + 2.05)
                                       + 0.30 * math.sin(2 * math.pi * 2.40 * t + 0.25))
        if sel_from <= t <= sel_to:
            shapes.append({"role": MARK, "x": x - size_a / 2, "y": y_a - size_a / 2,
                           "w": size_a, "h": size_a, "opacity": 1.0})
        else:
            shapes.append({"role": PACKET, "x": x - size_a / 2, "y": y_a - size_a / 2,
                           "size": size_a, "opacity": 0.55})
        # The second channel is quieter on purpose: it is there to say "more than one", not to be
        # read alongside the first.
        shapes.append({"role": PACKET, "x": x - size_b / 2, "y": y_b - size_b / 2,
                       "size": size_b, "opacity": 0.30})

    # The two edges of the selection. Unlike every other vertical line in these drawings they stop
    # short of the enclosure instead of running past it, and they are measured against the data
    # rather than against the panel: they mark a range, they do not cut anything.
    for t in (sel_from, sel_to):
        x = plot_x + t * plot_w
        shapes.append({"role": EDGE, "x1": x, "y1": mid - 1.45 * amp,
                       "x2": x, "y2": mid + 1.45 * amp})

    return shapes


# The registry the renderers read. A new article needs a drawing here and an "art" entry with
# title and desc in content.py — build.py stops if it finds one without the other.
ARTICLE_ART = {
    "ai-act-dati-clienti": perimeter,
    "durabilita-per-progetto": lifespan,
    "telefono-come-sensore": inventory,
    "agenti-autonomi-perimetro": directive,
    "documentazione-che-non-invecchia": separation,
    "numero-o-misura": chain,
}

# The same registry for the apps, kept separate from the articles' one. Two keys could collide —
# an article and an app may well be about the same subject — and a shared dictionary would let one
# silently take the other's drawing.
#
# These drawings serve the banner, the card thumbnail and the social card. They do NOT serve the
# manifest icons, and the attempt is on record because it looked obvious: asked for a square, the
# trace fills it correctly and still fails, because an icon has to read at 48px and a chart cannot.
# An icon needs its own rendition, sharing the motif and dropping the detail.
APP_ART = {
    "csv-scope": signal,
}
