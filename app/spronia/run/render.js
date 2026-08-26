// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A world, drawn. No rules in here: this module reads a state and paints it, and could be replaced
// without the game noticing.
//
// It paints into a **640 x 360 buffer** and blows it up with smoothing off. That is the whole of the
// pixel look, and it is worth saying why it is done this way rather than by drawing chunky shapes at
// full resolution: at full resolution a body at a fractional coordinate gets a soft edge, and one
// soft edge among hard ones reads as a defect. Painting small and scaling up makes every edge land
// on a pixel boundary because there is nowhere else for it to land.
//
// L'ingrandimento **non è a numeri interi**, e la ragione sta in `_frame`: a scala intera il campo
// dimezzava di colpo quando la finestra attraversava una soglia, e nel frattempo ne usava meno di
// metà. La frazione vive solo nell'ultimo passaggio a schermo; tutto quello che c'è qui sotto
// disegna ancora su una griglia di numeri interi.
//
// Three things it has to get right.
//
//  - **The field keeps its own measurements.** 1280 x 720 units, which is exactly two units per
//    pixel. Stretching to fit the window would hand a wide monitor more room to fly in than a phone.
//  - **Only the horizontal repeats.** A body straddling the left edge appears on the right in the
//    same instant, and never above or below.
//  - **Nothing is painted over the artwork.** The lance is part of the drawing, and the rules are
//    held to it by a test rather than by a mark drawn on top of it.
//
// The palette is fixed, and that is a deliberate exception to the rule the rest of the catalogue
// follows. The field is a screen inside the app, and a screen has its own colours; the app around it
// — bar, panels, buttons — still follows the site's light and dark themes. What the fixed palette
// costs is a light theme with a dark rectangle in it, which is why the field carries a bezel: a
// framed screen reads as a screen, an unframed one reads as a hole in the page.

import {
  FIELD, CEILING, MELT, DECK, PIXEL, PILOT, SPRITE, PLATFORMS, KINDS, CELLA, SHIELD, HEAD,
  INTRUDER, CLAW, IMPACT, lanceTip, mouth,
} from "./game.js";
import {
  PILOT_SPRITES, PALETTE, TINTE, ALPHABET, EYE, EGG, EGG_SPRITE, EGG_PALETTES,
  measure, each, tint,
} from "./sprites.js";

// -----------------------------------------------------------------------------------------------------------------
//  t h e   c a b i n e t   p a l e t t e
// -----------------------------------------------------------------------------------------------------------------

// The field's colours. The characters do not appear here: their palette is recovered from the
// artwork and exported by `sprites.js`, which is the only place that knows what the dodo is made of.
//
// Two hues carry meaning and they are the only two: emerald says "this is yours, or it is safe",
// amber says "this ends the game". The rule the site applies to charts — colour is never the only
// carrier — still holds, because the metal is also at a fixed place and has a texture of its own.
const PAINT = {
  bg: "#0b0f1a",          // the field behind everything
  ink: "#b9c4d8",         // the fallback when a sprite index is out of range
  accent: "#34d399",      // the ring that says a body is still protected

  // A floating island, top to bottom. Cool, against a warm character and a hot floor — three
  // families that never get confused for one another at a glance.
  deckLip: "#34d399",     // the lit edge of the grass, and the brand accent doing double duty
  grassDeep: "#1c8f68",   // the body of the grass, and the bushes
  earth: "#4a3a2c",       // a seam of soil under the turf
  rockLit: "#3d5170",     // rock turned towards the light
  rock: "#2b3a52",        // rock
  rockDark: "#141d2e",    // where it turns away, and the ragged underside

  // The melt, as a ramp from the crust down to the hottest part of it. Six steps and not three,
  // because what makes molten metal read as molten is the *range* of temperature across it: a flat
  // orange rectangle is a floor painted orange, whatever hue it is painted.
  meltRim: "#2a0d06",     // the hard dark line at the surface
  meltCrust: "#8c2606",   // cooled crust, drifting on top
  melt: "#d4470c",        // the body of it
  meltGlow: "#ff7a12",    // hotter, deeper down and around a bubble
  meltHot: "#ffd24a",     // the crest, and the cap of a bubble about to burst
  meltFlash: "#fff0b8",   // the instant a bubble bursts, and nothing else

  // Smoke. Two steps over the background, dim on purpose: it rises into the airspace the player
  // flies through, and a haze that hides an enemy is worse than no haze at all.
  smokeNear: "#5b3a2a",
  smokeFar: "#2e211c",

  ceiling: "#2a3550",     // the roof line, and the underside of a ledge

  // La barra in alto. Chiara ma non bianca: sta in un campo scuro e deve leggersi senza diventare
  // la cosa più luminosa dello schermo, che è e resta la linea di metallo che ti uccide.
  hud: "#c3ccdd",
  hudDim: "#5f7392",

  // Lo zampillo dal collo, quando la testa salta. Due rossi che stanno **fuori** dalla famiglia
  // della colata: quella va sull'arancione, questi virano al viola. Su un campo dove il fuoco è
  // ovunque, un rosso caldo si sarebbe perso dentro le fiamme del corpo che lo perde.
  bloodBright: "#e33b52",
  blood: "#a11226",
  bloodDark: "#5c0a18",

  // **I lapilli del giocatore, azzurri.** Quando il metallo si prende il tuo cavaliere gli strappa
  // di dosso il suo colore, non il proprio: le fiamme restano quelle della colata — sono del
  // metallo e sono uguali per tutti — e cambiano solo gli schizzi.
  //
  // È lo stesso motivo per cui in cima allo schermo le vite sono la testa del cavaliere: in mezzo a
  // tre nemici che bruciano, quello che ti riguarda si riconosce senza leggere niente. E i tre
  // valori stanno nella famiglia di azzurri del disegno, non accanto: un azzurro qualunque sarebbe
  // stato un quarto colore su un campo che ne ha tre.
  sparkMine: "#eef6ff",
  sparkMineTail: "#4f9bd8",
  sparkMineSmoke: "#1e3f66",

  // The two marks at the lance tips. Yours is the brand accent, a foe's is the same slate the roof
  // is drawn in — present, readable, and not competing with the bird for attention.
  reach: "#34d399",
  reachFoe: "#c3ccdd",

  // L'Intruso. **Nessun colore della fauna**: le cavalcature sono terre e ocra, questo è metallo
  // freddo con una bocca accesa. Si riconosce prima di essere guardato, ed è quello che deve fare —
  // arriva quando stai perdendo tempo, e la prima cosa da capire non è che cos'è ma che c'è.
  hull: "#38455c",
  hullLit: "#8496b5",
  hullDark: "#161d2b",
  intake: "#ffd24a",

  // Il cimiero che dà il nome alla classe di un nemico. Un colore solo per tutt'e tre — è la forma
  // che porta l'informazione. Preso dal capo pallido della tavolozza dell'uccello, così legge come
  // parte della creatura su un cielo scuro invece che come un'etichetta appiccicata sopra.
  //
  // C'era anche un pennacchio animato per il giocatore, bianco e azzurro, e non c'è più: il
  // cavaliere azzurro **ne porta uno dipinto sull'elmo**, e appendergliene un secondo sopra faceva
  // esattamente l'effetto che si immagina. La testa è del disegno; al gioco resta il cimiero, che
  // sta davanti, sulla calotta.
  crest: "#c3b39a",
};

const BUF = { w: FIELD.w / PIXEL, h: FIELD.h / PIXEL };   // 640 x 360

// -----------------------------------------------------------------------------------------------------------------
//  t h e   m e l t
// -----------------------------------------------------------------------------------------------------------------

// Where a bubble can come up. Fixed positions, fixed periods, fixed phases — the whole surface is a
// function of `world.time` and this table, and of nothing else.
//
// It has to be. `Math.random()` here would make the attract-mode demonstration different on every
// run and the app card's screenshot different at every build, which is the same argument that keeps
// the seed on the world in `game.js`. A vent list is the cheapest way to get disorder that repeats.
const VENTS = 15;

