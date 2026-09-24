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

// -----------------------------------------------------------------------------------------------------------------
//  t h e   b i n ,   a n d   t h e   s t r i p   t h a t   u n d o e s
// -----------------------------------------------------------------------------------------------------------------

const { t: tr } = await import("../run/i18n.js");
const fakeEditor = await import("./fake-editor.mjs");
const { hideSnack } = await import("../run/snack.js");

/** A moment for the promises that follow a click: an answer opens the next question in a microtask. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

await prova("una fase si elimina senza domande, e la striscia la rimette al suo posto", async (db) => {
  const lavoro = progetti.create({ name: "Capannone" });
  progetti.addTask(lavoro.id, { title: "Acconto" });
  location.hash = `#/progetto/${lavoro.id}`;
  await project.render(db, lavoro.id);

  await dom.byId("projPhasesBody").at(0).at(4).at(0).fire("click");
  assert.equal(dom.byId("ask").open, false, "nessuna domanda prima");
  assert.equal(progetti.tasksOf(lavoro.id).length, 0);
  assert.equal(dom.byId("snack").hidden, false);
  assert.match(dom.text("snackText"), /Acconto/);

  await dom.byId("snackAction").onclick();
  assert.equal(progetti.tasksOf(lavoro.id).length, 1, "«Annulla» la riporta");
  assert.equal(dom.count("projPhasesBody"), 1, "e la schermata la ridisegna");
  hideSnack();
});

await prova("una pagina si elimina senza domande, e torna con «Annulla»", async (db) => {
  const lavoro = progetti.create({ name: "Capannone" });
  plan.createPage(lavoro.id, { title: "Verbale" });
  location.hash = `#/progetto/${lavoro.id}`;
  await project.render(db, lavoro.id);

  const riga = dom.byId("projPagesList").at(0);
  await riga.at(2).fire("click");
  assert.equal(plan.pagesOf(lavoro.id).length, 0);
  assert.match(dom.text("snackText"), /Verbale/);
  await dom.byId("snackAction").onclick();
  assert.deepEqual(alberoDisegnato(), [["Verbale", 0]]);
  hideSnack();
});

await prova("un progetto eliminato va nel cestino dell'elenco, e da lì si ripristina", async (db) => {
  const lavoro = progetti.create({ name: "Capannone" });
  plan.createPage(lavoro.id, { title: "Verbale" });
  await project.render(db, lavoro.id);

  await dom.byId("projDelete").fire("click");
  assert.equal(location.hash, "#/progetti");
  assert.match(dom.text("snackText"), /Capannone/);

  await project.renderList(db);
  assert.equal(dom.byId("projectsTable").hidden, true);
  assert.equal(dom.byId("projectsBinToggle").hidden, false, "il cestino si offre quando ha qualcosa");
  assert.match(dom.byId("projectsBinToggle").textContent, /1/);
  await dom.byId("projectsBinToggle").fire("click");
  assert.equal(dom.byId("projectsBin").hidden, false);
  assert.equal(dom.count("projectsBinList"), 1);

  const riga = dom.byId("projectsBinList").at(0);
  await riga.at(3).fire("click");
  assert.equal(progetti.openProjects().length, 1);
  assert.equal(plan.pagesOf(lavoro.id).length, 1, "con la sua pagina");
  assert.equal(dom.byId("projectsBinToggle").hidden, true, "vuoto, il cestino non si offre più");
  hideSnack();
});

await prova("«Annulla» dopo l'eliminazione di un progetto lo rimette nell'elenco", async (db) => {
  const lavoro = progetti.create({ name: "Capannone" });
  await project.render(db, lavoro.id);
  await dom.byId("projDelete").fire("click");
  await dom.byId("snackAction").onclick();
  assert.equal(progetti.openProjects().length, 1);
  assert.equal(dom.count("projectsBody"), 1, "l'elenco sullo schermo lo mostra di nuovo");
  hideSnack();
});

// -----------------------------------------------------------------------------------------------------------------
//  t h e   l i s t :   s t a r ,   s e a r c h ,   a r c h i v e
// -----------------------------------------------------------------------------------------------------------------

/** The names in the list, in the order drawn (the first cell is the star). */
function nomiInElenco() {
  return dom.byId("projectsBody").children.map((riga) => riga.at(1).allText);
}

await prova("la stella porta un progetto in cima all'elenco", async (db) => {
  progetti.create({ name: "Capannone" });
  progetti.create({ name: "Uffici" });
  await project.renderList(db);
  const ultimo = nomiInElenco().at(-1);
  const riga = dom.byId("projectsBody").children.at(-1);
  await riga.at(0).at(0).fire("click", { stopPropagation() {} });
  assert.equal(nomiInElenco()[0], ultimo);
  assert.equal(dom.byId("projectsBody").at(0).at(0).at(0).textContent, "★");
});

await prova("la ricerca compare dall'ottavo progetto, e trova anche per cliente", async (db) => {
  await saveParty(db, { id: "p1", denominazione: "Rossi Impianti S.r.l." });
  for (let n = 1; n <= 7; n += 1) progetti.create({ name: `Lavoro ${n}` });
  await project.renderList(db);
  assert.equal(dom.byId("projectsFilters").hidden, true, "sette progetti stanno in una schermata");

  progetti.create({ name: "Capannone", partyId: "p1" });
  await project.renderList(db);
  assert.equal(dom.byId("projectsFilters").hidden, false);
  dom.byId("projectsSearch").value = "rossi";
  await dom.byId("projectsSearch").fire("input");
  assert.deepEqual(nomiInElenco(), ["Capannone"]);

  dom.byId("projectsSearch").value = "nessuno";
  await dom.byId("projectsSearch").fire("input");
  assert.equal(dom.byId("projectsNoMatch").hidden, false);
  dom.byId("projectsSearch").value = "";
  await dom.byId("projectsSearch").fire("input");
});

