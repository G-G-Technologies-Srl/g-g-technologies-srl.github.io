// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Le cartelle madre: dove un progetto può essere condiviso, e a che prezzo in permessi.
//
// Quello che si prova qui è il motivo per cui il file esiste. Il permesso si dà per handle: se
// condividere due progetti nello stesso posto costasse due handle, costerebbe due click a ogni
// riavvio del browser. Quindi una madre si autorizza una volta e tiene quanti progetti si vuole,
// la stessa cartella scelta due volte resta una, e la cartella locale è una madre come le altre —
// la prima — senza essere nell'elenco di quelle salvate, perché quella è dell'archivio.
//
// La migrazione dalla 2.x sta qui e non in `sync.js`: è una cartella che cambia ruolo, non un
// progetto che cambia posto.
//
//     node app/plan-scope/test/folders.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    const from = context.parentURL || "";
    if (specifier === "./db.js" && from.endsWith("/run/folders.js")) {
      return next(new URL("../test/fake-archive.mjs", from).href, context);
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

let picked = null;
globalThis.window = { showDirectoryPicker: async () => {
  if (!picked) throw Object.assign(new Error("chiuso"), { name: "AbortError" });
  return picked;
} };

const folders = await import("../run/folders.js");

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

let local = null;

/** Da capo: nessuna madre ricordata, nessuna cartella locale, il selettore che non dà niente. */
async function fresh({ withLocal = true } = {}) {
  store.reset();
  local = withLocal ? folder("Plan Scope") : null;
  picked = null;
  await folders.setup({ local: () => local });
}

/** Una cartella con dentro delle sottocartelle, alcune delle quali sono progetti. */
async function withProjects(handle, ...names) {
  for (const one of names) {
    const sub = await handle.getDirectoryHandle(one, { create: true });
    await sub.getFileHandle("project.json", { create: true });
  }
  return handle;
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   p r o v e
// -----------------------------------------------------------------------------------------------------------------

await prova("senza cartella locale e senza madri, non c'è dove condividere", async () => {
  await fresh({ withLocal: false });
  assert.deepEqual(await folders.all(), []);
});

await prova("la cartella locale è una madre, ed è la prima", async () => {
  await fresh();
  const list = await folders.all();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, folders.LOCAL);
  assert.equal(list[0].name, "Plan Scope");
  assert.equal(list[0].local, true);
  assert.equal(list[0].state, "granted");
});

await prova("una cartella scelta col selettore diventa una madre, e resta dopo un riavvio", async () => {
  await fresh();
  picked = folder("Cliente Rossi");
  const id = await folders.add();
  assert.ok(id && id !== folders.LOCAL);
  assert.deepEqual((await folders.all()).map((one) => one.name), ["Plan Scope", "Cliente Rossi"]);

  // L'app riapre: le madri tornano dal deposito, con i loro handle.
  await folders.setup({ local: () => local });
  assert.deepEqual((await folders.all()).map((one) => one.name), ["Plan Scope", "Cliente Rossi"]);
  assert.equal(folders.name(id), "Cliente Rossi");
});

await prova("la stessa cartella scelta due volte resta una", async () => {
  await fresh();
  picked = folder("Cliente Rossi");
  const first = await folders.add();
  const second = await folders.add();
  assert.equal(second, first, "sceglierla di nuovo è sceglierla, non aggiungerla");
  assert.equal((await folders.all()).length, 2);
});

await prova("scegliere la cartella locale non ne fa una seconda", async () => {
  await fresh();
  picked = local;
  const id = await folders.add();
  assert.equal(id, folders.LOCAL);
  assert.equal((await folders.all()).length, 1);
});

await prova("il selettore chiuso non aggiunge niente", async () => {
  await fresh();
  picked = null;
  assert.equal(await folders.add(), null);
  assert.equal((await folders.all()).length, 1);
});

await prova("una madre aspetta il permesso, e riprenderla lo rimette", async () => {
  await fresh();
  picked = folder("Cliente Rossi");
  const id = await folders.add();
  picked.permissionState = "prompt";
  assert.equal((await folders.all()).find((one) => one.id === id).state, "prompt");
  assert.equal(await folders.resume(id), true);
  assert.equal(await folders.permission(id), "granted");
});

await prova("la cartella di un progetto si crea dentro la madre, e si ritrova", async () => {
  await fresh();
  picked = folder("Cliente Rossi");
  const id = await folders.add();

  // Chiedere senza creare, prima che esista, è nessuna cartella: è così che `sync.js` scopre che
  // qualcuno l'ha tolta di mezzo apposta.
  assert.equal(await folders.dirOf(id, "Sito nuovo"), null);

  const made = await folders.dirOf(id, "Sito nuovo", { create: true });
  assert.ok(made);
  assert.equal(made.name, "Sito nuovo");
  const again = await folders.dirOf(id, "Sito nuovo");
  assert.equal(again, made, "la stessa cartella, non una nuova");
});

await prova("due progetti nella stessa madre non costano un permesso in più", async () => {
  await fresh();
  picked = folder("Cliente Rossi");
  const id = await folders.add();
  await folders.dirOf(id, "Sito nuovo", { create: true });
  await folders.dirOf(id, "Campagna", { create: true });
  assert.equal((await folders.all()).length, 2, "una madre sola, per due progetti");
  assert.deepEqual([...picked.subs.keys()].sort(), ["Campagna", "Sito nuovo"]);
});

await prova("i progetti dentro una madre si contano, e le altre cartelle no", async () => {
  await fresh();
  picked = await withProjects(folder("Cliente Rossi"), "Sito nuovo", "Campagna");
  await picked.getDirectoryHandle("Fatture", { create: true });   // non è un progetto
  picked.files.set("appunti.txt", "roba");
  const id = await folders.add();
  assert.deepEqual(await folders.projectsIn(id), ["Campagna", "Sito nuovo"]);
});

await prova("dimenticare una madre la toglie dall'elenco e lascia i file", async () => {
  await fresh();
  picked = await withProjects(folder("Cliente Rossi"), "Sito nuovo");
  const id = await folders.add();
  assert.equal(await folders.forget(id), true);
  assert.deepEqual((await folders.all()).map((one) => one.name), ["Plan Scope"]);
  assert.ok(picked.subs.has("Sito nuovo"), "quello che c'è sul disco resta");
});

await prova("la cartella locale non si dimentica da qui", async () => {
  await fresh();
  assert.equal(await folders.forget(folders.LOCAL), false);
  assert.equal((await folders.all()).length, 1, "si scollega dov'è stata collegata, e in nessun altro posto");
});

await prova("la cartella condivisa della 2.x diventa la prima madre, una volta sola", async () => {
  await fresh();
  const vecchia = await withProjects(folder("Progetti condivisi"), "Fiera di settembre");
  await store.setMeta("folderHandle", vecchia);

  const id = await folders.setup({ local: () => local });
  assert.ok(id, "la migrazione dice in che madre si è trasformata");
  assert.deepEqual((await folders.all()).map((one) => one.name), ["Plan Scope", "Progetti condivisi"]);
  // I progetti sono dove erano: nessun permesso nuovo, niente da riscrivere.
  assert.deepEqual(await folders.projectsIn(id), ["Fiera di settembre"]);

  // E riaprendo ancora non se ne fa una seconda.
  const again = await folders.setup({ local: () => local });
  assert.equal(again, id);
  assert.equal((await folders.all()).length, 2);
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   c a r t e l l a   c h e   a r r i v a   d a   q u a l c u n   a l t r o
// -----------------------------------------------------------------------------------------------------------------

await prova("una cartella che è un progetto si apre, si conosce, e non è un posto dove condividere", async () => {
  await fresh();
  // Quello che Dropbox mette nella cartella di Marco è la cartella del progetto, e niente sopra.
  picked = folder("Sito nuovo");
  await picked.getFileHandle("project.json", { create: true });
  const opened = await folders.adopt();
  assert.ok(opened && opened.id);
  assert.equal(opened.handle, picked);

  // L'app la conosce, ne tiene il permesso, e quel permesso costa un click a ogni riavvio: un
  // elenco che si chiama «le cartelle che conosci» e la lascia fuori promette più di quel che dà.
  assert.deepEqual((await folders.all()).map((one) => one.name), ["Plan Scope", "Sito nuovo"]);

  // Ma offrirla fra i posti dove condividere vorrebbe dire fare un progetto dentro un progetto.
  assert.deepEqual(folders.forSharing(await folders.all()).map((one) => one.name), ["Plan Scope"]);
});

await prova("la cartella di un progetto arrivato da fuori è il progetto, senza sottocartella", async () => {
  await fresh();
  picked = folder("Sito nuovo");
  await picked.getFileHandle("project.json", { create: true });
  const opened = await folders.adopt();
  assert.equal(await folders.dirOf(opened.id, null), picked);
  assert.equal(folders.name(opened.id), "Sito nuovo");
});

await prova("aprire due volte la stessa cartella la apre una volta sola", async () => {
  await fresh();
  picked = folder("Sito nuovo");
  await picked.getFileHandle("project.json", { create: true });
  const first = await folders.adopt();
  const second = await folders.adopt();
  assert.equal(second.id, first.id);
});

await prova("una madre e una cartella di progetto convivono, e restano due cose diverse", async () => {
  await fresh();
  picked = folder("Cliente Rossi");
  const madre = await folders.add();
  picked = folder("Sito nuovo");
  await picked.getFileHandle("project.json", { create: true });
  const aperta = await folders.adopt();

  assert.deepEqual(folders.forSharing(await folders.all()).map((one) => one.name),
    ["Plan Scope", "Cliente Rossi"]);
  assert.deepEqual((await folders.all()).map((one) => one.name),
    ["Plan Scope", "Cliente Rossi", "Sito nuovo"], "conosciute tutte e tre");
  // E tutte e due si risolvono, e ognuna costa un permesso: è quello che questo file conta.
  assert.ok(await folders.dirOf(madre, "Campagna", { create: true }));
  assert.ok(await folders.dirOf(aperta.id, null));
  assert.equal(await folders.permission(aperta.id), "granted");
});

console.log(`folders: ${passed} prove passate`);
