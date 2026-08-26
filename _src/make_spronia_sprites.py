# -*- coding: utf-8 -*-
"""Turn the hand-made sprite sheet into the character rows the game reads.

The art is drawn outside this repository and lands in `app/spronia/art/` as an image. This script
recovers its pixel grid, reduces it to a small palette, cuts the frames apart and writes
`app/spronia/run/sprites.js`.

Why a script rather than a hand transcription: the sheet has about fifteen thousand pixels in it,
and a transcription is a thing that can be wrong in one place and stay wrong for ever. This way the
conversion is repeatable — redraw the sheet, run this, and the game changes.

Why character rows rather than shipping the image: the file served is the source. Somebody opening
`sprites.js` sees the dodo laid out in a grid they can read and edit, the app carries no binary
asset nobody can diff, and a sprite becomes something a test can assert about. The cost is a large
generated file, which is the right thing to pay.

The recovery is not trivial and the reason is worth stating: the sheet arrives as a JPEG, so every
flat block of colour has been smeared into dozens of near-identical ones. What makes it recoverable
is that the drawing is on a clean grid with hard edges — measured, not assumed, in `_grid()` — so
each block can be collapsed to its median colour and then snapped to a palette.

Usage:  python3 _src/make_spronia_sprites.py
"""

import colorsys
import re
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "app" / "spronia" / "art"
OUT = ROOT / "app" / "spronia" / "run" / "sprites.js"

# How many world units one drawn pixel is worth. Must agree with PIXEL in game.js, and the check at
# the bottom of this file refuses to write a file that disagrees.
CELL = 2

# The palette size, and it only applies to a sheet that needs quantising. Fourteen was chosen by
# measuring on a JPEG: ten and twelve lose the difference between the dodo's browns, sixteen starts
# splitting hairs the compressor invented. A clean sheet skips this entirely — its palette is read
# off the drawing, exact, however many colours the author used.
COLOURS = 14

# The characters a colour can take in the output, in palette order. Digits, then lower case, then
# upper: sixty-two, and the order keeps a small palette looking like hex in a diff.
#
# It was sixteen, and sixteen was a ceiling nobody had noticed setting. A drawing delivered as a
# clean PNG carries its own palette, and the only reason to quantise it is that the alphabet ran
# out — which is a fact about this file, not about the artwork. The blue rider arrived with
# fifty-three colours; at sixteen symbols it would have been squeezed into fourteen and the answer
# to "can we use exactly these colours" would have been no, for no reason worth having.
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def chars_preview(palette, index):
    r, g, b = palette[index]
    return f"#{r:02x}{g:02x}{b:02x}"


def json_list(points):
    """A JavaScript array of points, with `null` where a frame has none."""
    inner = ", ".join("null" if p is None else f"[{p[0]}, {p[1]}]" for p in points)
    return "[" + inner + "]"


# The bands of the sheet, top to bottom, and what each is for. "walk-left" is deliberately absent:
# it is drawn on the sheet, and it is a 91–93% mirror of "walk-right", so it is dropped and mirrored
# at paint time instead. Two copies of the same pose are two things that can drift apart, and the
# one that drifts is always the one nobody is looking at.
BANDS = ["walk", None, "fly"]

# …and the same sheet without it. A new sheet has no reason to carry a band that is thrown away, and
# demanding one would mean asking somebody to draw four frames so that a script can ignore them.
BANDS_SHORT = ["walk", "fly"]


def _layout(found):
    """Which band means what, given how many were found.

    Two or three, and nothing else. Any other count is a sheet that does not say what it is, and
    guessing at that point produces a game with the flying cycle in the walking slot — which looks
    like a physics defect and is read as one for an afternoon.
    """
    if found == len(BANDS):
        return BANDS
    if found == len(BANDS_SHORT):
        return BANDS_SHORT
    raise SystemExit(f"attese due o tre bande, trovate {found}: il foglio non dice cos'è")


# -----------------------------------------------------------------------------------------------------------------
#  t h e   g r i d
# -----------------------------------------------------------------------------------------------------------------

def _grid(a):
    """Find the size and origin of the drawing's pixel grid, by measuring rather than assuming.

    Measured from **where the colour changes**, not from how uniform a cell is. The uniformity
    version was written first and is quietly wrong: a smaller cell is trivially more uniform than a
    larger one, so the search always ran to the bottom of its range and reported a step half the
    real one. Nothing about the output said so — the sprites simply came out at twice the size.

    What is invariant is the spacing between edges: in a drawing on a grid, every colour change sits
    on a multiple of the cell. So the cell is the largest value that most of the observed gaps are a
    multiple of.
    """
    h, w, _ = a.shape
    gaps = []
    for y in range(int(h * 0.15), int(h * 0.9), 7):
        d = np.abs(np.diff(a[y], axis=0)).sum(axis=1)
        edges = np.where(d > 40)[0]
        gaps.extend(np.diff(edges).tolist())
    for x in range(int(w * 0.15), int(w * 0.9), 7):
        d = np.abs(np.diff(a[:, x], axis=0)).sum(axis=1)
        edges = np.where(d > 40)[0]
        gaps.extend(np.diff(edges).tolist())
    gaps = np.array([g for g in gaps if 3 <= g <= 60])
    if len(gaps) < 20:
        raise SystemExit("non trovo abbastanza bordi: il foglio è sfocato o non è pixel art")

    # The best cell is the one most gaps are a whole multiple of. Ties break on **how well** the
    # matching gaps fit, and only then on size. Both tie-breaks earned their place:
    #
    #  - size beats nothing, because every divisor of the true cell also fits — the first version
    #    had no tie-break and reported half the real step;
    #  - fit beats size, because on a **flawless** sheet every step from 12.00 to about 12.3
    #    explains the small gaps within tolerance, and "larger wins" picked the top of that
    #    plateau: 12.29 on a sheet drawn at exactly 12. The skewed grid then sliced whole
    #    columns off the frames. Found by round-tripping a generated sheet, where the truth
    #    is known — noisy hand-drawn sheets had always hidden this, because their plateau
    #    is only one candidate wide.
    best = None
    for cell in np.arange(4.0, 30.0, 0.01):
        k = gaps / cell
        fit = np.abs(k - np.round(k))
        hits = fit < 0.12
        score = hits.mean()
        err = fit[hits].mean() if hits.any() else 1.0
        if best is None or score > best[0] + 1e-9 \
                or (abs(score - best[0]) < 1e-9 and err < best[1] - 1e-4) \
                or (abs(score - best[0]) < 1e-9 and abs(err - best[1]) < 1e-4 and cell > best[2]):
            best = (score, err, cell)
    cell = best[2]

    # The origin: the offset that puts the most edges on a cell boundary.
    d = np.abs(np.diff(a[int(h * 0.5)], axis=0)).sum(axis=1)
    edges = np.where(d > 40)[0]
    off_best = None
    for off in np.arange(0, cell, 0.25):
        k = (edges - off) / cell
        score = (np.abs(k - np.round(k)) < 0.15).mean()
        if off_best is None or score > off_best[0]:
            off_best = (score, off)
    return cell, off_best[1], best[0]


def _reduce(a, step, off):
    """One drawn pixel per grid cell, taken as the median so JPEG ringing at the edges is ignored."""
    h, w, _ = a.shape
    rows, cols = int((h - off) / step), int((w - off) / step)
    art = np.zeros((rows, cols, 3), dtype=int)
    inset = max(2, int(step * 0.2))
    for gy in range(rows):
        for gx in range(cols):
            x0, y0 = int(off + gx * step), int(off + gy * step)
            blk = a[y0 + inset:y0 + int(step) - inset, x0 + inset:x0 + int(step) - inset]
            art[gy, gx] = np.median(blk.reshape(-1, 3), axis=0) if blk.size else 255
    return art


# -----------------------------------------------------------------------------------------------------------------
#  t h e   p a l e t t e
# -----------------------------------------------------------------------------------------------------------------

def _paper(a):
    """Il colore della carta, misurato sul bordo del foglio invece che dato per scontato.

    Il primo foglio era su carta bianca e il fondo si riconosceva con «quasi 255 su tutti e tre i
    canali». Ma un foglio consegnato **sul fondo del gioco** — che è la cosa naturale da fare quando
    si ritocca la pixel art guardandola come si vedrà — ha la carta quasi nera, e quella riga non
    trovava nessun fondo: tutto diventava disegno, compresi tre quarti di rettangolo vuoto.

    Il bordo dell'immagine è carta per costruzione: nessuno disegna attaccato al margine.
    """
    bordo = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    comune = Counter(map(tuple, bordo)).most_common(1)[0][0]
    return np.array(comune)


def _dering(art, background, carta, rounds=2):
    """Strip the JPEG's halo: the rim of near-white where the drawing meets the paper.

    It is not a subtlety. Measured on the first conversion, the lightest colour in the palette had
    sixty-four of its sixty-seven pixels touching the background and forty-six with no neighbour of
    their own colour — a scatter of pale dots around every silhouette, which on screen reads as a
    bad outline. Worse, the palette had spent a whole slot describing it.

    So this runs **before** the palette is computed, and the test is structural rather than a
    threshold on lightness: a pixel that touches the paper, is lighter than the drawing it is
    attached to, and has no company of its own shade, is ringing. Two passes, because removing the
    outer rim exposes a fainter one under it.
    """
    bg = background.copy()

    # **Vicinanza alla carta, non luminosità.** L'alone del JPEG sta fra il disegno e il fondo, quindi
    # somiglia al fondo — e questo è vero qualunque colore abbia il fondo. Scritto come «più chiaro
    # del disegno» funzionava su carta bianca; girato in «più scuro» quando il fondo è scuro
    # funzionava su quello. Su un fondo **verde** non funziona in nessuno dei due versi, perché la
    # sua luminanza cade in mezzo a quella del disegno: lo stesso alone è più chiaro dei bruni scuri
    # e più scuro di quelli chiari. Il sintomo era esplicito — la lancia usciva verde, cioè un pezzo
    # di alone si era preso un posto in tavolozza.
    #
    # La distanza dal colore della carta non ha versi da scegliere e vale per tutti e tre i casi.
    vicino_carta = np.abs(art - carta).sum(axis=2)

    def shifted(field, fill):
        pad = np.pad(field, 1, constant_values=fill)
        return pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]

    for _ in range(rounds):
        up, down, left, right = shifted(bg, True)
        touching = (up | down | left | right) & ~bg

        # Il disegno a cui questo pixel è attaccato: il vicino d'inchiostro più lontano dalla carta.
        lu, ld, ll, lr = shifted(np.where(bg, -1e9, vicino_carta), -1e9)
        paler = vicino_carta < np.maximum.reduce([lu, ld, ll, lr]) - 28

        # …but a pixel with a neighbour of nearly its own colour is part of something, not a stray
        # halo. Without this the lance loses pixels: it is one pixel thick, so every pixel of it
        # touches paper above and below, and it is lighter than the dodo it crosses. The first
        # version of this pass broke it in two places — a gap in a thin line, which is exactly the
        # kind of defect that survives a screenshot and dies on a zoom.
        near = np.zeros_like(bg)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            rolled = np.roll(np.roll(art, dy, axis=0), dx, axis=1)
            rolled_bg = np.roll(np.roll(bg, dy, axis=0), dx, axis=1)
            same = (np.abs(rolled - art).sum(axis=2) < 40) & ~rolled_bg
            near |= same

        bg |= touching & paler & ~near
    return bg


def _recover(art, a, step, off, background, share=0.15, jump=70, sprawl=2.2):
    """Bring back the features the median swallows because they are finer than a cell.

    `_reduce` takes the median of each cell, and that is the right default: it is what makes the
    reduction immune to JPEG ringing, which is a thin bright rim and never a majority. But a median
    is a majority vote, so **anything drawn smaller than half a cell loses the vote** and vanishes
    without a trace — no error, no warning, just a feature that is not there any more.

    Measured on this sheet, at the dodo's eye: the white is **five source pixels wide against a cell
    of 11.06**, and the pupil beside it is another five. Two ink-black and paper-white bars, each
    0.45 of a cell, sitting inside two adjacent cells whose median is the grey of the head. So the
    bird came out blank — and it stayed blank through every attempt to tune the passes downstream,
    because by then there was nothing left to tune.

    What this restores is narrow: a cell keeps its extreme, rather than its median, when a compact
    run of near-white or near-black covers at least `share` of it. Two guards keep it from becoming
    a general brightener:

      - **Only inside the drawing.** A cell touching the paper is excluded, because that is exactly
        where the compressor's halo lives — bright, thin, and against white. Ringing never happens
        in the middle of a silhouette.
      - **Black wins ties.** Where both extremes are present the cell is a boundary, and an outline
        read as a highlight is the more visible mistake of the two.
    """
    lum = a @ np.array([0.2126, 0.7152, 0.0722])
    rows, cols = background.shape
    out = art.copy()
    touched = 0
    for gy in range(1, rows - 1):
        for gx in range(1, cols - 1):
            if background[gy, gx]:
                continue
            if background[gy - 1:gy + 2, gx - 1:gx + 2].any():
                continue                                   # sul bordo: lì vive l'alone del JPEG
            y0, x0 = int(off + gy * step), int(off + gx * step)
            blk = lum[y0:y0 + int(step), x0:x0 + int(step)]
            pix = a[y0:y0 + int(step), x0:x0 + int(step)]
            if blk.size == 0:
                continue
            mediana = float(np.median(blk))
            scuro, chiaro = blk < 45, blk > 200
            for maschera in (scuro, chiaro):
                if maschera.mean() < share:
                    continue
                # E deve essere un salto, non una sfumatura: se l'estremo è vicino alla mediana la
                # cella è già del suo colore, e sostituirla non ripristina niente — schiarisce e
                # basta. È la differenza fra recuperare un occhio e slavare una testa.
                if abs(float(blk[maschera].mean()) - mediana) < jump:
                    continue
                # E deve essere **una barra, non una spruzzata**. Quello che il disegnatore ha
                # tracciato più fine della cella resta comunque un tratto compatto; il rumore del
                # JPEG dentro una campitura è sparso. Si misura con l'area del rettangolo che
                # contiene i pixel estremi: per una barra vale poco più del loro numero.
                ys, xs = np.nonzero(maschera)
                area = (ys.max() - ys.min() + 1) * (xs.max() - xs.min() + 1)
                if area > sprawl * maschera.sum():
                    continue
                out[gy, gx] = pix[maschera].mean(axis=0).round()
                touched += 1
                break
    return out, touched