/** Thirty-two bits of hash. Used only for laying the vents out, never per frame. */
function _hash(n) {
  let h = (n ^ 61) ^ (n >>> 16);
  h = Math.imul(h, 9);
  h ^= h >>> 4;
  h = Math.imul(h, 0x27d4eb2d);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const VENT = Array.from({ length: VENTS }, (_, i) => ({
  x: Math.round(_hash(i * 7 + 1) * BUF.w),
  period: 2.4 + _hash(i * 13 + 5) * 3.2,
  phase: _hash(i * 29 + 11) * 6,
  size: 2 + Math.floor(_hash(i * 31 + 3) * 3),
}));

/**
 * Smooth noise: a value that wanders between -1 and 1 as `i` moves, with lumps about `span` wide.
 *
 * Interpolated between hashed points rather than hashed per pixel, and that is the whole difference
 * between rock and a comb. Hashing every column gives neighbours that disagree completely, which is
 * what the first hanging rock did: a row of stalactites, one pixel apart, reading as teeth. Rock is
 * lumpy at a scale much larger than a pixel.
 */
function _lump(seed, i, span) {
  const at = i / span;
  const cell = Math.floor(at);
  const frac = at - cell;
  const a = _hash(seed + cell * 131) * 2 - 1;
  const b = _hash(seed + (cell + 1) * 131) * 2 - 1;
  const ease = frac * frac * (3 - 2 * frac);          // smoothstep, so the joins do not show
  return a + (b - a) * ease;
}

/**
 * How far the surface has risen or fallen at this column, in whole pixels.
 *
 * Three waves whose periods share no common factor, so the surface never repeats itself inside a
 * screen — long ones, because a short wave reads as noise and a long one reads as something heavy
 * moving underneath.
 *
 * Kept to ±3 pixels, and that bound is not cosmetic: the rule that kills you is a flat line at MELT,
 * so every pixel of wave is a pixel of disagreement between what the game checks and what the player
 * sees. Three pixels is six world units against a body fifty-six tall — a ninth of it, which is
 * about the thickness of the dark rim and below what anyone can catch. Any more and the metal starts
 * eating people who look clear of it, or sparing people standing in it.
 */
function _swell(x, time) {
  const a = Math.sin(x * 0.031 + time * 0.9);
  const b = Math.sin(x * 0.013 - time * 0.55);
  const c = Math.sin(x * 0.077 + time * 1.6);
  return Math.round(a * 1.4 + b * 1.1 + c * 0.55);
}

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let buffer = null;
let bctx = null;
let calm = false;
let _now = 0;                             // the world's clock, for anything that has to wave

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _buffer() {
  if (!buffer) {
    buffer = document.createElement("canvas");
    buffer.width = BUF.w;
    buffer.height = BUF.h;
    bctx = buffer.getContext("2d");
  }
  return bctx;
}

/** World units to buffer pixels. Everything the rules hand over passes through here. */
const px = (units) => Math.round(units / PIXEL);

/**
 * Dove sta il campo dentro il canvas, e quanto è grande.
 *
 * **La scala non è più intera**, ed è una scelta pagata dopo averla guardata a schermo.
 *
 * Era `floor`, per la ragione giusta: a scala intera ogni pixel del campo diventa lo stesso numero
 * di pixel di schermo, e la griglia resta perfetta. Il prezzo però non era il bordo — era un
 * **gradino**. Misurato: con il canvas alto 720 il campo era largo 1280; a 719, un pixel meno, la
 * scala cadeva da 2 a 1 e il campo dimezzava a 640. Un pizzico sul trackpad o una barra del browser
 * che compare bastano ad attraversare la soglia mentre si gioca, e il campo si rimpicciolisce di
 * colpo sotto le mani. Nel frattempo, in una finestra da 1410, il campo ne usava 640: **il 45%**.
 *
 * A scala frazionaria il gradino sparisce e la finestra si riempie. Quello che si perde è che i
 * pixel non sono più tutti della stessa misura — a 1,86 alcuni vengono larghi due punti e altri tre
 * — e sui bordi lunghi si vede, se ci si ferma a guardarli ingranditi. Giocando no.
 *
 * Due dettagli che non sono dettagli:
 *
 *  - **Il campo si disegna comunque a numeri interi nel buffer.** La frazione vive solo qui,
 *    nell'ultimo passaggio a schermo, e nessun'altra parte del renderer la vede. Tornare indietro è
 *    rimettere un `Math.floor` su questa riga.
 *  - **La scala può scendere sotto 1**, e prima non poteva. Con `Math.max(1, …)` una finestra più
 *    stretta di 640 punti mostrava il campo tagliato ai lati — su un campo che si avvolge in
 *    orizzontale e in cui la regola è l'altezza, non vedere un pezzo è peggio che vederlo piccolo.
 */
function _frame(canvas) {
  const scale = Math.min(canvas.width / BUF.w, canvas.height / BUF.h);
  const w = Math.max(1, Math.round(BUF.w * scale));
  const h = Math.max(1, Math.round(BUF.h * scale));
  return {
    scale,
    w,
    h,
    x: Math.floor((canvas.width - w) / 2),
    y: Math.floor((canvas.height - h) / 2),
  };
}

/** Run `paint` once for every copy of a body the wrapping field makes visible. Horizontal only. */
function _wrapped(x, paint) {
  paint(x);
  if (x < BUF.w / 2) paint(x + BUF.w);
  else paint(x - BUF.w);
}

function _paintCeiling(ctx) {
  // A dashed rule, drawn pixel by pixel so the dashes land on the grid instead of wherever the
  // canvas dash pattern decides to put them.
  ctx.fillStyle = PAINT.ceiling;
  for (let x = 0; x < BUF.w; x += 8) ctx.fillRect(x, px(CEILING), 4, 1);
}

/**
 * The molten metal: a surface that swells, boils and smokes.
 *
 * It was a flat rectangle with a two-row pattern on it, and a flat rectangle is a floor painted
 * orange — the hue was right and it still did not read as metal, because what says "molten" is not
 * the colour but the **behaviour**: a surface that moves, gas coming out of it, and a range of
 * temperature across it.
 *
 * Four layers, drawn from the bottom up:
 *
 *   1. the body, hottest at depth
 *   2. crust — cooled patches drifting slowly, so the surface has a direction
 *   3. bubbles rising from fixed vents, capping, bursting
 *   4. the swelling surface line, its crest, and the smoke leaving it
 *
 * Everything is a function of `time` and the `VENT` table. Nothing here calls `Math.random`, so the
 * demonstration behind the title comes out the same on every run and the app card's screenshot is
 * the same at every build.
 */
function _paintMelt(ctx, time, calore = 0) {
  const top = px(MELT);
  const deep = BUF.h;
  const t = calm ? 0 : time;

  // ---- 1 · the body ------------------------------------------------------------------------------
  // Warm and *saturated*, against a character that is warm and muted. Hue cannot do the separating:
  // measured on the artwork, the dodo lives entirely between 10° and 38°, and the first metal was at
  // 31° — in the middle of it. A tan bird over an orange floor is camouflage. So the metal separates
  // by chroma, by value, and by the hard dark rim, which is the strongest edge there is.
  //
  // **Hot at the top, dark underneath**, which is the opposite of the physics and right for the
  // screen. Two reasons, both learned by looking: it puts the brightest thing in the picture exactly
  // on the line that kills you, which is where a player's eye should be; and it gives the rising
  // bubbles something dark to glow against. Drawn the other way round — bright depths — the bubbles
  // vanished into the floor and the whole band read as three flat stripes.
  //
  // The boundaries between the layers are ragged, per column. Straight ones read as a flag.
  // Painted **column by column, from the surface downwards**, and never from a fixed y. The first
  // version filled the body from a flat line and then drew a wavy surface over it, which left a
  // straight bar of metal above the crest of every trough — a hard horizontal edge in the middle of
  // something that is supposed to be liquid, and the one thing the eye picks out instantly.
  for (let x = 0; x < BUF.w; x += 1) {
    const y = top + _swell(x, t);
    const grain = Math.sin(x * 0.31) + Math.sin(x * 0.11 + 2.1);

    ctx.fillStyle = PAINT.meltCrust;
    ctx.fillRect(x, y, 1, deep - y);
    ctx.fillStyle = PAINT.melt;
    ctx.fillRect(x, y, 1, 15 + Math.round(grain * 2.5));
    ctx.fillStyle = PAINT.meltGlow;
    ctx.fillRect(x, y, 1, 6 + Math.round(grain * 1.5) + Math.round(calore * 12));
  }

  // ---- 2 · crust ---------------------------------------------------------------------------------
  // Slabs of cooled metal drifting right at two speeds. Two layers rather than one because a single
  // drifting texture reads as a scrolling background; two at different speeds read as a surface with
  // things floating on it.
  ctx.fillStyle = PAINT.meltCrust;
  for (const [speed, row, h, step] of [[7, 2, 3, 41], [3, 6, 2, 67]]) {
    const shift = Math.floor(t * speed);
    for (let i = 0; i * step < BUF.w + step; i += 1) {
      const w = 9 + ((i * 13) % 17);
      const x = ((i * step + shift) % (BUF.w + step)) - step;
      ctx.fillRect(x, top + row + _swell(x, t), w, h);
    }
  }

  // ---- 3 · bubbles -------------------------------------------------------------------------------
  // **La frenesia si vede qui, e in nessun altro posto.** Il campo pieno rende i nemici fino al
  // sessanta per cento più veloci, e finora niente lo diceva: il gioco diventava difficile e il
  // giocatore non poteva sapere perché, né imparare che svuotare il campo — o abbattere un Intruso
  // — lo raffredda. Una strategia che esiste e che nessuno può scoprire è una strategia che non
  // c'è.
  //
  // Lo dice la colata, che è il posto giusto: è la cosa che vi sta sotto, ed è già l'orologio
  // visivo del campo. Le bolle salgono più in fretta e lo strato caldo si alza — niente colori
  // nuovi, niente scritte, niente che copra il gioco.
  const fretta = 1 - Math.min(0.6, calore) * 0.55;

  for (const vent of VENT) {
    const cycle = ((t / fretta + vent.phase) % vent.period) / vent.period;
    const surface = top + _swell(vent.x, t);

    if (cycle < 0.72) {
      // Rising. It grows on the way up, which is what a gas bubble does and what makes the eye
      // follow it rather than read it as a moving dot.
      const climb = cycle / 0.72;
      const y = Math.round(deep - (deep - surface - 1) * climb);
      const r = Math.max(1, Math.round(vent.size * (0.45 + 0.55 * climb)));
      ctx.fillStyle = PAINT.meltHot;
      ctx.fillRect(vent.x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = PAINT.meltFlash;
      ctx.fillRect(vent.x - r + 1, y - r, r * 2 - 2, 1);
    } else if (cycle < 0.80) {
      // The burst: one bright frame, then a ring opening on the surface.
      const open = Math.round((cycle - 0.72) / 0.08 * (vent.size + 3));
      ctx.fillStyle = PAINT.meltFlash;
      ctx.fillRect(vent.x - open, surface - 1, 1, 2);
      ctx.fillRect(vent.x + open, surface - 1, 1, 2);
      ctx.fillRect(vent.x - open + 1, surface - 2, open * 2 - 1, 1);
    }
  }

  // ---- 4 · the surface line ----------------------------------------------------------------------
  // The crest goes on last, over the bubbles, so a bubble breaking the surface passes *under* the
  // skin and then through it rather than sitting on top of it.
  for (let x = 0; x < BUF.w; x += 1) {
    const y = top + _swell(x, t);
    ctx.fillStyle = PAINT.meltHot;
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = PAINT.meltRim;
    ctx.fillRect(x, y - 1, 1, 1);
  }

  if (calm) return;

  // Smoke. It leaves the vents that have just burst, rises, drifts and thins out. Deliberately dim
  // and short: this is the airspace the player flies through, and a haze that hides an enemy costs a
  // life for a decoration.
  for (const vent of VENT) {
    const cycle = ((t + vent.phase) % vent.period) / vent.period;
    if (cycle < 0.76) continue;
    const age = (cycle - 0.76) / 0.24;                  // 0 just after the burst, 1 gone
    const surface = top + _swell(vent.x, t);
    const rise = Math.round(age * (9 + vent.size * 3));
    const drift = Math.round(Math.sin(t * 0.9 + vent.phase) * age * 4);
    for (let i = 0; i < 3; i += 1) {
      const y = surface - 2 - rise + i * 3;
      if (y < top - 26 || y >= surface - 1) continue;
      ctx.fillStyle = i === 0 && age < 0.5 ? PAINT.smokeNear : PAINT.smokeFar;
      const w = Math.max(1, 3 - i);
      ctx.fillRect(vent.x + drift - (w >> 1) + i, y, w, 1);
    }
  }
}


/**
 * A floating island: grass on top, a seam of earth, and rock hanging under it.
 *
 * **Only the top `DECK` pixels are real.** The rock below is drawing and nothing else — the resolver
 * is handed the same flat slab it always was, so what you land on is exactly where you always landed.
 * That is the same arrangement as the dodo, whose sprite is far larger than the box that kills it:
 * a drawing may exceed the rule as long as the *surface* the rule uses is exactly where it is drawn.
 *
 * The rock is cool blue-grey on purpose. Earth-brown was the obvious choice and it is wrong here:
 * the dodo is entirely warm browns and tans, and a brown island under a brown bird is the same
 * camouflage the metal had before it was pushed off the character's hue. Three families, three
 * temperatures — warm character, cool ground, hot floor.
 *
 * Every bump and every bush is a function of the platform's own name and the column, so a ledge
 * looks the same on every run and in every screenshot. `_hash` is called once per column, not per
 * frame — none of this animates, and it should not: a landscape that shimmers is a landscape that
 * pulls the eye away from the bird.
 */
function _paintDeck(ctx, deck) {
  const x0 = px(deck.x);
  const y0 = px(deck.y);
  const w = px(deck.w);
  const h = px(DECK);

  // A number that belongs to this ledge and no other, so two ledges never get the same silhouette.
  let seed = 0;
  for (let i = 0; i < deck.id.length; i += 1) seed = (seed * 31 + deck.id.charCodeAt(i)) | 0;

  // ---- the rock, hanging ---------------------------------------------------------------------
  // The profile is worked out for every column first, then painted. That is not tidiness: lighting a
  // column needs to know what the column beside it is doing, and you cannot ask that while you are
  // still deciding it.
  const reach = Math.max(5, Math.min(18, Math.round(w * 0.16)));
  const drops = [];
  for (let i = 0; i < w; i += 1) {
    const across = w === 1 ? 0.5 : i / (w - 1);
    // Fat in the middle, tapering to nothing at both ends: the shape of something broken off rather
    // than cut, and what stops the island reading as a plank.
    const taper = Math.sin(Math.PI * across) ** 0.55;
    drops.push(Math.max(0, Math.round(reach * taper + _lump(seed, i, 5) * 5 + _lump(seed + 99, i, 13) * 7)));
  }

  for (let i = 0; i < w; i += 1) {
    const drop = drops[i];
    if (drop <= 0) continue;
    ctx.fillStyle = PAINT.rock;
    ctx.fillRect(x0 + i, y0 + h, 1, drop);

    // Lit from the left, like everything else on this field. Which face is lit is read off the
    // *shape* — a column deeper than its left neighbour is a face turned up and left, so it catches
    // the light. The first version scattered the highlights at random and produced a dotted line
    // under the turf: noise where the eye expects a form.
    const left = drops[i - 1] ?? 0;
    if (drop > left + 1) {
      ctx.fillStyle = PAINT.rockLit;
      ctx.fillRect(x0 + i, y0 + h, 1, Math.min(drop, 3));
    } else if (drop < left - 1) {
      ctx.fillStyle = PAINT.rockDark;
      ctx.fillRect(x0 + i, y0 + h, 1, Math.min(drop, 2));
    }
    ctx.fillStyle = PAINT.rockDark;
    ctx.fillRect(x0 + i, y0 + h + drop - 1, 1, 1);
  }

  // ---- the ledge itself, which is the part that is real ----------------------------------------
  ctx.fillStyle = PAINT.earth;
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = PAINT.rock;
  ctx.fillRect(x0, y0 + h - 2, w, 2);
  ctx.fillStyle = PAINT.grassDeep;
  ctx.fillRect(x0, y0, w, 3);
  // The one pixel of brand accent that every raised block on this site carries, doing double duty
  // here as the lit edge of the grass.
  ctx.fillStyle = PAINT.deckLip;
  ctx.fillRect(x0, y0, w, 1);

  // ---- bushes ----------------------------------------------------------------------------------
  // Two pixels tall and no more. The pilot stands with its feet on `y0`, so anything taller would be
  // drawn over its legs — grass you stand in reads as grass, grass you stand behind reads as a bug.
  for (let i = 2; i < w - 2; i += 1) {
    if (_hash(seed + i * 41 + 7) < 0.93) continue;
    const tall = _hash(seed + i * 53) > 0.55 ? 2 : 1;
    ctx.fillStyle = PAINT.grassDeep;
    ctx.fillRect(x0 + i - 1, y0 - tall, 3, tall);
    ctx.fillStyle = PAINT.deckLip;
    ctx.fillRect(x0 + i, y0 - tall, 1, 1);
    i += 3;                                  // never two bushes touching: that reads as a hedge
  }
}

/**
 * Which frame of which cycle this body is showing.
 *
 * Flying is driven by the beat, because the beat is the input: pressing the key has to produce a
 * visible stroke or the player is guessing at the rhythm that keeps them up. Walking is driven by
 * **distance travelled**, not by time — a time-driven walk cycle keeps stepping while the mount
 * creeps, and the feet slide.
 */
function _frameOf(pilot) {
  if (!pilot.grounded) {
    const cycle = PILOT_SPRITES.fly;
    const anchors = PILOT_SPRITES.flyAnchors;
    const eyes = PILOT_SPRITES.flyEyes;
    const glints = PILOT_SPRITES.flyGlints;
    if (pilot.beat <= 0) return { rows: cycle[0], anchor: anchors[0], eye: eyes[0], glint: glints[0] };
    const through = 1 - pilot.beat / 0.32;
    const i = Math.min(cycle.length - 1, Math.floor(through * cycle.length));
    return { rows: cycle[i], anchor: anchors[i], eye: eyes[i], glint: glints[i] };
  }
  const cycle = PILOT_SPRITES.walk;
  const anchors = PILOT_SPRITES.walkAnchors;
  const eyes = PILOT_SPRITES.walkEyes;
  const glints = PILOT_SPRITES.walkGlints;
  if (Math.abs(pilot.vx) < 6) return { rows: cycle[0], anchor: anchors[0], eye: eyes[0], glint: glints[0] };
  const i = Math.floor(pilot.stride / 26) % cycle.length;
  return { rows: cycle[i], anchor: anchors[i], eye: eyes[i], glint: glints[i] };
}



// How often the dodo blinks, and for how long. Four seconds is roughly a resting bird, and an eighth
// of a second is short enough to be caught out of the corner of the eye rather than watched.
const BLINK_EVERY = 4.2;
const BLINK_FOR = 0.13;

/**
 * The blink: the eye shuts for an instant while the bird is standing about.
 *
 * Only on the ground. In the air the wings are beating four frames a second and a blink would be
 * lost in it; standing still, it is the only thing moving, which is exactly why it makes the bird
 * look alive instead of paused.
 *
 * The eye's position comes from `sprites.js`, worked out from the artwork rather than typed in — it
 * is the one dark spot on the head that no outline touches. The lid is painted with the colour
 * **directly above the eye**, taken from the sprite itself, so it stays right if the dodo is ever
 * recoloured.
 *
 * The phase carries the pilot's index, so two riders standing side by side do not blink in unison,
 * which reads as a glitch rather than as two birds.
 */
function _paintBlink(ctx, pilot, sprite, eye, left, top, flip) {
  if (!eye || !pilot.grounded || calm) return;
  const phase = (_now + pilot.index * 1.7) % BLINK_EVERY;
  if (phase > BLINK_FOR) return;

  // The eye is a block, not a dot: a column of pupil and a column of white, two rows tall. Covering
  // it means covering all of it — leaving the white showing inside a shut eye looks worse than not
  // blinking at all, and covering only the top half turns the blink into a squint.
  const width = sprite[0].length;
  const x0 = flip ? width - eye[0] - EYE.w : eye[0];

  for (let dx = 0; dx < EYE.w; dx += 1) {
    // Painted in the colour the head already wears directly above the eye, read from the artwork
    // rather than named here, so a redrawn dodo blinks in its own feathers.
    const source = flip ? width - 1 - (x0 + dx) : x0 + dx;
    const above = (sprite[eye[1] - 1] || "")[source];
    ctx.fillStyle = (above && above !== "." && tint(above)) || PAINT.ink;
    ctx.fillRect(left + x0 + dx, top + eye[1], 1, EYE.h);
  }

  // And the lid itself, a dark line along the bottom of where the eye was. Without it the head just
  // goes blank for an eighth of a second, which reads as a dropped frame rather than as a blink.
  ctx.fillStyle = PALETTE[3];
  ctx.fillRect(left + x0, top + eye[1] + EYE.h - 1, EYE.w, 1);
}

/**
 * Una cella, disegnata.
 *
 * **Il colore dice che cosa uscirà** se la lasci lì: è la tinta della classe promossa, la stessa
 * dei nemici di quella classe, e viene dalla stessa misura sul disegno dell'uovo. Chi la vede sa
 * che cosa sta lasciando andare.
 *
 * Negli ultimi secondi diventa d'oro e smette di dirlo, ed è voluto: a quel punto la domanda non è
 * più «di che classe è», è «la prendo o no». Cambia l'informazione che serve e cambia il colore.
 *
 * L'oro **non lampeggia**. Lampeggiare era la scelta ovvia — lo fa mezzo genere — e mette una cosa
 * che pulsa a qualche battito al secondo su uno schermo pieno d'azione, che è esattamente quello
 * che chi ha chiesto meno movimento sta cercando di evitare. Un colore fermo dice la stessa cosa e
 * si può guardare.
 *
 * Il dondolio invece resta, perché è piccolo e perché è l'unica cosa che dice «sta per muoversi da
 * sé»: un pixel a destra e uno a sinistra, spento quando il movimento è ridotto.
 */
// -----------------------------------------------------------------------------------------------------------------
//  l a   b a r r a
// -----------------------------------------------------------------------------------------------------------------

/**
 * Le dieci cifre, tre per cinque.
 *
 * **Nessuna parola, mai.** Il gioco esiste in due lingue e ogni stringa a schermo è una stringa da
 * tenere allineata fra le due: una barra fatta di numeri e di icone non ha questo problema, e non
 * ha nemmeno il problema di stare dentro una larghezza che cambia da una lingua all'altra. È anche
 * quello che facevano i cabinati, e per la stessa ragione pratica.
 *
 * Tre pixel per cinque è la misura più piccola in cui una cifra resta una cifra: sotto, il 6 e l'8
 * diventano lo stesso disegno. In campo si dipingono al doppio, che su un fondo di 640 x 360 è
 * l'altezza di una scritta da cabinato.
 */
const DIGITS = [
  ["111", "101", "101", "101", "111"],
  [".1.", "11.", ".1.", ".1.", "111"],
  ["111", "..1", "111", "100", "111"],
  ["111", "..1", "111", "..1", "111"],
  ["101", "101", "111", "..1", "..1"],
  ["111", "100", "111", "..1", "111"],
  ["111", "100", "111", "101", "111"],
  ["111", "..1", ".1.", ".1.", ".1."],
  ["111", "101", "111", "101", "111"],
  ["111", "101", "111", "..1", "111"],
];

// Lo scudo, nella barra. Una goccia di fiamma larga cinque: piena quando è pronta, spenta mentre
// si ricarica, e con una barretta sotto che dice quanto manca.
const FLAME = ["..1..", ".11..", ".111.", "11111", ".111."];

/**
 * Una vita rimasta: **la testa del cavaliere**, ritagliata dal disegno.
 *
 * Non un cuore, non un pallino e nemmeno uno sperone stilizzato. Un'icona inventata è una cosa da
 * imparare, e in cima allo schermo di un gioco d'azione non si impara niente: si riconosce. La
 * testa che sta lassù è la stessa che sta in campo, nello stesso colore, quindi non c'è niente da
 * associare — quelle sono le volte che puoi ancora rientrare.
 *
 * Il riquadro lo misura il convertitore e lo esporta in `PILOT_SPRITES.head`, ancorato al pennone:
 * un elmo ridisegnato si porta dietro il ritaglio invece di lasciare la barra a mostrare una spalla.
 *
 * Il secondo giocatore ce l'ha **specchiata**, come è specchiato il suo dodo quando parte: guarda
 * verso il centro del campo da tutt'e due i lati, che è anche l'unico modo per cui due file di
 * teste identiche si distinguono a colpo d'occhio.
 */
function _paintHead(ctx, x, y, flip, tavolozza, giro = 0) {
  const box = PILOT_SPRITES.head;
  const sprite = PILOT_SPRITES.walk[0];
  const quarto = ((giro % 4) + 4) % 4;

  for (let gy = 0; gy < box.h; gy += 1) {
    const row = sprite[box.y + gy] || "";
    for (let gx = 0; gx < box.w; gx += 1) {
      const ch = row[box.x + gx];
      if (!ch || ch === ".") continue;
      const i = ALPHABET.indexOf(ch);
      ctx.fillStyle = tavolozza[i] || PAINT.ink;

      // **La rotazione è a quarti di giro, e fatta a mano.** Ruotare il contesto del canvas
      // avrebbe interpolato — un bordo sfumato su un campo di pixel netti è la cosa che tradisce
      // tutto il resto — mentre un quarto di giro è una permutazione di coordinate, esatta per
      // costruzione. Quattro pose per un giro sono poche, e per una testa che rotola bastano: a
      // questa misura quello che si legge è **che** gira, non di quanto.
      const sx = flip ? box.w - 1 - gx : gx;
      let dx = sx;
      let dy = gy;
      if (quarto === 1) { dx = box.h - 1 - gy; dy = sx; }
      else if (quarto === 2) { dx = box.w - 1 - sx; dy = box.h - 1 - gy; }
      else if (quarto === 3) { dx = gy; dy = box.w - 1 - sx; }
      ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  }
}

/** Quanto è larga e alta una testa a questo quarto di giro, e dove va appoggiata. */
function _headBox(testa) {
  const box = PILOT_SPRITES.head;
  const quarto = Math.floor(testa.spin || 0) % 4;
  const dritta = quarto % 2 === 0;
  const w = dritta ? box.w : box.h;
  const h = dritta ? box.h : box.w;
  return { quarto, w, h };
}

/**
 * Una testa staccata, senza il suo fuoco.
 *
 * Separata dalle fiamme per la stessa ragione della cella e del corpo: mentre affonda va dipinta
 * **sotto** la colata, e il fuoco sopra.
 */
function _paintHeadOnly(ctx, testa, cx) {
  const { quarto, w, h } = _headBox(testa);
  const tavolozza = TINTE[(KINDS[testa.kind] || {}).tinta] || PALETTE;
  _paintHead(ctx, cx - Math.round(w / 2), px(testa.y) - Math.round(h / 2), false,
    tavolozza, quarto);
}

/**
 * Una testa staccata che rotola in fiamme.
 *
 * È la stessa testa della barra delle vite e la stessa che il cavaliere ha in campo — **non un
 * disegno nuovo**, e non per risparmiare: quello che deve leggersi in un quarto di secondo è che
 * quella cosa che rotola *era* qualcuno, e un'icona diversa lo direbbe soltanto a chi ha tempo di
 * guardarla.
 *
 * Le fiamme sono tre e piccole: è una cosa piccola che brucia, e lingue alte quanto quelle di un
 * corpo la coprirebbero del tutto — e allora quello che rotola non si vedrebbe più, che è l'unica
 * cosa per cui esiste.
 */
function _paintRolling(ctx, testa, cx) {
  const { w, h } = _headBox(testa);
  const left = cx - Math.round(w / 2);
  const top = px(testa.y) - Math.round(h / 2);

  // **Le fiamme prima, la testa sopra.** Al contrario è quello che si fa per un corpo — lì il fuoco
  // deve avvolgerlo — ma una testa è tredici pixel, e tre lingue davanti la coprono del tutto. E
  // allora quello che rotola non si vede più, che è l'unica cosa per cui questa roba esiste.
  for (let i = 0; i < 3; i += 1) {
    const at = i / 2;
    _flame(ctx, left + Math.round(at * (w - 1)), top + h,
      i + (testa.phase || 0), h * 0.75 * (0.6 + 0.4 * Math.sin(Math.PI * at)), 4);
  }

  _paintHeadOnly(ctx, testa, cx);
}

/**
 * Un numero, dipinto.
 *
 * `align` esiste perché il punteggio del secondo giocatore cresce verso sinistra: allineato a
 * sinistra, la cifra delle unità si sposterebbe a ogni punto preso, e un numero le cui cifre
 * ballano è un numero che non si legge di sfuggita — che è l'unico modo in cui si legge una barra
 * mentre si gioca.
 */
function _paintNumber(ctx, value, x, y, scale, colour, align = "left") {
  const text = String(Math.max(0, Math.round(value)));
  const pitch = 4 * scale;                       // tre di cifra più uno d'aria
  const width = text.length * pitch - scale;
  const left = align === "right" ? x - width : align === "centre" ? x - Math.round(width / 2) : x;

  ctx.fillStyle = colour;
  for (let i = 0; i < text.length; i += 1) {
    const glyph = DIGITS[text.charCodeAt(i) - 48];
    if (!glyph) continue;
    for (let gy = 0; gy < glyph.length; gy += 1) {
      for (let gx = 0; gx < 3; gx += 1) {
        if (glyph[gy][gx] !== "1") continue;
        ctx.fillRect(left + i * pitch + gx * scale, y + gy * scale, scale, scale);
      }
    }
  }
}

function _paintGlyph(ctx, glyph, x, y, colour) {
  ctx.fillStyle = colour;
  for (let gy = 0; gy < glyph.length; gy += 1) {
    for (let gx = 0; gx < glyph[gy].length; gx += 1) {
      if (glyph[gy][gx] === "1") ctx.fillRect(x + gx, y + gy, 1, 1);
    }
  }
}

/**
 * I punteggi che volano via: un numero che sale dal punto in cui è stato guadagnato e sfuma.
 *
 * **È l'annuncio, e non è una parola.** Il campo di questo gioco non ha testo — la barra in cima è
 * cifre e icone apposta, così non ci sono due lingue da tenere allineate dentro l'area di gioco — e
 * un premio raro ha bisogno di essere annunciato dove è successo, non in un angolo. Un numero che
 * esce dal punto esatto e sale dice **quanto** e **dove** insieme, in una forma che il giocatore ha
 * già imparato guardando la barra.
 *
 * Sale e non lampeggia. Il lampeggio l'avevamo già escluso per la cella che sta per schiudersi, e
 * per la stessa ragione: è la cosa che chi ha chiesto meno movimento sta cercando di evitare, e su
 * un premio di quattro cifre sarebbe pure grosso.
 *
 * Sfuma cambiando colore invece che opacità: su un campo a tavolozza fissa una scritta semitrasparente
 * si mescolerebbe col fondo in colori che non esistono da nessuna parte, ed è esattamente il tipo di
 * bordo sfumato che tradisce un disegno a pixel.
 */
function _paintPops(ctx, world) {
  for (const pop of world.pops || []) {
    const t = 1 - Math.max(0, Math.min(1, pop.left / SHIELD.pop));   // 0 appena nato, 1 finito
    const y = px(pop.y) - Math.round(t * 22);
    const colore = t < 0.55 ? PAINT.meltFlash : t < 0.8 ? PAINT.meltHot : PAINT.meltCrust;
    _wrapped(px(pop.x), (x) => _paintNumber(ctx, pop.points, x, y, 2, colore, "centre"));
  }
}

/**
 * Punti, vite e ondata, nella fascia sopra il soffitto.
 *
 * **Dentro il campo, non attorno.** La fascia fra il bordo e la linea tratteggiata del soffitto è
 * aria in cui non si vola — trenta pixel che finora non servivano a niente — quindi la barra non
 * toglie un solo pixel di gioco e viene ingrandita insieme al campo, con la stessa grana. Fuori dal
 * canvas sarebbe stata testo del browser: nitido, di un'altra epoca, e con due lingue da tenere
 * allineate.
 *
 * Il punteggio del primo giocatore a sinistra e quello del secondo a destra, come su un cabinato;
 * l'ondata in mezzo, più piccola e più spenta, perché è la cosa che si guarda meno spesso.
 *
 * Le vite si contano guardandole finché sono poche, e diventano un numero quando sono tante: sei
 * speroni in fila si contano ancora, dodici no, e la vita in più raddoppiando arriva a farne dodici.
 */
function _paintHud(ctx, world) {
  const RIGA1 = 2;
  const RIGA2 = 14;
  const MARGINE = 8;
  const box = PILOT_SPRITES.head;
  const PASSO = box.w + 2;

  world.pilots.forEach((pilot, i) => {
    const destra = i === 1;
    const x = destra ? BUF.w - MARGINE : MARGINE;
    _paintNumber(ctx, pilot.score, x, RIGA1, 2, PAINT.hud, destra ? "right" : "left");

    // **La stessa testa per tutt'e due**, nel colore che il cavaliere ha in campo. Il secondo
    // giocatore l'aveva d'oro per distinguerlo, ed era sbagliato due volte: l'oro in questo gioco
    // vuol già dire «questa cella sta per schiudersi», e in campo il secondo dodo è azzurro come il
    // primo — quindi la barra prometteva un cavaliere che non esiste. A dire di chi è la fila
    // bastano l'angolo in cui sta e il verso in cui guarda.
    const tavolozza = PALETTE;
    const quante = Math.max(0, pilot.lives);
    const mostrate = Math.min(quante, 5);
    for (let n = 0; n < mostrate; n += 1) {
      _paintHead(ctx, destra ? x - box.w - n * PASSO : x + n * PASSO, RIGA2, destra, tavolozza);
    }
    // Oltre le cinque diventa un numero: cinque teste si contano ancora con un'occhiata, dieci no,
    // e la vita in più raddoppiando ci arriva.
    if (quante > mostrate) {
      const dopo = mostrate * PASSO;
      _paintNumber(ctx, quante, destra ? x - dopo - 2 : x + dopo + 2, RIGA2 + 4, 1,
        PAINT.hud, destra ? "right" : "left");
    }

    // Lo scudo in fondo alla fila, sulla stessa riga: sotto ci sta lo stato del giocatore, e lo
    // scudo è stato del giocatore quanto le vite.
    const fondo = mostrate * PASSO + (quante > mostrate ? 12 : 4);
    _paintShieldGauge(ctx, pilot, destra ? x - fondo : x + fondo, RIGA2 + 4, destra);
  });

  _paintNumber(ctx, world.wave || 1, BUF.w / 2, RIGA2, 1, PAINT.hudDim, "centre");
}

/**
 * Lo stato dello scudo, accanto alle vite.
 *
 * Tre stati e tre letture, e nessuna parola: **acceso** è una fiamma chiara con una barretta che si
 * accorcia, **in ricarica** è una fiamma spenta con una barretta che si riempie, **pronto** è una
 * fiamma accesa e nessuna barretta. La barretta che manca è l'informazione più importante delle
 * tre, ed è quella che costa meno pixel: niente barra vuol dire che puoi premere adesso.
 *
 * Le due barrette vanno nello stesso verso — da vuota a piena — apposta: una che si accorcia e una
 * che si allunga sono due movimenti opposti che dicono la stessa cosa, «il tempo passa», e chi
 * guarda per mezzo secondo non ha modo di sapere quale delle due sta guardando. Qui la barra
 * **cala** in tutti e due i casi, e quello che cambia è il colore.
 */
function _paintShieldGauge(ctx, pilot, x, y, destra) {
  const acceso = pilot.shield > 0;
  const carica = pilot.cool > 0;
  const colore = acceso ? PAINT.meltFlash : carica ? PAINT.hudDim : PAINT.meltHot;
  const ax = destra ? x - 5 : x;
  _paintGlyph(ctx, FLAME, ax, y, colore);

  if (!acceso && !carica) return;
  const quanto = acceso ? pilot.shield / SHIELD.lasts : pilot.cool / SHIELD.cools;
  const largo = Math.max(1, Math.round(5 * quanto));
  ctx.fillStyle = colore;
  ctx.fillRect(destra ? ax + 5 - largo : ax, y + 6, largo, 1);
}

function _paintCella(ctx, cella, cx) {
  // Una cella che affonda non avvisa più di niente: tiene il colore della sua classe fino
  // all'ultimo pixel visibile. L'oro dice «sta per schiudersi», e questa non si schiuderà.
  const sta = !cella.sinking && cella.hatch <= CELLA.warn;
  const tavolozza = sta
    ? EGG_PALETTES.oro
    : (EGG_PALETTES[(KINDS[cella.kind] || {}).tinta] || EGG_PALETTES.oro);

  // Un pixel di dondolio, e solo mentre sta per schiudersi: una cella che dondola sempre sarebbe
  // rumore, e il rumore in un campo pieno è la cosa che nasconde quello che conta.
  const scarto = sta && !calm ? Math.round(Math.sin(_now * 9)) : 0;
  const left = cx - px(CELLA.w) / 2 + scarto;
  // Appoggiata per il fondo, come il dodo lo è per i piedi: è lì che il ripiano la ferma. Lo scarto
  // lo calcola il convertitore dal disegno e da `CELLA.h`, e sta in un posto solo.
  const top = px(cella.y) + EGG.lift;

  each(EGG_SPRITE, false, (x, y, index) => {
    ctx.fillStyle = tavolozza[index] || PAINT.ink;
    ctx.fillRect(left + x, top + y, 1, 1);
  });

}

/**
 * Il fuoco di qualcosa che il metallo si sta prendendo.
 *
 * **Uno solo, per la cella e per il corpo in fiamme.** Sono la stessa cosa che succede — qualcosa
 * scende dentro la colata e non torna — e disegnarla in due modi avrebbe detto che sono due cose.
 * Quello che cambia è `largo`, cioè quanto è grosso il buco che sta facendo.
 *
 * Quattro strati, e ognuno risponde a una domanda diversa che chi guarda si fa in mezzo secondo:
 *
 *  - le **bollicine** dicono che sotto continua, che non è finita sul pelo;
 *  - la **pozza** attacca il fuoco al metallo invece di lasciarlo appoggiato sopra;
 *  - le **lingue** sono il fuoco;
 *  - i **lapilli** dicono che c'è stato un impatto, non solo del calore.
 *
 * Le bollicine sono le stesse che la colata fa da sé alle sue bocche, e non per risparmio: se qui
 * fossero di un'altra forma, il campo direbbe che sono due fenomeni diversi.
 *
 * **Nessun numero casuale**, come da nessuna parte in questo file: periodi, fasi e spinte vengono
 * dall'indice e dal seme, quindi lo stesso seme rigioca lo stesso fuoco fino all'ultimo lapillo.
 */
function _paintSinkFire(ctx, cx, largo, seme, mio = false) {
  const span = largo + 10;                    // il metallo si chiude **attorno**, non solo sotto
  const superficie = (x) => px(MELT) + _swell(x, _now);

  // ---- 1 · le bollicine ---------------------------------------------------------------------------
  // Salgono da sotto e scoppiano in superficie, come quelle che la colata fa da sola alle sue
  // bocche: **è la stessa cosa che succede**, e succede perché lì dentro c'è qualcosa che brucia.
  // Disegnarle in un altro modo avrebbe detto che è un'altra cosa.
  //
  // Prime di tutto il resto, così una bolla passa **sotto** la pozza e le lingue invece di
  // sedercisi sopra.
  for (let i = 0; i < 5; i += 1) {
    const periodo = 1.05 + (i % 3) * 0.37;
    const ciclo = (((_now + seme + i * 0.61) % periodo) + periodo) % periodo / periodo;
    const x = cx - largo / 2 + Math.round(((i * 2 + 1) / 10) * largo);
    const pelo = superficie(x);
    const fondo = pelo + 22;

    if (ciclo < 0.78) {
      const salita = ciclo / 0.78;
      const y = Math.round(fondo - (fondo - pelo - 1) * salita);
      // Cresce salendo, che è quello che fa una bolla di gas e quello che fa seguire l'occhio
      // invece di leggerla come un puntino che si sposta. Fino a tre pixel di raggio: a due si
      // confondeva con i granelli che la colata ha già dentro, e una bolla che si confonde col
      // fondo non dice niente.
      const r = Math.max(1, Math.round(1 + 2 * salita));
      ctx.fillStyle = PAINT.meltHot;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      // La lumeggiatura in cima alla bolla. Larga almeno un pixel: a raggio uno, `r * 2 - 2` fa
      // zero, e un `fillRect` largo zero non disegna niente — la bolla appena nata restava senza.
      ctx.fillStyle = PAINT.meltFlash;
      ctx.fillRect(x - r + 1, y - r, Math.max(1, r * 2 - 2), 1);
    } else if (ciclo < 0.88) {
      const apre = Math.round(((ciclo - 0.78) / 0.1) * 5);
      ctx.fillStyle = PAINT.meltFlash;
      ctx.fillRect(x - apre, pelo - 1, 1, 2);
      ctx.fillRect(x + apre, pelo - 1, 1, 2);
      ctx.fillRect(x - apre + 1, pelo - 2, apre * 2 - 1, 1);
    }
  }

  // ---- 2 · la pozza -------------------------------------------------------------------------------
  // Una fascia rovente continua da cui le lingue escono: senza, sei lingue con un po' di buio fra
  // una e l'altra sono sei candeline sotto una torta, ed è esattamente quello che sembravano. Il
  // fuoco ha un piede solo.
  for (let x = cx - largo / 2 - 2; x <= cx + largo / 2 + 2; x += 1) {
    const base = superficie(x);
    ctx.fillStyle = PAINT.meltHot;
    ctx.fillRect(x, base - 2, 1, 2);
    ctx.fillStyle = PAINT.meltFlash;
    ctx.fillRect(x, base - 1, 1, 1);
  }

  // ---- 3 · le lingue ------------------------------------------------------------------------------
  // A grappolo e non a palizzata: quelle di mezzo sono più alte di quelle di bordo. Sei barre della
  // stessa altezza sono uno steccato, e uno steccato non brucia.
  const lingue = 6;
  for (let i = 0; i < lingue; i += 1) {
    const at = i / (lingue - 1);
    const x = cx - span / 2 + Math.round(at * span);
    const campana = 0.45 + 0.55 * Math.sin(Math.PI * at);
    _flame(ctx, x, superficie(x), i + seme, 18 * campana, 7);
  }

  // ---- 4 · i lapilli ------------------------------------------------------------------------------
  // Schizzi di metallo buttati in aria e ricaduti, e sono la cosa che si vede da lontano: quando
  // qualcosa finisce nella colata deve sembrare che la colata **reagisca**, non che accolga.
  //
  // Ventidue, e non otto. A otto erano dei puntini sopra le fiamme; a ventidue sono uno scoppio.
  // Il numero costa poco — cinque rettangoli l'uno, e ce ne sono al più due o tre in campo insieme
  // — e nessuno di loro è casuale.
  //
  // **Un ventaglio, non ventidue fontane.** Partono quasi tutti dallo stesso punto e si aprono a
  // forza diversa: è la differenza fra una cosa che esplode e ventidue cose che schizzano. La
  // forza decide tutto e in modo coerente con un lancio vero — chi parte piatto va lontano e
  // basso, chi parte ripido va vicino e alto — e decide anche la grandezza, perché una scheggia
  // che arriva lontano è una scheggia piccola.
  //
  // Le parabole sono vere: `4t(1-t)` vale zero ai due capi e uno a metà, quindi il lapillo parte
  // dal pelo del metallo, culmina e ricade esattamente da dove è uscito. La coda è la stessa
  // parabola due e tre fotogrammi indietro, dipinta più spenta — costa due pixel e trasforma un
  // punto in qualcosa che si muove.
  const LAPILLI = 22;
  for (let i = 0; i < LAPILLI; i += 1) {
    // Periodi primi fra loro a passo irregolare: due lapilli vicini non ripartono mai insieme, e
    // il getto non pulsa.
    const periodo = 0.62 + ((i * 7) % 11) * 0.085;
    const ciclo = (((_now + seme * 1.7 + i * 0.29) % periodo) + periodo) % periodo / periodo;
    const forza = 0.2 + (((i * 5) % 9) / 8) * 0.8;      // 0,2 piatto e lontano — 1 ripido e alto
    const lato = i % 2 ? 1 : -1;
    const spinta = lato * (30 - forza * 22);
    const salita = 12 + forza * 32;
    const x0 = cx + (((i * 3) % 5) - 2) * Math.round(largo / 9);
    const arco = (t) => ({
      x: Math.round(x0 + spinta * (t - 0.5) * 2),
      y: Math.round(superficie(x0) - 1 - salita * 4 * t * (1 - t)),
    });

    const coda = mio
      ? [[0.18, PAINT.sparkMineSmoke], [0.09, PAINT.sparkMineTail]]
      : [[0.18, PAINT.meltCrust], [0.09, PAINT.meltGlow]];
    for (const [indietro, colore] of coda) {
      const dove = arco(Math.max(0, ciclo - indietro));
      ctx.fillStyle = colore;
      ctx.fillRect(dove.x, dove.y, 1, 1);
    }
    const ora = arco(ciclo);
    const grosso = forza > 0.55 ? 2 : 1;
    ctx.fillStyle = mio ? PAINT.sparkMine : PAINT.meltFlash;
    ctx.fillRect(ora.x, ora.y, grosso, grosso);
  }
}

/**
 * Una lingua di fuoco, dal basso verso l'alto.
 *
 * In una funzione sola perché il fuoco in questo gioco compare in tre posti — la cella che affonda,
 * il corpo che brucia, lo scudo acceso — e tre fuochi disegnati in tre modi sarebbero tre cose
 * diverse a schermo. È la stessa ragione per cui la tavolozza del campo è una sola.
 *
 * **Riga per riga, non un rettangolo.** Una lingua disegnata come una barra è una barra, e sei
 * barre accanto sono un pettine: era la prima versione, e si vedeva. Qui la lingua si assottiglia
 * salendo e si piega, con la piega che cresce verso la punta — la base sta ferma, la cima si muove.
 *
 * `seme` distingue una lingua dall'altra: tre seni di periodo diverso, come per la superficie del
 * metallo, così due lingue vicine non possono essere in fase.
 */
function _flame(ctx, x, base, seme, altezza, piede) {
  const onda = Math.sin(_now * 7.3 + seme * 2.1) * 0.5
    + Math.sin(_now * 4.1 + seme * 5.7) * 0.35
    + Math.sin(_now * 11.7 + seme) * 0.15;
  const alta = Math.max(3, Math.round(altezza + onda * 6));

  for (let k = 0; k < alta; k += 1) {
    const su = k / alta;                            // 0 alla base, 1 in punta
    const w = Math.max(1, Math.round(piede * (1 - su ** 1.4)));
    const piega = Math.round(Math.sin(_now * 5.2 + seme * 1.7 + su * 2.4) * su * 2);
    // Il chiaro sta **in basso**, dov'è attaccata, e si spegne salendo: è il verso giusto e quello
    // che nessuno disegna al primo tentativo, perché sulla pagina sembra naturale il contrario.
    ctx.fillStyle = su < 0.15 ? PAINT.meltFlash : su < 0.55 ? PAINT.meltHot : PAINT.meltGlow;
    ctx.fillRect(x - (w >> 1) + piega, base - 1 - k, w, 1);
  }
  // La punta scura: è il fumo che comincia dove la fiamma finisce, e le dà un capo invece di un
  // taglio netto.
  ctx.fillStyle = PAINT.meltCrust;
  ctx.fillRect(x + Math.round(Math.sin(_now * 5.2 + seme * 1.7 + 2.4) * 2), base - 1 - alta, 1, 1);
}

/**
 * Lo scudo di fuoco, attorno al dodo.
 *
 * Una corona di lingue rivolte in fuori, sulla circonferenza dove sta già l'anello della
 * protezione. Non è una scelta di comodo: sono le due cose che dicono «adesso non puoi essere
 * toccato», e metterle nello stesso posto vuol dire che si impara una forma sola. Quello che le
 * distingue è il colore — verde chi è appena rientrato, fuoco chi ha acceso lo scudo — e il fatto
 * che una è ferma e l'altra si muove.
 *
 * **Una corona continua, non delle lingue contate.** Il primo tentativo metteva diciotto fiamme a
 * intervalli regolari sulla circonferenza, e a schermo erano diciotto scintille sparse: sulla
 * diagonale i punti di due fiamme vicine non si toccano, e quello che si vede sono i buchi. Qui si
 * percorre **ogni pixel** del cerchio e per ognuno si dà uno spessore che ondeggia — così il fuoco
 * è una cosa sola che respira, e non un cerchio di cose.
 *
 * L'onda è in funzione dell'**angolo**, non dell'indice: tre giri di seno con periodi diversi,
 * quindi il profilo non si ripete lungo il giro e non c'è una cucitura dove il cerchio si chiude.
 * E gira, lentamente, perché una corona ferma con dentro del movimento sembra un'animazione
 * appiccicata, mentre una che ruota sembra una cosa che succede.
 */
function _paintShield(ctx, pilot, cx) {
  const midX = cx;
  const midY = px(pilot.y);
  // **Un'ellisse sul bordo del disegno**, non un cerchio attorno al corpo. Provata prima stretta
  // sulla scatola di collisione, e a schermo si vedevano quattro scintille: la corona era tutta
  // lì, ma **dietro il dodo** — un uccello con le ali aperte è largo sessantadue pixel e ne
  // copriva l'intero giro. Quello che si vedeva erano i pezzi che sbucavano di lato, cioè
  // esattamente i buchi.
  //
  // L'anello della protezione resta un cerchio largo, calcolato sulla diagonale: le due forme non
  // si possono confondere, una gira al largo e ferma, questa sta sul contorno e brucia.
  const rx = px(SPRITE.w) / 2 + 1;
  const ry = px(SPRITE.h) / 2 + 1;
  const passi = Math.max(96, Math.round(Math.PI * (rx + ry)));

  for (let i = 0; i < passi; i += 1) {
    const ang = (i / passi) * Math.PI * 2 + _now * 0.7;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const onda = Math.sin(ang * 5 + _now * 6.1) * 0.5
      + Math.sin(ang * 8 - _now * 4.3) * 0.3
      + Math.sin(ang * 13 + _now * 9.7) * 0.2;
    const alta = Math.max(2, Math.round(5 + onda * 4));

    // Da due pixel **dentro** il contorno verso fuori: la parte interna è il filo continuo che
    // tiene insieme la corona, quella esterna è la fiamma che si muove.
    for (let k = -2; k < alta; k += 1) {
      const su = (k + 2) / (alta + 2);
      ctx.fillStyle = su < 0.3 ? PAINT.meltFlash : su < 0.65 ? PAINT.meltHot : PAINT.meltGlow;
      ctx.fillRect(Math.round(midX + dx * (rx + k)), Math.round(midY + dy * (ry + k)), 1, 1);
    }
  }
}

/**
 * Un corpo in fiamme che cade.
 *
 * È il nemico che era, con lo stesso disegno e lo stesso colore: perché si capisca **chi** ha preso
 * fuoco, e perché una sagoma nuova al posto di quella conosciuta si legge come «è successo qualcosa
 * che non capisco» invece di «quello lì è finito».
 *
 * Le fiamme escono da sotto e lo avvolgono salendo, e sono le stesse della colata perché è la
 * stessa cosa: il fuoco di questo gioco è uno solo.
 */
/**
 * Il profilo inferiore di un fotogramma: per ogni colonna, la riga più bassa disegnata.
 *
 * Serve alle fiamme, e il risultato si tiene in cache perché i fotogrammi sono quattro e non
 * cambiano mai: calcolarlo a ogni corpo e a ogni fotogramma sarebbe tremila confronti per niente.
 */
const _profili = new Map();

function _bottomProfile(rows) {
  let found = _profili.get(rows);
  if (found) return found;
  const w = Math.max(...rows.map((row) => row.length));
  found = new Array(w).fill(-1);
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== ".") found[x] = y;
    }
  }
  _profili.set(rows, found);
  return found;
}

