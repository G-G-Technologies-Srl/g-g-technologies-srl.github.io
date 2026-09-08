// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La schermata di un progetto: le fasi, e l'albero delle pagine.
//
// Stesso mestiere di `customer.mjs` — il DOM finto di `fake-dom.mjs` sopra il deposito finto — e per
// la stessa ragione: il codice che disegna non ha una risposta da confrontare, quindi senza una
// prova si controlla aprendo la pagina, cioè dopo il rilascio.
//
// **L'albero delle pagine è il pezzo che merita una prova più di tutti.** Ha tre casi che non si
// vedono guardando: una madre cancellata, un file con un anello, e il limite di quattro livelli.
// I primi due fanno sparire del testo dall'elenco lasciandolo nel deposito, che è il modo peggiore
// di perdere qualcosa.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/project.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { install } from "./fake-dom.mjs";
import { reset } from "./fake-store.mjs";

const html = readFileSync(new URL("../run/index.html", import.meta.url), "utf8");
const dom = install(html);

const { openDatabase } = await import("../run/db.js");
const { setLang } = await import("../run/i18n.js");
const { saveParty } = await import("../run/parties.js");
const { issue } = await import("../run/model.js");

// Quello che serve a `issue`: un documento si emette solo se passa i controlli.
const COMPANY = {
  denominazione: "Esempio S.r.l.", partitaIva: "01234567897", paese: "IT", regimeFiscale: "RF01",
  sede: { indirizzo: "Via Prova", numeroCivico: "1", cap: "47899", comune: "Serravalle", provincia: "RN" },
};
const PARTY = {
  denominazione: "Cliente S.p.A.", partitaIva: "09876543217", codiceDestinatario: "ABCDEFG",
  sede: { indirizzo: "Corso Esempio", numeroCivico: "2", cap: "20100", comune: "Milano", provincia: "MI" },
};
const CONTEXT = { company: COMPANY, party: PARTY };
const progetti = await import("../run/projects.js");
const plan = await import("gg/plan-model.js");
const project = await import("../run/project.js");

setLang("it");
project.connect(await openDatabase(), {});