def _palette(pixels, k, seed=7):
    """k-means over the colours that are actually drawn, background excluded.

    Quantising the whole sheet was tried and is wrong: three quarters of it is white paper, so a
    median cut spends most of its palette splitting white into eight shades of white.
    """
    rng = np.random.default_rng(seed)
    sample = pixels[rng.choice(len(pixels), min(8000, len(pixels)), replace=False)]
    centres = sample[rng.choice(len(sample), k, replace=False)].astype(float)
    for _ in range(40):
        d = ((sample[:, None, :] - centres[None, :, :]) ** 2).sum(axis=2)
        label = d.argmin(axis=1)
        for i in range(k):
            m = label == i
            if m.any():
                centres[i] = sample[m].mean(axis=0)
    # Sorted dark to light, so the palette reads as a ramp and a diff of it means something.
    centres = centres[np.argsort(centres.sum(axis=1))]
    return centres.round().astype(int)


def _snap(art, palette, background):
    """Every drawn pixel to its nearest palette entry; background to -1."""
    flat = art.reshape(-1, 3)
    d = ((flat[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2)
    idx = d.argmin(axis=1).reshape(art.shape[:2])
    idx[background] = -1
    return idx


# -----------------------------------------------------------------------------------------------------------------
#  t h e   f r a m e s
# -----------------------------------------------------------------------------------------------------------------

def _bands(ink, min_height=20):
    out, y, rows = [], 0, ink.shape[0]
    while y < rows:
        if ink[y].any():
            y0 = y
            while y < rows and ink[y].any():
                y += 1
            if y - y0 >= min_height:
                out.append((y0, y))
        else:
            y += 1
    return out


def _columns(ink, y0, y1, min_width=8):
    out, x, cols = [], 0, ink.shape[1]
    col = ink[y0:y1].any(axis=0)
    while x < cols:
        if col[x]:
            x0 = x
            while x < cols and col[x]:
                x += 1
            if x - x0 >= min_width:
                out.append((x0, x))
        else:
            x += 1
    return out


def _align(frames):
    """Put every frame in one box, lined up on **the lance**.

    Without this the frames are cut to their own bounding boxes, which differ because a wing sticks
    out further in one pose than another. Drawn on their own boxes, the dodo would shift under the
    player between frames — and a body that moves while the wings beat reads as bobbing, which is
    the one thing the animation must not do.

    The anchor was the ink's centre of mass, and it held until the wings arrived. A wing is two
    hundred pixels that appear on one side of the bird and vanish the next frame: the centre of mass
    walks after them, so the same drawn lance landed on four different rows — measured, from row 17
    to row 25, and from column 58 to column 62. The rule reads the tip at one fixed point of the
    box, so four tips in four places means four different rules, and nothing on screen says which
    one is being used.

    The lance is the right anchor because it is the one thing in the drawing that **cannot** move:
    it is rigid, it is couched under the same arm in every pose, and it is what the fight compares.
    It is found as the longest horizontal run of the frame — sixty pixels against the fifteen of a
    wing, so there is nothing to disambiguate — and every frame is placed so that run's right end
    falls on the same cell.
    """
    ancore = []
    for f in frames:
        ink = f >= 0
        migliore = (0, 0, 0)                        # lunghezza, riga, ultima colonna
        for y in range(f.shape[0]):
            corsa = 0
            for x in range(f.shape[1]):
                corsa = corsa + 1 if ink[y, x] else 0
                if corsa > migliore[0]:
                    migliore = (corsa, y, x)
        ancore.append((migliore[2], migliore[1]))
    left = [a[0] for a in ancore]
    top = [a[1] for a in ancore]
    w = max(f.shape[1] - l for f, l in zip(frames, left)) + max(left)
    h = max(f.shape[0] - t for f, t in zip(frames, top)) + max(top)
    w += w % 2                                    # even, so the box divides by CELL cleanly
    h += h % 2
    out = []
    for f, l, t in zip(frames, left, top):
        canvas = np.full((h, w), -1, dtype=int)
        ox, oy = max(left) - l, max(top) - t
        canvas[oy:oy + f.shape[0], ox:ox + f.shape[1]] = f
        out.append(canvas)
    return out


def _depale(frame, palette, pale_ranks=2, min_blob=5):
    """Drop small pale blobs stuck to the silhouette; keep the long pale strokes.

    What is left after `_dering` is the halo the ring pass had to spare. That pass protects any pixel
    with a neighbour of nearly its own colour, because without the protection it eats the lance —
    one pixel thick, paper above and below, lighter than the dodo it crosses. The protection also
    saves two- and three-pixel clots of near-white sitting on the plume and the crown of the head,
    which is what a player sees as a white glint.

    So the distinction here is **size**, not colour: measured on this sheet, the near-white gathers
    fourteen pixels along the lance — a stroke — and seventeen scattered in twos and threes along the
    top edge. A highlight somebody drew is either large or long; a pair of pale dots on a silhouette
    is a compressor artefact.
    """
    lum = palette @ np.array([0.2126, 0.7152, 0.0722])
    pale = set(np.argsort(lum)[-pale_ranks:].tolist())
    dark = set(np.argsort(lum)[:2].tolist())

    rows, cols = frame.shape
    seen = np.zeros_like(frame, dtype=bool)
    out = frame.copy()
    for y0 in range(rows):
        for x0 in range(cols):
            if seen[y0, x0] or frame[y0, x0] not in pale:
                continue
            blob, stack = [], [(y0, x0)]
            seen[y0, x0] = True
            while stack:
                y, x = stack.pop()
                blob.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < rows and 0 <= nx < cols and not seen[ny, nx] \
                                and frame[ny, nx] in pale:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            if len(blob) >= min_blob:
                continue                                   # a stroke, or a real highlight

            # …and a small pale blob touching something *very dark* is not halo either: it is an eye.
            # The compressor's ringing sits between the drawing and the white paper, so it is always
            # bounded by mid-tones on one side and by nothing on the other. White against black does
            # not happen by accident.
            #
            # This clause is here because the pass without it ate the dodo's eye — a white oval two
            # pixels tall with a pupil beside it — and nothing said so. The bird simply looked
            # blank, and it took someone asking for a blink to notice the eye had gone.
            if any(frame[ny, nx] in dark
                   for y, x in blob
                   for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                   for ny, nx in [(y + dy, x + dx)]
                   if 0 <= ny < rows and 0 <= nx < cols):
                continue
            # Too small to be drawn on purpose: take the commonest darker colour around it.
            around = []
            for y, x in blob:
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < rows and 0 <= nx < cols and frame[ny, nx] >= 0 \
                                and frame[ny, nx] not in pale:
                            around.append(frame[ny, nx])
            replacement = Counter(around).most_common(1)[0][0] if around else -1
            for y, x in blob:
                out[y, x] = replacement
    return out


def _despeckle(frame, palette):
    """Pull a lone pale pixel back to the shade of what surrounds it.

    Not a smoothing pass — it moves a pixel to a colour already present next to it, so the result is
    still made of the same palette and still has hard edges. What it removes is the single bright dot
    with nothing like it nearby, which after a JPEG is not a highlight the artist drew: it is a
    corner of the compressor's ringing that happened to land on a light entry.
    """
    out = frame.copy()
    rows, cols = frame.shape
    for y in range(rows):
        for x in range(cols):
            here = frame[y, x]
            if here < 0:
                continue
            neigh = [frame[y + dy, x + dx]
                     for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                     if (dy or dx) and 0 <= y + dy < rows and 0 <= x + dx < cols
                     and frame[y + dy, x + dx] >= 0]
            if len(neigh) < 3:
                continue
            if here in neigh:
                continue                                   # it has company: it is a shape
            lum = palette @ np.array([0.2126, 0.7152, 0.0722])
            if lum[here] < max(lum[n] for n in neigh) + 25:
                continue                                   # not conspicuously paler
            out[y, x] = Counter(neigh).most_common(1)[0][0]
    return out


def _stabilise(frames, palette, spread=200, inner_slack=1.5):
    """Make a pixel that never moves stop changing colour between frames.

    This is the fix for the defect a player sees as flickering. In the walk cycle the dodo's head is
    the same drawing in all four frames — only the legs move — but each frame went through the JPEG
    separately, so the same pixel of the same beak quantised to one shade here and the next shade
    there. Measured before this pass: seventy-four pixels in the walk cycle and ninety-one in the fly
    cycle stayed lit in every frame while their brightness wobbled, and the head and beak were the
    worst of it.

    Only pixels lit in **every** frame are touched, and only when the colours they take are close
    together. A pixel that swings from brown to bright red is a wing passing over a body, which is
    motion and has to survive; a pixel that wanders across three neighbouring tans is noise.

    The threshold was measured, not guessed. Across the wobbling pixels the spread in colour has a
    median around 150 and a seventy-fifth percentile near 220, while a wing crossing a body jumps 300
    and more. Two hundred separates the two. The first version used seventy, which caught only the
    tightest fifth of the noise and left the flicker visible — a threshold picked because it sounded
    cautious, which is the way to be wrong quietly.
    """
    stacked = np.stack(frames)
    lit = (stacked >= 0).all(axis=0)

    # Dentro la sagoma il movimento è raro, e per un po' ho creduto che fosse impossibile: un pixel
    # acceso in tutti i fotogrammi e circondato da pixel accesi non può essere un'ala che passa.
    # Quella regola, da sola, ha spappolato il cavaliere del terzo foglio — perché **lì il cavaliere
    # è animato davvero**: si china, il braccio si muove, e quei pixel stanno dentro la sagoma. Con
    # la sola condizione di stare dentro, ogni fotogramma veniva riportato al colore più comune e
    # l'animazione del cavaliere spariva insieme al rumore.
    #
    # Quindi «dentro» non basta e non sostituisce niente: **allarga la soglia, non la elimina**. Il
    # rumore di quantizzazione sposta un pixel al colore *vicino*; un disegno che cambia lo sposta a
    # un colore diverso. Chi sta dentro può permettersi uno scarto più largo perché lì il rumore è
    # più probabile del movimento, ma un salto grosso resta un disegno e va lasciato stare.
    inner = lit.copy()
    inner[1:, :] &= lit[:-1, :]
    inner[:-1, :] &= lit[1:, :]
    inner[:, 1:] &= lit[:, :-1]
    inner[:, :-1] &= lit[:, 1:]
    out = [f.copy() for f in frames]
    fixed = 0
    for y in range(stacked.shape[1]):
        for x in range(stacked.shape[2]):
            if not lit[y, x]:
                continue
            values = stacked[:, y, x]
            if len(set(values.tolist())) == 1:
                continue
            colours = palette[values]
            conteggio = Counter(values.tolist())
            mode, quanti = conteggio.most_common(1)[0]
            limite = spread * (inner_slack if inner[y, x] else 1)
            lontano = np.abs(colours[:, None, :] - colours[None, :, :]).sum(axis=2).max() > limite

            # La regola dello scarto singolo. Tutti i fotogrammi d'accordo tranne uno, e quell'uno è
            # **più estremo** degli altri: è il caso che nasce da `_recover`, che decide cella per
            # cella e in un fotogramma su quattro può trovare il tratto un pixel più in là. Un'ala
            # che passa sopra il corpo non si presenta così — cambia la sagoma, e la sagoma qui è
            # già esclusa perché si guardano solo i pixel accesi in tutti i fotogrammi.
            lum = palette @ np.array([0.2126, 0.7152, 0.0722])
            if lontano:
                if quanti != len(values) - 1:
                    continue                               # non è uno scarto solo: è movimento
                raro = next(v for v in values.tolist() if v != mode)
                if not (lum[raro] > lum[mode] + 60 or lum[raro] < lum[mode] - 60):
                    continue
            for f in out:
                f[y, x] = mode
            fixed += 1
    return out, fixed


def _livery(frames, palette):
    """Il colore del cavaliere, ricavato dal foglio invece che scritto qui.

    La prima versione cercava **il rosso**, perché il cavaliere del primo foglio era rosso. Con un
    foglio nuovo in cui l'armatura è azzurra, quella riga non ha smesso di funzionare: ha smesso di
    voler dire qualcosa. Cercava il colore della tavolozza più vicino a un rosso che non c'era, e
    quello che trovava era un marrone del piumaggio — così l'ancora del pennacchio saltava di
    ventitré pixel fra un fotogramma e l'altro, cioè esattamente il difetto che quella funzione era
    nata per togliere.

    Quello che il cavaliere ha sempre, qualunque colore porti, è di stare **in alto e dietro**. Lo
    sprite guarda a destra, quindi davanti c'è la testa della bestia e il cavaliere è seduto alle
    sue spalle: il suo colore vive nel quarto in alto a sinistra del riquadro, e nessun'altra parte
    del disegno ci vive.

    «Il più saturo in alto» è quello che c'era scritto prima, e ha retto un foglio solo. Sul dodo
    azzurro la cosa più satura in alto è **il becco** — un giallo da 153 di saturazione contro i 125
    dell'armatura, e tutto quanto nella metà superiore perché la testa sta lì. Il pennacchio è
    finito appeso al becco, staccato dal disegno, a mezz'aria davanti al muso. La saturazione resta
    nel punteggio perché serve a scartare i grigi e i bruni della bestia; a decidere è il quadrante.
    """
    alto = frames[0].shape[0] // 2
    meta = frames[0].shape[1] // 2
    best = None
    for i, colour in enumerate(palette):
        sat = int(colour.max() - colour.min())
        if sat < 60:
            continue
        dietro = quanti = 0
        for f in frames:
            hit = np.argwhere(f == i)
            if len(hit) == 0:
                continue
            quanti += len(hit)
            dietro += int(((hit[:, 0] < alto) & (hit[:, 1] < meta)).sum())
        if quanti < 8:
            continue
        score = sat * (dietro / quanti)
        if best is None or score > best[0]:
            best = (score, i)
    return best[1] if best else 0


def _sparks(frames, palette, pale_ranks=2):
    """Toglie i puntini chiarissimi che **non ci sono in tutti i fotogrammi**.

    Un pixel quasi bianco, solo, senza compagni del suo colore, è una di due cose: una lumeggiatura
    che il disegnatore ha messo lì, e allora sta ferma in tutta la posa; oppure residuo di
    compressione, e allora va e viene. Misurato sul secondo foglio: dei tredici puntini isolati,
    **zero** erano presenti in tutti e quattro i fotogrammi.

    È lo stesso ragionamento dello stabilizzatore, applicato alla comparsa invece che al colore: si
    guarda il ciclo, non il fotogramma. Una soglia sulla luminosità non poteva distinguerli, perché
    la luminosità è identica — è la stessa entrata di tavolozza.
    """
    lum = palette @ np.array([0.2126, 0.7152, 0.0722])
    ordine = np.argsort(lum).tolist()
    bianco = ordine[-1]                                       # il quasi bianco, il più vistoso
    pale = set(ordine[-pale_ranks:])
    out = [f.copy() for f in frames]
    tolti = 0
    rows, cols = frames[0].shape
    for y in range(rows):
        for x in range(cols):
            sempre = all(o[y, x] in pale for o in frames)
            biancoSempre = all(o[y, x] == bianco for o in frames)
            for i, f in enumerate(frames):
                if f[y, x] not in pale:
                    continue

                # **Per il quasi bianco non conta essere isolato: conta esserci sempre.**
                # La prima stesura toglieva solo i puntini soli, e le tracce vere non lo sono: una
                # riga di otto pixel sotto la lancia in un fotogramma su quattro, una riga verticale
                # sullo scudo in un altro. Misurato su questo foglio, l'unica cosa quasi bianca
                # presente in tutti e quattro i fotogrammi è **l'occhio**; tutto il resto lampeggia.
                if f[y, x] == bianco:
                    if biancoSempre:
                        continue
                elif sempre:
                    continue
                else:
                    vicini = [f[y + dy, x + dx] for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))
                              if 0 <= y + dy < rows and 0 <= x + dx < cols]
                    if any(v in pale for v in vicini):
                        continue                              # ha compagni del suo colore: è un tratto

                # Si prende il colore che quel punto ha negli altri fotogrammi. Dove negli altri non
                # c'è niente — succede sui bordi che si muovono — si ripiega sui vicini di questo,
                # perché lasciare il pixel com'è vuol dire lasciare il lampeggio, e spegnerlo del
                # tutto vuol dire bucare la sagoma.
                altri = [int(o[y, x]) for o in frames if o[y, x] >= 0 and o[y, x] not in pale]
                if not altri:
                    altri = [int(f[y + dy, x + dx]) for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))
                             if 0 <= y + dy < rows and 0 <= x + dx < cols
                             and f[y + dy, x + dx] >= 0 and f[y + dy, x + dx] not in pale]
                if altri:
                    out[i][y, x] = Counter(altri).most_common(1)[0][0]
                    tolti += 1
    return out, tolti


