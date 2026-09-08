// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What is owed and when, and the CSV the accountant asks for.
//
// **The schedule is derived, never stored.** Due dates live inside the documents that carry them —
// they are part of what was agreed and they travel in the XML — so a second copy in a store of its
// own would be a second truth, and the two would drift the first time a document was imported.
// What *is* stored is the opposite: an `incasso`, which happens after the document was frozen and
// therefore cannot live inside it.
//
// **A document with no due date is payable on receipt**, so it appears in the schedule on its own
// date rather than not at all. Dropping it would hide precisely the invoices that are most likely
// to be forgotten.
//
// No DOM in here: `node --import ./test/loader.mjs test/schedule.mjs` runs it against a fake store.

import { list, put, remove } from "gg/store.js";

import { from, add, sub, sum, cmp, round, toString, ZERO } from "./decimal.js";
import { kind } from "./kinds.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** States whose documents owe money. A draft owes nothing, a cancelled one owes nothing either. */
const OWING = new Set(["emesso", "inviato", "accettato"]);

/**
 * Whether a document is money somebody expects.
 *
 * **Two conditions, and the second one is the whole reason `kinds.js` exists.** An accepted quote is
 * `accettato`, which is in `OWING` — so a state check on its own would put every quote somebody won
 * into the payment schedule, as an amount that will be invoiced later and is owed by nobody yet.
 * That is the credit-note defect again, in a different costume.
 */
function _conta(doc) {
  return kind(doc).deve && OWING.has(doc.stato);
}

/** The columns of the CSV, in the order an accountant reads them. */
const COLUMNS = [
  "tipo", "numero", "data", "cliente", "partitaIva",
  "imponibile", "imposta", "totale", "stato", "scadenza",
];

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * One CSV field.
 *
 * Quoted whenever it holds a separator, a quote or a newline, and the inner quotes doubled — the
 * rules of the format, applied here rather than trusted to the data. A company name with a comma
 * in it is not an edge case, it is Tuesday.
 */
