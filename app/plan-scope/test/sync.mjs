// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Two people, one folder: what the shared folder does between Giulia's browser and Marco's,
// without a browser and without a disk.
//
// Dalla 3.0 una cartella appartiene a un progetto, non all'app: `world()` aggiunge una madre e poi
// **apre** i progetti che ci trova, che è quello che una persona fa con «Apri una cartella
// condivisa…». Il giro di ognuno riapre la madre prima di leggere, così un progetto nuovo messo lì
// dall'altra persona arriva come arrivava con la scansione della 2.x — con la differenza che qui
// qualcuno l'ha chiesto.
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
      // Il modello sta in _lib da quando lo usano due app, e qui va tenuto separato per persona
      // come tutto il resto: senza il ?w= le due scrivanie condividerebbero un'istanza sola, e la
      // prova sui conflitti proverebbe due copie che sono lo stesso oggetto.
      const base = new URL("../../_lib/", context.parentURL.split("?")[0]);
      const url = new URL(specifier.slice(3), base);
      if (who) url.search = "?w=" + who;
      return next(url.href, context);
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
async function world(who, folder, { open = true } = {}) {
  const model = await import(new URL(`../../_lib/plan-model.js?w=${who}`, import.meta.url));
  const sync = await import(new URL(`../run/sync.js?w=${who}`, import.meta.url));
  const folders = await import(new URL(`../run/folders.js?w=${who}`, import.meta.url));
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
  const parent = await sync.addFolder(who);
  assert.ok(parent, "la cartella è una madre");
  const project = (name) => model.liveProjects().find((one) => one.name === name);
  /** Aprire quello che nella madre non è ancora stato aperto: il gesto, non una scansione. */
  const adopt = async () => {
    for (const sub of await folders.projectsIn(parent)) await sync.openFrom(parent, sub);
  };
  const round = async () => { if (open) await adopt(); await sync.pullNow(); };
  if (open) await adopt();
  const one = { who, model, sync, folders, db, events, project, parent, round, adopt };
  /** Condividere: la spunta, e la cartella in cui finisce. Nell'app sono un gesto solo. */
  one.shareIt = (id) => {
    model.updateProject(id, { shared: true });
    sync.share(id, parent);
  };
  return one;
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
    // Il permesso si può mettere a «prompt» per provare la mattina in cui il browser l'ha lasciato
    // cadere su una cartella e non sulle altre.
    this.permission = "granted";
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
    return this.permission;
  }

  async requestPermission() {
    this.permission = "granted";
    return "granted";
  }

  async isSameEntry(other) {
    return other === this;
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
  giulia.shareIt(project.id);
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
  giulia.shareIt(project.id);
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
  giulia.shareIt(project.id);
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
  giulia.shareIt(project.id);
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
  giulia.shareIt(project.id);
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
  giulia.shareIt(project.id);
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
  giulia.shareIt(project.id);
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
  giulia.shareIt(project.id);
  await giulia.round();
  const marco = await world("marco-9", folder);
  const theirs = marco.project("Fiera");
  assert.equal(giulia.sync.folderOf(giulia.model.project(project.id)).sub, "Fiera");

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
  giulia.shareIt(project.id);
  await giulia.round();
  const json = JSON.parse(await folder.readByHand("Fiera/project.json"));
  await folder.writeByHand("Fiera/project.json", JSON.stringify({ ...json, format: 99, tasks: [{ title: "Dal futuro" }] }));
  giulia.model.createTask(project.id, { title: "Di oggi" });
  await giulia.round();
  assert.deepEqual(titles(giulia, project.id), ["Di oggi"], "niente entra");
  assert.equal(JSON.parse(await folder.readByHand("Fiera/project.json")).format, 99, "e niente esce");
  assert.deepEqual(giulia.events.errors, []);
});

// -----------------------------------------------------------------------------------------------------------------
//  u n a   c a r t e l l a   p e r   p r o g e t t o
// -----------------------------------------------------------------------------------------------------------------

/** Le attività scritte nel file di un progetto: quello che l'altra persona vedrà davvero. */
const written = async (dir, sub) =>
  JSON.parse(await dir.readByHand(`${sub}/project.json`)).tasks.map((task) => task.title).sort();

