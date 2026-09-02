// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Two people, one folder: what the shared folder does between Giulia's browser and Marco's,
// without a browser and without a disk.
//
// Each person is a *world*: their own `model.js`, `sync.js` and a database in memory, loaded as
// separate module instances through a query string on the import — the same trick a page cannot
// use, and the reason this file registers its own resolve hook rather than the one in
// `loader.mjs`. The folder is a fake `FileSystemDirectoryHandle` the two worlds share, which is
// exactly what Dropbox gives them, minus the delay: a test that wants the delay simply does not
// call the other side's round until it wants to.
//
//     node app/plan-scope/test/sync.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// -----------------------------------------------------------------------------------------------------------------
//  w o r l d s
// -----------------------------------------------------------------------------------------------------------------

register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    const parent = context.parentURL ? new URL(context.parentURL) : null;
    const who = parent ? parent.searchParams.get("w") : null;
    if (specifier.startsWith("gg/")) {
      const base = new URL("../../_lib/", context.parentURL.split("?")[0]);
      return next(new URL(specifier.slice(3), base).href, context);
    }
    if (who && specifier === "./db.js") {
      return next(new URL("../test/fake-db.mjs?w=" + who, context.parentURL.split("?")[0]).href, context);
    }
    if (who && specifier.startsWith("./")) {
      return next(new URL(specifier + "?w=" + who, context.parentURL.split("?")[0]).href, context);
    }
    return next(specifier, context);
  }
