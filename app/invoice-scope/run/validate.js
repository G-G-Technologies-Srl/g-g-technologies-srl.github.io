// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The checks the app can make, on the subset the app emits.
//
// There is no XSD validator in a browser, and writing a general one would be a project of its own.
// So the answer is not to validate worse, it is to **emit less and check that well**: the subset
// is declared on the app card, and everything inside it is checked here, exhaustively.
//
// **Every problem names a field, a rule, and what to do about it.** "Documento non valido" is not
// a message, it is a shrug — the person reading it is looking at thirty fields and has no idea
// which one. The three parts are the whole contract of this file.
//
// **The three parts are keys, not sentences.** They used to be Italian written inline, which read
// well and meant that an English reader who left a field blank got an answer in a language they had
// not asked for — on the one screen where the app is telling somebody they made a mistake. No script
// could see it: the strings were not in the dictionary, so the check that compares the two languages
// had nothing to compare. Now `regola` and `cosaFare` are keys into `i18n.js`, the numbers that go
// inside them travel beside them in `valori`, and `problems.js` turns the three into a line.
//
// **Where the blocking happens.** Nothing here stops you saving a draft: you can leave an invoice
// half-written for as long as you like. The block is on the way *out*, at the point where a wrong
// file stops being your problem and becomes somebody else's.
//
// No DOM in here, and no words either: `node app/invoice-scope/test/validate.mjs` runs it directly.

import { from, add, cmp, sub, abs, toString } from "./decimal.js";
import { totals, MONEY } from "./totals.js";
import {
  destinatario, riferimentoNormativo, profileFor, PAESI_CON_CAP,
} from "./fatturapa.js";
import { kind, TIPI, TIPI_FISCALI } from "./kinds.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * What the app emits, and what it merely keeps.
 *
 * The list moved to `kinds.js` when quotes and delivery notes arrived, because it stopped being a
 * list of tracciato codes: two of the five never become a file, and this file has to treat them
 * differently rather than more loosely.
 */
export { TIPI, TIPI_FISCALI };
// The whole list the tracciato admits, in its order. The first version carried five, which were
// the five this company uses — and left a builder in Rimini unable to write «inversione contabile»
// on a subcontract. A code the schema accepts is a code the app accepts.
export const NATURE = [
  "N1", "N2.1", "N2.2", "N3.1", "N3.2", "N3.3", "N3.4", "N3.5", "N3.6", "N4", "N5",
  "N6.1", "N6.2", "N6.3", "N6.4", "N6.5", "N6.6", "N6.7", "N6.8", "N6.9", "N7",
];
export const REGIMI = ["RF01", "RF19"];
export const CONDIZIONI = ["TP01", "TP02"];
export const MODALITA = ["MP01", "MP05", "MP08", "MP12", "MP19"];
export const RITENUTE = ["RT01", "RT02"];