await test("due progetti in due cartelle: ognuno va dove è stato messo, e chi ha una non vede l'altra", async () => {
  const rossi = new FakeDir("Cliente Rossi");
  const bianchi = new FakeDir("Cliente Bianchi");
  const giulia = await world("giulia-10", rossi);
  globalThis.window.showDirectoryPicker = async () => bianchi;
  const altra = await giulia.sync.addFolder();

  const sito = giulia.model.createProject({ name: "Sito" });
  giulia.model.createTask(sito.id, { title: "Bozza" });
  giulia.model.updateProject(sito.id, { shared: true });
  giulia.sync.share(sito.id, giulia.parent);

  const campagna = giulia.model.createProject({ name: "Campagna" });
  giulia.model.createTask(campagna.id, { title: "Volantini" });
  giulia.model.updateProject(campagna.id, { shared: true });
  giulia.sync.share(campagna.id, altra);

  // E uno che non è condiviso con nessuno, che è il caso più comune di tutti.
  const interno = giulia.model.createProject({ name: "Bilancio" });
  await giulia.round();

  assert.deepEqual(await rossi.list(), ["Sito"]);
  assert.deepEqual(await bianchi.list(), ["Campagna"]);
  assert.equal(giulia.model.project(interno.id).shared, undefined);

  // Rossi ha in mano la sua cartella, e quello dell'altro cliente non esiste per lui.
  const marco = await world("marco-10", rossi);
  assert.ok(marco.project("Sito"), "il suo progetto arriva");
  assert.equal(marco.project("Campagna"), undefined, "quello dell'altro cliente no");
  assert.equal(marco.project("Bilancio"), undefined);
});

await test("una cartella che aspetta il permesso ferma il suo progetto, e non gli altri", async () => {
  const rossi = new FakeDir("Cliente Rossi");
  const bianchi = new FakeDir("Cliente Bianchi");
  const giulia = await world("giulia-11", rossi);
  globalThis.window.showDirectoryPicker = async () => bianchi;
  const altra = await giulia.sync.addFolder();

  const sito = giulia.model.createProject({ name: "Sito" });
  giulia.model.updateProject(sito.id, { shared: true });
  giulia.sync.share(sito.id, giulia.parent);
  const campagna = giulia.model.createProject({ name: "Campagna" });
  giulia.model.updateProject(campagna.id, { shared: true });
  giulia.sync.share(campagna.id, altra);
  await giulia.round();

  // Il browser lascia cadere il permesso su una delle due, che è quello che fa ogni mattina.
  bianchi.permission = "prompt";
  giulia.model.createTask(sito.id, { title: "Bozza" });
  giulia.model.createTask(campagna.id, { title: "Volantini" });
  await giulia.round();

  assert.deepEqual(await written(rossi, "Sito"), ["Bozza"], "l'altra continua a lavorare");
  assert.deepEqual(await written(bianchi, "Campagna"), [], "questa aspetta, e non si scrive a metà");
  const stato = await giulia.sync.status();
  assert.equal(stato.kind, "prompt");
  assert.deepEqual(stato.waiting, ["Cliente Bianchi"], "e l'archivio dice quale");

  // Ripresa, riparte da dov'era: la modifica di prima non è andata persa.
  assert.equal(await giulia.sync.resumeFolder(altra), true);
  assert.deepEqual(await written(bianchi, "Campagna"), ["Volantini"]);
  assert.equal((await giulia.sync.status()).kind, "linked");
});

await test("una cartella che è il progetto si apre, e smettere di seguirla non la cancella", async () => {
  const dropbox = new FakeDir("Dropbox");
  const giulia = await world("giulia-12", dropbox);
  const project = giulia.model.createProject({ name: "Fiera" });
  giulia.model.createTask(project.id, { title: "Stand" });
  giulia.shareIt(project.id);
  await giulia.round();

  // Quello che arriva a Marco è la cartella del progetto, e niente sopra: è come Dropbox condivide.
  const sola = await dropbox.getDirectoryHandle("Fiera");
  const marco = await world("marco-12", new FakeDir("Vuota"));
  globalThis.window.showDirectoryPicker = async () => sola;
  const opened = await marco.sync.openShared();
  assert.equal(opened.ok, true, "il progetto entra");
  const theirs = opened.project;
  assert.equal(theirs.name, "Fiera");
  assert.equal(theirs.shared, true);
  assert.deepEqual(titles(marco, theirs.id), ["Stand"]);

  // E da lì in poi è una condivisione come le altre.
  marco.model.createTask(theirs.id, { title: "Catering" });
  await marco.round();
  await giulia.round();
  assert.deepEqual(titles(giulia, project.id), ["Catering", "Stand"]);

  // Smettere di seguirla lascia in piedi la cartella, che è di qualcun altro.
  assert.equal(await marco.sync.removeFolder(theirs.id), true);
  assert.deepEqual(await dropbox.list(), ["Fiera"], "la cartella di Giulia resta dov'è");
  assert.equal(marco.model.project(theirs.id).shared, false);
  assert.deepEqual(titles(marco, theirs.id), ["Catering", "Stand"], "e il lavoro resta a Marco");
});

