# -*- coding: utf-8 -*-
"""Model-facing images for generating sprite sheets with an image AI.

Three files, all named `modello-*` so the sprite converter skips them by name:

  modello-ai.png       the empty template, with no text anywhere on it
  modello-esempio.png  the same template with the CURRENT character painted in, cell by cell
  modello-testa.png    a close-up pair: the head done right (blocky) and done wrong (smooth)

Two lessons from the sheets that came back wrong, and this script exists to encode both.

**Text-free, because the model draws back whatever it sees.** The returned sheets reproduced
the template's own caption text as garbled glyphs across the bottom. Anything written on a
model-facing image is material the model may paint back at us; constraints belong in the
prompt, not on the canvas.

**A worked example, because editing preserves structure and generating does not.** Asked to
generate from rules, the model drifted outside the frames and invented layouts. Asked to
repaint an image that already has the layout, it keeps the layout. The example is painted
from `sprites.js` one cell at a time, so its grid discipline is exact by construction — and
running it back through `make_spronia_sprites.py` must reproduce the same frames, which is
checked after generation, in the shell, not trusted.

    python3 _src/make_spronia_examples.py
"""

import re
from pathlib import Path

from PIL import Image, ImageDraw

# Geometry and colours come from the template script rather than being repeated here: two
# copies of the frame layout is exactly the kind of pair that drifts apart quietly.
from make_spronia_template import (
    CELL, FW, FH, GUTTER, MARGIN, FONDO, TIP, _frame,
)

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "app" / "spronia" / "art"
SPRITES = ROOT / "app" / "spronia" / "run" / "sprites.js"

# Where the rule reads the lance tip, in sprite pixels. Taken from the template, which reads it
# from game.js — three copies of the same number was two too many.
TIP_COL = TIP[0]

INK_BG = (14, 16, 28)          # the dark backdrop of the comparison image


# -----------------------------------------------------------------------------------------------------------------
#  r e a d i n g   t h e   c u r r e n t   s p r i t e
# -----------------------------------------------------------------------------------------------------------------

def _sprites():
    """Palette, cycles and eye positions, read from the generated file.

    Read rather than re-derived: the example must show the character exactly as the game
    draws it, or it teaches the model something the converter will then undo.
    """
    src = SPRITES.read_text(encoding="utf-8")
    palette = re.findall(r'"(#[0-9a-fA-F]{6})",\s*//', src)
    # L'alfabeto dei caratteri, letto dal file generato invece che dato per scontato esadecimale.
    # Con una tavolozza di cinquantatré colori i simboli arrivano fino alla Q maiuscola, e
    # `int(ch, 16)` si ferma alla f.
    alfabeto = re.search(r'export const ALPHABET = "(.*?)";', src).group(1)

    def cycle(name):
        block = re.search(rf"const {name} = \[(.*?)\n\];", src, re.S).group(1)
        frames, current = [], []
        for line in block.splitlines():
            t = line.strip()
            if t.startswith('"'):
                current.append(t.strip('",'))
            elif t.startswith("]") and current:
                frames.append(current)
                current = []
        return frames

    eyes = re.search(r"walkEyes: (\[\[.*?\]\])", src)
    eye = None
    if eyes:
        first = re.search(r"\[(\d+), (\d+)\]", eyes.group(1))
        if first:
            eye = (int(first.group(1)), int(first.group(2)))
    return palette, cycle("WALK"), cycle("FLY"), eye, alfabeto


def _rightmost(frames):
    best = -1
    for f in frames:
        for row in f:
            for x in range(len(row) - 1, -1, -1):
                if row[x] != ".":
                    best = max(best, x)
                    break
    return best


# -----------------------------------------------------------------------------------------------------------------
#  p a i n t i n g
# -----------------------------------------------------------------------------------------------------------------

def _paint_cells(px, x0, y0, rows, palette, shift, alfabeto):
    """One sprite frame into the template grid, one full cell per sprite pixel.

    The character covers the guide lines where it is drawn — which is what a correct
    submission looks like: opaque paint, guides visible only on background.
    """
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            colour = palette[alfabeto.index(ch)]
            rgb = tuple(int(colour[i:i + 2], 16) for i in (1, 3, 5))
            cx, cy = x0 + (x + shift) * CELL, y0 + y * CELL
            for dy in range(CELL):
                for dx in range(CELL):
                    px[cx + dx, cy + dy] = rgb


def _canvas(rows_count):
    w = MARGIN * 2 + 4 * FW * CELL + 3 * GUTTER
    h = MARGIN * 2 + rows_count * FH * CELL + (rows_count - 1) * GUTTER
    return Image.new("RGB", (w, h), FONDO)


