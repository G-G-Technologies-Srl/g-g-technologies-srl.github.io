// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A folder the person chose, kept across sessions — and, on top of it, an archive that writes
// itself there.
//
// **Three apps keep their data in a browser, and a browser is one copy.** Plan Scope was the first
// to point itself at a folder — its shared folder, where two people merge one project — and
// Invoice Scope the second, for the plainer thing: the whole archive written into a folder, the
// same file as «Esporta tutto», so that a Dropbox or iCloud folder carries the backup by itself.
// The second use is what moved the common part here, as `app/CLAUDE.md` says it should.
//
// Two layers, because the two apps want different things above the same floor:
//
//  - **`linkFolder`** is the floor: the `FileSystemDirectoryHandle` the picker hands out, saved
//    in the app's database and taken back at the next start; the permission, which the browser
//    does not always keep and then has to be asked for again from a click; link, resume, unlink.
//    Plan Scope stops here and does its own reading and merging on top.
//  - **`backupWriter`** is the archive: a snapshot the app produces as text with a fingerprint,
//    written as `<prefix>.json` whenever the fingerprint changed — and only then, so that an open
//    tab does not rewrite an identical file once a minute and make a sync client carry it — plus
//    one dated copy a day, `<prefix>-2026-09-06.json`, kept for the last thirty: a file overwritten
//    with something wrong is caught by the copy from before, which a single file never is. Older
//    dated copies are deleted, those and nothing else, matched by name, in a folder that is not
//    ours to tidy. The fingerprint and the time of the last write are saved beside the handle,
//    so that a reopen with nothing changed writes nothing and still says when the last copy was.
//    A snapshot may also carry **files that do not fit in the text** — Plan Scope's images, which
//    are blobs and would have to become base64 to travel in JSON. They are written beside it,
//    named by their content, so the thirty dated copies share one set of pictures instead of
//    carrying thirty; and they are swept, once a day, only when no copy in the folder names them
//    any more. Invoice Scope passes none, and writes exactly the one file it wrote before.
//
// **Nothing here makes a request.** The folder is the operating system's, and so is whatever
// carries it elsewhere. Only Chromium browsers on a desktop hand a folder out — `available()` says
// so, and an app shows the sentence instead of the button. Two tabs of one browser take turns
// through a Web Lock. Everything the browser cannot do is returned as a status, not hidden.
//
// The apps keep the handle through `load`/`save` callbacks rather than a store handed in: Plan
// Scope keeps `{key, value}` records in a `meta` store behind two functions of its own, Invoice
// Scope keeps them through `gg/store.js` directly, and this file has no reason to know which.
//
// The pure part — `writeSnapshot` — takes the directory handle as an argument and runs under Node
// with a fake: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/backup.mjs`.

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

export const KEEP_DAYS = 30;

const WRITE_DELAY_MS = 3000;            // a change settles before the file is rewritten
const WRITE_EVERY_MS = 60 * 1000;       // and whatever was missed is caught up once a minute

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   s m a l l   t h i n g s   s h a r e d
// -----------------------------------------------------------------------------------------------------------------

/** Whether this browser can hand out a folder at all: Chromium on a desktop, today. */
export function available() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * A short, stable fingerprint of a string: enough to tell «changed» from «the same».
 *
 * The formula is the one Plan Scope had before this file existed, kept to the bit: its marks store
 * these fingerprints, and a different formula would have made every shared project look changed
 * once, and be rewritten once, on the first start after the update.
 */
