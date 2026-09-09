// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What a Fatture in Cloud export means, expressed once.
//
// Three files come out of that account and none of them is the same shape: the customer list and the
// price list are `.xlsx`, the document register is the binary `.xls` of 1997 and has to be saved
// again before anything can read it. What they share is that **their column headings are not a
// contract.** They can be renamed in a release note nobody reads, and one of them is already
// misspelled at the source — the customer list says «Metodo di pagamento *prefefinito*». That typo is
// theirs, it is in the file, and it is the whole argument for matching on a set of spellings instead
// of on one exact string: written the other way, this module would look like it contained our typo.
//
// So every column is declared with the spellings it is known by, matched on a squashed form —
// lowercase, no accents, no punctuation — and **anything unrecognised is reported rather than
// dropped**. A silent import is the failure mode that matters here: nobody re-reads seventeen
// customers to check that the VAT numbers landed in the VAT column.
//
// **What is deliberately lost.** Their customer record holds a phone number, a contact name, a fax
// and a shipping address; ours does not, because none of them appears on an invoice. Those columns
// are named in `IGNORATE` so the import can say "I read this and left it out" instead of saying
// nothing, which reads as "there was nothing there".
//
// **Nearly a leaf.** The one import is `parse.js`, which has none of its own: what this file knows
// is what one company's export looks like, and that is not a thing the rest of the app should be
// able to reach into. The tests run it alone — `node app/invoice-scope/test/fic.mjs`, no loader,
// no database, no DOM.

import { parseAmount } from "./parse.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * Country names as an export writes them, in the two languages one may arrive in.
 *
 * Their file writes «Italia» and «San Marino», not `IT` and `SM`: a name meant for a person, in the
 * language of the account. Only the countries that actually turn up are here — an unknown name is
 * reported, not guessed, because guessing the country wrong moves an address into the foreign branch
 * of the emitter and rewrites its postcode as `00000`.
 */
const PAESI = {
  italia: "IT", italy: "IT",
  "san marino": "SM", "repubblica di san marino": "SM", "rep di san marino": "SM",
  germania: "DE", germany: "DE", deutschland: "DE",
  francia: "FR", france: "FR",
  spagna: "ES", spain: "ES",
  svizzera: "CH", switzerland: "CH", schweiz: "CH",
  austria: "AT",
  "stati uniti": "US", "united states": "US", usa: "US",
  "regno unito": "GB", "united kingdom": "GB",
};

/**
 * The province of a San Marino address, as their file writes it against what the tracciato accepts.
 *
 * `ProvinciaType` in the schema is exactly two letters. Fatture in Cloud writes `RSM`, which is
 * three, and an invoice carrying it would be rejected — while the invoice of ours that the Ufficio
 * Tributario actually registered carries `SM`. So this is not a preference between two spellings: it
 * is the one that a real file proves works.
 */
const PROVINCE = { RSM: "SM", "R.S.M.": "SM", "SAN MARINO": "SM" };

/** Which of their document names is which of our types. */
const TIPI = {
  fattura: "TD01",
  "fattura elettronica": "TD01",
  "nota di credito": "TD04",
  "nota credito": "TD04",
  preventivo: "preventivo",
  ordine: "preventivo",
  ddt: "ddt",
  "ddt / bolla": "ddt",
  bolla: "ddt",
  "documento di trasporto": "ddt",
};

// Columns read on purpose and left out, because the field they hold does not exist on our side and
// would not appear on a document. Named so the report can say so.
const IGNORATE = {
  clienti: [
    "indirizzo e mail", "referente", "telefono", "fax", "note", "note indirizzo",
    "codice interno", "iban", "indirizzo spedizione", "termini di pagamento",
    "metodo di pagamento prefefinito", "metodo di pagamento predefinito",
    "sconto predefinito", "lettera d intento abilitata", "protocollo ricezione",
    "data ricevuta telematica", "aliquota iva predefinita",
  ],
  listino: ["codice", "categoria", "prezzo lordo", "descrizione aliquota iva", "extra",
            "prezzo di acquisto", "giacenza"],
  registro: ["centro ricavo", "valuta orig", "contrassegnato", "cassa", "altra cassa",
             "rivalsa", "rit prev", "indirizzo extra"],
  righe: ["centro ricavo", "valuta orig", "categoria conto", "indirizzo extra", "non imponibile",
          "iva"],
};

