// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The world and one step of it. No canvas, no DOM, no audio, no timers.
//
// That boundary is not tidiness: it is what makes a real-time game testable at all. Everything in
// here is a function of a state and an intent, so `test/rules.mjs` can play a few thousand steps
// under Node and check that the area claimed plus the area still open is always the area the arena
// started with — which is the one thing that, if it ever stopped being true, would mean the
// percentage on the screen is fiction.
//
// Four rules hold the file together:
//
//  - **The intent is a direction and a stroke speed, and nothing else.** Not a target, not a tap
//    position. Pointer and touch are a destination, and turning a destination into a direction is
//    `input.js`' job — which is why aiming with a finger adds no lines to this file and a recorded
//    game is a sequence of directions whatever produced them.
//  - **The step is fixed and small.** One step per frame would tie the game to the refresh rate,
//    and the same game would run faster on a 144 Hz screen with a high score table comparing
//    different games.
//  - **Speed is constant in distance, not in steps.** A diagonal covers √2 and costs √2, so
//    cutting the corner is not a shortcut.
//  - **The chance has a seed, and the seed lives in the world.** Not in a closure: a world has to
//    be copiable, replayable and writable to disk, which is what makes the attract demo
//    reproducible, the screenshot stable and a reported defect playable again.

import { area2, contains, onBoundary, canStep, selfCrosses, split, wallsAt,
         chainMeets, nearestOnBoundary, distanceToSegment, walkRing } from "./geometry.js";
import { arena } from "./arenas.js";

// -----------------------------------------------------------------------------------------------------------------
//  m e a s u r e s
// -----------------------------------------------------------------------------------------------------------------

// The field has measurements of its own, whatever the window is doing. If the playfield stretched
// to fit, a wide monitor would hand out more room than a phone and the high score table would be
// comparing different games. The renderer letterboxes; nothing in here hears about it.
export const FIELD = { w: 1024, h: 768 };
export const LATTICE = 4;
export const GRID = { w: FIELD.w / LATTICE, h: FIELD.h / LATTICE };

export const STEP = 1 / 120;

// Provvisorie, e si tarano giocando: qui c'è solo un fondo ragionevole. Attraversare il campo nel
// lato corto costa 2,7 secondi scoperti col tratto veloce e 5,3 col lento, e il giro completo del
// perimetro nove secondi. I primi numeri scritti erano la metà di questi e il gioco sembrava un
// provino al rallentatore — è il genere di cosa che nessun test dice e che si vede al primo minuto
// con le mani sopra.
export const MARKER = {
  walk: 96,                   // lattice units per second, along the border
  fast: 72,                   // cutting
  slow: 36,                   // cutting slowly — and worth double
};

// Il Filo. Due capi che vanno per conto loro e una scia di quello che il segmento fra loro è stato:
// è così che si contorce senza che nessuno debba animarlo, ed è anche perché **quello che si vede
// uccide** — la scia non è un effetto, è il corpo.
export const THREAD = {
  speed: 68,                  // lattice units per second, the leading end
  lead: 0.82,                 // the other end goes a little slower, which is what makes it writhe

  // La deriva decide quanto il Filo gira il campo, e va bassa e non alta — che è il contrario di
  // quello che sembra. Girata su, la direzione fa una passeggiata a caso, il percorso si arrotola e
  // il Filo serpeggia sul posto per mezzo minuto; girata giù, corre dritto, rimbalza e attraversa.
  // Misurato su quaranta semi, a 0,9 il numero di partite in cui **non trova mai** una linea
  // lasciata fuori è il più basso.
  wander: 0.9,                // rad/s of drift in each end's heading
  spread: 9,                  // how far apart the two ends start
  clearance: 3,               // how far it stays off the walls, so `contains` is never asked about
                              // a point sitting exactly on one

  // Il guinzaglio. Due capi lasciati liberi non si contorcono: divergono, e dopo cinque secondi
  // sono in due angoli opposti del campo con un segmento lungo mezzo schermo in mezzo. Fuori da
  // questa forbice ciascuno viene sterzato verso l'altro o via dall'altro, dentro nessuno tocca
  // niente — ed è nella banda che il Filo fa quello che deve.
  near: 11,
  far: 44,
  tether: 5,                  // rad/s of steering back into the band

  // La scia si campiona, non si prende a ogni passo: a 120 Hz trenta segmenti consecutivi sono lo
  // stesso segmento trenta volte, da disegnare e contro cui collidere.
  every: 4,                   // steps between samples
  trail: 10,                  // samples kept — and every one of them still bites
};