`), pathToFileURL("./"));

/** One person's app: model, sync and their memory, wired the way `app.js` wires them. */
async function world(who, folder) {
  const model = await import(new URL(`../run/model.js?w=${who}`, import.meta.url));
  const sync = await import(new URL(`../run/sync.js?w=${who}`, import.meta.url));
  const db = await import(new URL(`../test/fake-db.mjs?w=${who}`, import.meta.url));
  const events = { pulled: [], unshared: [], snapshots: [], errors: [] };
  model.connect({
    save: (kind, record) => sync.changed(kind === "project" ? record.id : record.projectId),
    drop: () => {},
  });
  model.hydrate({});
  await sync.setup({
    columns: () => [{ id: "todo", name: "Da fare", done: false }, { id: "done", name: "Fatto", done: true }],
    pulled: (project, outcome, by) => events.pulled.push({ project, outcome, by }),
    unshared: (project) => events.unshared.push(project),
    snapshot: async (page) => { events.snapshots.push(page.title); },
    status: (error) => { if (error) events.errors.push(error); },
  });
  globalThis.window.showDirectoryPicker = async () => folder;
  assert.equal(await sync.link(who), true);
  const project = (name) => model.liveProjects().find((one) => one.name === name);
  const round = async () => { await sync.pullNow(); };
  return { who, model, sync, db, events, project, round };
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   f o l d e r
// -----------------------------------------------------------------------------------------------------------------

class FakeFile {
  constructor(name, data = "") {
    this.kind = "file";
    this.name = name;
    this.data = data;
    this.mtime = Date.now();
  }

  async getFile() {
    const { data, mtime } = this;
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    return {
      size: bytes.length,
      lastModified: mtime,
      text: async () => (typeof data === "string" ? data : new TextDecoder().decode(data)),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }

  async createWritable() {
    return {
      write: async (data) => { this.data = data; },
      close: async () => { this.mtime = Date.now(); },
    };
  }
}

class FakeDir {
  constructor(name) {
    this.kind = "directory";
    this.name = name;
    this.children = new Map();
  }

  async* entries() {
    for (const [name, handle] of [...this.children]) yield [name, handle];
  }

  async getDirectoryHandle(name, { create = false } = {}) {
    const found = this.children.get(name);
    if (found && found.kind === "directory") return found;
    if (!create) throw new Error(`NotFoundError: ${name}`);
    const made = new FakeDir(name);
    this.children.set(name, made);
    return made;
  }

  async getFileHandle(name, { create = false } = {}) {
    const found = this.children.get(name);
    if (found && found.kind === "file") return found;
    if (!create) throw new Error(`NotFoundError: ${name}`);
    const made = new FakeFile(name);
    this.children.set(name, made);
    return made;
  }

  async removeEntry(name) {
    if (!this.children.delete(name)) throw new Error(`NotFoundError: ${name}`);
  }

  async queryPermission() {
    return "granted";
  }

  /** Helpers for the tests: a path read or written by hand, the way Obsidian would. */
  async at(path) {
    let cursor = this;
    const parts = path.split("/");
    for (const part of parts.slice(0, -1)) cursor = await cursor.getDirectoryHandle(part, { create: true });
    return { dir: cursor, name: parts.at(-1) };
  }

  async writeByHand(path, text) {
    const { dir, name } = await this.at(path);
    const file = await dir.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async readByHand(path) {
    const { dir, name } = await this.at(path);
    return (await (await dir.getFileHandle(name)).getFile()).text();
  }

  async list(path = "") {
    const dir = path ? (await this.at(`${path}/x`)).dir : this;
    return [...dir.children.keys()].sort();
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  r u n n e r
// -----------------------------------------------------------------------------------------------------------------

globalThis.window = { showDirectoryPicker: null, addEventListener() {} };
globalThis.document = { visibilityState: "visible", addEventListener() {} };

let passed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

/** The clock moves: stamps compared as strings need a later millisecond. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 3));

const titles = (world, projectId) => world.model.tasksOf(projectId).map((task) => task.title).sort();

// -----------------------------------------------------------------------------------------------------------------
//  p r o v e
// -----------------------------------------------------------------------------------------------------------------

await test("un progetto condiviso finisce nella cartella, e l'altra persona lo trova già condiviso", async () => {
  const folder = new FakeDir("Dropbox");
  const giulia = await world("giulia-1", folder);
  const project = giulia.model.createProject({ name: "Fiera" });
  giulia.model.createPage(project.id, { title: "Brief", markdown: "Uno.\n" });
  giulia.model.createTask(project.id, { title: "Stand" });
  giulia.model.updateProject(project.id, { shared: true });
  giulia.sync.share(project.id);
  await giulia.round();
  assert.deepEqual(await folder.list(), ["Fiera"]);
  assert.deepEqual(await folder.list("Fiera"), ["assets", "pages", "project.json"]);
  assert.deepEqual(await folder.list("Fiera/pages"), ["Brief.md"]);

  const marco = await world("marco-1", folder);
  const theirs = marco.project("Fiera");
  assert.ok(theirs, "Marco ha il progetto");
  assert.equal(theirs.shared, true);
  assert.equal(theirs.uid, project.uid, "è lo stesso progetto, per uid");
  assert.notEqual(theirs.id, project.id, "con un id suo");
  assert.deepEqual(titles(marco, theirs.id), ["Stand"]);
  assert.equal(marco.events.pulled.length, 1);
  assert.equal(marco.events.pulled[0].by, "giulia-1");

  // Nobody merges their own file back: another round on each side is silent.
  await giulia.round();
  await marco.round();
  assert.equal(giulia.events.pulled.length, 0);
  assert.equal(marco.events.pulled.length, 1);
});

await test("le modifiche viaggiano in tutte e due le direzioni, e il testo sostituito ha prima una versione", async () => {
  const folder = new FakeDir("Dropbox");
  const giulia = await world("giulia-2", folder);
  const project = giulia.model.createProject({ name: "Fiera", });
  const brief = giulia.model.createPage(project.id, { title: "Brief", markdown: "Uno.\n" });
  giulia.model.updateProject(project.id, { shared: true });
  await giulia.round();
  const marco = await world("marco-2", folder);
  const theirs = marco.project("Fiera");

  // Marco adds a task and ticks nothing else; Giulia sees it at her next round.
  marco.model.createTask(theirs.id, { title: "Catering" });
  await marco.round();
  await giulia.round();
  assert.deepEqual(titles(giulia, project.id), ["Catering"]);

  // Giulia rewrites the page; Marco's copy is replaced, and kept as a version first.
  await tick();
  giulia.model.setMarkdown(brief.id, "Uno.\n\nDue.\n");
  await giulia.round();
  await marco.round();
  assert.equal(marco.model.pagesOf(theirs.id)[0].markdown, "Uno.\n\nDue.\n");
  assert.deepEqual(marco.events.snapshots, ["Brief"]);
  assert.equal(marco.events.pulled.at(-1).outcome.pageIds.length, 1, "la pagina cambiata è detta, per ricaricarla se è aperta");
  assert.deepEqual(giulia.events.errors, []);
  assert.deepEqual(marco.events.errors, []);
});

await test("la stessa pagina cambiata da tutti e due: nessun paragrafo si perde, e alla fine le copie coincidono", async () => {
  const folder = new FakeDir("Dropbox");
  const giulia = await world("giulia-3", folder);
  const project = giulia.model.createProject({ name: "Fiera" });
  const brief = giulia.model.createPage(project.id, { title: "Scaletta", markdown: "Ore 9.\n" });
  giulia.model.updateProject(project.id, { shared: true });
  await giulia.round();
  const marco = await world("marco-3", folder);
  const theirs = marco.project("Fiera");
  const theirPage = marco.model.pagesOf(theirs.id)[0];

  await tick();
  giulia.model.setMarkdown(brief.id, "Ore 9.\n\nOre 11, Giulia.\n");
  marco.model.setMarkdown(theirPage.id, "Ore 9.\n\nOre 10, Marco.\n");
  await tick();
  await giulia.round();                 // Giulia writes first
  await marco.round();                  // Marco reads hers before writing: conflict, both kept
  assert.equal(marco.events.pulled.at(-1).outcome.conflicts, 1);
  const marcoTexts = marco.model.pagesOf(theirs.id).map((page) => page.markdown).sort();
  assert.deepEqual(marcoTexts, ["Ore 9.\n\nOre 10, Marco.\n", "Ore 9.\n\nOre 11, Giulia.\n"]);
  assert.ok(marco.model.pagesOf(theirs.id).some((page) => page.title === "Scaletta (copia di giulia-1)"
    || page.title.includes("copia")), marco.model.pagesOf(theirs.id).map((page) => page.title).join(" | "));

  await giulia.round();                 // Giulia takes Marco's file: his text on the page, hers as the copy
  const giuliaTexts = giulia.model.pagesOf(project.id).map((page) => page.markdown).sort();
  assert.deepEqual(giuliaTexts, marcoTexts, "le due copie hanno le stesse pagine");
  assert.deepEqual(giulia.model.pagesOf(project.id).map((page) => page.title).sort(),
    marco.model.pagesOf(theirs.id).map((page) => page.title).sort());
  await marco.round();
  await giulia.round();
  assert.equal(giulia.model.pagesOf(project.id).length, 2, "e nessun'altra copia spunta ai giri successivi");
  assert.equal(marco.model.pagesOf(theirs.id).length, 2);
});

await test("il cestino viaggia: attività, pagina e progetto intero", async () => {
  const folder = new FakeDir("Dropbox");
  const giulia = await world("giulia-4", folder);
  const project = giulia.model.createProject({ name: "Fiera" });
  const page = giulia.model.createPage(project.id, { title: "Vecchia", markdown: "X.\n" });
  const task = giulia.model.createTask(project.id, { title: "Stand" });
  giulia.model.updateProject(project.id, { shared: true });
  await giulia.round();
  const marco = await world("marco-4", folder);
  const theirs = marco.project("Fiera");

  await tick();
  giulia.model.trashTask(task.id);
  giulia.model.trashPage(page.id);
  await giulia.round();
  await marco.round();
  assert.deepEqual(titles(marco, theirs.id), []);
  assert.equal(marco.model.tasksOf(theirs.id, { trashed: true }).length, 1, "nel cestino, non sparita");
  assert.equal(marco.model.pagesOf(theirs.id).length, 0);
  assert.deepEqual(await folder.list("Fiera/pages"), ["Vecchia.md"], "il file di una pagina nel cestino resta, con la testa che lo dice");
  assert.ok((await folder.readByHand("Fiera/pages/Vecchia.md")).includes("\ntrashed: "));

  // The whole project, then: binned there, binned here — and it stays binned at the next rounds.
  await tick();
  giulia.model.trashProject(project.id);
  await giulia.round();
  await marco.round();
  assert.ok(marco.model.project(theirs.id).trashedAt, "il progetto è nel cestino anche da Marco");
  assert.equal(marco.events.pulled.at(-1).outcome.trashed, true);
  await giulia.round();
  await marco.round();
  assert.equal(marco.model.liveProjects().length, 0, "e non torna in vita come doppione");
  assert.equal(giulia.model.liveProjects().length, 0);
});

await test("un file scritto senza aver letto l'ultima scrittura dell'altro non fa perdere niente", async () => {
  const folder = new FakeDir("Dropbox");
  const giulia = await world("giulia-5", folder);
  const project = giulia.model.createProject({ name: "Fiera" });
  giulia.model.updateProject(project.id, { shared: true });
  await giulia.round();
  const marco = await world("marco-5", folder);
  const theirs = marco.project("Fiera");

  // Dropbox is slow: Giulia writes a task, Marco — not having received it — writes his own over
  // the folder. Marco's file does not follow from Giulia's, and she answers with the union.
  giulia.model.createTask(project.id, { title: "Di Giulia" });
  await giulia.round();
  const giuliaFile = await folder.readByHand("Fiera/project.json");
  marco.model.createTask(theirs.id, { title: "Di Marco" });
  await marco.round();                  // his round reads hers first — so take that away:
  // put Marco's copy back as if he had written without reading, by rewriting the file from his
  // records alone. `round` above merged Giulia's task into his model; undo that on disk only.
  const marcoFile = JSON.parse(await folder.readByHand("Fiera/project.json"));
  marcoFile.tasks = marcoFile.tasks.filter((task) => task.title === "Di Marco");
  marcoFile.basedOn = "1970-01-01T00:00:00.000Z";
  marcoFile.exported = new Date(Date.now() + 5).toISOString();
  await folder.writeByHand("Fiera/project.json", `${JSON.stringify(marcoFile, null, 2)}\n`);
  assert.notEqual(giuliaFile, await folder.readByHand("Fiera/project.json"));

  await giulia.round();
  assert.deepEqual(titles(giulia, project.id), ["Di Giulia", "Di Marco"]);
  const written = JSON.parse(await folder.readByHand("Fiera/project.json"));
  assert.deepEqual(written.tasks.map((task) => task.title).sort(), ["Di Giulia", "Di Marco"], "Giulia ha riscritto l'unione");
  assert.equal(written.by, "giulia-5");
});

await test("una pagina scritta o cambiata in Obsidian entra, una volta sola, e il suo file non viene cancellato", async () => {
  const folder = new FakeDir("Dropbox");
  const giulia = await world("giulia-6", folder);
  const project = giulia.model.createProject({ name: "Fiera" });
  const brief = giulia.model.createPage(project.id, { title: "Brief", markdown: "Uno.\n" });
  giulia.model.updateProject(project.id, { shared: true });
  await giulia.round();
  const marco = await world("marco-6", folder);
  const theirs = marco.project("Fiera");

  await tick();
  await folder.writeByHand("Fiera/pages/Appunti.md", "# Appunti\n\nA mano.\n");
  await giulia.round();
  await marco.round();
  const mine = giulia.model.pagesOf(project.id).find((page) => page.title === "Appunti");
  const his = marco.model.pagesOf(theirs.id).find((page) => page.title === "Appunti");
  assert.ok(mine && his, "la pagina c'è da tutte e due le parti");
  assert.equal(mine.uid, his.uid, "ed è la stessa pagina");
  assert.deepEqual(await folder.list("Fiera/pages"), ["Appunti.md", "Brief.md"]);
  assert.ok((await folder.readByHand("Fiera/pages/Appunti.md")).startsWith("---\nid: file-"), "ora il file ha la sua testa");
  await giulia.round();
  await marco.round();
  assert.equal(giulia.model.pagesOf(project.id).length, 2, "riletta, non raddoppia");

  // An existing page edited by hand: the head keeps the old `updated`, the file's time is later.
  await tick();
  const text = await folder.readByHand("Fiera/pages/Brief.md");
  await folder.writeByHand("Fiera/pages/Brief.md", text.replace("Uno.\n", "Uno, corretto a mano.\n"));
  await giulia.round();
  assert.equal(giulia.model.page(brief.id).markdown, "Uno, corretto a mano.\n");
});

await test("un progetto non più condiviso non riceve e non scrive; una cartella sparita toglie la condivisione", async () => {
  const folder = new FakeDir("Dropbox");
  const giulia = await world("giulia-7", folder);
  const project = giulia.model.createProject({ name: "Fiera" });
  giulia.model.updateProject(project.id, { shared: true });
  await giulia.round();
  const marco = await world("marco-7", folder);
  const theirs = marco.project("Fiera");

  marco.model.updateProject(theirs.id, { shared: false });
  giulia.model.createTask(project.id, { title: "Dopo" });
  await giulia.round();
  await marco.round();
  assert.deepEqual(titles(marco, theirs.id), [], "Marco non riceve più");
  marco.model.createTask(theirs.id, { title: "Solo mia" });
  await marco.round();
  await giulia.round();
  assert.deepEqual(titles(giulia, project.id), ["Dopo"], "e non scrive più");

  // Somebody removes the folder in Dropbox: Giulia's next write finds it gone.
  await folder.removeEntry("Fiera");
  giulia.model.createTask(project.id, { title: "Ancora" });
  await giulia.round();
  assert.equal(giulia.model.project(project.id).shared, false);
  assert.equal(giulia.events.unshared.length, 1);
  assert.deepEqual(await folder.list(), [], "e non la ricrea");
});

await test("«Elimina la cartella condivisa»: la cartella sparisce per tutti, i progetti restano, non più condivisi", async () => {
  const folder = new FakeDir("Dropbox");
  const giulia = await world("giulia-9", folder);
  const project = giulia.model.createProject({ name: "Fiera" });
  giulia.model.createTask(project.id, { title: "Stand" });
  giulia.model.updateProject(project.id, { shared: true });
  await giulia.round();
  const marco = await world("marco-9", folder);
  const theirs = marco.project("Fiera");
  assert.equal(giulia.sync.folderOf(giulia.model.project(project.id)), "Fiera");

  giulia.model.trashProject(project.id);
  assert.equal(await giulia.sync.removeFolder(project.id), true);
  assert.deepEqual(await folder.list(), []);
  assert.equal(giulia.model.project(project.id).shared, false);
  assert.ok(giulia.model.project(project.id).trashedAt, "da Giulia resta nel cestino");
  assert.equal(giulia.sync.folderOf(giulia.model.project(project.id)), null);

  // Marco's next read notices, without waiting for him to write something.
  await marco.round();
  assert.equal(marco.model.project(theirs.id).shared, false);
  assert.equal(marco.model.project(theirs.id).trashedAt, null, "da Marco resta vivo, suo");
  assert.equal(marco.events.unshared.length, 1);
  assert.deepEqual(titles(marco, theirs.id), ["Stand"]);
  marco.model.createTask(theirs.id, { title: "Dopo" });
  await marco.round();
  assert.deepEqual(await folder.list(), [], "e non la ricrea");
});

await test("una cartella scritta da un'app più nuova non si legge e non si sovrascrive", async () => {
  const folder = new FakeDir("Dropbox");
  const giulia = await world("giulia-8", folder);
  const project = giulia.model.createProject({ name: "Fiera" });
  giulia.model.updateProject(project.id, { shared: true });
  await giulia.round();
  const json = JSON.parse(await folder.readByHand("Fiera/project.json"));
  await folder.writeByHand("Fiera/project.json", JSON.stringify({ ...json, format: 99, tasks: [{ title: "Dal futuro" }] }));
  giulia.model.createTask(project.id, { title: "Di oggi" });
  await giulia.round();
  assert.deepEqual(titles(giulia, project.id), ["Di oggi"], "niente entra");
  assert.equal(JSON.parse(await folder.readByHand("Fiera/project.json")).format, 99, "e niente esce");
  assert.deepEqual(giulia.events.errors, []);
});

console.log(`sync: ${passed} prove passate`);