/** Quale fotogramma di volo mostra un corpo che brucia. Uno solo, letto da due funzioni. */
function _pyreFrame(pyre) {
  const ciclo = PILOT_SPRITES.fly;
  return ciclo[Math.floor(_now * 11 + (pyre.phase || 0)) % ciclo.length];
}

function _paintPyre(ctx, pyre, cx) {
  // **Le ali sbattono.** Un corpo che cade con le ali ferme è un oggetto; un corpo che le muove
  // ancora è una creatura a cui sta succedendo qualcosa, e la differenza fra le due cose è tutta
  // qui. Il ciclo è più veloce di un battito vero — undici fotogrammi al secondo contro i dodici
  // di un battito intero, ma senza le pause fra un battito e l'altro — quindi non legge come volo:
  // legge come dimenarsi.
  //
  // La fase viene dal corpo e non dal tempo soltanto, così due nemici bruciati insieme non
  // agonizzano all'unisono.
  const sprite = _pyreFrame(pyre);
  const flip = pyre.facing < 0;
  const left = cx - px(SPRITE.w) / 2;
  const top = px(pyre.y) + PILOT_SPRITES.lift;
  const tavolozza = TINTE[(KINDS[pyre.kind] || {}).tinta] || PALETTE;

  // **Se la testa è saltata via, qui non si disegna.** Lo stesso riquadro che la barra usa per le
  // vite, tolto invece che copiato: il ritaglio sta in un posto solo, quindi il buco nel corpo e la
  // testa che rotola non possono finire in due punti diversi del disegno.
  const buco = pyre.headless ? PILOT_SPRITES.head : null;
  const larghezza = measure(sprite).w;

  each(sprite, flip, (x, y, index) => {
    if (buco) {
      const sx = flip ? larghezza - 1 - x : x;
      if (sx >= buco.x && sx < buco.x + buco.w && y >= buco.y && y < buco.y + buco.h) return;
    }
    ctx.fillStyle = tavolozza[index] || PAINT.ink;
    ctx.fillRect(left + x, top + y, 1, 1);
  });

}

