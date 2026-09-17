// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The store, and the one place that knows the shape of it.
//
// Every version declares the *whole* schema it wants, never the difference from the last one. The
// rule is in app/CLAUDE.md and it matters here more than usual: `onupgradeneeded` fires from
// whatever version the visitor happens to have, and on a program somebody opens once a quarter to
// issue an invoice that is not the previous one.
//
// **Why the unique index is here and not in `model.js`.** Two documents with the same number are
// the one defect this app cannot recover from — you cannot un-issue an invoice — so the guard is
// structural and sits under the code that would have to remember. `gg/store.js` creates
// non-unique indexes by design, which is right for a shared library and not enough for this one
// index, so it is created here on the raw upgrade transaction.
//
// No DOM in here: `node app/invoice-scope/test/model.mjs` runs against a fake store.

import { open } from "gg/store.js";

import { openMemory } from "./memory.js";
import { KINDS } from "./kinds.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

export const NAME = "invoice-scope";

/**
 * The schema's version, and the one number that must move when a store is added.
 *
 * 5 → 6: `recurring`, i costi ricorrenti da cui nascono gli acquisti attesi.
 *
 * 4 → 5: `costs` e `outlays`, gli acquisti e i pagamenti in uscita. I clienti prendono `ruolo`
 * — cliente, fornitore, entrambi — e chi non ce l'ha è un cliente, come è sempre stato.
 *
 * 3 → 4: `assets`, le immagini e i file dentro le pagine.
 *
 * 2 → 3: `projects`, `pages` e `tasks`, cioè i progetti con dentro il loro piano.
 *
 * 1 → 2: `activities`, the diary on a customer. The whole shape is declared below, as the rule
 * demands — `onupgradeneeded` fires from whatever version the visitor has, and on a program somebody
 * opens once a quarter that is not the previous one. Nothing is migrated: a customer without a diary
 * simply has none, which is the state every existing one starts from.
 */
export const VERSION = 6;

/**
 * The stores, as `gg/store.js` describes them.
 *
 * `docs` is one table for quotes, delivery notes, invoices and credit notes: a quote that becomes
 * an invoice is the same object gaining constraints, and splitting them would mean copying the
 * lines three times and keeping them in step by hand.
 */
export const STORES = {
  company: { keyPath: "id" },
  parties: { keyPath: "id", indexes: { name: "name", updated: "updated" } },
  items: { keyPath: "id", indexes: { name: "name" } },
  docs: { keyPath: "id", indexes: { party: "partyId", date: "data", state: "stato" } },
  payments: { keyPath: "id", indexes: { doc: "docId", due: "scadenza" } },
  // Il diario di un cliente: una riga per telefonata, email, incontro o nota. Uno store e non un
  // campo dentro il cliente, al contrario dei contatti, perché le voci crescono senza limite e si
  // leggono per data — un cliente seguito per tre anni porterebbe in memoria tutta la sua storia
  // ogni volta che compare in un menù. Le persone di riferimento invece stanno nel record del
  // cliente, in `contatti`: sono cinque, e senza la loro azienda non significano niente.
  activities: { keyPath: "id", indexes: { party: "partyId", date: "data" } },
  // I progetti, e il piano che ci sta dentro. Le tre forme sono quelle di `gg/plan-model.js`, che è
  // lo stesso modello di Plan Scope: un progetto esportato da qui si apre lì, e viceversa. Gli
  // indici sono quelli che servono a leggere per progetto, come nell'altra app.
  projects: { keyPath: "id", indexes: { updated: "updated" } },
  pages: { keyPath: "id", indexes: { project: "projectId" } },
  tasks: { keyPath: "id", indexes: { project: "projectId" } },
  // Le immagini e i file dentro le pagine di un progetto. Uno store a parte perché sono byte: un
  // record di `pages` che se li portasse dentro renderebbe pesante ogni lettura del testo.
  assets: { keyPath: "id", indexes: { project: "projectId" } },
  // Gli acquisti: fatture ricevute e spese senza fattura, con il fornitore in `parties`. Uno store
  // a parte dai documenti, non un «verso» dentro `docs`: un documento emesso ha numerazione,
  // stati e controlli del tracciato che un costo non ha, e un solo store con due regole sarebbe
  // due store che si fingono uno.
  costs: { keyPath: "id", indexes: { party: "partyId", date: "data", due: "scadenza" } },
  // I pagamenti in uscita, a parte dagli incassi per la stessa ragione — e perché la zona di
  // cancellazione svuota «documenti e incassi» senza toccare gli acquisti, e viceversa.
  outlays: { keyPath: "id", indexes: { cost: "costId", date: "data" } },
  // I costi ricorrenti: il canone, l'affitto, l'assicurazione — quello che arriva ogni mese o
  // ogni anno e si sa già. Da qui l'app genera gli acquisti *attesi* fino a fine anno, che sono
  // il previsionale: righe calcolate, non scritte, finché una fattura vera non le conferma.
  // Schema 5 → 6: solo questo store.
  recurring: { keyPath: "id", indexes: { party: "partyId" } },
  counters: { keyPath: "key" },
  meta: { keyPath: "key" },
};

/**
 * The stores an export carries: every one but `meta` and `assets`.
 *
 * `meta` is this browser's own state — today the handle of the backup folder — and it is not
 * data: a directory handle serialised to JSON is `{}`, and restoring `{}` into another machine's
 * `meta` would leave it holding a folder that does not exist. Used by «Esporta tutto», by the
 * backup folder and by «Importa un archivio», so that the three agree on what an archive is.
 *
 * **`assets` sta fuori perché sono byte, e l'archivio è JSON.** Un'immagine dentro un file di testo
 * diventa base64: un archivio di pochi kilobyte si gonfierebbe di megabyte, e la cartella di backup
 * lo riscriverebbe intero a ogni modifica. Le immagini viaggiano nel pacchetto del progetto, che è
 * uno zip ed è fatto per portarle — la stessa divisione che fa Plan Scope. Va detto dove conta:
 * l'archivio salva il testo, il pacchetto salva anche le figure.
 */