/** Lengths the schema fixes, and that a form will otherwise happily exceed. */
const MAX = {
  denominazione: 80,
  indirizzo: 60,
  numeroCivico: 8,
  comune: 60,
  numero: 20,
  descrizione: 1000,
  causale: 200,
  unitaMisura: 10,
  tm: 60,
  riferimentoNormativo: 100,
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CAP = /^\d{5}$/;
const PROVINCIA = /^[A-Z]{2}$/;
const DESTINATARIO = /^[A-Z0-9]{7}$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const PIVA_IT = /^\d{11}$/;
const CF_IT = /^([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]|\d{11})$/;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * One problem, in the three parts every message here has, plus the values that go inside them.
 *
 * `valori` rather than a formatted string: a message with a number built by concatenation is a
 * message whose word order belongs to whichever language it was written in. `{max}` can sit in the
 * middle of the Italian sentence and at the end of the English one, and neither has to know.
 */
function _problem(campo, regola, cosaFare, valori = {}) {
  return { campo, regola, cosaFare, valori };
}

/**
 * The Italian VAT number check digit.
 *
 * Worth doing rather than checking the length alone: a transposed pair of digits is the commonest
 * way a VAT number is entered wrong, it passes any length check, and the SdI rejects the invoice
 * days later — by which time the number has been copied into the next one too.
 */
function _partitaIvaValida(value) {
  if (!PIVA_IT.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i += 1) {
    const digit = Number(value[i]);
    if (i % 2 === 0) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  return sum % 10 === 0;
}

/** A required text field, present and within its length. `cosaFare` is a key, like everything here. */
function _text(problems, value, campo, max, cosaFare) {
  if (!value || !String(value).trim()) {
    problems.push(_problem(campo, "vRequired", cosaFare));
    return;
  }
  if (max && String(value).length > max) {
    problems.push(_problem(campo, "vTooLong", "vTooLongFix",
      { max, lunghezza: String(value).length }));
  }
}

/**
 * A party — the same rules for who sends and who receives, plus what differs.
 *
 * **The two flags are the difference between a file and a sheet of paper.** An invoice cannot leave
 * without a fiscal identifier and a complete address, because the SdI refuses it; a quote can be
 * written for somebody whose CAP you will ask for when they say yes, and demanding it up front would
 * stop the app being usable at the one moment it is most useful. The name is required either way:
 * a document addressed to nobody is not a document.
 */
function _party(problems, party, prefix, { richiedeIdentificativo, richiedeSede = true }) {
  if (!party) {
    problems.push(_problem(prefix, "vPartyMissing", "vPartyMissingFix"));
    return;
  }
  const paese = party.paese || "IT";
  const nome = party.denominazione || [party.nome, party.cognome].filter(Boolean).join(" ");
  _text(problems, nome, `${prefix}.denominazione`, MAX.denominazione, "vNameFix");

  if (richiedeIdentificativo && !party.partitaIva && !party.codiceFiscale) {
    problems.push(_problem(`${prefix}.partitaIva`, "vNeedsFiscalId", "vFiscalIdFix"));
  }
  if (party.partitaIva && paese === "IT" && !_partitaIvaValida(party.partitaIva)) {
    problems.push(_problem(`${prefix}.partitaIva`, "vVatCheckDigit", "vVatCheckDigitFix"));
  }
  if (party.codiceFiscale && paese === "IT" && !CF_IT.test(String(party.codiceFiscale).toUpperCase())) {
    problems.push(_problem(`${prefix}.codiceFiscale`, "vTaxCodeShape", "vTaxCodeShapeFix"));
  }

  if (!richiedeSede) return;

  const sede = party.sede || {};
  _text(problems, sede.indirizzo, `${prefix}.sede.indirizzo`, MAX.indirizzo, "vStreetFix");
  _text(problems, sede.comune, `${prefix}.sede.comune`, MAX.comune, "vTownFix");

  // Un indirizzo estero si scrive con CAP 00000 e senza provincia: il tracciato conosce i CAP
  // italiani e basta, e uno straniero vero lì dentro è un file scartato. **San Marino però non è
  // estero in questo senso** — usa i CAP del sistema italiano e la sigla SM — quindi il suo CAP si
  // chiede e si scrive come quello di Rimini.
  if (PAESI_CON_CAP.has(paese)) {
    if (!CAP.test(String(sede.cap || ""))) {
      problems.push(_problem(`${prefix}.sede.cap`, "vCapFive", "vCapFix"));
    }
    if (!PROVINCIA.test(String(sede.provincia || "").toUpperCase())) {
      // The example follows the country: «RN, per esempio» told a San Marino company to write an
      // Italian province, on the one field where its answer is always the same two letters.
      problems.push(_problem(`${prefix}.sede.provincia`, "vProvinceTwo",
        paese === "SM" ? "vProvinceFixSm" : "vProvinceFix"));
    }
  }
}

/** The lines, and the rule that decides whether a rate or a natura belongs on each. */
function _righe(problems, doc, profile) {
  const righe = doc.righe || [];
  if (righe.length === 0) {
    problems.push(_problem("righe", "vNoLines", "vNoLinesFix"));
    return;
  }
  righe.forEach((line, index) => {
    const campo = `righe[${index + 1}]`;
    _text(problems, line.descrizione, `${campo}.descrizione`, MAX.descrizione, "vDescriptionFix");
    if (line.unitaMisura && String(line.unitaMisura).length > MAX.unitaMisura) {
      problems.push(_problem(`${campo}.unitaMisura`, "vTooLong", "vUnitFix",
        { max: MAX.unitaMisura, lunghezza: String(line.unitaMisura).length }));
    }

    const aliquota = line.aliquota;
    if (aliquota === undefined || aliquota === null || aliquota === "") {
      problems.push(_problem(`${campo}.aliquota`, "vRequired", "vRateFix"));
      return;
    }

    const zero = cmp(from(String(aliquota)), from("0")) === 0;
    if (zero && !line.natura) {
      problems.push(_problem(`${campo}.natura`, "vNaturaWhenZero", "vNaturaWhenZeroFix"));
    }
    // The mirror rule, and the one that is forgotten: a natura on a taxed line is rejected too.
    if (!zero && line.natura) {
      problems.push(_problem(`${campo}.natura`, "vNaturaWithRate", "vNaturaWithRateFix"));
    }
    if (line.prezzoUnitario === undefined || line.prezzoUnitario === null || line.prezzoUnitario === "") {
      problems.push(_problem(`${campo}.prezzoUnitario`, "vRequired", "vPriceFix"));
    }

    // The SdI reads a line carrying both an amount and a percentage as carrying only the amount.
    // Letting the pair through would produce a file whose two fields say one thing and whose total
    // says another — and the disagreement is found by the recipient, not by us.
    if (line.sconto && line.sconto.importo !== undefined && line.sconto.percentuale !== undefined) {
      problems.push(_problem(`${campo}.sconto`, "vDiscountBoth", "vDiscountBothFix"));
    }

    // Il codice dell'Ufficio Tributario sammarinese sta in `RiferimentoTesto`, che lo schema
    // ferma a sessanta caratteri.
    if (line.tm && String(line.tm).length > MAX.tm) {
      problems.push(_problem(`${campo}.tm`, "vTooLong", "vTmFix",
        { max: MAX.tm, lunghezza: String(line.tm).length }));
    }
    // Inerte finché l'elenco dell'Ufficio Tributario è vuoto, che è come sta oggi: il campo resta
    // libero. Il giorno che i valori arrivano, il controllo comincia a esistere da sé.
    const ammessi = profile.codiciTm || [];
    if (line.tm && ammessi.length && !ammessi.includes(String(line.tm))) {
      problems.push(_problem(`${campo}.tm`, "vOutsideSubset", "vTmFuoriFix",
        { valore: line.tm, elenco: ammessi.join(", ") }));
    }

    if (line.natura && !NATURE.includes(line.natura)) {
      problems.push(_problem(`${campo}.natura`, "vOutsideSubset", "vNaturaOutsideFix",
        { valore: line.natura, elenco: NATURE.join(", ") }));
    }
  });
}

/**
 * The totals, checked against any the document already carries.
 *
 * **Wrapped, because a validator must not throw.** A half-written document reaches here with a
 * missing rate or a price that is not a number, and `totals` refuses those loudly and rightly —
 * but an exception out of `validate` would take down the screen that was about to list the very
 * problems that caused it. When the arithmetic cannot run, the checks on the lines have already
 * said why, and there is nothing left for this one to add.
 */
function _totali(problems, doc, profile) {
  let computed;
  try {
    computed = totals(doc);
  } catch {
    return null;
  }
  for (const [i, r] of computed.riepiloghi.entries()) {
    // **Due righe dello stesso riepilogo con codici TM diversi non si possono scrivere.** Il
    // riepilogo porta un `RiferimentoNormativo` solo, e spezzarlo in due non è una via d'uscita: il
    // tracciato indicizza i riepiloghi su aliquota e natura, e due blocchi con la stessa coppia
    // vengono scartati. Quindi si dice a chi compila, invece di sceglierne uno di nascosto.
    if (r.tmMisto) {
      problems.push(_problem(`riepiloghi[${i + 1}].tm`, "vTmMisto", "vTmMistoFix"));
    }
    // Misurata come la scrive il file, codice TM davanti compreso: la stessa funzione, così le due
    // stringhe non possono divergere.
    const nota = riferimentoNormativo(r, profile);
    if (nota && nota.length > MAX.riferimentoNormativo) {
      problems.push(_problem(`riepiloghi[${i + 1}].riferimentoNormativo`, "vTooLong", "vRifNormFix",
        { max: MAX.riferimentoNormativo, lunghezza: nota.length }));
    }
  }

  // A document that arrives with totals of its own — an import, or a draft saved before a rounding
  // was fixed — is checked against what we would compute now. A document being written has none.
  if (doc.totaleDichiarato !== undefined) {
    const scarto = abs(sub(from(doc.totaleDichiarato), computed.totale));
    if (cmp(scarto, from("0.01")) > 0) {
      problems.push(_problem("totale", "vTotalMismatch", "vTotalMismatchFix",
        { atteso: toString(computed.totale, MONEY) }));
    }
  }
  return computed;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Everything wrong with a document, as a list.
 *
 * A list and not the first problem: somebody fixing an invoice wants to see all of it at once, and
 * a validator that reveals one error per attempt turns a two-minute correction into six rounds.
 */
// Il profilo si deduce da chi emette, come in `build`: le due strade devono guardare lo stesso
// tracciato, o il controllo direbbe di sì a un file che il portale rifiuta.
export function validate(doc, {
  company, party, profile = profileFor(company), richiedeNumero = true,
} = {}) {
  const problems = [];

  // **How much of what follows applies depends on whether this document becomes a file.** A quote
  // and a delivery note stay here, so the rules that exist because the SdI enforces them do not
  // apply to them — and applying them anyway would be the worse mistake of the two: it would make
  // the app refuse to number a quote for a customer whose CAP nobody has asked for yet.
  const fiscale = kind(doc).fiscale;

  if (!TIPI.includes(doc.tipo || "TD01")) {
    problems.push(_problem("tipo", "vTypeUnknown", "vTypeUnknownFix",
      { valore: doc.tipo, elenco: TIPI_FISCALI.join(", ") }));
  }
  if (!DATE.test(String(doc.data || ""))) {
    problems.push(_problem("data", "vDateShape", "vDateFix", { esempio: "2026-09-03" }));
  }
  // The number is checked when a file is about to leave, and not when a document is about to be
  // issued — because issuing is what assigns it. Asking for it in both places was the first
  // version, and it made `issue` unable to ever succeed: a draft has no number by design, so the
  // one path that hands numbers out was refusing every document for not having one.
  if (richiedeNumero) {
    _text(problems, doc.numero, "numero", MAX.numero, "vNumberOnIssueFix");
  } else if (doc.numero && String(doc.numero).length > MAX.numero) {
    problems.push(_problem("numero", "vTooLong", "vNumberTooLongFix",
      { max: MAX.numero, lunghezza: String(doc.numero).length }));
  }
  if (doc.causale && String(doc.causale).length > MAX.causale) {
    problems.push(_problem("causale", "vTooLong", "vCausaleTooLongFix",
      { max: MAX.causale, lunghezza: String(doc.causale).length }));
  }

  _party(problems, company, "azienda", { richiedeIdentificativo: fiscale, richiedeSede: fiscale });
  _party(problems, party, "cliente", { richiedeIdentificativo: fiscale, richiedeSede: fiscale });

  if (fiscale && company && !REGIMI.includes(company.regimeFiscale || "RF01")) {
    problems.push(_problem("azienda.regimeFiscale", "vOutsideSubset", "vRegimeFix",
      { valore: company.regimeFiscale, elenco: REGIMI.join(" e ") }));
  }

  if (fiscale && party) {
    const codice = destinatario(party, profile);
    if (!DESTINATARIO.test(codice)) {
      problems.push(_problem("cliente.codiceDestinatario", "vDestinatarioSeven", "vDestinatarioFix"));
    }
  }

  _righe(problems, doc, profile);

  // A credit note that does not say what it reverses is a document nobody can reconcile — and the
  // schema wants the link too.
  if (doc.tipo === "TD04" && !(doc.fattureCollegate || []).length) {
    problems.push(_problem("fattureCollegate", "vCreditNoteLink", "vCreditNoteLinkFix"));
  }

  // A quote with no expiry date is a price you have promised for ever. It is the field a customer
  // looks for, and the one nobody remembers to fill in, so it is asked for rather than assumed.
  if (doc.tipo === "preventivo") {
    if (!DATE.test(String(doc.validoFino || ""))) {
      problems.push(_problem("validoFino", "vQuoteValidity", "vQuoteValidityFix"));
    } else if (doc.data && doc.validoFino < doc.data) {
      problems.push(_problem("validoFino", "vValidityBefore", "vValidityBeforeFix"));
    }
  }

  // The reason for the movement is what makes a delivery note a delivery note: it is what says
  // whether the goods were sold, lent, or returned, and it is the first thing anybody reads on one.
  if (doc.tipo === "ddt") {
    _text(problems, doc.trasporto && doc.trasporto.causale, "trasporto.causale", MAX.causale,
      "vTransportReasonFix");
  }

  if (doc.ritenuta && !RITENUTE.includes(doc.ritenuta.tipo || "RT01")) {
    problems.push(_problem("ritenuta.tipo", "vOutsideSubset", "vRitenutaFix",
      { valore: doc.ritenuta.tipo, elenco: RITENUTE.join(", ") }));
  }

  if (doc.pagamento) {
    if (!CONDIZIONI.includes(doc.pagamento.condizioni || "TP02")) {
      problems.push(_problem("pagamento.condizioni", "vOutsideSubset", "vCondizioniFix",
        { valore: doc.pagamento.condizioni, elenco: CONDIZIONI.join(", ") }));
    }
    const modalita = doc.pagamento.modalita || "MP05";
    if (!MODALITA.includes(modalita)) {
      problems.push(_problem("pagamento.modalita", "vOutsideSubset", "vModalitaFix",
        { valore: modalita, elenco: MODALITA.join(", ") }));
    }
    const iban = doc.pagamento.iban;
    if (iban && !IBAN.test(String(iban).replace(/\s/g, "").toUpperCase())) {
      problems.push(_problem("pagamento.iban", "vIbanShape", "vIbanFix"));
    }
    for (const [i, quota] of (doc.pagamento.rate || []).entries()) {
      if (quota.scadenza && !DATE.test(String(quota.scadenza))) {
        problems.push(_problem(`pagamento.rate[${i + 1}].scadenza`, "vDateShape", "vDateFix",
          { esempio: "2026-10-03" }));
      }
    }

    // **The instalments have to add up to the total.** Nothing checked it, and a sample of ours
    // asked for eighty cents more than the invoice was for — which is the kind of error that is
    // not rejected by anybody and is instead argued about with the customer.
    //
    // Only when every instalment carries its own amount: where one is left blank the app works out
    // the remainder itself, and there is nothing to disagree with.
    const rate_ = doc.pagamento.rate || [];
    if (rate_.length && rate_.every((quota) => quota.importo !== undefined)) {
      try {
        const somma = rate_.reduce((total, quota) => add(total, from(quota.importo)), from("0"));
        const atteso = totals(doc).totale;
        if (cmp(abs(sub(somma, atteso)), from("0.01")) > 0) {
          problems.push(_problem("pagamento.rate", "vInstalmentsSum", "vInstalmentsSumFix",
            { somma: toString(somma, MONEY), atteso: toString(atteso, MONEY) }));
        }
      } catch (ignored) {
        // A malformed amount is reported by its own check; this one has nothing to add.
      }
    }
  }

  _totali(problems, doc, profile);

  return problems;
}

/**
 * Whether a document may leave. The one question the export button asks.
 *
 * A quote or a delivery note never can, however complete it is: there is no file for it to become.
 * That is a different answer from "it has problems", and it is given here rather than by an empty
 * list of problems that would read as a yes.
 */
export function esportabile(doc, context) {
  if (!kind(doc).fiscale) return false;
  return validate(doc, context).length === 0;
}
