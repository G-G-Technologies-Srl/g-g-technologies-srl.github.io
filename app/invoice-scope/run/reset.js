// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La zona di cancellazione: svuotare un pezzo dell'archivio, o tutto, per ricominciare.
//
// **Serve a chi importa una seconda volta.** Chi porta dentro l'archivio di Fatture in Cloud, si
// accorge di aver scelto il file sbagliato e vuole rifare da capo, prima non aveva una strada:
// cancellare i documenti uno a uno, o svuotare il deposito del browser dagli strumenti per
// sviluppatori — che è un gesto da tecnico, e porta via anche la cartella di backup collegata.
//
// **I gruppi sono quelli che una persona vede, non gli store.** «Documenti e incassi» porta con
// sé i contatori della numerazione: un archivio svuotato dei documenti che continuasse a contare
// da 0043 sarebbe un archivio con un buco di quarantadue numeri, e il Sistema di Interscambio non
// accetta buchi. «Clienti e listino» porta con sé il diario, che senza il cliente non significa
// niente. «Progetti» porta pagine, fasi e allegati. «Tutto» è l'app come appena installata, tranne
// `meta`: lì sta il collegamento alla cartella di backup, e toglierlo sarebbe un danno in più che
// nessuno ha chiesto.
//
// Il conteggio e la cancellazione stanno qui, separati dalla domanda: si provano in Node.

import { count, clear } from "gg/store.js";

/** I gruppi, con gli store che ognuno svuota. L'ordine è quello della schermata. */
export const GROUPS = {
  docs: ["docs", "payments", "counters"],
  costs: ["costs", "outlays", "recurring"],
  parties: ["parties", "items", "activities"],
  projects: ["projects", "pages", "tasks", "assets"],
  all: ["docs", "payments", "counters", "costs", "outlays", "recurring", "parties", "items", "activities",
    "projects", "pages", "tasks", "assets", "company"],
};

/** Gli store che finiscono nel riepilogo della domanda: gli altri sono di corredo. */
export const COUNTED = ["docs", "payments", "costs", "outlays", "parties", "items", "projects"];

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Quanti record cancellerebbe un gruppo, store per store, e in tutto. */
export async function counts(db, group) {
  const stores = GROUPS[group] || [];
  const out = { total: 0 };
  for (const store of stores) {
    const n = await count(db, store);
    out[store] = n;
    out.total += n;
  }
  return out;
}

/** Svuota gli store di un gruppo. Niente domande qui: le fa chi chiama. */
export async function wipe(db, group) {
  const stores = GROUPS[group];
  if (!stores) throw new Error(`gruppo sconosciuto: ${group}`);
  for (const store of stores) await clear(db, store);
}
