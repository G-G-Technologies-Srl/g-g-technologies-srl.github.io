// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La card del punteggio, disegnata qui e salvata sul disco di chi gioca.
//
// È la parte della condivisione che questo progetto può fare e quasi nessun gioco fa: **l'immagine
// non passa da nessun server.** Il modo normale sarebbe generarla da qualche parte e servirla a un
// URL, che vuol dire un server che la ospita, un indirizzo che scade e un pezzo di dati di chi
// gioca che esce dalla sua macchina. Qui la disegna il browser su una canvas, e il file nasce e
// resta dove è nato.
//
// Ne segue una cosa che vale la pena dire in chiaro: la card **non è una prova**. Il punteggio non
// è verificato da nessuno — chiunque può disegnarsene una — e in sala giochi non lo era nemmeno.
// Serve a raccontare una partita, non a certificarla, e i testi non promettono altro.
//
// Il disegno è quello delle card social del sito: fondo `--bg`, riquadro `--panel-2` con il filo di
// 2px in accento, il nome in serif e i numeri in tabellare. Non è una scelta estetica: una card che
// gira su LinkedIn accanto a quelle degli articoli deve venire dallo stesso posto, o si vede.

import { FIELD, ROCK } from "./game.js";

// 1200 × 630 è la misura che LinkedIn, X e le anteprime dei messaggi ritagliano meglio. Più grande
// non serve a nessuno e pesa di più da salvare su un telefono.
const W = 1200;
const H = 630;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * I colori della card, letti dal foglio di stile come fa il renderer.
 *
 * Con una differenza che conta: la card **non segue il tema**. Un'immagine salvata esce dall'app e
 * finisce in un feed che ha il suo fondo, quindi si disegna sempre scura, come le card social del
 * sito — che sono scure anche quando l'articolo lo leggi in chiaro.
 */
const IMPASTO = {
  bg: "#0d1220",
  panel: "#172136",
  panel2: "#1e2a43",
  text: "#eef1f8",
  muted: "#aab3c9",
  faint: "#8f98ad",
  accent: "#34d399",
  accentSoft: "#6ee7b7",
};