def _anchor(frame, palette, rider):
    """Where the pennant leaves the helmet, for one frame.

    Derived here rather than looked for at paint time, because it is a fact about the drawing and
    this file is the only one that reads the drawing.

    **Not the topmost pixel of the frame**, which is what the renderer used first and which is wrong
    in exactly the case that matters. Walking, the topmost pixel is the crest — column 14 in all four
    frames. Flying, it is a *wing tip*, and it jumps between columns 9, 10, 12 and 16 as the wings
    beat, so the pennant came away from the rider's head and flapped about above the bird.

    The rider is the only thing wearing the livery, so: find its topmost pixel, then climb to the top
    of the drawing in the few columns around it. That lands on the helmet, follows the rider as the
    pose leans forward in flight, and keeps working if the sheet is redrawn — provided `rider` was
    measured off the sheet too, which is what `_livery` is for.
    """
    hit = np.argwhere(frame == rider)
    if len(hit) == 0:
        first = np.argwhere(frame >= 0)
        return [int(first[0][1]), int(first[0][0])] if len(first) else [0, 0]
    ry, rx = hit[hit[:, 0].argmin()]

    for y in range(int(ry)):
        band = frame[y, max(0, int(rx) - 2):int(rx) + 4]
        lit = np.argwhere(band >= 0)
        if len(lit):
            return [max(0, int(rx) - 2) + int(lit[0][0]), y]
    return [int(rx), int(ry)]



def _longest_run(frame):
    """The longest horizontal run of one colour in a frame: on this sheet, that is the lance."""
    best = None
    rows, cols = frame.shape
    for y in range(rows):
        x = 0
        while x < cols:
            v = frame[y, x]
            if v < 0:
                x += 1
                continue
            j = x
            while j < cols and frame[y, j] == v:
                j += 1
            if best is None or j - x > best[2]:
                best = (y, x, j - x, int(v))
            x = j
    return best


def _lance_rows(frame, most=23, least=9):
    """Le righe che formano la lancia: quelle che arrivano fino alla punta del disegno.

    **La lancia non è «la corsa più lunga di un colore solo»**, che è come era definita prima e che
    ha funzionato finché il disegno la faceva di un colore solo. Sul secondo foglio l'asta ha una
    lumeggiatura chiara accanto: in volo il tratto chiaro è più lungo dell'asta, quindi il
    pareggiatore prendeva quello e ridipingeva la lumeggiatura lasciando stare la lancia — da cui
    una lancia bruna a terra e biancastra in aria.

    Quello che la lancia è davvero, e che nessun disegno può cambiare, è **la cosa che finisce nella
    punta**: il pixel più a destra è la punta per contratto, e la lancia è la barra orizzontale che
    ci arriva. Da lì si torna indietro finché ci sono pixel accesi, con un tetto alla lunghezza.

    Il tetto **non è un numero comodo**: è `lanceReach / CELL`, cioè quanto sporge la lancia secondo
    le regole. Senza, camminando la corsa non si ferma dove finisce l'asta — la riga della lancia
    attraversa anche il corpo della bestia — e il pareggiatore ridipinge di colore-lancia mezzo
    dodo. Provato: ventisei pixel bastavano a mangiare il collo.
    """
    rows, cols = frame.shape
    acceso = frame >= 0
    if not acceso.any():
        return []
    xmax = int(np.argwhere(acceso)[:, 1].max())
    trovate = []
    for y in range(rows):
        if not (acceso[y, xmax] or (xmax > 0 and acceso[y, xmax - 1])):
            continue
        x = xmax
        while x > 0 and acceso[y, x - 1] and xmax - x < most:
            x -= 1
        if xmax - x + 1 >= least:
            trovate.append((y, x, xmax - x + 1))
    return trovate