await test("la cartella condivisa della 2.x diventa una madre, e niente si riscrive", async () => {
  const folder = new FakeDir("Progetti condivisi");
  const giulia = await world("giulia-13", folder);
  const project = giulia.model.createProject({ name: "Fiera" });
  giulia.model.createTask(project.id, { title: "Stand" });
  giulia.shareIt(project.id);
  await giulia.round();
  const before = JSON.parse(await folder.readByHand("Fiera/project.json"));

  // Il deposito com'era prima della 3.0: un handle solo, e i marks con il nome della sottocartella.
  const marks = (await giulia.db.meta("sync")).marks;
  const uid = Object.keys(marks)[0];
  const { parent, sub, self, ...old } = marks[uid];
  await giulia.db.setMeta("sync", { who: "giulia-13", marks: { [uid]: { ...old, folder: sub } } });
  await giulia.db.setMeta("folderHandle", folder);
  await giulia.db.setMeta("folders", []);

  await giulia.sync.setup({ status: () => {} });

  const dopo = (await giulia.db.meta("sync")).marks[uid];
  assert.ok(dopo.parent, "il mark adesso dice in quale madre");
  assert.equal(dopo.sub, "Fiera");
  assert.equal(dopo.folder, undefined, "e non porta più il vecchio campo");
  assert.equal(dopo.pushed, old.pushed, "l'impronta è la stessa: non c'è niente da riscrivere");
  assert.deepEqual(giulia.sync.folderOf(giulia.model.project(project.id)),
    { folder: "Progetti condivisi", sub: "Fiera" });
  assert.deepEqual(JSON.parse(await folder.readByHand("Fiera/project.json")), before,
    "e il file sul disco è lettera per lettera quello di prima");
});

await test("un progetto messo lì da qualcun altro si vede prima di entrare, e entra quando lo apri", async () => {
  const folder = new FakeDir("Cliente Rossi");
  const giulia = await world("giulia-14", folder);
  const sito = giulia.model.createProject({ name: "Sito" });
  giulia.model.createTask(sito.id, { title: "Bozza" });
  giulia.shareIt(sito.id);
  const campagna = giulia.model.createProject({ name: "Campagna" });
  giulia.shareIt(campagna.id);
  await giulia.round();

  // Marco ha la stessa cartella e non ha aperto niente: la 2.x gliene avrebbe messi due in casa.
  const marco = await world("marco-14", folder, { open: false });
  assert.deepEqual(marco.model.liveProjects(), [], "niente entra da solo");

  const dentro = await marco.folders.projectsIn(marco.parent);
  assert.deepEqual(dentro, ["Campagna", "Sito"]);
  assert.deepEqual(marco.sync.unopened(marco.parent, dentro), ["Campagna", "Sito"],
    "ma l'app sa che ci sono, e lo dice");

  // Ne apre uno. L'altro resta dov'è, e resta da aprire.
  const preso = await marco.sync.openFrom(marco.parent, "Sito");
  assert.equal(preso.name, "Sito");
  assert.deepEqual(titles(marco, preso.id), ["Bozza"]);
  assert.equal(marco.model.liveProjects().length, 1);
  assert.deepEqual(marco.sync.unopened(marco.parent, dentro), ["Campagna"]);

  // E da lì in poi è una condivisione come le altre.
  marco.model.createTask(preso.id, { title: "Catering" });
  await marco.sync.pullNow();
  await giulia.round();
  assert.deepEqual(titles(giulia, sito.id), ["Bozza", "Catering"]);
});