/**
 * Their VAT code names, as our `Natura`. Only the ones that turned up: a zero-rate line with a name
 * not in this table keeps an empty nature and is reported, because the two candidates — `N3.1`
 * export, `N2.2` out of scope — are a world apart and guessing puts a defensible-looking code on
 * a line nobody checked.
 */
const NATURE = {
  "non imp art 8": "N3.1",
  "non imponibile art 8": "N3.1",
  "non imp art 8 bis": "N3.1",
  "non imp art 41": "N3.2",
  "non imp art 71": "N3.3",
  "non imp art 9": "N3.4",
  "escluso art 15": "N1",
  "fuori campo iva": "N2.2",
  "fuori campo": "N2.2",
  "esente art 10": "N4",
  "reverse charge": "N6.9",
};

/** Column → field, per file. The first spelling is the one the current export uses. */
const COLONNE = {
  clienti: {
    denominazione: ["denominazione", "ragione sociale", "nome", "cliente"],
    indirizzo: ["indirizzo"],
    comune: ["comune", "citta"],
    cap: ["cap"],
    provincia: ["provincia", "prov"],
    paese: ["paese", "nazione"],
    partitaIva: ["p iva tax id", "p iva", "partita iva", "piva"],
    codiceFiscale: ["codice fiscale", "cf"],
    pec: ["indirizzo pec", "pec"],
    codiceDestinatario: ["codice sdi", "codice destinatario", "sdi"],
  },
  listino: {
    nome: ["nome prodotto servizio", "nome", "prodotto"],
    descrizione: ["descrizione"],
    prezzoUnitario: ["prezzo netto", "prezzo", "prezzo unitario"],
    aliquota: ["aliquota iva", "iva", "aliquota"],
    unitaMisura: ["u d m", "udm", "unita di misura", "um"],
  },
  registro: {
    data: ["data"],
    scadenza: ["prox scadenza", "scadenza", "prossima scadenza"],
    tipo: ["documento", "tipo documento", "tipo"],
    numero: ["numero", "n"],
    serie: ["serie", "sezionale"],
    saldato: ["saldato", "pagato"],
    cliente: ["cliente", "denominazione", "ragione sociale"],
    indirizzo: ["indirizzo cliente", "indirizzo"],
    comune: ["comune"],
    provincia: ["provincia"],
    cap: ["cap"],
    paese: ["paese", "nazione"],
    partitaIva: ["p iva", "partita iva", "piva"],
    codiceFiscale: ["cf", "codice fiscale"],
    oggetto: ["oggetto visibile", "oggetto"],
    oggettoInterno: ["oggetto interno"],
    imponibile: ["imponibile"],
    iva: ["iva"],
    ritenuta: ["rit acconto", "ritenuta acconto", "ritenuta"],
    lordo: ["lordo", "totale"],
  },
  // The line detail: one row per invoice line, the document repeated on each. This is the file
  // that gives a register document its real lines.
  righe: {
    data: ["data"],
    tipo: ["documento", "tipo documento", "tipo"],
    numero: ["numero", "n"],
    serie: ["serie", "sezionale"],
    cliente: ["cliente", "denominazione", "ragione sociale"],
    indirizzo: ["indirizzo cliente", "indirizzo"],
    comune: ["comune"],
    provincia: ["provincia"],
    cap: ["cap"],
    paese: ["paese", "nazione"],
    codice: ["codice", "codice prodotto"],
    nome: ["nome", "descrizione", "nome prodotto servizio"],
    quantita: ["quantita", "qta", "q ta"],
    unitaMisura: ["u m", "um", "u d m", "unita di misura"],
    imponibile: ["imponibile"],
    aliquota: ["aliquota iva", "aliquota"],
    codiceIva: ["codice iva", "descrizione aliquota iva", "descrizione iva"],
  },
};

/**
 * What each file must have before it can be read as that file, **in the order they are tried**.
 *
 * An array and not an object, and the order is the whole point rather than a detail: the register
 * carries a customer on every line, so it satisfies the customer list's signature too — «Cliente» and
 * «P.IVA» are both there — and asked in the other order it comes back as an address book of twelve
 * entries, eight of them the same company. That is not a hypothetical. It is what the first version
 * of this function did with the real file, and the wrong answer looked entirely plausible.
 *
 * So the most specific signature is asked first. Only the register has an amount column.
 */
