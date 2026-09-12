// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// I promemoria: quando suonano, e cosa il service worker trova da dire.
//
// Le parti che contano sono tutte pure — un'ora, un conto di minuti, due stringhe confrontate — e
// le due che non lo sono (il permesso, `periodicSync`) non si possono provare qui e sono scritte
// per fallire in silenzio. Questo file prova quelle che possono sbagliare da sole.
//
//     node --import ./app/plan-scope/test/loader.mjs app/plan-scope/test/remind.mjs

import assert from "node:assert/strict";

import * as remind from "gg/remind.js";

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
//  l e   i m p o s t a z i o n i
// -----------------------------------------------------------------------------------------------------------------

test("un'impostazione fuori dai limiti rientra invece di essere rifiutata", () => {
  assert.deepEqual(remind.clean({ on: true, days: 99, hour: 25 }), { on: true, days: 30, hour: 23 });
  assert.deepEqual(remind.clean({ on: 1, days: -3, hour: -1 }), { on: true, days: 0, hour: 0 });
  assert.deepEqual(remind.clean(null), { on: false, days: 1, hour: 9 });
  assert.deepEqual(remind.clean({ on: true, days: "2", hour: "8" }), { on: true, days: 2, hour: 8 });
});

test("una parola al posto di un numero non porta via il valore buono", () => {
  assert.deepEqual(remind.clean({ on: true, days: "domani", hour: null }),
    { on: true, days: 1, hour: 9 }, "torna al valore di partenza, non a zero");
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   c a l e n d a r i o
// -----------------------------------------------------------------------------------------------------------------

// Il conto che un `-P1D` scritto a mano sbaglia: un evento di giornata comincia a mezzanotte,
// quindi «il giorno prima alle nove» sta quindici ore prima dell'inizio, non ventiquattro.
test("«il giorno prima alle nove» sono quindici ore prima, non ventiquattro", () => {
  assert.equal(remind.minutesBefore({ days: 1, hour: 9 }), 15 * 60);
  assert.deepEqual(remind.alarm({ days: 1, hour: 9 }, "Mandare in stampa"), [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT900M",
    "DESCRIPTION:Mandare in stampa",
    "END:VALARM",
  ]);
});

test("lo stesso giorno alle nove suona dopo l'inizio, e il segno lo dice", () => {
  assert.equal(remind.minutesBefore({ days: 0, hour: 9 }), -540);
  assert.ok(remind.alarm({ days: 0, hour: 9 }, "x").includes("TRIGGER:PT540M"));
});

test("mezzanotte del giorno stesso è l'inizio, e non un anticipo di zero minuti negativo", () => {
  assert.equal(remind.minutesBefore({ days: 0, hour: 0 }), 0);
  assert.ok(remind.alarm({ days: 0, hour: 0 }, "x").includes("TRIGGER:PT0S"));
});

test("la descrizione è obbligatoria e viene protetta come il resto dell'ics", () => {
  const lines = remind.alarm({ days: 1, hour: 9 }, "Stampa; poi, consegna\nal banco");
  assert.ok(lines.some((line) => line.startsWith("DESCRIPTION:")), "senza, il calendario può rifiutare l'evento");
  assert.ok(lines.includes("DESCRIPTION:Stampa\\; poi\\, consegna\\nal banco"));
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   m o m e n t o
// -----------------------------------------------------------------------------------------------------------------

test("il momento è costruito sull'ora locale, non su mezzanotte UTC", () => {
  const at = remind.when("2026-09-23", { days: 1, hour: 9 });
  assert.equal(at.getFullYear(), 2026);
  assert.equal(at.getMonth(), 8);
  assert.equal(at.getDate(), 22, "il giorno prima");
  assert.equal(at.getHours(), 9, "alle nove di dove sta chi legge, non alle nove di Londra");
});

test("l'anticipo scavalca il mese e l'anno senza contare i giorni a mano", () => {
  assert.equal(remind.when("2026-03-01", { days: 1, hour: 9 }).getDate(), 28, "il 2026 non è bisestile");
  const capodanno = remind.when("2026-01-01", { days: 2, hour: 8 });
  assert.equal(capodanno.getFullYear(), 2025);
  assert.equal(capodanno.getMonth(), 11);
  assert.equal(capodanno.getDate(), 30);
});

test("una data che non è una data non produce un momento", () => {
  assert.equal(remind.when("", { days: 1, hour: 9 }), null);
  assert.equal(remind.when("entro settembre", { days: 1, hour: 9 }), null);
  assert.equal(remind.when(null, { days: 1, hour: 9 }), null);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   d i g e s t
// -----------------------------------------------------------------------------------------------------------------

const ITEMS = [
  { id: "t1", date: "2026-09-23", text: "Confermare i fornitori" },
  { id: "t2", date: "2026-09-28", text: "Scrivere i testi" },
  { id: "t3", date: "entro settembre", text: "Un giorno" },
];

test("il digest porta il momento già calcolato, e scarta quello che non ha una data", () => {
  const saved = remind.digest(ITEMS, { on: true, days: 1, hour: 9 }, { heading: "Scadenze" });
  assert.equal(saved.items.length, 2, "«entro settembre» non è una scadenza da sveglia");
  assert.equal(saved.heading, "Scadenze");
  assert.equal(saved.on, true);
  assert.ok(saved.items.every((one) => one.when && one.key && one.text));
});

// La chiave porta dentro la data, e non è un dettaglio: spostare una scadenza è una scadenza nuova,
// e una chiave fatta col solo id l'avrebbe considerata già annunciata.
test("spostare una scadenza la fa annunciare di nuovo", () => {
  const prima = remind.digest([ITEMS[0]], { on: true, days: 1, hour: 9 });
  const dopo = remind.digest([{ ...ITEMS[0], date: "2026-10-05" }], { on: true, days: 1, hour: 9 },
    { said: [prima.items[0].key] });
  assert.notEqual(dopo.items[0].key, prima.items[0].key);
  assert.deepEqual(dopo.said, [], "la chiave vecchia non tiene zitta quella nuova");
});

test("quello che è già stato detto resta detto, ma solo finché esiste", () => {
  const saved = remind.digest(ITEMS, { on: true, days: 1, hour: 9 });
  const keys = saved.items.map((one) => one.key);
  const ancora = remind.digest(ITEMS, { on: true, days: 1, hour: 9 }, { said: [...keys, "sparita|2020-01-01"] });
  assert.deepEqual(ancora.said, keys, "una chiave senza più la sua scadenza farebbe crescere l'elenco per sempre");
});

// -----------------------------------------------------------------------------------------------------------------
//  c o s a   d i r e
// -----------------------------------------------------------------------------------------------------------------

test("matura quando il momento è passato, e una volta sola", () => {
  const saved = remind.digest(ITEMS, { on: true, days: 1, hour: 9 });
  const prima = remind.ripe(saved, { now: new Date("2026-09-20T12:00:00Z") });
  assert.equal(prima.length, 0, "tre giorni prima non si dice ancora niente");

  const dopo = remind.ripe(saved, { now: new Date("2026-09-22T10:00:00Z") });
  assert.equal(dopo.length, 1);
  assert.equal(dopo[0].text, "Confermare i fornitori");

  const detto = { ...saved, said: [dopo[0].key] };
  assert.equal(remind.ripe(detto, { now: new Date("2026-09-22T10:00:00Z") }).length, 0,
    "un promemoria che si ripete a ogni risveglio è un promemoria che si spegne");
});

test("con i promemoria spenti non matura niente, per quanto tardi sia", () => {
  const saved = remind.digest(ITEMS, { on: false, days: 1, hour: 9 });
  assert.deepEqual(remind.ripe(saved, { now: new Date("2027-01-01T12:00:00Z") }), []);
});

test("un digest che non c'è non fa rumore", () => {
  assert.deepEqual(remind.ripe(null, {}), []);
  assert.deepEqual(remind.ripe({ on: true }, {}), []);
});

console.log(`remind: ${passed} prove passate`);