function _riquadro(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Il marchio, disegnato e non caricato.
 *
 * Un `<img>` verso il logo del sito sarebbe una richiesta di rete, e l'app promette di non farne:
 * `check_apps.py` la boccerebbe, giustamente. Il simbolo è un cerchio aperto con un punto — le
 * stesse due forme del logo — ridotto a quello che si legge a questa misura.
 */
function _marchio(ctx, x, y, r) {
  ctx.strokeStyle = IMPASTO.accent;
  ctx.lineWidth = r * 0.22;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI * 0.28, Math.PI * 1.92);
  ctx.stroke();
  ctx.fillStyle = IMPASTO.text;
  ctx.beginPath();
  ctx.arc(x + r * 0.10, y, r * 0.30, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Le rocce di sfondo, dalla partita vera.
 *
 * Non un disegno inventato: sono le rocce che erano in campo quando la partita è finita, con la
 * loro forma e la loro posizione. Costa niente — la geometria è già nel mondo — e rende ogni card
 * diversa, che è metà del motivo per cui una si condivide.
 */
function _sfondo(ctx, world) {
  if (!world || !world.rocks) return;
  const scala = Math.max(W / FIELD.w, H / FIELD.h);
  ctx.save();
  ctx.translate((W - FIELD.w * scala) / 2, (H - FIELD.h * scala) / 2);
  ctx.scale(scala, scala);
  ctx.strokeStyle = "#28364f";
  ctx.lineWidth = 2.4 / scala * 2;
  for (const rock of world.rocks) {
    const raggio = ROCK[rock.size].radius;
    const punti = rock.outline && rock.outline.length ? rock.outline : new Array(12).fill(1);
    ctx.save();
    ctx.translate(rock.x, rock.y);
    ctx.rotate(rock.angle || 0);
    ctx.beginPath();
    punti.forEach((k, i) => {
      const a = (i / punti.length) * Math.PI * 2;
      const px = Math.cos(a) * raggio * k;
      const py = Math.sin(a) * raggio * k;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Disegna la card e restituisce la canvas.
 *
 * `testi` arriva già tradotto da chi chiama: questo modulo non conosce nessuna lingua, come tutto
 * il resto che non è `i18n.js`.
 */
export function draw(world, { nome, punteggio, ondata, testi }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = IMPASTO.bg;
  ctx.fillRect(0, 0, W, H);
  _sfondo(ctx, world);

  // Il riquadro, con il filo di 2px in alto: è la «ricetta» del sito per un blocco in evidenza.
  const bx = 64;
  const by = 166;
  const bw = W - 128;
  const bh = 380;
  const grad = ctx.createLinearGradient(bx, by, bx + bw * 0.3, by + bh);
  grad.addColorStop(0, IMPASTO.panel2);
  grad.addColorStop(0.6, IMPASTO.panel);
  ctx.fillStyle = grad;
  _riquadro(ctx, bx, by, bw, bh, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const filo = ctx.createLinearGradient(bx + bw * 0.12, 0, bx + bw * 0.88, 0);
  filo.addColorStop(0, IMPASTO.accent);
  filo.addColorStop(1, IMPASTO.accentSoft);
  ctx.fillStyle = filo;
  _riquadro(ctx, bx + bw * 0.12, by - 1, bw * 0.76, 3, 2);
  ctx.fill();

  // Intestazione: marchio e nome dell'azienda, come sulle card del sito.
  _marchio(ctx, 92, 74, 26);
  ctx.fillStyle = IMPASTO.text;
  ctx.font = "500 27px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("G&G Technologies", 134, 76);

  ctx.fillStyle = IMPASTO.accentSoft;
  ctx.font = "500 19px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(testi.kicker.toUpperCase(), 64, 126);

  // Il numero, che è il motivo per cui la card esiste.
  ctx.fillStyle = IMPASTO.text;
  ctx.font = "500 116px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText(punteggio, bx + 46, by + 116);

  ctx.fillStyle = IMPASTO.muted;
  ctx.font = "400 30px ui-serif, Georgia, 'Times New Roman', serif";
  ctx.fillText(testi.riga, bx + 46, by + 206);

  // Il nome, se c'è. Tagliato dal chiamante, e disegnato con `fillText`, che non interpreta niente.
  if (nome) {
    ctx.fillStyle = IMPASTO.accentSoft;
    ctx.font = "500 34px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(nome, bx + 46, by + 274);
  }

  ctx.fillStyle = IMPASTO.faint;
  ctx.font = "400 22px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(testi.ondata.replace("{n}", ondata), bx + 46, by + 330);

  // Piede: il nome del gioco e l'indirizzo dove si trova. È la riga che fa da richiamo, e va
  // scritta nell'immagine perché un'immagine salvata perde il link che la accompagnava.
  ctx.fillStyle = IMPASTO.muted;
  ctx.font = "400 26px ui-serif, Georgia, 'Times New Roman', serif";
  ctx.fillText("AstroDroid", 64, H - 52);
  ctx.fillStyle = IMPASTO.faint;
  ctx.font = "400 22px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const dove = "ggtechnologies.sm/app/astrodroid";
  ctx.fillText(dove, W - 64 - ctx.measureText(dove).width, H - 52);

  return canvas;
}

/**
 * Salva la card come PNG.
 *
 * `toBlob` e non `toDataURL`: un data URL di mezzo megabyte passa per una stringa in memoria e su
 * un telefono si sente. Restituisce il nome dato al file, che chi chiama mostra a schermo — senza,
 * su desktop il download è silenzioso e sembra che il pulsante non abbia fatto niente.
 */
export function save(canvas, nomeFile) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nomeFile;
      link.click();
      // Revocato al giro successivo: revocarlo subito annulla il download su Safari.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      resolve(nomeFile);
    }, "image/png");
  });
}
