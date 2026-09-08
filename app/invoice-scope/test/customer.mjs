// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La scheda di un cliente, disegnata davvero: `customer.js` sopra il DOM finto di `fake-dom.mjs` e
// il deposito finto di `fake-store.mjs`.
//
// **È la prima prova di una schermata di questa app**, e c'è per il difetto che nessun altro test
// vedeva: il codice che disegna non ha una risposta da confrontare, quindi si controllava aprendo la
// pagina — cioè dopo il rilascio, e spesso sullo schermo di chi la usa. Un id sbagliato, un `hidden`
// che resta acceso, un comando armato che non chiama niente: qui saltano subito, e per nome.
//
// Il markup è quello vero, letto da `run/index.html`: un id che nel file non c'è fa fallire la prova
// invece di rispondere `null` come farebbe il browser.
//
// **I documenti sono scritti a mano**, e non passano da `issue()`: quello che si prova qui è cosa
// mostra la schermata, e il modello ha già cinquantasette prove sue. Il diario e le persone invece
// passano dalle funzioni vere, perché sono la cosa in prova.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/customer.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { install } from "./fake-dom.mjs";
import { reset } from "./fake-store.mjs";

const html = readFileSync(new URL("../run/index.html", import.meta.url), "utf8");
const dom = install(html);

// Dopo `install`: questi moduli non toccano il DOM al caricamento, ma il giorno in cui uno lo
// facesse è meglio che la prova se ne accorga qui e non con un errore senza nome.
const { openDatabase } = await import("../run/db.js");
const { setLang } = await import("../run/i18n.js");
const { from } = await import("../run/decimal.js");
const { put } = await import("gg/store.js");
const { saveParty } = await import("../run/parties.js");
const { saveActivity, activitiesOf, contactsOf } = await import("../run/crm.js");
const { get } = await import("gg/store.js");
const customer = await import("../run/customer.js");
const progetti = await import("../run/projects.js");

setLang("it");

// **I comandi si armano una volta**, come in una pagina che si carica una volta: `connect` aggiunge
// ascoltatori, e chiamarla in ogni prova ne accumulerebbe una pila — un click salverebbe la stessa
// voce quattro volte. Il deposito su cui lavorano lo aggiorna `render`, a ogni prova.
customer.connect(await openDatabase());

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

// -----------------------------------------------------------------------------------------------------------------
//  u n   c l i e n t e   c o n   d e n t r o   q u a l c o s a
// -----------------------------------------------------------------------------------------------------------------

const CLIENTE = {
  id: "p1",
  denominazione: "Rossi Impianti S.r.l.",
  partitaIva: "01335577993",
  codiceDestinatario: "M5UXCR1",
  paese: "IT",
  indirizzo: "Via Emilia",
  numeroCivico: "140",
  cap: "40068",
  comune: "Bologna",
  provincia: "BO",
  contatti: [
    { nome: "Chiara Rossi", ruolo: "Acquisti", email: "chiara@example.com", telefono: "051 000111" },
    { nome: "Ivan Baldi", ruolo: "Officina", email: "", telefono: "051 000112" },
  ],
};

const euro = (testo) => from(testo).toString();

async function popola(db) {
  const party = await saveParty(db, CLIENTE);
  await saveParty(db, { id: "p2", denominazione: "Brandi & Figli S.n.c." });
  // Due fatture e una nota di credito che ne storna una parte, più un documento di un altro
  // cliente: il fatturato in cima è la somma delle prime due meno la terza, e la quarta non
  // c'entra niente.
  await put(db, "docs", { id: "d1", tipo: "TD01", stato: "emesso", partyId: "p1", numero: "1",
                          data: "2026-03-02", totali: { totale: euro("1220.00") },
                          pagamento: { rate: [{ scadenza: "2026-04-02" }] } });
  await put(db, "docs", { id: "d2", tipo: "TD01", stato: "emesso", partyId: "p1", numero: "2",
                          data: "2026-05-10", totali: { totale: euro("610.00") },
                          pagamento: { rate: [{ scadenza: "2026-06-10" }] } });
  // La nota di credito nomina la fattura che storna, come fa `creditNote()` nel modello: senza il
  // collegamento non toglierebbe niente allo scadenzario, e lo scadenzario è uno dei due numeri.
  await put(db, "docs", { id: "d3", tipo: "TD04", stato: "emesso", partyId: "p1", numero: "1",
                          data: "2026-05-20", totali: { totale: euro("110.00") },
                          fattureCollegate: [{ numero: "1", data: "2026-03-02" }] });
  await put(db, "docs", { id: "d4", tipo: "TD01", stato: "emesso", partyId: "p2", numero: "3",
                          data: "2026-06-01", totali: { totale: euro("500.00") } });
  await saveActivity(db, { partyId: "p1", tipo: "incontro", data: "2026-02-01",
                           testo: "In officina da loro." });
  await saveActivity(db, { partyId: "p1", tipo: "chiamata", data: "2026-03-01",
                           testo: "Richiamare Chiara la settimana del 20." });
  await saveActivity(db, { partyId: "p2", tipo: "nota", data: "2026-09-01", testo: "Di un altro." });
  return party;
}

