// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Il ripristino: ricollegare la cartella di sempre e ritrovare tutto.
//
// `backup.mjs` prova la metà che decide quali file esistono. Questa prova l'altra metà, che è
// quella che conta il giorno del bisogno: il disco è rimasto, il browser no — profilo pulito,
// computer nuovo, app reinstallata — e da una cartella piena di copie deve tornare indietro il
// registro intero.
//
// **Si verifica facendo la cosa che si fa dopo.** Un ripristino che rimette i record e lascia i
// contatori a zero sembra riuscito e non lo è: la fattura successiva esce con un numero già usato
// e l'indice unico la rifiuta. Quindi qui, dopo ogni ripristino, si emette.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/restore.mjs

import assert from "node:assert/strict";

import { fakeFolder, fakeBrowser } from "./fake-folder.mjs";
import { put, get, list, reset as resetStore } from "./fake-store.mjs";

let passed = 0;
async function prova(nome, fn) {
  resetStore();
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

// Il browser va messo prima di importare i moduli: `available()` guarda `window` al primo respiro.
fakeBrowser();

const { openDatabase, EXPORTED } = await import("../run/db.js");
const backup = await import("../run/backup.js");
const { draft, save, issue } = await import("../run/model.js");
const { numero: shownNumber } = await import("../run/kinds.js");

const COMPANY = {
  id: "company", denominazione: "G&G Technologies S.r.l.", paese: "SM", partitaIva: "29141",
  regimeFiscale: "RF01",
  sede: { indirizzo: "Via Marino Moretti", numeroCivico: "23", cap: "47899", comune: "Serravalle", provincia: "SM" },
};
const PARTY = {
  id: "p1", denominazione: "Rossi Impianti S.r.l.", paese: "IT", partitaIva: "01335577993", ruolo: "cliente",
  sede: { indirizzo: "Via Emilia", numeroCivico: "140", cap: "40068", comune: "Bologna", provincia: "BO" },
  codiceDestinatario: "M5UXCR1",
};
// Una riga di servizi verso l'Italia: tipo merce 3, e con quel codice l'imposta in fattura non ci
// va — «se TipoMerce = 2 o 3 allora deve essere AliquotaIVA = 0».
const RIGA = {
  descrizione: "Progettazione", quantita: "10", prezzoUnitario: "100.00",
  aliquota: "0", natura: "N3.1", tm: "3", unita: "ora",
};

/** Un archivio vero: azienda, cliente, due fatture emesse e un incasso. */
async function archivio(db) {
  await put(db, "parties", { ...COMPANY });
  await put(db, "parties", { ...PARTY });
  const emetti = async () => issue(db, await save(db, draft({
    tipo: "TD01", data: "2026-09-10", partyId: "p1", righe: [{ ...RIGA }],
    pagamento: { condizioni: "TP02", modalita: "MP05", rate: [{ scadenza: "2026-10-10" }] },
  })), { company: COMPANY, party: PARTY });
  const uno = await emetti();
  const due = await emetti();
  await put(db, "payments", { id: "inc-1", docId: uno.id, importo: "1220.00", data: "2026-09-20" });
  return { uno, due };
}

/** Collega la cartella come fa l'app, e restituisce cosa ha trovato. */
async function collega(db, dir) {
  fakeBrowser(async () => dir);
  await backup.setup(db);
  return backup.link();
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   g i r o   c o m p l e t o
// -----------------------------------------------------------------------------------------------------------------

await prova("una cartella nuova riceve l'archivio, e ci sta dentro tutto", async () => {
  const db = await openDatabase();
  await archivio(db);
  const dir = fakeFolder();
  const esito = await collega(db, dir);
  assert.deepEqual(esito.found, [], "la cartella era vuota");

  const scritto = JSON.parse(dir.files.get("invoice-scope.json"));
  assert.equal(scritto.app, "invoice-scope");
  assert.equal(scritto.data.docs.length, 2);
  assert.equal(scritto.data.payments.length, 1);
  assert.equal(scritto.data.parties.length, 2);
  // I contatori sono dati quanto le fatture: senza, la numerazione riparte da uno.
  assert.ok(scritto.data.counters.length > 0, "i contatori escono con il resto");
  // E `meta` no: un handle di cartella in JSON è `{}`, e rimesso altrove sarebbe una cartella
  // che non esiste.
  assert.equal(scritto.data.meta, undefined, "lo stato di questo browser resta a questo browser");
  assert.ok(!EXPORTED.includes("meta"));
});

await prova("perso il browser, la cartella rimette tutto — e la fattura dopo prende il numero giusto", async () => {
  const primo = await openDatabase();
  const { due } = await archivio(primo);
  assert.equal(due.numero, "2026/0002");
  const dir = fakeFolder();
  await collega(primo, dir);

  // Il computer nuovo: deposito vuoto, la stessa cartella.
  resetStore();
  const nuovo = await openDatabase();
  assert.equal((await list(nuovo, "docs")).length, 0, "si riparte da niente");

  const esito = await collega(nuovo, dir);
  assert.equal(esito.found.length, 2, "il corrente e la copia del giorno");
  assert.equal((await backup.status()).kind, "held", "e non si scrive niente sopra");
  assert.equal(dir.files.get("invoice-scope.json").includes('"2026/0002"'), true);

  const messo = await backup.restore();
  assert.equal(messo.ok, true, messo.reason || "");
  const docs = await list(nuovo, "docs");
  assert.equal(docs.length, 2);
  assert.deepEqual(docs.map((d) => d.numero).sort(), ["2026/0001", "2026/0002"]);
  assert.equal((await list(nuovo, "payments")).length, 1, "anche gli incassi");
  assert.equal((await list(nuovo, "parties")).length, 2, "anche l'anagrafica");

  // La cosa che si fa dopo: emettere. Senza i contatori uscirebbe di nuovo «2026/0001».
  const seguente = await issue(nuovo, await save(nuovo, draft({
    tipo: "TD01", data: "2026-09-11", partyId: "p1", righe: [{ ...RIGA }],
    pagamento: { condizioni: "TP02", modalita: "MP05", rate: [{ scadenza: "2026-10-11" }] },
  })), { company: COMPANY, party: PARTY });
  assert.equal(seguente.numero, "2026/0003", "la numerazione riprende da dove era");
});

await prova("si può riportare la copia di un giorno preciso, non solo l'ultima", async () => {
  const db = await openDatabase();
  await archivio(db);
  const vecchio = JSON.stringify({
    format: 1, app: "invoice-scope", schema: 1, exported: "2026-09-01T10:00:00.000Z",
    data: { docs: [{ id: "storico", numero: "2026/0009", stato: "emesso", data: "2026-09-01" }], parties: [], payments: [] },
  });
  const dir = fakeFolder({ "invoice-scope-2026-09-01.json": vecchio });
  await collega(db, dir);

  const elenco = await backup.copies();
  const datata = elenco.find((copia) => copia.day === "2026-09-01");
  assert.ok(datata, "la copia del primo settembre è in elenco");

  const messo = await backup.restore(datata.name);
  assert.equal(messo.ok, true, messo.reason || "");
  const docs = await list(db, "docs");
  assert.deepEqual(docs.map((d) => d.id), ["storico"], "quel giorno, e non l'altro");
});

// -----------------------------------------------------------------------------------------------------------------
//  q u a n d o   v a   s t o r t a
// -----------------------------------------------------------------------------------------------------------------

await prova("un file troncato non entra, e quello che c'è resta dov'è", async () => {
  const db = await openDatabase();
  await archivio(db);
  const dir = fakeFolder();
  await collega(db, dir);
  // Una copia interrotta a metà scrittura: il disco pieno, il portatile chiuso.
  const intero = dir.files.get("invoice-scope.json");
  dir.files.set("invoice-scope.json", intero.slice(0, Math.floor(intero.length / 2)));

  const messo = await backup.restore();
  assert.equal(messo.ok, false);
  assert.equal(messo.reason, "importNotJson");
  assert.equal((await list(db, "docs")).length, 2, "il registro non è stato toccato");
});

await prova("l'archivio di un'altra app non entra", async () => {
  const db = await openDatabase();
  await archivio(db);
  const dir = fakeFolder({
    "invoice-scope.json": JSON.stringify({ format: 1, app: "plan-scope", data: { docs: [] } }),
  });
  await collega(db, dir);
  const messo = await backup.restore();
  assert.equal(messo.ok, false);
  assert.equal(messo.reason, "importOtherApp");
  assert.equal((await list(db, "docs")).length, 2);
});

await prova("un archivio scritto da una versione più nuova non entra", async () => {
  const db = await openDatabase();
  await archivio(db);
  const dir = fakeFolder({
    "invoice-scope.json": JSON.stringify({ format: 99, app: "invoice-scope", data: { docs: [] } }),
  });
  await collega(db, dir);
  const messo = await backup.restore();
  assert.equal(messo.ok, false);
  assert.equal(messo.reason, "importNewer");
});

await prova("una copia che non c'è più si dice, e non esplode", async () => {
  const db = await openDatabase();
  await archivio(db);
  const dir = fakeFolder();
  await collega(db, dir);
  const messo = await backup.restore("invoice-scope-2020-01-01.json");
  assert.equal(messo.ok, false);
  assert.equal(messo.reason, "backupCopyGone");
  assert.equal((await list(db, "docs")).length, 2);
});

await prova("senza permesso non si legge, e lo si dice", async () => {
  const db = await openDatabase();
  await archivio(db);
  const dir = fakeFolder();
  await collega(db, dir);
  dir.permissionState = "prompt";
  const messo = await backup.restore();
  assert.equal(messo.ok, false);
  assert.equal(messo.reason, "backupNoPermission");
});

await prova("il ripristino lascia la cartella collegata", async () => {
  const db = await openDatabase();
  await archivio(db);
  const dir = fakeFolder();
  await collega(db, dir);
  await backup.restore();
  const stato = await backup.status();
  assert.ok(["linked", "held"].includes(stato.kind), `stato ${stato.kind}`);
  assert.ok(await get(db, "meta", "backupFolder"), "l'handle è ancora nel deposito");
});

await prova("detta la scelta, la cartella riprende a ricevere copie", async () => {
  const primo = await openDatabase();
  await archivio(primo);
  const dir = fakeFolder();
  await collega(primo, dir);

  resetStore();
  const nuovo = await openDatabase();
  await collega(nuovo, dir);
  assert.equal((await backup.status()).kind, "held");
  await backup.restore();
  await backup.release();
  assert.equal((await backup.status()).kind, "linked");

  // E da qui in poi quello che si scrive è quello che si è ripristinato, non un archivio vuoto.
  const scritto = JSON.parse(dir.files.get("invoice-scope.json"));
  assert.equal(scritto.data.docs.length, 2);
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   i m m a g i n i   d e l l e   p a g i n e
// -----------------------------------------------------------------------------------------------------------------

/** Un'immagine come la tiene il deposito: il blob, e i campi che il pacchetto e la cartella usano. */
function immagine(id, testo = "una foto") {
  const bytes = new TextEncoder().encode(`${testo}-${id}`);
  return {
    id, projectId: "prog-1", name: `${id}.png`, type: "image/png", size: bytes.length,
    blob: new Blob([bytes], { type: "image/png" }),
  };
}

await prova("le immagini delle pagine finiscono nella cartella, accanto al testo", async () => {
  // **Stavano fuori dall'archivio**, e chi si affidava alla copia automatica aveva il testo dei
  // progetti e non le fotografie. In JSON diventerebbero base64: accanto, una volta ciascuna.
  const db = await openDatabase();
  await archivio(db);
  await put(db, "projects", { id: "prog-1", name: "Capannone", updated: "2026-09-10T08:00:00.000Z" });
  await put(db, "assets", immagine("a1"));
  await put(db, "assets", immagine("a2"));

  const dir = fakeFolder();
  await collega(db, dir);

  const scritto = JSON.parse(dir.files.get("invoice-scope.json"));
  assert.equal(scritto.assets.length, 2, "l'archivio le nomina");
  assert.ok(scritto.assets.every((a) => a.path.startsWith("assets/")), JSON.stringify(scritto.assets));
  // I byte non sono dentro il testo: stanno nella cartella `assets/`.
  assert.ok(!dir.files.get("invoice-scope.json").includes("base64"));
  const sotto = dir.subs.get("assets");
  assert.ok(sotto, "la cartella delle immagini c'è");
  assert.equal([...sotto.files.keys()].length, 2);
});

await prova("perso il browser, tornano anche le immagini", async () => {
  const primo = await openDatabase();
  await archivio(primo);
  await put(primo, "projects", { id: "prog-1", name: "Capannone", updated: "2026-09-10T08:00:00.000Z" });
  await put(primo, "assets", immagine("a1"));
  const dir = fakeFolder();
  await collega(primo, dir);

  resetStore();
  const nuovo = await openDatabase();
  await collega(nuovo, dir);
  const messo = await backup.restore();
  assert.equal(messo.ok, true, messo.reason || "");
  assert.equal(messo.immagini, 1, "e lo dice");

  const tornate = await list(nuovo, "assets");
  assert.equal(tornate.length, 1);
  assert.equal(tornate[0].id, "a1");
  assert.equal(tornate[0].projectId, "prog-1", "e sa a quale progetto apparteneva");
  assert.equal(await tornate[0].blob.text(), "una foto-a1", "con i byte giusti dentro");
});

await prova("un'immagine che il deposito ha già non si riscrive né si rilegge", async () => {
  // L'id è il contenuto: rimetterla sarebbe lavoro per produrre quello che c'è.
  const db = await openDatabase();
  await archivio(db);
  await put(db, "assets", immagine("a1"));
  const dir = fakeFolder();
  await collega(db, dir);
  const messo = await backup.restore();
  assert.equal(messo.ok, true);
  assert.equal(messo.immagini, 0, "c'era già");
  assert.equal((await list(db, "assets")).length, 1);
});

await prova("un archivio scritto prima delle immagini si ripristina lo stesso", async () => {
  const db = await openDatabase();
  await archivio(db);
  const dir = fakeFolder();
  await collega(db, dir);
  // Una copia di quando `assets` non c'era: il ripristino non deve inciampare sul nodo mancante.
  const vecchia = JSON.parse(dir.files.get("invoice-scope.json"));
  delete vecchia.assets;
  dir.files.set("invoice-scope.json", JSON.stringify(vecchia));

  const messo = await backup.restore();
  assert.equal(messo.ok, true, messo.reason || "");
  assert.equal(messo.immagini, 0);
});

await prova("una foto incollata fa riscrivere la copia, anche se il testo non si muove", async () => {
  // **Il difetto silenzioso.** L'impronta decide se riscrivere; presa sul solo testo, un'immagine
  // aggiunta a una pagina non la muove — i record sono gli stessi — e la fotografia non arriverebbe
  // mai nella cartella. Non lo direbbe nessun errore: si scopre il giorno in cui serve il file.
  const db = await openDatabase();
  await archivio(db);
  await put(db, "projects", { id: "prog-1", name: "Capannone", updated: "2026-09-10T08:00:00.000Z" });
  await put(db, "assets", immagine("a1"));
  const dir = fakeFolder();
  await collega(db, dir);
  assert.equal([...dir.subs.get("assets").files.keys()].length, 1);

  // Una seconda foto, e nient'altro: nessun record cambia.
  const prima = dir.files.get("invoice-scope.json");
  await put(db, "assets", immagine("a2"));

  // Il risveglio dell'app programma una scrittura immediata: è il percorso vero, non una forzatura.
  await backup.setup(db);
  await new Promise((ok) => { setTimeout(ok, 50); });

  assert.deepEqual([...dir.subs.get("assets").files.keys()].sort(), ["a1.png", "a2.png"]);
  const dopo = dir.files.get("invoice-scope.json");
  assert.notEqual(dopo, prima, "e il testo che le nomina è stato riscritto");
  assert.equal(JSON.parse(dopo).assets.length, 2);
});

console.log(`restore: ${passed} prove passate`);
