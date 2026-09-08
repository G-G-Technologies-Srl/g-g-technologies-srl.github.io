// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The rules a document obeys, and the ones that cannot be taken back.
//
// This file is small and it is the most careful in the app, because what it decides is not
// recoverable. An invoice, once issued, has a number that belongs to it for good: you cannot
// un-issue it, you cannot renumber it, and the only way to undo it is another document that says
// so. Everything below follows from that.
//
// **The counter is a record, not `max() + 1`.** Counting the highest number and adding one looks
// equivalent and is not: delete December's last invoice and the counter walks backwards, so next
// year's numbering overlaps this one. The counter only ever goes up.
//
// **The transmission progressive is a second counter.** It never goes back either, not even after
// a file is rejected — the SdI treats a repeated trasmittente-plus-progressive as a duplicate and
// refuses the second one, whatever became of the first.
//
// No DOM in here: `node app/invoice-scope/test/model.mjs` runs it against a fake store.

import { get, put, list, remove, tx } from "gg/store.js";

import { documentKey } from "./db.js";
import { totals } from "./totals.js";
import { validate } from "./validate.js";
import { STATES, KINDS, kind, numero as shownNumber, convertibile } from "./kinds.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * The states, re-exported from `kinds.js` where they now live.
 *
 * They moved because which of them a document may reach depends on what kind of document it is, and
 * that question had to be answerable without a store: a quote is `rifiutato`, never `scartato` —
 * that word is the SdI refusing a file. The re-export is here because this is the file a reader
 * opens looking for the rules, and because `due.js` already imported it from here.
 */
export { STATES };

/**
 * Which states can still be edited.
 *
 * Only a draft. The states after issuing are set by hand, because the app does not talk to the SdI
 * and cannot know: without them the promise to reconstruct what you sent would be empty, and with a
 * state inferred from nothing it would be false.
 */
const EDITABLE = new Set(["bozza"]);

/**
 * Le forme che può prendere il numero di un documento.
 *
 * **Era una sola, cablata, e la fattura vera di chi ha scritto l'app la contraddiceva**: l'app
 * imponeva `2026/0012`, il documento registrato porta `12`. Non è una preferenza estetica — il
 * numero è quello che il cliente cita al telefono e che il commercialista cerca nel registro, e
 * un'azienda che numera in un modo da anni non cambia perché lo dice un programma nuovo.
 *
 * **Cambiare forma non tocca quello che è già uscito.** Il numero si congela quando il documento
 * viene emesso, e da lì è un dato del documento come la data: chi passa da `2026/0012` a `13`
 * trova il vecchio ancora scritto com'era, ed è l'unico comportamento che non riscriva la storia.
 *
 * Il contatore invece è lo stesso in tutti e tre i casi, e riparte ogni anno: il tracciato
 * distingue i documenti per numero *e* data, e `documentKey` in `db.js` mette l'anno nella chiave.
 * Quindi due «12» in due anni diversi convivono, come sulla carta.
 */
export const NUMERAZIONI = {
  anno: { esempio: "2026/0012", scrivi: (n, anno) => `${anno}/${String(n).padStart(4, "0")}` },
  progressivo: { esempio: "0012", scrivi: (n) => String(n).padStart(4, "0") },
  semplice: { esempio: "12", scrivi: (n) => String(n) },
};

