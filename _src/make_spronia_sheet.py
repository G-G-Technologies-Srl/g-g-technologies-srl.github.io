# -*- coding: utf-8 -*-
"""Turn one drawn pose into the eight-frame sheet the converter reads.

The artwork arrives as a single character on a transparent PNG, drawn on its own pixel grid — one
pose, painted properly, at whatever cell size the tool used. The converter downstream wants a sheet:
two bands of four frames on a plain background. This bridges the two.

**Nothing is resampled.** The pose is measured to its own grid, reduced to one value per cell, and
painted back out with each cell as a whole block of pixels. So the colours that come out are the
colours that went in, byte for byte, and the round trip is checked here rather than hoped for.

What comes out serves two purposes at once:

  - it is the sheet the converter reads today, with the same pose in all eight frames, so the game
    can be played at the new size before anybody draws the other seven;
  - it is the sheet to hand to whoever draws them, already on the right grid and with the right
    frame boxes, so the poses can be painted over the copies.

Usage:  python3 _src/make_spronia_sheet.py [app/spronia/art/pose/base.png]
"""

import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "app" / "spronia" / "art"

# The background the converter reads as paper. Strong green, nowhere near any colour a dodo or a
# rider wears, so the silhouette can be cut without a threshold that needs tuning.
FONDO = (0, 255, 0)

# How many screen pixels one drawn pixel becomes on the sheet. An integer, so painting a cell is a
# block copy rather than a resize: the sheet can be reduced back to the same numbers it came from.
BLOCCO = 12

# The gap between frames, in drawn pixels. Wide enough that the lance of one frame cannot touch the
# next — it spans the whole width of its own box — and that `_columns` in the converter finds the
# split without a threshold.
STACCO = 4

BANDE = ("walk", "fly")

# Aria attorno alla posa a riposo mentre si lavora: le ali aperte escono dal riquadro del dodo
# fermo da tutti e quattro i lati. Si ritaglia alla fine, sull'unione delle otto pose.
MARGINE = 8
PER_BANDA = 4


# -----------------------------------------------------------------------------------------------------------------
#  p r i v a t e
# -----------------------------------------------------------------------------------------------------------------