const FIRMA = [
  // The line detail before the register: it carries «Data», «Numero» and «Imponibile» too, and
  // read as a register it would be twelve documents counted twice. Only the lines have a quantity.
  ["righe", ["data", "numero", "quantita", "nome"]],
  ["registro", ["data", "numero", "imponibile"]],
  ["listino", ["nome", "prezzoUnitario"]],
  ["clienti", ["denominazione", "partitaIva"]],
];

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * A heading squashed to the form the tables above are written in.
 *
 * Accents decomposed and dropped, everything that is not a letter or a digit turned into a single
 * space. So «P.IVA/TAX ID», «p.iva / tax id» and «P. IVA TAX ID» are one heading, and the day they
 * rename it the failure is a reported column and not a wrong one.
 */
function _norm(text) {
  return String(text == null ? "" : text)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Where each field sits in this file's header row: `{ campo: indice }`, plus what was not placed.
 *
 * First column wins when a spelling appears twice, which is not a tie-break invented here: the
 * register has both «Cliente» and «Denominazione» available for the same field, and the leftmost is
 * the one the file means.
 */
function _mappa(head, quale) {
  const colonne = COLONNE[quale];
  const ignorate = new Set(IGNORATE[quale] || []);
  const dove = {};
  const scartate = [];

  head.forEach((raw, index) => {
    const name = _norm(raw);
    if (!name) return;
    let trovato = null;
    for (const [campo, spellings] of Object.entries(colonne)) {
      if (spellings.includes(name)) {
        trovato = campo;
        break;
      }
    }
    if (trovato) {
      if (dove[trovato] === undefined) dove[trovato] = index;
    } else if (!ignorate.has(name)) {
      scartate.push(String(raw).trim());
    }
  });

  return { dove, scartate };
}

/** The value of a field on a row, trimmed. `""` when the column is absent. */
function _get(row, dove, campo) {
  const at = dove[campo];
  return at === undefined ? "" : String(row[at] == null ? "" : row[at]).trim();
}

/** A number written for a person, as a decimal string; `""` when there is nothing there. See `parse.js`. */
function _numero(text) {
  return parseAmount(text) ?? "";
}

/**
 * A date as `AAAA-MM-GG`, from the forms an export uses. `""` when unreadable.
 *
 * `27/07/26` is what the register writes, and a two-digit year has to be decided rather than read:
 * under 70 is this century. The window is arbitrary and says so — an invoice from 1969 is not a
 * case, an invoice from 2069 is not a case either, and whichever way it is drawn some year is wrong.
 */
function _data(text) {
  const raw = String(text == null ? "" : text).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;      // already ours: sheet.js converted a serial
  const parts = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!parts) return "";
  const [, g, m, y] = parts;
  const anno = y.length === 4 ? Number(y) : Number(y) + (Number(y) < 70 ? 2000 : 1900);
  const gg = String(Number(g)).padStart(2, "0");
  const mm = String(Number(m)).padStart(2, "0");
  if (Number(mm) < 1 || Number(mm) > 12 || Number(gg) < 1 || Number(gg) > 31) return "";
  return `${anno}-${mm}-${gg}`;
}