/** La forma scelta in anagrafica, con quella storica dell'app come ripiego. */
function _numerazione(company) {
  return NUMERAZIONI[(company || {}).formatoNumero] || NUMERAZIONI.anno;
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** An id that survives being exported here and imported somewhere else. */
function _id() {
  // A progressive would guarantee collisions the first time two installations exchange a file,
  // which is exactly what the export is for.
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function _now() {
  return new Date().toISOString();
}

/**
 * Read a counter, add one, write it back, and hand out the new value — inside a transaction.
 *
 * Deliberately not "read the highest and add one". See the note at the top of the file: the two
 * are the same until something is deleted, and then they are not.
 *
 * It takes the transaction handle rather than the database, and that is the whole correction: read
 * and write used to be two separate transactions, so two tabs could read 5 and both write 6, and a
 * failure between them left the counter moved with no document to show for it.
 */
async function _next(scope, key) {
  const record = (await scope.get("counters", key)) || { key, value: 0 };
  const value = record.value + 1;
  await scope.put("counters", { key, value });
  return value;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** A new draft, with nothing decided yet — no number above all. */
export function draft(fields = {}) {
  const doc = {
    id: _id(),
    tipo: "TD01",
    stato: "bozza",
    numero: null,
    data: new Date().toISOString().slice(0, 10),
    righe: [],
    esportato: false,
    creato: _now(),
    updated: _now(),
    ...fields,
  };
  // The series follows the kind rather than being typed in: it is what keeps a quote and an invoice
  // of the same week from both being called 2026/0001 out loud. Assigned after the spread, so a
  // caller that names a type gets that type's series and one that names a series keeps it.
  if (doc.serie === undefined) doc.serie = kind(doc).serie;
  return doc;
}

/**
 * Change a draft's type, and everything the type carries with it.
 *
 * The series is the reason this is a function and not an assignment: switch a document from invoice
 * to quote and its number has to come from the quote sequence, which is a different counter. Getting
 * that wrong is silent — the document numbers fine, out of the wrong series.
 *
 * Nothing else is cleared. Fields belonging to a section the new kind does not show simply stop
 * being read: clearing them would lose the payment terms of somebody who switched to a delivery note
 * and back, and keeping them costs a few bytes in a record nobody reads.
 */
export function setType(doc, tipo) {
  if (!KINDS[tipo]) throw new Error(`tipo sconosciuto: ${tipo}`);
  if (!editable(doc)) throw new Error(`un documento «${doc.stato}» non cambia tipo`);
  doc.tipo = tipo;
  doc.serie = KINDS[tipo].serie;
  return doc;
}

/** Whether a document may still be changed. One question, asked in one place. */
export function editable(doc) {
  return EDITABLE.has(doc.stato);
}

/**
 * Save a draft. Refuses anything else.
 *
 * The refusal is a thrown error and not a silent no-op: a screen that thinks it saved and did not
 * is worse than one that reports it could not.
 */
export async function save(db, doc) {
  if (!editable(doc)) throw new Error(`un documento «${doc.stato}» non si modifica`);
  const record = { ...doc, updated: _now(), chiave: documentKey(doc) };
  await put(db, "docs", record);
  return record;
}

/**
 * Issue a document: assign the number, and close it.
 *
 * The number is assigned **here**, not when the document is created. Creating drafts and throwing
 * them away is normal; holes in the numbering are not.
 *
 * It validates first and throws with the list of problems, so the one path that assigns a number
 * is also the one that cannot assign it to something malformed.
 */
export async function issue(db, doc, context) {
  if (!editable(doc)) throw new Error(`un documento «${doc.stato}» è già stato emesso`);

  // Everything except the number, which this function is on its way to assigning.
  const problems = validate(doc, { ...context, richiedeNumero: false });
  if (problems.length) {
    const error = new Error("il documento non è completo");
    error.problems = problems;
    throw error;
  }

  const anno = String(doc.data).slice(0, 4);
  const key = `doc|${doc.serie || ""}|${doc.tipo}|${anno}`;

  // The totals are worked out **before** the transaction opens: everything inside it must be a
  // read or a write on its own stores, because IndexedDB commits as soon as control returns to the
  // event loop with no requests outstanding.
  const computed = totals(doc);
  const now = _now();

  // The counter and the document are written together. Either the number exists and the document
  // carrying it exists, or neither does — which is the only way a sequence stays whole through a
  // failure, a closed tab or a second window.
  const scrivi = _numerazione(context.company).scrivi;

  return tx(db, ["counters", "docs"], async (scope) => {
    const progressivo = await _next(scope, key);
    const issued = {
      ...doc,
      stato: "emesso",
      numero: scrivi(progressivo, anno),
      // Saved, not recomputed on read: an issued invoice has to show for ever the figures it had
      // when it was issued, even if a rate in the price list changes tomorrow.
      totali: {
        imponibile: computed.imponibile.toString(),
        imposta: computed.imposta.toString(),
        totale: computed.totale.toString(),
      },
      emesso: now,
      updated: now,
    };
    issued.chiave = documentKey(issued);
    await scope.put("docs", issued);
    return issued;
  });
}

/**
 * The next transmission progressive, which is a different counter from the invoice number.
 *
 * Shared by every document of every series: it identifies a *file* sent by this trasmittente, and
 * the SdI counts them all together.
 *
 * **`da` è il numero da cui ripartire, e sposta il contatore solo in avanti.** Serve a chi arriva
 * da un altro programma con una numerazione già iniziata: senza, l'app ricomincerebbe da uno e
 * riuserebbe progressivi già spesi — che il Sistema di Interscambio rifiuta come duplicati,
 * qualunque cosa sia successa al primo file.
 *
 * Solo in avanti perché all'indietro non c'è niente da recuperare e c'è tutto da perdere: un numero
 * già uscito è uscito. Quindi una correzione al rialzo si può fare in qualunque momento, una al
 * ribasso non fa niente — e non è un rifiuto silenzioso, è che il contatore resta l'autorità.
 */
export async function nextProgressivo(db, { da = 0 } = {}) {
  const partenza = Math.max(0, Math.floor(Number(da) || 0) - 1);
  return tx(db, ["counters"], async (scope) => {
    const record = (await scope.get("counters", "trasmissione")) || { key: "trasmissione", value: 0 };
    const value = Math.max(record.value, partenza) + 1;
    await scope.put("counters", { key: "trasmissione", value });
    return value;
  });
}

/** Record that the XML has left. After this the document cannot go back to being a draft. */
export async function markExported(db, doc, progressivo) {
  const record = { ...doc, esportato: true, progressivo, updated: _now() };
  // Recomputed rather than carried over: this was the one write that trusted the caller, and a
  // document rebuilt in memory without `chiave` would have slipped out of the unique index without
  // a word.
  record.chiave = documentKey(record);
  await put(db, "docs", record);
  return record;
}

/**
 * Move a document to one of the states that follow issuing.
 *
 * `scartato` and `annullato` keep the number. That is the point of having them: a rejected invoice
 * is redone under a new number, and the old one stays taken so the sequence has no hole.
 *
 * **Which states are on offer depends on the kind**, and that is checked here rather than only in
 * the screen that offers them. A quote is `rifiutato`, an invoice is `scartato`, and the two words
 * are not interchangeable: `scartato` means the SdI refused the file. A screen can be trusted to
 * draw the right menu; it cannot be the only thing standing between an imported document and a
 * state that makes no sense for it.
 */
export async function setState(db, doc, stato) {
  if (!STATES.includes(stato)) throw new Error(`stato sconosciuto: ${stato}`);
  if (doc.stato === "bozza") {
    throw new Error("una bozza si chiude emettendola, non cambiandole stato");
  }
  // **Back to draft is `reopen`'s business alone.** This guard used to cover only the other
  // direction, so `setState(doc, "bozza")` walked an issued invoice back to editable while it kept
  // its number and lost its key: from there its lines could be rewritten, and the next issue gave
  // it a new number leaving the old one missing from the sequence. Every check the app has was
  // bypassed by one call.
  if (stato === "bozza") {
    throw new Error("per tornare in bozza si usa reopen, che verifica il numero e l'export");
  }
  // `emesso` is always allowed back: "I marked it sent by mistake" is a normal thing to want, and
  // it takes nothing away. Every other state has to belong to this kind.
  if (stato !== "emesso" && !kind(doc).stati.includes(stato)) {
    throw new Error(`lo stato «${stato}» non appartiene a questo tipo di documento`);
  }
  const record = { ...doc, stato, updated: _now() };
  record.chiave = documentKey({ ...record, stato: "emesso" });
  await put(db, "docs", record);
  return record;
}

/**
 * Take an issued document back to draft, when nothing has left yet.
 *
 * The only way backwards, and it is narrow on purpose: it has to be the highest number of its
 * series and year, and no XML may have been exported. Both conditions are recorded on the
 * document, not worked out from circumstance — `esportato` is written when the file is produced,
 * so this cannot be fooled by a file that was produced and then deleted.
 */
export async function reopen(db, doc) {
  if (doc.stato !== "emesso") throw new Error("solo un documento emesso può tornare bozza");
  if (doc.esportato) throw new Error("l'XML è già uscito: si storna, non si riapre");

  const anno = String(doc.data).slice(0, 4);
  const key = `doc|${doc.serie || ""}|${doc.tipo}|${anno}`;
  const mine = Number(String(doc.numero).split("/").pop());
  const now = _now();

  // Same reason as `issue`, seen from the other side: lowering the counter and rewriting the
  // document are one act. Done apart, a failure between them left the counter one below and the
  // document still issued — and from the next issue onwards every number collided with an existing
  // one, so the app stopped being able to emit anything at all.
  return tx(db, ["counters", "docs"], async (scope) => {
    const counter = (await scope.get("counters", key)) || { key, value: 0 };
    if (mine !== counter.value) {
      throw new Error("non è l'ultimo numero della serie: riaprirlo lascerebbe un buco");
    }
    await scope.put("counters", { key, value: counter.value - 1 });
    const record = { ...doc, stato: "bozza", numero: null, totali: null, chiave: undefined, updated: now };
    await scope.put("docs", record);
    return record;
  });
}

/**
 * The credit note that reverses a document.
 *
 * A draft, so it can still be adjusted before it is issued — a partial reversal is a normal thing
 * to want. The lines are copied as they are and the amounts stay positive: TD04 says what it is
 * by being a TD04, and negative amounts on a credit note are a rejected file.
 */
export function creditNote(doc) {
  // Only a fiscal document can be reversed by one. A quote is withdrawn and a delivery note is
  // cancelled — neither ever asked anybody for money, so there is nothing to credit back.
  if (!kind(doc).fiscale) {
    throw new Error("solo un documento fiscale si storna con una nota di credito");
  }
  return draft({
    tipo: "TD04",
    serie: doc.serie || "",
    partyId: doc.partyId,
    righe: (doc.righe || []).map((line) => ({ ...line })),
    fattureCollegate: [{ numero: doc.numero, data: doc.data }],
  });
}

/**
 * The invoice a quote or a delivery note becomes.
 *
 * **A draft, and only from a document that is already issued.** Converting a draft would number the
 * copy while the original could still change, and then two documents would disagree about what was
 * agreed. What comes across is what was agreed — the customer, the lines, the discount, the payment
 * terms — and nothing that was decided about the original: no number, no state, no date.
 *
 * The two directions differ in where the reference goes, and the difference is not cosmetic:
 *
 *  - a delivery note becomes a **deferred invoice**, and its number and date go into `ddt`, which
 *    `fatturapa.js` writes out as `DatiDDT`. That block is the whole legal point of a TD24: it is
 *    what ties the invoice to the goods that already moved.
 *  - a quote becomes an ordinary invoice, and its reference stays **inside the app**. The tracciato
 *    has no field for a quote — `DatiOrdineAcquisto` is the customer's order, which is a different
 *    document — so inventing a slot for it would produce a file the SdI reads differently from how
 *    we meant it. It is printed on the courtesy sheet instead, which is where a customer looks for it.
 */
export function convertMany(docs) {
  const lista = (Array.isArray(docs) ? docs : [docs])
    // In date order, so the lines of the invoice follow the order the goods went out — which is the
    // order the customer's own delivery notes are filed in.
    .slice()
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  if (!lista.length) throw new Error("non c'è niente da convertire");

  const primo = lista[0];
  const tipo = convertibile(primo);
  if (!tipo) throw new Error("questo documento non si converte in una fattura");

  if (lista.length > 1) {
    // **Solo il documento di trasporto si raggruppa**, e la ragione sta in `kinds.js`: è l'unico
    // tipo che non porta né sconto né scadenze, quindi unirne due non butta via niente. Due
    // preventivi hanno due sconti e due scadenzari, e la fattura ne terrebbe uno solo — in silenzio.
    if (!kind(primo).raggruppabile) {
      throw new Error("questo tipo di documento si fattura uno alla volta");
    }
    for (const doc of lista) {
      if (doc.tipo !== primo.tipo) throw new Error("i documenti non sono dello stesso tipo");
      if (doc.partyId !== primo.partyId) throw new Error("i documenti sono di clienti diversi");
      if (convertibile(doc) !== tipo) throw new Error("uno dei documenti non si può fatturare");
    }
  }

  const fields = {
    tipo,
    partyId: primo.partyId,
    causale: primo.causale || null,
    righe: lista.flatMap((doc) => (doc.righe || []).map((line) => ({ ...line }))),
    scontoDocumento: primo.scontoDocumento || null,
    // The instalments are copied by value: they are a proposal in a quote and an obligation in an
    // invoice, and sharing the array would let editing one rewrite the other.
    pagamento: primo.pagamento
      ? { ...primo.pagamento, rate: (primo.pagamento.rate || []).map((quota) => ({ ...quota })) }
      : null,
  };
  if (tipo === "TD24") {
    // `id` accanto al numero: nel file ci finiscono solo numero e data — `fatturapa.js` ignora il
    // resto — ma è l'id che permette di sapere, guardando le fatture, quali consegne sono già
    // state fatturate. Il numero da solo cambierebbe significato il giorno in cui una serie viene
    // riusata in un altro anno.
    fields.ddt = lista.map((doc) => ({ numero: shownNumber(doc), data: doc.data, id: doc.id }));
  } else {
    fields.daPreventivo = { numero: shownNumber(primo), data: primo.data, id: primo.id };
  }

  return draft(fields);
}

/** One document into its invoice. The common case, and the one every screen but the list uses. */
export function convert(doc) {
  return convertMany([doc]);
}

/**
 * Which quotes and delivery notes have already been invoiced, and by what.
 *
 * **Derived from the invoices, never written on the source.** The same choice `schedule.js` makes,
 * for the same reason: a flag on the delivery note would be a second truth, and it would go wrong on
 * the one path that matters — you convert three delivery notes, then throw the draft invoice away,
 * and the three would stay marked as invoiced for ever. Read this way there is nothing to undo:
 * discard the draft and the delivery notes are free again, because nothing points at them any more.
 *
 * Without it a delivery note offered «crea la fattura differita» for ever, and invoicing the same
 * delivery twice is a mistake the customer finds, not the app.
 */
export function invoicedBy(docs) {
  const out = new Map();
  for (const doc of docs) {
    for (const ref of doc.ddt || []) if (ref.id) out.set(ref.id, doc);
    if (doc.daPreventivo && doc.daPreventivo.id) out.set(doc.daPreventivo.id, doc);
  }
  return out;
}

/** Delete a draft. Anything issued is refused: it is stornato, never removed. */
export async function discard(db, doc) {
  if (!editable(doc)) throw new Error("un documento emesso non si cancella: si storna");
  await remove(db, "docs", doc.id);
}

/**
 * The amount a document weighs in a column of documents, or `null` when it has none yet.
 *
 * Frozen totals when it has been issued, worked out from the lines for a draft — a draft has no
 * saved total and a dash tells the reader nothing about what they are about to invoice — and
 * negative for a credit note: its own figures are positive, as the tracciato wants them, but beside
 * a column of invoices it is money going the other way.
 *
 * Here rather than beside each list because there are three lists now — the documents, the home, a
 * customer's own — and the sign is the part that goes wrong quietly: added instead of subtracted, a
 * credit note raises the very figure it was written to cancel.
 */
export function signedTotal(doc) {
  const valore = doc.totali
    ? BigInt(doc.totali.totale)
    : ((doc.righe || []).length ? totals(doc).totale : null);
  if (valore === null) return null;
  return kind(doc).storna ? -valore : valore;
}

/** Every document, newest first. */
export async function documents(db) {
  const all = await list(db, "docs");
  // Per data, e a parità di data per numero: tre fatture dello stesso giorno uscivano 8, 6, 7,
  // nell'ordine in cui il deposito le restituiva. Un numero si legge come numero — la 10 viene dopo
  // la 9, non prima della 2 — quindi il confronto è sulle cifre finali, non sulla stringa.
  const ordinale = (doc) => Number((/(\d+)\s*$/.exec(String(doc.numero || "")) || [0, 0])[1]);
  return all.sort((a, b) =>
    String(b.data).localeCompare(String(a.data)) || (ordinale(b) - ordinale(a)));
}
