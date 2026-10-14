// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// A FatturaPA file in, documents out. The other direction of `fatturapa.js`.
//
// This is the one import that gives back **whole documents** — lines, rates, instalments, the
// customer — because it reads the file the invoice actually was. The spreadsheet exports give a
// register of totals; the XML in an account backup gives the invoice.
//
// Three things about the format decide the shape of this file:
//
//  - **one file may hold several invoices.** `FatturaElettronicaBody` repeats: one header, one
//    sender, and a body per document, which is how a lotto is sent. So `read` returns a list, and a
//    caller that takes `[0]` and stops silently drops the rest.
//  - **the totals are in the file and are not read back.** Every amount is recomputed from the lines
//    by `totals.js`, and what the file says is compared against it rather than trusted. An invoice
//    whose stated total disagrees with its own lines is a fact worth reporting — it is either a
//    rounding difference we would reproduce anyway, or a file that has been edited by hand.
//  - **what it says about VAT belongs to the line.** `DatiRiepilogo` is a summary the emitter builds
//    from the lines, so reading it back would be reading our own arithmetic in; `Natura` and the
//    Ufficio Tributario's `TM` are read from `DettaglioLinee`, where they are stated once per line.
//
// **What is deliberately not read.** The signature, the attachments, the relatives of
// `DatiOrdineAcquisto` (contract, agreement, receipt, SAL) and the whole `DatiVeicoli` branch: none
// of them has a field in this app, and a
// reader that half-fills a structure is worse than one that says it left it alone. They are counted
// and named in `avvisi`, so an invoice that carries them says so instead of arriving quietly
// diminished.
//
// No DOM: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/reading.mjs`.

import * as x from "./xmlread.js";
import { KINDS } from "./kinds.js";
import { from, add, sub, percent, cmp, toString } from "./decimal.js";
import { totals } from "./totals.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

// Branches of the body this app has no field for. Named so that an invoice carrying one is reported
// rather than silently thinned out.
const NON_LETTI = [
  ["DatiContratto", "readContract"],
  ["DatiConvenzione", "readConvention"],
  ["DatiRicezione", "readReceipt"],
  ["DatiSAL", "readSal"],
  ["DatiVeicoli", "readVehicles"],
  ["Allegati", "readAttachment"],
];

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** A number as the tracciato writes it, kept as text. `undefined` when the element is absent. */
function _num(node, ...path) {
  const raw = x.value(node, ...path);
  return raw === null || raw === "" ? undefined : raw;
}

/**
 * A party — the customer, or the supplier when reading somebody else's invoice.
 *
 * A person is `Nome` and `Cognome`, a company is `Denominazione`, and the schema allows exactly one
 * of the two. Joined here because everything downstream holds a single name: it is the form an
 * invoice prints, and splitting it again would need a rule about where the surname starts.
 */
function _party(node) {
  const anagrafica = x.child(node, "DatiAnagrafici", "Anagrafica");
  const nome = [x.value(anagrafica, "Nome"), x.value(anagrafica, "Cognome")]
    .filter(Boolean).join(" ");
  const sede = x.child(node, "Sede");
  return {
    denominazione: x.value(anagrafica, "Denominazione") || nome || "",
    partitaIva: x.value(node, "DatiAnagrafici", "IdFiscaleIVA", "IdCodice") || "",
    codiceFiscale: x.value(node, "DatiAnagrafici", "CodiceFiscale") || "",
    pec: "",
    codiceDestinatario: "",
    // The country of the address, and the VAT number's country as the fallback. `Nazione` under
    // `Sede` is required by the schema, so the fallback is for files that are already wrong — and
    // those exist, which is the reason it is here rather than a bare `|| "IT"`.
    paese: (x.value(sede, "Nazione")
      || x.value(node, "DatiAnagrafici", "IdFiscaleIVA", "IdPaese")
      || "IT").toUpperCase(),
    indirizzo: x.value(sede, "Indirizzo") || "",
    numeroCivico: x.value(sede, "NumeroCivico") || "",
    cap: x.value(sede, "CAP") || "",
    comune: x.value(sede, "Comune") || "",
    provincia: (x.value(sede, "Provincia") || "").toUpperCase(),
  };
}

/** A decimal from the file, or `null` when it is absent or unreadable. */
function _dec(value) {
  if (value === undefined || value === null || value === "") return null;
  try {
    return from(value);
  } catch (ignored) {
    return null;
  }
}

