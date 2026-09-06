// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What is owed, when, and what the accountant's file looks like.
//
// Three things are checked here that would otherwise be found by somebody chasing an invoice they
// had already been paid for:
//
//  - **only documents that owe money appear.** A draft owes nothing, and neither does a cancelled
//    or rejected one — but a rejected one keeps its number, so filtering by number would keep it;
//  - **a partial payment reduces the oldest instalment first**, and the rest stays owed;
//  - **`today` is a parameter.** A function that reads the clock cannot be tested, and "is this
//    overdue" is exactly the question that has to be.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/schedule.mjs

import assert from "node:assert/strict";

import { from, toString } from "../run/decimal.js";
import {
  schedule, summary, recordPayment, removePayment, paymentsOf, received, owedOn, csv,
} from "../run/schedule.js";
import { openDatabase } from "../run/db.js";
import { put, reset } from "./fake-store.mjs";

let passed = 0;

async function test(name, fn) {
  reset();
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

const money = (value) => toString(value, 2);
const OGGI = "2026-09-03";

/** An issued document, with its totals frozen the way `issue` freezes them. */
function issued(fields = {}) {
  const totale = from(fields.totale || "1220.00");
  return {
    id: fields.id || `doc-${Math.random().toString(36).slice(2)}`,
    tipo: fields.tipo || "TD01",
    stato: "emesso",
    numero: fields.numero || "2026/0001",
    data: fields.data || "2026-08-01",
    partyId: fields.partyId || "p1",
    pagamento: fields.pagamento,
    fattureCollegate: fields.fattureCollegate,
    totali: {
      imponibile: from("1000.00").toString(),
      imposta: from("220.00").toString(),
      totale: totale.toString(),
    },
    ...(fields.stato ? { stato: fields.stato } : {}),
  };
}

// -----------------------------------------------------------------------------------------------------------------
//  c h i   d e v e   c o m p a r i r e
// -----------------------------------------------------------------------------------------------------------------

await test("una fattura senza scadenze compare sulla sua data", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({ data: "2026-08-01" }));
  const rows = await schedule(db, { today: OGGI });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scadenza, "2026-08-01");
  assert.equal(money(rows[0].importo), "1220.00");
});

await test("una bozza non deve niente", async () => {
  const db = await openDatabase();
  await put(db, "docs", { ...issued(), stato: "bozza", numero: null, totali: null });
  assert.deepEqual(await schedule(db, { today: OGGI }), []);
});

await test("una scartata tiene il numero ma non deve niente", async () => {
  // Il caso che un filtro «ha un numero» lascerebbe passare: lo scarto conserva la numerazione.
  const db = await openDatabase();
  await put(db, "docs", issued({ stato: "scartato" }));
  await put(db, "docs", issued({ id: "d2", stato: "annullato", numero: "2026/0002" }));
  assert.deepEqual(await schedule(db, { today: OGGI }), []);
});

await test("inviata e accettata devono, come l'emessa", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({ id: "d1", stato: "inviato" }));
  await put(db, "docs", issued({ id: "d2", stato: "accettato", numero: "2026/0002" }));
  assert.equal((await schedule(db, { today: OGGI })).length, 2);
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   r a t e
// -----------------------------------------------------------------------------------------------------------------

await test("due rate danno due righe, ordinate per scadenza", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({
    pagamento: { rate: [
      { scadenza: "2026-11-03", importo: "220.00" },
      { scadenza: "2026-10-03", importo: "1000.00" },
    ] },
  }));
  const rows = await schedule(db, { today: OGGI });
  assert.deepEqual(rows.map((r) => r.scadenza), ["2026-10-03", "2026-11-03"]);
  assert.deepEqual(rows.map((r) => money(r.importo)), ["1000.00", "220.00"]);
});

await test("una rata senza importo vale il totale del documento", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({ pagamento: { rate: [{ scadenza: "2026-10-03" }] } }));
  const rows = await schedule(db, { today: OGGI });
  assert.equal(money(rows[0].importo), "1220.00");
});

await test("una rata senza data cade sulla data del documento", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({ data: "2026-08-01", pagamento: { rate: [{ importo: "500.00" }] } }));
  assert.equal((await schedule(db, { today: OGGI }))[0].scadenza, "2026-08-01");
});

// -----------------------------------------------------------------------------------------------------------------
//  s c a d u t o
// -----------------------------------------------------------------------------------------------------------------

await test("scaduto è prima di oggi, e oggi non è scaduto", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({ id: "a", data: "2026-09-02" }));
  await put(db, "docs", issued({ id: "b", data: "2026-09-03", numero: "2026/0002" }));
  await put(db, "docs", issued({ id: "c", data: "2026-09-04", numero: "2026/0003" }));
  const { rows, overdue } = await summary(db, { today: OGGI });
  assert.equal(rows.length, 3);
  assert.deepEqual(overdue.map((r) => r.numero), ["2026/0001"]);
});

