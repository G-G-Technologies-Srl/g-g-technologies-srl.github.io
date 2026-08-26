# -*- coding: utf-8 -*-
"""Le creature nemiche di SPRONIA, disegnate in codice.

Il dodo del giocatore viene da un foglio disegnato a mano e passa per `make_spronia_sprites.py`.
I nemici no: sono **parametrici**, come le illustrazioni degli articoli in `article_art.py`, e per
le stesse ragioni.

- Tre classi devono distinguersi per **sagoma**, e una sagoma si controlla se è fatta di numeri.
  Con tre fogli disegnati a mano la differenza fra un corpo tozzo e uno affilato è un'opinione;
  qui è un raggio.
- Il patto fra disegno e regola vale anche per loro: la punta della lancia deve cadere dove
  `lanceTip` la legge, entro un pixel. Disegnandola si mette dove serve, invece di sperare che il
  foglio l'abbia messa lì.
- Niente file binari, niente rumore di compressione, nessun passo di recupero. Quello che esce è
  già a piena risoluzione di sprite.

Il cavaliere e la lancia sono **gli stessi per tutte e tre**: cambia la bestia sotto. È anche il
motivo per cui la sella sta a una quota fissa — un cavaliere che salisse e scendesse da una classe
all'altra si noterebbe più della classe stessa.

    python3 _src/make_spronia_creatures.py            # scrive l'anteprima
    python3 _src/make_spronia_creatures.py --write    # e anche creatures.js
"""

import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "app/spronia/run/sprites.js"
OUT = ROOT / "app/spronia/run/creatures.js"
PREVIEW = Path("/tmp/spronia-creature.png")

# Il riquadro, uguale a quello del dodo: SPRITE 96 x 76 unità con CELL 2.
W, H = 48, 38
CX, CY = W / 2, H / 2

# Dove la regola legge la punta della lancia, in pixel di sprite, rivolta a destra.
# PILOT.lanceReach 44 e lanceRise -16, diviso CELL.
TIP_X, TIP_Y = int(CX + 22), int(CY - 8)

# La sella: la quota a cui il cavaliere appoggia, uguale per tutte le creature.
SADDLE_Y = 17

# -----------------------------------------------------------------------------------------------------------------
#  l a   t a v o l o z z a
# -----------------------------------------------------------------------------------------------------------------

# Letta da sprites.js invece che ripetuta qui. Una seconda tavolozza sarebbe una seconda cosa da
# tenere allineata, e sarebbe anche visibile: due creature dello stesso gioco con due gamme di
# marroni diverse si notano subito.
def _palette():
    src = SPRITES.read_text(encoding="utf-8")
    block = re.search(r"export const PALETTE = \[(.*?)\];", src, re.S).group(1)
    return re.findall(r'"(#[0-9a-fA-F]{6})"', block)


PAL = _palette()
NERO, SCURO, ROSSOSCURO, BRUNO, ASTA, GRIGIOBRUNO = 0, 1, 2, 3, 4, 5
ROSSO, MEDIO, TANA, CALDO, ACCIAIO, AMBRA, PALLIDO, BIANCO = 6, 7, 8, 9, 10, 11, 12, 13

# -----------------------------------------------------------------------------------------------------------------
#  i l   f o g l i o
# -----------------------------------------------------------------------------------------------------------------


def _blank():
    return [[-1] * W for _ in range(H)]


def _put(px, x, y, colour):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < W and 0 <= y < H:
        px[y][x] = colour


def _ellipse(px, cx, cy, rx, ry, colour):
    """Un'ellisse piena. Il mattone di ogni corpo."""
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            dx = (x - cx) / max(rx, 0.5)
            dy = (y - cy) / max(ry, 0.5)
            if dx * dx + dy * dy <= 1.0:
                _put(px, x, y, colour)


def _bar(px, x0, y0, x1, y1, colour, thick=1):
    """Un segmento spesso, per colli, zampe e ali."""
    steps = int(max(abs(x1 - x0), abs(y1 - y0))) * 2 + 1
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        r = (thick - 1) / 2
        for oy in range(-int(r) - 1, int(r) + 2):
            for ox in range(-int(r) - 1, int(r) + 2):
                if ox * ox + oy * oy <= r * r + 0.25:
                    _put(px, x + ox, y + oy, colour)