/**
 * Lo zampillo dal collo, per il primo secondo e mezzo dopo che la testa è saltata.
 *
 * Sette gocce a parabola, e **a scatti**: i periodi sono quasi uguali fra loro, quindi le gocce
 * escono a gruppi invece che in fila regolare — che è la differenza fra uno zampillo e un
 * rubinetto. Sono quasi uguali e non identici perché identici darebbero un gruppo solo, che si
 * legge come un unico oggetto che va su e giù.
 *
 * **Dura tutta la caduta**, e finisce dove finisce il corpo: dentro il metallo. Prima aveva un
 * contatore da un secondo e mezzo, e il difetto era che un corpo lasciato cadere da mezz'aria
 * arriva alla colata in poco più di un secondo — quindi il getto si spegneva proprio mentre lo si
 * cercava, e sembrava che il sangue uscisse *solo* al contatto col metallo.
 *
 * Il collo lo dà **lo stesso riquadro della testa**, sotto: il buco nel corpo, la testa che rotola
 * e il punto da cui esce il sangue sono tre conseguenze di un numero solo, e non possono trovarsi
 * in tre posti diversi.
 *
 * Si dipinge **dopo le fiamme**, e la prima versione lo faceva prima. Sembrava l'ordine giusto — il
 * sangue esce dal corpo, il fuoco lo avvolge — e a schermo il fuoco se lo mangiava: le lingue sono
 * alte quanto il corpo e coprono esattamente la zona da cui esce. Le gocce salgono più in alto
 * delle fiamme apposta, e adesso ci arrivano sopra invece che dietro.
 */