export function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${h.toString(16)}:${text.length}`;
}

/** Take turns under `name`: one tab at a time. Where locks do not exist, just run. */
export function withLock(name, fn) {
  if (typeof navigator !== "undefined" && navigator.locks && navigator.locks.request) {
    return navigator.locks.request(name, fn);
  }
  return fn();
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   t h e   f o l d e r
// -----------------------------------------------------------------------------------------------------------------

/**
 * A folder handle that survives between sessions.
 *
 * `id` names the picker's own memory of where it was last opened; `load(key)` and `save(key,
 * value)` keep the handle in the app's database under `key`. Nothing is read until `restore()`,
 * which an app calls at start-up, and nothing is asked of the person until `link()` or `resume()`,
 * which need a click.
 */
export function linkFolder({ id, load, save, key = "folderHandle" }) {
  let handle = null;

  const permission = async (ask = false) => {
    if (!handle) return "none";
    const options = { mode: "readwrite" };
    let outcome = await handle.queryPermission(options);
    if (outcome === "prompt" && ask) outcome = await handle.requestPermission(options);
    return outcome;
  };

  return {
    get handle() { return handle; },
    get name() { return handle ? handle.name : null; },
    available,
    permission,

    /** The handle as the database has it; "granted", "prompt" or "none" as the browser has it. */
    async restore() {
      handle = (await load(key)) || null;
      return permission();
    },

    /** «Scegli la cartella…»: the picker. Needs a user gesture. `false` when the person closed it. */
    async link() {
      if (!available()) return false;
      let chosen = null;
      try {
        chosen = await window.showDirectoryPicker({ mode: "readwrite", id });
      } catch (ignored) {
        return false;
      }
      handle = chosen;
      await save(key, chosen);
      return true;
    },

    /** «Riprendi la cartella»: ask the permission again, from a click. */
    async resume() {
      return (await permission(true)) === "granted";
    },

    /** «Scollega la cartella»: forget the handle; the files on disk stay where they are. */
    async unlink() {
      handle = null;
      await save(key, null);
    },
  };
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** The names a dated copy can have, for a prefix: `<prefix>-2026-09-10.json` and nothing else. */
function _datedNames(prefix) {
  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d{4}-\\d{2}-\\d{2})\\.json$`);
}

/**
 * One file beside the text, in `dir` or one folder down — the shape `vault.js` lays a project out
 * in. `false` when the same file is already there: a name that carries its content is a name that
 * never needs rewriting, and a rewrite is a change a sync client would have to carry.
 */
async function _putBeside(dir, { path, bytes }) {
  const [head, ...rest] = String(path).split("/");
  const folder = rest.length ? await dir.getDirectoryHandle(head, { create: true }) : dir;
  const name = rest.length ? rest.join("/") : head;
  const handle = await folder.getFileHandle(name, { create: true });
  if ((await handle.getFile()).size === bytes.length) return false;
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
  return true;
}

/**
 * The files that no copy of the archive names any more, gone.
 *
 * Every copy in the folder is asked, the dated ones included — a picture taken out of a project
 * today is exactly what the copy of yesterday is there to give back, and sweeping by «the latest
 * archive does not name it» would delete it the same afternoon.
 *
 * Which folders are ours is **declared, never guessed**: the last picture taken out of an app
 * leaves nothing to infer a name from, and a sweep that inferred it from what is on disk would
 * be an app tidying folders that belong to somebody else.
 */
