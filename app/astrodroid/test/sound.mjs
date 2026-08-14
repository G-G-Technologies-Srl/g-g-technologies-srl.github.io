// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Che ogni cosa che succede nel gioco abbia un suono, e che i suoni siano ancora agganciati.
//
// Serve perché il difetto qui è muto in senso letterale. `audio.play` è uno `switch` con un
// `default: break`: un evento nuovo in `game.js`, o un evento rinominato, non rompe niente e non
// dice niente — semplicemente quella cosa smette di fare rumore. Nessun altro controllo lo vede,
// e chi prova il gioco per due minuti non si accorge che manca il suono del disco volante, perché
// il disco volante arriva dopo ventidue secondi.
//
// Il rombo del motore sta a parte, e per una ragione che vale la pena avere scritta: la spinta non
// è un evento ma uno stato, quindi non passa da `events` e non può stare nello `switch`. Vive in
// `setThrust`, chiamato a ogni fotogramma con quello che la nave sta facendo. Il controllo qui
// sotto verifica che esista e che `app.js` lo chiami davvero — è l'unico suono che si può perdere
// senza che manchi una `case`.
//
// Usage:  node app/astrodroid/test/sound.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { create, step, RULES } from "../run/game.js";

const RUN = join(dirname(fileURLToPath(import.meta.url)), "..", "run");
const sorgente = (nome) => readFileSync(join(RUN, nome), "utf8");

let guasti = 0;

function check(nome, condizione, dettaglio = "") {
  if (condizione) return;
  guasti += 1;
  console.log(`  !  ${nome}${dettaglio ? `\n       ${dettaglio}` : ""}`);
}

const HOLD = (over) => ({
  left: false, right: false, thrust: false, fire: false, hyperspace: false, ...over,
});

// -----------------------------------------------------------------------------------------------------------------
//  o g n i   e v e n t o   h a   u n a   v o c e
// -----------------------------------------------------------------------------------------------------------------

const gioco = sorgente("game.js");
const audio = sorgente("audio.js");

