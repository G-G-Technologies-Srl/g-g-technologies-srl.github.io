// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il generatore di ondate, provato **per proprietà** e non contro una tabella.
//
// Un generatore non si verifica confrontandolo con l'elenco che avrebbe dovuto produrre: quello è
// riscrivere il generatore una seconda volta e poi controllare che le due copie siano d'accordo.
// Si verificano le cose che devono restare vere per ogni ondata, e soprattutto **quelle che possono
// fallire** — una stesura precedente del piano ne elencava sette, di cui tre controllavano soltanto
// che un `min` restituisse al più il proprio limite.
//
//   node app/spronia/test/waves.mjs

import { WAVE, REMOVALS, TYPES, typeOf, count, intruders, level, removed, mix, plan }
  from "../run/waves.js";
import { PLATFORMS, KIND_NAMES } from "../run/game.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Le prime sessanta ondate, che sono quelle che il piano si impegna a rendere vincibili. */
const FINO = 60;
const uno = Array.from({ length: FINO }, (_, i) => plan(i + 1, 1));
const due = Array.from({ length: FINO }, (_, i) => plan(i + 1, 2));

// -----------------------------------------------------------------------------------------------------------------
//  i   d u e   f a t t i   c h e   s t a n n o   i n   d u e   p o s t i
// -----------------------------------------------------------------------------------------------------------------

console.log("\nquello che waves.js ripete da game.js");

