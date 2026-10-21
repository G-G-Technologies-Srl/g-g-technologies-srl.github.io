// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Scadenzario › Incassi, drawn for real: `income.js` over the fake DOM of `fake-dom.mjs` and the fake
// store of `fake-store.mjs`, with the payment sheet of `payments.js` behind its «Modifica».
//
// What is tried here is what the screen shows and what its buttons write: the filters, the receipt
// cell with its three buttons, a payment corrected in the sheet — amount, day, receipt taken off —
// and a payment removed. The arithmetic of the list is `incomeRows`, tried in `schedule.mjs`.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/income.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { install } from "./fake-dom.mjs";
import { reset } from "./fake-store.mjs";

const html = readFileSync(new URL("../run/index.html", import.meta.url), "utf8");
const dom = install(html);

const { openDatabase } = await import("../run/db.js");
const { setLang } = await import("../run/i18n.js");
const { from } = await import("../run/decimal.js");
const { put, get, list } = await import("gg/store.js");
const { saveParty } = await import("../run/parties.js");
const { recordPayment } = await import("../run/schedule.js");
const { attach } = await import("../run/attachments.js");
const income = await import("../run/income.js");
const payments = await import("../run/payments.js");

setLang("it");
income.connect(await openDatabase());
payments.connect();