// Gli eventi come `game.js` li scrive: stringhe letterali e template con la taglia dentro.
const emessi = new Set();
for (const [, nome] of gioco.matchAll(/events\.push\("([^"]+)"\)/g)) emessi.add(nome);
for (const [, modello] of gioco.matchAll(/events\.push\(`([^`]+)`\)/g)) {
  if (modello.includes("${rock.size}")) {
    for (const taglia of ["large", "medium", "small"]) {
      emessi.add(modello.replace("${rock.size}", taglia));
    }
  } else if (modello.includes("${kind}")) {
    for (const tipo of ["large", "small"]) emessi.add(modello.replace("${kind}", tipo));
  } else if (modello.includes("${world.ufo.kind}")) {
    for (const tipo of ["large", "small"]) emessi.add(modello.replace("${world.ufo.kind}", tipo));
  } else {
    emessi.add(modello);
  }
}

const conVoce = new Set([...audio.matchAll(/case "([^"]+)":/g)].map((m) => m[1]));

check("il gioco emette degli eventi", emessi.size > 8, `ne ho trovati ${emessi.size}`);
for (const evento of [...emessi].sort()) {
  check(`«${evento}» ha un suono`, conVoce.has(evento),
        "sta in game.js ma non ha una case in audio.js: succederebbe in silenzio");
}
for (const evento of [...conVoce].sort()) {
  if (evento === "coin") continue;              // il gettone lo suona app.js, non il mondo
  check(`«${evento}» è un evento che esiste ancora`, emessi.has(evento),
        "audio.js lo suona ma game.js non lo emette più: è una case morta");
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   d i s c o   v o l a n t e   a r r i v a ,   e   s i   s e n t e
// -----------------------------------------------------------------------------------------------------------------

{
  // Ventidue secondi di gioco prima che possa comparire: è il motivo per cui provando a mano non
  // lo si incontra quasi mai, e quindi il motivo per cui va provato qui.
  const mondo = create(5);
  const visti = new Set();
  let comparso = false;
  const passi = Math.ceil((RULES.ufoFirst + RULES.ufoEvery + 30) * 120);
  for (let i = 0; i < passi; i += 1) {
    step(mondo, HOLD());
    for (const evento of mondo.events) {
      visti.add(evento);
      if (evento.startsWith("ufo-")) comparso = true;
    }
  }
  check("il disco volante compare da solo", comparso,
        `in ${Math.round(passi / 120)} secondi non è mai arrivato`);
  check("e annuncia la propria comparsa",
        visti.has("ufo-large") || visti.has("ufo-small"),
        `eventi visti: ${[...visti].filter((e) => e.startsWith("ufo")).join(", ") || "nessuno"}`);
  check("e spara", visti.has("ufo-fire"),
        "senza questo il disco volante spara in silenzio, che è peggio che non sparare");
}

{
  // Abbattuto: l'evento porta la taglia, perché il disco piccolo vale mille punti e il grande
  // duecento — e due esplosioni identiche non direbbero quale delle due è appena successa.
  // Una roccia va lasciata: il conto alla rovescia del disco volante gira solo mentre c'è
  // qualcosa in campo, altrimenti l'ondata è già finita e non arriverebbe nessuno.
  const mondo = create(9);
  mondo.rocks = mondo.rocks.slice(0, 1);
  mondo.ufoIn = 0;
  step(mondo, HOLD());
  check("il disco volante si può far comparire", mondo.ufo !== null, "nessun disco nel mondo");
  if (mondo.ufo) {
    const tipo = mondo.ufo.kind;
    mondo.shots.push({ x: mondo.ufo.x, y: mondo.ufo.y, vx: 0, vy: 0, life: 1, ship: true });
    step(mondo, HOLD());
    check("abbatterlo dà il suo suono", mondo.events.includes(`ufo-lost-${tipo}`),
          `eventi: ${mondo.events.join(", ") || "nessuno"}`);
    check("e i suoi punti", mondo.score === (tipo === "small" ? 1000 : 200),
          `${mondo.score} punti per un disco ${tipo}`);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   m o t o r e ,   c h e   n o n   è   u n   e v e n t o
// -----------------------------------------------------------------------------------------------------------------

{
  const app = sorgente("app.js");
  check("il motore esiste", audio.includes("export function setThrust"),
        "la spinta dura quanto il tasto: non può essere una nota fra quelle sopra");
  check("ed è un anello, non una nota", audio.includes("source.loop = true"),
        "una sorgente riavviata a ogni pressione fa clic in entrata e in uscita");
  check("app.js lo accende con lo stato della nave", app.includes("audio.setThrust"),
        "senza questa riga la nave spinge in silenzio, e nessuna case mancante lo direbbe");
  check("e lo spegne fuori dalla partita",
        app.includes('if (screen !== "playing") audio.setThrust(false)'),
        "un anello non finisce da sé: resterebbe acceso sopra la pausa e la fine partita");
  check("togliere l'audio lo ferma", audio.includes("if (!enabled) setThrust(false)"),
        "è l'unico suono che sopravviverebbe al master a zero");
  // Il gettone è il primo suono di tutti ed è quello che apre il contesto: se viene programmato
  // mentre il contesto è ancora sospeso, riceve tempi che al risveglio sono già passati e non si
  // sente. Trovato provando con un click vero invece che con `el.click()`, che non conta come
  // gesto dell'utente e lascia il contesto fermo — cioè misurando per mezz'ora un audio spento.
  check("una nota programmata a contesto sospeso viene rimandata",
        audio.includes('if (ctx.state !== "running")') && audio.includes("ctx.resume().then"),
        "il gettone verrebbe perso: l'inviluppo salta alla fine invece di aprirsi");

  // E che la nave dichiari davvero di star spingendo, che è quello che app.js legge.
  const mondo = create(3);
  mondo.rocks = [];
  mondo.ufoIn = 9999;
  step(mondo, HOLD({ thrust: true }));
  check("la nave dichiara la spinta", mondo.ship.thrusting === true,
        "app.js legge `ship.thrusting`: se non esiste, il motore non si accende mai");
  step(mondo, HOLD());
  check("e la ritira quando lasci", mondo.ship.thrusting === false, "resterebbe acceso");
}

// -----------------------------------------------------------------------------------------------------------------
//  e s i t o
// -----------------------------------------------------------------------------------------------------------------

if (guasti > 0) {
  console.log(`\n${guasti} problemi con l'audio.`);
  process.exit(1);
}
console.log("Ogni cosa che succede fa il suo rumore.");
