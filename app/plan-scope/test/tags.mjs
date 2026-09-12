// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il colore di un'etichetta: quello che deve promettere, e quello che non può.
//
// **La promessa è una sola e vale tutto: la stessa etichetta, lo stesso colore.** In questa
// schermata e in quella accanto, oggi e fra un anno, sul mio computer e su quello di un collega che
// ha aperto lo stesso progetto condiviso — perché il colore non è scritto da nessuna parte, si
// ricalcola dal nome ogni volta. Una prova che la difende costa poco e vale quanto la funzione.
//
// Quello che non può promettere è che due etichette *diverse* siano di colore diverso: dodici
// cassetti e un conto sul nome, e ogni tanto due nomi cadono nello stesso. È aritmetica; qui sotto
// è anche misurata, così la scelta di dodici resta una scelta e non un'opinione.
//
//     node --import ./app/plan-scope/test/loader.mjs app/plan-scope/test/tags.mjs

import assert from "node:assert/strict";

import { tagHue } from "../run/ui.js";
import * as model from "gg/plan-model.js";

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}

model.connect({ save() {}, drop() {} });

// -----------------------------------------------------------------------------------------------------------------
//  l a   p r o m e s s a
// -----------------------------------------------------------------------------------------------------------------

test("la stessa etichetta esce sempre dello stesso colore", () => {
  const many = ["cliente", "fiera", "2026", "web", "à la carte", "स्टैंड", "a"];
  for (const tag of many) {
    assert.equal(tagHue(tag), tagHue(tag));
    // Mille volte non è più vero di due, ma è il modo di dire che non c'è niente di casuale
    // dentro: nessun contatore, nessun ordine di arrivo, nessuna data.
    for (let i = 0; i < 100; i += 1) assert.equal(tagHue(tag), tagHue(tag));
  }
});

test("maiuscole e spazi non fanno un'etichetta diversa", () => {
  assert.equal(tagHue("Fiera"), tagHue("fiera"));
  assert.equal(tagHue("  FIERA  "), tagHue("fiera"));
  // È la stessa regola con cui il modello toglie i doppioni: se le due cose non fossero d'accordo,
  // una scheda potrebbe mostrare due pastiglie identiche di due colori.
  assert.deepEqual(model.cleanTags(["Fiera", "fiera", " FIERA "]), ["Fiera"]);
});

test("un'etichetta vuota non fa esplodere niente", () => {
  for (const nothing of ["", "   ", null, undefined]) assert.match(tagHue(nothing), /^h\d{1,2}$/);
});

test("il colore è sempre una delle dodici tinte, mai una tredicesima", () => {
  const words = ["a", "bb", "ccc", "cliente", "fiera", "progetto lungo con spazi", "2026", "#", "ï"];
  for (const word of words) {
    const hue = Number(tagHue(word).slice(1));
    assert.ok(Number.isInteger(hue) && hue >= 0 && hue < 12, `${word} → ${tagHue(word)}`);
  }
});

// -----------------------------------------------------------------------------------------------------------------
//  q u e l l o   c h e   n o n   p u ò   p r o m e t t e r e
// -----------------------------------------------------------------------------------------------------------------

// Centoquarantatré parole vere — mesi, giorni, mestieri, stati, le due lingue — divise in dodici
// cassetti. Non si chiede la perfezione: si chiede che nessun cassetto resti vuoto e che nessuno si
// prenda più del doppio della sua parte, cioè che il conto sparga e non ammucchi. Senza il
// rimescolamento finale, le parole corte cadevano quasi tutte negli stessi.
test("il conto sparge: nessuna tinta vuota, nessuna con il doppio della sua parte", () => {
  const words = `cliente fiera web interno stampa urgente 2026 design grafica stand marketing sito
    contabilita legale fornitore evento campagna lancio prodotto ricerca sviluppo test bozza
    rivedere approvato pagato scaduto priorita alta bassa media nuovo vecchio archivio importante
    personale lavoro casa viaggio spesa entrate uscite gennaio febbraio marzo aprile maggio giugno
    luglio agosto settembre ottobre novembre dicembre lunedi martedi mercoledi giovedi venerdi
    sabato domenica client fair print urgent internal brand launch product research development
    draft review approved paid overdue priority high low medium new old archive important personal
    work home travel expense income outgoing january february march april may june july august
    september october november december monday tuesday wednesday thursday friday saturday sunday
    budget team office riunione verbale contratto preventivo fattura ordine consegna spedizione
    reso garanzia assistenza formazione corso seminario workshop conferenza mostra allestimento
    catalogo brochure volantino manifesto cartello insegna vetrina scaffale magazzino inventario`
    .split(/\s+/).filter(Boolean);

  const bins = new Array(12).fill(0);
  for (const word of words) bins[Number(tagHue(word).slice(1))] += 1;
  const share = words.length / 12;
  assert.ok(Math.min(...bins) > 0, `una tinta non esce mai: ${bins.join(" ")}`);
  assert.ok(Math.max(...bins) < share * 2, `una tinta si prende il doppio: ${bins.join(" ")}`);
});

console.log(`tags: ${passed} prove passate`);