export const EXPORTED = Object.keys(STORES)
  .filter((store) => store !== "meta" && store !== "assets");

/**
 * The one index that has to refuse duplicates, and the fields it is built from.
 *
 * Exported because the tests build their fake store from it rather than describing the schema a
 * second time: two descriptions of one shape drift apart the day a store is added, and the drift
 * shows up as tests that pass on something the app does not do.
 */
export const UNIQUE_INDEX = { store: "docs", name: "numero_unico", keyPath: "chiave" };

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Open the database, unique index included.
 *
 * The library opens it and builds what it knows how to build; the unique index is added on the
 * same upgrade transaction, through the request the library hands back. Nothing else in the app
 * opens a connection.
 */
/**
 * Se l'app è aperta come dimostrativo.
 *
 * Letto qui invece che passato in giro: chi apre il deposito è l'unico che deve sapere dove
 * finiscono i dati, e il resto dell'app non cambia una riga fra i due casi.
 *
 * Il `try` non è cerimonia: sotto Node `location` non esiste, e i test aprono questo stesso file.
 */
export function isDemo() {
  try {
    return new URLSearchParams(location.search).get("demo") === "1";
  } catch (ignored) {
    return false;
  }
}

export async function openDatabase() {
  // Il dimostrativo vive in memoria e sparisce chiudendo la scheda: quello che un visitatore apre
  // per curiosità non deve finire insieme alle sue fatture. Il perché sta in `memory.js`.
  if (isDemo()) return openMemory(STORES);

  return open(NAME, VERSION, STORES, {
    upgrade(db, transaction) {
      const store = transaction.objectStore(UNIQUE_INDEX.store);
      if (!store.indexNames.contains(UNIQUE_INDEX.name)) {
        store.createIndex(UNIQUE_INDEX.name, UNIQUE_INDEX.keyPath, { unique: true });
      }
    },
  });
}

/**
 * La chiave sotto cui resta scritto che un nome di file è stato usato.
 *
 * **Un nome non si riusa, mai.** Chi riceve — l'Ufficio Tributario come il Sistema di Interscambio
 * — rifiuta un file il cui nome è già arrivato, e lo rifiuta anche se il primo era stato scartato:
 * il nome è speso nel momento in cui il file parte, non nel momento in cui viene accettato. E lo
 * spazio dei nomi è **uno solo per i due canali**, perché il nome è fatto del paese, del codice di
 * chi trasmette e del progressivo — nessuno dei tre dice a quale dei due il file era diretto.
 *
 * Sta in `counters` e non in `meta` per una ragione precisa: `meta` è lo stato di questo browser e
 * non entra negli archivi. Il registro dei nomi deve viaggiare con i documenti, o cambiare
 * computer basterebbe a riusarli tutti.
 */
export function fileNameKey(name) {
  return `file|${String(name || "").toLowerCase()}`;
}

/**
 * The key that makes a document's number unique: series, type, year, number.
 *
 * A single string rather than a compound key so it can carry the "no key at all" case: a draft has
 * no number, and `undefined` keeps it out of a unique index entirely, which is exactly what a
 * draft needs. Returning `null` would put every draft under the same key and let the second one
 * fail — a bug that would look like the guard working.
 */
export function documentKey(doc) {
  if (!doc.numero || doc.stato === "bozza") return undefined;
  const anno = String(doc.data || "").slice(0, 4);
  return `${doc.serie || ""}|${doc.tipo || "TD01"}|${anno}|${doc.numero}`;
}

/**
 * The key of the counter a document's number comes out of: series, sequence, year.
 *
 * **The sequence, not the type.** With the type in here every kind got a counter of its own, so a
 * deferred invoice and an immediate one were both «2026/0001» — and a delivery note is not the
 * thing that keeps them apart, the sequence is. `kinds.js` says which sequence each kind belongs
 * to; a deferred invoice belongs to the invoices.
 *
 * Written here, next to `documentKey`, because it was written in three places — twice in
 * `model.js` and once in `importing.js` — and a counter whose name is spelled out by three files
 * is a counter that will be spelled differently by one of them.
 */
export function counterKey(doc) {
  const tipo = doc.tipo || "TD01";
  const kind = KINDS[tipo] || {};
  const anno = String(doc.data || "").slice(0, 4);
  return `doc|${doc.serie || ""}|${kind.sequenza || tipo}|${anno}`;
}

/**
 * The counters a sequence used to live under, before it was a sequence.
 *
 * A deposit written by an earlier version has one counter per kind — `doc||TD01|2026` — and the
 * new key finds nothing there. Starting from one would hand out numbers that are already on
 * documents in the customer's hands, which is the one mistake in a numbering that cannot be taken
 * back. So the sequence reads these too and keeps the highest, for ever: they cost two reads at
 * issuing time and they are the only thing standing between an upgrade and a duplicate number.
 */
export function legacyCounterKeys(doc) {
  const anno = String(doc.data || "").slice(0, 4);
  const sequenza = (KINDS[doc.tipo || "TD01"] || {}).sequenza;
  const keys = new Set();
  for (const [tipo, kind] of Object.entries(KINDS)) {
    if (kind.sequenza !== sequenza) continue;
    keys.add(`doc|${kind.serie || ""}|${tipo}|${anno}`);
    keys.add(`doc||${tipo}|${anno}`);
  }
  return [...keys];
}