await test("il totale dovuto è la somma di quello che resta", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({ id: "a" }));
  await put(db, "docs", issued({ id: "b", numero: "2026/0002" }));
  assert.equal(money((await summary(db, { today: OGGI })).total), "2440.00");
});

await test("una nota di credito toglie dal dovuto invece di aggiungere", async () => {
  // Gli importi di una TD04 sono positivi nel file — è il tipo a dire che è uno storno — quindi il
  // segno va messo qui. Senza, una fattura stornata per intero risultava dovuta il doppio: il
  // numero sbagliato nella direzione che fa inseguire un cliente che non deve niente.
  const db = await openDatabase();
  await put(db, "docs", issued({ id: "f", totale: "976.00" }));
  await put(db, "docs", issued({
    id: "nc", tipo: "TD04", numero: "2026/NC01", totale: "976.00",
    fattureCollegate: [{ numero: "2026/0001", data: "2026-08-01" }],
  }));
  const { total } = await summary(db, { today: OGGI });
  assert.equal(money(total), "0.00");
});

await test("una nota di credito non compare come riga a sé nello scadenzario", async () => {
  // Uno storno non ha una scadenza: è un credito sulla fattura, non un altro documento da pagare.
  const db = await openDatabase();
  await put(db, "docs", issued({ id: "f", totale: "976.00" }));
  await put(db, "docs", issued({
    id: "nc", tipo: "TD04", numero: "2026/NC01", totale: "244.00",
    fattureCollegate: [{ numero: "2026/0001", data: "2026-08-01" }],
  }));
  const rows = await schedule(db, { today: OGGI });
  assert.deepEqual(rows.map((r) => r.numero), ["2026/0001"]);
  assert.equal(money(rows[0].importo), "732.00");
});

await test("uno storno parziale lascia dovuta la differenza", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({ id: "f", totale: "976.00" }));
  await put(db, "docs", issued({
    id: "nc", tipo: "TD04", numero: "2026/NC01", totale: "244.00",
    fattureCollegate: [{ numero: "2026/0001", data: "2026-08-01" }],
  }));
  assert.equal(money((await summary(db, { today: OGGI })).total), "732.00");
});

// -----------------------------------------------------------------------------------------------------------------
//  g l i   i n c a s s i
// -----------------------------------------------------------------------------------------------------------------

await test("un incasso pieno toglie il documento dallo scadenzario", async () => {
  const db = await openDatabase();
  const doc = issued();
  await put(db, "docs", doc);
  await recordPayment(db, doc, { importo: "1220.00", data: "2026-09-01" });
  assert.deepEqual(await schedule(db, { today: OGGI }), []);
});

await test("un incasso parziale lascia dovuto il resto", async () => {
  const db = await openDatabase();
  const doc = issued();
  await put(db, "docs", doc);
  await recordPayment(db, doc, { importo: "220.00", data: "2026-09-01" });
  const rows = await schedule(db, { today: OGGI });
  assert.equal(rows.length, 1);
  assert.equal(money(rows[0].importo), "1000.00");
});

await test("un incasso parziale chiude la rata più vecchia per prima", async () => {
  const db = await openDatabase();
  const doc = issued({
    pagamento: { rate: [
      { scadenza: "2026-10-03", importo: "1000.00" },
      { scadenza: "2026-11-03", importo: "220.00" },
    ] },
  });
  await put(db, "docs", doc);
  await recordPayment(db, doc, { importo: "1000.00", data: "2026-10-04" });
  const rows = await schedule(db, { today: OGGI });
  assert.deepEqual(rows.map((r) => [r.scadenza, money(r.importo)]), [["2026-11-03", "220.00"]]);
});