let passed = 0;
async function prova(nome, fn) {
  try {
    reset();
    dom.reset();
    await fn(await openDatabase());
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

/** The yes of the confirmation dialog. */
async function dicendoSi(azione) {
  const done = azione();
  await dom.byId("askOk").fire("click");
  return done;
}

/** A file as the picker hands it over. */
function pdf(name) {
  const blob = new Blob(["%PDF contabile"], { type: "application/pdf" });
  blob.name = name;
  return blob;
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   d a t a
// -----------------------------------------------------------------------------------------------------------------

const CONTO = { id: "c1", etichetta: "Banca Malatestiana", iban: "IT60X0542811101000000123456" };

/** Two customers, two invoices, three payments in two years; the newest one with its receipt. */
async function popola(db) {
  await put(db, "company", { id: "company", denominazione: "La Mia S.r.l.", conti: [CONTO] });
  await saveParty(db, { id: "p1", denominazione: "Rossi Impianti S.r.l." });
  await saveParty(db, { id: "p2", denominazione: "Brandi & Figli S.n.c." });
  const a = { id: "a", tipo: "TD01", stato: "emesso", numero: "2026/0001", data: "2025-12-01", partyId: "p1",
    totali: { totale: from("1220.00").toString() } };
  const b = { id: "b", tipo: "TD01", stato: "emesso", numero: "2026/0002", data: "2026-02-01", partyId: "p2",
    totali: { totale: from("610.00").toString() } };
  await put(db, "docs", a);
  await put(db, "docs", b);
  await recordPayment(db, a, { importo: "200.00", data: "2025-12-20", conto: CONTO });
  await recordPayment(db, a, { importo: "1020.00", data: "2026-02-15", conto: CONTO, nota: "saldo" });
  const ultimo = await recordPayment(db, b, { importo: "610.00", data: "2026-03-02" });
  await attach(db, ultimo, pdf("contabile-brandi.pdf"));
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   t e s t s
// -----------------------------------------------------------------------------------------------------------------

await prova("senza incassi lo dice, e non mostra né filtri né tabella", async (db) => {
  await income.render(db);
  assert.equal(dom.byId("incomeEmpty").hidden, false);
  assert.equal(dom.byId("incomeFilters").hidden, true);
  assert.equal(dom.byId("incomeTable").hidden, true);
});

await prova("tutti gli incassi, dal più recente, con documento, cliente e ricevuta", async (db) => {
  await popola(db);
  await income.render(db);
  dom.byId("incomeYear").value = "";
  await dom.byId("incomeYear").fire("change", { target: dom.byId("incomeYear") });
  assert.equal(dom.count("incomeBody"), 3);
  const prima = dom.byId("incomeBody").at(0);
  assert.match(prima.at(1).allText, /Fattura 2026\/0002 · Brandi & Figli S\.n\.c\./);
  assert.match(prima.at(4).allText, /contabile-brandi\.pdf/, "the receipt is there, by name");
  assert.equal(prima.at(4).at(1).getAttribute("aria-label"), "Scarica la ricevuta — contabile-brandi.pdf");
  assert.equal(dom.byId("incomeBody").at(1).at(2).allText, "Banca Malatestiana");
  assert.equal(dom.byId("incomeBody").at(2).at(4).allText, "Allega", "and where there is none, attach it now");
  assert.equal(dom.text("incomeWith"), "1");
  assert.equal(dom.text("incomeWithout"), "2");
  assert.equal(dom.text("incomeCount"), "3 incassi");
});

await prova("i filtri: anno, cliente, e solo quelli senza ricevuta", async (db) => {
  await popola(db);
  await income.render(db);
  const scegli = async (id, value) => {
    dom.byId(id).value = value;
    await dom.byId(id).fire("change", { target: dom.byId(id) });
  };
  await scegli("incomeYear", "2026");
  assert.equal(dom.count("incomeBody"), 2);
  await scegli("incomeReceipt", "senza");
  assert.equal(dom.count("incomeBody"), 1);
  assert.match(dom.byId("incomeBody").at(0).at(1).allText, /2026\/0001/);
  await scegli("incomeParty", "p2");
  assert.equal(dom.byId("incomeTable").hidden, true);
  assert.equal(dom.byId("incomeNoMatch").hidden, false);
  await scegli("incomeParty", "");
  await scegli("incomeReceipt", "");
  await scegli("incomeYear", "");
});

await prova("«Modifica» corregge importo e giorno, e dal foglio si toglie la ricevuta", async (db) => {
  await popola(db);
  await income.render(db);
  const riga = dom.byId("incomeBody").at(0);
  const done = riga.at(6).at(0).fire("click");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(dom.byId("payDialog").open, true);
  const form = dom.byId("payForm").elements;
  assert.equal(form.importo.value, "610.00", "the sheet opens on the payment as recorded");
  assert.equal(form.data.value, "2026-03-02");
  assert.equal(dom.text("payDialogTitle"), "Modifica l'incasso");
  assert.equal(dom.text("payReceiptName"), "contabile-brandi.pdf");
  form.importo.value = "600,00";
  form.data.value = "2026-02-27";
  await dom.byId("payReceiptClear").fire("click");
  assert.equal(dom.text("payReceiptName"), "");
  await dom.byId("paySave").onclick();
  await done;

  const tutti = await list(db, "payments");
  assert.equal(tutti.length, 3, "corrected, not added");
  const corretto = tutti.find((one) => one.docId === "b");
  assert.equal(corretto.importo, "600.00");
  assert.equal(corretto.data, "2026-02-27");
  assert.equal(corretto.ricevuta, undefined);
  assert.equal((await list(db, "attachments")).length, 0, "the file went with its label");
});

await prova("«Modifica» su un incasso senza conto non gliene assegna uno", async (db) => {
  await popola(db);
  await income.render(db);
  const done = dom.byId("incomeBody").at(0).at(6).at(0).fire("click");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(dom.byId("payForm").elements.conto.value, "");
  await dom.byId("paySave").onclick();
  await done;
  const corretto = (await list(db, "payments")).find((one) => one.docId === "b");
  assert.equal(corretto.conto, null);
  assert.equal(corretto.ricevuta.name, "contabile-brandi.pdf", "untouched, the receipt stays");
});

await prova("la ricevuta si allega dalla riga, anche dopo", async (db) => {
  await popola(db);
  await income.render(db);
  const cella = dom.byId("incomeBody").at(2).at(4);
  dom.byId("receiptPick").files = [pdf("arrivata-dopo.pdf")];
  await cella.at(0).fire("click");
  await dom.byId("receiptPick").fire("change");
  assert.match(dom.byId("incomeBody").at(2).at(4).allText, /arrivata-dopo\.pdf/);
  assert.equal(dom.text("incomeWith"), "2");
});

await prova("la croce toglie l'incasso, dopo la domanda", async (db) => {
  await popola(db);
  await income.render(db);
  await dicendoSi(() => dom.byId("incomeBody").at(0).at(6).at(1).fire("click"));
  assert.equal((await list(db, "payments")).length, 2);
  assert.equal(dom.count("incomeBody"), 2);
  assert.equal((await list(db, "attachments")).length, 0);
  assert.equal(await get(db, "docs", "b") !== null, true, "the document stays");
});

console.log(`income: ${passed} prove passate`);
