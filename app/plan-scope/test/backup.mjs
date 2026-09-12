// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The local folder, from the app's side: which records go in, which images go beside them, and
// what comes back out.
//
// The policy of the files — the current copy, one a day, thirty of them, and the sweeping — is
// `gg/folder.js`, proved in `app/invoice-scope/test/backup.mjs`, which is where `writeSnapshot`
// lives. What is proved here is what only Plan Scope knows, and every one of these is a way the
// app could lose something without anybody noticing:
//
//  - an image is named in the archive and written beside it, so a restore is whole;
//  - a photograph pasted into a page moves no text, and the writing has to happen anyway;
//  - an image already in the folder is not read again — the bytes cost real work;
//  - a copy comes back with its images, and one that was swept lets the pages come back without it.
//
// `db.js` and `gg/store.js` are swapped for the fakes; `gg/io.js` is the real one, so the envelope
// and the refusal of half a restore are the ones a browser gets. The picker and the visibility of
// the page are the two things the writer touches in a browser, and they are stubbed below.
//
//     node app/plan-scope/test/backup.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    const from = context.parentURL || "";
    // Il deposito dell'app, e quello che gg/io.js si aspetta sotto di sé: la stessa finta.
    if (specifier === "./db.js" && from.endsWith("/run/backup.js")) {
      return next(new URL("../test/fake-archive.mjs", from).href, context);
    }
    if (specifier === "./store.js" && from.endsWith("/_lib/io.js")) {
      return next(new URL("../plan-scope/test/fake-archive.mjs", from).href, context);
    }
    if (specifier.startsWith("gg/")) {
      const base = new URL("../../_lib/", from);
      return next(new URL(specifier.slice(3), base).href, context);
    }
    return next(specifier, context);
  }