function _paintNeck(ctx, pyre, cx) {
  const sprite = _pyreFrame(pyre);
  const flip = pyre.facing < 0;
  const left = cx - px(SPRITE.w) / 2;
  const top = px(pyre.y) + PILOT_SPRITES.lift;
  const box = PILOT_SPRITES.head;
  const w = measure(sprite).w;
  const mezzo = box.x + Math.floor(box.w / 2);
  const nx = left + (flip ? w - 1 - mezzo : mezzo);
  const ny = top + box.y + box.h - 1;
  const gocce = 7;

  for (let i = 0; i < gocce; i += 1) {
    const periodo = 0.3 + (i % 3) * 0.05;
    const ciclo = (((_now + (pyre.phase || 0) + i * 0.11) % periodo) + periodo) % periodo / periodo;
    const verso = flip ? -1 : 1;
    const spinta = verso * (4 + (i % 4) * 4);
    // Più in alto delle fiamme, che arrivano a circa un corpo sopra la pancia: una goccia che
    // culmina dentro il fuoco è una goccia che non si vede.
    const salita = 14 + (i % 3) * 8;
    const x = Math.round(nx + spinta * ciclo);
    const y = Math.round(ny - salita * 4 * ciclo * (1 - ciclo) + ciclo * 8);

    // Due pixel per due sulla testa della goccia, uno per la scia. A un pixel per uno lo zampillo
    // c'era e non si vedeva: a questa misura, sopra un corpo in fiamme, un pixel solo è rumore.
    ctx.fillStyle = PAINT.bloodDark;
    ctx.fillRect(x, y + 2, 2, 1);
    ctx.fillStyle = PAINT.blood;
    ctx.fillRect(x, y + 1, 2, 1);
    ctx.fillStyle = PAINT.bloodBright;
    ctx.fillRect(x, y, 2, 1);
  }
}