def _unify_lance(groups, tip_len=5):
    """Paint every frame's lance the way the flying frames have it.

    The lance does not change between poses, and it came out of the quantiser two different ways: in
    the flying frames a red-brown shaft with a grey tip, which is what the artist drew, and in the
    walking frames a single bar of pale tan. Same object, two colourings, and the player sees one of
    them as clearly drawn and the other as washed out.

    It is not something the artist can fix by redrawing: it is an artefact of eight frames being
    compressed separately and then reduced to fourteen colours. So it is fixed here, and the flying
    frames win because that is where the lance reads best.
    """
    reference = groups.get("fly") or next(iter(groups.values()))

    # L'asta e la punta si prendono dalla riga più lunga dei fotogrammi di volo: è lì che la lancia
    # è disegnata per intero, e a votare sono tutti e quattro.
    principali = []
    for f in reference:
        righe = _lance_rows(f)
        if righe:
            principali.append((f, max(righe, key=lambda r: r[2])))
    if not principali:
        return None
    shaft = Counter(int(f[y, x + length // 3]) for f, (y, x, length) in principali).most_common(1)[0][0]
    tip = Counter(int(f[y, x + length - 1]) for f, (y, x, length) in principali).most_common(1)[0][0]

    # **Se le lance già si somigliano, non si tocca niente.**
    #
    # Questo passo nasce per togliere una differenza fra le pose, non per imporre uno stile. Su un
    # foglio in cui il disegnatore ha già fatto la lancia uguale nelle due bande, ridipingerla
    # significa cancellare quello che ci ha messo: misurato, spianava l'impugnatura e riduceva la
    # punta a cinque pixel piatti, buttando via la forma della cuspide.
    #
    # Il confronto è su quello che si vede da lontano — il colore dominante dell'asta e quello della
    # punta — non sull'elenco completo dei colori: due pixel di guanto diversi fra una posa e
    # l'altra non sono «la lancia cambia colore».
    # A **maggioranza**, non all'unanimità. La riga su cui sta la lancia cambia da una posa
    # all'altra — il corpo sale e scende — quindi va cercata in ogni fotogramma, e ogni tanto la
    # ricerca aggancia il bordo di un'ala invece dell'asta. Misurato su questo foglio: sette
    # fotogrammi su otto dicono «asta 5, punta 8» e l'ottavo dice tutt'altro. Pretendere l'accordo
    # di tutti significa lasciare che un fotogramma sbagliato mandi a ridipingere le altre sette.
    def riga_di(f):
        righe = _lance_rows(f)
        if not righe:
            return None
        quota = f.shape[0] // 2 - 8
        return min(righe, key=lambda r: (abs(r[0] - quota), -r[2]))

    firme = Counter()
    for frames in groups.values():
        for f in frames:
            scelta = riga_di(f)
            if not scelta:
                continue
            y, x, length = scelta
            corpo = Counter(int(v) for v in f[y, x:x + length - tip_len] if v >= 0)
            firme[(corpo.most_common(1)[0][0], int(f[y, x + length - 1]))] += 1

    quanti = sum(firme.values())
    if firme and firme.most_common(1)[0][1] >= quanti * 0.75:
        print(f"  lancia già coerente in {firme.most_common(1)[0][1]} fotogrammi su {quanti}: "
              "lasciata com'è")
        return firme.most_common(1)[0][0]

    for nome, frames in groups.items():
        for f in frames:
            righe = _lance_rows(f)
            if not righe:
                continue
            # La riga che porta la punta è quella **alla quota a cui la regola legge la punta**, non
            # la più lunga: la lumeggiatura può essere lunga quanto l'asta, e se la punta finisse su
            # di lei il disegno e la regola si scosterebbero di un pixel a ogni battito d'ala.
            quota = f.shape[0] // 2 - 8
            principale = riga_di(f) or max(righe, key=lambda r: r[2])
            for y, x, length in righe:
                capo = (y, x, length) == principale
                for i in range(length):
                    if capo:
                        f[y, x + i] = tip if i >= length - tip_len else shaft
                    elif i < length - tip_len:
                        f[y, x + i] = shaft
                    else:
                        # **Solo una riga arriva in punta.** Se due ci arrivano, quale delle due sia
                        # «la punta» lo decide l'ordine in cui qualcuno le scandisce — e la regola
                        # dello scontro scandisce dall'alto, mentre il disegno intendeva quella
                        # sotto. Un pixel di scarto, che ricompare a ogni battito d'ala. Accorciando
                        # le righe secondarie l'asta si assottiglia verso la punta, che è anche il
                        # modo in cui è fatta una lancia.
                        f[y, x + i] = -1
    return shaft, tip


def _egg_hue(path):
    """La tinta dominante di un uovo, misurata sui suoi pixel saturi.

    Moda a passo di dieci gradi e poi mediana dentro quella fascia: la moda da sola inciamperebbe
    sul bordo, dove l'ombra e la lumeggiatura sono di tinte vicine ma diverse, e la media sola
    verrebbe tirata dal contorno scuro.
    """
    a = np.asarray(Image.open(path).convert("RGBA")).astype(float)
    solidi = a[a[:, :, 3] > 200][:, :3] / 255.0
    tinte = []
    for r, g, b in solidi:
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        if s > 0.35 and v > 0.25:
            tinte.append(h * 360)
    if not tinte:
        raise SystemExit(f"{path.name}: nessun pixel saturo, non so che colore sia")
    tinte = np.array(tinte)
    moda = np.bincount(np.round(tinte / 10).astype(int)).argmax() * 10
    vicine = tinte[np.abs((tinte - moda + 180) % 360 - 180) < 20]
    return float(np.median(vicine))


def _uova(cartella):
    """Le quattro uova: **un disegno solo e quattro tavolozze**, ognuna misurata sul proprio file.

    Le quattro uova sono lo stesso uovo di quattro colori, e non è un'ipotesi: ridotte sulla loro
    griglia da dodici pixel, la sagoma del verde e quella del viola coincidono con quella dell'oro
    **cella per cella**, zero discordanze su duemilacentosessanta. Da lì viene tutto il resto:
    si tiene un disegno e si tiene, per ogni uovo, quale colore mette dove l'oro ne mette un altro.

    Perché l'oro faccia da riferimento è misurato anche quello: è l'unico dei quattro esportato
    pulito — sessantaquattro colori di cella e due soli valori di trasparenza — mentre gli altri
    tre sono anteprime sfumate da seicento e passa colori, lo stesso danno dei fotogrammi della
    camminata. Il riferimento è il file con meno colori, non un nome scritto qui.

    E la tavolozza di ognuno **non si ruota**: si misura. Ruotare la tinta dell'oro era la strada
    ovvia e sbagliata — provata, dà un errore medio di ottanta livelli per canale, cioè un verde
    che non è il verde disegnato. Quindi per ogni colore dell'oro si prendono tutte le celle che
    lo portano e si guarda che colore ci mette il verde: la mediana del gruppo. Il rumore
    dell'anteprima si media via da sé, e il colore che esce è quello dell'autore.

    Poi il disegno si dimezza. Non per bellezza: le uova sono disegnate 40 x 54 pixel d'arte, cioè
    alte quanto tutto il cavaliere col dodo, e un uovo grande quanto la bestia che lo ha deposto è
    sbagliato per il gioco qualunque sia la fedeltà. Si dimezza **la griglia degli indici**, per
    maggioranza, non i colori: ogni cella che esce è uno dei colori dell'autore, mai una mescolanza
    di due. Ed esce una sola volta per tutte e quattro le uova, che così non possono divergere.
    """
    files = sorted(cartella.glob("uovo-*.png"))
    if not files:
        return None

    # La griglia la misura lo script che monta il foglio, e la misura da lì invece di riscriverla
    # qui: è lo stesso fatto — «di quanti pixel è il pixel dell'autore» — e due copie di un fatto
    # sono due cose che possono rispondere in modo diverso allo stesso disegno.
    from make_spronia_sheet import _cell as _griglia, _reduce as _riduci, _crop as _ritaglia

    letti = {}
    for f in files:
        a = np.asarray(Image.open(f).convert("RGBA")).astype(int)
        passo, off, _ = _griglia(a)
        arte, _ = _riduci(a, passo, off)
        letti[f.stem.split("-", 1)[1]] = arte

    def quanti(arte):
        pieno = arte[:, :, 3] > 128
        return len({tuple(c) for c in arte[pieno][:, :3]})

    rif = min(letti, key=lambda n: quanti(letti[n]))
    base = _ritaglia(letti[rif])
    sagoma = base[:, :, 3] > 128
    alto, largo = base.shape[:2]

    colori, indice = {}, -np.ones((alto, largo), dtype=int)
    for y in range(alto):
        for x in range(largo):
            if not sagoma[y, x]:
                continue
            c = tuple(base[y, x, :3])
            colori.setdefault(c, len(colori))
            indice[y, x] = colori[c]
    print(f"  uova: riferimento {rif}, {largo} x {alto} pixel d'arte, {len(colori)} colori")

    # Il registro. Gli esportatori sbagliati non spostano solo i colori: spostano anche il disegno
    # dentro il riquadro, e di quanto lo dice la sagoma. Si prova ogni scorrimento e si tiene quello
    # che ne fa combaciare di più — la stessa cosa che si fa con i fotogrammi della camminata.
    tavolozze = {}
    for nome, arte in letti.items():
        meglio = None
        pieno = arte[:, :, 3] > 200
        for dy in range(0, max(1, arte.shape[0] - alto + 1)):
            for dx in range(0, max(1, arte.shape[1] - largo + 1)):
                fetta = pieno[dy:dy + alto, dx:dx + largo]
                if fetta.shape != sagoma.shape:
                    continue
                storto = int((fetta != sagoma).sum())
                if meglio is None or storto < meglio[0]:
                    meglio = (storto, dy, dx)
        if meglio is None:
            raise SystemExit(f"uovo {nome}: più piccolo del riferimento {rif}, non so allinearlo")
        storto, dy, dx = meglio
        if storto > sagoma.size // 20:
            raise SystemExit(f"uovo {nome}: la sagoma non è quella di {rif} "
                             f"({storto} celle su {sagoma.size}): non è lo stesso disegno")
        fetta = arte[dy:dy + alto, dx:dx + largo]

        gruppi = [[] for _ in colori]
        for y in range(alto):
            for x in range(largo):
                if indice[y, x] >= 0:
                    gruppi[indice[y, x]].append(fetta[y, x, :3])
        tav = np.array([np.median(np.array(g), axis=0).round() if g else np.zeros(3)
                        for g in gruppi], dtype=int)
        scarti = [int(np.abs(tav[indice[y, x]] - fetta[y, x, :3]).max())
                  for y in range(alto) for x in range(largo) if indice[y, x] >= 0]
        tavolozze[nome] = tav
        print(f"  uovo {nome}: registro ({dy},{dx}), sagoma discorde {storto} celle, "
              f"scarto di colore mediano {int(np.median(scarti))}")

    # Il dimezzamento, per maggioranza. Un pareggio due-a-due lo vince l'indice più basso, che è il
    # più vicino all'inizio della tavolozza del riferimento: una regola qualunque, ma **fissa**, o
    # due conversioni della stessa immagine darebbero due uova.
    rh, rw = (alto + 1) // 2, (largo + 1) // 2
    piccolo = -np.ones((rh, rw), dtype=int)
    for y in range(rh):
        for x in range(rw):
            blocco = [indice[yy, xx]
                      for yy in range(2 * y, min(2 * y + 2, alto))
                      for xx in range(2 * x, min(2 * x + 2, largo))]
            pieni = [i for i in blocco if i >= 0]
            # Trasparente solo se la maggioranza del blocco lo era: la soglia tiene la sagoma
            # piena invece di mangiarle il bordo, che su una cosa alta ventisette pixel si vede.
            if not pieni or len(pieni) * 2 < len(blocco):
                continue
            piccolo[y, x] = max(set(pieni), key=lambda i: (pieni.count(i), -i))

    ys, xs = np.nonzero(piccolo >= 0)
    piccolo = piccolo[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

    # Solo i colori che sopravvivono al dimezzamento, rinumerati: la tavolozza sul disco non deve
    # portarsi dietro dodici colori che nessuna cella usa più.
    usati = sorted({int(i) for i in piccolo.ravel() if i >= 0})
    dove = {vecchio: nuovo for nuovo, vecchio in enumerate(usati)}
    if len(usati) > len(ALPHABET):
        raise SystemExit(f"le uova usano {len(usati)} colori e l'alfabeto ne codifica "
                         f"{len(ALPHABET)}")
    righe = []
    for y in range(piccolo.shape[0]):
        righe.append("".join("." if piccolo[y, x] < 0 else ALPHABET[dove[int(piccolo[y, x])]]
                             for x in range(piccolo.shape[1])))
    tagliate = {n: [t[i] for i in usati] for n, t in tavolozze.items()}
    print(f"  uova: disegno dimezzato a {piccolo.shape[1]} x {piccolo.shape[0]} pixel d'arte, "
          f"{len(usati)} colori usati")
    return righe, tagliate, piccolo.shape


def _tint(palette, verso, banda=(180, 265), soglia=0.12):
    """La stessa tavolozza con **i blu ruotati** su un'altra tinta, e il resto intatto.

    È così che i nemici prendono il colore delle uova senza ridisegnare niente: il piumaggio del
    dodo, l'armatura del cavaliere e il pennacchio stanno tutti in una fascia di tinte fra 202° e
    229°, e sono ventiquattro colori su cinquantatré. Ruotarli e lasciar stare gli altri tiene il
    becco giallo, le zampe arancioni, la faccia del cavaliere color pelle, l'asta della lancia
    bruna e il contorno nero — cioè tutto quello che sul dodo non è piumaggio.

    Si ruota solo la tinta: saturazione e luminosità restano quelle dell'autore, quindi le ombre
    restano ombre e le lumeggiature restano lumeggiature. Un dodo verde è lo stesso disegno, con lo
    stesso volume, di un altro colore.
    """
    fuori = []
    for c in palette:
        h, s, v = colorsys.rgb_to_hsv(*(c / 255.0))
        if s >= soglia and banda[0] <= h * 360 <= banda[1]:
            r, g, b = colorsys.hsv_to_rgb((verso / 360.0) % 1.0, s, v)
            fuori.append(np.array([round(r * 255), round(g * 255), round(b * 255)]))
        else:
            fuori.append(c)
    return np.array(fuori, dtype=int)


def _nearest(palette, rgb):
    """The palette entry closest to a colour that may not be in the palette."""
    want = np.clip(np.asarray(rgb, dtype=float), 0, 255)
    return int(np.argmin(((palette.astype(float) - want) ** 2).sum(1)))


def _pieces(frame):
    """Every connected run of drawn pixels, largest first. Eight-connected, so a diagonal counts."""
    rows, cols = frame.shape
    visto = np.zeros(frame.shape, dtype=bool)
    trovati = []
    for y in range(rows):
        for x in range(cols):
            if frame[y, x] < 0 or visto[y, x]:
                continue
            coda, pezzo = [(y, x)], []
            visto[y, x] = True
            while coda:
                cy, cx = coda.pop()
                pezzo.append((cy, cx))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if (0 <= ny < rows and 0 <= nx < cols
                                and not visto[ny, nx] and frame[ny, nx] >= 0):
                            visto[ny, nx] = True
                            coda.append((ny, nx))
            trovati.append(sorted(pezzo))
    trovati.sort(key=lambda p: (-len(p), p[0]))
    return trovati


def _anchor_row(hbox, piedi):
    """Di quanto la riga 0 dello sprite sta sotto il centro del corpo, in pixel di sprite.

    Lo sprite **non è centrato sul corpo: è appoggiato per i piedi.** Il fondo della scatola di
    collisione è dove il dodo sta in piedi, e i piedi disegnati devono cadere lì — altrimenti il
    personaggio affonda nella piattaforma di quanto la scatola è più corta della bestia. Era così:
    cinque pixel a schermo, con la scatola grande quanto il torso e i piedi che sono la parte più
    bassa dell'animale.

    Da questo numero **discende `lanceRise`**, ed è la ragione per cui vive in una funzione sola:
    la regola dell'altezza legge la punta a un certo scarto dal centro del corpo, e quello scarto
    dipende da dove il disegno è appoggiato. Spostare l'uno senza l'altro sposterebbe la regola
    senza che niente a schermo lo dica.
    """
    return hbox // 2 - (piedi + 1)


def _check_lance(groups, rise, reach, piedi, hbox):
    """Su un foglio disegnato bene: la punta ci deve già essere, e si dice dove.

    Il messaggio, quando fallisce, dice **di quanti pixel** e in che verso, per fotogramma: è quello
    che serve a chi disegna per rimediare in un giro solo, e vale più di un rifiuto secco. Che la
    regola sia sbagliata invece del disegno è l'altra metà del caso, e i due numeri sono gli stessi.
    """
    guasti = []
    for name, frames in groups.items():
        for i, f in enumerate(frames):
            rows, cols = f.shape
            ty = rise - _anchor_row(hbox, piedi)
            tx = cols // 2 + reach
            # **La punta è la fine dell'asta, non il pixel più a destra del disegno.** Erano la
            # stessa cosa finché il dodo teneva le ali chiuse; con le ali aperte, in una posa su
            # quattro il pixel più a destra è una **penna** che passa oltre il ferro, e il controllo
            # bocciava un fotogramma corretto dicendo che la punta era sette righe più in alto.
            ink = f >= 0
            migliore = (0, 0, 0)
            for y in range(rows):
                corsa = 0
                for x in range(cols):
                    corsa = corsa + 1 if ink[y, x] else 0
                    if corsa > migliore[0]:
                        migliore = (corsa, y, x)
            py, px = migliore[1], migliore[2]
            if (px, py) != (tx, ty):
                guasti.append(f"{name} {i + 1}: punta a ({px},{py}) invece che a ({tx},{ty}), "
                              f"scarto dx={px - tx:+d} dy={py - ty:+d}")
    if guasti:
        raise SystemExit("la punta della lancia non è dove la regola la legge:\n  "
                         + "\n  ".join(guasti)
                         + "\n  o si sposta la lancia sul foglio, o si cambiano lanceRise e "
                           "lanceReach in game.js")
    print(f"  lancia: la punta disegnata cade dove la regola la legge in tutti i fotogrammi "
          f"(dal centro del corpo: dy={rise:+d}, dx={reach:+d} pixel di sprite)")


def _rule(game, nome, blocco="PILOT"):
    """Una costante di game.js, in pixel di sprite invece che in unità di mondo.

    Erano scritte a mano qui, con un commento che diceva «da game.js» — cioè la forma esatta della
    trappola che questo progetto ha già pagato tre volte: due copie di un numero e nessuno script
    che le confronti. Ha smesso di essere teorica il giorno in cui il riquadro è passato da 48 x 40
    a 59 x 50 e le due costanti della lancia sono cambiate insieme.
    """
    # Dentro il blocco PILOT e non in tutto il file: `h:` da solo lo trova anche in FIELD e in
    # SPRITE, e leggere l'altezza del campo invece di quella del corpo darebbe uno sprite appoggiato
    # trecentosessanta pixel sotto i piedi senza che niente protesti.
    dentro = game[game.index(f"export const {blocco} = {{"):]
    trovato = re.search(rf"\b{nome}: (-?\d+),", dentro)
    if not trovato:
        raise SystemExit(f"non trovo {nome} dentro {blocco} in game.js")
    return int(trovato.group(1)) // CELL


def _place_lance(groups, shaft, tip, palette, rise, reach, piedi, hbox, tip_len=4, relitto=12):
    """Erase whatever lance the sheet has, and draw the canonical one where the rule reads it.

    This is the converter taking ownership of the one object in the drawing that belongs to the
    rules. `lanceTip` decides who wins a pass by reading a single pixel at a fixed offset from the
    body centre — and every AI-generated sheet so far has drifted exactly there: tips scattered
    across five columns and three rows, one frame out of eight pointing somewhere else entirely.
    Asking the image model to hold that pixel steady has failed on every attempt, because it is the
    one constraint invisible to the eye at drawing scale.

    So the sheet supplies the character, and the converter supplies the lance: horizontal, one
    pixel thick, **fixed length**, ending exactly at the rule's point, identical in all eight
    frames. The length was per-frame at first, taken from what remained of the drawn lance, and
    that was a defect twice over: walk frames came out with lances of different lengths, and the
    start depended on which pixels happened to touch the lance's row — so converting the same
    sheet twice gave two different lances. A lance is a rigid object; nothing about it may vary.

    One pixel thick it stays, and that is not a compromise: a lance is thin, and on a sprite forty
    pixels tall a thicker one would read as a plank. What it gained instead is a **profile along its
    own row** — a bound butt, the wooden shaft, the collar where the steel begins, and a point
    catching the light — because the only dimension left to draw in is colour. The four colours are
    derived from the two the sheet already uses, not typed in: darken the shaft for butt and collar,
    lighten the steel for the point. So a sheet painted in other colours gets its own lance, and no
    entry of the palette is spent on a thing that appears thirty-five pixels per frame.
    """
    ombra = _nearest(palette, palette[shaft] * 0.62)
    luce = _nearest(palette, palette[tip] * 1.35)
    for frames in groups.values():
        for f in frames:
            rows, cols = f.shape
            # lanceRise and lanceReach from game.js, divided by CELL. The same derivation the
            # tests use, so the drawn tip and the rule's point cannot disagree.
            ty = rise - _anchor_row(hbox, piedi)
            tx = cols // 2 + reach

            # Erase the detected lance rows in two passes — mark first, fill after — because a
            # two-row lance filled row by row would fill the first row with the second row's own
            # lance colour.
            segnati = set()
            for y, x, length in _lance_rows(f):
                for i in range(x, x + length):
                    segnati.add((y, i))
            for y, i in segnati:
                above = f[y - 1, i] if y > 0 and (y - 1, i) not in segnati else -1
                below = f[y + 1, i] if y < rows - 1 and (y + 1, i) not in segnati else -1
                # Where the lance crossed the body, the body colour above (or below) closes the
                # hole; where it hung in the air, air remains.
                f[y, i] = above if above >= 0 else (below if below >= 0 else -1)

            # Sweep the floating fragments — but **only on the rows the lance was found on**.
            # The first version swept a band of eleven rows around the canonical height, and it
            # was not idempotent: erasing one thin brown run exposes the run beneath it, so every
            # further pass over the same frame ate one more layer of feather edges the same colour
            # as the shaft. Measured on the round trip: a hundred pixels of wing, gone on the
            # second conversion of an already-perfect sheet. The stubs this sweep exists for — the
            # back end of the old shaft, cut off from the run that reaches the tip — live on the
            # lance's own row by construction, so that is the only row worth sweeping.
            for y in sorted({r[0] for r in _lance_rows(f)} | {y for y, _ in segnati}):
                x = 0
                while x < cols:
                    if f[y, x] in (shaft, tip):
                        j = x
                        while j < cols and f[y, j] in (shaft, tip):
                            j += 1
                        libero = all((y == 0 or f[y - 1, k] < 0)
                                     and (y == rows - 1 or f[y + 1, k] < 0)
                                     for k in range(x, j))
                        if libero:
                            for k in range(x, j):
                                f[y, k] = -1
                        x = j
                    else:
                        x += 1

            start = max(2, tx - 34)
            for i in range(start, tx + 1):
                if i < start + 2:
                    f[ty, i] = ombra                 # il calcio, fasciato
                elif i == tx:
                    f[ty, i] = luce                  # la punta, che prende luce
                elif i > tx - tip_len:
                    f[ty, i] = tip                   # il ferro
                elif i == tx - tip_len:
                    f[ty, i] = ombra                 # il collare fra legno e ferro
                else:
                    f[ty, i] = shaft

            # **La lancia non porta niente.** Ultimo passo, e serve perché la spazzata qui sopra
            # guarda una riga sola. Il ferro che il foglio aveva disegnato stava a un'altezza
            # diversa in ogni fotogramma, e quello che ne restava — due, quattro, sei pixel di
            # grigio e acciaio — tocca in **diagonale** l'asta appena dipinta. Quindi è attaccato al
            # disegno, quindi nessun controllo sui pezzi lo vede, e a schermo è un moncone che salta
            # attorno alla punta otto volte al secondo.
            #
            # Il modo di riconoscerlo senza inventare soglie di colonna: sollevare la riga
            # dell'asta e guardare cosa resta appeso. Quello che smette di toccare il dodo era
            # appeso alla lancia, e la lancia la disegniamo noi. Solo i pezzi piccoli, perché in due
            # fotogrammi di volo è **il collo** a passare per quella riga, e cancellare la testa
            # sarebbe il rimedio peggiore del male.
            riga = f[ty].copy()
            f[ty] = -1
            for pezzo in _pieces(f)[1:]:
                if len(pezzo) <= relitto:
                    for y, x in pezzo:
                        f[y, x] = -1
            f[ty] = riga

            resto = np.argwhere(f[:, tx + 1:] >= 0)
            if len(resto):
                print(f"  attenzione: {len(resto)} pixel oltre la punta — la punta non è il "
                      "pixel più a destra e il controllo lo dirà")
    return ombra, luce


# -----------------------------------------------------------------------------------------------------------------
#  u n o   s o l o
# -----------------------------------------------------------------------------------------------------------------

def _reunite(frames, speck=12, tries=8):
    """A sprite is one object: delete the specks, sew the limbs back on.

    Two defects with one shape, and both were on screen. In three walk frames a six-pixel stub of
    grey and dark steel floated beside the head, at a **different height in each frame** — the back
    end of the lance the sheet drew, cut off from the run that reached the tip when the canonical
    lance replaced it. Six pixels are nothing; six pixels that jump every eighth of a second are a
    flicker right next to the one thing a player watches.

    The other was the dodo's head. In two flying frames the neck stops one row short of the lance,
    so the whole head — ninety pixels, eye included — is a piece of its own, and reads as detached.

    The rule that covers both is the same: what the drawing shows is one creature. So a piece that
    is not the body is either debris, and goes, or a limb that lost its link, and gets bridged along
    the shortest gap in the colour of its own edge. The threshold is size, because that is exactly
    what tells the two apart. Both decisions are taken on sorted coordinates, so a rebuild repeats
    them pixel for pixel.
    """
    tolti = cuciti = 0
    for f in frames:
        for _ in range(tries):
            pezzi = _pieces(f)
            if len(pezzi) < 2:
                break
            corpo, staccato = pezzi[0], pezzi[1]
            if len(staccato) <= speck:
                for y, x in staccato:
                    f[y, x] = -1
                tolti += len(staccato)
                continue
            ay, ax, by, bx = min(
                ((max(abs(py - qy), abs(px - qx)), py, px, qy, qx)
                 for py, px in staccato for qy, qx in corpo))[1:]
            passi = max(abs(by - ay), abs(bx - ax))
            colore = int(f[ay, ax])
            for i in range(1, passi):
                y = ay + round((by - ay) * i / passi)
                x = ax + round((bx - ax) * i / passi)
                if f[y, x] < 0:
                    f[y, x] = colore
                    cuciti += 1
    return tolti, cuciti


def _holes(frames, most=3):
    """Fill the transparent pixels the drawing encloses.

    A gap of one or two pixels with silhouette all around it is not negative space — at this size
    nobody draws a two-pixel window into a bird — it is what the median left behind where two
    colours met. Twenty-three of them across the eight frames, and together they are what makes the
    body look moth-eaten when the sprite is magnified.

    Small ones only. The larger enclosed gaps on this sheet are the real thing, the daylight between
    a wing and a flank, and filling those would weld the drawing shut.
    """
    riempiti = 0
    for f in frames:
        rows, cols = f.shape
        visto = np.zeros(f.shape, dtype=bool)
        for y in range(rows):
            for x in range(cols):
                if f[y, x] >= 0 or visto[y, x]:
                    continue
                coda, buco, bordo = [(y, x)], [], False
                visto[y, x] = True
                while coda:
                    cy, cx = coda.pop()
                    buco.append((cy, cx))
                    if cy in (0, rows - 1) or cx in (0, cols - 1):
                        bordo = True
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if (0 <= ny < rows and 0 <= nx < cols
                                and not visto[ny, nx] and f[ny, nx] < 0):
                            visto[ny, nx] = True
                            coda.append((ny, nx))
                if bordo or len(buco) > most:
                    continue
                for cy, cx in sorted(buco):
                    intorno = [int(f[cy + dy, cx + dx])
                               for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                               if (dy or dx) and 0 <= cy + dy < rows and 0 <= cx + dx < cols
                               and f[cy + dy, cx + dx] >= 0]
                    if intorno:
                        f[cy, cx] = Counter(intorno).most_common(1)[0][0]
                        riempiti += 1
    return riempiti


def _eye(frame, palette):
    """Where the dodo's eye is, for one frame — or None if this pose does not show one.

    The eye is the darkest thing on the head and the only dark thing **completely enclosed** by
    mid-tones: everything else dark on this sprite is an outline, and an outline touches the paper.
    That is the whole rule, and it is why it survives the sheet being redrawn.

    Found here, next to the drawing, for the same reason the pennant's anchor is: it is a fact about
    the artwork, and this is the only file that reads the artwork.
    """
    lum = palette @ np.array([0.2126, 0.7152, 0.0722])
    rows, cols = frame.shape

    best = None
    for y in range(1, rows - 1):
        for x in range(cols // 2, cols - 1):            # the head is on the leading half
            v = frame[y, x]
            if v < 0 or lum[v] > 70:
                continue
            ring = [frame[y + dy, x + dx]
                    for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
            if any(w < 0 for w in ring):
                continue                                 # touches the paper: an outline, not an eye
            if min(lum[w] for w in ring if w >= 0) < 70:
                pass                                     # a neighbour is dark too: same eye, fine
            around = [lum[w] for w in ring if w >= 0 and lum[w] > 70]
            if len(around) < 4:
                continue                                 # not enclosed by the head
            if best is None or y < best[1]:
                best = (x, y)
    return list(best) if best else None


def _eye_box(frame, eye, palette, most=4):
    """Il riquadro dell'occhio che l'autore ha disegnato, misurato invece che imposto.

    Serve al battito: il renderer copre questo riquadro col colore della testa e ci disegna una
    palpebra, quindi deve sapere quanto è grande, non che forma ha. Su un foglio disegnato bene la
    forma è dell'autore — nel dodo azzurro sono due colonne per due righe, bianco dietro e pupilla
    davanti — e il convertitore non ha nessun titolo per rifarla.

    Si cresce dalla pupilla finché le celle sono di uno dei due colori dell'occhio, e ci si ferma a
    quattro per lato: il nero della pupilla è anche il nero del contorno, e senza un limite una
    pupilla appoggiata al contorno farebbe dilagare il riquadro su mezza testa.
    """
    lum = palette @ np.array([0.2126, 0.7152, 0.0722])
    rows, cols = frame.shape
    x, y = eye
    pupilla = int(frame[y, x])

    bianco, meglio = None, -1.0
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < cols and 0 <= ny < rows and frame[ny, nx] >= 0 \
                and lum[frame[ny, nx]] > meglio:
            bianco, meglio = int(frame[ny, nx]), lum[frame[ny, nx]]
    if bianco is None or meglio - lum[pupilla] < 60:
        return None

    dentro = {pupilla, bianco}
    coda, visti = [(y, x)], {(y, x)}
    while coda:
        cy, cx = coda.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if (0 <= ny < rows and 0 <= nx < cols and (ny, nx) not in visti
                    and frame[ny, nx] >= 0 and int(frame[ny, nx]) in dentro):
                visti.add((ny, nx))
                coda.append((ny, nx))
    ys = [p[0] for p in visti]
    xs = [p[1] for p in visti]
    w, h = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
    if w > most or h > most:
        return None
    chiare = sorted({p[1] for p in visti if int(frame[p[0], p[1]]) == bianco})
    return min(xs), min(ys), w, h, chiare[0]


def _open_eye(frame, palette, eye):
    """Find the white the artist drew beside the pupil, and hold it to the palette's extremes.

    An earlier version of this function *invented* the white, on the belief that the drawing's own
    was finer than the grid. That belief was wrong, and worth recording because it survived three
    rounds of tuning: the eye is drawn as two bars, white then pupil, **five source pixels wide each
    against a cell of 11.06** — a little under half a cell. Not too fine to exist at this
    resolution; too fine to win a *median*. `_recover` is what brings both bars back, and once it
    does, there is nothing here left to invent.

    What remains is to say which neighbour of the pupil is the white, and to snap the two cells to
    the palest and darkest entries of the palette. The snap is cosmetic but not idle: fourteen
    colours fitted to a whole sheet put the nearest entry to the eye's white a long way off it, and
    an eye is the one place on a sprite where the contrast is the feature.

    Sideways first, and only then above or below. Taking simply the brightest of the four neighbours
    put the white to the right of the pupil while walking and *underneath* it while flying, which
    reads as a bird looking at its own feet.
    """
    if not eye:
        return None
    lum = palette @ np.array([0.2126, 0.7152, 0.0722])
    pale = int(np.argmax(lum))
    x, y = eye
    rows, cols = frame.shape

    best = None
    for order in ((-1, 0), (1, 0)), ((0, -1), (0, 1)):
        for dx, dy in order:
            nx, ny = x + dx, y + dy
            if not (0 <= nx < cols and 0 <= ny < rows) or frame[ny, nx] < 0:
                continue
            if best is None or lum[frame[ny, nx]] > lum[frame[best[1], best[0]]]:
                best = (nx, ny)
        if best:
            break
    if best:
        frame[best[1], best[0]] = pale
        return [int(best[0]), int(best[1])]
    return None


def _rows(frame, palette_chars):
    return ["".join("." if v < 0 else palette_chars[v] for v in row) for row in frame]


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def _argomento(nome, difetto):
    """Un argomento da riga di comando, o il suo valore normale.

    Serve a **provare un foglio nuovo senza toccare il gioco**: chi disegna consegna una versione,
    la si converte in una cartella a parte e si guarda il risultato prima di sostituire quello che
    gira. Senza, l'unico modo di vedere un foglio candidato è sovrascrivere il file buono.
    """
    if nome in sys.argv:
        return Path(sys.argv[sys.argv.index(nome) + 1])
    return difetto


def main():
    art = _argomento("--art", ART)
    out = _argomento("--out", OUT)

    # Il modello per chi disegna vive nella stessa cartella e **non è un foglio**: convertirlo
    # darebbe una griglia ciano al posto del personaggio. Si esclude per nome.
    sheets = sorted(p for p in list(art.glob("*.png")) + list(art.glob("*.jpg"))
                    + list(art.glob("*.jpeg")) if not p.name.startswith("modello"))
    if not sheets:
        raise SystemExit(f"nessun foglio in {art}: mettici l'immagine degli sprite")
    if len(sheets) > 1:
        # Prendere il primo in ordine alfabetico funzionerebbe, ed è il motivo per cui è sbagliato:
        # aggiungere un foglio nuovo cambierebbe il personaggio del gioco senza che nessuno l'abbia
        # chiesto, e il commit direbbe soltanto «aggiunta immagine».
        elenco = "\n    ".join(p.name for p in sheets)
        raise SystemExit(f"{len(sheets)} fogli in {art}, e non so quale sia quello buono:\n"
                         f"    {elenco}\n  tienine uno solo, o passa --art su una cartella a parte")
    sheet = sheets[0]

    a = np.asarray(Image.open(sheet).convert("RGB")).astype(int)

    # Le guide del modello spariscono prima di tutto il resto.
    #
    # Sono ciano acceso, un colore che nel disegno non c'è e non ci sarà: chi disegna può lasciare
    # sul foglio la griglia, i riquadri e il segno della punta della lancia, e il convertitore li
    # tratta come carta. L'alternativa era chiedere di cancellarle prima di consegnare, cioè un
    # passaggio a mano che prima o poi si dimentica — e una guida dimenticata diventa un pixel del
    # disegno, in un colore che stona con tutta la tavolozza.
    #
    # Riconosciute da una **relazione fra i canali**, non da una distanza da una terna esatta: il
    # JPEG sbava, e attorno a ogni riga ciano resta un alone più chiaro e più spento che una soglia
    # assoluta non prende. Misurato: con la soglia assoluta ne sopravvivevano ottocentosettantacinque,
    # abbastanza da entrare nel k-means e spostare tutta la tavolozza — un difetto che non si
    # presenta come «guide rimaste» ma come colori del dodo leggermente diversi.
    #
    # Il blu sopra il rosso non esiste in questo disegno: la bestia è bruna, il cavaliere rosso, il
    # metallo grigio. Perciò è il colore riservato, e sta scritto sul modello.
    b, g, r = a[:, :, 2], a[:, :, 1], a[:, :, 0]
    # **Nessuna crescita del bordo.** Allargare la maschera di un pixel sembrava il modo ovvio di
    # prendere l'ultimo velo di sbavatura, e mangia un pixel di *disegno* ovunque una guida corra
    # accanto alla sagoma: il foglio esce diverso, e in un modo che non somiglia affatto a «sono
    # rimaste delle guide». Quel velo lo toglie già `_dering`, che è nato per la stessa cosa.
    # La soglia è sul **blu chiaro**, non sul blu in generale, e la differenza non è teorica:
    # sul foglio di prova l'armatura del cavaliere è azzurra, cioè dello stesso verso delle guide.
    # Misurate, però, le due cose stanno lontane — le guide arrivano a 252 e 255 di blu, l'azzurro
    # dipinto si ferma a 220 — quindi quello che le separa è quanto sono accese, non che lo siano.
    # Due famiglie, perché i modelli sono stati due: il ciano chiaro del primo e il **verde** di
    # quello di produzione. In nessuno dei due casi il colore esiste nel disegno — la bestia è bruna,
    # il cavaliere rosso o azzurro, il metallo grigio — quindi si riconoscono da quale canale domina.
    #
    # Il verde è arrivato dopo un difetto istruttivo: il mirino del modello è una barra chiara che
    # finisce **esattamente sulla punta della lancia**, cioè ha la forma di una lancia e sta dove sta
    # una lancia. Il convertitore la prendeva per tale e riportava «asta verde, punta verde». Il mio
    # modello sparava al mio convertitore.
    #
    # Il margine, sedici, è misurato fra due difetti opposti. Fra il verde del fondo e un bruno del
    # disegno il JPEG stende una scala di mescolanze, e a venticinque ne passavano le metà — che
    # diventavano celle intere di oliva che si prendevano un posto in tavolozza — il becco del dodo
    # usciva verdastro. Sotto i dieci, invece, si mangia il bordo del disegno: il riquadro passava da
    # quarantasei colonne a quarantaquattro, cioè due colonne di uccello. Fra quattordici e diciotto
    # non c'è più verde in tavolozza e la sagoma è intera.
    #
    # Che serva una taratura è di per sé la risposta: **con un PNG questo problema non esiste**, il
    # fondo è un colore solo e non c'è nessuna scala di mescolanze da tagliare.
    #
    # Le guide diventano **carta**, non bianco: su un foglio verde un buco bianco sarebbe disegno.
    carta = _paper(a)
    guide = ((b - r > 30) & (b > 232) & (g > 200)) | ((g - r > 16) & (g - b > 16))
    if guide.any():
        a[guide] = carta
        print(f"  {guide.sum()} pixel di guida tolti dal foglio")

    step, off, err = _grid(a)
    print(f"  {sheet.name}: griglia {step:.3f} px, origine {off}, errore nel blocco {err:.1f}")

    art = _reduce(a, step, off)
    print(f"  carta del foglio: #{carta[0]:02x}{carta[1]:02x}{carta[2]:02x}")
    raw = np.abs(art - carta).sum(axis=2) < 60

    # **Is this sheet noisy at all?** Measured, not assumed: the mean colour spread inside the
    # source block of each ink cell. A JPEG sheet sits around 12–25; a flat PNG sits near zero.
    #
    # Everything downstream that repairs — the halo pass, the median recovery, de-paling,
    # despeckling, stabilising, spark removal — exists to undo compression damage, and on a
    # clean sheet there is no damage, so whatever those passes change is the artist's work.
    # Counted on a flawless generated sheet before this gate: thirty-seven real pixels eaten as
    # "halo" and a hundred and twenty-seven deliberate pale pixels removed as "sparks".
    campioni = []
    inset = max(2, int(step * 0.2))
    for gy in range(1, art.shape[0] - 1, 2):
        for gx in range(1, art.shape[1] - 1, 2):
            if raw[gy, gx]:
                continue
            y0, x0 = int(off + gy * step), int(off + gx * step)
            blk = a[y0 + inset:y0 + int(step) - inset, x0 + inset:x0 + int(step) - inset]
            if blk.size > 12:
                campioni.append(blk.reshape(-1, 3).std(axis=0).mean())
    rumore = float(np.mean(campioni)) if campioni else 0.0
    pulito = rumore < 6.0
    print(f"  rumore dentro le celle: {rumore:.1f}" + ("  → foglio pulito, riparazioni spente"
          if pulito else "  → foglio compresso, riparazioni accese"))

    if pulito:
        background = raw
    else:
        background = _dering(art, raw, carta)
        art, ripresi = _recover(art, a, step, off, background)
        print(f"  {ripresi} celle riprese: dentro il disegno l'estremo batte la mediana")
    ink = ~background
    print(f"  disegno ridotto a {art.shape[1]} x {art.shape[0]} pixel d'arte, "
          f"fondo {raw.mean() * 100:.0f}%"
          f" → {background.mean() * 100:.0f}% tolto l'alone "
          f"({(background & ~raw).sum()} pixel)")

    # **No green survives into the drawing.** The character's contract says green is the paper's
    # colour and nothing else — so an ink cell that comes out green-dominant is a guide the image
    # model repainted as content, not a colour anybody chose. It happened: the model fused the
    # crosshair marker into the lance, and the tip came out green in all eight frames, took a
    # palette slot, and passed every later check because by then it was just a colour.
    residuo = ink & (art[:, :, 1] - art[:, :, 0] > 40) & (art[:, :, 1] - art[:, :, 2] > 40)
    if residuo.any():
        background |= residuo
        ink = ~background
        print(f"  {residuo.sum()} celle verdi tolte dal disegno: guide ridipinte, non colori")

    # On a clean sheet the palette is **read, not estimated**. The clustering exists because a
    # JPEG smears every flat colour into dozens of near-identical ones; a clean sheet is already
    # quantised, by the artist, and k-means run on it can only do harm — measured: it merged two
    # neighbouring browns and split a popular one, changing ten per cent of the pixels.
    esatti = np.unique(art[ink].reshape(-1, 3), axis=0) if pulito else None
    if esatti is not None and len(esatti) <= len(ALPHABET):
        lum = esatti @ np.array([0.2126, 0.7152, 0.0722])
        palette = esatti[np.argsort(lum)]
        print(f"  tavolozza letta dal foglio: {len(palette)} colori esatti")
    else:
        palette = _palette(art[ink], COLOURS)
    idx = _snap(art, palette, background)

    bands = _bands(ink)
    layout = _layout(len(bands))
    print(f"  {len(bands)} bande: " + ", ".join(n or "scartata" for n in layout))

    # Every frame of every band goes into **one** box, aligned together. Aligning band by band was
    # the first attempt and it gives each band its own size — a walking dodo two pixels narrower than
    # a flying one, which means the body jumps the instant the player leaves the ground.
    order, tight = [], []
    for (y0, y1), name in zip(bands, layout):
        if name is None:
            continue
        for x0, x1 in _columns(ink, y0, y1):
            f = idx[y0:y1, x0:x1]
            ys, xs = np.nonzero(f >= 0)
            tight.append(f[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
            order.append(name)

    aligned = _align(tight)
    groups = {}
    for name, frame in zip(order, aligned):
        groups.setdefault(name, []).append(frame)

    # Despeckle each frame, then hold the cycle still. In that order, and it matters: despeckling
    # after the stabiliser would take its decisions frame by frame and could put the flicker back.
    if not pulito:
        for name, frames in groups.items():
            cleaned = [_despeckle(_depale(f, palette), palette) for f in frames]
            groups[name], fixed = _stabilise(cleaned, palette)
            print(f"  {name}: {fixed} pixel tenuti fermi fra i fotogrammi")

    # **La lancia si pareggia prima della pulizia**, e l'ordine è costato un difetto visibile.
    # Al contrario, la pulizia vedeva un pixel bianco in tutti e quattro i fotogrammi e lo teneva
    # come voluto; poi il pareggiatore ne ridipingeva uno solo — perché in quel fotogramma la lancia
    # passa una riga più su — e quel bianco restava acceso in tre fotogrammi su quattro. Cioè un
    # lampeggio creato *dopo* il passo che serviva a toglierlo.
    #
    # **Su un foglio pulito la lancia non si ridisegna, si verifica.** Il convertitore se n'era
    # presa la proprietà per una ragione buona — otto punte sparse su cinque colonne e tre righe,
    # generate da un modello che non vede il pixel che conta — ma quella ragione vale per un foglio
    # generato, non per uno disegnato. Quando l'autore la mette al posto giusto, ridisegnarla è
    # cancellare il suo lavoro per rifarlo peggio: la lancia canonica è alta un pixel e piatta,
    # quella disegnata ha il puntale, l'impugnatura e il ferro sagomato.
    #
    # Quindi: se il foglio è pulito si controlla che la punta cada esattamente dove la regola la
    # legge, e se non ci cade ci si ferma dicendo di quanto. Se è compresso, si ridisegna.
    game = (ROOT / "app" / "spronia" / "run" / "game.js").read_text(encoding="utf-8")
    rise, reach = _rule(game, "lanceRise"), _rule(game, "lanceReach")

    # **I piedi**, cioè la riga più bassa che la camminata disegna: è lì che il dodo sta in piedi, e
    # da lì discendono sia dove il renderer appoggia lo sprite sia dove la regola trova la lancia.
    # Si prende dalla camminata e non dal volo perché la camminata è la posa a terra; in volo le
    # zampe si raccolgono, e il corpo deve restare dov'era.
    piedi = max(int(np.nonzero(f >= 0)[0].max()) for f in groups.get("walk", next(iter(groups.values()))))
    hbox = _rule(game, "h")
    print(f"  piedi alla riga {piedi}; scatola alta {hbox} pixel di sprite → lo sprite si appoggia "
          f"con la riga 0 a {_anchor_row(hbox, piedi):+d} dal centro del corpo")

    if pulito:
        _check_lance(groups, rise, reach, piedi, hbox)
    else:
        colori = _unify_lance(groups)
        if colori:
            shaft, tip = colori
            ombra, luce = _place_lance(groups, shaft, tip, palette, rise, reach, piedi, hbox)
            print(f"  lancia ridisegnata dove la regola la legge: asta "
                  f"{chars_preview(palette, shaft)}, ferro {chars_preview(palette, tip)}, "
                  f"calcio e collare {chars_preview(palette, ombra)}, "
                  f"punta {chars_preview(palette, luce)}")

    # **Un pezzo solo, e senza buchi.** Sta qui, dopo la lancia, perché è la lancia a produrre metà
    # dei pezzi staccati: sostituendo quella disegnata lascia indietro il suo calcio, e ridipingendo
    # la propria riga per intero toglie al collo del dodo l'unico pixel con cui toccava il corpo.
    # Prima di `_sparks`, perché un moncone tolto adesso è un pixel chiaro in meno da giudicare.
    for name, frames in groups.items():
        tolti, cuciti = _reunite(frames)
        riempiti = _holes(frames)
        if tolti or cuciti or riempiti:
            print(f"  {name}: {tolti} px di relitto tolti, {cuciti} px di ponte, "
                  f"{riempiti} buchi chiusi")

    if not pulito:
        for name, frames in groups.items():
            groups[name], spenti = _sparks(frames, palette)
            print(f"  {name}: {spenti} scintille spente")

    # Tutto ciò che modifica i fotogrammi deve stare **sopra** la generazione delle righe.
    livery = _livery([f for frames in groups.values() for f in frames], palette)
    print(f"  livrea del cavaliere: {chars_preview(palette, livery)}")
    anchors = {name: [_anchor(f, palette, livery) for f in frames]
               for name, frames in groups.items()}

    # **One anchor per cycle, not one per frame** — the same consensus the eye and the lance
    # needed, arriving for the same reason. The rider is seated: within a cycle his helmet does
    # not move, so four anchors that disagree are four noisy readings of one fact. Measured on
    # the grey sheet: the flying anchors jumped four pixels between frames, which on screen is a
    # pennant hopping around the helmet. The medoid wins over the mean because it is one of the
    # actual readings, so it lands on a drawn pixel; frames where even that pixel is background
    # keep their own reading rather than pinning the pennant to thin air.
    for name, punti in anchors.items():
        xs = sorted(p[0] for p in punti)
        ys = sorted(p[1] for p in punti)
        centro = (xs[len(xs) // 2], ys[len(ys) // 2])
        medoid = min(punti, key=lambda q: abs(q[0] - centro[0]) + abs(q[1] - centro[1]))
        fissati = []
        for f, proprio in zip(groups[name], punti):
            drawn = 0 <= medoid[1] < f.shape[0] and 0 <= medoid[0] < f.shape[1]                 and f[medoid[1], medoid[0]] >= 0
            fissati.append(list(medoid) if drawn else proprio)
        anchors[name] = fissati

    # L'occhio è **la stessa cosa in ogni fotogramma di un ciclo**, quindi si prende il consenso
    # invece di fidarsi di ciascuno. Senza, il rumore del JPEG lo sposta: nel volo una pupilla su
    # quattro finiva tre righe più in basso, e il bianco cambiava lato a ogni fotogramma — un occhio
    # che schizza da destra a sinistra sessanta volte al secondo.
    eyes, glints, altezze, larghezze = {}, {}, {}, {}
    for name, frames in groups.items():
        trovati = [_eye(f, palette) for f in frames]
        validi = [tuple(e) for e in trovati if e]
        if not validi:
            eyes[name] = [None] * len(frames)
            glints[name] = [None] * len(frames)
            continue
        consenso = list(Counter(validi).most_common(1)[0][0])

        # **Su un foglio pulito l'occhio è dell'autore.** Tutto quello che segue — aprire il bianco,
        # decidere da che parte guarda, crescere a due righe, tenerne tre chiare su quattro — esiste
        # perché su un JPEG l'occhio arriva mangiato dalla mediana e va ricostruito. Qui non c'è
        # niente da ricostruire: è disegnato, è a due colori netti, ed è già rivolto in avanti.
        # Ridipingerlo sarebbe rifare peggio un lavoro già fatto.
        #
        # Resta da **misurarlo**, perché il battito deve coprirlo: quanto è grande il riquadro lo
        # dice il disegno, non una costante scritta qui.
        if pulito:
            misura = _eye_box(frames[0], consenso, palette)
            if not misura:
                eyes[name] = [consenso] * len(frames)
                glints[name] = [None] * len(frames)
                continue
            x0, y0, w, h, bianco = misura

            # **L'occhio si tiene fermo nel ciclo, anche quando non si ridipinge.** Non è la stessa
            # cosa che inventarlo: ogni valore viene da un fotogramma dell'autore, si sceglie solo
            # quello che compare più spesso. Serve perché su questo foglio una cella del bianco esce
            # #fbd4be in un fotogramma su quattro invece di #f1f2f2 — un pixel, in un ottavo del
            # ciclo, dentro l'occhio: cioè un ammicchio che non è un ammicchio.
            fermi = 0
            for dy in range(h):
                for dx in range(w):
                    valori = [int(f[y0 + dy, x0 + dx]) for f in frames]
                    voto = Counter(valori).most_common(1)[0][0]
                    for f, era in zip(frames, valori):
                        if era != voto:
                            f[y0 + dy, x0 + dx] = voto
                            fermi += 1
            if fermi:
                print(f"  {name}: {fermi} celle dell'occhio tenute ferme nel ciclo")

            eyes[name] = [[x0, y0]] * len(frames)
            glints[name] = [[bianco, y0]] * len(frames)
            altezze[name], larghezze[name] = h, w
            continue
        # Anche il lato del bianco si decide una volta: si apre l'occhio su un fotogramma, si guarda
        # da che parte è finito, e si impone lo stesso scarto a tutti.
        prova = _open_eye(frames[0].copy(), palette, consenso)
        if not prova:
            eyes[name] = [consenso] * len(frames)
            glints[name] = [None] * len(frames)
            continue
        posto = [prova[0], prova[1]]

        # **L'occhio cresce a due righe.** Uno alto un pixel, su una testa alta quattro, a schermo
        # è un puntino di due pixel per due: c'è, e non si vede. Raddoppiarlo in altezza è il passo
        # più piccolo possibile — un pixel in più per colonna — e sulla testa di questo dodo resta
        # metà del muso, che è la proporzione che avevano gli sprite di quell'epoca.
        #
        # In che direzione si cresce non si sceglie: si guarda dove **tutti** i fotogrammi hanno
        # ancora silhouette. In volo, sotto l'occhio, un fotogramma su quattro ha carta — crescere
        # in giù dipingerebbe un pixel bianco fuori dalla sagoma, in aria, e comparirebbe in un
        # fotogramma solo: uno sfarfallio, cioè il difetto che abbiamo appena finito di togliere.
        verso = 0
        for dy in (1, -1):
            if all(0 <= q[1] + dy < f.shape[0] and f[q[1] + dy, q[0]] >= 0
                   for f in frames for q in (consenso, posto)):
                verso = dy
                break

        # **Da che parte guarda l'occhio si decide per il personaggio, non per il ciclo.** Le due
        # celle sono quelle che il disegno gli dedica, e finora quale fosse il bianco lo decideva
        # ogni ciclo per conto suo: camminando la pupilla stava dietro, volando davanti. Cioè lo
        # stesso dodo guardava avanti in volo e indietro a terra, e nessun controllo lo vedeva
        # perché ogni ciclo, preso da solo, era coerente.
        #
        # La regola è una sola e non ha bisogno di leggere il disegno: lo sprite guarda a destra,
        # quindi **la pupilla sta nella colonna davanti e il bianco in quella dietro**. Se il foglio
        # le aveva al contrario, le due celle si scambiano — non si inventa niente, si assegna.
        #
        # C'è anche un guadagno che non era il motivo: dietro la pupilla la testa è in mezzitoni,
        # davanti c'è il becco chiaro. Il bianco messo dietro stacca su un fondo più scuro, ed è
        # esattamente lì che serve il contrasto.
        if consenso[1] == posto[1]:
            dietro, davanti = sorted((consenso[0], posto[0]))
            posto = [dietro, consenso[1]]
            consenso = [davanti, consenso[1]]

        # **Tre celle di bianco e una di pupilla, non due e due.** Metà blocco scuro non si legge
        # come un occhio, e la ragione è misurabile sul disegno: intorno all'occhio la testa di
        # questo dodo è già #3e180c, cioè lo stesso nero della pupilla. Una colonna scura dentro una
        # macchia scura sparisce, e a schermo resta una barretta bianca — che si vede, ma non è un
        # occhio. Con il bianco su tre celle la pupilla ha del chiaro sopra e di fianco, e diventa
        # una pupilla invece che il bordo della macchia.
        #
        # In basso e davanti: davanti perché è il verso in cui guarda, in basso perché sopra c'è
        # l'arcata sopraccigliare della testa e sotto il becco chiaro, quindi è lì che il contorno
        # del bianco tiene. Provate tutt'e tre a schermo, ingrandite, prima di scegliere.
        lum = palette @ np.array([0.2126, 0.7152, 0.0722])
        scuro, pale = int(np.argmin(lum)), int(np.argmax(lum))
        basso = consenso[1] + verso if verso > 0 else consenso[1]
        for f in frames:
            for q in (consenso, posto):
                f[q[1], q[0]] = pale
                if verso:
                    f[q[1] + verso, q[0]] = pale
            f[basso, consenso[0]] = scuro

        # Esportato è **l'angolo in alto a sinistra del blocco**, non la pupilla: è quello che serve
        # a chi lo copre quando l'occhio si chiude, ed è l'unico modo perché il battito non debba
        # sapere da che parte guarda il dodo.
        alto = min(consenso[1], consenso[1] + verso)
        eyes[name] = [[min(consenso[0], posto[0]), alto]] * len(frames)
        glints[name] = [[posto[0], alto]] * len(frames)
        altezze[name] = 2 if verso else 1
        larghezze[name] = 2
    for name, points in eyes.items():
        found = [p for p in points if p]
        print(f"  {name}: occhio trovato e aperto in {len(found)} fotogrammi su {len(points)}"
              + (f", a {found[0]}" if found else ""))
    for name, points in anchors.items():
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        print(f"  {name}: ancora del pennone, escursione {max(xs) - min(xs)} x {max(ys) - min(ys)} px")

    # Un riquadro solo per tutte le pose: se camminata e volo crescessero in modo diverso, il
    # battito dovrebbe sapere quale ciclo sta coprendo, e sarebbe la prima cosa a divergere. Si
    # tiene il più piccolo, perché coprire meno del disegnato lascia un filo d'occhio aperto, mentre
    # coprire più del disegnato dipinge un rettangolo di testa dove non c'era niente da coprire —
    # e il secondo si vede, il primo no.
    eye_h = min(altezze.values()) if altezze else 1
    eye_w = min(larghezze.values()) if larghezze else 2
    if len(set(altezze.values())) > 1 or len(set(larghezze.values())) > 1:
        print(f"  attenzione: l'occhio è di misure diverse fra i cicli "
              f"{ {k: (larghezze[k], altezze[k]) for k in altezze} }, tengo {eye_w} x {eye_h}")

    chars = ALPHABET[:len(palette)]
    box = aligned[0].shape
    for name, frames in groups.items():
        print(f"  {name}: {len(frames)} fotogrammi, riquadro {box[1]} x {box[0]} px "
              f"({box[1] * CELL} x {box[0] * CELL} unità)")

    # **Le tavolozze dei nemici si misurano sulle uova.** Il nome della tinta sta in `KINDS` dentro
    # game.js, il colore no: quello si legge dal disegno dell'uovo, così ridisegnare un uovo
    # ricolora i suoi nemici e le due cose non possono divergere. È la stessa regola che tiene
    # insieme SPRITE, la lancia e la griglia.
    uova = sorted((ART / "uova").glob("uovo-*.png")) if (ART / "uova").is_dir() else []
    tinte = {}
    for u in uova:
        nome = u.stem.split("-", 1)[1]
        gradi = _egg_hue(u)
        tinte[nome] = (gradi, _tint(palette, gradi))
        quanti = sum(1 for a, b in zip(palette, tinte[nome][1]) if not np.array_equal(a, b))
        print(f"  uovo {nome}: tinta {gradi:.0f}° → {quanti} colori ruotati su {len(palette)}")

    # E lo stesso disegno serve **due volte**: da qui esce la tinta dei nemici, sopra, e da qui
    # esce l'uovo che si vede in campo quando un nemico è spento. Una fonte sola per le due cose.
    guscio = _uova(ART / "uova") if (ART / "uova").is_dir() else None

    lines = [
        "// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0",
        "",
        "// GENERATO da _src/make_spronia_sprites.py — non si modifica a mano.",
        "//",
        "// Il disegno sorgente sta in app/spronia/art/. Per cambiare gli sprite si ridisegna il",
        "// foglio e si rilancia lo script: una trascrizione a mano di quindicimila pixel è una cosa",
        "// che può essere sbagliata in un punto e restarlo per sempre.",
        "//",
        "// Ogni carattere è un indice nella tavolozza qui sotto, «.» è trasparente. Gli sprite",
        "// guardano a **destra**: la direzione opposta è uno specchio a tempo di disegno, così una",
        "// modifica a un'ala è una modifica a tutt'e due. Per la stessa ragione la banda «walk left»",
        "// del foglio non viene importata: è il riflesso di «walk right» al 91-93%, e due copie della",
        "// stessa posa sono due cose che possono divergere.",
        "",
        f"export const CELL = {CELL};" + " " * 18 + "// world units per sprite pixel",
        "",
        "export const PALETTE = [",
    ]
    for i, (r, g, b) in enumerate(palette):
        lines.append(f'  "#{r:02x}{g:02x}{b:02x}",'.ljust(16) + f"// {chars[i]}")
    lines.append("];")
    lines.append("")

    if tinte:
        lines += [
            "/**",
            " * Le tavolozze dei nemici: la stessa di sopra, con **i blu ruotati** sulla tinta",
            " * dominante di un uovo. Nient'altro cambia.",
            " *",
            " * I blu sono ventiquattro colori su cinquantatré e stanno tutti fra 202° e 229°: sono il",
            " * piumaggio del dodo, l'armatura del cavaliere e il pennacchio. Ruotando quelli e lasciando",
            " * stare gli altri restano gialli il becco, arancioni le zampe, color pelle la faccia,",
            " * bruna l'asta della lancia e nero il contorno — tutto quello che sul dodo non è piumaggio.",
            " *",
            " * Si ruota **solo la tinta**: saturazione e luminosità restano quelle dell'autore, quindi le",
            " * ombre restano ombre e le lumeggiature restano lumeggiature. Un dodo verde è lo stesso",
            " * disegno, con lo stesso volume, di un altro colore.",
            " *",
            " * Il colore **non porta l'informazione della classe**, la raddoppia: a dirla resta la forma",
            " * del cimiero. Chi non separa due tinte deve poter decidere se quel nemico lo può",
            " * affrontare, e la classe è esattamente quella decisione.",
            " */",
            "export const TINTE = {",
        ]
        for nome, (gradi, tav) in sorted(tinte.items()):
            colori = ", ".join(f'"#{r:02x}{g:02x}{b:02x}"' for r, g, b in tav)
            lines.append(f"  // {gradi:.0f}°")
            lines.append(f"  {nome}: [{colori}],")
        lines.append("};")
        lines.append("")

    for name, frames in groups.items():
        lines.append(f"const {name.upper()} = [")
        for f in frames:
            lines.append("  [")
            for row in _rows(f, chars):
                lines.append(f'    "{row}",')
            lines.append("  ],")
        lines.append("];")
        lines.append("")

    if guscio:
        righe_uovo, tavolozze_uovo, forma_uovo = guscio
        cella_h = _rule(game, "h", "CELLA")
        lines += [
            "/**",
            " * L'uovo, e le quattro tinte in cui è dipinto.",
            " *",
            " * **Un disegno solo.** Le quattro uova disegnate sono lo stesso uovo di quattro",
            " * colori — ridotte sulla loro griglia, la sagoma coincide cella per cella — quindi",
            " * qui c'è una griglia e quattro tavolozze, e ridisegnarne una non può far divergere",
            " * la forma dalle altre tre.",
            " *",
            " * Le tavolozze sono **misurate**, non ruotate: per ogni colore del riferimento si",
            " * guarda che colore ci mette l'altro uovo, e si prende la mediana del gruppo. Ruotare",
            " * la tinta era la strada ovvia, e dà un verde che non è il verde disegnato.",
            " *",
            " * Il colore dice **che classe uscirà** da quella cella se la lasci lì, ed è lo stesso",
            " * verde, rosso e viola dei nemici. L'oro non è una classe: è l'avviso che quella cella",
            " * sta per schiudersi.",
            " */",
            "export const EGG_SPRITE = [",
        ]
        for row in righe_uovo:
            lines.append(f'  "{row}",')
        lines.append("];")
        lines.append("")
        lines.append("export const EGG_PALETTES = {")
        for nome, tav in sorted(tavolozze_uovo.items()):
            colori = ", ".join(f'"#{r:02x}{g:02x}{b:02x}"' for r, g, b in tav)
            lines.append(f"  {nome}: [{colori}],")
        lines.append("};")
        lines.append("")
        lines += [
            "// Come per il dodo: **di quanto la riga 0 del disegno sta sotto il centro del corpo**,",
            "// in pixel di schermo. L'uovo si appoggia per il fondo, che è dove il ripiano lo ferma.",
            "export const EGG = {",
            f"  box: {{ w: {forma_uovo[1]}, h: {forma_uovo[0]} }},",
            f"  lift: {_anchor_row(cella_h, forma_uovo[0] - 1)},",
            "};",
            "",
        ]

    lines += [
        "// Dove il pennone lascia l'elmo, per fotogramma. Ricavato dal disegno: vedi _anchor() nel",
        "// convertitore per il motivo per cui non è semplicemente il pixel più alto.",
        "export const PILOT_SPRITES = {",
        "  walk: WALK,",
        "  fly: FLY,",
        f"  walkAnchors: {anchors['walk']},",
        f"  flyAnchors: {anchors['fly']},",
        "  // L'occhio, per fotogramma: **l'angolo in alto a sinistra** del blocco EYE, non la",
        "  // pupilla. `walkGlints` dice quale colonna è bianca da cima a fondo — quella dietro —",
        "  // e serve solo ai controlli: chi disegna copre il blocco intero e non ha bisogno di",
        "  // saperlo.",
        "  //",
        "  // Bianco e pupilla vengono dal disegno: nel foglio sono due barre da cinque pixel su una",
        "  // cella da undici, che la mediana perdeva e che _recover() rimette. Qui si decide solo",
        "  // come riempire il blocco: bianco su tre celle, pupilla nella quarta, davanti e in basso.",
        "  // Lo sprite guarda a destra, quindi la pupilla davanti è la pupilla che guarda avanti.",
        f"  walkEyes: {json_list(eyes['walk'])},",
        f"  flyEyes: {json_list(eyes['fly'])},",
        f"  walkGlints: {json_list(glints['walk'])},",
        f"  flyGlints: {json_list(glints['fly'])},",
        f"  box: {{ w: {box[1]}, h: {box[0]} }},",
        "  // **Di quanto la riga 0 dello sprite sta sotto il centro del corpo**, in pixel di",
        f"  // schermo. Viene dai piedi: la camminata disegna la sua riga più bassa alla {piedi}, e",
        "  // quella riga deve cadere sul fondo della scatola di collisione, che è dove il dodo sta",
        "  // in piedi.",
        "  //",
        "  // Centrando lo sprite sul corpo il dodo affondava di cinque pixel nella piattaforma, e",
        "  // non era un difetto nuovo: succede a chiunque tenga una scatola grande quanto il torso e",
        "  // un disegno grande quanto la bestia.",
        "  //",
        "  // **Da qui discende `lanceRise`**, e per questo il numero sta in un posto solo: la regola",
        "  // dell'altezza legge la punta a un certo scarto dal centro del corpo, e quello scarto",
        "  // dipende da dove il disegno è appoggiato. Chi lo ricopia sposta la regola in silenzio.",
        f"  lift: {_anchor_row(hbox, piedi)},",
        "};",
        "",
        "/** Il riquadro dell'occhio, in pixel di sprite. Misurato sul disegno, non deciso qui. */",
        f"export const EYE = {{ w: {eye_w}, h: {eye_h} }};",
        "",
        "/** Width and height of a frame, in sprite pixels. Used by the tests. */",
        "export function measure(rows) {",
        "  return { w: Math.max(...rows.map((row) => row.length)), h: rows.length };",
        "}",
        "",
        "/**",
        " * I caratteri della griglia, in ordine di tavolozza. Il posto di un carattere qui è il suo",
        " * indice in PALETTE, e «.» è carta.",
        " *",
        " * Erano sedici, ed erano un tetto che nessuno si era accorto di aver messo: con `parseInt(ch,",
        " * 16)` sparso in quattro file, una tavolozza più lunga di sedici colori non si poteva scrivere.",
        " * Non era una scelta sul disegno, era una scelta sulla codifica — e ha quantizzato a quattordici",
        " * colori un foglio che ne portava cinquantatré esatti. Ora la codifica sta scritta in un posto",
        " * solo, qui, e chi legge un pixel passa da `tint`.",
        " */",
        f"export const ALPHABET = \"{ALPHABET}\";",
        "",
        "/** Il colore di un carattere della griglia, o null se quel carattere è carta. */",
        "export function tint(ch) {",
        "  const i = ALPHABET.indexOf(ch);",
        "  return i < 0 ? null : PALETTE[i];",
        "}",
        "",
        "/**",
        " * Walk a frame, calling `paint(x, y, index)` for every pixel that is not transparent.",
        " *",
        " * `flip` mirrors horizontally. Mirroring here rather than keeping a second copy is what stops",
        " * the two directions diverging the first time somebody edits a wing.",
        " */",
        "export function each(rows, flip, paint) {",
        "  const width = Math.max(...rows.map((row) => row.length));",
        "  for (let y = 0; y < rows.length; y += 1) {",
        "    const row = rows[y];",
        "    for (let x = 0; x < row.length; x += 1) {",
        "      const ch = row[x];",
        "      if (ch === \".\") continue;",
        "      paint(flip ? width - 1 - x : x, y, ALPHABET.indexOf(ch));",
        "    }",
        "  }",
        "}",
        "",
    ]

    out.write_text("\n".join(lines), encoding="utf-8")
    dove = out.relative_to(ROOT) if str(out).startswith(str(ROOT)) else out
    print(f"  scritto {dove} ({len(lines)} righe)")

    # The one number this script and the game must agree on. Checked rather than trusted, because a
    # disagreement here is a sprite drawn at half scale and nothing that says so.
    game = (ROOT / "app" / "spronia" / "run" / "game.js").read_text(encoding="utf-8")
    found = re.search(r"export const PIXEL = (\d+);", game)
    if not found or int(found.group(1)) != CELL:
        raise SystemExit(f"CELL è {CELL} qui e PIXEL è {found.group(1) if found else '?'} "
                         f"in game.js: gli sprite uscirebbero in scala sbagliata")
    print(f"  PIXEL in game.js concorda: {CELL}")

    # E il riquadro. Prima non serviva perché era sempre lo stesso; adesso che il disegno decide la
    # sua misura, un foglio nuovo e una SPRITE vecchia farebbero un personaggio che occupa un posto
    # diverso da quello che si vede — cioè colpi che passano attraverso e colpi che vanno a vuoto,
    # senza niente a schermo che lo spieghi.
    detto = re.search(r"export const SPRITE = \{ w: (\d+), h: (\d+) \};", game)
    voluto = (box[1] * CELL, box[0] * CELL)
    if not detto or (int(detto.group(1)), int(detto.group(2))) != voluto:
        raise SystemExit(
            f"il foglio dà un riquadro di {box[1]} x {box[0]} pixel = {voluto[0]} x {voluto[1]} "
            f"unità, e game.js dice SPRITE = "
            f"{{ w: {detto.group(1) if detto else '?'}, h: {detto.group(2) if detto else '?'} }}")
    print(f"  SPRITE in game.js concorda: {voluto[0]} x {voluto[1]} unità")

    # E il corpo. Non si impone — è un numero di tatto, si giudica giocando — ma si **stampa**, con
    # la quota che copre, perché è così che è sfuggito: la scatola è rimasta 56 x 56 mentre il
    # disegno passava da 96 x 80 a 124 x 108 unità, e da lì teneva il 57% del corpo. Due dodi che si
    # attraversano sovrapposti per mezzo corpo, e nessuna riga di output che lo dicesse.
    nucleo = None
    for frames in groups.values():
        for f in frames:
            vivo = f >= 0
            nucleo = vivo if nucleo is None else (nucleo & vivo)
    riga = max(range(nucleo.shape[0]), key=lambda y: int(nucleo[y].sum()))
    nucleo[max(0, riga - 1):riga + 2] = False
    ys, xs = np.nonzero(nucleo)
    corpo = ((xs.max() - xs.min() + 1) * CELL, (ys.max() - ys.min() + 1) * CELL)
    scatola = re.search(r"w: (\d+),\s*\n\s*h: (\d+),", game)
    if scatola:
        pw, ph = int(scatola.group(1)), int(scatola.group(2))
        print(f"  corpo disegnato (in tutti i fotogrammi, tolta la lancia): {corpo[0]} x {corpo[1]} "
              f"unità; PILOT è {pw} x {ph} = {100 * pw // corpo[0]}% e {100 * ph // corpo[1]}%")


if __name__ == "__main__":
    main()