def _ramp(px, colour, tones):
    """Dà volume a una massa piatta: una rampa diagonale, dal chiaro in alto a sinistra allo scuro
    in basso a destra.

    La prima versione schiariva la riga di bordo in alto e scuriva quella in basso, e non bastava:
    un filo chiaro attorno a un campo uniforme non è un corpo illuminato, è un corpo con un filo
    attorno. Quello che fa leggere una massa come rotonda sono **poche fasce nette** lungo una sola
    direzione di luce — mai una sfumatura, che a questa risoluzione diventa rumore.

    La direzione è la stessa in tutto il gioco: luce da sopra-sinistra, come sui riquadri del sito.
    """
    punti = [(x, y) for y in range(H) for x in range(W) if px[y][x] == colour]
    if not punti:
        return
    xs = [p[0] for p in punti]
    ys = [p[1] for p in punti]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    largo = max(1, x1 - x0)
    alto = max(1, y1 - y0)
    for x, y in punti:
        # Distanza lungo la diagonale della luce, da 0 (illuminato) a 1 (in ombra).
        t = 0.5 * (x - x0) / largo + 0.5 * (y - y0) / alto
        px[y][x] = tones[min(len(tones) - 1, int(t * len(tones)))]


def _wing(px, wx, wy, salita, colour):
    """L'ala vicina, col suo bordo scuro.

    Il bordo non è decorazione. `_outline` circonda la **sagoma intera**, quindi non separa l'ala
    dal corpo che le sta dietro: senza un filo suo, un'ala del colore della schiena sparisce dentro
    la schiena. È successo al primo giro, e in modo istruttivo — l'ala era disegnata, il colore con
    cui la disegnavo era uno di quelli che la rampa del corpo produce, e le due masse si sono
    saldate senza che niente segnalasse niente.

    Perciò si dipinge due volte: prima più grossa in scuro, poi dentro nel suo colore.
    """
    # Il bordo d'attacco, e sotto una membrana che si assottiglia verso la punta. Un'ala non è una
    # barra: è una linea tesa con del tessuto appeso, e a questa risoluzione bastano due tratti a
    # profondità diversa perché l'occhio la legga così.
    punta = (wx - 13, wy + int(salita * 1.7))
    for tinta, gonfio in ((SCURO, 1), (colour, 0)):
        passi = 26
        for i in range(passi + 1):
            t = i / passi
            x = wx + (punta[0] - wx) * t
            y = wy + (punta[1] - wy) * t
            fondo = (5 - 4 * t) + gonfio                  # spessa alla spalla, sottile in punta
            _bar(px, x, y - gonfio, x, y + fondo, tinta, 1)

    # Le remiganti: tre penne divergenti oltre la punta, che è quello che rompe la sagoma e le
    # toglie l'aria di asse di legno.
    for i, apertura in enumerate((-2, 0, 2)):
        _bar(px, punta[0], punta[1], punta[0] - 4, punta[1] + apertura, SCURO, 3)
    for i, apertura in enumerate((-2, 0, 2)):
        _bar(px, punta[0], punta[1], punta[0] - 4, punta[1] + apertura, colour, 1)

    _ramp(px, colour, [colour, colour, BRUNO])


def _outline(px, colour=SCURO):
    """Un filo scuro attorno alla sagoma.

    Su un fondo quasi nero un corpo bruno senza contorno si sfalda ai bordi; con il contorno resta
    una figura anche quando è piccola e in movimento. È la stessa ragione per cui il dodo ce l'ha.
    """
    fatto = [row[:] for row in px]
    for y in range(H):
        for x in range(W):
            if px[y][x] != -1:
                continue
            vicino = False
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and px[ny][nx] not in (-1, colour):
                    vicino = True
            if vicino:
                fatto[y][x] = colour
    for y in range(H):
        px[y] = fatto[y]


# -----------------------------------------------------------------------------------------------------------------
#  i l   c a v a l i e r e ,   u g u a l e   p e r   t u t t i
# -----------------------------------------------------------------------------------------------------------------


