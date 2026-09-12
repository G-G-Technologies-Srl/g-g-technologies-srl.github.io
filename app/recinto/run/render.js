// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The canvas, and only the canvas. Nothing here decides anything about the game: it is handed a
// world and it draws it, which is the other half of the bargain that lets `game.js` be tested
// under Node.
//
// The field is 1024 × 768 of its own units whatever the window is doing, so this file letterboxes
// and never stretches. A playfield that stretched would hand a wide monitor more room to manoeuvre
// than a phone, and the high score table would be comparing different games.
//
// Colours come from the stylesheet rather than from here, so the light and the dark theme are one
// repaint and not a second palette to keep in step.

import { FIELD, LATTICE } from "./game.js";

let palette = null;

// La scia delle Scintille. Sta **qui** e non nel mondo di proposito: è decorazione, non regola —
// serve a far vedere da che parte stanno arrivando — e una cosa che non decide niente non deve
// finire in un salvataggio, in una ripetizione o in un test.
let tails = [];

// «Meno movimento», chiesto al sistema operativo e non a questo gioco. Il foglio di stile lo
// rispettava già per l'animazione del gettone, ma il canvas non è governato dal CSS: la fiamma
// pulsava, i raggi tremolavano e il marcatore in attesa lampeggiava lo stesso — cioè proprio le
// tre cose che si muovono di più, spente ovunque tranne dove sono.
//
// Quello che si spegne è il **battito**, non la forma: i raggi restano, di lunghezze diverse, e
// smettono di cambiare; l'alone resta, e smette di respirare. Niente sparisce, perché quelle forme
// sono lì per farsi vedere e chi ha chiesto meno movimento non ha chiesto di vedere meno.
let calm = false;

export function motion(reduce) {
  calm = Boolean(reduce);
  return calm;
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   v i e w
// -----------------------------------------------------------------------------------------------------------------

export function resize(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(box.width * ratio));
  canvas.height = Math.max(1, Math.round(box.height * ratio));
}

export function repalette(canvas) {
  const style = getComputedStyle(canvas);
  const read = (name) => style.getPropertyValue(name).trim();
  palette = {
    outside: read("--outside"),
    claimed: read("--claimed"),
    open: read("--open"),
    wall: read("--wall"),
    edge: read("--edge"),
    cut: read("--cut"),
    burnt: read("--burnt"),
    fuse: read("--fuse"),
    spark: read("--spark"),
    marker: read("--marker"),
    thread: read("--thread"),
    ghost: read("--ghost"),
  };
}

// The transform, exported because `input.js` has to run it backwards to turn a tap into a place on
// the field. One definition, used in both directions.
//
// **Su una finestra più alta che larga il campo si gira di novanta gradi**, e questa è tutta la
// risposta al campo piccolo sui telefoni. Le misure del campo non si toccano — sono quelle su cui
// la classifica confronta partite diverse, ed è la ragione per cui non si stira per riempire — ma
// una rotazione non è uno stiramento: è un'**isometria**. Stesse aree, stesse distanze, stessi
// angoli, stesso gioco, tenuto di traverso. Su un telefono da 360×740 il campo passa da 360×270 a
// 360×480: il settantotto per cento in più, senza che una riga di `game.js` se ne accorga.
//
// Ne segue che anche i comandi girano, e `input.js` li gira: su schermo «giù» deve restare giù.
export function view(canvas) {
  const turned = canvas.height > canvas.width;
  const wide = turned ? FIELD.h : FIELD.w;
  const high = turned ? FIELD.w : FIELD.h;
  const scale = Math.min(canvas.width / wide, canvas.height / high);
  return {
    turned,
    scale,
    ox: (canvas.width - wide * scale) / 2,
    oy: (canvas.height - high * scale) / 2,
  };
}

export function toLattice(canvas, clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const v = view(canvas);
  const x = ((clientX - box.left) * ratio) - v.ox;
  const y = ((clientY - box.top) * ratio) - v.oy;
  if (v.turned) {
    return [Math.round(y / v.scale / LATTICE), Math.round((FIELD.h - x / v.scale) / LATTICE)];
  }
  return [Math.round(x / v.scale / LATTICE), Math.round(y / v.scale / LATTICE)];
}

// -----------------------------------------------------------------------------------------------------------------
//  d r a w
// -----------------------------------------------------------------------------------------------------------------