await test("l'incasso di un documento non tocca gli altri", async () => {
  const db = await openDatabase();
  const uno = issued({ id: "a" });
  await put(db, "docs", uno);
  await put(db, "docs", issued({ id: "b", numero: "2026/0002" }));
  await recordPayment(db, uno, { importo: "1220.00", data: "2026-09-01" });
  const rows = await schedule(db, { today: OGGI });
  assert.deepEqual(rows.map((r) => r.numero), ["2026/0002"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   C S V
// -----------------------------------------------------------------------------------------------------------------

await test("il CSV ha l'intestazione, il BOM e le righe a capo di Windows", async () => {
  const db = await openDatabase();
  await put(db, "parties", { id: "p1", denominazione: "Cliente S.p.A.", partitaIva: "09876543217" });
  await put(db, "docs", issued());
  const text = await csv(db);
  assert.ok(text.startsWith("﻿"), "manca il BOM: Excel sbaglierebbe gli accenti");
  const lines = text.split("\r\n");
  assert.equal(lines[0].replace("﻿", ""),
    "tipo;numero;data;cliente;partitaIva;imponibile;imposta;totale;stato;scadenza");
  assert.ok(lines[1].includes("Cliente S.p.A."));
  assert.ok(lines[1].includes("1220.00"));
});

await test("un punto e virgola nella ragione sociale non spacca la riga", async () => {
  // Non è un caso di scuola: «Rossi; Bianchi e C.» esiste, e senza virgolette diventa due colonne.
  const db = await openDatabase();
  await put(db, "parties", { id: "p1", denominazione: 'Rossi; Bianchi "e" C.' });
  await put(db, "docs", issued());
  const line = (await csv(db)).split("\r\n")[1];
  assert.ok(line.includes('"Rossi; Bianchi ""e"" C."'));
  assert.equal(line.split(";").length > 10, true, "il campo con il separatore è stato quotato");
});

await test("il periodo filtra per data, estremi compresi", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({ id: "a", data: "2026-07-31" }));
  await put(db, "docs", issued({ id: "b", data: "2026-08-01", numero: "2026/0002" }));
  await put(db, "docs", issued({ id: "c", data: "2026-08-31", numero: "2026/0003" }));
  await put(db, "docs", issued({ id: "d", data: "2026-09-01", numero: "2026/0004" }));
  const text = await csv(db, { from: "2026-08-01", to: "2026-08-31" });
  const righe = text.trim().split("\r\n").slice(1);
  assert.deepEqual(righe.map((r) => r.split(";")[1]), ["2026/0002", "2026/0003"]);
});

await test("una bozza non entra nel CSV, perché non ha un numero", async () => {
  const db = await openDatabase();
  await put(db, "docs", { ...issued(), stato: "bozza", numero: null });
  assert.equal((await csv(db)).trim().split("\r\n").length, 1);
});

// -----------------------------------------------------------------------------------------------------------------
//  i   d o c u m e n t i   c h e   n o n   s o n o   s o l d i   a t t e s i
// -----------------------------------------------------------------------------------------------------------------

await test("un preventivo accettato non entra nello scadenzario", async () => {
  // **È il difetto che `kinds.js` esiste per fermare**, e ha la forma esatta di quello della nota di
  // credito: «accettato» è uno degli stati che devono, quindi un controllo sul solo stato metterebbe
  // ogni preventivo vinto fra le scadenze, come denaro che ancora nessuno ha chiesto.
  const db = await openDatabase();
  await put(db, "docs", issued({
    tipo: "preventivo", serie: "PR", stato: "accettato", numero: "2026/0001",
  }));
  assert.deepEqual(await schedule(db, { today: OGGI }), []);
  assert.equal(money((await summary(db, { today: OGGI })).total), "0.00");
});

await test("un documento di trasporto consegnato non deve niente", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({ tipo: "ddt", serie: "DDT", stato: "consegnato" }));
  assert.deepEqual(await schedule(db, { today: OGGI }), []);
});

await test("la fattura differita che nasce dal trasporto sì, invece", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({ tipo: "TD24", data: "2026-08-01" }));
  const rows = await schedule(db, { today: OGGI });
  assert.equal(rows.length, 1);
  assert.equal(money(rows[0].importo), "1220.00");
});