/**
 * The discounts and surcharges of a line, as the one discount the app's line holds.
 *
 * **All of them, in order, and the amount before the percentage.** Only the first element used to
 * be read, so a chain of 10% and then 5% lost the second; a surcharge (MG) vanished without a
 * word; and with both a percentage and an amount the percentage won, while control 00423 — and
 * `totals.js` — say the amount counts. One element of SC is kept as it is written; anything more is
 * folded into a single amount per unit, applied in the file's order on the running price, which is
 * how the SdI recomputes PrezzoTotale.
 */
function _discounts(node, prezzo) {
  const nodes = x.all(node, "ScontoMaggiorazione")
    .filter((one) => ["SC", "MG"].includes(x.value(one, "Tipo")));
  if (!nodes.length) return null;
  if (nodes.length === 1 && x.value(nodes[0], "Tipo") === "SC") {
    const importo = _num(nodes[0], "Importo");
    const percentuale = _num(nodes[0], "Percentuale");
    if (importo !== undefined) return { importo };
    if (percentuale !== undefined) return { percentuale };
    return null;
  }
  const base = _dec(prezzo);
  if (base === null) return null;
  let corrente = base;
  for (const one of nodes) {
    const importo = _dec(_num(one, "Importo"));
    const percentuale = _dec(_num(one, "Percentuale"));
    const delta = importo !== null ? importo : (percentuale !== null ? percent(corrente, percentuale, 8) : null);
    if (delta === null) continue;
    corrente = x.value(one, "Tipo") === "SC" ? sub(corrente, delta) : add(corrente, delta);
  }
  return { importo: toString(sub(base, corrente), 8).replace(/(\.\d{2}\d*?)0+$/, "$1") };
}

/**
 * The professional pension contribution (`DatiCassaPrevidenziale`) as lines of the document.
 *
 * It is taxable like a fee and has its own rate, so it belongs in the VAT summary: left out, an
 * invoice of 1000 + 4% contribution came in at 1000 of taxable amount and 220 of VAT, instead of
 * 1040 and 228,80. One line per element, at the rate and nature the file gives it.
 */
function _cassa(generali) {
  return x.all(generali, "DatiCassaPrevidenziale").map((node) => {
    const tipo = x.value(node, "TipoCassa") || "";
    const aliquotaCassa = x.value(node, "AlCassa") || "";
    const line = {
      descrizione: `Contributo cassa previdenziale${tipo ? ` ${tipo}` : ""}${aliquotaCassa ? ` ${aliquotaCassa}%` : ""}`,
      quantita: "1",
      unitaMisura: "",
      prezzoUnitario: _num(node, "ImportoContributoCassa") || "0",
      aliquota: _num(node, "AliquotaIVA") || "0",
    };
    const natura = x.value(node, "Natura");
    if (natura) line.natura = natura;
    return line;
  });
}

/** One `DettaglioLinee` as a line of ours. */
function _line(node) {
  const line = {
    descrizione: x.value(node, "Descrizione") || "",
    quantita: _num(node, "Quantita") || "1",
    unitaMisura: x.value(node, "UnitaMisura") || "",
    prezzoUnitario: _num(node, "PrezzoUnitario") || "0",
    aliquota: _num(node, "AliquotaIVA") || "0",
  };

  const natura = x.value(node, "Natura");
  if (natura) line.natura = natura;

  // A discount and a surcharge share one element and are told apart by `Tipo`: `_discounts` adds a
  // surcharge to the price rather than reading it as a discount with the sign flipped.
  const sconto = _discounts(node, line.prezzoUnitario);
  if (sconto) line.sconto = sconto;

  // The Ufficio Tributario's code, where San Marino puts it. Read by `TipoDato` and not by position:
  // `AltriDatiGestionali` repeats, and TM is not always the first one.
  for (const dato of x.all(node, "AltriDatiGestionali")) {
    if (x.value(dato, "TipoDato") === "TM") line.tm = x.value(dato, "RiferimentoTesto") || "";
  }

  return line;
}