let passed = 0;
async function prova(nome, fn) {
  try {
    reset();
    dom.reset();
    const db = await openDatabase();
    await progetti.setup(db);
    await fn(db);
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

/** Il titolo di ogni riga dell'elenco, con la sua profondità. */
function alberoDisegnato() {
  return dom.byId("projPagesList").children.map((riga) => [
    riga.at(0).allText,
    Number((/depth-(\d)/.exec(riga.className) || [0, 0])[1]),
  ]);
}

/** La risposta scritta al dialogo del titolo: la domanda aspetta un click, e qui glielo si dà. */
async function chiamandola(nome, azione) {
  const done = azione();
  dom.byId("promptField").value = nome;
  await dom.byId("promptOk").fire("click");
  return done;
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   p a g i n e ,   i n   a l b e r o
// -----------------------------------------------------------------------------------------------------------------

await prova("le pagine si disegnano in albero, madri prima delle figlie", async (db) => {
  await saveParty(db, { id: "p1", denominazione: "Rossi Impianti S.r.l." });
  const lavoro = progetti.create({ name: "Capannone", partyId: "p1" });
  const capitolato = plan.createPage(lavoro.id, { title: "Capitolato" });
  const impianti = plan.createPage(lavoro.id, { title: "Impianti", parentId: capitolato.id });
  plan.createPage(lavoro.id, { title: "Elettrico", parentId: impianti.id });
  plan.createPage(lavoro.id, { title: "Verbale del sopralluogo" });

  assert.equal(await project.render(db, lavoro.id), true);
  assert.deepEqual(alberoDisegnato(), [
    ["Capitolato", 0],
    ["Impianti", 1],
    ["Elettrico", 2],
    ["Verbale del sopralluogo", 0],
  ]);
});

await prova("cancellata la madre, le figlie salgono al suo posto invece di finire in fondo", async (db) => {
  // `trashPage` marca solo la pagina che riceve: le figlie restano nel deposito con una madre che
  // non c'è più. Senza la regola dell'orfano non comparirebbero in nessun elenco — testo che c'è e
  // non si vede, che è il modo peggiore di perdere qualcosa.
  //
  // **La prova guarda l'ordine, non solo la presenza**, e la ragione è che rompendo di proposito la
  // regola dell'orfano la prova passava lo stesso: la rete che raccoglie quello che l'albero non ha
  // toccato le rimetteva in fondo, e «ci sono tutte» era vero in tutti e due i casi. Al suo posto
  // vuol dire fra le sorelle, dov'era la madre.
  const lavoro = progetti.create({ name: "Capannone" });
  const madre = plan.createPage(lavoro.id, { title: "Capitolato" });
  plan.createPage(lavoro.id, { title: "Impianti", parentId: madre.id });
  plan.createPage(lavoro.id, { title: "Verbale del sopralluogo" });

  plan.trashPage(madre.id);
  await project.render(db, lavoro.id);
  assert.deepEqual(alberoDisegnato(), [["Impianti", 0], ["Verbale del sopralluogo", 0]]);
});

await prova("un anello fra due pagine le lascia in cima, non le nasconde", async (db) => {
  // Può arrivare solo da un file scritto a mano, e l'esito da evitare è che nessuna delle due
  // compaia: senza radice da cui scendere, la discesa non le raggiungerebbe mai.
  const lavoro = progetti.create({ name: "Capannone" });
  const una = plan.createPage(lavoro.id, { title: "Prima" });
  const altra = plan.createPage(lavoro.id, { title: "Seconda", parentId: una.id });
  plan.updatePage(una.id, { parentId: altra.id });

  await project.render(db, lavoro.id);
  const titoli = alberoDisegnato().map(([titolo]) => titolo).sort();
  assert.deepEqual(titoli, ["Prima", "Seconda"], "tutt'e due compaiono, comunque");
});

// -----------------------------------------------------------------------------------------------------------------
//  c r e a r e ,   e   i l   l i m i t e
// -----------------------------------------------------------------------------------------------------------------

await prova("il « + » sulla pagina aperta fa una sotto-pagina", async (db) => {
  const lavoro = progetti.create({ name: "Capannone" });
  const madre = plan.createPage(lavoro.id, { title: "Capitolato" });
  await project.render(db, lavoro.id);
  assert.equal(dom.byId("projPagesList").children.length, 1);

  // La riga della pagina aperta porta il collegamento, il «+» e la «×»; le altre solo il nome.
  const riga = dom.byId("projPagesList").at(0);
  assert.equal(riga.children.length, 3, "la pagina aperta ha i suoi due comandi");
  await chiamandola("Impianti", () => riga.at(1).fire("click"));

  assert.deepEqual(alberoDisegnato(), [["Capitolato", 0], ["Impianti", 1]]);
  assert.equal(plan.page(plan.pagesOf(lavoro.id)[1].id).parentId, madre.id);
});

await prova("oltre il quarto livello lo dice, invece di fare una scala", async (db) => {
  const lavoro = progetti.create({ name: "Capannone" });
  let parentId = null;
  const ids = [];
  for (const titolo of ["Uno", "Due", "Tre", "Quattro", "Cinque"]) {
    parentId = plan.createPage(lavoro.id, { title: titolo, parentId }).id;
    ids.push(parentId);
  }
  await project.render(db, lavoro.id);
  assert.equal(plan.depthOf(parentId), 4, "la più profonda è al quarto livello");
  assert.deepEqual(alberoDisegnato().map(([, livello]) => livello), [0, 1, 2, 3, 4]);

  // Si apre la più profonda — il disegno apre la prima — e da lì si chiede una sotto-pagina.
  const righe = dom.byId("projPagesList").children;
  await righe[4].at(0).fire("click");
  const aperta = dom.byId("projPagesList").children.find((riga) => riga.children.length === 3);
  assert.equal(aperta.at(0).allText, "Cinque", "la pagina aperta è quella in fondo");

  const done = aperta.at(1).fire("click");
  await dom.byId("askOk").fire("click");
  await done;
  assert.equal(plan.pagesOf(lavoro.id).length, 5, "niente sesto livello");
  assert.match(dom.text("askText"), /quattro livelli/);
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   f a s i ,   e   i   n u m e r i
// -----------------------------------------------------------------------------------------------------------------

await prova("le fasi si disegnano con l'importo come lo scrive una persona", async (db) => {
  const lavoro = progetti.create({ name: "Capannone" });
  progetti.addTask(lavoro.id, { title: "Acconto alla firma", importo: "4560.00" });
  await project.render(db, lavoro.id);
  assert.equal(dom.count("projPhasesBody"), 1);
  const importo = dom.byId("projPhasesBody").at(0).at(2).at(0);
  assert.equal(importo.value, "4.560,00", "e non nella forma del deposito");
});

await prova("il comando «fattura le fasi fatte» compare solo quando c'è qualcosa da fatturare", async (db) => {
  const lavoro = progetti.create({ name: "Capannone" });
  const fase = progetti.addTask(lavoro.id, { title: "Acconto", importo: "1000.00" });
  await project.render(db, lavoro.id);
  assert.equal(dom.byId("projInvoice").hidden, true, "niente di fatto, niente da fatturare");

  const finale = progetti.project(lavoro.id).columns.find((one) => one.done);
  plan.moveTask(fase.id, finale.id);
  await project.render(db, lavoro.id);
  assert.equal(dom.byId("projInvoice").hidden, false);
});

await prova("una fase su una bozza dice «in bozza», su una fattura emessa «fatturata»", async (db) => {
  // I quattro numeri non contano la bozza nel fatturato: se la fase dicesse «fatturata» la persona
  // cercherebbe quel denaro nel numero sbagliato.
  const lavoro = progetti.create({ name: "Capannone", partyId: "p1" });
  const fase = progetti.addTask(lavoro.id, { title: "Acconto", importo: "1000.00" });
  const finale = progetti.project(lavoro.id).columns.find((one) => one.done);
  plan.moveTask(fase.id, finale.id);
  const bozza = await progetti.invoiceDone(db, lavoro.id, {});

  await project.render(db, lavoro.id);
  const segno = () => dom.byId("projPhasesBody").at(0).at(4).at(0).allText;
  assert.equal(segno(), "in bozza");

  await issue(db, bozza, CONTEXT);
  await project.render(db, lavoro.id);
  assert.equal(segno(), "fatturata");
});

console.log(`project: ${passed} prove passate`);