await test("l'elenco delle cartelle sa quali progetti tiene ognuna, col nome che hanno qui", async () => {
  const rossi = new FakeDir("Cliente Rossi");
  const bianchi = new FakeDir("Cliente Bianchi");
  const giulia = await world("giulia-15", rossi);
  globalThis.window.showDirectoryPicker = async () => bianchi;
  const altra = await giulia.sync.addFolder();

  const sito = giulia.model.createProject({ name: "Sito nuovo" });
  giulia.model.updateProject(sito.id, { shared: true });
  giulia.sync.share(sito.id, giulia.parent);
  const campagna = giulia.model.createProject({ name: "Campagna" });
  giulia.model.updateProject(campagna.id, { shared: true });
  giulia.sync.share(campagna.id, giulia.parent);
  const volantini = giulia.model.createProject({ name: "Volantini" });
  giulia.model.updateProject(volantini.id, { shared: true });
  giulia.sync.share(volantini.id, altra);
  giulia.model.createProject({ name: "Bilancio" });      // di nessuno, e non compare
  await giulia.round();

  // L'ordine è quello dell'archivio — l'ultimo toccato per primo — e non quello di creazione.
  assert.deepEqual(giulia.sync.projectsOf(giulia.parent).map((one) => one.name).sort(),
    ["Campagna", "Sito nuovo"]);
  assert.deepEqual(giulia.sync.projectsOf(altra).map((one) => one.name), ["Volantini"]);

  // Il nome è quello di qui: Marco apre lo stesso progetto e lo rinomina, e ognuno vede il suo.
  const marco = await world("marco-15", rossi);
  const theirs = marco.project("Sito nuovo");
  marco.model.updateProject(theirs.id, { name: "Il sito dei Rossi" });
  await marco.round();
  assert.deepEqual(marco.sync.projectsOf(marco.parent).map((one) => one.name).sort(),
    ["Campagna", "Il sito dei Rossi"]);
  await giulia.round();
  assert.ok(giulia.sync.projectsOf(giulia.parent).some((one) => one.name === "Il sito dei Rossi"),
    "e il nome viaggia come ogni altro campo del progetto");
});

await test("dalla cartella passano i nomi di chi lavora al progetto, e non i loro recapiti", async () => {
  const folder = new FakeDir("Dropbox");
  const giulia = await world("giulia-16", folder);
  const fiera = giulia.model.createProject({ name: "Fiera" });
  const rossi = giulia.model.createContact({
    name: "Marco Rossini",
    company: "Studio Rossi",
    email: "marco@studiorossi.it",
    phone: "0549 900100",
  });
  giulia.model.addPerson(fiera.id, rossi.id, "capoprogetto");
  const stand = giulia.model.createTask(fiera.id, { title: "Stand" });
  giulia.model.assignByName(stand.id, "Marco Rossini");
  giulia.shareIt(fiera.id);
  await giulia.round();

  // Quello che è finito su disco, letto come lo leggerebbe chiunque apra la cartella.
  const written = await folder.readByHand("Fiera/project.json");
  const json = JSON.parse(written);
  assert.deepEqual(json.project.people, [
    { uid: rossi.uid, name: "Marco Rossini", role: "capoprogetto" },
  ]);
  // La regola, provata sul testo e non sulla forma: in tutta la cartella non c'è un recapito.
  for (const path of ["Fiera/project.json"]) {
    const text = await folder.readByHand(path);
    for (const secret of ["marco@studiorossi.it", "0549 900100", "Studio Rossi"]) {
      assert.ok(!text.includes(secret), `«${secret}» non esce dalla rubrica (${path})`);
    }
  }

  // Marco apre la cartella: sa chi ci lavora e cosa fa, e la rubrica sua resta la sua.
  const marco = await world("marco-16", folder);
  const theirs = marco.project("Fiera");
  assert.deepEqual(marco.model.peopleOf(theirs.id).map((one) => `${one.name} — ${one.role}`),
    ["Marco Rossini — capoprogetto"]);
  const card = marco.model.tasksOf(theirs.id).find((task) => task.title === "Stand");
  assert.equal(marco.model.assigneeName(card), "Marco Rossini", "la casella dice chi, senza la scheda");
  assert.deepEqual(marco.model.liveContacts(), [], "e in rubrica non è comparso nessuno");

  // Il ruolo lo può correggere anche senza la scheda, e mette del suo: torna indietro tutto.
  await tick();
  marco.model.setPersonRole(theirs.id, rossi.uid, "cliente");
  const giulia2 = marco.model.createContact({ name: "Giulia Bianchi", email: "giulia@example.com" });
  marco.model.addPerson(theirs.id, giulia2.id, "grafica");
  await marco.round();
  await giulia.round();
  assert.deepEqual(giulia.model.peopleOf(fiera.id).map((one) => `${one.name} — ${one.role}`).sort(),
    ["Giulia Bianchi — grafica", "Marco Rossini — cliente"]);
  const back = await folder.readByHand("Fiera/project.json");
  assert.ok(!back.includes("giulia@example.com"), "e nemmeno al ritorno esce un recapito");

  // Adottarla è un gesto, non una conseguenza: la scheda nasce qui col `uid` di là.
  marco.model.adoptPerson(theirs.id, rossi.uid);
  const adopted = marco.model.contactByUid(rossi.uid);
  assert.equal(adopted.name, "Marco Rossini");
  assert.equal(adopted.email, "", "la scheda nasce vuota: i recapiti non li aveva nessuno qui");
});

console.log(`sync: ${passed} prove passate`);
