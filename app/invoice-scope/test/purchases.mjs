// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Gli acquisti sullo schermo: l'elenco con gli stati, il foglio che calcola l'imposta, la scheda
// con i pagamenti in uscita, e la cancellazione che porta via anche quelli.
//
// Stessa idea di `customer.mjs`: il markup vero sotto un DOM finto, così un id sbagliato o un
// `hidden` dimenticato saltano qui e non sullo schermo di chi usa l'app.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/purchases.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { install } from "./fake-dom.mjs";
import { reset } from "./fake-store.mjs";

const html = readFileSync(new URL("../run/index.html", import.meta.url), "utf8");
const dom = install(html);

const { openDatabase } = await import("../run/db.js");
const { setLang } = await import("../run/i18n.js");
const { put, list } = await import("gg/store.js");
const { saveParty, isCustomer, isSupplier } = await import("../run/parties.js");
const { saveCost, recordOutlay, outlaysOf, cost: getCost } = await import("../run/costs.js");
const purchases = await import("../run/purchases.js");

setLang("it");
purchases.connect(await openDatabase());

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

const leggibile = (testo) => String(testo).replace(/ /g, " ");

/**
 * Il sì del dialogo di conferma. Un giro di coda prima del click: chi cancella legge i pagamenti
 * dal deposito prima di chiedere, e un sì arrivato prima della domanda non risponde a niente.
 */
async function dicendoSi(azione) {
  const done = azione();
  await new Promise((r) => setTimeout(r, 0));
  await dom.byId("askOk").fire("click");
  return done;
}

/** Il sì del foglio del pagamento: `paySave` è armato con `onclick`, non con un ascoltatore. */
async function pagando(azione, importo = null) {
  const done = azione();
  await new Promise((r) => setTimeout(r, 0));
  const proposto = dom.byId("payForm").elements.importo.value;
  if (importo !== null) dom.byId("payForm").elements.importo.value = importo;
  await dom.byId("paySave").onclick();
  await done;
  return proposto;
}

// -----------------------------------------------------------------------------------------------------------------
//  i   d a t i
// -----------------------------------------------------------------------------------------------------------------