export function draw(canvas, world, { preview = null, fuse = null } = {}) {
  const ctx = canvas.getContext("2d");
  if (!palette) repalette(canvas);
  const v = view(canvas);
  const unit = LATTICE * v.scale;

  ctx.fillStyle = palette.outside;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // What is yours is the arena minus what is still open, drawn in that order and subtracted by the
  // even-odd rule.
  //
  // **Only the outer wall of the arena, never its islands.** An island is a hole in the open field,
  // which is to say it is ground that was yours before the game started — and passing the whole
  // outline here would punch it out and paint it the colour of the world outside the arena. It read
  // as a pit in the middle of the field, which is the opposite of what it is.
  _fill(ctx, v, unit, [world.outline[0]], palette.claimed);
  const open = [];
  for (const face of world.faces) open.push(...face.rings);
  _fill(ctx, v, unit, open, palette.open);

  _stroke(ctx, v, unit, [world.outline[0]], palette.wall, 1.5, 0);
  for (const face of world.faces) _stroke(ctx, v, unit, face.rings, palette.edge, 2, 10);

  if (preview && preview.path && preview.path.length > 1) {
    _line(ctx, v, unit, preview.path, palette.ghost, 1.5, 0, [6, 6]);
  }
  if (world.cut) _cut(ctx, v, unit, world.cut, fuse);
  if (world.cut && fuse) _burning(ctx, v, unit, fuse, world.cut.fuse);

  _trails(world);
  world.sparks.forEach((spark, i) => _spark(ctx, v, unit, spark, tails[i] || []));
  for (const thread of world.threads) _ribbon(ctx, v, unit, thread, palette.thread);
  // In attesa il marcatore pulsa: il controllo non è tuo e va detto senza scrivere una parola.
  if (world.waiting > 0) ctx.globalAlpha = calm ? 0.5 : 0.35 + 0.4 * Math.abs(Math.sin(world.waiting * 9));
  _marker(ctx, v, unit, world.marker.at, world.cut ? palette.cut : palette.marker);
  ctx.globalAlpha = 1;
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _at(v, unit, point) {
  if (v.turned) {
    return [v.ox + (FIELD.h / LATTICE - point[1]) * unit, v.oy + point[0] * unit];
  }
  return [v.ox + point[0] * unit, v.oy + point[1] * unit];
}

function _trace(ctx, v, unit, rings) {
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach((point, i) => {
      const [x, y] = _at(v, unit, point);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
}

function _fill(ctx, v, unit, rings, colour) {
  _trace(ctx, v, unit, rings);
  ctx.fillStyle = colour;
  ctx.fill("evenodd");
}

function _stroke(ctx, v, unit, rings, colour, width, glow) {
  _trace(ctx, v, unit, rings);
  _pen(ctx, colour, width, glow);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function _line(ctx, v, unit, points, colour, width, glow, dash = null) {
  ctx.beginPath();
  points.forEach((point, i) => {
    const [x, y] = _at(v, unit, point);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.setLineDash(dash || []);
  _pen(ctx, colour, width, glow);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
}

// La linea, in due pezzi: quello che la Miccia ha già mangiato e quello che ti resta. Sono due
// colori e non un'animazione perché è un'informazione, non un effetto — quanta corda hai ancora.
function _cut(ctx, v, unit, cut, fuse) {
  if (!fuse) {
    _line(ctx, v, unit, cut.chain, palette.cut, 2.5, 14);
    return;
  }
  const burnt = [];
  let left = cut.fuse;
  for (let i = 1; i < cut.chain.length; i += 1) {
    burnt.push(cut.chain[i - 1]);
    const span = Math.hypot(cut.chain[i][0] - cut.chain[i - 1][0], cut.chain[i][1] - cut.chain[i - 1][1]);
    if (left < span) break;
    left -= span;
  }
  burnt.push(fuse);

  // La parte mangiata resta visibile e resta leggibile — è l'informazione «quanta corda hai ancora»
  // — ma sottile: è cenere, non linea.
  _line(ctx, v, unit, burnt, palette.burnt, 1.5, 0);
  _line(ctx, v, unit, [fuse].concat(cut.chain.slice(burnt.length - 1)), palette.cut, 2.5, 14);
}

// Un numero fra 0 e 1 che dipende solo da quello che gli si passa. Serve alla fiamma per tremolare
// senza che il disegno smetta di essere **una funzione del mondo**: lo stesso mondo torna a disegnare
// lo stesso fotogramma, e lo screenshot della scheda resta lo stesso a ogni build. Con `Math.random`
// la fiamma sarebbe più facile e quella proprietà sparirebbe.
function _wobble(seed) {
  const x = Math.sin(seed * 127.1 + 11.7) * 43758.5453;
  return x - Math.floor(x);
}

function _trails(world) {
  if (tails.length !== world.sparks.length) tails = world.sparks.map(() => []);
  world.sparks.forEach((spark, i) => {
    const tail = tails[i];
    const last = tail[tail.length - 1];
    if (last && last[0] === spark.at[0] && last[1] === spark.at[1]) return;
    tail.push(spark.at.slice());
    if (tail.length > 9) tail.shift();
  });
}

// La Scintilla. Prima era un puntino di tre pixel appoggiato sopra la linea del bordo, che è la cosa
// più luminosa dello schermo: il contrasto col campo andava benissimo e non si vedeva lo stesso,
// perché competeva con un muro acceso. Adesso ha tre cose che il puntino non aveva — una **scia**
// che dice da che parte arriva, un **cuore bianco** che non è del colore di nient'altro, e dei
// **raggi** che tremolano e che rompono la linea invece di starci sopra.
function _spark(ctx, v, unit, spark, tail) {
  const [x, y] = _at(v, unit, spark.at);
  const size = Math.max(3.5, unit * 1.5);

  tail.forEach((point, i) => {
    ctx.globalAlpha = ((i + 1) / (tail.length + 2)) * 0.55;
    _dot(ctx, v, unit, point, palette.spark, size * 0.5 / (unit / 4), 6);
  });
  ctx.globalAlpha = 1;

  // I raggi: quattro, di lunghezza diversa, e la differenza dipende da dove si trova — così
  // tremolano muovendosi e restano fermi se lei è ferma.
  const heat = calm ? 0 : spark.at[0] * 3 + spark.at[1] * 7;
  ctx.strokeStyle = palette.spark;
  ctx.lineWidth = Math.max(1, 1.4 * (window.devicePixelRatio || 1));
  ctx.shadowBlur = 12;
  ctx.shadowColor = palette.spark;
  ctx.beginPath();
  for (let k = 0; k < 4; k += 1) {
    const angle = (Math.PI / 2) * k + 0.4 + _wobble(heat + k) * 0.5;
    const reach = size * (1.6 + _wobble(heat + k * 7) * 1.6);
    ctx.moveTo(x + Math.cos(angle) * size * 0.5, y + Math.sin(angle) * size * 0.5);
    ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, size * 0.95, 0, Math.PI * 2);
  ctx.fillStyle = palette.spark;
  ctx.fill();

  // Il cuore, bianco: è quello che la distingue dal muro acceso su cui corre.
  ctx.beginPath();
  ctx.arc(x, y, size * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = palette.marker;
  ctx.fill();
  ctx.shadowBlur = 0;
}

// La testa della Miccia, cioè il punto in cui la tua linea sta bruciando adesso.
//
// Tre strati, dal freddo al caldo, più le faville che saltano via: un punto arancione da solo dice
// «qui», e quello che serve dire è «**qui sta bruciando**». Le faville puntano all'indietro, verso
// la parte già mangiata, perché è da lì che la fiamma è arrivata.
function _burning(ctx, v, unit, at, burnt) {
  const [x, y] = _at(v, unit, at);
  const size = Math.max(4, unit * 1.9);
  const beat = calm ? 1 : 0.82 + _wobble(Math.floor(burnt * 6)) * 0.36;

  const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 3.4 * beat);
  halo.addColorStop(0, palette.fuse);
  halo.addColorStop(0.45, palette.cut);
  halo.addColorStop(1, "transparent");
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(x, y, size * 3.4 * beat, 0, Math.PI * 2);
  ctx.fillStyle = halo;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = palette.fuse;
  ctx.lineWidth = Math.max(1, 1.3 * (window.devicePixelRatio || 1));
  ctx.shadowBlur = 14;
  ctx.shadowColor = palette.fuse;
  ctx.beginPath();
  for (let k = 0; k < 5; k += 1) {
    const seed = (calm ? 0 : Math.floor(burnt * 9)) + k * 13;
    const angle = _wobble(seed) * Math.PI * 2;
    const reach = size * (1.4 + _wobble(seed + 3) * 2.2);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, size * beat, 0, Math.PI * 2);
  ctx.fillStyle = palette.fuse;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, size * 0.45 * beat, 0, Math.PI * 2);
  ctx.fillStyle = palette.marker;
  ctx.fill();
  ctx.shadowBlur = 0;
}

// Il Filo: la scia che sbiadisce e sopra il segmento vivo. Quello che si vede è il corpo — non c'è
// una sagoma di collisione diversa da questa, e niente che uccida senza essere stato sullo schermo.
function _ribbon(ctx, v, unit, thread, colour) {
  thread.trail.forEach((pair, i) => {
    ctx.globalAlpha = ((i + 1) / (thread.trail.length + 1)) * 0.5;
    _line(ctx, v, unit, pair, colour, 1.2, 0);
  });
  ctx.globalAlpha = 1;
  _line(ctx, v, unit, [thread.a.at, thread.b.at], colour, 2.4, 18);
}

function _dot(ctx, v, unit, point, colour, radius, glow) {
  const [x, y] = _at(v, unit, point);
  ctx.beginPath();
  ctx.arc(x, y, radius * (unit / 4), 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.shadowBlur = glow;
  ctx.shadowColor = colour;
  ctx.fill();
  ctx.shadowBlur = 0;
}

// Un rombo e non un cerchio: sta su un reticolo e si muove in otto direzioni, e un rombo lo dice.
function _marker(ctx, v, unit, point, colour) {
  const [x, y] = _at(v, unit, point);
  const r = Math.max(4, unit * 1.6);
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.shadowBlur = 18;
  ctx.shadowColor = colour;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function _pen(ctx, colour, width, glow) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, width * (window.devicePixelRatio || 1));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowBlur = glow;
  ctx.shadowColor = colour;
}