{
  // `waves.js` non importa `game.js` — sarebbe un anello — quindi i nomi delle piattaforme e i
  // numeri delle classi li tiene per conto suo. Sono due fatti scritti in due posti, ed è qui che
  // si confrontano: è l'unico modo per cui possono restare d'accordo.
  const rimovibili = PLATFORMS.filter((p) => p.removable).map((p) => p.id);
  const nominate = [...new Set(REMOVALS.flat())];
  const fantasmi = nominate.filter((id) => !PLATFORMS.some((p) => p.id === id));
  check("ogni piattaforma nominata da REMOVALS esiste", fantasmi.length === 0, fantasmi.join(", "));

  const fisse = nominate.filter((id) => !rimovibili.includes(id));
  check("e nessuna di quelle tolte è una piattaforma fissa", fisse.length === 0, fisse.join(", "));
  check("il ciclo copre tutte le rimovibili, e non di più",
    nominate.length === rimovibili.length, `${nominate.length} contro ${rimovibili.length}`);

  const classi = [...new Set([...uno, ...due].flatMap((p) => [...p.foes, ...p.cells]))];
  const fuori = classi.filter((c) => c < 0 || c >= KIND_NAMES.length);
  check("ogni classe generata è una classe che esiste", fuori.length === 0, fuori.join(", "));
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   i n v a r i a n t i
// -----------------------------------------------------------------------------------------------------------------

console.log("\nle invarianti del generatore");

{
  // **Corpi ostili in campo ≤ 9, celle comprese.** È il tetto che viene dal campo: con due piloti
  // sono undici corpi per quattro piazzole, e oltre non ci si sta.
  const peggio = Math.max(...[...uno, ...due].map((p) => p.foes.length + p.cells.length));
  check("mai più di nove corpi ostili in campo, celle comprese",
    peggio <= WAVE.most, `il massimo è ${peggio}`);
}

{
  // **Il numero di nemici non decresce**, confrontando solo ondate dello stesso tipo. Un'ondata di
  // Celle è più leggera di proposito, ed è l'unica discontinuità ammessa.
  const rotte = [];
  for (const giocatori of [1, 2]) {
    const piani = giocatori === 1 ? uno : due;
    for (const tipo of TYPES) {
      const stesse = piani.filter((p) => p.type === tipo);
      for (let i = 1; i < stesse.length; i += 1) {
        if (stesse[i].foes.length < stesse[i - 1].foes.length) {
          rotte.push(`${giocatori}g ${tipo} ${stesse[i - 1].n}→${stesse[i].n}`);
        }
      }
    }
  }
  check("fra ondate dello stesso tipo i nemici non calano mai", rotte.length === 0,
    rotte.slice(0, 4).join(", "));
}

{
  // **Il livello medio non decresce mai, e non raggiunge mai 2.** La seconda è quella che tiene il
  // gioco vincibile: se arrivasse a due, dalla ventinovesima ondata sarebbero solo Vertici, e
  // nessuna azione del giocatore potrebbe più metterne uno sotto di sé.
  let cala = null;
  for (let n = 2; n <= FINO; n += 1) {
    if (level(n) < level(n - 1) - 1e-9) cala = n;
  }
  check("il livello non cala mai", cala === null, `cala all'ondata ${cala}`);
  check("e non arriva mai a due", level(1e6) < 2, `${level(1e6)}`);

  const soloAlto = [...uno, ...due].filter(
    (p) => p.foes.length > 0 && p.foes.every((c) => c === KIND_NAMES.length - 1));
  check("non esiste un'ondata di soli Vertici", soloAlto.length === 0,
    soloAlto.slice(0, 3).map((p) => p.n).join(", "));
}

{
  // Il tipo è periodico di sette, e a un giocatore non produce mai Duello.
  let rotto = null;
  for (let n = 1; n <= FINO - 7; n += 1) {
    for (const g of [1, 2]) {
      if (typeOf(n, g) !== typeOf(n + 7, g)) rotto = `${n} vs ${n + 7}, ${g}g`;
    }
  }
  check("il tipo di ondata si ripete ogni sette", rotto === null, rotto || "");
  check("a un giocatore il Duello non esiste",
    uno.every((p) => p.type !== "duello"));
  check("in due invece sì", due.some((p) => p.type === "duello"));
  // Ogni tipo che quel numero di giocatori può produrre capita davvero. **Non tutti e cinque per
  // ognuno**, ed è il punto: la Sopravvivenza e la Squadra sono la stessa posizione vista da uno o
  // da due giocatori, quindi chiedere entrambe a entrambi era il controllo scritto male, non il
  // generatore. In due: Normale, Celle, Squadra, Duello. Da solo: Normale, Celle, Sopravvivenza.
  const attesi = { 1: ["normale", "celle", "sopravvivenza"],
    2: ["normale", "celle", "squadra", "duello"] };
  for (const [g, piani] of [[1, uno], [2, due]]) {
    const visti = [...new Set(piani.map((p) => p.type))].sort();
    check(`a ${g === 1 ? "un giocatore" : "due giocatori"} capitano tutti e soli i tipi previsti`,
      JSON.stringify(visti) === JSON.stringify([...attesi[g]].sort()), visti.join(", "));
  }
}

{
  // **Gli Intrusi programmati non riempiono mai il cielo**: resta sempre posto per uno di richiamo,
  // che è la sola valvola della frenesia.
  const troppi = [...uno, ...due].filter((p) => p.intruders > WAVE.inFlight - 1);
  check("i programmati lasciano sempre posto a un Intruso di richiamo",
    troppi.length === 0, troppi.slice(0, 3).map((p) => `${p.n}: ${p.intruders}`).join(", "));
}

{
  // Ogni ondata ha almeno un nemico **oppure** almeno una cella: un'ondata vuota sarebbe finita
  // prima di cominciare, e il guscio ne aprirebbe un'altra all'infinito nello stesso fotogramma.
  const vuote = [...uno, ...due].filter((p) => p.foes.length + p.cells.length === 0);
  check("nessuna ondata è vuota", vuote.length === 0,
    vuote.slice(0, 4).map((p) => `${p.n} (${p.players}g)`).join(", "));
}

{
  // **Il Duello ha comunque dei nemici**, ed è deliberato: senza, due giocatori fermi produrrebbero
  // un'ondata che non può finire e una partita che non può nemmeno terminare.
  const duelli = due.filter((p) => p.type === "duello");
  check("il Duello ha sempre dei nemici",
    duelli.length > 0 && duelli.every((p) => p.foes.length > 0));
  check("e ne ha circa metà di una Normale della stessa ondata",
    duelli.every((p) => p.foes.length === Math.ceil(count(p.n) / 2)),
    duelli.slice(0, 3).map((p) => `${p.n}: ${p.foes.length}/${count(p.n)}`).join(", "));
}

{
  // Il tipo ha periodo sette e la mappa quattro: coprimi, quindi ogni tipo capita prima o poi su
  // ogni configurazione. È la proprietà che una stesura precedente aveva rotto con periodi sei e
  // quattro, e il difetto non era visibile da nessuna parte: metà delle combinazioni semplicemente
  // non compariva mai.
  const visti = new Set();
  for (let n = WAVE.removeFrom; n <= WAVE.removeFrom + 7 * 4 - 1; n += 1) {
    visti.add(`${typeOf(n, 2)}|${removed(n).join("+")}`);
  }
  const tipiVisti = new Set([...visti].map((k) => k.split("|")[0]));
  const mappeViste = new Set([...visti].map((k) => k.split("|")[1]));
  check("in ventotto ondate si vedono tutti i tipi su tutte le mappe",
    visti.size === tipiVisti.size * mappeViste.size,
    `${visti.size} coppie invece di ${tipiVisti.size * mappeViste.size}`);
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   p r i m e   v o l t e
// -----------------------------------------------------------------------------------------------------------------

console.log("\nle prime volte, distanziate a mano");

{
  check("la prima ondata sono tre Derive, al rallentatore",
    uno[0].foes.length === 3 && uno[0].foes.every((c) => c === 0)
      && uno[0].speed === WAVE.firstSlow,
    `${uno[0].foes} a ${uno[0].speed}`);
  check("e dalla seconda si va a velocità piena",
    uno.slice(1).every((p) => p.speed === 1));

  check("la Pinza comincia dalla terza",
    !uno[1].claw && uno[2].claw);
  check("la prima Sopravvivenza è la quarta",
    uno.find((p) => p.type === "sopravvivenza").n === 4);
  check("le piattaforme cominciano a sparire dalla quinta",
    uno.slice(0, 4).every((p) => p.removed.length === 0)
      && uno.slice(4, 12).some((p) => p.removed.length > 0));
  check("la prima ondata di Celle è la settima",
    uno.find((p) => p.type === "celle").n === 7);
  check("il primo Intruso programmato è all'ottava",
    uno.slice(0, 7).every((p) => p.intruders === 0) && uno[7].intruders === 1);

  check("l'ondata di Celle non ha nemici in volo, e sei celle a terra",
    uno[6].foes.length === 0 && uno[6].cells.length === WAVE.cells,
    `${uno[6].foes.length} nemici, ${uno[6].cells.length} celle`);

  check("nove nemici dalla dodicesima",
    count(12) === WAVE.most && count(11) < WAVE.most, `${count(11)} poi ${count(12)}`);
}

{
  // Il mix è un'operazione, e `round` e `floor` non sono intercambiabili: cambiano le prime cinque
  // ondate, dove un nemico di classe superiore in più o in meno è metà della difficoltà.
  const conta = (p) => KIND_NAMES.map((_, c) => p.foes.filter((x) => x === c).length);
  check("il mix è tutto della classe base finché il livello non sale",
    JSON.stringify(conta(uno[0])) === JSON.stringify([3, 0, 0]), JSON.stringify(conta(uno[0])));
  const tardi = plan(40, 1);
  check("e a regime sono sei Vertici e tre Segugi su nove",
    JSON.stringify(conta(tardi)) === JSON.stringify([0, 3, 6]), JSON.stringify(conta(tardi)));
  check("il numero di nemici del mix torna sempre",
    [...uno, ...due].every((p) => p.foes.length === (p.type === "celle" ? 0
      : (p.type === "duello" ? Math.ceil(count(p.n) / 2) : count(p.n)))));
}

// -----------------------------------------------------------------------------------------------------------------

console.log(failures === 0
  ? `\nOK — nessun difetto.\n`
  : `\n${failures} controlli falliti.\n`);
process.exit(failures === 0 ? 0 : 1);