function _field(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Quanto vale ogni rata, per una lista di rate e il totale del documento.
 *
 * **Una rata senza importo vale quello che resta, diviso fra quelle che non lo dicono.** La regola
 * di prima — «vale il totale» — è giusta per una rata sola, che è il caso per cui era scritta, e
 * conta due volte lo stesso documento appena le rate sono due: la maschera del documento aggiunge
 * una rata con l'importo vuoto e il segnaposto del totale, quindi due scadenze lasciate in bianco
 * facevano leggere in Situazione il doppio di quello che il cliente deve. Trovato guardando lo
 * scadenzario del dimostrativo in un browser vero: «da incassare» era più alto del fatturato, che
 * per un'azienda senza acconti è impossibile.
 *
 * L'arrotondamento va ai centesimi e il resto sulla prima, come si dividono tre rate su cento euro:
 * 33,34 · 33,33 · 33,33. Sommano al totale, che è la condizione che `validate.js` chiede quando gli
 * importi sono scritti tutti a mano.
 */
function _quote(rate, totale) {
  const scritte = rate.map((quota) => (quota.importo === undefined ? null : from(quota.importo)));
  const quante = scritte.filter((importo) => importo === null).length;
  if (!quante) return scritte;

  const resto = sub(totale, sum(scritte.filter((importo) => importo !== null)));
  const rimasto = cmp(resto, ZERO) > 0 ? resto : ZERO;
  // Ai centesimi, con la differenza sulla prima delle rate senza importo: un ottavo di euro
  // sparso su otto rate lascerebbe un totale che non torna, ed è la somma che si controlla.
  const ciascuna = round(divide(rimasto, quante), 2);
  const primo = sub(rimasto, mulInt(ciascuna, quante - 1));

  let vista = 0;
  return scritte.map((importo) => {
    if (importo !== null) return importo;
    vista += 1;
    return vista === 1 ? primo : ciascuna;
  });
}

/** Un valore scalato diviso per un intero, senza passare da un numero in virgola mobile. */
function divide(value, n) {
  return value / BigInt(n);
}

/** Un valore scalato moltiplicato per un intero. Stessa ragione. */
function mulInt(value, n) {
  return value * BigInt(n);
}

/**
 * Every amount owed, one row per instalment, oldest first.
 *
 * `today` is a parameter and not `new Date()` inside: a function that reads the clock cannot be
 * tested, and "is this overdue" is exactly the kind of thing that has to be.
 */
export async function schedule(db, { today = new Date().toISOString().slice(0, 10) } = {}) {
  // Everything issued and not cancelled: the ones that owe and the ones that credit. Which is which
  // is the profile's business, asked twice below.
  const all = (await list(db, "docs")).filter((doc) => OWING.has(doc.stato));

  // **A credit note is a credit against the invoice it reverses, not a row of its own.** Its
  // amounts are positive in the file — the type is what says it reverses — so giving it a negative
  // row here would show a due date for money nobody owes, and the final filter would drop it
  // anyway. It behaves exactly like money received, and it is applied the same way.
  const credits = new Map();
  for (const doc of all.filter((d) => kind(d).storna)) {
    const totale = doc.totali ? BigInt(doc.totali.totale) : ZERO;
    for (const linked of doc.fattureCollegate || []) {
      const target = all.find((d) => d.numero === linked.numero && _conta(d));
      const key = target ? target.id : `numero:${linked.numero}`;
      credits.set(key, add(credits.get(key) || ZERO, totale));
    }
    // A credit note that names no invoice still reduces what is owed overall, so it is kept under
    // a key of its own rather than dropped — it just has nothing to attach to.
    if (!(doc.fattureCollegate || []).length) credits.set(`nc:${doc.id}`, totale);
  }

  const paid = await list(db, "payments");
  for (const payment of paid) {
    let importo = ZERO;
    try {
      importo = from(payment.importo || "0");
    } catch (ignored) {
      // A malformed record must not empty the whole screen: it counts as nothing and the rest of
      // the schedule still draws.
      importo = ZERO;
    }
    credits.set(payment.docId, add(credits.get(payment.docId) || ZERO, importo));
  }

  const rows = [];
  for (const doc of all.filter(_conta)) {
    const totale = doc.totali ? BigInt(doc.totali.totale) : ZERO;
    const rate = (doc.pagamento || {}).rate || [];

    // No instalments means payable on receipt: one row, on the document's own date.
    const parts = rate.length
      ? _quote(rate, totale).map((importo, i) => ({
        scadenza: rate[i].scadenza || doc.data,
        importo,
      }))
      : [{ scadenza: doc.data, importo: totale }];

    // What has come in — payments and credit notes together — closes the oldest instalment first,
    // which is how a partial amount is normally meant and the only reading that needs no asking.
    let left = credits.get(doc.id) || ZERO;
    const ordered = [...parts].sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)));
    for (const part of ordered) {
      if (left <= ZERO) break;
      const take = cmp(left, part.importo) >= 0 ? part.importo : left;
      part.importo = sub(part.importo, take);
      left = sub(left, take);
    }

    for (const part of parts) {
      rows.push({
        docId: doc.id,
        tipo: doc.tipo,
        numero: doc.numero,
        partyId: doc.partyId,
        scadenza: part.scadenza,
        importo: part.importo,
        scaduta: Boolean(part.scadenza) && part.scadenza < today,
      });
    }
  }

  return rows
    .filter((row) => cmp(row.importo, ZERO) > 0)
    .sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)));
}

/** What is overdue, and what is owed in total. The two figures Home shows. */
export async function summary(db, options = {}) {
  const rows = await schedule(db, options);
  return {
    rows,
    overdue: rows.filter((row) => row.scaduta),
    total: sum(rows.map((row) => row.importo)),
  };
}