`), pathToFileURL("./"));

const { folder } = await import("./fake-folder.mjs");
const store = await import("./fake-archive.mjs");

// -----------------------------------------------------------------------------------------------------------------
//  i l   b r o w s e r ,   p e r   q u a n t o   s e r v e
// -----------------------------------------------------------------------------------------------------------------

let dir = folder();

// Le due sole cose del browser che lo scrittore tocca: il selettore, e sapere se la pagina è
// davanti. Senza il primo `available()` dice di no e non parte niente.
globalThis.window = { showDirectoryPicker: async () => dir };
globalThis.document = { visibilityState: "visible", addEventListener() {} };

const backup = await import("../run/backup.js");

// -----------------------------------------------------------------------------------------------------------------
//  a t t r e z z i
// -----------------------------------------------------------------------------------------------------------------

let passed = 0;
async function prova(nome, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

/** Una scrittura programmata a zero è comunque un giro di eventi: le si dà il tempo di atterrare. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 120); });

/** Un progetto con una pagina e un'attività: quanto basta perché l'archivio abbia dentro qualcosa. */
function fill() {
  store.records.set("projects", [{ id: "p1", uid: "p1", name: "Rilancio" }]);
  store.records.set("pages", [{ id: "g1", uid: "g1", projectId: "p1", markdown: "# Ciao" }]);
  store.records.set("tasks", [{ id: "t1", uid: "t1", projectId: "p1", title: "Chiamare" }]);
}

const latest = () => JSON.parse(dir.files.get("plan-scope.json"));
const assets = () => dir.subs.get("assets");

/** Da capo: cartella vuota, deposito vuoto, e lo scrittore che riparte da zero. */
async function fresh() {
  dir = folder();
  store.reset();
  fill();
  globalThis.window.showDirectoryPicker = async () => dir;
  await backup.setup();
  await backup.link();
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   p r o v e
// -----------------------------------------------------------------------------------------------------------------

await prova("collegare la cartella ci scrive l'archivio e la copia del giorno", async () => {
  await fresh();
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(dir.files.has("plan-scope.json"));
  assert.ok(dir.files.has(`plan-scope-${today}.json`));
  const payload = latest();
  assert.equal(payload.app, "plan-scope");
  assert.equal(payload.data.projects.length, 1);
  assert.equal(payload.data.pages.length, 1);
  assert.equal(payload.data.tasks.length, 1);
  // Il nodo in più rispetto a «Esporta tutto»: senza, le immagini nella cartella non si ritrovano.
  assert.deepEqual(payload.assets, []);
});

await prova("una cartella che ha già delle copie non viene scritta al collegamento", async () => {
  // Il caso vero: disinstalli l'app, la reinstalli, e ti ritrovi il dimostrativo. Poi ricolleghi la
  // cartella di sempre aspettandoti di rivedere i tuoi progetti. Se il collegamento scrive, quello
  // che scrive è il dimostrativo, e va sopra l'archivio corrente e sopra la copia di oggi.
  dir = folder();
  const prima = JSON.stringify({ app: "plan-scope", data: { projects: [{ id: "vero", name: "Il mio lavoro" }] } });
  dir.files.set("plan-scope.json", prima);
  dir.files.set("plan-scope-2026-09-01.json", prima);

  store.reset();
  store.records.set("projects", [{ id: "d1", uid: "d1", name: "Esempio", demo: true }]);
  globalThis.window.showDirectoryPicker = async () => dir;
  await backup.setup();
  const esito = await backup.link();
  await settle();

  assert.equal(dir.files.get("plan-scope.json"), prima,
    "l'archivio della cartella è stato sovrascritto con quello che c'era in questa copia");
  const oggi = new Date().toISOString().slice(0, 10);
  assert.ok(!dir.files.has(`plan-scope-${oggi}.json`),
    "il collegamento ha aperto la copia di oggi su una cartella che non aveva chiesto di essere scritta");
  // E lo deve riferire, o chi chiama non ha modo di proporre la scelta.
  assert.ok(esito && esito.found && esito.found.length >= 2,
    "il collegamento non dice che nella cartella c'erano già delle copie");
});

await prova("trattenuta, non scrive nemmeno quando qualcosa cambia", async () => {
  dir = folder();
  const prima = JSON.stringify({ app: "plan-scope", data: { projects: [] } });
  dir.files.set("plan-scope.json", prima);
  store.reset();
  store.records.set("projects", [{ id: "d1", uid: "d1", name: "Esempio", demo: true }]);
  globalThis.window.showDirectoryPicker = async () => dir;
  await backup.setup();
  await backup.link();

  // Il timer e ogni «qualcosa è cambiato» passano dalla stessa porta, e quella porta è chiusa.
  fill();
  backup.touch();
  await settle();
  assert.equal(dir.files.get("plan-scope.json"), prima);
  assert.equal((await backup.status()).kind, "held");
});

await prova("trattenuta, un riavvio dell'app non scrive lo stesso", async () => {
  // Il caso peggiore: si collega, si vede la domanda, si chiude senza rispondere. Se lo stato
  // trattenuto vivesse solo in memoria, il risveglio dopo scriverebbe in silenzio proprio quello
  // che il collegamento aveva evitato di scrivere — e dopo una reinstallazione quel «quello» è il
  // dimostrativo.
  dir = folder();
  const prima = JSON.stringify({ app: "plan-scope", data: { projects: [] } });
  dir.files.set("plan-scope.json", prima);
  store.reset();
  store.records.set("projects", [{ id: "d1", uid: "d1", name: "Esempio", demo: true }]);
  globalThis.window.showDirectoryPicker = async () => dir;
  await backup.setup();
  await backup.link();

  await backup.setup();          // l'app riaperta: stessa cartella, stesso deposito
  await settle();
  assert.equal(dir.files.get("plan-scope.json"), prima);
});

await prova("detta la scelta, riprende a scrivere", async () => {
  dir = folder();
  dir.files.set("plan-scope.json", JSON.stringify({ app: "plan-scope", data: { projects: [] } }));
  store.reset();
  fill();
  globalThis.window.showDirectoryPicker = async () => dir;
  await backup.setup();
  await backup.link();
  await backup.release();
  await settle();

  assert.equal(latest().data.projects[0].name, "Rilancio");
  assert.equal((await backup.status()).kind, "linked");
});

await prova("una cartella vuota invece si scrive subito, come prima", async () => {
  await fresh();
  await settle();
  assert.ok(dir.files.has("plan-scope.json"));
});

await prova("un'immagine finisce accanto al testo, e l'archivio la nomina", async () => {
  await fresh();
  store.images.set("a1", store.image("a1", { size: 4 }));
  await backup.resume();                // riprendere la cartella riscrive: è il suo mestiere
  assert.deepEqual(latest().assets.map((one) => one.path), ["assets/a1.png"]);
  assert.ok(assets().files.has("a1.png"));
  assert.equal(assets().files.get("a1.png").length, 4);
});

await prova("una foto incollata fa scattare la scrittura, anche se il testo non si muove", async () => {
  await fresh();
  const before = (await backup.status()).lastWrite;

  // L'app riapre senza che sia cambiato niente: l'impronta è la stessa, e non si scrive.
  await backup.setup();
  await settle();
  assert.equal((await backup.status()).lastWrite, before, "niente di nuovo, niente da scrivere");

  // Adesso una foto, e nemmeno una parola cambiata. Se l'impronta guardasse solo il testo, questa
  // immagine non arriverebbe nella cartella e nessuno se ne accorgerebbe fino al giorno del bisogno.
  store.images.set("a2", store.image("a2", { size: 7 }));
  await backup.setup();
  await settle();
  assert.notEqual((await backup.status()).lastWrite, before);
  assert.ok(assets().files.has("a2.png"));
});

await prova("i byte di un'immagine già nella cartella non si rileggono", async () => {
  await fresh();
  store.images.set("a1", store.image("a1", { size: 4 }));
  await backup.resume();
  const letta = store.reads.count;
  assert.equal(letta, 1, "la prima volta si legge");

  // Una modifica qualsiasi, e un'altra scrittura: l'immagine è già lì, e il suo nome porta il suo
  // contenuto. Rileggerla vorrebbe dire codificare dei megabyte per riscrivere un file identico.
  store.records.set("tasks", [{ id: "t1", uid: "t1", projectId: "p1", title: "Richiamare" }]);
  await backup.resume();
  assert.equal(store.reads.count, letta, "la seconda no");
});

await prova("le copie si elencano, la corrente per prima", async () => {
  await fresh();
  const today = new Date().toISOString().slice(0, 10);
  const copies = await backup.copies();
  assert.equal(copies[0].day, null, "la corrente apre l'elenco");
  assert.equal(copies[0].name, "plan-scope.json");
  assert.deepEqual(copies.slice(1).map((one) => one.day), [today]);
  assert.ok(copies.every((one) => one.size > 0));
});

await prova("una copia si riporta, e le immagini tornano con lei", async () => {
  await fresh();
  store.images.set("a1", store.image("a1", { size: 4 }));
  await backup.resume();

  // Il disastro: il deposito svuotato, come dopo una pulizia del browser.
  store.records.clear();
  store.images.clear();

  const outcome = await backup.restore();
  assert.equal(outcome.ok, true);
  assert.equal(outcome.restored, 3);
  assert.equal(outcome.images, 1);
  assert.equal(store.records.get("projects")[0].name, "Rilancio");
  const back = store.images.get("a1");
  assert.equal(back.projectId, "p1", "l'immagine torna sotto il suo progetto");
  assert.equal(back.size, 4);
});

await prova("un'immagine spazzata lascia tornare le pagine senza di lei", async () => {
  await fresh();
  store.images.set("a1", store.image("a1", { size: 4 }));
  await backup.resume();
  assets().files.delete("a1.png");       // spazzata da un giro precedente, o mai arrivata

  store.records.clear();
  store.images.clear();
  const outcome = await backup.restore();
  assert.equal(outcome.ok, true);
  assert.equal(outcome.images, 0);
  assert.equal(store.records.get("pages").length, 1, "il testo torna comunque");
});

await prova("un file che non è un archivio di quest'app non entra", async () => {
  await fresh();
  dir.files.set("plan-scope.json", JSON.stringify({ format: 1, app: "invoice-scope", data: { docs: [] } }));
  const outcome = await backup.restore();
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "importOtherApp");
});

await prova("una copia che non c'è più si dice, e non rompe niente", async () => {
  await fresh();
  const outcome = await backup.restore("plan-scope-1999-01-01.json");
  assert.deepEqual(outcome, { ok: false, reason: "backupCopyGone" });
});

await prova("scollegare ferma la scrittura e lascia i file dove sono", async () => {
  await fresh();
  await backup.unlink();
  const state = await backup.status();
  assert.equal(state.kind, "none");
  assert.ok(dir.files.has("plan-scope.json"), "quello che c'è resta");
});

console.log(`backup: ${passed} prove passate`);
