// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il suono, provato dove si può provare davvero.
//
// **Non si prova che una nota suoni.** Sotto Node non c'è nessun dispositivo audio, e simularne uno
// vorrebbe dire provare la simulazione: un finto `AudioContext` che accetta qualunque chiamata dice
// soltanto che il codice non è esploso. Quello che si prova è **la decisione**, cioè l'unica cosa
// nuova di `audio.js` rispetto all'app sorella e l'unica che non si sente: il tetto alle voci e la
// regola su chi entra quando il tetto è pieno.
//
// Per questo `admits` esiste come funzione pura ed è l'unico posto in cui quella regola è scritta.
// Non è una copia per le prove — `_room` la chiama, e se qui va bene, va bene anche in campo.
//
// L'altra metà è **la coda del mondo**: `game.js` mette dei nomi in `world.sounds`, e chi ascolta
// deve trovarli tutti e nell'ordine giusto. Quello si prova giocando davvero, col pilota automatico.
//
//   node app/spronia/test/sound.mjs

import { admits, PRIORITY, VOICES } from "../run/audio.js";
import { newGame, step, startWave, cleared } from "../run/game.js";
import { autopilot } from "../run/attract.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   t e t t o
// -----------------------------------------------------------------------------------------------------------------

console.log("\nil tetto alle voci");

{
  check("sotto il tetto entra chiunque, anche il suono più debole",
    admits("battito", new Array(VOICES - 1).fill("perso")));

  const pieno = new Array(VOICES).fill("perso");
  check("col tetto pieno di suoni importanti, un battito non entra",
    !admits("battito", pieno));
  check("e nemmeno un altro suono importante, se non vale di più",
    !admits("perso", pieno));

  const stormo = new Array(VOICES).fill("battito");
  check("ma un battito non tiene fuori una morte",
    admits("perso", stormo));
  check("né una cella raccolta",
    admits("cella", stormo));
  check("e il tuo battito passa sopra quello dello stormo",
    admits("battitoMio", stormo));
  check("mentre un battito qualunque non scavalca un altro battito qualunque",
    !admits("battito", stormo));

  check("un nome che non esiste non entra mai", !admits("qualcosa", []));
}

{
  // **La cosa che il tetto deve garantire**, detta come la sentirebbe chi gioca: in nessuna
  // combinazione di suoni già in corso una vita persa resta fuori. È la sola priorità massima, ed è
  // il motivo per cui la scala esiste.
  const nomi = Object.keys(PRIORITY);
  const rotte = [];
  for (const nome of nomi) {
    if (!admits("perso", new Array(VOICES).fill(nome)) && nome !== "perso") rotte.push(nome);
  }
  check("una vita persa si sente sempre, qualunque cosa stia suonando",
    rotte.length === 0, rotte.join(", "));

  // E il rovescio: il battito di uno stormo non deve poter riempire il tetto e tenere fuori
  // qualcosa di più importante. Vale per **tutto** quello che sta sopra di lui.
  const sopra = nomi.filter((n) => PRIORITY[n] > PRIORITY.battito);
  const bloccati = sopra.filter((n) => !admits(n, new Array(VOICES).fill("battito")));
  check("e niente di più importante di un battito resta fuori per colpa dei battiti",
    bloccati.length === 0, bloccati.join(", "));
}