const OGGI = new Date().toISOString().slice(0, 10);
const giorno = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function popola(db, { paese = "IT" } = {}) {
  await put(db, "company", { id: "company", denominazione: "La Mia S.r.l.", paese, aliquotaPredefinita: "22" });
  await saveParty(db, { id: "f1", denominazione: "Hosting Cloud S.p.A.", ruolo: "fornitore" });
  await saveParty(db, { id: "f2", denominazione: "Studio Bianchi", ruolo: "entrambi" });
  await saveParty(db, { id: "c1", denominazione: "Rossi Impianti S.r.l." });
  // Tre acquisti: uno pagato, uno scaduto da dieci giorni, uno che scade fra venti.
  const pagato = await saveCost(db, { id: "a1", tipo: "fattura", partyId: "f1", data: "2026-01-10", numero: "H-1",
    imponibile: "100", aliquota: "22", scadenza: "2026-02-10" });
  await recordOutlay(db, pagato, { importo: "122.00", data: "2026-02-01" });
  await saveCost(db, { id: "a2", tipo: "fattura", partyId: "f2", data: giorno(-40), numero: "SB-7",
    imponibile: "1000", aliquota: "22", scadenza: giorno(-10) });
  await saveCost(db, { id: "a3", tipo: "spesa", partyId: "f1", data: giorno(-2), categoria: "software",
    imponibile: "50", aliquota: "0", scadenza: giorno(20) });
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   r u o l o
// -----------------------------------------------------------------------------------------------------------------

await prova("il ruolo decide i menù: un cliente puro non è un fornitore, e viceversa", async (db) => {
  await popola(db);
  const people = new Map((await list(db, "parties")).map((p) => [p.id, p]));
  assert.equal(isCustomer(people.get("c1")), true);
  assert.equal(isSupplier(people.get("c1")), false);
  assert.equal(isCustomer(people.get("f1")), false);
  assert.equal(isSupplier(people.get("f1")), true);
  assert.equal(isCustomer(people.get("f2")), true);
  assert.equal(isSupplier(people.get("f2")), true);
  // Un record di prima, senza ruolo, è un cliente: è quello che era.
  assert.equal(isCustomer({}), true);
  assert.equal(isSupplier({}), false);
  // E un ruolo inventato torna cliente al salvataggio.
  const strano = await saveParty(db, { id: "x", denominazione: "X", ruolo: "boh" });
  assert.equal(strano.ruolo, "cliente");
});

// -----------------------------------------------------------------------------------------------------------------
//  l ' e l e n c o
// -----------------------------------------------------------------------------------------------------------------

await prova("senza acquisti: l'invito, e niente tabella né filtri", async (db) => {
  await purchases.renderList(db);
  assert.equal(dom.byId("purchasesEmpty").hidden, false);
  assert.equal(dom.byId("purchasesTable").hidden, true);
  assert.equal(dom.byId("purchasesFilters").hidden, true);
  assert.equal(dom.text("purchasesOwed"), "");
});

await prova("tre acquisti: stato per riga, il totale da pagare in cima, «Paga» solo dove serve", async (db) => {
  await popola(db);
  await purchases.renderList(db);
  assert.equal(dom.byId("purchasesEmpty").hidden, true);
  assert.equal(dom.byId("purchasesTable").hidden, false);
  assert.equal(dom.count("purchasesBody"), 3);

  // Dal più recente: la spesa, la fattura scaduta, quella pagata.
  const righe = [0, 1, 2].map((n) => dom.byId("purchasesBody").at(n));
  assert.match(righe[0].allText, /software/);
  assert.match(righe[0].allText, /Da pagare/);
  assert.match(righe[1].allText, /SB-7/);
  assert.match(righe[1].allText, /Scaduto/);
  assert.ok(righe[1].at(4).classList.has("overdue"), "la scadenza passata è segnata");
  assert.match(righe[2].allText, /H-1/);
  assert.match(righe[2].allText, /Pagato/);
  assert.equal(righe[2].at(6).children.length, 0, "niente da pagare su un acquisto pagato");
  assert.equal(righe[1].at(6).children.length, 1);

  // 1.220 + 50, la pagata non conta.
  assert.equal(leggibile(dom.text("purchasesOwed")), "Da pagare: 1.270,00 €");
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   f o g l i o
// -----------------------------------------------------------------------------------------------------------------

await prova("il foglio calcola l'imposta e il totale, e senza fornitore non salva", async (db) => {
  await popola(db);
  await purchases.renderList(db);
  await dom.byId("purchasesNew").fire("click");
  assert.equal(dom.byId("costDialog").open, true);
  assert.equal(dom.text("costTaxLabel"), "IVA");
  const form = dom.byId("costForm");
  assert.equal(form.elements.aliquota.value, "22", "l'aliquota dell'azienda, proposta");
  assert.equal(form.elements.data.value, OGGI);

  // Il menù dei fornitori: i due con il ruolo, non il cliente puro.
  assert.deepEqual(form.elements.partyId.children.map((o) => o.value), ["", "f1", "f2"]);

  form.elements.imponibile.value = "1.000,00";
  await form.elements.imponibile.fire("input");
  assert.equal(form.elements.imposta.value, "220.00");
  assert.equal(leggibile(dom.text("costTotale")), "1.220,00 €");

  // L'imposta scritta a mano resta; l'aliquota cambiata la ricalcola.
  form.elements.imposta.value = "219.99";
  await form.elements.imposta.fire("input");
  assert.equal(leggibile(dom.text("costTotale")), "1.219,99 €");
  form.elements.imponibile.value = "2000";
  await form.elements.imponibile.fire("input");
  assert.equal(form.elements.imposta.value, "219.99", "non si tocca quello che è stato scritto");
  form.elements.aliquota.value = "10";
  await form.elements.aliquota.fire("change");
  assert.equal(form.elements.imposta.value, "200.00");

  form.elements.numero.value = "F-9";
  await dom.byId("costSave").fire("click");
  assert.equal(dom.byId("costProblems").hidden, false);
  assert.match(dom.text("costProblems"), /fornitore/);
  assert.equal(dom.byId("costDialog").open, true);
  assert.equal((await list(db, "costs")).length, 3, "niente scritto");

  form.elements.partyId.value = "f2";
  await dom.byId("costSave").fire("click");
  assert.equal(dom.byId("costDialog").open, false);
  const scritti = await list(db, "costs");
  assert.equal(scritti.length, 4);
  const nuovo = scritti.find((c) => c.numero === "F-9");
  assert.equal(nuovo.imponibile, "2000");
  assert.equal(nuovo.imposta, "200.00");
  assert.equal(nuovo.totale, "2200.00");
  assert.equal(nuovo.impostaTipo, "iva");
  assert.equal(dom.count("purchasesBody"), 4, "l'elenco si è ridisegnato");
});

await prova("per un'azienda sammarinese il foglio parla di monofase e propone il 17%", async (db) => {
  await popola(db, { paese: "SM" });
  await purchases.renderList(db);
  await dom.byId("purchasesNew").fire("click");
  assert.equal(dom.text("costTaxLabel"), "monofase");
  const form = dom.byId("costForm");
  assert.equal(form.elements.aliquota.value, "17");
  assert.deepEqual(form.elements.aliquota.children.map((o) => o.value), ["17", "8", "6", "2", "1", "0"]);
  assert.match(dom.text("costTaxNote"), /Ufficio Tributario/);
  await dom.byId("costCancel").fire("click");
  assert.equal(dom.byId("costDialog").open, false);
});

await prova("una spesa non ha il numero: la riga sparisce e non viene chiesta", async (db) => {
  await popola(db);
  await purchases.renderList(db);
  await dom.byId("purchasesNew").fire("click");
  const form = dom.byId("costForm");
  form.elements.tipo.value = "spesa";
  await form.elements.tipo.fire("change");
  assert.equal(dom.byId("costNumeroRow").hidden, true);
  form.elements.partyId.value = "f1";
  form.elements.imponibile.value = "12,50";
  await form.elements.imponibile.fire("input");
  form.elements.categoria.value = "viaggi";
  await dom.byId("costSave").fire("click");
  assert.equal(dom.byId("costDialog").open, false);
  const spesa = (await list(db, "costs")).find((c) => c.categoria === "viaggi");
  assert.equal(spesa.tipo, "spesa");
  assert.equal(spesa.numero, "");
  assert.equal(spesa.totale, "15.25");
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   s c h e d a
// -----------------------------------------------------------------------------------------------------------------

await prova("un acquisto che non c'è: la scheda lo dice al chiamante", async (db) => {
  assert.equal(await purchases.render(db, "nessuno"), false);
});

await prova("la scheda: i due numeri, poi un pagamento parziale e uno a saldo", async (db) => {
  await popola(db);
  assert.equal(await purchases.render(db, "a2"), true);
  assert.equal(dom.text("costName"), "Studio Bianchi");
  assert.match(dom.text("costMeta"), /SB-7/);
  assert.equal(leggibile(dom.text("costFigTotal")), "1.220,00 €");
  assert.equal(leggibile(dom.text("costFigOwed")), "1.220,00 €");
  assert.equal(dom.text("costFigOwedSub"), "Scaduto");
  assert.equal(dom.byId("costPay").hidden, false);
  assert.equal(dom.byId("costOutlaysEmpty").hidden, false);
  assert.equal(dom.byId("costLinesSection").hidden, true, "senza righe dall'XML la sezione sta via");

  // Il foglio degli incassi, con il verbo giusto e il residuo proposto.
  await pagando(() => dom.byId("costPay").fire("click"), "500");
  assert.equal(dom.text("payDialogTitle"), "Registra un pagamento");
  assert.equal(dom.count("costOutlaysBody"), 1);
  assert.equal(leggibile(dom.text("costFigOwed")), "720,00 €");
  assert.match(leggibile(dom.text("costOutlaysTotals")), /Pagato: 500,00 €/);

  // Il secondo propone quello che resta, e chiude.
  const proposto = await pagando(() => dom.byId("costPay").fire("click"));
  assert.equal(proposto, "720.00", "il residuo, già nel campo");
  assert.equal(dom.count("costOutlaysBody"), 2);
  assert.equal(leggibile(dom.text("costFigOwed")), "0,00 €");
  assert.equal(dom.text("costFigOwedSub"), "Pagato");
  assert.equal(dom.byId("costPay").hidden, true);
  const uscite = await outlaysOf(db, "a2");
  assert.deepEqual(uscite.map((u) => u.importo), ["500.00", "720.00"]);
});

await prova("togliere un pagamento riapre l'acquisto", async (db) => {
  await popola(db);
  await purchases.render(db, "a1");
  assert.equal(dom.text("costFigOwedSub"), "Pagato");
  const togli = dom.byId("costOutlaysBody").at(0).at(4).at(0);
  await dicendoSi(() => togli.fire("click"));
  assert.equal(dom.count("costOutlaysBody"), 0);
  assert.equal(leggibile(dom.text("costFigOwed")), "122,00 €");
  assert.equal(dom.text("costFigOwedSub"), "Scaduto");
});

await prova("le righe dall'XML si vedono, quando ci sono", async (db) => {
  await popola(db);
  await saveCost(db, { id: "a4", tipo: "fattura", partyId: "f1", data: "2026-03-01", numero: "X-1",
    imponibile: "300", aliquota: "22",
    righe: [{ descrizione: "Server", quantita: "2", prezzoUnitario: "100", aliquota: "22", imponibile: "200" },
            { descrizione: "Dominio", quantita: "1", prezzoUnitario: "100", aliquota: "22", imponibile: "100" }] });
  await purchases.render(db, "a4");
  assert.equal(dom.byId("costLinesSection").hidden, false);
  assert.equal(dom.count("costLinesBody"), 2);
  assert.match(dom.byId("costLinesBody").at(0).allText, /Server/);
});

await prova("eliminare l'acquisto porta via anche i pagamenti, e torna all'elenco", async (db) => {
  await popola(db);
  await purchases.render(db, "a1");
  assert.equal((await outlaysOf(db, "a1")).length, 1);
  await dicendoSi(() => dom.byId("costDelete").fire("click"));
  assert.equal(await getCost(db, "a1"), null);
  assert.equal((await outlaysOf(db, "a1")).length, 0, "nessun pagamento orfano");
  assert.equal(location.hash, "#/acquisti");
});

await prova("modificare dalla scheda: il foglio porta i valori, e il salvataggio ridisegna la scheda", async (db) => {
  await popola(db);
  await purchases.render(db, "a3");
  dom.byId("screenCost").hidden = false;
  await dom.byId("costEdit").fire("click");
  const form = dom.byId("costForm");
  assert.equal(dom.text("costDialogTitle"), "Modifica l'acquisto");
  assert.equal(form.elements.tipo.value, "spesa");
  assert.equal(form.elements.imponibile.value, "50.00");
  assert.equal(form.elements.partyId.value, "f1");
  form.elements.imponibile.value = "80";
  await form.elements.imponibile.fire("input");
  await dom.byId("costSave").fire("click");
  assert.equal(leggibile(dom.text("costFigTotal")), "80,00 €");
  assert.equal((await getCost(db, "a3")).totale, "80.00");
});

await prova("una nota di credito ricevuta: col meno nell'elenco, senza «Paga», e il foglio chiede il numero", async (db) => {
  await popola(db);
  await saveCost(db, { id: "n1", tipo: "nota", partyId: "f2", data: giorno(-1), numero: "NC-3", imponibile: "100", aliquota: "22" });
  await purchases.renderList(db);
  const prima = dom.byId("purchasesBody").at(0);
  assert.match(prima.allText, /NC-3/);
  assert.match(leggibile(prima.at(3).allText), /^-122,00 €$/);
  assert.match(prima.allText, /Pagato/);
  assert.equal(prima.at(6).children.length, 0, "niente da pagare su una nota");
  // Il totale da pagare non la conta: 1.220 + 50 come prima.
  assert.equal(leggibile(dom.text("purchasesOwed")), "Da pagare: 1.270,00 €");

  await purchases.render(db, "n1");
  assert.equal(leggibile(dom.text("costFigTotal")), "-122,00 €");
  assert.equal(dom.byId("costPay").hidden, true);
  assert.match(dom.text("costMeta"), /Nota di credito ricevuta/);

  dom.byId("screenCost").hidden = false;
  await dom.byId("costEdit").fire("click");
  const form = dom.byId("costForm");
  assert.equal(form.elements.tipo.value, "nota");
  await form.elements.tipo.fire("change");
  assert.equal(dom.byId("costNumeroRow").hidden, false, "una nota ha il numero");
  assert.equal(dom.byId("costNotaHint").hidden, false);
  await dom.byId("costCancel").fire("click");
});

console.log(`purchases: ${passed} prove passate`);