/**
 * Le fiamme di un corpo che brucia.
 *
 * Separate dal corpo per la stessa ragione per cui lo sono quelle della cella: mentre affonda, il
 * corpo va dipinto **sotto** la colata e le fiamme **sopra**, o il metallo se le mangia e quello
 * che resta è un uccello che scende senza bruciare.
 *
 * Alte quanto il corpo, o quasi: fiamme che arrivano alle zampe sono un falò **sotto** un uccello,
 * e quello che deve leggersi è un uccello che sta bruciando. La misura è la scatola di collisione,
 * cioè il corpo vero, non il riquadro del disegno che comprende le ali aperte.
 */
function _paintPyreFlames(ctx, pyre, cx) {
  const sprite = _pyreFrame(pyre);
  const flip = pyre.facing < 0;
  const left = cx - px(SPRITE.w) / 2;
  const top = px(pyre.y) + PILOT_SPRITES.lift;
  const profilo = _bottomProfile(sprite);
  const w = profilo.length;

  // **Ogni fiamma parte dal punto della sagoma che ha sotto**, non da una riga sola.
  //
  // Prima erano sette lingue tutte appoggiate al fondo della scatola di collisione, e il difetto
  // era esattamente lì: un bordo inferiore dritto. Un falò ha una base piatta perché sotto ha il
  // terreno; un corpo avvolto dalle fiamme no — il fuoco lo prende dalla pancia, dalla coda, dalle
  // zampe, che stanno a tre altezze diverse. Ricalcando il profilo del disegno la base sparisce, e
  // quello che resta è una creatura dentro il fuoco invece che sopra.
  //
  // Una colonna ogni quattro: più fitto il fuoco chiude la sagoma e non si capisce più **chi** sta
  // bruciando — che è metà dell'informazione — più rado torna a essere un pettine.
  for (let gx = 1; gx < w; gx += 4) {
    const col = flip ? w - 1 - gx : gx;
    const gy = profilo[col];
    if (gy < 0) continue;

    // Alte quanto il corpo, e più alte al centro: le fiamme devono superare il dorso, o si legge
    // come un uccello che passa sopra un incendio invece che come un uccello che brucia.
    const at = gx / (w - 1);
    const campana = 0.5 + 0.5 * Math.sin(Math.PI * at);
    _flame(ctx, left + gx, top + gy + 1, gx * 0.7, px(PILOT.h) * 0.8 * campana, 5);
  }
}

/**
 * L'Intruso: un cuneo di metallo con una bocca accesa davanti.
 *
 * **Disegnato in codice, non preso dal foglio degli sprite**, e non per mancanza di un disegno: è
 * l'unica cosa in campo che non è una creatura, e il modo in cui è fatto deve dirlo prima che si
 * capisca che cos'è. Le cavalcature sono pixel dipinti a mano con cinquantatré colori; questo è
 * geometria con quattro.
 *
 * La **bocca** è la parte che conta, perché è lì che si abbatte: sta davanti, a metà altezza, ed è
 * l'unica cosa accesa del disegno. Chi guarda deve poterla mirare senza sapere la regola.
 *
 * Il cuneo si assottiglia verso la coda, così il muso si legge da solo e non serve una freccia
 * appiccicata sopra per dire da che parte guarda. Specchiato quando va a sinistra, come tutto il
 * resto del gioco.
 */
function _paintIntruder(ctx, intruso, cx) {
  const w = px(INTRUDER.w);
  const h = px(INTRUDER.h);
  const midY = px(intruso.y);
  const verso = intruso.facing < 0 ? -1 : 1;
  const muso = cx + (w / 2) * verso;
  const coda = cx - (w / 2) * verso;

  // Lo scafo, colonna per colonna: alto al muso e sottile in coda. `1 - t*t` invece di `1 - t` fa
  // un cuneo con la pancia, non un triangolo — un triangolo a questa misura legge come una freccia,
  // e una freccia è un simbolo, non un oggetto.
  for (let i = 0; i <= w; i += 1) {
    const t = i / w;                                 // 0 al muso, 1 in coda
    const alta = Math.max(2, Math.round(h * (1 - t * t * 0.72)));
    const x = Math.round(muso - verso * i);
    ctx.fillStyle = PAINT.hull;
    ctx.fillRect(x, midY - Math.floor(alta / 2), 1, alta);
    // Un filo chiaro in cima e uno scuro sotto: due righe e il cuneo smette di essere una macchia.
    ctx.fillStyle = PAINT.hullLit;
    ctx.fillRect(x, midY - Math.floor(alta / 2), 1, 1);
    ctx.fillStyle = PAINT.hullDark;
    ctx.fillRect(x, midY + Math.ceil(alta / 2) - 1, 1, 1);
  }

  // **La bocca**, e sopra di lei lo stesso segno che porta la punta dello sperone.
  //
  // È la correzione più importante che questo velivolo ha avuto, e viene da una partita vera: «è
  // uscito un oggetto volante che mi ha incendiato, non si capisce cosa sia». Il problema non era
  // che fosse brutto — era che **non diceva la sua regola**. Un giocatore che vede un trattino
  // davanti al proprio muso e lo stesso trattino davanti a quello dell'Intruso capisce, senza
  // leggere niente, che le due cose si confrontano: è la stessa grammatica che il duello usa da
  // sempre.
  //
  // Il segno è il colore dei nemici, come per gli altri: quello verde è tuo, quello chiaro no.
  ctx.fillStyle = PAINT.intake;
  ctx.fillRect(muso - (verso > 0 ? 4 : 0), midY - 3, 5, 7);
  ctx.fillStyle = PAINT.meltFlash;
  ctx.fillRect(muso - (verso > 0 ? 3 : 0), midY - 1, 3, 3);
  ctx.fillStyle = PAINT.reachFoe;
  ctx.fillRect(muso + (verso > 0 ? 2 : -6), midY, 4, 1);

  // **L'ombra che lo precede mentre entra.** Finché è sopra il soffitto — cioè mentre sta scendendo
  // in campo — sotto di lui corre un segno che dice dove arriverà. Chi gioca guarda in basso, dove
  // succedono le cose; senza questo, l'Intruso è una cosa che compare, e le cose che compaiono non
  // si possono evitare.
  if (intruso.y < px(CEILING) * PIXEL + INTRUDER.h) {
    ctx.fillStyle = PAINT.hullLit;
    for (let i = -3; i <= 3; i += 1) ctx.fillRect(cx + i * 3, px(CEILING) + 6, 2, 1);
  }

  // La scia dietro, che pulsa. Serve a dire **quanto va veloce**: senza, un cuneo che attraversa lo
  // schermo in tre secondi si legge come un cuneo che scivola.
  if (!calm) {
    const soffio = 2 + Math.round(1.5 + 1.5 * Math.sin(_now * 22));
    ctx.fillStyle = PAINT.meltGlow;
    ctx.fillRect(coda + (verso > 0 ? 0 : -soffio), midY - 1, soffio, 2);
    ctx.fillStyle = PAINT.meltHot;
    ctx.fillRect(coda + (verso > 0 ? 0 : -Math.max(1, soffio - 2)), midY,
      Math.max(1, soffio - 2), 1);
  }
}

