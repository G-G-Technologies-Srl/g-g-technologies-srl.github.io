// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The backup folder: the whole archive written, on its own, into a folder the person chose.
//
// **Without a server there is one copy, and it lives in a browser.** «Esporta tutto» has always
// been the answer, and it is an answer that depends on somebody remembering — which is why the
// home screen nags from the third document on. This is the same export, written by the app
// instead, into a folder of the operating system's — very often a Dropbox or iCloud folder, and
// then it travels by itself. The mechanics are `biz/folder.js`, shared with the other apps; what
// is here is what only this app knows: which records, under which name, in which store.
//
// **One machine writes, the others read.** This is a backup and not Plan Scope's shared folder,
// and the difference is deliberate: two copies of a project can be merged — the newer task wins,
// a page edited on both sides is kept twice — and two copies of an invoice register cannot. If two
// browsers both issued invoice 12 in the same afternoon, no merge rule makes them one, and one of
// the two has already been transmitted. So the folder holds what *this* browser knows, and a
// second computer gets it back through «Importa un archivio», which replaces and does not merge.
// The day two people issue, the answer is a series each, and that is a different feature.
//
// The handle and the writer's state live in the `meta` store, which is the one store the export
// leaves out: a handle serialised to JSON is `{}`, and restoring `{}` into another machine's
// `meta` would leave it holding a folder that does not exist.

import { get, put, list, count as countIn } from "gg/store.js";
import { collect, restore as putBack } from "gg/io.js";
import { hash, linkFolder, backupWriter, copies as listCopies } from "biz/folder.js";
import { reference } from "biz/plan-pack.js";
import { NAME, VERSION, EXPORTED } from "./db.js";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

const ASSETS_DIR = "assets";

let db = null;
let writer = null;
let folder = null;

const load = async (key) => {
  const record = await get(db, "meta", key);
  return record ? record.value : null;
};
const save = (key, value) => put(db, "meta", { key, value });

/** Come si chiama nella cartella ogni immagine, e quel che serve per rimetterla dov'era. */
function _manifest(assets) {
  return assets.map((asset) => ({
    id: asset.id,
    projectId: asset.projectId || null,
    name: asset.name,
    type: asset.type,
    size: asset.size,
    path: reference(asset),
  }));
}

/** Nomi e dimensioni già in `assets/`: quello che la cartella ha, per non riscriverlo. */
async function _onDisk() {
  const sizes = new Map();
  if (!folder || !folder.handle) return sizes;
  let dir = null;
  try {
    dir = await folder.handle.getDirectoryHandle(ASSETS_DIR);
  } catch (ignored) {
    return sizes;                       // lì non è stato scritto ancora niente
  }
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind !== "file") continue;
    sizes.set(name, (await entry.getFile()).size);
  }
  return sizes;
}

/**
 * L'archivio come testo, le immagini che alla cartella mancano, e l'impronta.
 *
 * **Le figure delle pagine di un progetto stavano fuori dall'archivio**, e viaggiavano solo nel
 * pacchetto zip di quel progetto: chi si affidava alla copia automatica aveva il testo e non le
 * fotografie del cantiere. In JSON diventerebbero base64 — un archivio di qualche decina di
 * kilobyte arriverebbe a megabyte, e trenta copie datate a un gigabyte — quindi il testo va in
 * `invoice-scope.json` e le immagini accanto, in `assets/`, una volta ciascuna: le trenta copie ne
 * condividono un insieme solo. È la soluzione che Plan Scope ha già, e la libreria la sa fare.
 *
 * L'impronta copre i record **e** l'elenco delle immagini: una foto incollata in una pagina non
 * muove una parola, e con l'impronta sul solo testo non verrebbe scritta — la perdita silenziosa,
 * quella di cui ci si accorge il giorno del bisogno.
 *
 * Un'immagine già nella cartella, della dimensione giusta, non si rilegge nemmeno: il nome porta il
 * contenuto, quindi riscriverla sarebbe lavoro per produrre un file identico a quello che c'è.
 */
async function _snapshot() {
  const payload = await collect(db, { app: NAME, schema: VERSION, stores: EXPORTED });
  const assets = await list(db, "assets");
  const manifest = _manifest(assets);
  payload.assets = manifest;

  const sizes = await _onDisk();
  const files = [];
  for (const asset of assets) {
    if (!asset.blob) continue;
    const path = reference(asset);
    if (sizes.get(path.slice(`${ASSETS_DIR}/`.length)) === asset.size) continue;
    files.push({ path, bytes: new Uint8Array(await asset.blob.arrayBuffer()) });
  }
  return {
    text: JSON.stringify(payload, null, 2),
    fingerprint: hash(`${JSON.stringify(payload.data)}|${JSON.stringify(manifest)}`),
    files,
  };
}

/** Quali immagini nomina una copia dell'archivio. Quello che non si legge non ne nomina nessuna. */
function _referenced(text) {
  try {
    return (JSON.parse(text).assets || []).map((asset) => asset.path).filter(Boolean);
  } catch (ignored) {
    return [];
  }
}

