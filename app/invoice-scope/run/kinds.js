// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What kind of document this is, and everything that follows from it.
//
// **This file exists because the app had one kind and behaved as if that were a law of nature.**
// The states were a single list, `schedule.js` assumed every issued document was money expected, and
// `validate.js` demanded a recipient code of everything. Adding quotes and delivery notes by
// widening those three lists one at a time would have produced an app where an accepted quote sits
// in the payment schedule — the same shape as the credit-note defect, and found the same way.
//
// So the differences are declared **here, once**, and the other files ask. Five kinds, five rows,
// and every question about a kind is answered by a field rather than by a condition somebody
// remembered to write in the right place.
//
// **Uppercase is a tracciato code, lowercase is ours.** `TD01`, `TD04` and `TD24` are what the SdI
// calls them and what gets written into `TipoDocumento`; `preventivo` and `ddt` never leave this
// computer, so they are words and not codes. Reading `doc.tipo` you can tell at a glance which of
// the two you are holding, which matters most in `fatturapa.js` — the one file that must never see
// the second sort.
//
// Nothing is imported here. It is a leaf on purpose: `model.js`, `validate.js`, `schedule.js` and
// three screens all depend on it, and a leaf cannot take part in a cycle.
//
//     node app/invoice-scope/test/kinds.mjs

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * Every state a document can be in, in the order a document walks them.
 *
 * The union of all the kinds: which of them a given document may actually reach is `stati` below,
 * and `model.js` refuses the rest. Two states arrived with quotes and delivery notes — `rifiutato`,
 * because a quote that is turned down is not "scartato" (that word belongs to the SdI refusing a
 * file), and `consegnato`, which is the only thing that ever happens to a delivery note.
 */
export const STATES = [
  "bozza", "emesso", "inviato", "accettato", "rifiutato", "consegnato", "scartato", "annullato",
];

/** What follows issuing an invoice. Shared by the three fiscal kinds, which behave alike here. */
const DOPO_EMISSIONE = ["inviato", "accettato", "scartato", "annullato"];

/**
 * The five kinds, and the facts about each.
 *
 * | campo | che cosa decide |
 * |---|---|
 * | `fiscale` | se il documento produce un XML e finisce nel CSV del commercialista |
 * | `deve` | se il suo totale entra nello scadenzario |
 * | `storna` | se il suo totale è un credito contro un altro documento |
 * | `serie` | la sigla davanti al numero, e la sequenza a cui il numero appartiene |
 * | `stati` | gli stati raggiungibili dopo l'emissione |
 * | `sezioni` | le parti della maschera che valgono per questo tipo |
 * | `converteIn` | il tipo in cui questo documento si trasforma, quando ha senso |
 * | `raggruppabile` | se più documenti dello stesso cliente diventano una fattura sola |
 */
export const KINDS = {
  // The order of the keys is the order of the menu, and it is the order of the work: you quote,
  // you deliver, you invoice. Alphabetical or "invoice first" would both be arrangements of a list;
  // this one is a sequence somebody actually walks.
  preventivo: {
    fiscale: false,
    deve: false,
    storna: false,
    serie: "PR",
    label: "typePreventivo",
    raggruppabile: false,
    stati: ["inviato", "accettato", "rifiutato", "annullato"],
    sezioni: ["sconto", "pagamento", "validita"],
    converteIn: "TD01",
  },
  ddt: {
    fiscale: false,
    deve: false,
    storna: false,
    serie: "DDT",
    label: "typeDdt",
    // **Più documenti di trasporto fanno una fattura sola**, ed è il motivo per cui la fattura
    // differita esiste: si consegna a rate e si fattura a fine mese. Solo il DDT si raggruppa,
    // perché è l'unico tipo che non porta né sconto né scadenze — unire due preventivi vorrebbe
    // dire buttare via lo sconto di uno dei due senza dirlo a nessuno.
    raggruppabile: true,
    // A delivery note is delivered or it is cancelled. There is no third thing, and offering one
    // would be offering a state nobody can explain.
    stati: ["consegnato", "annullato"],
    sezioni: ["trasporto"],
    converteIn: "TD24",
  },
  TD01: {
    fiscale: true,
    deve: true,
    storna: false,
    serie: "",
    label: "typeTD01",
    raggruppabile: false,
    stati: DOPO_EMISSIONE,
    sezioni: ["sconto", "ritenuta", "bollo", "pagamento"],
    converteIn: null,
  },
  TD24: {
    fiscale: true,
    deve: true,
    storna: false,
    serie: "",
    label: "typeTD24",
    raggruppabile: false,
    stati: DOPO_EMISSIONE,
    // The deferred invoice is the one that carries `DatiDDT`, which is why the delivery notes it
    // was built from are shown on it and not only remembered.
    sezioni: ["sconto", "ritenuta", "bollo", "pagamento", "ddtCollegati"],
    converteIn: null,
  },
  TD04: {
    fiscale: true,
    // **A credit note owes nothing and is owed nothing.** Its total is a credit against the invoice
    // it reverses, which is how `schedule.js` applies it — `deve: false` and `storna: true` are the
    // two halves of one statement, and separating them is what stops a credit note appearing in the
    // schedule as an amount somebody expects to receive.
    deve: false,
    storna: true,
    serie: "",
    label: "typeTD04",
    raggruppabile: false,
    stati: DOPO_EMISSIONE,
    sezioni: ["sconto", "ritenuta", "bollo", "collegate"],
    converteIn: null,
  },
};

/** The kinds in menu order. One list, so a screen never invents an order of its own. */
export const TIPI = Object.keys(KINDS);

/** The fiscal kinds, which is the subset `validate.js` and `fatturapa.js` are about. */
export const TIPI_FISCALI = TIPI.filter((tipo) => KINDS[tipo].fiscale);

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * The profile of a document.
 *
 * Falls back to the invoice rather than throwing: this is asked by screens, and a document arriving
 * from an old export with a type nobody recognises has to be *drawn* — as an invoice, which is the
 * strictest of the five, so nothing is let through that would otherwise be caught. `validate.js`
 * is the one that says the type is wrong, and it says it in words.
 */
export function kind(doc) {
  return KINDS[(doc && doc.tipo) || "TD01"] || KINDS.TD01;
}

/** Whether a section of the document form applies to this kind. */
export function has(doc, sezione) {
  return kind(doc).sezioni.includes(sezione);
}

/** Whether this document produces an XML file. The question `doc.js` asks before offering one. */
export function fiscale(doc) {
  return kind(doc).fiscale;
}

/**
 * The number as it is read and written down: the series, then the number.
 *
 * The series is what keeps a quote and an invoice of the same week from both being called 2026/0001
 * out loud. It is not needed for uniqueness — the type is already part of the key in `db.js` — but
 * it is needed by the person on the phone reading a number to a customer.
 */
export function numero(doc) {
  if (!doc || !doc.numero) return "";
  const serie = doc.serie || "";
  return serie ? `${serie} ${doc.numero}` : String(doc.numero);
}

/**
 * The type a document turns into, if it turns into anything.
 *
 * Only from a document that has been issued: converting a draft would number the copy while the
 * original could still change, and then two documents would disagree about what was agreed.
 */
export function convertibile(doc) {
  const profile = kind(doc);
  if (!profile.converteIn) return null;
  if (doc.stato === "bozza") return null;
  // A quote that was turned down, or a delivery note that was cancelled, is not a thing to invoice.
  if (doc.stato === "rifiutato" || doc.stato === "annullato") return null;
  return profile.converteIn;
}
