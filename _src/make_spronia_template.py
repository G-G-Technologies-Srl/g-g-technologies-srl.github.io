# -*- coding: utf-8 -*-
"""Il modello su cui disegnare un foglio di sprite per SPRONIA.

Serve a chi disegna. Il convertitore `make_spronia_sprites.py` ricava da solo il passo della
griglia, le bande e le colonne, quindi un foglio non ha bisogno di essere perfetto — ma tre cose le
pretende, e sono quelle che il modello mette in chiaro:

1. **Il fondo è carta bianca.** Tutto quello che non è quasi bianco è disegno.
2. **La punta della lancia** è il pixel disegnato più a destra, e deve cadere sul segno. È l'unico
   punto in cui il disegno e le regole del gioco si toccano: `lanceTip` decide chi vince uno
   scontro, e se la punta sta altrove il gioco decide su una misura che nessuno vede.
3. **Due bande, quattro fotogrammi ciascuna**: camminata e volo, tutte e due verso destra. Il
   rendering specchia, quindi una camminata verso sinistra sarebbe una seconda copia della stessa
   posa da tenere allineata alla prima — e la copia che diverge è sempre quella che nessuno guarda.

Le guide sono dello stesso verde del fondo, schiarito, e si possono lasciare sul foglio finito: il
convertitore le tratta come carta. Non serve cancellarle, che è il genere di passaggio a mano che
prima o poi si dimentica.

Il foglio è **vuoto**. Una versione precedente disegnava dentro ogni riquadro l'ombra del personaggio
in uso, per far vedere dove va il corpo: comoda da spiegare, e in mezzo alla griglia diventa rumore
sotto il disegno vero. Le misure che servono davvero — centro, sella, punta della lancia — sono già
segnate, e sono tre righe invece di un uccello intero.

    python3 _src/make_spronia_template.py
"""

import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app/spronia/art/modello.png"

# -----------------------------------------------------------------------------------------------------------------
#  m i s u r e
# -----------------------------------------------------------------------------------------------------------------

# Un pixel di sprite quanti pixel di foglio. Dodici, cioè poco più degli 11,06 del foglio del dodo:
# abbastanza per disegnarci dentro comodi, e un numero tondo invece di uno misurato a posteriori.
CELL = 12

# The frame size in sprite pixels, **read from game.js instead of repeated here** — because the
# repeated copy has already gone stale once. SPRITE grew to 96 x 84 when a new sheet was adopted
# while this file still said 48 x 40, and the worked example quietly painted its last two rows
# into the gutter between the bands: the round trip lost rows and nothing said why.
def _sprite_box():
    game = (ROOT / "app/spronia/run/game.js").read_text(encoding="utf-8")
    m = re.search(r"export const SPRITE = \{ w: (\d+), h: (\d+) \};", game)
    if not m:
        raise SystemExit("SPRITE non trovato in game.js")
    return int(m.group(1)) // 2, int(m.group(2)) // 2


FW, FH = _sprite_box()