def _sheet(filled):
    """The two-band sheet: guides for the empty one, **no guides at all** for the example.

    The first model-facing example carried the full guide set — grid, crosshair, saddle line —
    and the model repainted all of it as content: the grid came back dark across the character,
    and the crosshair was fused into the lance, which came out green in all eight frames. Same
    lesson as the caption text: everything on a model-facing image risks being drawn back.

    The filled example needs none of it. The frame positions are taught by the painted frames
    themselves, and the cell discipline by the painted cells. Guides remain only on the empty
    template, which exists for starting a character from scratch.
    """
    palette, walk, fly, _, alfabeto = _sprites()
    img = _canvas(2)
    draw = ImageDraw.Draw(img)
    px = img.load()

    for r, cycle in enumerate((walk, fly)):
        y0 = MARGIN + r * (FH * CELL + GUTTER)
        # The walking frames are drawn a little short of the rule point; the flying ones sit
        # on it. The example must not contradict the rule, so each band is shifted to put its
        # lance tip in the rule's column.
        shift = max(0, TIP_COL - _rightmost(cycle))
        for c in range(4):
            x0 = MARGIN + c * (FW * CELL + GUTTER)
            if not filled:
                _frame(draw, x0, y0)
            elif c < len(cycle):
                _paint_cells(px, x0, y0, cycle[c], palette, shift, alfabeto)
    return img


# -----------------------------------------------------------------------------------------------------------------
#  t h e   h e a d ,   r i g h t   a n d   w r o n g
# -----------------------------------------------------------------------------------------------------------------

def _head_right(scale=20):
    """The current head, blocky, straight from the game's own pixels."""
    palette, walk, _, eye, alfabeto = _sprites()
    ex, ey = eye if eye else (28, 4)
    x0, x1 = max(0, ex - 9), ex + 13
    y0, y1 = max(0, ey - 5), min(len(walk[0]), ey + 11)
    img = Image.new("RGB", ((x1 - x0) * scale, (y1 - y0) * scale), INK_BG)
    px = img.load()
    for y in range(y0, y1):
        row = walk[0][y]
        for x in range(x0, min(x1, len(row))):
            if row[x] == ".":
                continue
            colour = palette[alfabeto.index(row[x])]
            rgb = tuple(int(colour[i:i + 2], 16) for i in (1, 3, 5))
            for dy in range(scale):
                for dx in range(scale):
                    px[(x - x0) * scale + dx, (y - y0) * scale + dy] = rgb
    return img


def _head_wrong(target_width):
    """The smooth head from the sheet that degraded, cropped from the original upload.

    Coordinates measured on that sheet: grid step 11.17 px, origin 8, head around art
    cells (26..46, 6..20). If the upload is gone, the panel is skipped rather than faked.
    """
    candidates = sorted(Path("/sessions/wonderful-hopeful-cerf/mnt/uploads").glob("*kj4ep5*"))
    if not candidates:
        return None
    src = Image.open(candidates[0]).convert("RGB")
    step, off = 11.17, 8
    box = (int(off + 26 * step), int(off + 6 * step), int(off + 46 * step), int(off + 20 * step))
    crop = src.crop(box)
    height = int(crop.height * target_width / crop.width)
    return crop.resize((target_width, height), Image.NEAREST)


def _mark(draw, x, y, ok):
    """A check or a cross, as shapes: words on a model-facing image invite regurgitation."""
    if ok:
        draw.line([(x, y + 14), (x + 10, y + 24), (x + 30, y)], fill=(242, 246, 250), width=6)
    else:
        draw.line([(x, y), (x + 26, y + 26)], fill=(237, 13, 8), width=6)
        draw.line([(x + 26, y), (x, y + 26)], fill=(237, 13, 8), width=6)


def _comparison():
    right = _head_right()
    wrong = _head_wrong(right.width)
    pad, header = 20, 44
    height = header + max(right.height, wrong.height if wrong else 0) + pad * 2
    img = Image.new("RGB", (right.width * 2 + pad * 3, height), INK_BG)
    draw = ImageDraw.Draw(img)
    img.paste(right, (pad, header + pad))
    _mark(draw, pad + 6, 12, ok=True)
    if wrong is not None:
        img.paste(wrong, (right.width + pad * 2, header + pad))
        _mark(draw, right.width + pad * 2 + 6, 10, ok=False)
    return img


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def main():
    empty = _sheet(filled=False)
    empty.save(ART / "modello-ai.png")
    print(f"  modello-ai.png       {empty.size[0]} x {empty.size[1]}  (vuoto, senza testo)")

    filled = _sheet(filled=True)
    filled.save(ART / "modello-esempio.png")
    print(f"  modello-esempio.png  {filled.size[0]} x {filled.size[1]}  (il personaggio attuale)")

    comparison = _comparison()
    comparison.save(ART / "modello-testa.png")
    print(f"  modello-testa.png    {comparison.size[0]} x {comparison.size[1]}  (giusta / sbagliata)")


if __name__ == "__main__":
    main()