{
  // La scala non deve avere due suoni allo stesso livello **che competono per lo stesso momento**.
  // Non è una regola generale — quattro suoni a quattro vanno benissimo — ma la cima sì: se due
  // suoni condividessero il massimo, nessuno dei due potrebbe scavalcare l'altro, e quello che
  // arriva secondo in un istante affollato sparirebbe.
  const massimo = Math.max(...Object.values(PRIORITY));
  const alCulmine = Object.keys(PRIORITY).filter((n) => PRIORITY[n] === massimo);
  check("un solo suono in cima alla scala", alCulmine.length === 1, alCulmine.join(", "));
  check("e il suono in cima è la vita persa", alCulmine[0] === "perso");
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   c o d a   d e l   m o n d o
// -----------------------------------------------------------------------------------------------------------------

console.log("\nla coda che il mondo riempie");

{
  const world = newGame(7, 1);
  check("un mondo nuovo ha la coda", Array.isArray(world.sounds));

  // Un passo la svuota e la riempie di nuovo: quello che c'era prima del passo non deve
  // sopravvivergli, o lo stesso suono verrebbe suonato due volte.
  world.sounds.push("finto");
  step(world, autopilot(world));
  check("un passo butta via quello che c'era prima",
    !world.sounds.includes("finto"));
}

{
  // Giocata vera: il pilota automatico vola, batte, abbatte, raccoglie e muore. Alla fine devono
  // essersi sentiti tutti i suoni che quelle cose producono.
  const world = newGame(11, 1);
  const sentiti = new Map();
  let passi = 0;
  while (!world.over && passi < 120 * 400) {
    step(world, autopilot(world));
    // **`startWave` prima di ascoltare**, e nello stesso ordine del ciclo vero: quel suono nasce
    // fuori da `step`, e ascoltando prima verrebbe buttato via dal passo successivo senza essere
    // mai stato sentito. È il difetto che questo controllo ha trovato la prima volta che è girato.
    if (cleared(world)) startWave(world);
    for (const nome of world.sounds) sentiti.set(nome, (sentiti.get(nome) || 0) + 1);
    passi += 1;
  }

  for (const atteso of ["battitoMio", "battito", "abbattuto", "cella", "ondata", "perso"]) {
    check(`in una partita vera si sente «${atteso}»`, (sentiti.get(atteso) || 0) > 0);
  }

  const ignoti = [...sentiti.keys()].filter((nome) => PRIORITY[nome] === undefined);
  check("e ogni nome messo in coda ha una priorità", ignoti.length === 0, ignoti.join(", "));

  // **Nessuna coda infinita.** È il difetto che un elenco dentro un oggetto lungo una partita
  // produce da solo: se qualcuno smettesse di svuotarla, crescerebbe finché la scheda non si ferma.
  check("la coda resta corta", world.sounds.length <= 24, `${world.sounds.length}`);
}

{
  // **Quanti suoni in un fotogramma, nel caso peggiore.** Non è curiosità: è il numero che il tetto
  // deve reggere, ed è la ragione per cui il tetto esiste.
  //
  // Si misura su una finestra e non su un passo, ed è la differenza fra la domanda giusta e quella
  // sbagliata. Un passo è un centoventesimo di secondo; il ciclo ne fa due per fotogramma e li
  // ascolta tutti prima di disegnare, quindi le note che arrivano insieme sono quelle di **otto
  // passi**, che è quanto dura una voce nel conteggio del tetto. Misurato per passo il massimo era
  // quattro, e sembrava che il tetto non servisse.
  let peggio = 0;
  for (const seme of [23, 31, 47, 59, 71]) {
    const world = newGame(seme, 2);
    for (let i = 0; i < 40; i += 1) startWave(world);
    const finestra = [];
    let passi = 0;
    while (!world.over && passi < 120 * 200) {
      step(world, autopilot(world));
      if (cleared(world)) startWave(world);
      finestra.push(world.sounds.length);
      if (finestra.length > 8) finestra.shift();
      peggio = Math.max(peggio, finestra.reduce((a, b) => a + b, 0));
      passi += 1;
    }
  }

  // **Il caso peggiore vero sta appena sopra il tetto**, ed è esattamente dove deve stare.
  //
  // Nove suoni in una finestra, otto voci: il tetto morde, ma di un suono solo, e quel suono è per
  // costruzione il più debole di tutti — un battito di uno stormo, di cui ce n'è un altro fra un
  // quinto di secondo. Un tetto molto più basso taglierebbe cose che contano; uno molto più alto
  // non taglierebbe niente e non servirebbe a niente.
  //
  // Il margine è stretto apposta, e va riletto se cambia il numero di nemici in campo o il ritmo
  // con cui battono: sono i due numeri da cui questo dipende, e stanno tutt'e due in game.js.
  check("il caso peggiore vero sta appena sopra il tetto",
    peggio > VOICES && peggio < VOICES * 2,
    `il massimo visto è ${peggio} contro ${VOICES}`);
  console.log(`        (massimo osservato: ${peggio} suoni in otto passi, con ${VOICES} voci)`);
}

// -----------------------------------------------------------------------------------------------------------------

console.log(failures === 0
  ? `\nOK — nessun difetto.\n`
  : `\n${failures} controlli falliti.\n`);
process.exit(failures === 0 ? 0 : 1);