/**
 * La Pinza: un braccio che esce dal metallo e una ganascia che si apre e si chiude.
 *
 * **Il braccio parte sempre dal pelo della colata**, e la sua lunghezza è la distanza fino alla
 * ganascia: così quello che si vede è una cosa sola che esce, non una ganascia che vola con un
 * bastone sotto. Segue anche il gonfiore della superficie, perché il punto da cui esce è metallo
 * liquido e non un pavimento.
 *
 * La ganascia si **chiude quando prende**. È l'unico modo che ha per dire che ti ha preso prima che
 * tu senta di non poterti muovere: aperta cerca, chiusa tiene, e la differenza si legge da lontano
 * quanto la differenza fra un'ala alzata e una abbassata.
 */
function _paintClaw(ctx, claw, cx) {
  const base = px(MELT) + _swell(cx, _now);
  const cima = px(claw.y);
  if (cima >= base) return;

  const tiene = claw.state === "tiene";
  const mezzo = Math.round(px(CLAW.w) / 2);

  // Il braccio: due colonne di metallo con un filo chiaro fra loro. Due e non una, perché una sola
  // a questa scala è un filo e un filo non tira niente.
  for (let y = cima; y < base; y += 1) {
    ctx.fillStyle = PAINT.hullDark;
    ctx.fillRect(cx - 3, y, 6, 1);
    ctx.fillStyle = PAINT.hull;
    ctx.fillRect(cx - 2, y, 4, 1);
    ctx.fillStyle = PAINT.hullLit;
    ctx.fillRect(cx - 1, y, 1, 1);
  }

  // Le due ganasce, che si aprono e si chiudono. Aperte puntano in fuori, chiuse si toccano.
  const apertura = tiene ? 2 : mezzo;
  for (const verso of [-1, 1]) {
    for (let i = 0; i < 9; i += 1) {
      const alto = Math.round(i * 0.9);
      const x = cx + verso * (1 + Math.round((apertura * i) / 8));
      // Un contorno scuro attorno a ogni segmento: la ganascia si chiude **sopra** un corpo
      // disegnato a mano, e senza un bordo si perde dentro le piume. È lo stesso motivo per cui il
      // metallo ha un filo scuro sul pelo.
      ctx.fillStyle = PAINT.hullDark;
      ctx.fillRect(x - 1, cima - alto - 4, 4, 5);
      ctx.fillStyle = i > 5 ? PAINT.hullLit : PAINT.hull;
      ctx.fillRect(x, cima - alto - 3, 2, 3);
    }
  }

  // Il punto da cui esce, rovente: il metallo si apre per farla passare.
  ctx.fillStyle = PAINT.meltHot;
  ctx.fillRect(cx - 5, base - 2, 10, 2);
  ctx.fillStyle = PAINT.meltFlash;
  ctx.fillRect(cx - 3, base - 1, 6, 1);
}

function _paintPilot(ctx, pilot, cx) {
  const { rows: sprite, anchor, eye } = _frameOf(pilot);
  const flip = pilot.facing < 0;
  const left = cx - px(SPRITE.w) / 2;
  // **Lo sprite si appoggia per i piedi, non si centra sul corpo.** Il fondo della scatola di
  // collisione è dove il dodo sta in piedi — è lì che il terreno lo ferma — quindi la riga più
  // bassa che il disegno usa deve cadere esattamente lì. Centrandolo, i piedi finivano cinque
  // pixel dentro la piattaforma, perché la scatola è grande quanto il torso e il disegno quanto
  // tutta la bestia.
  //
  // Lo scarto lo calcola il convertitore e lo esporta come `lift`, invece di rifarlo qui: è lo
  // stesso numero da cui discende `lanceRise`, e due copie di quel numero sposterebbero la regola
  // del duello senza che niente a schermo lo dica. `PILOT.h` è un multiplo di quattro apposta —
  // metà scatola in pixel di schermo dev'essere intera, o il personaggio finirebbe a mezzo pixel.
  const top = px(pilot.y) + PILOT_SPRITES.lift;

  // The spawn guard, as a ring **outside** the drawing. It was a rectangle first, sized to the
  // collision box, and it cut straight across the dodo — a box drawn over a character reads as
  // damage, not as protection. A circle placed clear of the sprite reads as a shield around it.
  //
  // Plotted pixel by pixel rather than with `arc()`: the canvas would antialias it, and one soft
  // shape among hard ones is the single thing that gives a pixel field away.
  if (pilot.guard > 0 && (calm || Math.floor(pilot.guard * 7) % 2 === 0)) {
    // Solid, and it blinks. A dashed version came first, with the dashes turning as the guard ran
    // down, and it looked broken rather than deliberate: the midpoint algorithm does not plot pixels
    // at an even angular rate, so equal slices of angle come out as very unequal dashes.
    ctx.fillStyle = PAINT.accent;
    const r = Math.round(Math.hypot(px(SPRITE.w), px(SPRITE.h)) / 2) + 2;
    const midX = cx;
    const midY = px(pilot.y);
    let x = r;
    let y = 0;
    let err = 1 - r;
    while (x >= y) {
      for (const [dx, dy] of [[x, y], [y, x], [-y, x], [-x, y],
                              [-x, -y], [-y, -x], [y, -x], [x, -y]]) {
        ctx.fillRect(midX + dx, midY + dy, 1, 1);
      }
      y += 1;
      err += err < 0 ? 2 * y + 1 : 2 * (y - (x -= 1)) + 1;
    }
  }

  // Prima del corpo, così il segno esce da dietro l'elmo invece di stendersi sulla faccia del
  // cavaliere.
  //
  // È così che si trova il proprio uccello quando il campo si riempie, ed è anche la prima delle tre
  // differenze che il piano chiede: le classi si distinguono per **forma**, mai per colore, perché
  // la classe decide se quel nemico lo puoi affrontare e chi non separa due tinte starebbe leggendo
  // una monetina.
  _paintMark(ctx, pilot, sprite, anchor, sprite[0].length, left, top, flip);

  // **Il nemico è lo stesso disegno di un altro colore.** La tavolozza gliela dà la sua classe, e
  // la classe la prende dal nome di un uovo: il colore vero lo misura il convertitore sul disegno
  // dell'uovo, non è scritto da nessuna parte a mano. Se manca — una classe senza tinta, un uovo
  // non ancora disegnato — si ricade su quella del cavaliere, che è sempre giusta.
  const tavolozza = (pilot.foe && TINTE[(KINDS[pilot.kind] || {}).tinta]) || PALETTE;
  each(sprite, flip, (x, y, index) => {
    ctx.fillStyle = tavolozza[index] || PAINT.ink;
    ctx.fillRect(left + x, top + y, 1, 1);
  });

  _paintBlink(ctx, pilot, sprite, eye, left, top, flip);

  // **Lo scudo sopra il dodo, non dietro.** Dietro sembrava la scelta giusta — «il personaggio deve
  // restare leggibile» — e a schermo dava l'effetto opposto: un uccello con le ali aperte è largo
  // quanto l'ellisse, quindi ne copriva quasi tutto il giro e quello che si vedeva erano i quattro
  // pezzi che sbucavano ai lati. Sopra, la corona si vede intera e copre soltanto il contorno, che
  // è la parte del disegno che porta meno informazione.
  if (pilot.shield > 0) _paintShield(ctx, pilot, cx);

  // No mark is painted over the lance. There was a green tick here — a cross at the tip, meant to
  // show the height the fight compares — and it was wrong twice: it sat on top of hand-drawn art in
  // a colour the art does not contain, and it made a cross out of a lance. The drawing already ends
  // in a pale tip, and `test/physics.mjs` holds that tip to within a pixel of where the rules read
  // it, which is the same guarantee without the paint.
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function setCalm(value) {
  calm = !!value;
}

// The three crests, as columns of pixels rising from the helmet. Each entry is the height of one
// column, left to right, so a class is a **profile** and not a colour.
//
// That is the site's rule about charts — colour never carries information on its own — and here it
// is also plain good sense: the class is what tells you whether you can take a foe on, so a player
// who cannot separate two hues would be guessing at the only decision the game asks for. Read them
// in greyscale and they are still a bump, a fork and a spike.
// Measured against the screen rather than chosen on paper: the first set was three pixels wide and
// two tall, which at the field's scale is a speck sitting on a helmet — there, and not seen.
// Le altezze sono **dimezzate** rispetto a prima, e la ragione è che prima il cimiero *era* il
// pennacchio: il disegno non ne aveva uno, quindi poteva essere alto sette pixel senza dare
// fastidio a nessuno. Adesso il pennacchio ce l'ha l'autore, e sette pixel di cimiero accanto
// sarebbero un secondo pennacchio più alto del primo. Tre bastano: le tre forme restano
// distinguibili — una gobba, due corna, una punta — che è tutto quello che devono fare.
const CRESTS = {
  deriva:  [1, 2, 1],           // una gobbetta bassa: quello che sta appena badando
  segugio: [3, 0, 3],           // due corna con lo stacco in mezzo
  vertice: [1, 4, 1],           // una punta sola
};

// Il segno del giocatore: una gobba come quella della deriva, ma nel verde del gioco. La forma non
// deve dire niente — chi lo porta lo sa già — deve solo essere piccola e trovarsi al volo.
const PLAYER_MARK = [1, 2, 1];

/**
 * Il cimiero: dice **di chi è** l'uccello, e se è un nemico anche **che classe** è.
 *
 * Un colore solo per le tre classi, preso dall'uccello stesso, così le tre differiscono solo per
 * profilo; il giocatore ha la stessa gobba nel verde del gioco.
 *
 * The Vertice's crest also carries its window. While it is bursting the spike stands a pixel
 * higher; through the seconds afterwards, when it cannot gain height, the spike **folds flat** —
 * and that is the moment it can be beaten. A rule nobody can see is a rule nobody can play against,
 * and this one is the reason the late game is winnable at all.
 */
function _paintMark(ctx, pilot, sprite, anchor, width, left, top, flip) {
  const shape = pilot.foe ? CRESTS[pilot.kind] : PLAYER_MARK;
  if (!shape) return;

  // **Sull'elmo, non sopra il pennacchio.** L'ancora è la punta del pennacchio dipinto — è il pixel
  // più alto del disegno — e per un pomeriggio il segno è stato piantato lì sopra: un secondo
  // pennacchio, staccato, alto fino a sette pixel sopra il primo. Due pennacchi sono uno di troppo,
  // e quello di troppo era il nostro.
  //
  // L'elmo sta **davanti** al pennacchio, perché il cavaliere guarda avanti e il pennacchio gli cade
  // dietro. Quindi si va di qualche colonna in avanti e si sale finché c'è disegno: si atterra sulla
  // calotta, dove un cimiero ci starebbe davvero, e il pennacchio dell'autore resta intatto.
  // Come si trova la calotta senza scrivere una colonna a mano: si va in avanti dall'ancora e in
  // ogni colonna si guarda **quanto in basso comincia il disegno**. Sopra il pennacchio comincia
  // subito, all'altezza dell'ancora; passato il pennacchio comincia più giù, perché lì il profilo è
  // quello dell'elmo. La prima colonna che comincia almeno quattro pixel più in basso è la calotta.
  //
  // Misurato su questo cavaliere: le colonne 25, 26 e 27 cominciano ancora alle righe 2 e 4 — sono
  // il bordo del pennacchio — e la 28 comincia alla 5, che è l'elmo. Piantarci sopra il cimiero
  // senza questa ricerca lo lasciava appeso in cima al pennacchio, che è il difetto da cui si è
  // partiti.
  const dentro = flip ? -1 : 1;
  const cima = (x) => {
    for (let y = 0; y < sprite.length; y += 1) {
      const ch = (sprite[y] || "")[x];
      if (ch !== undefined && ch !== ".") return y;
    }
    return -1;
  };
  let cx = -1;
  let cy = -1;
  for (let d = 2; d <= 12; d += 1) {
    const x = anchor[0] + dentro * d;
    const y = cima(x);
    if (y >= anchor[1] + 4) { cx = x; cy = y; break; }
  }
  if (cx < 0) return;

  const ax = left + (flip ? width - 1 - cx : cx);
  const ay = top + cy;

  ctx.fillStyle = pilot.foe ? PAINT.crest : PAINT.reach;
  shape.forEach((tall, i) => {
    if (tall <= 0) return;
    let height = tall;
    if (pilot.burst > 0) height += 1;
    if (pilot.spent > 0) height = Math.min(height, 1);
    ctx.fillRect(ax - 1 + i, ay - height, 1, height);
  });
}

/**
 * The mark at the lance tip: the height the fight compares, drawn where it actually is.
 *
 * The plan asks for this and warns about it in the same breath — it is the kind of help that can
 * ruin the picture. Three things keep it from doing so.
 *
 * It is **short and it is at the tip**, not a rule across the field: a line spanning the screen
 * would be easier to compare and would turn the field into graph paper. It sits at the end of the
 * lance, so the eye reads it as part of the weapon rather than as an overlay.
 *
 * It is **dim for a foe and bright for you**, and that is the only place colour is used — but it is
 * not carrying the information. The information is the mark's *height*; the colour only says whose
 * it is, which the crest on the helmet already says too.
 *
 * And it does **not** touch the artwork: it starts one pixel past the drawn tip and runs outward.
 * The earlier attempt at showing this rule painted a green cross on top of the lance, in a colour
 * the drawing does not contain, and made a crucifix out of a weapon.
 */
function _paintReach(ctx, body, cx) {
  // Four buffer pixels, which is eight on a screen at the usual scale. Two was the first try and it
  // was measured against the wrong thing: legible in a magnified capture, and a speck in the game.
  // Any longer and it stops reading as the end of the lance and starts reading as a ruler.
  const LONG = 4;
  const back = body.facing < 0 ? -1 : 1;

  // Read from `lanceTip`, the same function the fight reads, rather than from `lanceRise` again.
  // The mark's whole job is to say where the rule is looking, so a mark computed separately is one
  // refactor away from being a lie — and a lie of that kind is worse than no help at all, because
  // the player would trust it.
  const tip = lanceTip(body);
  const y = px(tip.y);
  const from = cx + px(tip.x - body.x) + (back < 0 ? -LONG - 1 : 1);

  ctx.fillStyle = body.foe ? PAINT.reachFoe : PAINT.reach;
  ctx.fillRect(from, y, LONG, 1);
}

/** Kept so the caller does not have to know the palette moved. Nothing to re-read any more. */
export function refresh() {}

/**
 * Dove cade sul campo un punto dello schermo, in unità di mondo.
 *
 * Serve al comando a tocco: premere gira il dodo verso il lato in cui si è premuto, e per sapere
 * quale sia bisogna riportare il dito dentro le coordinate del gioco. È l'inverso esatto del
 * `drawImage` in fondo a `draw`, e sta qui per la stessa ragione per cui `lift` sta in sprites.js:
 * la matematica del riquadro esiste in un punto solo. Una seconda copia diverge il giorno in cui la
 * scala cambia — ed è già cambiata una volta, da intera a frazionaria.
 *
 * Si divide per `frame.w` e non per `frame.scale`: la larghezza è arrotondata a un numero intero di
 * pixel, la scala no, e chi torna indietro deve usare la misura che è stata davvero disegnata.
 */
export function where(canvas, clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const frame = _frame(canvas);
  const x = ((clientX - box.left) * (canvas.width / box.width) - frame.x) * BUF.w / frame.w;
  const y = ((clientY - box.top) * (canvas.height / box.height) - frame.y) * BUF.h / frame.h;
  return { x: x * PIXEL, y: y * PIXEL };
}

export function fit(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(box.width * ratio));
  canvas.height = Math.max(1, Math.round(box.height * ratio));
}