await test("il CSV del commercialista tiene solo i documenti fiscali", async () => {
  const db = await openDatabase();
  await put(db, "docs", issued({ id: "a", tipo: "preventivo", serie: "PR", numero: "2026/0001" }));
  await put(db, "docs", issued({ id: "b", tipo: "ddt", serie: "DDT", numero: "2026/0001" }));
  await put(db, "docs", issued({ id: "c", tipo: "TD01", numero: "2026/0007" }));
  const righe = (await csv(db)).trim().split("\r\n").slice(1);
  // Un preventivo non è un'operazione da registrare: nel file sarebbe una riga da spiegare.
  assert.deepEqual(righe.map((r) => r.split(";")[0]), ["TD01"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  i n c a s s i   p a r z i a l i ,   i n   p i ù   f a s i
// -----------------------------------------------------------------------------------------------------------------

const CONTO = { id: "conto-1", etichetta: "Banca Malatestiana", iban: "IT60X0542811101000000123456" };

await test("un cliente paga in tre volte, e ogni volta resta il resto", async () => {
  const db = await openDatabase();
  const doc = issued({ totale: "1220.00", data: "2026-08-01" });
  await put(db, "docs", doc);

  await recordPayment(db, doc, { importo: "500.00", data: "2026-08-10", conto: CONTO });
  assert.equal(money(await owedOn(db, doc.id, { today: OGGI })), "720.00");

  await recordPayment(db, doc, { importo: "220.00", data: "2026-08-20", conto: CONTO });
  assert.equal(money(await owedOn(db, doc.id, { today: OGGI })), "500.00");

  await recordPayment(db, doc, { importo: "500.00", data: "2026-09-01", conto: CONTO });
  assert.equal(money(await owedOn(db, doc.id, { today: OGGI })), "0.00");
  // E il documento sparisce dallo scadenzario, che è il modo in cui si vede che è chiuso.
  assert.deepEqual(await schedule(db, { today: OGGI }), []);
});

await test("gli incassi tornano dal più vecchio, e sommano a quello che è arrivato", async () => {
  const db = await openDatabase();
  const doc = issued();
  await put(db, "docs", doc);
  await recordPayment(db, doc, { importo: "220.00", data: "2026-08-20" });
  await recordPayment(db, doc, { importo: "500.00", data: "2026-08-10" });

  const incassi = await paymentsOf(db, doc.id);
  assert.deepEqual(incassi.map((p) => p.data), ["2026-08-10", "2026-08-20"]);
  assert.equal(money(received(incassi)), "720.00");
});

await test("il conto è una fotografia: resta quello di allora", async () => {
  const db = await openDatabase();
  const doc = issued();
  await put(db, "docs", doc);
  await recordPayment(db, doc, { importo: "100.00", data: "2026-08-10", conto: CONTO, nota: "acconto" });

  const [incasso] = await paymentsOf(db, doc.id);
  assert.deepEqual(incasso.conto, {
    id: "conto-1", etichetta: "Banca Malatestiana", iban: "IT60X0542811101000000123456",
  });
  assert.equal(incasso.nota, "acconto");
  // Rinominare il conto in anagrafica non riscrive quello che è successo: l'incasso è arrivato su
  // un conto che allora si chiamava così, e mostrargli il nome nuovo direbbe una cosa falsa.
  CONTO.etichetta = "Nome cambiato";
  assert.equal((await paymentsOf(db, doc.id))[0].conto.etichetta, "Banca Malatestiana");
  CONTO.etichetta = "Banca Malatestiana";
});

await test("un incasso senza conto è legittimo: i conti sono comodi, non obbligatori", async () => {
  const db = await openDatabase();
  const doc = issued();
  await put(db, "docs", doc);
  await recordPayment(db, doc, { importo: "100.00", data: "2026-08-10" });
  assert.equal((await paymentsOf(db, doc.id))[0].conto, null);
});

await test("un incasso registrato per sbaglio si toglie, e il residuo torna", async () => {
  const db = await openDatabase();
  const doc = issued({ totale: "1220.00" });
  await put(db, "docs", doc);
  const primo = await recordPayment(db, doc, { importo: "1220.00", data: "2026-08-10" });
  assert.deepEqual(await schedule(db, { today: OGGI }), []);

  await removePayment(db, primo.id);
  assert.equal(money(await owedOn(db, doc.id, { today: OGGI })), "1220.00");
  assert.equal((await paymentsOf(db, doc.id)).length, 0);
});

await test("un incasso più grande del dovuto chiude il documento senza andare sotto zero", async () => {
  const db = await openDatabase();
  const doc = issued({ totale: "1220.00" });
  await put(db, "docs", doc);
  await recordPayment(db, doc, { importo: "1300.00", data: "2026-08-10" });
  // Nessuna riga negativa: lo scadenzario dice che cosa manca, e non manca niente.
  assert.deepEqual(await schedule(db, { today: OGGI }), []);
  assert.equal(money(await owedOn(db, doc.id, { today: OGGI })), "0.00");
});

await test("gli incassi di un documento non toccano quelli di un altro", async () => {
  const db = await openDatabase();
  const a = issued({ id: "a", numero: "2026/0001" });
  const b = issued({ id: "b", numero: "2026/0002" });
  await put(db, "docs", a);
  await put(db, "docs", b);
  await recordPayment(db, a, { importo: "1220.00", data: "2026-08-10" });
  assert.equal((await paymentsOf(db, "b")).length, 0);
  assert.equal(money(await owedOn(db, "b", { today: OGGI })), "1220.00");
});

await test("gli incassi si distribuiscono sulle rate, dalla più vecchia", async () => {
  const db = await openDatabase();
  const doc = issued({
    totale: "1220.00",
    pagamento: { rate: [{ scadenza: "2026-08-31", importo: "610.00" }, { scadenza: "2026-09-30", importo: "610.00" }] },
  });
  await put(db, "docs", doc);
  await recordPayment(db, doc, { importo: "700.00", data: "2026-08-25" });
  const rows = await schedule(db, { today: OGGI });
  // La prima rata è chiusa, la seconda scesa di quello che avanzava: è l'unica lettura che non
  // chiede a nessuno di scegliere a quale rata attribuire un bonifico.
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scadenza, "2026-09-30");
  assert.equal(money(rows[0].importo), "520.00");
});

console.log(`schedule: ${passed} prove passate`);
