# -*- coding: utf-8 -*-
"""Draw one social card per page and language, from the titles in content.py.

Kept out of build.py on purpose: build.py needs no dependencies beyond Python, this needs Pillow
and the Inter font from the brand folder. Run it when a title changes, not on every build.

Usage:  python3 _src/make_og_cards.py [--brand /path/to/ggtechnologies-brand]
"""

import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SRC = Path(__file__).resolve().parent
ROOT = SRC.parent
ASSETS = ROOT / "assets"

sys.path.insert(0, str(SRC))
import article_art  # noqa: E402
from content import ARTICLES, CHROME, PAGES  # noqa: E402

W, H = 1200, 630
INK = (13, 18, 32)
PANEL = (23, 33, 54)
PANEL_2 = (30, 42, 67)
MUTED = (170, 179, 201)
TEXT = (238, 241, 248)
FAINT = (143, 152, 173)
EMERALD = (52, 211, 153)
EMERALD_LIGHT = (94, 236, 171)

# The illustration band at the foot of an article card. The card is always dark — a JPEG cannot
# follow the theme switch the way the inline banner does.
ART_BOX = (0, 372, W, 186)

BRAND_CANDIDATES = [
    Path.home() / "Claude" / "Projects" / "ggtechnologies-brand",
    ROOT.parent / "ggtechnologies-brand",
    ROOT.parent.parent / "ggtechnologies-brand",
]

# The project page keeps its photographic card: a drawn one would say less.
SKIP = {"homecare"}


# -----------------------------------------------------------------------------------------------------------------
#  p r i v a t e
# -----------------------------------------------------------------------------------------------------------------

def _find_fonts(explicit):
    """Inter from the brand folder, since the cards must match printed material."""
    for base in ([Path(explicit)] if explicit else []) + BRAND_CANDIDATES:
        folder = base / "font"
        bold, regular = folder / "Inter-Bold.ttf", folder / "Inter-Regular.ttf"
        if bold.exists() and regular.exists():
            return bold, regular
    raise SystemExit(
        "Inter non trovato. Indica la cartella del brand:\n"
        "  python3 _src/make_og_cards.py --brand /percorso/di/ggtechnologies-brand"
    )


def _wrap(draw, text, font, max_width):
    lines, line = [], ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def _title_font(draw, text, bold, max_width, max_lines=3):
    """Shrink until the title fits in at most three lines: titles differ a lot in length."""
    for size in range(66, 37, -2):
        font = ImageFont.truetype(str(bold), size)
        if len(_wrap(draw, text, font, max_width)) <= max_lines:
            return font, _wrap(draw, text, font, max_width)
    font = ImageFont.truetype(str(bold), 38)
    return font, _wrap(draw, text, font, max_width)[:max_lines]