async function _sweep(dir, { prefix, dated, referenced, files, folders }) {
  const wanted = new Set();
  for (const file of files) wanted.add(String(file.path));
  for await (const name of dir.keys()) {
    if (name !== `${prefix}.json` && !dated.test(name)) continue;
    const handle = await dir.getFileHandle(name);
    for (const path of referenced(await (await handle.getFile()).text())) wanted.add(String(path));
  }

  const swept = [];
  for (const folder of folders) {
    let handle = null;
    try {
      handle = await dir.getDirectoryHandle(folder);
    } catch (ignored) {
      continue;                         // an archive named it, nobody ever wrote it
    }
    // Collected first, removed after: a folder being read is not a folder to delete from.
    const gone = [];
    for await (const name of handle.keys()) if (!wanted.has(`${folder}/${name}`)) gone.push(name);
    for (const name of gone) {
      await handle.removeEntry(name);
      swept.push(`${folder}/${name}`);
    }
  }
  return swept;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   t h e   a r c h i v e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Write `text` into `dir` as `<prefix>.json`, plus today's dated copy if it is not there yet, and
 * prune dated copies beyond `keep` — never below one, because below that the copy just written
 * would go with them. Returns what it did, for the tests.
 *
 * `files` are what does not fit in the text — an app's images — as `{ path, bytes }`, with at most
 * one folder in the path. They are written **before** the text that names them: a picture without
 * its archive is something to tidy up, an archive without its picture is a hole in what somebody
 * gets back.
 *
 * `referenced(text)` says which of those paths a copy of the archive names, and is what makes the
 * sweeping possible without this file knowing anything about an app's records. `folders` names the
 * folders the app writes into — `["assets"]` for Plan Scope — and the sweep touches those only.
 * Without both, nothing is ever swept, which is Invoice Scope's case.
 *
 * `dir` needs `getFileHandle(name, {create})`, `removeEntry(name)` and `keys()` — the shape of a
 * `FileSystemDirectoryHandle`, and of the fake in the tests — plus `getDirectoryHandle(name,
 * {create})` when a snapshot carries files.
 */
export async function writeSnapshot(dir, text, { prefix, today, keep = KEEP_DAYS,
                                                 files = [], folders = [], referenced = null }) {
  const latest = `${prefix}.json`;
  const dated = _datedNames(prefix);
  const done = { latest, dated: null, pruned: [], wrote: [], swept: [] };

  const put = async (name, body) => {
    const file = await dir.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(body);
    await writable.close();
  };

  for (const file of files) if (await _putBeside(dir, file)) done.wrote.push(file.path);
  await put(latest, text);

  const days = [];
  for await (const name of dir.keys()) {
    const match = dated.exec(name);
    if (match) days.push(match[1]);
  }
  if (!days.includes(today)) {
    done.dated = `${prefix}-${today}.json`;
    await put(done.dated, text);
    days.push(today);
  }

  // ISO dates sort as text. Everything past the newest `keep` goes.
  days.sort();
  for (const day of days.slice(0, Math.max(0, days.length - Math.max(1, keep)))) {
    const name = `${prefix}-${day}.json`;
    await dir.removeEntry(name);
    done.pruned.push(name);
  }

  // Once a day, when the copy of the day is made: the files no copy names any more.
  if (done.dated && referenced && folders.length) {
    done.swept = await _sweep(dir, { prefix, dated, referenced, files, folders });
  }
  return done;
}

/**
 * The copies a folder holds, newest first: the current one, then one per day.
 *
 * **Thirty dated copies that nobody can open are thirty copies kept for nobody.** They exist for
 * the day somebody needs the version from before the mistake, and on that day the app has to have
 * something to say about them — which means listing them, with the day and the size, so that a
 * person can tell one from another before choosing. What a copy is put back *into* is the app's
 * business and differs between the two; finding them is the same everywhere, so it is here.
 *
 * `dir` needs `entries()`, and each entry its `kind` and `getFile()`.
 */
export async function copies(dir, { prefix }) {
  const latest = `${prefix}.json`;
  const dated = _datedNames(prefix);
  const out = [];
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind !== "file") continue;
    const day = dated.exec(name);
    if (name !== latest && !day) continue;
    const file = await entry.getFile();
    out.push({
      name,
      day: day ? day[1] : null,
      size: file.size,
      when: new Date(file.lastModified).toISOString(),
    });
  }
  // The current one opens the list, then the days newest first: the order somebody looks in.
  out.sort((one, other) => (one.day === null ? -1 : other.day === null ? 1 : other.day.localeCompare(one.day)));
  return out;
}

/**
 * The archive that writes itself into a linked folder.
 *
 * `folder` is a `linkFolder`; `snapshot()` gives `{ text, fingerprint }` — the fingerprint of the
 * records alone, with any timestamp the text carries left out — and, for an app whose records do
 * not all fit in JSON, `files`; `prefix` names the files; `referenced(text)` is what lets those
 * files be swept over the `folders` the app declares as its own; `load` and `save` keep
 * `{ fingerprint, lastWrite }` under `stateKey`; `onStatus()` is called when a write lands or a
 * new error appears — and not on «nothing changed», which is the usual case and would otherwise
 * turn a redraw that calls `touch()` into a loop.
 *
 * An app carrying files gives their names to the fingerprint too: a picture pasted into a page
 * moves no text, and an impression taken on the text alone would let it go unwritten.
 */