/**
 * Il testo di un nodo con lo spazio insecabile riportato a uno normale.
 *
 * `money()` mette uno spazio insecabile fra il numero e l'euro, di proposito — un importo non si
 * spezza a capo — e senza questa riga le prove sugli importi confrontavano due stringhe che si
 * leggono identiche e non lo sono. Un fallimento in cui la differenza non si vede.
 */
const leggibile = (testo) => String(testo).replace(/\u00a0/g, " ");

/** Il sì del dialogo di conferma: la domanda aspetta un click, e qui glielo si dà. */
async function dicendoSi(azione) {
  const done = azione();
  await dom.byId("askOk").fire("click");
  return done;
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   p r o v e
// -----------------------------------------------------------------------------------------------------------------

await prova("un cliente che non c'è più: la schermata lo dice al chiamante, invece di restare vuota", async (db) => {
  assert.equal(await customer.render(db, "non-esiste"), false);
  assert.equal(await customer.render(db, null), false);
});

await prova("il cliente in cima: nome, riga di riconoscimento, i due numeri", async (db) => {
  await popola(db);
  assert.equal(await customer.render(db, "p1"), true);
  assert.equal(dom.text("custName"), "Rossi Impianti S.r.l.");

  const riga = dom.text("custMeta");
  assert.match(riga, /01335577993/);
  assert.match(riga, /Via Emilia 140/);
  assert.match(riga, /40068 Bologna \(BO\)/);
  assert.match(riga, /SDI M5UXCR1/);
  assert.ok(!riga.includes("Italia"), "il paese si scrive quando non è il proprio");

  // 1.220,00 + 610,00 − 110,00: la nota di credito toglie, e questa è la riga in cui si sbaglia.
  assert.equal(leggibile(dom.text("custBilled")), "1.720,00 €");
  // Le due rate non incassate, e nient'altro: la nota di credito chiude la più vecchia.
  assert.equal(leggibile(dom.text("custDue")), "1.720,00 €");
});

await prova("le persone: due righe, email e telefono come collegamenti", async (db) => {
  await popola(db);
  await customer.render(db, "p1");
  assert.equal(dom.byId("custContactsEmpty").hidden, true);
  assert.equal(dom.byId("custContactsTable").hidden, false);
  assert.equal(dom.count("custContactsBody"), 2);

  const prima = dom.byId("custContactsBody").at(0);
  assert.match(prima.allText, /Chiara Rossi/);
  assert.match(prima.allText, /Acquisti/);
  assert.equal(prima.at(2).at(0).href, "mailto:chiara@example.com");
  assert.equal(prima.at(3).at(0).href, "tel:051000112".replace("112", "111"));
  // Chi non ha l'email ha un trattino, non un collegamento vuoto.
  assert.equal(dom.byId("custContactsBody").at(1).at(2).allText, "—");
});

await prova("un cliente appena creato: gli elenchi vuoti lo dicono, e le tabelle stanno via", async (db) => {
  await saveParty(db, { id: "p9", denominazione: "Appena Nato S.r.l." });
  await customer.render(db, "p9");
  assert.equal(dom.byId("custContactsEmpty").hidden, false);
  assert.equal(dom.byId("custContactsTable").hidden, true);
  assert.equal(dom.byId("custDiaryEmpty").hidden, false);
  assert.equal(dom.byId("custDocsEmpty").hidden, false);
  assert.equal(dom.byId("custDocsTable").hidden, true);
  assert.equal(leggibile(dom.text("custBilled")), "0,00 €");
});

await prova("il diario: le sue voci, dalla più recente, con data e tipo", async (db) => {
  await popola(db);
  await customer.render(db, "p1");
  assert.equal(dom.count("custDiary"), 2, "solo le sue");
  const prima = dom.byId("custDiary").at(0);
  assert.match(prima.allText, /01\/03\/2026/);
  assert.match(prima.allText, /Telefonata/);
  assert.match(prima.allText, /Richiamare Chiara/);
  assert.match(dom.byId("custDiary").at(1).allText, /Incontro/);
});

await prova("i suoi documenti, e non quelli di un altro cliente", async (db) => {
  await popola(db);
  await customer.render(db, "p1");
  assert.equal(dom.count("custDocsBody"), 3);
  const testo = leggibile(dom.byId("custDocsBody").allText);
  assert.match(testo, /Fattura/);
  assert.match(testo, /Nota di credito/);
  assert.ok(!testo.includes("500,00"), "il documento dell'altro cliente non compare");
  // La nota di credito porta il segno meno anche qui, come nell'elenco generale.
  assert.match(testo, /-110,00 €/);
});

await prova("una voce nuova: si scrive, si salva, compare in cima", async (db) => {
  await popola(db);
  await customer.render(db, "p1");

  assert.equal(dom.byId("custDate").value, new Date().toISOString().slice(0, 10),
    "la data di oggi è già dentro");
  assert.equal(dom.byId("custAdd").textContent, "Aggiungi");

  dom.byId("custText").value = "  Mandato il preventivo  ";
  // Il tipo: il secondo bottone del gruppo è «Telefonata».
  await dom.byId("custKinds").at(1).fire("click");
  await dom.byId("custAdd").fire("click");

  const voci = await activitiesOf(db, "p1");
  assert.equal(voci.length, 3);
  assert.equal(voci[0].testo, "Mandato il preventivo");
  assert.equal(voci[0].tipo, "chiamata");
  assert.equal(dom.byId("custText").value, "", "la riga si svuota per la voce dopo");
  assert.equal(dom.count("custDiary"), 3);
});

await prova("una voce senza testo non si scrive, e lo dice", async (db) => {
  await popola(db);
  await customer.render(db, "p1");
  dom.byId("custText").value = "   ";
  await dom.byId("custAdd").fire("click");
  assert.equal(dom.byId("custProblem").hidden, false);
  assert.match(dom.text("custProblem"), /Scrivi cosa è successo/);
  assert.equal((await activitiesOf(db, "p1")).length, 2, "e non ne è nata nessuna");
});

await prova("modificare una voce riusa la riga in cima, e non ne crea una seconda", async (db) => {
  await popola(db);
  await customer.render(db, "p1");

  // «Modifica» sulla prima voce dell'elenco.
  const testa = dom.byId("custDiary").at(0).at(0);
  await testa.at(2).at(0).fire("click");
  assert.equal(dom.byId("custText").value, "Richiamare Chiara la settimana del 20.");
  assert.equal(dom.byId("custDate").value, "2026-03-01", "con la sua data, non con oggi");
  assert.equal(dom.byId("custAdd").textContent, "Salva");
  assert.equal(dom.byId("custCancel").hidden, false, "e una via d'uscita");
  // La voce in modifica si accende nell'elenco: senza, il testo comparirebbe in cima con l'elenco
  // identico a prima, che è il modo in cui si finisce per salvarne due.
  assert.ok(dom.byId("custDiary").at(0).classList.has("editing"));

  dom.byId("custText").value = "Richiamata fatta.";
  await dom.byId("custAdd").fire("click");
  const voci = await activitiesOf(db, "p1");
  assert.equal(voci.length, 2, "modificata, non aggiunta");
  assert.equal(voci[0].testo, "Richiamata fatta.");
  assert.equal(dom.byId("custAdd").textContent, "Aggiungi", "la riga torna quella di una voce nuova");
  assert.equal(dom.byId("custCancel").hidden, true);
});

await prova("«lascia stare» durante una modifica non tocca la voce", async (db) => {
  await popola(db);
  await customer.render(db, "p1");
  await dom.byId("custDiary").at(0).at(0).at(2).at(0).fire("click");
  dom.byId("custText").value = "questo non deve arrivare";
  await dom.byId("custCancel").fire("click");
  assert.equal((await activitiesOf(db, "p1"))[0].testo, "Richiamare Chiara la settimana del 20.");
  assert.equal(dom.byId("custText").value, "");
  assert.ok(!dom.byId("custDiary").at(0).classList.has("editing"), "e la voce si spegne");
});

await prova("una voce si elimina rispondendo sì, e l'elenco si accorcia", async (db) => {
  await popola(db);
  await customer.render(db, "p1");
  const togli = dom.byId("custDiary").at(0).at(0).at(2).at(1);
  await dicendoSi(() => togli.fire("click"));
  assert.equal((await activitiesOf(db, "p1")).length, 1);
  assert.equal(dom.count("custDiary"), 1);
});

await prova("una persona nuova passa dal foglio, e finisce nel record del cliente", async (db) => {
  await popola(db);
  await customer.render(db, "p1");

  await dom.byId("custContactNew").fire("click");
  assert.equal(dom.byId("contactDialog").open, true);
  assert.equal(dom.text("contactDialogTitle"), "Aggiungi una persona");
  assert.equal(dom.byId("contactDelete").hidden, true, "una persona nuova non si elimina");

  const form = dom.byId("contactForm");
  form.elements.nome.value = "Luisa Marchi";
  form.elements.ruolo.value = "Amministrazione";
  await dom.byId("contactSave").fire("click");

  assert.equal(dom.byId("contactDialog").open, false);
  const salvato = await get(db, "parties", "p1");
  assert.deepEqual(contactsOf(salvato).map((c) => c.nome),
    ["Chiara Rossi", "Ivan Baldi", "Luisa Marchi"]);
  assert.equal(dom.count("custContactsBody"), 3);
  // E l'indirizzo del cliente non se n'è andato: `saveParty` ricostruisce il record da campi piatti.
  assert.equal(salvato.sede.comune, "Bologna");
});

await prova("una persona senza nome non si salva, e il foglio resta aperto", async (db) => {
  await popola(db);
  await customer.render(db, "p1");
  await dom.byId("custContactNew").fire("click");
  dom.byId("contactForm").elements.nome.value = "  ";
  await dom.byId("contactSave").fire("click");
  assert.equal(dom.byId("contactDialog").open, true);
  assert.equal(dom.byId("contactProblem").hidden, false);
  assert.equal(contactsOf(await get(db, "parties", "p1")).length, 2);
});

await prova("una persona si corregge, e resta una", async (db) => {
  await popola(db);
  await customer.render(db, "p1");
  await dom.byId("custContactsBody").at(0).fire("click");
  assert.equal(dom.text("contactDialogTitle"), "Modifica la persona");
  assert.equal(dom.byId("contactForm").elements.nome.value, "Chiara Rossi");
  assert.equal(dom.byId("contactDelete").hidden, false);
  dom.byId("contactForm").elements.ruolo.value = "Direzione acquisti";
  await dom.byId("contactSave").fire("click");
  const people = contactsOf(await get(db, "parties", "p1"));
  assert.equal(people.length, 2);
  assert.equal(people[0].ruolo, "Direzione acquisti");
});

await prova("una persona si toglie dalla sua riga, rispondendo sì", async (db) => {
  await popola(db);
  await customer.render(db, "p1");
  const togli = dom.byId("custContactsBody").at(0).at(4).at(0);
  await dicendoSi(() => togli.fire("click"));
  assert.deepEqual(contactsOf(await get(db, "parties", "p1")).map((c) => c.nome), ["Ivan Baldi"]);
  assert.equal(dom.count("custContactsBody"), 1);
});

await prova("in inglese la schermata parla inglese, numeri compresi", async (db) => {
  await popola(db);
  setLang("en");
  try {
      await customer.render(db, "p1");
    assert.equal(dom.byId("custAdd").textContent, "Add");
    assert.match(dom.byId("custDiary").at(0).allText, /Call/);
    assert.equal(leggibile(dom.text("custBilled")), "1,720.00 €",
      "e il separatore delle migliaia cambia");
    assert.match(dom.text("custMeta"), /partita IVA|VAT/, "l'etichetta del codice segue la lingua");
  } finally {
    setLang("it");
  }
});

// -----------------------------------------------------------------------------------------------------------------
//  i   s u o i   p r o g e t t i
// -----------------------------------------------------------------------------------------------------------------

await prova("i progetti del cliente compaiono sulla sua scheda, e solo se ce ne sono", async (db) => {
  await saveParty(db, CLIENTE);
  await progetti.setup(db);
  await customer.render(db, "p1");
  assert.equal(dom.byId("custProjects").hidden, true, "senza progetti la sezione non c'è");

  progetti.create({ name: "Capannone", partyId: "p1" });
  progetti.create({ name: "Di un altro", partyId: "p2" });
  await customer.render(db, "p1");
  assert.equal(dom.byId("custProjects").hidden, false);
  assert.equal(dom.count("custProjectsBody"), 1, "solo i suoi");
  assert.equal(dom.byId("custProjectsBody").at(0).at(0).allText, "Capannone");
});

console.log(`customer: ${passed} prove passate`);
