// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Le arene, controllate come dati e non come disegno.
//
// Un'arena è dodici numeri scritti a mano, e ognuno dei modi in cui possono essere sbagliati rompe
// qualcosa di diverso e lontano: un anello girato al contrario diventa un'isola che è tutto il
// campo, una parete storta fa passare `canStep` attraverso un muro, una partenza su un vertice è
// un livello che non comincia, un Filo che nasce appoggiato a una parete esce dalla faccia al
// primo passo. Nessuno di questi errori si vede guardando l'arena: si vedono tre mosse dopo,
// altrove.
//
// Questa suite è la ragione per cui aggiungerne una costa dieci minuti invece di mezza giornata.
//
// Usage:  node app/recinto/test/arenas.mjs

import { ARENAS, arena, lap } from "../run/arenas.js";
import { ringArea2, area2, contains, onBoundary, wallsAt, nearestOnBoundary,
         canStep } from "../run/geometry.js";
import { FIELD, LATTICE, THREAD, create } from "../run/game.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) return;
  failures += 1;
  console.log(`  !  ${name}${detail ? `\n       ${detail}` : ""}`);
}

const WIDE = FIELD.w / LATTICE;
const HIGH = FIELD.h / LATTICE;

// -----------------------------------------------------------------------------------------------------------------

const seen = new Set();

for (const plan of ARENAS) {
  const where = `arena «${plan.key}»`;
  const face = { rings: plan.rings.map((ring) => ring.map((p) => p.slice())) };

  check(`${where}: la chiave è unica`, !seen.has(plan.key));
  seen.add(plan.key);

  // L'orientamento **è** il significato: positivo vuol dire bordo, negativo vuol dire isola. Non
  // c'è un campo che lo dichiara, quindi un anello scritto al rovescio non è un errore che qualcuno
  // segnala, è un'arena che significa un'altra cosa.
  check(`${where}: il bordo esterno gira nel verso del campo`, ringArea2(plan.rings[0]) > 0,
        `area doppia ${ringArea2(plan.rings[0])}`);
  plan.rings.slice(1).forEach((ring, i) => {
    check(`${where}: l'isola ${i + 1} gira al contrario`, ringArea2(ring) < 0,
          `area doppia ${ringArea2(ring)}`);
  });
  check(`${where}: l'area di partenza è positiva`, area2(face) > 0);

  // Ogni parete diritta o a 45°. È l'ipotesi sotto `canStep`: fuori da quella, un passo che
  // attraversa un muro può avere il punto di mezzo ancora dentro, e il muro non ferma niente.
  for (const ring of plan.rings) {
    ring.forEach((from, i) => {
      const to = ring[(i + 1) % ring.length];
      const dx = Math.abs(to[0] - from[0]);
      const dy = Math.abs(to[1] - from[1]);
      check(`${where}: la parete ${from} → ${to} è diritta o a 45°`,
            (dx === 0 || dy === 0 || dx === dy) && (dx > 0 || dy > 0));
      check(`${where}: il vertice ${from} è intero e dentro il campo`,
            Number.isInteger(from[0]) && Number.isInteger(from[1]) &&
            from[0] >= 0 && from[0] <= WIDE && from[1] >= 0 && from[1] <= HIGH);
    });
  }

  // La partenza. Sul bordo, e su **una parete sola**: dove due pareti si toccano non si può
  // cominciare un taglio, e un'arena che parte da lì è un'arena in cui il primo tasto non fa niente.
  check(`${where}: la partenza è sul bordo`, onBoundary(face, plan.start), String(plan.start));
  check(`${where}: e non su un vertice dove due pareti si toccano`, wallsAt(face, plan.start) === 1,
        `wallsAt = ${wallsAt(face, plan.start)}`);

  // I Fili. Due, perché dal terzo livello ne servono due, e nati lontani dalle pareti: i capi
  // partono a `spread` l'uno dall'altro, e uno che nascesse più vicino di così sarebbe già fuori.
  check(`${where}: ci sono due posizioni di Filo`, plan.threads.length >= 2);
  plan.threads.forEach((at, i) => {
    check(`${where}: il Filo ${i + 1} nasce dentro`, contains(face, at), String(at));
    const near = nearestOnBoundary(face, at);
    check(`${where}: il Filo ${i + 1} nasce lontano dalle pareti`,
          Boolean(near) && near.distance >= THREAD.spread,
          near ? `${near.distance.toFixed(1)} < ${THREAD.spread}` : "nessuna parete trovata");
  });
}

// -----------------------------------------------------------------------------------------------------------------

// **Da ogni punto del bordo di partenza si può fare qualcosa.**
//
// Un'arena è un disegno, e un disegno può contenere un punto da cui non si esce: un vertice troppo
// stretto, una parete che tocca sé stessa. Lì il gioco non dà errore — semplicemente il tasto non
// fa niente, e chi gioca pensa che si sia bloccato tutto. Costa un giro del bordo per arena, ed è
// la differenza fra saperlo e crederlo: prima di questa prova era una cosa che avevo ragionato.
const WAYS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

for (const plan of ARENAS) {
  const face = { rings: plan.rings.map((ring) => ring.map((p) => p.slice())) };
  const stuck = [];
  let walked = 0;

  for (const ring of face.rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const from = ring[i];
      const to = ring[(i + 1) % ring.length];
      const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
      const stepX = Math.sign(to[0] - from[0]);
      const stepY = Math.sign(to[1] - from[1]);
      for (let k = 0; k < steps; k += 1) {
        const at = [from[0] + stepX * k, from[1] + stepY * k];
        walked += 1;
        if (!WAYS.some(([dx, dy]) => canStep(face, at, [at[0] + dx, at[1] + dy]))) stuck.push(at);
      }
    }
  }

  check(`arena «${plan.key}»: da ogni punto del bordo c'è una mossa`, stuck.length === 0,
        `${stuck.length} punti su ${walked} senza uscita, il primo in ${stuck[0]}`);
}

// -----------------------------------------------------------------------------------------------------------------

// Il giro. Finché l'elenco non è finito è zero; poi conta, e non si ferma — che è tutto il
// contenuto della promessa «oltre l'ultima arena il gioco continua a cambiare».
const n = ARENAS.length;
check("il primo livello è la prima arena", arena(1).key === ARENAS[0].key);
check("l'ultimo livello del primo giro è l'ultima arena", arena(n).key === ARENAS[n - 1].key);
check("e il successivo ricomincia dalla prima", arena(n + 1).key === ARENAS[0].key);
check("il primo giro è lo zero", lap(1) === 0 && lap(n) === 0);
check("il secondo giro è l'uno", lap(n + 1) === 1 && lap(2 * n) === 1);
check("e il giro non ha un tetto", lap(100 * n + 1) === 100);

// Ogni arena sa nascere: `create` la percorre tutta — area, Fili, Scintille — e un'arena che
// esplode qui esplode al livello che le tocca, con la partita in corso.
for (let level = 1; level <= n; level += 1) {
  let world = null;
  try { world = create(level, 12345); } catch (error) { check(`il livello ${level} nasce`, false, error.message); }
  if (!world) continue;
  check(`il livello ${level} («${world.arena}») ha un'area`, world.total2 > 0);
  check(`il livello ${level} ha almeno un Filo e una Scintilla`,
        world.threads.length >= 1 && world.sparks.length >= 1);
}

console.log(failures ? `arene: ${failures} prove fallite` : `arene: tutto a posto — ${n} arene`);
process.exit(failures ? 1 : 0);