def _mark(draw, x, y, size):
    """The brand mark: the open ring with the lit dot at its centre."""
    r = size / 2
    draw.arc([x, y, x + size, y + size], start=-60, end=210, fill=EMERALD_LIGHT, width=max(3, size // 8))
    draw.line([x + size * 0.66, y + r, x + size, y + r], fill=EMERALD_LIGHT, width=max(3, size // 8))
    d = size * 0.18
    draw.ellipse([x + r - d, y + r - d, x + r + d, y + r + d], fill=TEXT)


def _blend(colour, opacity, over=INK):
    """Pillow has no alpha on a plain RGB canvas, so opacity is mixed in by hand."""
    return tuple(round(over[i] + (colour[i] - over[i]) * opacity) for i in range(3))


def _paint_art(img, draw, shapes, box):
    """The article illustration, from the same primitives the inline banner is built from.

    The banner and the card have different aspect ratios, so `article_art` is asked for the band's
    own size instead of scaling a finished picture: stretching would flatten the fragments into
    lozenges and give the two versions a different texture.
    """
    ox, oy, _, _ = box
    for shape in shapes:
        role = shape["role"]
        if role == article_art.GLOW:
            continue  # a radial halo would band badly in a JPEG; the flat panel reads better
        if role == article_art.PANEL:
            draw.rounded_rectangle(
                [ox + shape["x"], oy + shape["y"],
                 ox + shape["x"] + shape["w"], oy + shape["y"] + shape["h"]],
                radius=shape["r"], fill=PANEL_2, outline=PANEL, width=1)
        elif role == article_art.EDGE:
            draw.line([ox + shape["x1"], oy + shape["y1"], ox + shape["x2"], oy + shape["y2"]],
                      fill=EMERALD, width=3)
        elif role in (article_art.ROW, article_art.MARK):
            colour = EMERALD if role == article_art.MARK else MUTED
            draw.rounded_rectangle(
                [ox + shape["x"], oy + shape["y"],
                 ox + shape["x"] + shape["w"], oy + shape["y"] + shape["h"]],
                radius=shape["h"] / 2, fill=_blend(colour, shape["opacity"], PANEL_2))
        else:
            size = max(2.0, shape["size"])
            draw.rounded_rectangle(
                [ox + shape["x"], oy + shape["y"], ox + shape["x"] + size, oy + shape["y"] + size],
                radius=1, fill=_blend(EMERALD, shape["opacity"]))


def _article_card(article, lang, bold, regular, out):
    """An article card: same furniture as a page card, with the illustration in place of the band."""
    data = article[lang]
    img = Image.new("RGB", (W, H), INK)
    draw = ImageDraw.Draw(img)
    draw.line([0, 0, W, 0], fill=EMERALD, width=8)

    shapes = article_art.ARTICLE_ART[article["key"]](ART_BOX[2], ART_BOX[3])
    _paint_art(img, draw, shapes, ART_BOX)

    margin = 72
    _mark(draw, margin, 64, 52)
    draw.text((margin + 74, 78), "G&G Technologies", font=ImageFont.truetype(str(bold), 26), fill=TEXT)

    kicker = re.sub(r"<[^>]+>", "", data["kicker"]).replace("&amp;", "&")
    draw.text((margin, 166), kicker.upper(), font=ImageFont.truetype(str(bold), 22), fill=EMERALD)

    # The h1, not the <title>: the <title> carries the company suffix, which the card already shows.
    headline = re.sub(r"<[^>]+>", "", data["h1"]).replace("&amp;", "&")
    y = 216
    # The title has to stop above the illustration. Titles differ a lot in length, so the size is
    # chosen from the room actually left, not from a fixed maximum: a long one on three lines at
    # 66pt would print straight over the drawing.
    room = ART_BOX[1] - y - 18
    for size in range(58, 31, -2):
        font = ImageFont.truetype(str(bold), size)
        lines = _wrap(draw, headline, font, W - margin * 2)
        if len(lines) * (size + 10) <= room:
            break
    for line in lines:
        draw.text((margin, y), line, font=font, fill=TEXT)
        y += font.size + 10

    small = ImageFont.truetype(str(regular), 24)
    draw.text((margin, H - 56), CHROME[lang]["payoff"], font=small, fill=FAINT)
    domain = "ggtechnologies.sm" + ("/en" if lang == "en" else "")
    draw.text((W - margin - draw.textlength(domain, font=small), H - 56), domain, font=small, fill=FAINT)

    name = f"og-{article['key']}-{lang}.jpg"
    img.save(out / name, "JPEG", quality=88, optimize=True, progressive=True)
    return name, (out / name).stat().st_size


def _card(page_key, lang, data, bold, regular, out):
    img = Image.new("RGB", (W, H), INK)
    draw = ImageDraw.Draw(img)

    # a soft panel band, so the card is not a flat rectangle
    draw.rounded_rectangle([-40, H - 190, W + 40, H + 60], radius=40, fill=PANEL)
    draw.line([0, 0, W, 0], fill=EMERALD, width=8)

    margin = 72
    _mark(draw, margin, 64, 52)
    draw.text((margin + 74, 78), "G&G Technologies", font=ImageFont.truetype(str(bold), 26), fill=TEXT)

    # Strip only the exact company suffix. Splitting on the first dash would reduce a title like
    # "DigiSense® — il framework di G&G Technologies" to one word.
    title = data["title"]
    for suffix in (" — G&G Technologies", " — G&amp;G Technologies"):
        if title.endswith(suffix):
            title = title[: -len(suffix)]
    title = title.replace("&amp;", "&")

    # A kicker that merely repeats the title says nothing: drop it and give the room to the text.
    kicker = data["short"].replace("&amp;", "&")
    plain = lambda text: text.lower().replace("®", "").replace("&", "").replace(" ", "")
    y = 168
    if kicker and plain(kicker) not in plain(title):
        draw.text((margin, y), kicker.upper(), font=ImageFont.truetype(str(bold), 22), fill=EMERALD)
        y += 48

    font, lines = _title_font(draw, title, bold, W - margin * 2)
    for line in lines:
        draw.text((margin, y), line, font=font, fill=TEXT)
        y += font.size + 12

    # Short titles leave the card looking unfinished: fill it with the page's own opening line.
    if len(lines) <= 2:
        lead = re.sub(r"<[^>]+>", "", data["lead"]).replace("&amp;", "&")
        sub = ImageFont.truetype(str(regular), 27)
        for line in _wrap(draw, lead, sub, W - margin * 2)[:2]:
            draw.text((margin, y + 14), line, font=sub, fill=FAINT)
            y += sub.size + 8

    payoff = CHROME[lang]["payoff"]
    draw.text((margin, H - 118), payoff, font=ImageFont.truetype(str(regular), 24), fill=FAINT)
    domain = "ggtechnologies.sm" + ("/en" if lang == "en" else "")
    small = ImageFont.truetype(str(regular), 24)
    draw.text((W - margin - draw.textlength(domain, font=small), H - 118), domain, font=small, fill=FAINT)

    name = f"og-{page_key}-{lang}.jpg"
    img.save(out / name, "JPEG", quality=88, optimize=True, progressive=True)
    return name, (out / name).stat().st_size


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--brand", help="cartella ggtechnologies-brand, se non è accanto al repo")
    args = parser.parse_args()

    bold, regular = _find_fonts(args.brand)
    ASSETS.mkdir(exist_ok=True)
    made = []
    for page in PAGES:
        if page["key"] in SKIP:
            continue
        for lang in ("it", "en"):
            made.append(_card(page["key"], lang, page[lang], bold, regular, ASSETS))

    # the two homepages: the tagline is the whole message there
    home = {
        "it": {"short": "", "title": "Trent'anni di tecnologia. L'AI di oggi. Le persone che decidono.",
               "lead": "Progettiamo e realizziamo tecnologia dalla Repubblica di San Marino."},
        "en": {"short": "", "title": "Thirty years of technology. Today's AI. People who decide.",
               "lead": "We design and build technology from the Republic of San Marino."},
    }
    for lang, data in home.items():
        made.append(_card("home", lang, data, bold, regular, ASSETS))

    # Articles: only those that have an illustration. One without would be a page card with a hole.
    for article in ARTICLES:
        if article["key"] not in article_art.ARTICLE_ART:
            continue
        for lang in ("it", "en"):
            made.append(_article_card(article, lang, bold, regular, ASSETS))

    for name, size in made:
        print(f"  {name:<34} {size / 1024:5.0f} KB")
    print(f"\n{len(made)} card. Aggiungi \"og_image\" alle pagine in content.py se non c'è già.")


if __name__ == "__main__":
    main()