# Dove la regola legge la punta della lancia, dentro il riquadro: lanceReach e lanceRise di
# game.js divisi per la cella. Derivati, per la stessa ragione — e adesso letti davvero invece che
# ricopiati: 22 e 8 erano giusti finché il riquadro era 48 x 40, e sono diventati 28 e 4 il giorno
# in cui il disegno ha portato la propria misura.
def _lance():
    game = (ROOT / "app/spronia/run/game.js").read_text(encoding="utf-8")
    fuori = []
    for nome in ("lanceReach", "lanceRise"):
        m = re.search(rf"{nome}: (-?\d+),", game)
        if not m:
            raise SystemExit(f"{nome} non trovato in game.js")
        fuori.append(abs(int(m.group(1))) // 2)
    return fuori


REACH, RISE = _lance()
TIP = (FW // 2 + REACH, FH // 2 - RISE)
CENTRE = (FW // 2, FH // 2)
SADDLE = 15

# **Every layout measure is a multiple of CELL**, and this is not tidiness. The converter
# measures ONE pixel grid across the whole sheet; a gutter that is not a multiple of the cell
# shifts the phase of every frame after it, so the estimator lands on a compromise step —
# measured: 12.29 instead of 12.00 — and the skewed grid slices whole columns off the frames.
# Found by round-tripping the worked example through the converter, not by looking.
GUTTER = 24
MARGIN = 36
LABEL = 48

# **Due bande, non tre.** Il foglio del dodo ne aveva una in mezzo con la camminata verso sinistra,
# e il convertitore la scarta perché il rendering specchia. Il modello ha continuato a chiederla per
# un pezzo dopo che il convertitore aveva imparato a farne a meno: un terzo del disegno buttato via,
# e un terzo di occasioni in più di sbagliare.
BANDS = ["CAMMINATA — verso destra", "VOLO — verso destra"]

# Il fondo del foglio di produzione, e le guide sopra di esso.
#
# Verde pieno, e la ragione è la distanza: la bestia è bruna, il cavaliere azzurro e oro, il metallo
# grigio. Nessuno di quei colori si avvicina a questo verde, quindi il fondo non può essere scambiato
# per disegno né viceversa — che è invece il rischio del **fondo scuro**, dove il contorno più scuro
# della bestia dista poco dalla carta e il passo che toglie l'alone deve distinguerli su niente.
#
# Le guide sono lo stesso verde schiarito: restano leggibili e il convertitore le tratta come carta,
# perché la carta è misurata dal bordo dell'immagine e loro le stanno addosso.
# **Verde puro**, non un verde da stampa. La differenza è misurabile: mescolato al cinquanta per
# cento con un bruno del disegno, `#00FF00` dà un pixel ancora fortemente dominato dal verde
# (+112 sul rosso), mentre il `#4B9149` di prima ne dava +19 — dentro il rumore. È quella
# mescolanza che il convertitore deve riconoscere per togliere l'alone del JPEG, e con un verde
# spento la soglia va tarata fra due difetti opposti: troppo bassa mangia il bordo del disegno,
# troppo alta lascia celle di oliva che si prendono un posto in tavolozza.
FONDO = (0, 255, 0)
CIANO = (0, 160, 60)          # il reticolo maggiore
CIANO_TENUE = (0, 205, 40)    # la griglia di cella


def _font(size):
    for name in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _frame(draw, x0, y0):
    """Un riquadro: la griglia di cella, il bordo, il centro e il segno della punta.

    Ogni cella è segnata, e ogni ottava più marcata: servono a contare. Un reticolo tutto uguale su
    quarantotto colonne si conta male, e sbagliare colonna di uno è il modo più facile di disegnare
    un dettaglio **fra due celle** invece che dentro una.
    """
    for i in range(FW + 1):
        x = x0 + i * CELL
        draw.line([(x, y0), (x, y0 + FH * CELL)], fill=CIANO if i % 8 == 0 else CIANO_TENUE)
    for j in range(FH + 1):
        y = y0 + j * CELL
        draw.line([(x0, y), (x0 + FW * CELL, y)], fill=CIANO if j % 8 == 0 else CIANO_TENUE)

    draw.rectangle([x0, y0, x0 + FW * CELL, y0 + FH * CELL], outline=CIANO, width=2)

    # Il centro del corpo: è da qui che si misura tutto, ed è il punto che il gioco muove.
    cx, cy = x0 + CENTRE[0] * CELL, y0 + CENTRE[1] * CELL
    draw.line([(cx - 14, cy), (cx + 14, cy)], fill=CIANO)
    draw.line([(cx, cy - 14), (cx, cy + 14)], fill=CIANO)

    # La sella: la quota a cui appoggia il cavaliere. Tenerla uguale in tutti i fotogrammi è quello
    # che impedisce al cavaliere di sobbalzare mentre la bestia si muove sotto di lui.
    sy = y0 + SADDLE * CELL
    for x in range(x0, x0 + FW * CELL, 16):
        draw.line([(x, sy), (x + 8, sy)], fill=CIANO, width=2)

    # La punta della lancia. Un mirino, perché è l'unico pixel che deve stare esattamente lì.
    tx, ty = x0 + TIP[0] * CELL, y0 + TIP[1] * CELL
    draw.rectangle([tx, ty, tx + CELL, ty + CELL], outline=CIANO, width=2)
    draw.line([(tx - 22, ty + CELL // 2), (tx, ty + CELL // 2)], fill=CIANO, width=2)


NOTE = [
    "SFONDO DA IMPORTARE. Non ridimensionare: la griglia e' gia' quella giusta.",
    "Ogni quadratino = un pixel di sprite. Un dettaglio deve stare DENTRO un quadratino,",
    "    non a cavallo di due: meta' quadratino sparisce nella conversione.",
    "Non usare verde nel disegno: e' il colore del fondo.",
    "PNG, non JPEG. Bordi netti, nessun antialiasing contro il fondo.",
    f"Riquadro {FW} x {FH}. Il mirino a destra e' la punta della lancia: dev'essere il pixel",
    "    disegnato piu' a destra, perche' e' li' che il gioco legge chi vince uno scontro.",
    "La linea tratteggiata e' la sella: tienila uguale in tutti i fotogrammi.",
    "Le guide sono verdi anche loro: lasciale pure, il convertitore le legge come fondo.",
    f"Foglio {FW} x {FH} celle per fotogramma, {CELL} px per cella.",
]

RIGA_NOTA = 19


def main():
    cols, rows = 4, len(BANDS)
    w = MARGIN * 2 + cols * FW * CELL + (cols - 1) * GUTTER
    # **Il piede si calcola, non si sceglie.** Era fissato a centotrenta pixel quando le note erano
    # cinque; arrivate a nove ne servivano centosettanta, e le due in più finivano stampate sopra il
    # primo fotogramma dell'ultima banda — cioè sul foglio da disegnare. Una misura scritta a mano
    # accanto a un elenco che cresce è una cosa che diverge da sola, e questa era già la seconda
    # volta.
    piede = MARGIN + len(NOTE) * RIGA_NOTA
    h = MARGIN * 2 + rows * (FH * CELL + LABEL) + (rows - 1) * GUTTER + piede

    img = Image.new("RGB", (w, h), FONDO)
    draw = ImageDraw.Draw(img)
    titolo = _font(22)
    piccolo = _font(15)

    for r in range(rows):
        y0 = MARGIN + r * (FH * CELL + LABEL + GUTTER)
        draw.text((MARGIN, y0), BANDS[r], fill=CIANO, font=titolo)
        for c in range(cols):
            x0 = MARGIN + c * (FW * CELL + GUTTER)
            _frame(draw, x0, y0 + LABEL)
            draw.text((x0 + 6, y0 + LABEL - 21), f"fotogramma {c + 1}", fill=CIANO, font=piccolo)

    base = MARGIN + rows * (FH * CELL + LABEL) + (rows - 1) * GUTTER + 18
    for i, riga in enumerate(NOTE):
        draw.text((MARGIN, base + i * RIGA_NOTA), riga, fill=CIANO, font=piccolo)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print(f"  scritto {OUT.relative_to(ROOT)}  {w} x {h}")


if __name__ == "__main__":
    main()