export function draw(canvas, world) {
  const ctx = _buffer();
  _now = world.time || 0;

  ctx.fillStyle = PAINT.bg;
  ctx.fillRect(0, 0, BUF.w, BUF.h);

  _paintCeiling(ctx);

  // **Chi sta affondando va dipinto prima del metallo**, e solo per questo: è la colata che lo
  // nasconde, un pixel alla volta, invece di un ritaglio che lo accorcia — che è la differenza fra
  // qualcosa che sprofonda e qualcosa che si consuma. Vale per le celle e per i corpi in fiamme, e
  // vale **solo** per chi affonda: chi sta ancora cadendo si dipinge più sotto, davanti ai ripiani,
  // o passerebbe dietro le piattaforme come un fantasma.
  const celleGiu = (world.celle || []).filter((c) => c.alive && c.sinking);
  const pyresGiu = (world.pyres || []).filter((p) => p.sinking);
  const testeGiu = (world.teste || []).filter((t) => t.sinking);
  for (const cella of celleGiu) _wrapped(px(cella.x), (x) => _paintCella(ctx, cella, x));
  for (const pyre of pyresGiu) _wrapped(px(pyre.x), (x) => _paintPyre(ctx, pyre, x));
  for (const testa of testeGiu) _wrapped(px(testa.x), (x) => _paintHeadOnly(ctx, testa, x));

  _paintMelt(ctx, world.time || 0, world.frenesia || 0);

  // E le fiamme dopo, che devono stare **sopra** la colata: è la colata che si sta prendendo
  // qualcosa, e le fiamme di quel qualcosa non devono finirci sotto.
  // **Lo stesso fuoco per tutt'e due.** Una cella e un corpo che affondano nel metallo stanno
  // vivendo la stessa cosa, e disegnarla in due modi avrebbe detto che sono due cose. Cambia solo
  // quanto è largo il buco che stanno facendo.
  for (const cella of celleGiu) {
    _wrapped(px(cella.x), (x) => _paintSinkFire(ctx, x, px(CELLA.w), cella.from * 0.7));
  }
  for (const pyre of pyresGiu) {
    _wrapped(px(pyre.x), (x) => _paintSinkFire(ctx, x, px(PILOT.w), pyre.phase || 0, pyre.mine));
  }
  for (const testa of testeGiu) {
    _wrapped(px(testa.x), (x) => _paintSinkFire(ctx, x, px(HEAD.w), testa.phase || 0, testa.mine));
  }

  const gone = world.removed || [];
  for (const deck of PLATFORMS) {
    if (gone.includes(deck.id)) continue;
    _paintDeck(ctx, deck);
  }

  // Le celle che stanno ancora cadendo o sono posate, davanti ai ripiani.
  for (const cella of world.celle || []) {
    if (!cella.alive || cella.sinking) continue;
    _wrapped(px(cella.x), (x) => _paintCella(ctx, cella, x));
  }

  // I corpi in fiamme sotto tutti quelli che volano ancora: sono usciti dal gioco, e non devono
  // coprire un nemico vivo nel momento in cui gli voli addosso.
  for (const pyre of world.pyres || []) {
    if (pyre.sinking) continue;
    _wrapped(px(pyre.x), (x) => {
      _paintPyre(ctx, pyre, x);
      _paintPyreFlames(ctx, pyre, x);
      if (pyre.bleeding) _paintNeck(ctx, pyre, x);
    });
  }

  for (const testa of world.teste || []) {
    if (testa.sinking) continue;
    _wrapped(px(testa.x), (x) => _paintRolling(ctx, testa, x));
  }

  // Foes first, so that when two bodies overlap in a pass the player's own is the one on top and
  // still readable. Which of the two is drawn over the other decides what you can see at exactly
  // the moment the only rule of the game is being applied.
  for (const body of [...(world.foes || []), ...world.pilots]) {
    if (!body.alive) continue;
    _wrapped(px(body.x), (x) => _paintPilot(ctx, body, x));
  }

  // La Pinza sopra i corpi: tiene qualcuno, e una presa dietro a chi tiene non è una presa.
  if (world.claw && world.claw.state !== "sotto") {
    _wrapped(px(world.claw.x), (x) => _paintClaw(ctx, world.claw, x));
  }

  // Gli Intrusi sopra le cavalcature: attraversano le piattaforme e vanno più veloci di tutto il
  // resto, e una cosa che passa davanti si legge come una cosa che passa davanti.
  for (const intruso of world.intrusi || []) {
    _wrapped(px(intruso.x), (x) => _paintIntruder(ctx, intruso, x));
  }

  // The marks last, over everyone: a rule you cannot read while it happens is unfair with correct
  // code behind it.
  for (const body of [...(world.foes || []), ...world.pilots]) {
    if (!body.alive) continue;
    _wrapped(px(body.x), (x) => _paintReach(ctx, body, x));
  }

  // I premi sopra tutto quello che si muove, e sotto la barra: sono il tramite fra le due cose —
  // un numero che nasce in campo e finisce nel totale in cima.
  _paintPops(ctx, world);

  _paintHud(ctx, world);

  // ---- and up onto the screen ------------------------------------------------------------------
  const out = canvas.getContext("2d");
  const frame = _frame(canvas);

  // **La scossa, e solo qui.** Si scuote il fotogramma finito, non quello che c'è dentro: dentro è
  // tutto su una griglia di numeri interi, e spostare i corpi uno a uno di una frazione di pixel
  // sarebbe la stessa cosa che ammorbidire i bordi. Fuori invece si sposta l'immagine intera, di
  // un numero intero di pixel di campo, e il pixel resta un pixel.
  //
  // Il tremolio viene da `world.shake`, che scorre col mondo: lo stesso seme trema uguale. E si
  // spegne con «meno movimento» — è l'unica cosa in questo file che lo fa scomparire del tutto,
  // perché è l'unica che muove **tutto** lo schermo.
  let tremaX = 0;
  let tremaY = 0;
  if (!calm && world.shake > 0) {
    const forza = Math.min(1, world.shake / IMPACT.deathShake);
    tremaX = Math.round(Math.sin(world.shake * 96) * IMPACT.sway * forza) * frame.scale;
    tremaY = Math.round(Math.cos(world.shake * 71) * IMPACT.sway * forza) * frame.scale;
  }

  out.imageSmoothingEnabled = false;
  out.fillStyle = PAINT.bg;
  out.fillRect(0, 0, canvas.width, canvas.height);
  out.drawImage(buffer, 0, 0, BUF.w, BUF.h,
    frame.x + tremaX, frame.y + tremaY, frame.w, frame.h);
}