// La Miccia. Non è un secondo nemico: è la regola che rende impossibile «esco di un passo e
// aspetto di vedere cosa fa il Filo», che senza di lei è la strategia ottima e spegne il gioco.
// Brucia solo mentre stai fermo e **non arretra** quando riparti — quello che hai perso è perso.
export const FUSE = {
  grace: 0.35,                // seconds of standing still before it lights
  speed: 26,                  // lattice units per second along your own line
};

// Le Scintille. Corrono sul confine delle facce aperte, cioè esattamente dove cammina il
// marcatore, e ogni conquista riscrive la loro pista insieme al tabellone.
export const SPARK = {
  speed: 30,                  // lattice units per second at the start of a level
  quicken: 1.1,               // extra units per second, for every second the level lasts
  fastest: 110,
  first: 3,                   // seconds of grace at the start of a level
  bite: 1.6,                  // lattice units: near enough is caught
};

export const RULES = {
  lives: 3,
  quota: 0.70,                // of the arena, to clear the level
  quotaStep: 0.02,            // per level
  quotaMax: 0.85,
  capture2: 2 * 700,          // doubled area: a thread shut inside anything smaller is caught
  perCell: 5,
  slowBonus: 2,
  perPointOver: 250,          // per percentage point claimed past the quota
  capture: 3000,
  separation: 5000,

  // Il rientro, e sono due regole che si tengono insieme. Si ricompare **dove il taglio era
  // partito**: è lì che stavi ragionando, e ributtare il marcatore all'inizio dell'arena punirebbe
  // due volte lo stesso errore. Nessuna invulnerabilità — ma il controllo non torna finché il Filo
  // non è lontano, così non esiste la morte che non hai giocato e non esiste nemmeno il secondo
  // gratis che i giocatori userebbero per attraversare.
  pause: 1.1,                 // seconds, at least
  safe: 30,                   // lattice units the Filo must be away before the marker moves again

  // Il secondo Filo. Finché due Fili condividono la stessa faccia si ignorano: quello che cambia è
  // che adesso il taglio che li mette in due regioni diverse esiste, e vale il premio — una mossa
  // che al primo livello non è nemmeno pensabile.
  threadsFrom: 3,             // the level the second one turns up
  threadsMax: 2,

  sparks: 1,                  // at level 1
  sparksEvery: 2,             // one more every this many levels
  sparksMax: 4,
};

export const NO_INTENT = Object.freeze({ dx: 0, dy: 0, slow: false });

// -----------------------------------------------------------------------------------------------------------------
//  t h e   w o r l d
// -----------------------------------------------------------------------------------------------------------------

// `carry` è quello che sopravvive al livello: punti e vite. Senza, ogni livello comincia da zero
// punti e da tre vite — cioè non è un livello, è una partita nuova con un fondale diverso.
export function create(level = 1, seed = 1, carry = null) {
  const plan = arena(level);
  const face = { rings: plan.rings.map((ring) => ring.map((p) => p.slice())) };

  const world = {
    seed: (seed >>> 0) || 1,
    level,
    arena: plan.key,
    faces: [face],
    // L'arena com'era prima che qualcuno la toccasse. Serve al renderer e a nient'altro: quello che
    // è tuo è l'arena meno quello che è ancora aperto, e senza questa riga andrebbe ricostruito.
    outline: plan.rings.map((ring) => ring.map((p) => p.slice())),
    total2: area2(face),
    claimed2: 0,
    marker: { at: plan.start.slice(), travel: 0 },
    cut: null,                // { chain, slow, face } while a line is out
    threads: [],
    sparks: [],
    waiting: 0,
    age: 0,                   // seconds this level has lasted, which is what quickens the Sparx
    tick: 0,
    lives: carry ? carry.lives : RULES.lives,
    score: carry ? carry.score : 0,
    cleared: false,
    over: false,
    separated: false,
    events: [],
  };
  const many = Math.min(RULES.threadsMax, plan.threads.length,
                        world.level >= RULES.threadsFrom ? RULES.threadsMax : 1);
  world.threads = plan.threads.slice(0, many).map((at) => _spawn(world, at));
  world.sparks = _sparksFor(world);
  return world;
}

