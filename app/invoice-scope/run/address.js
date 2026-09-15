// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A party as a document names it: where it is, and the identifier that makes it a taxable person.
//
// **It exists so that the sheet and the screen cannot disagree.** The block was already written
// twice — once for the printed sheet, once for the customer record — and the document screen
// would have been the third copy, which is the one that drifts: the day a field is added, two of
// the three show it and nobody notices which. The lines are built here, once, and every screen
// that names a party asks for them.
//
// **Strings in, strings out.** No DOM, no arithmetic, no formatting of numbers — so it is tested
// under Node like the rest of the core. What a record does not carry is not a gap to draw: the
// line is simply not there, and the separators go between what is.

import { t } from "./i18n.js";

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** «COE» for a San Marino party, «P. IVA» for anybody else. */
export function fiscalLabel(record) {
  return t(record && record.paese === "SM" ? "printCoe" : "printPiva");
}

/**
 * The country as a document writes it: by name, and only when it is not Italy.
 *
 * An Italian invoice does not say «Italia», and a San Marino one says «San Marino» rather than
 * «SM» twice over. A country the dictionary does not name keeps its code, which is what stands in
 * the file, instead of a missing key dressed up as a label.
 */
export function countryName(record) {
  const codice = String((record && record.paese) || "IT").toUpperCase();
  if (codice === "IT") return "";
  const nome = t(`paese${codice}`);
  return nome === `paese${codice}` ? codice : nome;
}

/**
 * The lines of an address block: street, town and country, then the identifiers.
 *
 * The fiscal code is written only when it differs from the VAT number, because for a company the
 * two are the same string and printing it twice reads as a mistake.
 */
export function addressLines(record) {
  if (!record) return [];
  const sede = record.sede || {};
  const etichetta = fiscalLabel(record);
  const via = [sede.indirizzo, sede.numeroCivico].filter(Boolean).join(" ");
  const citta = [sede.cap, sede.comune, sede.provincia && `(${sede.provincia})`].filter(Boolean).join(" ");
  const righe = [via, [citta, countryName(record)].filter(Boolean).join(" · ")];
  if (record.partitaIva) righe.push(`${etichetta} ${record.partitaIva}`);
  if (record.codiceFiscale && record.codiceFiscale !== record.partitaIva) {
    righe.push(`${t("f_codiceFiscale")} ${record.codiceFiscale}`);
  }
  return righe.filter(Boolean);
}

/** How the electronic document reaches them: the recipient code, the certified email, or both. */
export function deliveryLine(record) {
  if (!record) return "";
  return [
    record.codiceDestinatario && `${t("f_codiceDestinatario")} ${record.codiceDestinatario}`,
    record.pec && `${t("f_pec")} ${record.pec}`,
  ].filter(Boolean).join(" · ");
}