def _rider(px, lean=0):
    """Il cavaliere sulla sella, in rosso, con l'elmo.

    `lean` inclina il busto di un pixel: in volo si china in avanti. Non è animazione fine a sé
    stessa — è quello che dice, senza spiegarlo, che la bestia sta accelerando.
    """
    bx, by = 21, SADDLE_Y - 4 + lean

    _bar(px, bx - 5, by + 3, bx + 1, by + 5, ROSSOSCURO, 3)      # il mantello, giù sulla groppa
    _ellipse(px, bx, by + 1, 3, 4, ROSSO)                        # il busto
    _ramp(px, ROSSO, [ROSSO, ROSSO, ROSSOSCURO])

    # Il braccio va **dalla spalla alla mano**, cioè al punto da cui parte l'asta. Nella prima
    # stesura finiva un paio di pixel prima e la lancia sembrava galleggiare davanti al cavaliere:
    # un difetto che si vede solo quando le due parti sono disegnate da funzioni diverse.
    _bar(px, bx + 2, by, 24, TIP_Y + 3 + lean, ROSSOSCURO, 3)
    _bar(px, bx + 2, by, 24, TIP_Y + 3 + lean, ROSSO, 1)

    # L'elmo: una calotta bassa con la visiera in avanti e la feritoia scura. Tondo e alto sembrava
    # un cappello, che è il modo più rapido di far leggere un cavaliere come un fungo.
    _ellipse(px, bx, by - 4, 3, 2, ACCIAIO)
    _bar(px, bx + 1, by - 3, bx + 4, by - 3, ACCIAIO, 2)
    _put(px, bx + 3, by - 3, NERO)
    _put(px, bx - 3, by - 5, GRIGIOBRUNO)                        # il pennacchio spento, di lato
    _ramp(px, ACCIAIO, [PALLIDO, ACCIAIO, GRIGIOBRUNO])


def _lance(px, lean=0):
    """La lancia, e il patto con la regola.

    Parte dalla mano del cavaliere e finisce **esattamente** dove `lanceTip` la legge. Non è una
    scelta grafica: se la punta disegnata stesse altrove il gioco deciderebbe gli scontri su una
    misura che nessuno vede, e la tolleranza del controllo è di un pixel.
    """
    hand_x, hand_y = 24, TIP_Y + 3 + lean
    _bar(px, hand_x, hand_y, TIP_X - 4, TIP_Y, ASTA, 1)
    _bar(px, TIP_X - 4, TIP_Y, TIP_X, TIP_Y, ACCIAIO, 1)


# -----------------------------------------------------------------------------------------------------------------
#  l a   d e r i v a
# -----------------------------------------------------------------------------------------------------------------

# Quella che quasi non ti nota, e la sagoma lo dice: **larga, bassa e pesante**. Corpo tondo, collo
# corto, ali piccole per la mole. Deve leggersi come un animale che vola perché deve, non perché
# gli piace — l'opposto del Vertice, che arriverà affilato.
DERIVA = {
    "body": (20, 26, 12, 8),          # cx, cy, rx, ry
    "neck": ((27, 21), (33, 15)),
    "head": (35, 14, 4, 3),
    "beak": (38, 15, 44, 16),
    "legs": (17, 24),
}

# Le fasi del battito, in pixel di quota della punta dell'ala rispetto alla spalla. Una bestia
# pesante batte **ampio e lento**: sale poco sopra la schiena e scende molto sotto la pancia, che è
# il contrario di quello che farà il Vertice.
DERIVA_WING = (-5, 0, 6, 1)


