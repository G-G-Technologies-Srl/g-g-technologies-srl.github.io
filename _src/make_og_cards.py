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
from apps import APPS
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


def _field_top(src):
    """La riga in cui comincia il campo di gioco, dentro lo screenshot di un'app.

    Il campo ha una cornice di tre pixel in `--border-strong`, che su un fondo scuro è di gran lunga
    la riga più chiara del quinto superiore dell'immagine. Trovarla vuol dire trovare il confine fra
    l'interfaccia e il gioco **senza sapere quanto è alta la barra in cima** — cioè senza un numero
    che smette di essere vero il giorno in cui la barra cambia.
    """
    limite = int(src.height * 0.2)
    migliore, dove = -1, int(src.height * 0.04)
    for y in range(limite):
        riga = [src.getpixel((x, y)) for x in range(0, src.width, 40)]
        luce = sum(sum(p) for p in riga) / len(riga)
        if luce > migliore:
            migliore, dove = luce, y
    # Appena sotto la cornice, non sopra: la cornice è dell'interfaccia, non del gioco.
    return min(dove + 3, int(src.height * 0.1))


def _shot_card(app, lang, regular, out):
    """La card di un'app **ritagliata dal suo screenshot**, invece che disegnata.

    Vale per le app che lo chiedono con `og_from_shot` nell'anagrafica, e oggi ne chiede una sola:
    un gioco. Una card di sola tipografia dice che esiste un prodotto; di un gioco non dice niente,
    perché quello che un gioco ha da far vedere è come si vede.

    **Ritagliata e non incollata**, e questa è la parte che conta. Lo screenshot è 1600 × 1000, cioè
    1,6 : 1; le anteprime dei social ritagliano a 1,91 : 1 per conto loro, e ritagliando da sole
    tolgono una fetta sopra e una sotto — dove stanno la barra dell'app e i due link del piede, cioè
    le uniche due parti che in un feed non servono a nessuno. Tanto vale toglierle qui, dove si può
    scegliere **quale** fetta tenere invece di subirla.

    Dove tagliare lo decide **la fotografia**, non una percentuale: `_field_top` cerca la cornice del
    campo. Una percentuale scritta a mano è giusta finché la barra in cima ha l'altezza che aveva il
    giorno in cui è stata scelta — al primo tentativo era il 6% e tagliava a metà le cifre del
    punteggio, che stanno appena sotto. Il resto è una riduzione a 1200 × 630, la misura che
    LinkedIn, X e le anteprime dei messaggi ritagliano meglio.

    Se lo screenshot non c'è, la card torna a essere quella disegnata invece di far fallire il giro:
    `make_screenshots.py` ha bisogno di un Chrome sulla macchina e non gira in automatico.
    """
    shot = out / f"shot-{app['key']}-{lang}.png"
    if not shot.is_file():
        return None

    src = Image.open(shot).convert("RGB")
    utile = src.crop((0, _field_top(src), src.width, src.height))

    # Il ritaglio a 1,91 : 1 si prende la fascia **alta** della parte utile, non quella centrale: il
    # titolo del gioco e la barra dei punti stanno in alto, la colata sta in fondo e da sola non
    # racconta niente.
    voluta = round(utile.width * H / W)
    if utile.height > voluta:
        utile = utile.crop((0, 0, utile.width, voluta))

    img = utile.resize((W, H), Image.LANCZOS)

    # **Due segni, e non uno di più.** Una fotografia che gira in un feed accanto alle altre card
    # del sito deve dire da dove viene, o è un'immagine qualunque; ma tutto quello che si aggiunge
    # sopra il campo copre la cosa che si voleva far vedere. Restano il filo di accento in cima —
    # che ce l'hanno tutte — e il dominio nell'angolo, sul cielo, dove non c'è niente da coprire.
    draw = ImageDraw.Draw(img)
    draw.line([0, 0, W, 0], fill=EMERALD, width=8)
    small = ImageFont.truetype(str(regular), 24)
    domain = "ggtechnologies.sm" + ("/en" if lang == "en" else "")
    draw.text((W - 40 - draw.textlength(domain, font=small), 34), domain, font=small, fill=MUTED)

    name = f"og-app-{app['key']}-{lang}.jpg"
    img.save(out / name, "JPEG", quality=86, optimize=True, progressive=True)
    return name, (out / name).stat().st_size


def _app_card(app, lang, bold, regular, out):
    """An app card. Same furniture as an article card, with the product name in place of the h1.

    The name is not translated, so the two cards differ only by kicker and summary — which is the
    point: two languages, one product.
    """
    data = app[lang]
    img = Image.new("RGB", (W, H), INK)
    draw = ImageDraw.Draw(img)
    draw.line([0, 0, W, 0], fill=EMERALD, width=8)

    _paint_art(img, draw, article_art.APP_ART[app["key"]](ART_BOX[2], ART_BOX[3]), ART_BOX)

    margin = 72
    _mark(draw, margin, 64, 52)
    draw.text((margin + 74, 78), "G&G Technologies", font=ImageFont.truetype(str(bold), 26), fill=TEXT)

    kicker = re.sub(r"<[^>]+>", "", data["kicker"]).replace("&amp;", "&")
    draw.text((margin, 166), kicker.upper(), font=ImageFont.truetype(str(bold), 22), fill=EMERALD)

    draw.text((margin, 210), app["name"], font=ImageFont.truetype(str(bold), 62), fill=TEXT)

    summary = re.sub(r"<[^>]+>", "", data["summary"]).replace("&amp;", "&")
    body = ImageFont.truetype(str(regular), 28)
    y = 292
    for line in _wrap(draw, summary, body, W - margin * 2)[:2]:
        draw.text((margin, y), line, font=body, fill=MUTED)
        y += body.size + 8

    small = ImageFont.truetype(str(regular), 24)
    draw.text((margin, H - 56), CHROME[lang]["payoff"], font=small, fill=FAINT)
    domain = "ggtechnologies.sm" + ("/en" if lang == "en" else "")
    draw.text((W - margin - draw.textlength(domain, font=small), H - 56), domain, font=small, fill=FAINT)

    name = f"og-app-{app['key']}-{lang}.jpg"
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

    # The two homepages: the tagline is the whole message there.
    #
    # These two titles repeat the <h1> of _src/home.html by hand, and nothing checks that they still
    # agree — the same trap as the two footers. If you change the homepage headline, change it here
    # in the same edit and rerun this script, or the card will keep advertising the old one.
    home = {
        "it": {"short": "", "title": "Facevamo machine learning prima che si chiamasse AI.",
               "lead": "Progettiamo e realizziamo tecnologia dalla Repubblica di San Marino."},
        "en": {"short": "", "title": "We were doing machine learning before it was called AI.",
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

    # Apps: the scheda derives og_image from the key and the build stops if the file is missing,
    # so forgetting to run this cannot be silent.
    for app in APPS:
        if app["key"] not in article_art.APP_ART:
            continue
        for lang in ("it", "en"):
            dalla_foto = app.get("og_from_shot") and _shot_card(app, lang, regular, ASSETS)
            made.append(dalla_foto or _app_card(app, lang, bold, regular, ASSETS))

    for name, size in made:
        print(f"  {name:<34} {size / 1024:5.0f} KB")
    print(f"\n{len(made)} card. Aggiungi \"og_image\" alle pagine in content.py se non c'è già.")


if __name__ == "__main__":
    main()