/**
 * Le immagini che un archivio ripristinato nomina, di nuovo nel deposito.
 *
 * Solo quelle che il deposito non ha già: un'immagine il cui id è qui è la stessa immagine, perché
 * l'id è il contenuto. Quelle che la cartella non ha più — spazzate, o mai arrivate — si saltano:
 * le pagine tornano senza, che è meglio di un ripristino che si ferma a metà.
 */
async function _restoreAssets(manifest) {
  if (!folder || !folder.handle) return 0;
  let dir = null;
  try {
    dir = await folder.handle.getDirectoryHandle(ASSETS_DIR);
  } catch (ignored) {
    return 0;                           // un archivio scritto quando non ce n'erano
  }
  let back = 0;
  for (const asset of manifest) {
    if (await get(db, "assets", asset.id)) continue;
    let file = null;
    try {
      file = await (await dir.getFileHandle(asset.path.slice(`${ASSETS_DIR}/`.length))).getFile();
    } catch (ignored) {
      continue;
    }
    await put(db, "assets", {
      id: asset.id,
      projectId: asset.projectId || null,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      blob: new Blob([await file.arrayBuffer()], { type: asset.type }),
    });
    back += 1;
  }
  return back;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Wake up. `status()` is called whenever a write lands or fails; nothing here stops the app. */
export async function setup(database, { status = () => {} } = {}) {
  db = database;
  if (!db) return;
  folder = linkFolder({ id: "invoice-scope-backup", load, save, key: "backupFolder" });
  writer = backupWriter({
    folder,
    snapshot: _snapshot,
    prefix: NAME,
    referenced: _referenced,
    folders: [ASSETS_DIR],
    load,
    save,
    onStatus: status,
  });
  await writer.setup();
}

export function link() { return writer ? writer.link() : false; }
export function resume() { return writer ? writer.resume() : false; }
/** La scelta, dopo un collegamento che si è fermato davanti a una cartella già piena. */
export function release() { return writer ? writer.release() : false; }
export function unlink() { return writer ? writer.unlink() : undefined; }
export function touch() { if (writer) writer.touch(); }
export function status() { return writer ? writer.status() : Promise.resolve({ kind: "none" }); }

/**
 * The copies in the folder, newest first: the current one, then one per day for thirty days.
 *
 * The dated copies have been written since the folder existed, and until now nothing could open
 * one: they were kept for the day somebody needed the version from before the mistake, and on that
 * day the app had nothing to say about them. Listing them is what makes them worth writing.
 */
export async function copies() {
  if (!folder || !folder.handle || (await folder.permission()) !== "granted") return [];
  return listCopies(folder.handle, { prefix: NAME });
}

/**
 * Il testo di una copia, senza scrivere niente.
 *
 * `restore()` legge e scrive in un gesto solo, ed è giusto per quello che fa: ma guardare cosa
 * contiene una copia non deve passare dalla porta che sostituisce l'archivio. Le due strade
 * condividono la lettura e niente altro.
 */
export async function read(name = `${NAME}.json`) {
  if (!folder || !folder.handle) return { ok: false, reason: "backupNoFolder" };
  if ((await folder.permission()) !== "granted") return { ok: false, reason: "backupNoPermission" };
  try {
    const text = await (await (await folder.handle.getFileHandle(name)).getFile()).text();
    return { ok: true, text };
  } catch (ignored) {
    return { ok: false, reason: "backupCopyGone" };
  }
}

/**
 * Quanti record tiene adesso il deposito, deposito per deposito.
 *
 * Contati, non letti: serve il numero per il confronto con una copia, e i record non escono da qui.
 */
export async function counts() {
  if (!db) return {};
  const out = {};
  for (const store of EXPORTED) out[store] = await countIn(db, store);
  return out;
}

/**
 * One copy back into the archive: the records replace what is here.
 *
 * The same door as «Importa un archivio», and the same refusal: `gg/io.js` validates the whole file
 * before writing a single record, because half a restore is the one outcome with no way back. The
 * `meta` store is not touched — the folder stays linked, and the copy that is being put back does
 * not carry a handle anyway.
 */
export async function restore(name = `${NAME}.json`) {
  if (!folder || !folder.handle) return { ok: false, reason: "backupNoFolder" };
  if ((await folder.permission()) !== "granted") return { ok: false, reason: "backupNoPermission" };
  let text = null;
  try {
    text = await (await (await folder.handle.getFileHandle(name)).getFile()).text();
  } catch (ignored) {
    return { ok: false, reason: "backupCopyGone" };
  }
  const esito = await putBack(db, text, { app: NAME, stores: EXPORTED });
  if (!esito.ok) return esito;
  // Le immagini dopo i record, e solo quelle che mancano. Se qui va storto qualcosa i record sono
  // tornati comunque, che è la parte che conta.
  let immagini = 0;
  try {
    immagini = await _restoreAssets(JSON.parse(text).assets || []);
  } catch (ignored) { /* i record sono a posto */ }
  return { ...esito, immagini };
}