/** `DatiPagamento` as our `pagamento`, or `null`. */
function _pagamento(body) {
  const nodes = x.all(body, "DatiPagamento");
  if (!nodes.length) return null;
  const rate = [];
  for (const node of nodes) {
    for (const dettaglio of x.all(node, "DettaglioPagamento")) {
      rate.push({
        scadenza: x.value(dettaglio, "DataScadenzaPagamento") || undefined,
        importo: _num(dettaglio, "ImportoPagamento"),
        modalita: x.value(dettaglio, "ModalitaPagamento") || undefined,
        iban: x.value(dettaglio, "IBAN") || undefined,
      });
    }
  }
  if (!rate.length) return null;
  return {
    condizioni: x.value(nodes[0], "CondizioniPagamento") || undefined,
    modalita: rate[0].modalita,
    rate,
  };
}

/**
 * The exigibility the summaries declare, as the document's: `S`, `D`, or `undefined` for immediate.
 *
 * **Read, because it changes what is owed.** Under split payment the customer pays the VAT to the
 * Treasury: an invoice to a public administration reimported from a backup, read as immediate,
 * expected 1220 from a customer who will pay 1000. A summary with no tax says nothing either way.
 */
function _esigibilita(beni) {
  const dichiarate = x.all(beni, "DatiRiepilogo")
    .filter((r) => !x.value(r, "Natura"))
    .map((r) => x.value(r, "EsigibilitaIVA"));
  if (dichiarate.includes("S")) return "S";
  if (dichiarate.includes("D")) return "D";
  return undefined;
}

/** The first `DatiOrdineAcquisto` as our `ordine`, or `null`. The others are reported, not read. */
function _ordine(generali) {
  const nodes = x.all(generali, "DatiOrdineAcquisto");
  if (!nodes.length) return null;
  const node = nodes[0];
  return {
    numero: x.value(node, "IdDocumento") || null,
    data: x.value(node, "Data") || null,
    cig: x.value(node, "CodiceCIG") || null,
    cup: x.value(node, "CodiceCUP") || null,
  };
}