/**
 * Record money received against a document. Stored apart, because the document is frozen.
 *
 * **Il conto è una fotografia, non un collegamento.** L'incasso è il verbale di una cosa che è
 * successa: se il conto viene rinominato l'anno prossimo, o tolto dall'anagrafica, quell'incasso
 * è comunque arrivato su quello — e un elenco che mostrasse il nome nuovo, o un trattino, direbbe
 * una cosa falsa su un fatto. Stessa scelta dei totali congelati all'emissione.
 *
 * `nota` esiste per il caso che si presenta subito: «bonifico parziale, saldo a fine mese».
 */
export async function recordPayment(db, doc, { importo, data, conto = null, nota = null }) {
  const record = {
    id: globalThis.crypto?.randomUUID?.() || `pay-${Date.now()}`,
    docId: doc.id,
    importo: String(importo),
    data,
    scadenza: data,
    conto: conto ? { id: conto.id, etichetta: conto.etichetta || "", iban: conto.iban || "" } : null,
    nota: nota || null,
  };
  await put(db, "payments", record);
  return record;
}

/** Gli incassi registrati su un documento, dal più vecchio: è l'ordine in cui sono arrivati. */
export async function paymentsOf(db, docId) {
  return (await list(db, "payments"))
    .filter((payment) => payment.docId === docId)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
}

/**
 * Togli un incasso registrato per sbaglio.
 *
 * **Si cancella, e non si storna con un incasso negativo.** Un documento emesso non si tocca perché
 * è uscito e qualcun altro ne ha una copia; un incasso non è uscito da nessuna parte, è un appunto
 * su quello che è arrivato in banca. Un importo negativo qui vorrebbe dire due righe da leggere
 * insieme per capire che non è successo niente.
 */
export async function removePayment(db, id) {
  await remove(db, "payments", id);
}

/** Quanto è stato incassato in tutto su un documento. */
export function received(payments) {
  return sum(payments.map((payment) => {
    try {
      return from(payment.importo || "0");
    } catch (ignored) {
      return ZERO;
    }
  }));
}

/** Quanto resta da incassare su un documento, rate comprese. */
export async function owedOn(db, docId, options = {}) {
  const rows = await schedule(db, options);
  return sum(rows.filter((row) => row.docId === docId).map((row) => row.importo));
}

/**
 * The documents of a period as CSV.
 *
 * Semicolon-separated and with a BOM, because the overwhelmingly likely destination is Excel on an
 * Italian machine: a comma-separated file opens there as one column per row, and a file without a
 * BOM turns every accented letter into mojibake. Both are the sort of thing that makes somebody
 * decide the export is broken.
 */
export async function csv(db, { from: start = null, to = null } = {}) {
  const docs = (await list(db, "docs"))
    .filter((doc) => doc.numero)
    // **Fiscal documents only.** The accountant is registering VAT, and a quote has nothing to
    // register: it is not a taxable event, it has no place in the VAT ledgers, and a row for it in
    // this file would either be entered by mistake or spotted and queried. Both cost somebody time.
    .filter((doc) => kind(doc).fiscale)
    .filter((doc) => (!start || doc.data >= start) && (!to || doc.data <= to))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));

  const people = new Map((await list(db, "parties")).map((p) => [p.id, p]));

  const lines = [COLUMNS.join(";")];
  for (const doc of docs) {
    const party = people.get(doc.partyId) || {};
    const scadenze = ((doc.pagamento || {}).rate || [])
      .map((quota) => quota.scadenza)
      .filter(Boolean)
      .join(" ");
    lines.push([
      doc.tipo,
      doc.numero,
      doc.data,
      party.denominazione || "",
      party.partitaIva || "",
      doc.totali ? toString(BigInt(doc.totali.imponibile), 2) : "",
      doc.totali ? toString(BigInt(doc.totali.imposta), 2) : "",
      doc.totali ? toString(BigInt(doc.totali.totale), 2) : "",
      doc.stato,
      scadenze || doc.data,
    ].map(_field).join(";"));
  }

  return `\ufeff${lines.join("\r\n")}\r\n`;
}