export function backupWriter({ folder, snapshot, prefix, load, save, onStatus = () => {},
                               referenced = null, folders = [], stateKey = "backupState",
                               lockName = `${prefix}-backup` }) {
  let fingerprint = null;
  let lastWrite = null;
  let lastError = null;
  let writeTimer = null;
  let tickTimer = null;
  let watching = false;

  const saveState = () => save(stateKey, { fingerprint, lastWrite });
  const loadState = async () => {
    const state = (await load(stateKey)) || {};
    fingerprint = state.fingerprint || null;
    lastWrite = state.lastWrite || null;
  };

  const write = async () => {
    clearTimeout(writeTimer);
    writeTimer = null;
    if (!folder.handle) return;
    let happened = false;
    try {
      if ((await folder.permission()) !== "granted") return;
      await withLock(lockName, async () => {
        const fresh = await snapshot();
        if (fresh.fingerprint === fingerprint) return;
        await writeSnapshot(folder.handle, fresh.text, { prefix, referenced, folders,
          files: fresh.files || [], today: new Date().toISOString().slice(0, 10) });
        fingerprint = fresh.fingerprint;
        lastWrite = new Date().toISOString();
        lastError = null;
        happened = true;
        await saveState();
      });
    } catch (error) {
      happened = !lastError || lastError.name !== error.name;
      lastError = error;
    }
    if (happened) onStatus();
  };

  /** A timer that does not keep a process alive: Node has `unref`, the browser does not need it. */
  const loose = (timer) => {
    if (timer && typeof timer.unref === "function") timer.unref();
    return timer;
  };

  const schedule = (delay = WRITE_DELAY_MS) => {
    if (!folder.handle) return;
    clearTimeout(writeTimer);
    writeTimer = loose(setTimeout(write, delay));
  };

  /** Catch up once a minute while the app is in front, and the moment it goes to the background. */
  const watch = () => {
    clearInterval(tickTimer);
    tickTimer = loose(setInterval(() => { if (document.visibilityState === "visible") write(); }, WRITE_EVERY_MS));
    if (watching) return;
    watching = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") write();
    });
  };

  const forget = () => {
    fingerprint = null;
    lastWrite = null;
    lastError = null;
  };

  return {
    /** Wake up: handle and state back from the database; a first write when the records moved. */
    async setup() {
      if (!available()) return;
      try {
        const permission = await folder.restore();
        await loadState();
        if (permission === "granted") {
          schedule(0);
          watch();
        }
      } catch (error) {
        lastError = error;
      }
      onStatus();
    },

    /** «Scegli la cartella…»: a new folder knows nothing, so it is written whatever the state. */
    async link() {
      if (!(await folder.link())) return false;
      forget();
      await saveState();
      await write();
      watch();
      return true;
    },

    async resume() {
      if (!(await folder.resume())) return false;
      fingerprint = null;
      await write();
      watch();
      return true;
    },

    async unlink() {
      clearInterval(tickTimer);
      clearTimeout(writeTimer);
      await folder.unlink();
      forget();
      await saveState();
      onStatus();
    },

    /** Something may have changed: write soon, once it has settled. Free to call often. */
    touch() {
      schedule();
    },

    /**
     * What a settings screen shows: `unavailable` (no picker in this browser), `none` (no folder),
     * `prompt` (a folder waiting for its permission), `linked` — with `folder`, `lastWrite` and
     * the name of the last `error`, if one stopped the last write.
     */
    async status() {
      if (!available()) return { kind: "unavailable" };
      if (!folder.handle) return { kind: "none" };
      const permission = await folder.permission();
      return {
        kind: permission === "granted" ? "linked" : "prompt",
        folder: folder.name,
        lastWrite,
        error: lastError ? (lastError.name || String(lastError)) : null,
      };
    },
  };
}
