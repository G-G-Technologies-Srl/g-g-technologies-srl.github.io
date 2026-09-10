// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// I progetti: la porta verso il deposito, i quattro numeri, e il giro preventivo → fasi → fattura.
//
// Il modello è quello condiviso — `gg/plan-model.js`, lo stesso file di Plan Scope — e ha già le sue
// cinquantadue prove là. Qui si prova quello che è di questa app: che le modifiche arrivino su
// disco, che i tre campi in più sopravvivano, che i conti siano quelli giusti e che una fase fatta
// finisca in fattura una volta sola.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/projects.mjs

import assert from "node:assert/strict";

import { openDatabase, EXPORTED } from "../run/db.js";
import { draft, save as saveDoc, issue, creditNote, discard } from "../run/model.js";
import { recordPayment } from "../run/schedule.js";
import { toString } from "../run/decimal.js";
import * as progetti from "../run/projects.js";
import * as plan from "gg/plan-model.js";
import * as pack from "gg/plan-pack.js";
import { list, put } from "gg/store.js";
import { reset } from "./fake-store.mjs";

let passed = 0;
async function prova(nome, fn) {
  try {
    reset();
    const db = await openDatabase();
    await progetti.setup(db);
    await fn(db);
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

const soldi = (valore) => toString(valore, 2);

// L'azienda e il cliente che servono a `issue`: un documento si emette solo se passa i controlli,
// e i controlli guardano l'anagrafica di tutt'e due.
const COMPANY = {
  denominazione: "Esempio S.r.l.", partitaIva: "01234567897", paese: "IT", regimeFiscale: "RF01",
  sede: { indirizzo: "Via Prova", numeroCivico: "1", cap: "47899", comune: "Serravalle", provincia: "RN" },
};
const PARTY = {
  denominazione: "Cliente S.p.A.", partitaIva: "09876543217", codiceDestinatario: "ABCDEFG",
  sede: { indirizzo: "Corso Esempio", numeroCivico: "2", cap: "20100", comune: "Milano", provincia: "MI" },
};
const CONTEXT = { company: COMPANY, party: PARTY };

/** Un preventivo emesso, con due righe e uno sconto: la forma da cui nasce un progetto. */
async function preventivo(db, { sconto = null } = {}) {
  const doc = await saveDoc(db, draft({
    tipo: "preventivo",
    data: "2026-09-01",
    partyId: "p1",
    validoFino: "2026-10-01",
    causale: "Revisione della linea di montaggio",
    righe: [
      { descrizione: "Progettazione", quantita: "10", prezzoUnitario: "80.00", aliquota: "22" },
      { descrizione: "Collaudo", quantita: "1", prezzoUnitario: "320.00", aliquota: "22" },
    ],
    scontoDocumento: sconto,
  }));
  return doc;
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   p o r t a
// -----------------------------------------------------------------------------------------------------------------

await prova("quello che passa dal modello finisce nel deposito", async (db) => {
  const p = progetti.create({ name: "Linea di montaggio", partyId: "p1" });
  progetti.addTask(p.id, { title: "Progetto esecutivo", importo: "800.00" });
  await progetti.flush();

  assert.equal((await list(db, "projects")).length, 1);
  assert.equal((await list(db, "tasks")).length, 1);
  const salvato = (await list(db, "projects"))[0];
  assert.equal(salvato.partyId, "p1", "il cliente sopravvive al giro nel modello condiviso");
  assert.deepEqual(salvato.docIds, []);
  assert.equal((await list(db, "tasks"))[0].importo, "800.00");
});

await prova("riaprendo l'app i progetti tornano su come erano", async (db) => {
  const p = progetti.create({ name: "Linea di montaggio", partyId: "p1" });
  progetti.addTask(p.id, { title: "Progetto esecutivo", importo: "800.00" });
  await progetti.flush();

  // La seconda apertura: stesso deposito, modello svuotato e riempito da capo.
  await progetti.setup(db);
  assert.equal(progetti.projects().length, 1);
  const tornato = progetti.projects()[0];
  assert.equal(tornato.name, "Linea di montaggio");
  assert.equal(tornato.partyId, "p1");
  assert.equal(progetti.tasksOf(tornato.id)[0].importo, "800.00");
});

await prova("un documento si collega una volta sola", async (db) => {
  const p = progetti.create({ name: "Linea", partyId: "p1" });
  progetti.linkDoc(p.id, "d1");
  progetti.linkDoc(p.id, "d1");
  progetti.linkDoc(p.id, "d2");
  assert.deepEqual(progetti.project(p.id).docIds, ["d1", "d2"],
    "un elenco con due volte la stessa fattura conterebbe due volte anche il fatturato");
  progetti.unlinkDoc(p.id, "d1");
  assert.deepEqual(progetti.project(p.id).docIds, ["d2"]);
  assert.equal(progetti.projectOfDoc("d2").id, p.id);
  assert.equal(progetti.projectOfDoc("mai-visto"), null);
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   f a s i
// -----------------------------------------------------------------------------------------------------------------

await prova("si fatturano le fasi fatte, con un importo, non ancora fatturate", async (db) => {
  const p = progetti.create({ name: "Linea", partyId: "p1" });
  const finale = progetti.project(p.id).columns.find((c) => c.done);

  const fatta = progetti.addTask(p.id, { title: "Acconto alla firma", importo: "1000.00" });
  plan.moveTask(fatta.id, finale.id);
  progetti.addTask(p.id, { title: "Saldo al collaudo", importo: "2000.00" });          // non fatta
  const senzaImporto = progetti.addTask(p.id, { title: "Riunione di avvio" });
  plan.moveTask(senzaImporto.id, finale.id);                                            // fatta, ma non si fattura
  const gia = progetti.addTask(p.id, { title: "Anticipo", importo: "500.00" });
  plan.moveTask(gia.id, finale.id);
  plan.updateTask(gia.id, { docId: "d-vecchia" });

  assert.deepEqual(progetti.billable(p.id).map((t) => t.title), ["Acconto alla firma"]);
  assert.equal(progetti.billed(plan.task(gia.id)), true);
  assert.equal(progetti.billed(plan.task(fatta.id)), false);
});

await prova("un progetto nasce dal preventivo, con una fase per riga", async (db) => {
  const doc = await preventivo(db);
  const p = progetti.fromQuote(doc);
  assert.equal(p.partyId, "p1");
  assert.deepEqual(p.docIds, [doc.id]);
  assert.equal(p.name, "Revisione della linea di montaggio", "il nome viene dalla causale");
  assert.deepEqual(progetti.tasksOf(p.id).map((t) => [t.title, t.importo]),
    [["Progettazione", "800.00"], ["Collaudo", "320.00"]]);
});

await prova("con uno sconto sul preventivo, le fasi valgono quello che il cliente pagherà", async (db) => {
  // Lo sconto del documento è distribuito sulle righe da `totals`, quindi la fase porta il valore
  // vero della riga e non quello di listino: è l'importo che si rifattura.
  const doc = await preventivo(db, { sconto: { percentuale: "10" } });
  const p = progetti.fromQuote(doc);
  assert.deepEqual(progetti.tasksOf(p.id).map((t) => t.importo), ["720.00", "288.00"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  i   q u a t t r o   n u m e r i
// -----------------------------------------------------------------------------------------------------------------

await prova("quotato, fatturato, incassato, da fatturare", async (db) => {
  const quote = await preventivo(db);
  const p = progetti.fromQuote(quote);

  const fattura = await saveDoc(db, draft({
    tipo: "TD01", data: "2026-09-10", partyId: "p1",
    righe: [{ descrizione: "Acconto", quantita: "1", prezzoUnitario: "500.00", aliquota: "22" }],
  }));
  const emessa = await issue(db, fattura, CONTEXT);
  progetti.linkDoc(p.id, emessa.id);
  await recordPayment(db, emessa, { importo: "200.00", data: "2026-09-20" });

  const finale = progetti.project(p.id).columns.find((c) => c.done);
  plan.moveTask(progetti.tasksOf(p.id)[0].id, finale.id);

  const n = await progetti.figures(db, p.id);
  // 10 × 80 + 320 = 1.120,00 + IVA = 1.366,40
  assert.equal(soldi(n.quotato), "1366.40");
  assert.equal(soldi(n.fatturato), "610.00");
  assert.equal(soldi(n.incassato), "200.00");
  assert.equal(soldi(n.daFatturare), "800.00", "la prima fase è fatta e non è ancora su una fattura");
});

await prova("una nota di credito toglie dal fatturato", async (db) => {
  const p = progetti.create({ name: "Linea", partyId: "p1" });
  const fattura = await issue(db, await saveDoc(db, draft({
    tipo: "TD01", data: "2026-09-10", partyId: "p1",
    righe: [{ descrizione: "Lavorazione", quantita: "1", prezzoUnitario: "1000.00", aliquota: "22" }],
  })), CONTEXT);
  progetti.linkDoc(p.id, fattura.id);
  assert.equal(soldi((await progetti.figures(db, p.id)).fatturato), "1220.00");

  // La nota di credito la costruisce il modello, con dentro il collegamento alla fattura che
  // storna: è la strada che passa dai controlli, ed è quella che fa una persona.
  const nota = await issue(db, await saveDoc(db, creditNote(fattura)), CONTEXT);
  progetti.linkDoc(p.id, nota.id);
  assert.equal(soldi((await progetti.figures(db, p.id)).fatturato), "0.00",
    "stornata tutta, il fatturato del progetto torna a zero");
});

// -----------------------------------------------------------------------------------------------------------------
//  d a l l e   f a s i   a l l a   f a t t u r a
// -----------------------------------------------------------------------------------------------------------------

await prova("le fasi fatte diventano una bozza, e non ci tornano una seconda volta", async (db) => {
  const p = progetti.create({ name: "Linea di montaggio", partyId: "p1" });
  const finale = progetti.project(p.id).columns.find((c) => c.done);
  for (const [titolo, importo] of [["Acconto alla firma", "1000.00"], ["Secondo stato", "500.00"]]) {
    const fase = progetti.addTask(p.id, { title: titolo, importo });
    plan.moveTask(fase.id, finale.id);
  }
  progetti.addTask(p.id, { title: "Saldo al collaudo", importo: "2000.00" });

  const bozza = await progetti.invoiceDone(db, p.id, { company: { aliquotaPredefinita: "22" } });
  assert.equal(bozza.stato, "bozza");
  assert.equal(bozza.partyId, "p1");
  assert.deepEqual(bozza.righe.map((r) => [r.descrizione, r.prezzoUnitario, r.aliquota]), [
    ["Acconto alla firma", "1000.00", "22"],
    ["Secondo stato", "500.00", "22"],
  ]);
  assert.ok(progetti.project(p.id).docIds.includes(bozza.id), "la bozza si collega al progetto");
  assert.deepEqual(progetti.billable(p.id), [], "e le fasi risultano fatturate");

  assert.equal(await progetti.invoiceDone(db, p.id, {}), null, "niente da fatturare, niente bozza");
  // Il saldo, quando arriverà, sarà una fattura sua.
  const saldo = progetti.tasksOf(p.id).find((t) => t.title === "Saldo al collaudo");
  plan.moveTask(saldo.id, finale.id);
  const seconda = await progetti.invoiceDone(db, p.id, {});
  assert.deepEqual(seconda.righe.map((r) => r.descrizione), ["Saldo al collaudo"]);
  assert.equal(progetti.project(p.id).docIds.length, 2);
});

await prova("la bozza dalle fasi prende l'aliquota del cliente, se la sua scheda ne ha una", async (db) => {
  await put(db, "parties", { id: "p-de", denominazione: "Müller GmbH", aliquotaPredefinita: "0", naturaPredefinita: "N3.2" });
  const p = progetti.create({ name: "Linea", partyId: "p-de" });
  const finale = progetti.project(p.id).columns.find((c) => c.done);
  const fase = progetti.addTask(p.id, { title: "Servizio", importo: "300.00" });
  plan.moveTask(fase.id, finale.id);
  const bozza = await progetti.invoiceDone(db, p.id, { company: { aliquotaPredefinita: "22" } });
  assert.deepEqual([bozza.righe[0].aliquota, bozza.righe[0].natura], ["0", "N3.2"],
    "il cliente vince sull'azienda, natura compresa");
});

await prova("cancellata la bozza, le fasi tornano fatturabili e il progetto smette di elencarla", async (db) => {
  // Trovato nel browser: la bozza si cancellava e le fasi restavano «fatturate» per sempre, con un
  // `docId` che non apriva niente. Il denaro spariva dal conto senza che nessuno l'avesse deciso.
  const p = progetti.create({ name: "Linea", partyId: "p1" });
  const finale = progetti.project(p.id).columns.find((c) => c.done);
  const fase = progetti.addTask(p.id, { title: "Acconto", importo: "1000.00" });
  plan.moveTask(fase.id, finale.id);
  const bozza = await progetti.invoiceDone(db, p.id, {});
  assert.deepEqual(progetti.billable(p.id), []);

  await discard(db, bozza);
  progetti.forgetDoc(bozza.id);
  assert.deepEqual(progetti.billable(p.id).map((t) => t.title), ["Acconto"]);
  assert.equal(plan.task(fase.id).docId, null);
  assert.deepEqual(progetti.project(p.id).docIds, []);

  // Scollegare non è cancellare: la fattura esiste ancora, e la fase resta fatturata.
  const seconda = await progetti.invoiceDone(db, p.id, {});
  progetti.unlinkDoc(p.id, seconda.id);
  assert.deepEqual(progetti.billable(p.id), [], "scollegata, ma fatturata lo stesso");
});

await prova("con l'aliquota a zero la bozza porta natura e codice TM dell'azienda", async (db) => {
  const p = progetti.create({ name: "Linea", partyId: "p1" });
  const finale = progetti.project(p.id).columns.find((c) => c.done);
  const fase = progetti.addTask(p.id, { title: "Servizio", importo: "300.00" });
  plan.moveTask(fase.id, finale.id);
  const bozza = await progetti.invoiceDone(db, p.id, {
    company: { aliquotaPredefinita: "0", naturaPredefinita: "N2.2", tmPredefinito: "3" },
  });
  assert.deepEqual([bozza.righe[0].aliquota, bozza.righe[0].natura, bozza.righe[0].tm],
    ["0", "N2.2", "3"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   p o n t e   c o n   P l a n   S c o p e
// -----------------------------------------------------------------------------------------------------------------

await prova("un progetto esce come pacchetto e rientra, con i campi di questa app", async (db) => {
  // Il pacchetto è quello di Plan Scope — `gg/plan-pack.js`, marcatore «gg-plan» — e i tre campi che
  // solo Invoice Scope usa (cliente, documenti, importo della fase) viaggiano come campi qualunque:
  // l'altra app se li porta dietro senza saperli leggere, e tornando qui sono ancora lì. È la
  // condizione perché un progetto possa fare avanti e indietro senza perdere il suo denaro.
  const p = progetti.create({ name: "Capannone", partyId: "p1" });
  progetti.linkDoc(p.id, "d1");
  progetti.addTask(p.id, { title: "Acconto alla firma", importo: "1000.00" });
  plan.createPage(p.id, { title: "Capitolato", markdown: "# Capitolato\n\nCampata di undici metri." });

  const bytes = pack.toZip({
    project: progetti.project(p.id),
    pages: plan.pagesOf(p.id),
    tasks: progetti.tasksOf(p.id),
    assets: [],
  }, { schema: 1 });

  const letto = pack.parse(bytes);
  assert.equal(letto.ok, true, "il pacchetto appena scritto non si rilegge");
  assert.equal(letto.payload.app, "gg-plan", "il marcatore è quello del formato");

  const nato = plan.adopt({ ...letto.payload, pages: letto.payload.pages }, {});
  const copia = progetti.project(nato.projectId);
  assert.equal(copia.name, "Capannone");
  assert.equal(copia.partyId, "p1", "il cliente sopravvive al giro nel formato condiviso");
  assert.deepEqual(copia.docIds, ["d1"]);
  assert.notEqual(copia.id, p.id, "la chiave in questo deposito è nuova: sono due copie");
  // Questa riga diceva «e l'identità del progetto resta la stessa», ed era in contraddizione con
  // quella qui sopra: due copie con una identità sola. Finché l'identità serviva solo a rileggere
  // un file non faceva danni; da quando i progetti vanno in cartelle condivise, tutto quello che è
  // indicizzato per `uid` — dove si scrive, cosa si fonde con cosa — smette di distinguerle, e due
  // progetti che l'occhio vede affiancati rivendicano la stessa sottocartella. Quindi la copia
  // prende una identità sua. L'originale tiene la sua, e il file continua a portarla: quello che
  // non sopravvive non è il giro nel formato, è l'essere due.
  assert.notEqual(copia.uid, progetti.project(p.id).uid, "e ne ha una sua: due copie, due identità");
  assert.ok(copia.uid, "che esiste davvero");
  assert.equal(progetti.tasksOf(copia.id)[0].importo, "1000.00");
  assert.match(plan.pagesOf(copia.id)[0].markdown, /undici metri/);
});

await prova("le figure viaggiano nel pacchetto e non nell'archivio", async (db) => {
  // La divisione che conta: l'archivio JSON tiene il testo — `EXPORTED` lascia fuori gli allegati,
  // perché un'immagine in base64 gonfierebbe ogni copia di backup — e il pacchetto, che è uno zip,
  // porta anche i byte. Detto altrove a parole; qui è una prova.
  assert.ok(!EXPORTED.includes("assets"), "l'archivio non porta i byte");

  const p = progetti.create({ name: "Capannone" });
  const pagina = plan.createPage(p.id, { title: "Rilievo" });
  const asset = {
    id: "figura-1", projectId: p.id, name: "campata.png", type: "image/png", size: 4,
    blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
  };
  await progetti.putAsset(asset);
  plan.setMarkdown(pagina.id, "![](assets/figura-1)");

  const perLoZip = await progetti.assetsForPack(p.id);
  assert.equal(perLoZip.length, 1);
  assert.deepEqual([...perLoZip[0].bytes], [1, 2, 3, 4], "i byte, non il blob");

  const bytes = pack.toZip({
    project: progetti.project(p.id), pages: plan.pagesOf(p.id),
    tasks: progetti.tasksOf(p.id), assets: perLoZip,
  }, { schema: 1 });
  const letto = pack.parse(bytes);
  assert.equal(letto.ok, true);
  assert.equal(pack.describe(letto.payload).assets, 1, "il pacchetto le conta");

  // In ingresso ognuna prende un id nuovo, e il testo che la nomina viene riscritto: due
  // importazioni dello stesso file sono due progetti, ognuno con le sue figure.
  const { pages, assets } = pack.rehome(letto.payload, letto.files, () => "figura-2");
  assert.equal(assets[0].id, "figura-2");
  assert.match(pages[0].markdown, /assets\/figura-2/);
  assert.deepEqual([...assets[0].bytes], [1, 2, 3, 4]);
});

await prova("le figure di un progetto svuotato dal cestino se ne vanno con lui", async (db) => {
  const p = progetti.create({ name: "Capannone" });
  await progetti.putAsset({ id: "figura-1", projectId: p.id, name: "x.png", type: "image/png",
                            size: 1, blob: new Blob([new Uint8Array([1])]) });
  await progetti.putAsset({ id: "figura-2", projectId: "progetto-che-non-esiste", name: "y.png",
                            type: "image/png", size: 1, blob: new Blob([new Uint8Array([2])]) });
  assert.equal((await list(db, "assets")).length, 2);
  await progetti.flush();

  // `purge` toglie progetti, pagine e attività; gli allegati sono di questa app, e li toglie lei.
  await progetti.setup(db);
  const rimaste = await list(db, "assets");
  assert.deepEqual(rimaste.map((one) => one.id), ["figura-1"],
    "resta quella del progetto vivo, se ne va quella orfana");
});

await prova("senza nessun progetto le figure restano dove sono", async (db) => {
  // La rete della riga che cancella: un deposito dei progetti vuoto è il caso in cui «nessuno le
  // usa» non si può distinguere da «non sono ancora state lette», e cancellare sarebbe una perdita
  // senza ritorno decisa da un errore.
  await progetti.putAsset({ id: "figura-1", projectId: "p-sconosciuto", name: "x.png",
                            type: "image/png", size: 1, blob: new Blob([new Uint8Array([1])]) });
  await progetti.setup(db);
  assert.equal((await list(db, "assets")).length, 1);
});

console.log(`projects: ${passed} prove passate`);
