// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The profile per document type, and the invariants that keep the five rows honest.
//
// **This file mostly tests a table, and that is the point.** The table replaced conditions scattered
// through five modules, so what has to be provable is not that a function computes something but
// that the declarations are coherent: no state that does not exist, no kind that both owes money and
// credits it, no series shared between two sequences. A wrong row here is a wrong app everywhere,
// and it would be wrong quietly.
//
//     node app/invoice-scope/test/kinds.mjs

import assert from "node:assert/strict";

import {
  KINDS, STATES, TIPI, TIPI_FISCALI, kind, has, fiscale, numero, convertibile,
} from "../run/kinds.js";

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

// -----------------------------------------------------------------------------------------------------------------
//  l a   t a b e l l a   è   c o e r e n t e
// -----------------------------------------------------------------------------------------------------------------

test("i cinque tipi sono quelli attesi, nell'ordine del lavoro", () => {
  assert.deepEqual(TIPI, ["preventivo", "ddt", "TD01", "TD24", "TD04"]);
  assert.deepEqual(TIPI_FISCALI, ["TD01", "TD24", "TD04"]);
});

test("ogni stato dichiarato da un tipo esiste in STATES", () => {
  for (const [tipo, profile] of Object.entries(KINDS)) {
    for (const stato of profile.stati) {
      assert.ok(STATES.includes(stato), `${tipo} dichiara «${stato}», che non è uno stato`);
    }
  }
});

test("nessun tipo offre bozza o emesso fra gli stati successivi", () => {
  // Tornare in bozza è affare di `reopen`, che controlla il numero e l'export; `emesso` lo assegna
  // `issue`. Offrirli in un menù di stati vorrebbe dire aggirare i due controlli con una scelta.
  for (const [tipo, profile] of Object.entries(KINDS)) {
    assert.ok(!profile.stati.includes("bozza"), `${tipo} offre bozza`);
    assert.ok(!profile.stati.includes("emesso"), `${tipo} offre emesso`);
  }
});

test("un tipo non può insieme dovere e stornare", () => {
  for (const [tipo, profile] of Object.entries(KINDS)) {
    assert.ok(!(profile.deve && profile.storna), `${tipo} fa entrambe le cose`);
  }
  // E stornare è mestiere di uno solo: se domani ce ne fossero due, lo scadenzario andrebbe riletto
  // prima, non dopo.
  assert.deepEqual(TIPI.filter((tipo) => KINDS[tipo].storna), ["TD04"]);
});

test("solo i documenti fiscali entrano nello scadenzario", () => {
  for (const tipo of TIPI) {
    if (!KINDS[tipo].fiscale) assert.equal(KINDS[tipo].deve, false, `${tipo} deve dei soldi`);
  }
  // Ed è la fattura, differita o no, l'unica cosa che qualcuno aspetta di incassare.
  assert.deepEqual(TIPI.filter((tipo) => KINDS[tipo].deve), ["TD01", "TD24"]);
});

test("i documenti interni hanno una serie, i fiscali no", () => {
  assert.equal(KINDS.preventivo.serie, "PR");
  assert.equal(KINDS.ddt.serie, "DDT");
  for (const tipo of TIPI_FISCALI) assert.equal(KINDS[tipo].serie, "");
  // Due tipi con la stessa sigla renderebbero indistinguibili due numeri letti al telefono.
  const sigle = TIPI.map((tipo) => KINDS[tipo].serie).filter(Boolean);
  assert.equal(new Set(sigle).size, sigle.length);
});

test("ogni tipo ha un'etichetta che segue la convenzione delle chiavi", () => {
  for (const tipo of TIPI) assert.match(KINDS[tipo].label, /^type[A-Z]/);
});