/** Whether the stated total includes the stamp duty: it does unless it matches the lines without it. */
function _bolloAddebitato(doc, dichiarato) {
  const stated = _dec(dichiarato);
  if (stated === null) return true;
  let computed;
  try {
    computed = totals({ righe: doc.righe, ritenuta: doc.ritenuta });
  } catch (ignored) {
    return true;
  }
  const senza = add(computed.imponibile, computed.imposta);
  return !(cmp(stated, senza) === 0 || cmp(stated, sub(senza, computed.ritenuta)) === 0);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Every document in one FatturaPA file.
 *
 * Returns `{ versione, progressivo, mittente, documenti }`, where each entry of `documenti` is
 * `{ doc, cliente, dichiarato, avvisi }`: a document in the shape `draft()` takes, the customer as
 * `saveParty` takes it, the total the file states, and what could not be carried across.
 *
 * Throws `SyntaxError` when the XML is malformed and `Error("readNotFattura")` when it parses but is
 * some other document. The two are different events for whoever is importing a folder: the first is
 * a broken file, the second is a file that was never an invoice.
 */
export function read(source) {
  const root = x.parse(source);                         // SyntaxError travels up on its own
  if (root.name !== "FatturaElettronica") throw new Error("readNotFattura");

  const header = x.child(root, "FatturaElettronicaHeader");
  const trasmissione = x.child(header, "DatiTrasmissione");
  const documenti = [];

  for (const body of x.all(root, "FatturaElettronicaBody")) {
    const generali = x.child(body, "DatiGenerali", "DatiGeneraliDocumento");
    const beni = x.child(body, "DatiBeniServizi");
    const avvisi = [];

    const tipo = x.value(generali, "TipoDocumento") || "TD01";
    if (!KINDS[tipo]) avvisi.push({ chiave: "readKind", valore: tipo });

    const doc = {
      // An unknown type becomes an invoice **and says so**. Keeping the original code would leave
      // `kind()` to fall back to TD01 anyway, one layer further down and without telling anybody.
      tipo: KINDS[tipo] ? tipo : "TD01",
      stato: "inviato",
      data: x.value(generali, "Data") || "",
      numero: x.value(generali, "Numero") || "",
      serie: "",
      divisa: x.value(generali, "Divisa") || "EUR",
      causale: x.value(generali, "Causale") || undefined,
      righe: [...x.all(beni, "DettaglioLinee").map(_line), ..._cassa(generali)],
      esportato: true,
    };

    const ritenuta = x.child(generali, "DatiRitenuta");
    if (ritenuta) {
      doc.ritenuta = {
        tipo: x.value(ritenuta, "TipoRitenuta") || "RT01",
        aliquota: _num(ritenuta, "AliquotaRitenuta") || "0",
        causale: x.value(ritenuta, "CausalePagamento") || "A",
      };
      // **Which lines carry it is in the file, line by line** (`<Ritenuta>SI</Ritenuta>`), and the
      // app has the same flag now: read, instead of guessing «all but N1». The contribution lines
      // follow their own element in DatiCassaPrevidenziale.
      const linee = x.all(beni, "DettaglioLinee");
      const casse = x.all(generali, "DatiCassaPrevidenziale");
      doc.righe.forEach((line, i) => {
        const node = i < linee.length ? linee[i] : casse[i - linee.length];
        line.soggettaRitenuta = x.value(node, "Ritenuta") === "SI";
      });
    }

    const esigibilita = _esigibilita(beni);
    if (esigibilita) doc.esigibilita = esigibilita;

    const ordine = _ordine(x.child(body, "DatiGenerali"));
    if (ordine) doc.ordine = ordine;
    const altriOrdini = x.all(x.child(body, "DatiGenerali"), "DatiOrdineAcquisto").length - 1;
    if (altriOrdini > 0) avvisi.push({ chiave: "readOrder", valore: String(altriOrdini) });
    // **DatiBollo says the duty is due, not that the customer pays it.** The issuer declares it in
    // both cases (and this app now does too). Charged on, it is inside ImportoTotaleDocumento; kept
    // by the issuer, it is not — so the stated total decides, and without one the old reading
    // (charged) stays.
    if (x.child(generali, "DatiBollo") && _bolloAddebitato(doc, _num(generali, "ImportoTotaleDocumento"))) {
      doc.bollo = { importo: _num(generali, "DatiBollo", "ImportoBollo") };
    }

    const collegate = x.all(x.child(body, "DatiGenerali"), "DatiFattureCollegate")
      .map((ref) => ({ numero: x.value(ref, "IdDocumento") || "", data: x.value(ref, "Data") || "" }));
    if (collegate.length) doc.fattureCollegate = collegate;

    const ddt = x.all(x.child(body, "DatiGenerali"), "DatiDDT").map((ref) => ({
      numero: x.value(ref, "NumeroDDT") || "",
      data: x.value(ref, "DataDDT") || "",
      righe: x.all(ref, "RiferimentoNumeroLinea").map((n) => Number(n.text.trim())),
    }));
    if (ddt.length) doc.ddt = ddt;

    const pagamento = _pagamento(body);
    if (pagamento) doc.pagamento = pagamento;

    for (const [name, chiave] of NON_LETTI) {
      const quanti = x.all(x.child(body, "DatiGenerali"), name).length
        + x.all(beni, name).length
        + x.all(body, name).length;
      if (quanti) avvisi.push({ chiave, valore: String(quanti) });
    }
    if (!doc.righe.length) avvisi.push({ chiave: "readNoLines" });

    // The customer, with what the header says about where the file went: the recipient code (the
    // office code, for a PA) and the PEC are the customer's, and an FPA12 is a public administration.
    const cliente = _party(x.child(header, "CessionarioCommittente"));
    const codice = x.value(trasmissione, "CodiceDestinatario") || "";
    if (codice && !/^0+$/.test(codice) && codice !== "XXXXXXX") cliente.codiceDestinatario = codice;
    cliente.pec = x.value(trasmissione, "PECDestinatario") || "";
    if (root.attrs.versione === "FPA12" && cliente.paese === "IT") {
      cliente.pa = true;
      if (esigibilita === "S") cliente.splitPayment = true;
    }

    documenti.push({
      doc,
      cliente,
      // What the file says the total is. Kept apart from the document on purpose: the document's
      // total is what its lines add up to, and these two meeting is a check, not an assignment.
      dichiarato: _num(generali, "ImportoTotaleDocumento"),
      avvisi,
    });
  }

  if (!documenti.length) throw new Error("readNoBody");

  return {
    versione: root.attrs.versione || "",
    progressivo: x.value(trasmissione, "ProgressivoInvio") || "",
    mittente: _party(x.child(header, "CedentePrestatore")),
    documenti,
  };
}