def _cell(a):
    """The size of the drawing's own pixel, measured from the spacing between colour changes.

    Same reasoning as `_grid` in the converter, and deliberately a separate, shorter copy: here the
    image has a hard alpha channel and no compression, so the edges are exact and there is nothing
    to be robust against. What is not simpler is the arithmetic — a cell of 11.67 shows up as gaps
    of 11 and 12 in alternation, so rounding either one gives the wrong answer.
    """
    h, w, _ = a.shape
    gaps = []
    for y in range(0, h, 3):
        d = np.abs(np.diff(a[y], axis=0)).sum(1)
        gaps += np.diff(np.where(d > 20)[0]).tolist()
    for x in range(0, w, 3):
        d = np.abs(np.diff(a[:, x], axis=0)).sum(1)
        gaps += np.diff(np.where(d > 20)[0]).tolist()
    gaps = np.array([g for g in gaps if 1 <= g <= 40])
    if len(gaps) < 40:
        raise SystemExit("non trovo abbastanza bordi: il PNG non è pixel art su una griglia")

    best = None
    for cell in np.arange(2.0, 24.0, 0.005):
        k = gaps / cell
        fit = np.abs(k - np.round(k))
        hits = fit < 0.10
        score = hits.mean()
        err = fit[hits].mean() if hits.any() else 1.0
        if best is None or score > best[0] + 1e-9 \
                or (abs(score - best[0]) < 1e-9 and err < best[1] - 1e-4) \
                or (abs(score - best[0]) < 1e-9 and abs(err - best[1]) < 1e-4 and cell > best[2]):
            best = (score, err, cell)
    cell = best[2]

    d = np.abs(np.diff(a[h // 2], axis=0)).sum(1)
    bordi = np.where(d > 20)[0]
    off = max(np.arange(0, cell, 0.05),
              key=lambda o: (np.abs((bordi - o) / cell - np.round((bordi - o) / cell)) < 0.12).mean())
    return cell, float(off), best[0]


def _reduce(a, cell, off):
    """One value per cell, taken as the median, plus how many source pixels disagreed with it.

    The count is the whole point of returning it: on a drawing that really is on this grid it is
    zero, and zero is what says the sheet below carries the artwork rather than an interpretation
    of it. Anything else and the grid was measured wrong, which is worth stopping for.
    """
    h, w, _ = a.shape
    rows, cols = int((h - off) / cell), int((w - off) / cell)
    art = np.zeros((rows, cols, 4), dtype=int)
    # A quarter of the cell in from each side. Not caution: when the cell is 11.67 the boundaries
    # fall between whole pixels, so the pixel straddling one belongs to both neighbours and matches
    # neither. Reading only the middle is what makes the disagreement count mean something —
    # measured, it is the difference between 1651 stray pixels and none at all.
    inset = max(2, round(cell * 0.28))
    discordi = 0
    for gy in range(rows):
        for gx in range(cols):
            y0, x0 = int(off + gy * cell), int(off + gx * cell)
            blk = a[y0 + inset:y0 + int(cell) - inset, x0 + inset:x0 + int(cell) - inset]
            if not blk.size:
                continue
            piatto = blk.reshape(-1, 4)
            art[gy, gx] = np.median(piatto, axis=0)
            discordi += int((np.abs(piatto - art[gy, gx]).sum(1) > 0).sum())
    return art, discordi


def _crop(art):
    """The character alone, cut to what it actually paints."""
    solido = art[:, :, 3] > 128
    ys, xs = np.nonzero(solido)
    if not len(ys):
        raise SystemExit("il PNG è vuoto: nessun pixel opaco")
    return art[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


# -----------------------------------------------------------------------------------------------------------------
#  l a   c a m m i n a t a
# -----------------------------------------------------------------------------------------------------------------

# Il ciclo di ripiego, in pixel di sprite: di quanto si sposta la zampa in primo piano, per
# fotogramma. Serve **solo se le pose disegnate non ci sono**; quando ci sono, le zampe vengono da
# quelle e questa tabella non viene usata.
#
# Non è un'animazione inventata: è un passo. La zampa appoggiata scorre all'indietro mentre il corpo
# le passa sopra, poi si stacca, si alza e torna avanti in volata. Le ampiezze sono piccole apposta:
# cinque pixel di escursione su una zampa di sette. Di più e il dodo fa la spaccata; di meno, a
# schermo, non si vede muovere niente.
#
# Si muove solo la zampa in primo piano. Quella dietro sono ventun pixel di bruno scuro mezzi
# nascosti dal ventre: mossi, non leggono come una zampa, leggono come sporco che si sposta.
PASSO = [
    (+3, 0),        # appoggio, avanti
    (+1, -2),       # si stacca e sale
    (-3, 0),        # appoggio, indietro: il corpo le è passato sopra
    (-1, -2),       # si stacca e torna avanti
]


def _legs_row(tela):
    """La riga delle caviglie su una tela con l'aria attorno: si misura sul disegno, non sulla tela.

    Il margine è fatto di righe vuote, e una riga vuota è la più stretta di tutte: misurata sulla
    tela, la strozzatura delle caviglie finisce nel margine e la zona delle zampe diventa il vuoto
    sotto i piedi. Si ritaglia prima, si misura, e si rimette l'offset.
    """
    solido = tela[:, :, 3] > 128
    ys, xs = np.nonzero(solido)
    stretto = tela[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return _legs(stretto)[0] + int(ys.min())


def _legs(posa):
    """Dove finisce il corpo e cominciano le zampe, e dove finisce una zampa e comincia l'altra.

    Misurato, non scritto: **le caviglie sono la cosa più stretta della parte bassa del disegno.**
    Sopra c'è il ventre, largo; sotto ci sono i piedi, che si riallargano. Fra i due c'è una strozzatura
    di tre righe, ed è lì che il corpo smette e le zampe cominciano — su questo dodo alla riga 44.
    Una soglia sulla larghezza non avrebbe funzionato, perché i piedi sono larghi quasi quanto il
    ventre; è il minimo locale a dire dove tagliare.

    Le due zampe si separano allo stesso modo. Quella in primo piano è disegnata piena, quella
    dietro è mezza nascosta dal corpo e più scura — è così che si dà la profondità — quindi nella
    zona delle zampe occupa **meno righe per colonna**. Il taglio cade dove finisce il blocco di
    colonne più fitte.
    """
    solido = posa[:, :, 3] > 128
    h, w = solido.shape
    larghezze = [int(solido[y].sum()) for y in range(h)]
    basso = range(2 * h // 3, h)
    stretta = min(larghezze[y] for y in basso)
    y0 = max(0, next(y for y in basso if larghezze[y] == stretta) - 1)

    colonne = [int(solido[y0:, x].sum()) for x in range(w)]
    fitto = max(colonne)
    ultima = max(x for x in range(w) if colonne[x] == fitto)
    return y0, ultima + 1


def _walk(posa, y0=None):
    """I quattro fotogrammi della camminata: cambiano **solo le zampe**.

    È la sola parte dell'animazione che si possa ricavare invece che disegnare, e la ragione è
    strutturale: una camminata è un pezzo rigido che si sposta, e quel pezzo sta già sul foglio.
    L'ala no — a riposo è ripiegata, e un battito la vuole aperta in quattro posizioni che nel
    disegno non ci sono. Provata a ruotare, si sbriciola; fatta scorrere, resta un'ala chiusa che
    scivola sul fianco. Quelle quattro ali vanno disegnate, e finché non ci sono la banda del volo
    tiene la posa ferma.

    Il corpo non si muove di un pixel, ed è la metà del perché la camminata si legge: se ballasse
    anche lui, l'occhio guarderebbe il rimbalzo invece del passo.
    """
    caviglie, taglio = _legs(posa)
    if y0 is None:
        y0 = caviglie
    h, w = posa.shape[:2]
    solido = posa[:, :, 3] > 128
    vicina = {(y, x): posa[y, x].copy() for y in range(y0, h) for x in range(taglio)
              if solido[y, x]}
    lontana = {(y, x): posa[y, x].copy() for y in range(y0, h) for x in range(taglio, w)
               if solido[y, x]}

    fotogrammi = []
    for dx, dy in PASSO:
        f = posa.copy()
        f[y0:] = 0
        # Prima quella dietro, poi quella davanti: dove si sovrappongono deve restare sopra la
        # zampa in primo piano, altrimenti la profondità si inverte a metà ciclo.
        for pezzo, (mx, my) in ((lontana, (0, 0)), (vicina, (dx, dy))):
            for (y, x), colore in pezzo.items():
                ny, nx = y + my, x + mx
                if y0 <= ny < h and 0 <= nx < w:
                    f[ny, nx] = colore
        fotogrammi.append(_outline(f, y0))
    return y0, taglio, fotogrammi


def _lance_row(solido):
    """La riga della lancia: la più piena del disegno, e l'unico riferimento che non si muove.

    Serve per rimettere in registro un fotogramma che è passato per un ridimensionamento. La lancia
    attraversa il riquadro da parte a parte ed è rigida per costruzione, quindi la sua riga e i suoi
    due estremi danno scala e origine in un colpo solo — dove il riquadro di ritaglio non li dà,
    perché cambia con le zampe.
    """
    y = int(solido.sum(axis=1).argmax())
    xs = np.nonzero(solido[y])[0]
    return y, int(xs.min()), int(xs.max())


def _stroke(frames, rif):
    """Mette i fotogrammi di volo in ordine di **battuta**, dall'alto dell'arco al basso.

    La banda del volo non è un anello: il renderer tiene fermo il primo fotogramma finché il dodo
    plana, e scorre gli altri tre nei 0,32 secondi del battito. Quindi l'ordine non è decorativo —
    è la battuta d'ala, e va dall'ala alzata a quella abbassata, con il ritorno che avviene tutto
    insieme quando il battito finisce. È anche come batte un uccello vero: la discesa è lenta e
    porta il peso, il recupero è uno scatto.

    Quanto è alta l'ala si misura su quello che il fotogramma disegna **fuori dalla sagoma a
    riposo**: a riposo l'ala è chiusa lungo il fianco, quindi tutto ciò che sborda è ala aperta, e
    la riga media di quei pixel dice a che punto dell'arco siamo.

    Sulle quattro pose consegnate: 18,4 — 21,8 — 36,0 — 36,7. Arrivavano nell'ordine 18,4, 36,0,
    36,7, 21,8, cioè alzata, giù, giù, mezz'aria: due fotogrammi quasi uguali proprio in mezzo alla
    battuta, dove si guarda, e il passaggio intermedio speso alla fine dove non serve più.
    """
    fuori = rif[:, :, 3] <= 128
    quote = []
    for f in frames:
        ys = np.nonzero((f[:, :, 3] > 128) & fuori)[0]
        quote.append(float(ys.mean()) if len(ys) else 0.0)
    ordine = sorted(range(len(frames)), key=lambda i: quote[i])
    return [frames[i] for i in ordine], [quote[i] for i in ordine], ordine


def _unwatermark(frames, rif, y0, soglia=60):
    """Toglie il marchio dell'editor dai fotogrammi, ricopiandoci sopra il disegno originale.

    Il marchio è impresso **nello stesso posto in tutti i fotogrammi**, e questa è la sua rovina: una
    cella che non cambia in nessuno dei quattro non sta animando niente, quindi se diverge di molto
    dal PNG originale — che il marchio non ce l'ha — la differenza è il marchio e non il disegno.
    Reso come maschera, il risultato sono lettere leggibili in mezzo al ventre: è così che si è
    verificato che la regola prendesse la cosa giusta.

    Sopra le zampe soltanto. Sotto, la differenza dal disegno a riposo è vera — sono le zampe in
    un'altra posa — e ricopiarci sopra l'originale cancellerebbe l'animazione invece del marchio.
    """
    solido = rif[:, :, 3] > 128
    fermo = np.all([np.all(f == frames[0], axis=2) for f in frames], axis=0)
    scarto = np.sqrt(((frames[0][:, :, :3].astype(float) - rif[:, :, :3]) ** 2).sum(2))
    marchio = fermo & solido & (frames[0][:, :, 3] > 128) & (scarto > soglia)
    marchio[y0:] = False
    for f in frames:
        f[marchio] = rif[marchio]
    return int(marchio.sum())


def _relance(frames, rif):
    """Rimette in ogni fotogramma la lancia del disegno originale.

    La lancia è un oggetto rigido: è la stessa in tutte e otto le pose, e il gioco ci legge sopra la
    regola che decide chi vince. Ma i fotogrammi di volo sono passati per un ridimensionamento, e
    agganciando le loro celle alla tavolozza il ferro è finito su **#a8cfe6 invece che #b0d3e7** —
    due azzurri pallidi a otto unità di distanza. Sul foglio non si distinguono; in partita la lancia
    cambiava tinta nel momento in cui il dodo spiccava il volo.

    Si ricopia solo dove il fotogramma ha già inchiostro: se un'ala passasse davanti all'asta, il
    disegno dell'ala resterebbe suo. Su queste quattro pose non succede — la corsa è lunga
    cinquantanove celle in tutte e quattro, cioè la lancia è sempre scoperta — ma la regola scritta
    così regge anche la posa in cui succederà.
    """
    solido = rif[:, :, 3] > 128
    riga, x0, x1 = _lance_row(solido)
    rimessi = 0
    for f in frames:
        for x in range(x0, x1 + 1):
            if f[riga, x, 3] > 128 and not np.array_equal(f[riga, x], rif[riga, x]):
                f[riga, x] = rif[riga, x]
                rimessi += 1
    return rimessi


def _regrid(a, base, tavolozza):
    """Un fotogramma esportato male, riportato sulla griglia e sui colori del disegno originale.

    Serve perché i fotogrammi della camminata sono arrivati da un editor che li ha **riscalati di un
    fattore diverso ciascuno** — 8,285 pixel per cella in due, 8,148 e 8,108 negli altri — con i
    bordi sfumati e un watermark sopra. Misurato: canale alfa a 256 valori invece di 2, trentamila
    colori invece di cinquantatré.

    Niente di tutto ciò è irrecuperabile, perché il disegno vero **è ancora là sotto**: si prende la
    mediana di ogni cella e la si aggancia alla tavolozza del PNG originale, che è nota ed esatta.
    Quello che non si recupera è il registro: due fotogrammi su quattro restano sfasati di circa un
    pixel sul corpo, ed è per questo che di questi si tiene solo la parte che deve cambiare.

    L'allineamento parte dalla lancia e poi si affina cercando lo scarto che fa combaciare meglio il
    **corpo** con l'originale. Il corpo è ciò che in una camminata non cambia, quindi è il posto
    giusto dove misurare se due griglie coincidono.
    """
    h, w = base.shape[:2]
    solido_base = base[:, :, 3] > 128
    riga, sx, dx_ = _lance_row(solido_base)
    rif = base[:, :, :3].astype(float)

    op = a[:, :, 3] > 128
    y, x0, x1 = _lance_row(op)
    # La scala si ricava dalla **lancia**, non dalla larghezza della tela: la tela ha l'aria attorno
    # per le ali, la lancia no. Dividere per la larghezza della tela dava un passo più corto del
    # 27%, cioè un fotogramma campionato tutto sbagliato — e siccome ogni cella restava comunque
    # dentro la tavolozza, l'unico segnale era uno scarto di colore di 165 invece di 20.
    passo0 = (x1 - x0 + 1) / (dx_ - sx + 1)

    def campiona(ox, oy, passo):
        out = np.zeros((h, w, 4), dtype=int)
        for gy in range(h):
            for gx in range(w):
                cy, cx = oy + gy * passo, ox + gx * passo
                y0, x0 = int(round(cy)) + 2, int(round(cx)) + 2
                y1, x1 = int(round(cy + passo)) - 2, int(round(cx + passo)) - 2
                # Fuori dall'immagine si sta zitti. Senza questa riga gli indici negativi vengono
                # letti dal fondo dell'array — numpy non protesta — e il fotogramma esce con pezzi
                # del bordo opposto incollati sopra: uno scarto di colore di 165 invece di 20, e
                # nessun messaggio che dica perché.
                if y0 < 0 or x0 < 0 or y1 > a.shape[0] or x1 > a.shape[1]:
                    continue
                blk = a[y0:y1, x0:x1]
                if not blk.size:
                    continue
                m = blk[:, :, 3] > 128
                if m.sum() <= m.size / 2:
                    continue
                med = np.median(blk[:, :, :3][m], axis=0)
                k = int(np.sqrt(((tavolozza - med) ** 2).sum(1)).argmin())
                out[gy, gx] = np.append(tavolozza[k], 255)
        return out

    corpo = slice(0, _legs_row(base))
    migliore = None
    for passo in (passo0 * 0.995, passo0, passo0 * 1.005):
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                g = campiona(x0 - sx * passo + dx, y - riga * passo + dy, passo)
                sg = g[:, :, 3] > 128
                m = solido_base[corpo] & sg[corpo]
                if m.sum() < 300:
                    continue
                colore = np.sqrt(((g[corpo, :, :3] - rif[corpo]) ** 2).sum(2))[m].mean()
                sagoma = float((solido_base[corpo] ^ sg[corpo]).sum())
                punteggio = colore + sagoma * 0.5
                if migliore is None or punteggio < migliore[0]:
                    migliore = (punteggio, colore, sagoma, g)
    return migliore[3], migliore[1], migliore[2]


def _outline(f, y0):
    """Rifà il contorno nero attorno alla zampa spostata.

    Senza, il piede resta con il bordo di dove stava prima: nero sul lato da cui è partito e
    l'arancione nudo su quello verso cui è andato. Su un disegno in cui **tutto** ha un contorno di
    un pixel, un pezzo senza è la cosa che si nota per prima.

    Il nero si prende dal disegno invece di scriverlo qui: è il colore più scuro che il foglio usa,
    e se l'autore un giorno contornasse in bruno molto scuro invece che in nero, il contorno rifatto
    resterebbe il suo.
    """
    visti = f[:, :, 3] > 128
    h, w = visti.shape
    tinte = f[visti][:, :3]
    inchiostro = tinte[tinte.sum(axis=1).argmin()]
    scuro = int(inchiostro.sum()) + 30

    nuovi = []
    for y in range(y0, h):
        for x in range(w):
            if visti[y, x]:
                continue
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if (0 <= ny < h and 0 <= nx < w and visti[ny, nx]
                        and int(f[ny, nx, :3].sum()) > scuro):
                    nuovi.append((y, x))
                    break
    for y, x in nuovi:
        f[y, x] = np.append(inchiostro, 255)
    return f


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def main():
    sorgente = Path(sys.argv[1]) if len(sys.argv) > 1 else ART / "pose" / "base.png"
    a = np.asarray(Image.open(sorgente).convert("RGBA")).astype(int)
    cell, off, bonta = _cell(a)
    print(f"  {sorgente.name}: griglia {cell:.3f} px, origine {off:.2f}, bontà {bonta:.3f}")

    art, discordi = _reduce(a, cell, off)
    if discordi:
        raise SystemExit(f"il disegno non sta sulla griglia: {discordi} pixel discordano "
                         "dalla mediana della loro cella")
    print("  fedeltà: nessun pixel sorgente discorda dalla propria cella")

    posa = _crop(art)
    h, w, _ = posa.shape
    solido = posa[:, :, 3] > 128
    colori = np.unique(posa[solido][:, :3], axis=0)
    print(f"  posa: {w} x {h} pixel d'arte, {int(solido.sum())} dipinti, {len(colori)} colori esatti")

    riga = max(range(h), key=lambda y: solido[y].sum())
    xs = np.nonzero(solido[riga])[0]
    print(f"  la lancia: riga {riga}, da x={xs.min()} a x={xs.max()}")
    print(f"  rispetto al centro del riquadro: dy={riga - h // 2:+d}, dx={xs.max() - w // 2:+d} "
          "pixel d'arte — è quello che game.js deve dire in lanceRise e lanceReach")

    # **Tutti i fotogrammi su una tela sola, più larga della posa a riposo.** Le ali aperte escono
    # dal riquadro del dodo fermo — in alto, di lato e in basso — quindi si lavora con un margine
    # attorno e alla fine si ritaglia sull'unione di tutte e otto le pose. Ritagliare fotogramma per
    # fotogramma sarebbe l'errore: ognuno finirebbe in un riquadro diverso, e il personaggio
    # salterebbe sotto il giocatore a ogni battito d'ala.
    tela = np.zeros((h + 2 * MARGINE, w + 2 * MARGINE, 4), dtype=int)
    tela[MARGINE:MARGINE + h, MARGINE:MARGINE + w] = posa
    tavolozza = np.unique(posa[solido][:, :3], axis=0)

    y0, taglio, camminata = _walk(tela, _legs_row(tela))
    print(f"  zampe: dalla riga {y0 - MARGINE} in giù, taglio fra le due alla colonna {taglio - MARGINE}")

    # **Se ci sono le pose disegnate, si prendono le zampe da lì e il corpo resta quello originale.**
    #
    # Solo le zampe, e non è pigrizia: i quattro fotogrammi della camminata sono arrivati riscalati
    # ciascuno di un fattore diverso — 8,285 pixel per cella in due, 8,148 e 8,108 negli altri —
    # quindi sopra le zampe **non combaciano fra loro**: due su quattro restano sfasati di circa un
    # pixel sul contorno del corpo, della lancia e del pennacchio. Montati interi, a schermo il
    # personaggio ribollirebbe.
    #
    # Il corpo dell'originale è esatto, non ha il marchio dell'editor e per definizione è identico
    # in tutti e quattro. Innestandoci sopra le sole zampe si ottiene quello che una camminata deve
    # essere — corpo fermo, zampe che si muovono — e le zampe restano di chi le ha disegnate.
    pose = (ART / "pose")
    disegnate = sorted(pose.glob("cammina-*.png")) if pose.is_dir() else []
    if len(disegnate) == PER_BANDA:
        camminata = []
        for p in disegnate:
            b = np.asarray(Image.open(p).convert("RGBA")).astype(int)
            g, colore, sagoma = _regrid(b, tela, tavolozza)
            f = tela.copy()
            f[y0:] = g[y0:]
            camminata.append(_outline(f, y0))
            print(f"  {p.name}: registro sul corpo — scarto di colore {colore:.1f}, "
                  f"{int(sagoma)} celle di sagoma; innestate {int((g[y0:, :, 3] > 0).sum())} px di zampe")
        print("  camminata: 4 fotogrammi dalle pose disegnate, corpo dall'originale")
    else:
        print("  camminata: 4 fotogrammi ricavati muovendo le zampe "
              "(nessuna posa cammina-*.png in art/pose/)")

    # **Il volo si prende intero, e la differenza col passo è misurata.** I quattro fotogrammi di
    # volo sono arrivati tutti alla stessa scala — 9,068 pixel per cella, la lancia alla stessa riga
    # e agli stessi due estremi in tutti e quattro — e dove le sagome si sovrappongono il colore
    # coincide **esattamente**: mediana zero. Quindi qui non c'è nessun registro da rimettere a
    # posto, e innestare solo le ali sarebbe peggio: l'ala passa davanti e dietro al corpo, e
    # ritagliarla vorrebbe dire decidere pixel per pixel cosa le sta sopra.
    volanti = sorted(pose.glob("vola-*.png")) if pose.is_dir() else []
    if len(volanti) == PER_BANDA:
        volo = []
        for p in volanti:
            b = np.asarray(Image.open(p).convert("RGBA")).astype(int)
            g, colore, sagoma = _regrid(b, tela, tavolozza)
            volo.append(g)
            print(f"  {p.name}: registro sul corpo — scarto di colore {colore:.1f}, "
                  f"{int(sagoma)} celle di sagoma")
        volo, quote, ordine = _stroke(volo, tela)
        print(f"  volo: battuta ordinata dall'alto dell'arco al basso — riga media dell'ala "
              + ", ".join(f"{q:.1f}" for q in quote)
              + f" (i file arrivavano nell'ordine {ordine})")
        tolte = _unwatermark(volo, tela, y0)
        rimessi = _relance(volo, tela)
        print(f"  volo: 4 fotogrammi disegnati; {tolte} celle di marchio ricoperte con l'originale, "
              f"{rimessi} celle di lancia rimesse alla tinta del disegno")
    else:
        volo = [tela.copy() for _ in range(PER_BANDA)]
        print("  volo: 4 copie della posa (nessuna posa vola-*.png in art/pose/)")

    pose_per_banda = {"walk": camminata, "fly": volo}

    # Il riquadro comune: l'unione di tutte e otto, con una colonna e una riga di aria attorno.
    tutte = camminata + volo
    m = np.any([f[:, :, 3] > 128 for f in tutte], axis=0)
    ys, xs = np.nonzero(m)
    ry0, ry1 = max(0, ys.min() - 1), min(m.shape[0], ys.max() + 2)
    rx0, rx1 = max(0, xs.min() - 1), min(m.shape[1], xs.max() + 2)
    tutte = [f[ry0:ry1, rx0:rx1] for f in tutte]
    camminata, volo = tutte[:PER_BANDA], tutte[PER_BANDA:]
    pose_per_banda = {"walk": camminata, "fly": volo}
    h, w = tutte[0].shape[:2]
    riquadro = tutte[0][:, :, 3] > 128
    riga = max(range(h), key=lambda y: (volo[1][:, :, 3] > 128)[y].sum())
    xs2 = np.nonzero((volo[1][:, :, 3] > 128)[riga])[0]
    print(f"  riquadro comune: {w} x {h} pixel d'arte")
    print(f"  la lancia: riga {riga}, punta a x={xs2.max()}")
    print(f"  rispetto al centro: dy={riga - h // 2:+d}, dx={xs2.max() - w // 2:+d} → "
          f"game.js deve dire lanceRise: {-(h // 2 - riga) * 2}, lanceReach: {(xs2.max() - w // 2) * 2}, "
          f"SPRITE {{ w: {w * 2}, h: {h * 2} }}")

    passo_x, passo_y = w + STACCO, h + STACCO
    foglio = np.zeros(((passo_y * len(BANDE) + STACCO) * BLOCCO,
                       (passo_x * PER_BANDA + STACCO) * BLOCCO, 3), dtype=np.uint8)
    foglio[:, :] = FONDO
    for banda, nome in enumerate(BANDE):
        for i in range(PER_BANDA):
            quadro = pose_per_banda[nome][i]
            visto = quadro[:, :, 3] > 128
            ox = (STACCO + i * passo_x) * BLOCCO
            oy = (STACCO + banda * passo_y) * BLOCCO
            for y in range(h):
                for x in range(w):
                    if not visto[y, x]:
                        continue
                    foglio[oy + y * BLOCCO:oy + (y + 1) * BLOCCO,
                           ox + x * BLOCCO:ox + (x + 1) * BLOCCO] = quadro[y, x, :3]

    fuori = ART / "cavaliere-azzurro.png"
    Image.fromarray(foglio, "RGB").save(fuori)
    print(f"  scritto {fuori.relative_to(ROOT)}  {foglio.shape[1]} x {foglio.shape[0]} px, "
          f"{len(BANDE)} bande x {PER_BANDA} fotogrammi, blocco {BLOCCO} px")


if __name__ == "__main__":
    main()