test("si raggruppa solo quello che non ha niente da perdere nell'unione", () => {
  assert.deepEqual(TIPI.filter((tipo) => KINDS[tipo].raggruppabile), ["ddt"]);
  // È l'invariante che regge la regola, non un dettaglio: unire due documenti che portano uno
  // sconto o uno scadenzario ne terrebbe uno solo, e in silenzio. Se un giorno il DDT prendesse la
  // sezione dello sconto, questa prova cadrebbe prima che cada una fattura.
  for (const tipo of TIPI) {
    if (!KINDS[tipo].raggruppabile) continue;
    assert.ok(!KINDS[tipo].sezioni.includes("sconto"), `${tipo} porta uno sconto`);
    assert.ok(!KINDS[tipo].sezioni.includes("pagamento"), `${tipo} porta uno scadenzario`);
  }
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   d o m a n d e   c h e   g l i   a l t r i   f i l e   f a n n o
// -----------------------------------------------------------------------------------------------------------------

test("un tipo sconosciuto ricade sulla fattura, che è il profilo più severo", () => {
  assert.equal(kind({ tipo: "TD06" }), KINDS.TD01);
  assert.equal(kind({}), KINDS.TD01);
  assert.equal(kind(null), KINDS.TD01);
  assert.equal(kind(undefined), KINDS.TD01);
});

test("le sezioni della maschera seguono il tipo", () => {
  assert.equal(has({ tipo: "ddt" }, "trasporto"), true);
  assert.equal(has({ tipo: "ddt" }, "ritenuta"), false);
  assert.equal(has({ tipo: "ddt" }, "pagamento"), false);
  assert.equal(has({ tipo: "TD01" }, "ritenuta"), true);
  assert.equal(has({ tipo: "TD01" }, "trasporto"), false);
  // Un preventivo propone prezzi e condizioni, quindi lo sconto e le scadenze sì; il bollo no,
  // perché il bollo è dovuto su un documento fiscale e il preventivo non lo è.
  assert.equal(has({ tipo: "preventivo" }, "pagamento"), true);
  assert.equal(has({ tipo: "preventivo" }, "bollo"), false);
});

test("fiscale distingue chi produce un file da chi resta qui", () => {
  assert.equal(fiscale({ tipo: "TD01" }), true);
  assert.equal(fiscale({ tipo: "TD24" }), true);
  assert.equal(fiscale({ tipo: "TD04" }), true);
  assert.equal(fiscale({ tipo: "preventivo" }), false);
  assert.equal(fiscale({ tipo: "ddt" }), false);
});

test("il numero letto ad alta voce porta la sigla, e una bozza non ne ha uno", () => {
  assert.equal(numero({ tipo: "preventivo", serie: "PR", numero: "2026/0001" }), "PR 2026/0001");
  assert.equal(numero({ tipo: "TD01", serie: "", numero: "2026/0001" }), "2026/0001");
  assert.equal(numero({ tipo: "TD01", numero: null }), "");
  assert.equal(numero(null), "");
});

// -----------------------------------------------------------------------------------------------------------------
//  q u a n d o   u n   d o c u m e n t o   d i v e n t a   u n a   f a t t u r a
// -----------------------------------------------------------------------------------------------------------------

test("un preventivo emesso diventa una fattura, una bozza no", () => {
  assert.equal(convertibile({ tipo: "preventivo", stato: "emesso" }), "TD01");
  assert.equal(convertibile({ tipo: "preventivo", stato: "accettato" }), "TD01");
  assert.equal(convertibile({ tipo: "preventivo", stato: "inviato" }), "TD01");
  // Una bozza può ancora cambiare: fatturarla vorrebbe dire numerare una copia di qualcosa che si
  // muove, e i due documenti finirebbero per dire cose diverse sullo stesso accordo.
  assert.equal(convertibile({ tipo: "preventivo", stato: "bozza" }), null);
});

test("un preventivo rifiutato o annullato non si fattura", () => {
  assert.equal(convertibile({ tipo: "preventivo", stato: "rifiutato" }), null);
  assert.equal(convertibile({ tipo: "preventivo", stato: "annullato" }), null);
  assert.equal(convertibile({ tipo: "ddt", stato: "annullato" }), null);
});

test("un documento di trasporto diventa una fattura differita", () => {
  assert.equal(convertibile({ tipo: "ddt", stato: "emesso" }), "TD24");
  assert.equal(convertibile({ tipo: "ddt", stato: "consegnato" }), "TD24");
});

test("una fattura non si converte in niente", () => {
  for (const tipo of TIPI_FISCALI) {
    assert.equal(convertibile({ tipo, stato: "emesso" }), null, tipo);
  }
});

test("quello in cui un tipo si converte è un tipo che esiste, ed è fiscale", () => {
  for (const tipo of TIPI) {
    const target = KINDS[tipo].converteIn;
    if (!target) continue;
    assert.ok(KINDS[target], `${tipo} si converte in «${target}», che non esiste`);
    assert.equal(KINDS[target].fiscale, true, `${tipo} si converte in un documento non fiscale`);
  }
});

console.log(`kinds: ${passed} prove passate`);