/** An address, from whichever columns this file happens to carry. */
function _sede(row, dove) {
  const provincia = _get(row, dove, "provincia").toUpperCase();
  return {
    indirizzo: _get(row, dove, "indirizzo"),
    comune: _get(row, dove, "comune"),
    cap: _get(row, dove, "cap"),
    provincia: PROVINCE[provincia] || provincia,
    numeroCivico: "",
  };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * The ISO code for a country written out, or `null`.
 *
 * `null` and not `"IT"`: a default here would put a German address through the Italian branch of the
 * emitter, which writes a postcode and a province the file is not supposed to have. Whoever calls
 * decides what to do with a country it cannot name, and says so.
 */
export function paese(text) {
  const name = _norm(text);
  if (!name) return null;
  if (/^[a-z]{2}$/.test(name)) return name.toUpperCase(); // already a code
  return PAESI[name] || null;
}

/** Which of the three exports this header row belongs to, or `null`. */
export function guess(head) {
  const names = head.map(_norm);
  for (const [quale, campi] of FIRMA) {
    const colonne = COLONNE[quale];
    if (campi.every((campo) => colonne[campo].some((spelling) => names.includes(spelling)))) {
      return quale;
    }
  }
  return null;
}

/**
 * The customer list, as records `saveParty` accepts.
 *
 * Each record carries `_riga`, the row it came from, so a problem can be pointed at instead of
 * described. The field starts with an underscore because it is scaffolding for the import screen and
 * must not reach the database — `saveParty` copies named fields and drops the rest, which is what
 * makes that safe.
 */
export function parties(head, body) {
  const { dove, scartate } = _mappa(head, "clienti");
  const records = [];
  const problems = [];

  body.forEach((row, index) => {
    const denominazione = _get(row, dove, "denominazione");
    if (!denominazione) {
      problems.push({ riga: index + 1, chiave: "ficNoName" });
      return;
    }
    const scritto = _get(row, dove, "paese");
    const iso = paese(scritto);
    if (scritto && !iso) problems.push({ riga: index + 1, chiave: "ficCountry", valore: scritto });
    records.push({
      denominazione,
      partitaIva: _get(row, dove, "partitaIva"),
      codiceFiscale: _get(row, dove, "codiceFiscale"),
      pec: _get(row, dove, "pec"),
      codiceDestinatario: _get(row, dove, "codiceDestinatario"),
      paese: iso || "IT",
      ..._sede(row, dove),
      _riga: index + 1,
    });
  });

  return { records, scartate, problems };
}

/**
 * The price list, as records `saveItem` accepts.
 *
 * `aliquota` is the company's own default when the file leaves it empty, and the export we have
 * leaves it empty on every line. Writing `22` in here instead would be wrong for the company this
 * app was built for, whose invoices are `N3.1` at zero — a default that is right for the writer of
 * the code and wrong for the user of it.
 */
export function items(head, body, { aliquota = "22" } = {}) {
  const { dove, scartate } = _mappa(head, "listino");
  const records = [];

  for (const row of body) {
    const nome = _get(row, dove, "nome");
    const descrizione = _get(row, dove, "descrizione");
    // The long text when there is one: it is the line as it would read on an invoice, while the
    // short name is a label for a menu. When only the short one exists, that is the line.
    const testo = descrizione || nome;
    if (!testo) continue;
    records.push({
      descrizione: testo,
      unitaMisura: _get(row, dove, "unitaMisura"),
      prezzoUnitario: _numero(_get(row, dove, "prezzoUnitario")) || "0",
      aliquota: _numero(_get(row, dove, "aliquota")) || aliquota,
    });
  }

  return { records, scartate, problems: [] };
}

/**
 * The document register: one entry per document, with the customer it names.
 *
 * **These are not the documents.** The register holds no lines, no VAT breakdown and no schedule —
 * only a total per document — so what comes out of here carries a single line holding the whole
 * taxable amount, described by the document's own subject. That line is a reconstruction and the
 * import screen says so: it exists because a document with no lines has no total, and a register
 * entry whose total does not add up would fail every check downstream for a reason that is not real.
 *
 * The complete documents are the XML files in the account backup, and `reading.js` is what reads
 * those. This is for the years before the backup, and for keeping the numbering going.
 */
export function register(head, body) {
  const { dove, scartate } = _mappa(head, "registro");
  const records = [];
  const problems = [];

  body.forEach((row, index) => {
    const riga = index + 1;
    const data = _data(_get(row, dove, "data"));
    if (!data) {
      problems.push({ riga, chiave: "ficNoDate", valore: _get(row, dove, "data") });
      return;
    }
    const scritto = _get(row, dove, "tipo");
    const tipo = TIPI[_norm(scritto)];
    if (!tipo) {
      problems.push({ riga, chiave: "ficKind", valore: scritto });
      return;
    }

    const imponibile = _numero(_get(row, dove, "imponibile")) || "0";
    const iva = _numero(_get(row, dove, "iva")) || "0";
    const paeseIso = paese(_get(row, dove, "paese")) || "IT";
    const saldato = /^(si|sì|yes|s|true|1)$/i.test(_get(row, dove, "saldato"));

    records.push({
      tipo,
      data,
      numero: _get(row, dove, "numero"),
      serie: _get(row, dove, "serie"),
      scadenza: _data(_get(row, dove, "scadenza")) || data,
      saldato,
      imponibile,
      iva,
      ritenuta: _numero(_get(row, dove, "ritenuta")) || "0",
      lordo: _numero(_get(row, dove, "lordo")) || "0",
      oggetto: _get(row, dove, "oggetto") || _get(row, dove, "oggettoInterno"),
      cliente: {
        denominazione: _get(row, dove, "cliente"),
        partitaIva: _get(row, dove, "partitaIva"),
        codiceFiscale: _get(row, dove, "codiceFiscale"),
        pec: "",
        codiceDestinatario: "",
        paese: paeseIso,
        ..._sede(row, dove),
      },
      _riga: riga,
    });
  });

  return { records, scartate, problems };
}

/**
 * The line detail, grouped by document: `[{ tipo, data, numero, serie, cliente, righe, _riga }]`.
 *
 * **The unit price is what the file does not say.** It carries the line's taxable amount and the
 * quantity, so the price is one divided by the other — kept at eight decimals, the most the
 * tracciato allows, so that quantity times price gives back the amount the file stated. With a
 * quantity of one, which is nearly every line, the price is the amount itself.
 *
 * The nature comes from their VAT code name, through `NATURE`; a zero-rate line with a name not in
 * that table is reported, once per name, and its nature stays empty for the person to fill in.
 */
export function lines(head, body) {
  const { dove, scartate } = _mappa(head, "righe");
  const perDocumento = new Map();
  const problems = [];
  const natureIgnote = new Set();

  body.forEach((row, index) => {
    const riga = index + 1;
    const data = _data(_get(row, dove, "data"));
    if (!data) {
      problems.push({ riga, chiave: "ficNoDate", valore: _get(row, dove, "data") });
      return;
    }
    const scritto = _get(row, dove, "tipo");
    const tipo = TIPI[_norm(scritto)];
    if (!tipo) {
      problems.push({ riga, chiave: "ficKind", valore: scritto });
      return;
    }
    const numero = _get(row, dove, "numero");
    const serie = _get(row, dove, "serie");
    const chiave = `${serie}|${tipo}|${data.slice(0, 4)}|${numero}`;

    const imponibile = _numero(_get(row, dove, "imponibile")) || "0";
    const quantita = _numero(_get(row, dove, "quantita")) || "1";
    const aliquota = _numero(_get(row, dove, "aliquota")) || "0";
    let prezzoUnitario = imponibile;
    if (quantita !== "1") {
      const q = Number(quantita);
      prezzoUnitario = q ? (Number(imponibile) / q).toFixed(8).replace(/\.?0+$/, "") : imponibile;
    }
    let natura = "";
    if (aliquota === "0") {
      const nome = _norm(_get(row, dove, "codiceIva"));
      natura = NATURE[nome] || "";
      if (!natura && nome && !natureIgnote.has(nome)) {
        natureIgnote.add(nome);
        problems.push({ riga, chiave: "ficNatura", valore: _get(row, dove, "codiceIva") });
      }
    }

    if (!perDocumento.has(chiave)) {
      perDocumento.set(chiave, {
        tipo,
        data,
        numero,
        serie,
        cliente: {
          denominazione: _get(row, dove, "cliente"),
          partitaIva: "",
          codiceFiscale: "",
          pec: "",
          codiceDestinatario: "",
          // Without a country column, the province says it: «RSM» or «San Marino» is a customer
          // in San Marino, and «IT» there would send the address through the wrong branch.
          paese: paese(_get(row, dove, "paese")) || (_sede(row, dove).provincia === "SM" ? "SM" : "IT"),
          ..._sede(row, dove),
        },
        righe: [],
        _riga: riga,
      });
    }
    perDocumento.get(chiave).righe.push({
      descrizione: _get(row, dove, "nome") || _get(row, dove, "codice"),
      quantita,
      unitaMisura: _get(row, dove, "unitaMisura"),
      prezzoUnitario,
      aliquota,
      natura,
    });
  });

  return { records: [...perDocumento.values()], scartate, problems };
}

/** The private helpers, for the tests. Everything here is exercised through the four above as well. */
export const internals = { _norm, _numero, _data, _mappa };
