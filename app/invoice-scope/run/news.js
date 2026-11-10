// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// What changed, said once after an update (10 November 2026).
//
// **Why.** An update arrives quietly — the light on the version, a click, a reload — and then the
// app looks the same as before. A new screen under Scadenzario, a file that can now be dropped on
// Acquisti: nobody finds them unless somebody says they are there. So the first start of a new
// version shows a short list of what is new, once, and never again.
//
// **Not on the first start of all.** Somebody who has just installed the app has nothing to compare
// with: «what is new» would be a list of features in the wrong order. The caller says whether this
// browser already holds data; with none, the version is only written down.
//
// **The version is not written here.** It lives in `sw.js` alone (`check_apps.py` holds the rule);
// the running one arrives from the worker, through `gg/update.js`. This file holds only the notes,
// keyed by the version that brought them, and a version without notes shows nothing.
//
// The rules — when to speak, which notes — are shared, in `gg/news.js`; this file holds the notes.
//
// No DOM: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/news.mjs`.

import { compareVersions, whatsNew as libWhatsNew, MAX_LINES } from "gg/news.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** Where this browser keeps the last version it announced. A convenience: lost, it only says nothing. */
export const SEEN_KEY = "gg.invoice-scope.seen-version";

/** At most this many lines in one announcement: a long list is not read. */
export { MAX_LINES };

/** The notes, newest first. Two to four lines per version, in the words of the screens. */
export const NEWS = [
  {
    version: "0.80.0",
    it: [
      "Scadenzario › Adempimenti: IVA, imposta di bollo sulle fatture elettroniche, ritenute d'acconto e "
        + "integrazioni in un elenco solo, con la scadenza, l'importo e il codice tributo.",
      "L'acconto IVA di dicembre con il metodo storico, quando l'app contiene tutto l'anno precedente.",
      "Gli adempimenti entrano nel calendario .ics, nei promemoria e nel pacchetto per il commercialista.",
      "Le date tengono conto di fine settimana, festivi nazionali e proroga di agosto.",
    ],
    en: [
      "Payments › Tax deadlines: VAT, stamp duty on e-invoices, withholding tax and integrations in one "
        + "list, with the deadline, the amount and the tax code.",
      "The December VAT advance with the historical method, when the app holds the whole previous year.",
      "Tax deadlines go into the .ics calendar, the reminders and the accountant's package.",
      "Dates account for weekends, national holidays and the August extension.",
    ],
  },
  {
    version: "0.79.0",
    it: [
      "Le fatture ricevute si trascinano sugli Acquisti; l'XML si apre impaginato come una fattura.",
      "L'XML che arriva dopo completa l'acquisto inserito a mano, e il PDF che contiene diventa la sua copia.",
      "Il pacchetto per il commercialista: documenti, ricevute e pagamenti di un periodo in uno zip, dalle Impostazioni.",
    ],
    en: [
      "Received invoices can be dropped on Purchases; the XML opens laid out like an invoice.",
      "An XML that arrives later completes the purchase entered by hand, and the PDF inside becomes its copy.",
      "The accountant's package: documents, receipts and payments of a period in one zip, from Settings.",
    ],
  },
  {
    version: "0.78.0",
    it: [
      "La fattura del fornitore si allega a ogni acquisto: PDF, foto o XML.",
      "Da Scadenzario › Pagamenti si paga un acquisto aperto o se ne registra uno nuovo.",
    ],
    en: [
      "The supplier's invoice can be attached to every purchase: PDF, photo or XML.",
      "From Payments › Paid, an open purchase can be paid or a new one recorded.",
    ],
  },
];

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export { compareVersions };

/** What to say on this start, with Invoice Scope's notes: see `whatsNew` in `gg/news.js`. */
export function whatsNew(options = {}) {
  return libWhatsNew({ ...options, notes: NEWS, max: MAX_LINES });
}