def _deriva(px, phase, flying):
    c = DERIVA
    cx, cy, rx, ry = c["body"]
    wx, wy = cx - 1, cy - 4                              # la spalla

    # L'ala lontana, dietro il corpo: mezzo battito indietro rispetto a quella vicina. Senza, le due
    # ali si muovono all'unisono e l'animale sembra di cartone.
    if flying:
        lontana = DERIVA_WING[(phase + 2) % 4]
        _bar(px, wx, wy, wx - 9, wy + lontana, SCURO, 5)

    # Le zampe, sotto il corpo. Camminando alternano; in volo si raccolgono all'indietro.
    for i, lx in enumerate(c["legs"]):
        if flying:
            _bar(px, lx, cy + ry - 3, lx - 3, cy + ry + 1, BRUNO, 2)
            _bar(px, lx - 3, cy + ry + 1, lx - 6, cy + ry + 1, AMBRA, 1)
        else:
            step = (0, 3, 0, -3)[(phase + i * 2) % 4]
            _bar(px, lx, cy + ry - 3, lx + step, cy + ry + 4, BRUNO, 2)
            _bar(px, lx + step - 1, cy + ry + 5, lx + step + 3, cy + ry + 5, AMBRA, 2)

    _ellipse(px, cx, cy, rx, ry, MEDIO)                          # il corpo
    _ellipse(px, cx - rx + 2, cy - 2, 4, 5, MEDIO)               # la groppa, che allarga il davanti
    _bar(px, *c["neck"][0], *c["neck"][1], MEDIO, 5)             # il collo, corto e grosso
    _ellipse(px, *c["head"], MEDIO)                              # la testa

    # La coda: un ciuffo di tre penne divergenti, non un moncone. È la parte che dice «uccello» da
    # lontano più di qualunque altra, perché è l'unica che rompe la sagoma tonda.
    for i, alto in enumerate((-2, 0, 2)):
        _bar(px, cx - rx + 1, cy - 1, cx - rx - 7, cy - 1 + alto * 2, GRIGIOBRUNO, 2)

    # Da qui in poi non si tocca più MEDIO: la rampa lavora su tutta la massa in una volta sola,
    # quindi corpo, collo e testa si illuminano insieme e le giunture spariscono.
    _ramp(px, MEDIO, [PALLIDO, CALDO, MEDIO, GRIGIOBRUNO, BRUNO])
    _ramp(px, GRIGIOBRUNO, [MEDIO, GRIGIOBRUNO, BRUNO])

    bx0, by0, bx1, by1 = c["beak"]
    _bar(px, bx0, by0, bx1, by1, AMBRA, 2)                       # il becco, corto e adunco
    _bar(px, bx1 - 1, by1, bx1, by1 + 2, AMBRA, 1)               # e la punta che scende
    _bar(px, bx0, by0 + 1, bx1 - 1, by1 + 1, TANA, 1)            # la sua ombra sotto

    # L'occhio: bianco e pupilla, come quello del dodo, e per la stessa ragione — un puntino scuro
    # in mezzo ad altri puntini scuri non è un occhio.
    hx, hy = c["head"][0], c["head"][1]
    _put(px, hx, hy - 1, BIANCO)
    _put(px, hx + 1, hy - 1, NERO)

    # L'ala vicina, sopra tutto: la sola parte che si muove davvero, e quella che porta il battito.
    salita = DERIVA_WING[phase] if flying else (-1, 0, 1, 0)[phase]
    _wing(px, wx, wy, salita, TANA)


# -----------------------------------------------------------------------------------------------------------------
#  m o n t a g g i o
# -----------------------------------------------------------------------------------------------------------------

CREATURES = {"deriva": _deriva}


def _frame(kind, phase, flying):
    px = _blank()
    CREATURES[kind](px, phase, flying)
    _outline(px)
    _rider(px, lean=-1 if flying else 0)
    _lance(px, lean=-1 if flying else 0)
    return px


def _rows(px):
    return ["".join("." if v < 0 else "0123456789abcdef"[v] for v in row) for row in px]


def _preview(kinds, scale=9):
    cycles = []
    for kind in kinds:
        cycles.append([_frame(kind, p, False) for p in range(4)])
        cycles.append([_frame(kind, p, True) for p in range(4)])
    img = Image.new("RGB", (W * 4 * scale, H * len(cycles) * scale), (11, 15, 26))
    out = img.load()
    for r, cycle in enumerate(cycles):
        for i, px in enumerate(cycle):
            for y in range(H):
                for x in range(W):
                    v = px[y][x]
                    if v < 0:
                        continue
                    hexa = PAL[v]
                    rgb = (int(hexa[1:3], 16), int(hexa[3:5], 16), int(hexa[5:7], 16))
                    for dy in range(scale):
                        for dx in range(scale):
                            out[(i * W + x) * scale + dx, (r * H + y) * scale + dy] = rgb
    img.save(PREVIEW)
    return img.size


def main():
    kinds = [k for k in CREATURES]
    size = _preview(kinds)
    print(f"  anteprima {PREVIEW}  {size[0]} x {size[1]}")
    for kind in kinds:
        px = _frame(kind, 0, True)
        rows = _rows(px)
        # Il controllo che conta più di ogni altro: la punta più a destra del disegno deve stare
        # dove la regola la cerca.
        best = (-1, -1)
        for y, row in enumerate(rows):
            for x in range(W - 1, -1, -1):
                if row[x] != ".":
                    if x > best[0]:
                        best = (x, y)
                    break
        print(f"  {kind}: punta disegnata in {best}, attesa ({TIP_X}, {TIP_Y})")
    if "--write" in sys.argv:
        print("  (la scrittura di creatures.js arriva quando le tre sagome sono approvate)")


if __name__ == "__main__":
    main()