await prova("archiviare senza nulla di aperto non chiede, e il progetto passa sotto «Archiviati»", async (db) => {
  const lavoro = progetti.create({ name: "Capannone" });
  await project.render(db, lavoro.id);
  assert.equal(dom.byId("projArchive").textContent, "Archivia");

  await dom.byId("projArchive").fire("click");
  assert.equal(dom.byId("ask").open, false, "niente da fatturare né da incassare: nessuna domanda");
  assert.equal(location.hash, "#/progetti");
  await project.renderList(db);
  assert.equal(dom.count("projectsBody"), 0);
  assert.match(dom.byId("projectsArchivedToggle").textContent, /Archiviati · 1/);
  await dom.byId("projectsArchivedToggle").fire("click");
  assert.equal(dom.count("projectsArchivedBody"), 1);

  await project.render(db, lavoro.id);
  assert.equal(dom.byId("projArchivedNote").hidden, false);
  assert.equal(dom.byId("projArchive").textContent, "Togli dall'archivio");
  await dom.byId("projArchive").fire("click");
  assert.equal(progetti.openProjects().length, 1);
  hideSnack();
});

await prova("archiviare con una fase da fatturare lo dice prima, con l'importo", async (db) => {
  const lavoro = progetti.create({ name: "Capannone" });
  const fase = progetti.addTask(lavoro.id, { title: "Acconto", importo: "1000.00" });
  plan.moveTask(fase.id, progetti.project(lavoro.id).columns.find((one) => one.done).id);
  await project.render(db, lavoro.id);

  const done = dom.byId("projArchive").fire("click");
  await tick();
  assert.equal(dom.byId("ask").open, true);
  assert.match(dom.text("askList"), /1\.000,00/);
  await dom.byId("askCancel").fire("click");
  await done;
  assert.equal(progetti.project(lavoro.id).archivedAt, null, "lasciato stare, resta fra i progetti");
});

// -----------------------------------------------------------------------------------------------------------------
//  p a g e   t e m p l a t e s ,   a n d   t h e   p e o p l e   o f   « @ »
// -----------------------------------------------------------------------------------------------------------------

await prova("ogni modello di pagina ha titolo, nota e testo nelle due lingue", async () => {
  for (const lingua of ["it", "en"]) {
    setLang(lingua);
    for (const modello of project.PAGE_TEMPLATES) {
      for (const chiave of [modello.title, modello.note, modello.body]) {
        assert.notEqual(tr(chiave), chiave, `${lingua}: manca «${chiave}»`);
      }
      assert.match(tr(modello.body), /^## /, `${lingua}: il testo di «${modello.key}» comincia da un titolo`);
    }
  }
  setLang("it");
});

await prova("una pagina da un modello: si sceglie, si dà il nome, e nasce con il suo testo", async (db) => {
  const lavoro = progetti.create({ name: "Capannone" });
  await project.render(db, lavoro.id);

  const done = dom.byId("projPageTemplate").fire("click");
  assert.equal(dom.byId("choose").open, true);
  assert.equal(dom.count("chooseList"), project.PAGE_TEMPLATES.length);
  await dom.byId("chooseList").at(0).fire("click");
  await tick();
  assert.equal(dom.byId("promptField").value, "Verbale di sopralluogo", "il nome del modello, già scritto");
  dom.byId("promptField").value = "Sopralluogo del 24 settembre";
  await dom.byId("promptOk").fire("click");
  await done;

  const pagine = plan.pagesOf(lavoro.id);
  assert.equal(pagine.length, 1);
  assert.equal(pagine[0].title, "Sopralluogo del 24 settembre");
  assert.match(pagine[0].markdown, /## Misure/);
  assert.match(fakeEditor.__test.loaded, /## Presenti/, "e si apre nell'editor");
});

await prova("con «@» si nominano le persone di riferimento del cliente del progetto", async (db) => {
  await saveParty(db, { id: "p1", denominazione: "Rossi Impianti S.r.l.",
                        contatti: [{ id: "c1", nome: "Maria Rossi" }, { id: "c2", nome: "Luca Bianchi" }] });
  const lavoro = progetti.create({ name: "Capannone", partyId: "p1" });
  plan.createPage(lavoro.id, { title: "Verbale" });
  await project.render(db, lavoro.id);

  const on = fakeEditor.__test.mounted.handlers;
  assert.deepEqual(on.people(), ["Maria Rossi", "Luca Bianchi"]);
  await on.openPerson("maria rossi");
  assert.equal(location.hash, "#/cliente/p1", "il nome porta alla scheda del cliente");

  const done = on.openPerson("Giulia Verdi");
  assert.equal(dom.byId("ask").open, true);
  assert.match(dom.text("askText"), /Giulia Verdi/);
  await dom.byId("askOk").fire("click");
  await done;
});

console.log(`project: ${passed} prove passate`);
