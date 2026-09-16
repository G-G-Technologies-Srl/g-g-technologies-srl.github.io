// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Che cosa c'è dentro una copia, e in che cosa differisce da quello che c'è adesso.
//
// **Una cartella di backup che non si può guardare dentro è un atto di fede.** Le copie erano un
// nome e dei kilobyte: due file da 84 kB sono indistinguibili, e la domanda che una persona fa
// davvero — «quello che sta lì è quello che ho adesso?» — non aveva nessuna risposta nell'app. I
// kilobyte per giunta la risposta non la danno nemmeno per caso: un documento cancellato e uno
// aggiunto lasciano lo stesso peso.
//
// La risposta sta dentro il file, perché il file è JSON leggibile per scelta: si contano i record
// per deposito e si confrontano con quelli di adesso. Nessuna euristica, nessuna impronta da
// interpretare — l'impronta dice «l'ultima scrittura è andata», non «il file su disco è ancora
// quello», e fra le due cose ci stanno un client di sincronizzazione e una cartella spostata.
//
// **Contare non è leggere.** Qui si contano i record, non si guarda cosa dicono: un archivio è di
// chi lo apre, e a questo modulo serve sapere quanti, non chi.
//
// Nessun DOM e nessun deposito: testo dentro, numeri fuori. Le parole stanno in `i18n.js`.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/archive.mjs

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * I depositi nell'ordine in cui si leggono, con la chiave della loro etichetta.
 *
 * L'ordine è quello in cui una persona pensa al proprio archivio — i documenti per primi, le
 * briciole in fondo — e non quello dello schema. `assets` e `meta` non ci sono perché non entrano
 * nell'archivio: `db.js` li tiene fuori, e un elenco che li nominasse con uno zero accanto
 * racconterebbe una mancanza che non c'è.
 */
export const GRUPPI = [
  ["docs", "archiveDocs"],
  ["parties", "archiveParties"],
  ["payments", "archivePayments"],
  ["costs", "archiveCosts"],
  ["outlays", "archiveOutlays"],
  ["items", "archiveItems"],
  ["projects", "archiveProjects"],
  ["pages", "archivePages"],
  ["tasks", "archiveTasks"],
  ["activities", "archiveActivities"],
  ["recurring", "archiveRecurring"],
  ["company", "archiveCompany"],
  ["counters", "archiveCounters"],
  // Accanto al testo, non dentro: l'archivio le nomina e la cartella le tiene.
  ["assets", "archiveAssets"],
];

/** Quelli che si mostrano sempre, se dentro o adesso c'è qualcosa: il resto parla solo se differisce. */
const PRINCIPALI = new Set(["docs", "parties", "payments", "costs"]);

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Quanti record tiene una copia, per deposito.
 *
 * Torna `{ ok: false, reason }` invece di sollevare, come fa `gg/io.js` con lo stesso file: una
 * copia scritta a metà o di un'altra app è un evento ordinario, non un'eccezione, e la schermata
 * deve poterlo dire in una riga invece di sparire.
 */
export function inventory(text, { app = "invoice-scope" } = {}) {
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch (ignored) {
    return { ok: false, reason: "importNotJson" };
  }
  if (!payload || typeof payload !== "object" || !payload.data || typeof payload.data !== "object") {
    return { ok: false, reason: "importNotExport" };
  }
  if (payload.app !== app) return { ok: false, reason: "importOtherApp" };

  const counts = {};
  let total = 0;
  for (const [store, records] of Object.entries(payload.data)) {
    if (!Array.isArray(records)) continue;
    counts[store] = records.length;
    total += records.length;
  }
  // Le immagini delle pagine non sono un deposito dell'archivio: stanno accanto al testo, in
  // `assets/`, e l'archivio ne porta l'elenco. Contarle qui è la sola risposta alla domanda «nella
  // cartella ci sono anche le fotografie?», che è esattamente quello che si viene a chiedere.
  if (Array.isArray(payload.assets)) {
    counts.assets = payload.assets.length;
    total += payload.assets.length;
  }
  return { ok: true, exported: payload.exported || null, schema: payload.schema || null, counts, total };
}

/**
 * La copia contro quello che c'è adesso, riga per riga.
 *
 * `same` è la risposta alla domanda vera, e guarda **ogni** deposito, non solo quelli mostrati: una
 * differenza in uno dei minori — una ricorrenza, il contatore — è comunque una differenza, e dirla
 * «allineata» sarebbe la bugia peggiore che questa schermata possa dire.
 *
 * Un deposito che la copia non nomina affatto vale zero: gli archivi vecchi avevano meno depositi,
 * e sono esattamente quelli che si guardano quando si cerca la versione di prima.
 */
export function compare(counts = {}, adesso = {}) {
  const righe = [];
  let same = true;
  for (const [store, label] of GRUPPI) {
    const dentro = Number(counts[store] || 0);
    const ora = Number(adesso[store] || 0);
    const diverso = dentro !== ora;
    if (diverso) same = false;
    if (diverso || (PRINCIPALI.has(store) && (dentro > 0 || ora > 0))) {
      righe.push({ store, label, dentro, adesso: ora, diverso });
    }
  }
  return { same, righe };
}
