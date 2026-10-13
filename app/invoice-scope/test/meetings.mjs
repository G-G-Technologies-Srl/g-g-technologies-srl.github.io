// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The CRM screen, drawn for real: `meetings.js` over the fake DOM and the fake store.
//
// What is tried here is what only the screen can get wrong: a group shown empty or hidden full, a
// sheet that saves without the people ticked, an outcome written that leaves the meeting among those
// to write up, a meeting planned here that the customer's diary does not see.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/meetings.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { install } from "./fake-dom.mjs";
import { reset } from "./fake-store.mjs";

const html = readFileSync(new URL("../run/index.html", import.meta.url), "utf8");
const dom = install(html);

const { openDatabase } = await import("../run/db.js");
const { setLang } = await import("../run/i18n.js");
const { saveParty } = await import("../run/parties.js");
const { saveActivity, activitiesOf, MEETING } = await import("../run/crm.js");
const meetings = await import("../run/meetings.js");

setLang("it");
meetings.connect(await openDatabase());

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

async function dicendoSi(azione) {
  const done = azione();
  await new Promise((r) => setTimeout(r, 0));
  await dom.byId("askOk").fire("click");
  return done;
}

const giorno = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function popola(db) {
  await saveParty(db, {
    id: "p1", denominazione: "Rossi Impianti S.r.l.",
    contatti: [{ id: "c1", nome: "Chiara Rossi", ruolo: "Acquisti" }, { id: "c2", nome: "Ivan Baldi" }],
  });
  await saveParty(db, { id: "p2", denominazione: "Brandi & Figli S.n.c." });
  await saveParty(db, { id: "f1", denominazione: "Hosting S.p.A.", ruolo: "fornitore" });
  await saveActivity(db, { id: "m1", partyId: "p1", tipo: MEETING, data: giorno(3), ora: "10:00", luogo: "Bologna", testo: "Presentazione dell'offerta" });
  await saveActivity(db, { id: "m2", partyId: "p2", tipo: MEETING, data: giorno(-2), testo: "Sopralluogo" });
  await saveActivity(db, { id: "m3", partyId: "p1", tipo: MEETING, data: giorno(-20), testo: "Primo contatto", esito: "Interessati" });
  await saveActivity(db, { id: "n1", partyId: "p1", tipo: "nota", data: giorno(-1), testo: "Una nota, non un incontro" });
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   l i s t
// -----------------------------------------------------------------------------------------------------------------

await prova("senza incontri la schermata lo dice, e i tre gruppi stanno via", async (db) => {
  await meetings.render(db);
  assert.equal(dom.byId("crmEmpty").hidden, false);
  for (const id of ["crmUpcoming", "crmToWrite", "crmDone"]) assert.equal(dom.byId(id).hidden, true, id);
  assert.equal(dom.byId("crmFilters").hidden, true);
});

await prova("ogni incontro nel suo gruppo, e la nota da nessuna parte", async (db) => {
  await popola(db);
  await meetings.render(db);
  assert.equal(dom.byId("crmEmpty").hidden, true);
  assert.equal(dom.count("crmUpcomingBody"), 1);
  assert.match(dom.byId("crmUpcomingBody").at(0).allText, /Rossi Impianti.*Presentazione.*Bologna/s);
  assert.equal(dom.count("crmToWriteBody"), 1);
  assert.match(dom.byId("crmToWriteBody").at(0).allText, /Brandi/);
  assert.equal(dom.count("crmDoneBody"), 1);
  assert.match(dom.byId("crmDoneBody").at(0).allText, /Interessati/);
  assert.doesNotMatch(dom.text("crmUpcomingBody") + dom.text("crmToWriteBody") + dom.text("crmDoneBody"), /Una nota/);
});

await prova("il filtro compare con due clienti, e mostra solo quello scelto", async (db) => {
  await popola(db);
  await meetings.render(db);
  assert.equal(dom.byId("crmFilters").hidden, false);
  dom.byId("crmParty").value = "p2";
  await dom.byId("crmParty").fire("change", { target: { value: "p2" } });
  assert.equal(dom.byId("crmUpcoming").hidden, true);
  assert.equal(dom.count("crmToWriteBody"), 1);
  assert.equal(dom.byId("crmDone").hidden, true);
  dom.byId("crmParty").value = "";
  await dom.byId("crmParty").fire("change", { target: { value: "" } });
});

// -----------------------------------------------------------------------------------------------------------------
//  t h e   s h e e t
// -----------------------------------------------------------------------------------------------------------------

await prova("un incontro nuovo: cliente, ora, luogo, le persone spuntate", async (db) => {
  await popola(db);
  await meetings.render(db);
  await dom.byId("meetingNew").fire("click");
  assert.equal(dom.byId("meetingDialog").open, true);
  assert.equal(dom.byId("meetingDelete").hidden, true);
  const form = dom.byId("meetingForm").elements;
  // Nel menù i clienti, non il fornitore puro.
  const voci = form.partyId.children.map((option) => option.value);
  assert.deepEqual(voci, ["", "p2", "p1"], "in ordine di nome, il fornitore escluso");

  form.partyId.value = "p1";
  await form.partyId.fire("change");
  assert.equal(dom.count("meetingPeople"), 2, "le due persone del cliente");
  dom.byId("meetingPeople").at(1).at(0).checked = true;
  form.data.value = giorno(7);
  form.ora.value = "15:30";
  form.luogo.value = "In videochiamata";
  form.testo.value = "Avanzamento del progetto";
  await dom.byId("meetingSave").fire("click");

  assert.equal(dom.byId("meetingDialog").open, false);
  const nuovo = (await activitiesOf(db, "p1")).find((one) => one.testo === "Avanzamento del progetto");
  assert.ok(nuovo, "è nel diario del cliente");
  assert.equal(nuovo.tipo, MEETING);
  assert.equal(nuovo.ora, "15:30");
  assert.deepEqual(nuovo.persone, ["c2"]);
  assert.equal(dom.count("crmUpcomingBody"), 2, "e la lista si è ridisegnata");
});

await prova("senza cliente e senza argomento il foglio resta aperto e dice perché", async (db) => {
  await popola(db);
  await meetings.render(db);
  await dom.byId("meetingNew").fire("click");
  await dom.byId("meetingSave").fire("click");
  assert.equal(dom.byId("meetingDialog").open, true);
  assert.match(dom.text("meetingProblems"), /Scegliete il cliente.*Scrivete l'argomento/s);
  await dom.byId("meetingCancel").fire("click");
});

await prova("scritto l'esito, l'incontro passa da «da annotare» a «conclusi»", async (db) => {
  await popola(db);
  await meetings.render(db);
  const bottone = dom.byId("crmToWriteBody").at(0).at(3).at(0);
  await bottone.fire("click");
  const form = dom.byId("meetingForm").elements;
  assert.equal(form.testo.value, "Sopralluogo");
  assert.equal(document.activeElement, form.esito, "il fuoco va sull'esito");
  form.esito.value = "Misure prese, preventivo entro venerdì";
  await dom.byId("meetingSave").fire("click");
  assert.equal(dom.byId("crmToWrite").hidden, true);
  assert.equal(dom.count("crmDoneBody"), 2);
  assert.equal((await activitiesOf(db, "p2"))[0].esito, "Misure prese, preventivo entro venerdì");
});

await prova("eliminato dalla lista, sparisce anche dal diario", async (db) => {
  await popola(db);
  await meetings.render(db);
  await dicendoSi(() => dom.byId("crmUpcomingBody").at(0).at(5).at(1).fire("click"));
  assert.equal(dom.byId("crmUpcoming").hidden, true);
  assert.equal((await activitiesOf(db, "p1")).some((one) => one.id === "m1"), false);
});

await prova("aperto dalla scheda di un cliente, il foglio ha già il cliente scelto", async (db) => {
  await popola(db);
  let richiamato = 0;
  await meetings.openSheet(db, { partyId: "p2", afterSave: async () => { richiamato += 1; } });
  const form = dom.byId("meetingForm").elements;
  assert.equal(form.partyId.value, "p2");
  assert.equal(dom.byId("meetingPeopleEmpty").hidden, false, "il cliente non ha persone, e lo si dice");
  form.testo.value = "Telefonata diventata incontro";
  await dom.byId("meetingSave").fire("click");
  assert.equal(richiamato, 1, "chi l'ha aperto viene avvisato");
});

console.log(`meetings: ${passed} prove passate`);