export function step(world, intent = NO_INTENT) {
  world.events.length = 0;
  if (world.cleared || world.over) return world;

  world.age += STEP;
  _moveThreads(world);
  _moveSparks(world);

  // Dopo una morte tutto continua a girare e il marcatore aspetta. L'attesa finisce quando il tempo
  // minimo è passato **e** il campo è libero: le due condizioni insieme, non una sola.
  if (world.waiting > 0) {
    world.waiting -= STEP;
    if (world.waiting <= 0 && !_roomToBreathe(world)) world.waiting = STEP;
    return world;
  }

  const moved = _moveMarker(world, intent);
  if (world.cut) _burn(world, moved);
  if (world.cleared || world.over) return world;

  if (_touched(world)) { _die(world, "filo"); return world; }
  if (_bitten(world)) { _die(world, "scintilla"); return world; }
  return world;
}

// How much of the arena is claimed, 0 to 1. Both halves are doubled areas, so this is the only
// division in the whole simulation and it happens where a percentage is actually wanted.
export function progress(world) {
  return world.claimed2 / world.total2;
}

// What this level asks for. It climbs and then stops: past a point the last few per cent are not
// harder, only longer.
export function quota(world) {
  return Math.min(RULES.quotaMax, RULES.quota + (world.level - 1) * RULES.quotaStep);
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

// xorshift32. Small, fast, and above all a function of the world rather than of a hidden variable.
function _random(world) {
  let x = world.seed;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;  x >>>= 0;
  world.seed = x;
  return x / 4294967296;
}

function _faceOf(world, point) {
  for (const face of world.faces) if (contains(face, point)) return face;
  return null;
}

function _faceIndexAt(world, point) {
  for (let i = 0; i < world.faces.length; i += 1) {
    if (onBoundary(world.faces[i], point) || contains(world.faces[i], point)) return i;
  }
  return -1;
}

// Which Filo is in this piece, asked of **one end** and not of the middle of its body. The middle
// of a segment whose ends are both inside an L-shaped face can be outside it; an end is inside by
// its own clearance, always. It is the same question `contains` refuses to answer about a point on
// a wall, dodged the same way.
function _threadsIn(world, face) {
  return world.threads.filter((thread) => contains(face, thread.a.at));
}

// -----------------------------------------------------------------------------------------------------------------

// Restituisce se in questo fotogramma il marcatore ha davvero cambiato posto. Non se ce l'ha
// messa, non se il giocatore stava premendo: **se si è mosso**. È quello che la Miccia deve sapere,
// e premere contro un muro è stare fermi quanto non premere niente.
function _moveMarker(world, intent) {
  const { dx, dy } = intent;
  if (dx === 0 && dy === 0) { world.marker.travel = 0; return false; }

  const speed = world.cut ? (world.cut.slow ? MARKER.slow : MARKER.fast) : MARKER.walk;
  const cost = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
  world.marker.travel += speed * STEP;

  // A guard rather than a plain `while`: at these speeds it takes one step or none, and a bug that
  // made the cost zero would otherwise hang the frame instead of showing itself.
  let moved = false;
  for (let guard = 0; guard < 4; guard += 1) {
    if (world.marker.travel < cost) break;
    world.marker.travel -= cost;
    if (!_take(world, intent)) { world.marker.travel = 0; break; }
    moved = true;
    if (world.cleared || world.over) break;
  }
  return moved;
}

// One lattice step, or a refusal. Everything the marker can do is one of five outcomes, and which
// one it is comes back from `canStep` — the same call the pointer's preview uses, so the line the
// player is shown and the line the marker walks cannot drift apart.
function _take(world, intent) {
  const from = world.marker.at;
  const to = [from[0] + intent.dx, from[1] + intent.dy];

  const index = world.cut ? world.cut.face : _faceIndexAt(world, from);
  if (index < 0) return false;
  const face = world.faces[index];

  if (world.cut) {
    if (selfCrosses(world.cut.chain, to)) return false;
    const kind = canStep(face, from, to);
    if (kind !== "open" && kind !== "close") return false;
    world.cut.chain.push(to);
    world.cut.length += _cost(intent);
    world.marker.at = to;
    if (kind === "close") _close(world);
    return true;
  }

  const kind = canStep(face, from, to);
  if (kind === "walk") { world.marker.at = to; return true; }
  if (kind !== "open" && kind !== "close") return false;

  // Non si stacca da dove due pareti si toccano, per la stessa ragione per cui non ci si chiude:
  // lì «da quale anello sono partito» non ha risposta. `canStep` guarda dove il passo **arriva** e
  // non poteva saperlo — è questo il posto che sa che quel passo è l'inizio di un taglio.
  // Camminarci sopra resta libero, ed è come si esce di lì.
  if (wallsAt(face, from) > 1) return false;

  // The stroke speed is read here and nowhere else: it is a bet placed on the way out, not a dial
  // turned while the line is already exposed.
  world.cut = {
    chain: [from.slice(), to],
    slow: Boolean(intent.slow),
    face: index,
    length: _cost(intent),    // quanto è lunga la linea, tenuta man mano e non ricontata
    fuse: 0,                  // quanto ne ha già bruciato la Miccia
    still: 0,                 // da quanto il marcatore non si muove
  };
  world.marker.at = to;
  if (kind === "close") _close(world);
  return true;
}

// The rule the whole game comes out of, in the order it reads:
//
//   every piece with no thread in it becomes yours; a piece with a thread in it but smaller than
//   the capture threshold becomes yours too, and that thread is gone.
//
// Splitting two threads apart is not a third case: it falls out of applying the first line twice,
// and all that has to be noticed separately is that the number of pieces holding a thread went up.
function _close(world) {
  const index = world.cut.face;
  const slow = world.cut.slow;
  const before = world.faces.filter((face) => _threadsIn(world, face).length > 0).length;
  const parts = split(world.faces[index], world.cut.chain);

  const kept = [];
  const caught = [];
  let gained = 0;

  for (const part of parts) {
    const inside = _threadsIn(world, part);
    if (inside.length === 0) { gained += area2(part); continue; }
    if (area2(part) <= RULES.capture2) {
      gained += area2(part);
      caught.push(...inside);
      continue;
    }
    kept.push(part);
  }

  world.faces = world.faces.filter((_, i) => i !== index).concat(kept);
  world.threads = world.threads.filter((thread) => !caught.includes(thread));
  world.claimed2 += gained;

  const points = Math.round((gained / 2) * RULES.perCell * (slow ? RULES.slowBonus : 1) * world.level);
  world.score += points + caught.length * RULES.capture;
  world.events.push({ kind: "claim", gained, points, slow, caught: caught.length });

  const after = world.faces.filter((face) => _threadsIn(world, face).length > 0).length;
  if (!world.separated && after > before) {
    world.separated = true;
    world.score += RULES.separation;
    world.events.push({ kind: "separation" });
  }

  world.cut = null;
  _reseat(world);
  if (progress(world) >= quota(world) || world.threads.length === 0 || world.faces.length === 0) {
    const over = Math.max(0, Math.round((progress(world) - quota(world)) * 100));
    world.score += over * RULES.perPointOver;
    world.cleared = true;
    world.events.push({ kind: "cleared", over });
  }
}

// -----------------------------------------------------------------------------------------------------------------

// -----------------------------------------------------------------------------------------------------------------

function _spawn(world, at) {
  const heading = _random(world) * Math.PI * 2;
  const aside = heading + 1.3;
  return {
    a: { at: [at[0], at[1]], heading, speed: THREAD.speed },
    b: {
      at: [at[0] + Math.cos(aside) * THREAD.spread, at[1] + Math.sin(aside) * THREAD.spread],
      heading: aside,
      speed: THREAD.speed * THREAD.lead,
    },
    trail: [],
  };
}

function _moveThreads(world) {
  world.tick = (world.tick + 1) % THREAD.every;
  for (const thread of world.threads) {
    const face = _faceOf(world, thread.a.at);
    if (!face) continue;
    _drift(world, face, thread.a);
    _drift(world, face, thread.b);
    _tether(thread);
    if (world.tick !== 0) continue;
    thread.trail.push([thread.a.at.slice(), thread.b.at.slice()]);
    if (thread.trail.length > THREAD.trail) thread.trail.shift();
  }
}

// Keeps the two ends within a band of each other by steering, never by moving them: a Filo yanked
// into place would jump, and a Filo that is steered swims.
function _tether(thread) {
  const dx = thread.b.at[0] - thread.a.at[0];
  const dy = thread.b.at[1] - thread.a.at[1];
  const gap = Math.hypot(dx, dy);
  const pull = gap > THREAD.far ? 1 : (gap < THREAD.near ? -1 : 0);
  if (pull === 0) return;

  const towards = Math.atan2(dy, dx);
  const turn = THREAD.tether * STEP * pull;
  thread.a.heading = _steer(thread.a.heading, towards, turn);
  thread.b.heading = _steer(thread.b.heading, towards + Math.PI, turn);
}

// Rotates a heading towards another by at most `amount`, the short way round, and away from it when
// `amount` is negative.
function _steer(heading, towards, amount) {
  let gap = ((towards - heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return heading + Math.sign(gap) * Math.min(Math.abs(gap), Math.abs(amount)) * Math.sign(amount);
}

// One end, one step. It wanders a little every step — that drift is the whole of the writhing — and
// it bounces off the wall it actually met rather than simply turning round, which is what makes it
// look like it is going somewhere.
function _drift(world, face, end) {
  end.heading += (_random(world) - 0.5) * THREAD.wander * STEP;
  const to = [
    end.at[0] + Math.cos(end.heading) * end.speed * STEP,
    end.at[1] + Math.sin(end.heading) * end.speed * STEP,
  ];
  if (_clearOf(face, to)) { end.at = to; return; }

  const wall = nearestOnBoundary(face, end.at);
  if (!wall || !wall.edge) { end.heading += Math.PI; return; }
  const along = Math.atan2(wall.edge[1][1] - wall.edge[0][1], wall.edge[1][0] - wall.edge[0][0]);
  end.heading = 2 * along - end.heading;
  // Non si muove in questo passo, e va bene: `end.at` non è mai stato in un posto che non andasse,
  // quindi il peggio che può fare è restare fermo un fotogramma con la direzione nuova.
}

// Inside, and no nearer than `clearance` to any wall. That margin is what keeps `contains` from
// ever being asked about a point sitting on a wall — the one question it has no answer to, and the
// question that decides which side of a fresh cut this Filo ended up on.
//
// The first version probed four points at `clearance` north, south, east and west instead of
// measuring. It reads like the same thing and is not: near a corner all four probes can sit inside
// while the corner itself is a tenth of a unit away, which is exactly the promise being broken.
// Measuring is also **cheaper** — one pass over the edges rather than four.
function _clearOf(face, point) {
  if (!contains(face, point)) return false;
  const wall = nearestOnBoundary(face, point);
  return !wall || wall.distance >= THREAD.clearance;
}

// The body: every segment still drawn, the live one last. What you can see is what can kill you —
// there is no invisible hitbox and no lethal thing that was not on the screen.
function _body(thread) {
  return thread.trail.concat([[thread.a.at, thread.b.at]]);
}

// -----------------------------------------------------------------------------------------------------------------

// The whole unfinished line is lethal, not only the end of it where the marker stands. The tail you
// left behind three seconds ago is still yours, and it is still exposed.
function _touched(world) {
  if (!world.cut) return false;
  const box = _boxOf(world.cut.chain);
  for (const thread of world.threads) {
    for (const [a, b] of _body(thread)) {
      // Un rifiuto a buon mercato prima di quello caro: la catena può essere lunga trecento punti,
      // e quasi sempre il Filo non è nemmeno dalle sue parti.
      if (Math.min(a[0], b[0]) > box.x2 || Math.max(a[0], b[0]) < box.x1) continue;
      if (Math.min(a[1], b[1]) > box.y2 || Math.max(a[1], b[1]) < box.y1) continue;
      if (chainMeets(world.cut.chain, a, b)) return true;
    }
  }
  return false;
}

function _boxOf(chain) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of chain) {
    if (x < x1) x1 = x;
    if (x > x2) x2 = x;
    if (y < y1) y1 = y;
    if (y > y2) y2 = y;
  }
  return { x1, y1, x2, y2 };
}

// Libero vuol dire libero da tutto quello che uccide, Scintille comprese — e le Scintille contano
// più del Filo, perché il marcatore ricompare **sul bordo**, cioè proprio sulla loro pista.
function _roomToBreathe(world) {
  for (const thread of world.threads) {
    if (distanceToSegment(world.marker.at, thread.a.at, thread.b.at) < RULES.safe) return false;
  }
  for (const spark of world.sparks) {
    if (Math.hypot(spark.at[0] - world.marker.at[0], spark.at[1] - world.marker.at[1]) < RULES.safe) {
      return false;
    }
  }
  return true;
}

function _cost(intent) {
  return intent.dx !== 0 && intent.dy !== 0 ? Math.SQRT2 : 1;
}

// -----------------------------------------------------------------------------------------------------------------

// La Miccia brucia solo da fermi, riparte da dove era arrivata e non torna mai indietro. Il minimo
// di grazia serve perché un fotogramma di esitazione non è stare fermi — e perché a 120 Hz il
// marcatore cambia posto ogni due passi anche mentre corre.
function _burn(world, moved) {
  const cut = world.cut;
  if (moved) { cut.still = 0; return; }

  cut.still += STEP;
  if (cut.still < FUSE.grace) return;

  cut.fuse += FUSE.speed * STEP;
  if (cut.fuse >= cut.length) _die(world, "miccia");
}

// Dove è arrivata la Miccia, come punto: serve al disegno, e il disegno è l'unico posto che ne ha
// bisogno — la regola sa già rispondere confrontando due lunghezze.
export function fuseAt(world) {
  if (!world.cut || world.cut.fuse <= 0) return null;
  const chain = world.cut.chain;
  let left = world.cut.fuse;
  for (let i = 1; i < chain.length; i += 1) {
    const dx = chain[i][0] - chain[i - 1][0];
    const dy = chain[i][1] - chain[i - 1][1];
    const span = Math.hypot(dx, dy);
    if (left < span) {
      const k = left / span;
      return [chain[i - 1][0] + dx * k, chain[i - 1][1] + dy * k];
    }
    left -= span;
  }
  return chain[chain.length - 1].slice();
}

// -----------------------------------------------------------------------------------------------------------------

// Le Scintille corrono sul confine delle facce aperte, srotolato in punti del reticolo: occupano un
// posto dove anche il marcatore potrebbe stare, così «ti ha preso» è un confronto e non una stima.
function _sparksFor(world) {
  const many = Math.min(RULES.sparksMax, RULES.sparks + Math.floor((world.level - 1) / RULES.sparksEvery));
  const track = _trackAt(world, 0, 0);
  const start = _nearestOn(track, world.marker.at);
  const sparks = [];
  for (let k = 0; k < many; k += 1) {
    const away = Math.round(track.length * (k + 1) / (many + 1));
    sparks.push({
      at: track[(start + away) % track.length].slice(),
      forward: k % 2 === 0,
      travel: 0,
      face: 0,
      ring: 0,
      index: (start + away) % track.length,
    });
  }
  return sparks;
}

function _moveSparks(world) {
  if (world.age < SPARK.first) return;
  const speed = Math.min(SPARK.fastest, SPARK.speed + SPARK.quicken * (world.age - SPARK.first));

  for (const spark of world.sparks) {
    const track = _trackFor(world, spark);
    if (!track) continue;
    spark.travel += speed * STEP;
    while (spark.travel >= 1) {
      spark.travel -= 1;
      spark.index = (spark.index + (spark.forward ? 1 : -1) + track.length) % track.length;
      spark.at = track[spark.index].slice();
    }
  }
}

// Il posto dove una Scintilla sta correndo, ritrovato ogni volta che serve.
//
// È l'unico punto del gioco in cui una struttura dati cambia sotto i piedi di qualcuno che la stava
// percorrendo: a ogni conquista gli anelli sono altri, e l'indice che la Scintilla aveva in mano
// non indica più niente. Quindi l'indice è una **comodità che viene verificata**, non una verità: se
// la pista non ha più quel punto lì, la Scintilla si riaggancia al punto più vicino del bordo nuovo
// e tiene il verso di marcia. Una funzione sola, e nessun altro tocca `spark.index`.
function _trackFor(world, spark) {
  // Prima la scommessa: quasi sempre la pista è quella di un fotogramma fa e l'indice è ancora
  // buono. Costa due confronti.
  const held = _trackAt(world, spark.face, spark.ring);
  if (held && _isAt(held, spark.index, spark.at)) return held;

  // Poi il ripescaggio: stesso bordo, posto diverso nell'elenco.
  for (let f = 0; f < world.faces.length; f += 1) {
    if (!onBoundary(world.faces[f], spark.at)) continue;
    for (let r = 0; r < world.faces[f].rings.length; r += 1) {
      const track = _trackAt(world, f, r);
      const found = _indexOn(track, spark.at);
      if (found < 0) continue;
      spark.face = f;
      spark.ring = r;
      spark.index = found;
      return track;
    }
  }

  // E infine il riaggancio vero: il bordo su cui correva non c'è più. Si passa al punto più vicino
  // di quello che è rimasto, tenendo il verso di marcia.
  let best = null;
  let distance = Infinity;
  for (let f = 0; f < world.faces.length; f += 1) {
    const found = nearestOnBoundary(world.faces[f], spark.at);
    if (found && found.distance < distance) { distance = found.distance; best = { f, at: found.at }; }
  }
  if (!best) return null;

  for (let r = 0; r < world.faces[best.f].rings.length; r += 1) {
    const track = _trackAt(world, best.f, r);
    const found = _indexOn(track, best.at);
    if (found < 0) continue;
    spark.face = best.f;
    spark.ring = r;
    spark.index = found;
    spark.at = track[found].slice();
    return track;
  }
  return null;
}

function _isAt(track, index, at) {
  const point = track[index];
  return Boolean(point) && point[0] === at[0] && point[1] === at[1];
}

// La pista di un anello, srotolata una volta e tenuta lì. Le facce si ricostruiscono a ogni taglio,
// quindi una faccia nuova nasce senza pista e se la fabbrica al primo passo di una Scintilla — e
// **ogni** anello ne ha una, isole comprese: su un'isola ci si cammina, quindi ci si viene presi.
function _trackAt(world, faceIndex, ring) {
  const face = world.faces[faceIndex];
  if (!face) return null;
  if (!face.track) face.track = face.rings.map((r) => walkRing(r));
  return face.track[ring] || null;
}

function _indexOn(track, at) {
  for (let i = 0; i < track.length; i += 1) {
    if (track[i][0] === at[0] && track[i][1] === at[1]) return i;
  }
  return -1;
}

function _nearestOn(track, at) {
  let best = 0;
  let distance = Infinity;
  for (let i = 0; i < track.length; i += 1) {
    const d = Math.hypot(track[i][0] - at[0], track[i][1] - at[1]);
    if (d < distance) { distance = d; best = i; }
  }
  return best;
}

// Una Scintilla prende il marcatore solo mentre è sul bordo. Con la linea fuori il marcatore non è
// sulla sua pista, e lì la minaccia è un'altra.
function _bitten(world) {
  if (world.cut) return false;
  if (world.age < SPARK.first) return false;
  for (const spark of world.sparks) {
    if (Math.hypot(spark.at[0] - world.marker.at[0], spark.at[1] - world.marker.at[1]) <= SPARK.bite) {
      return true;
    }
  }
  return false;
}

// -----------------------------------------------------------------------------------------------------------------

function _die(world, cause = "filo") {
  world.marker.at = world.cut ? world.cut.chain[0].slice() : world.marker.at.slice();
  world.marker.travel = 0;
  world.cut = null;
  world.lives -= 1;
  world.waiting = RULES.pause;
  world.events.push({ kind: "death", cause, lives: world.lives });
  if (world.lives <= 0) {
    world.over = true;
    world.events.push({ kind: "over" });
  }
}

// After a claim the field is a different shape, and a Filo that was fine a moment ago can find
// itself standing in ground that has just become somebody's. One end decided which piece the Filo
// belongs to; the other one has to be brought along.
function _reseat(world) {
  for (const thread of world.threads) {
    const face = _faceOf(world, thread.a.at);
    if (!face) continue;
    for (const end of [thread.a, thread.b]) {
      if (_clearOf(face, end.at)) continue;
      end.at = _pushIn(face, end.at) || thread.a.at.slice();
    }
    thread.trail.length = 0;      // la scia apparteneva a un campo che non c'è più
  }
}

function _pushIn(face, point) {
  const wall = nearestOnBoundary(face, point);
  if (!wall || !wall.edge) return null;
  const along = Math.atan2(wall.edge[1][1] - wall.edge[0][1], wall.edge[1][0] - wall.edge[0][0]);
  const step = THREAD.clearance + 1;
  for (const way of [along + Math.PI / 2, along - Math.PI / 2]) {
    const candidate = [wall.at[0] + Math.cos(way) * step, wall.at[1] + Math.sin(way) * step];
    if (_clearOf(face, candidate)) return candidate;
  }
  return null;
}
