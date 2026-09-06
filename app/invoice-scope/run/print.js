// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The printed sheet: what the customer holds in their hand.
//
// **A second rendering, built from the same numbers.** The first version printed the screen with a
// print stylesheet, on the argument that two renderings of one document will disagree. They would,
// if each did its own arithmetic — so this one does none: every figure here comes out of
// `totals.js` and `format.js` exactly as the screen's do, and what differs is only where things
// sit on the page. A screen is a form; a sheet is a letter. The customer of a quote never sees the
// form, and the form printed was a form: labels in grey over boxes with nothing drawn around them,
// a payment section of four menus, the state control at the top.
//
// **The shape is the one people already know.** The default template of the invoicing services in
// use here — Fatture in Cloud's above all, since that is where these accounts come from — reads the
// same way: the issuer top left, the document's name, number and date top right, the recipient in
// a box, the lines, the VAT summary on the left with the totals on the right, the payment terms,
// a note at the foot. A customer who receives ten invoices a month reads this one without looking
// for anything.
//
// Built into `#printSheet`, which the screen never shows and the print stylesheet shows alone.
// Rebuilt on every open and again just before printing, so a draft prints as it is at that moment.

import { LOGO as BRAND_LOGO } from "./brand.js";
import { t } from "./i18n.js";
import { money, amount, rate as shownRate, date as shownDate } from "./format.js";
import { from, ZERO, cmp, add, sub } from "./decimal.js";
import { rate as splitRate } from "./totals.js";
import { kind, numero as shownNumber } from "./kinds.js";
import { profileFor, riferimentoNormativo } from "./fatturapa.js";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

/** An element with a class and text. Text through `textContent`: every string here is somebody's data. */
function _node(tag, classe, text) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/** `label: value` on one line, skipped when the value is empty. */
function _pair(parent, label, value) {
  if (!value) return;
  const line = _node("div", "ps-pair");
  line.append(_node("span", "ps-label", label), _node("span", "ps-value", value));
  parent.append(line);
}

/** The lines of an address block: name, street, town, identifiers. */
function _address(record, { fiscalLabel }) {
  if (!record) return [];
  const sede = record.sede || {};
  const via = [sede.indirizzo, sede.numeroCivico].filter(Boolean).join(" ");
  const citta = [sede.cap, sede.comune, sede.provincia && `(${sede.provincia})`].filter(Boolean).join(" ");
  // The country by name, and only when it is not Italy: an Italian invoice does not say «Italia»,
  // and a San Marino one says «San Marino», not «SM» twice over.
  const codice = String(record.paese || "IT").toUpperCase();
  const nome = t(`paese${codice}`);
  const paese = codice !== "IT" ? (nome === `paese${codice}` ? codice : nome) : "";
  const righe = [via, [citta, paese].filter(Boolean).join(" · ")];
  if (record.partitaIva) righe.push(`${fiscalLabel} ${record.partitaIva}`);
  if (record.codiceFiscale && record.codiceFiscale !== record.partitaIva) {
    righe.push(`${t("f_codiceFiscale")} ${record.codiceFiscale}`);
  }
  return righe.filter(Boolean);
}

/** A quantity or unit price as text, trailing zeros trimmed. */
function _qty(value) {
  try {
    return amount(from(value || "0"), 8).replace(/([.,]\d*?)0+$/, "$1").replace(/[.,]$/, "");
  } catch (ignored) {
    return String(value || "");
  }
}

function _price(value) {
  try {
    return amount(from(value || "0"), 8);
  } catch (ignored) {
    return String(value || "");
  }
}

/** A line's discount, as the sheet says it: «10%» or an amount. */
function _sconto(line) {
  if (!line.sconto) return "";
  if (line.sconto.percentuale !== undefined && line.sconto.percentuale !== "") return shownRate(line.sconto.percentuale);
  if (line.sconto.importo !== undefined && line.sconto.importo !== "") return money(from(line.sconto.importo));
  return "";
}

/** The VAT cell of a line: the rate, or the nature when the rate is zero. */
function _iva(line) {
  if (String(line.aliquota) === "0" && line.natura) return line.natura;
  return shownRate(line.aliquota);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Draw the sheet for a document.
 *
 * `computed` is what `totals()` returned for it — passed in and not recomputed, so the sheet and
 * the screen cannot show two different totals for the same lines. `draft` marks a document that has
 * no number yet.
 */
export function render(doc, { company, party, computed, draft = false }) {
  const sheet = el("printSheet");
  sheet.textContent = "";
  const profile = kind(doc);
  const fileProfile = profileFor(company || {});
  const fiscalLabel = (record) => (record && record.paese === "SM" ? t("printCoe") : t("printPiva"));

  // ---- head: issuer left, document right
  const head = _node("header", "ps-head");
  const issuer = _node("div", "ps-issuer");
  // The company's own logo, or the default one while the record has never had a `logo` key — the
  // same rule as the company screen. A data URL either way, never a file fetched from anywhere.
  // `alt` is empty because the name is written in full on the next line.
  const logoSrc = "logo" in (company || {}) ? company.logo : BRAND_LOGO;
  if (logoSrc) {
    const img = _node("img", "ps-logo");
    img.src = logoSrc;
    img.alt = "";
    issuer.append(img);
  }
  issuer.append(_node("div", "ps-issuer-name", (company || {}).denominazione || ""));
  for (const line of _address(company, { fiscalLabel: fiscalLabel(company) })) {
    issuer.append(_node("div", "ps-issuer-line", line));
  }
  const recapiti = [(company || {}).email, (company || {}).telefono, (company || {}).sito]
    .map((v) => String(v || "").trim()).filter(Boolean).join(" · ");
  if (recapiti) issuer.append(_node("div", "ps-issuer-line ps-contacts", recapiti));
  const title = _node("div", "ps-title");
  title.append(_node("div", "ps-kind", t(profile.label)));
  if (draft) title.append(_node("div", "ps-draft", t("printDraft")));
  const meta = _node("div", "ps-meta");
  _pair(meta, t("printNumber"), draft ? "—" : shownNumber(doc));
  _pair(meta, t("printDate"), shownDate(doc.data));
  if (doc.validoFino) _pair(meta, t("f_validoFino"), shownDate(doc.validoFino));
  title.append(meta);
  head.append(issuer, title);
  sheet.append(head);

  // ---- recipient
  const to = _node("section", "ps-to");
  to.append(_node("div", "ps-section-label", t("printTo")));
  if (party) {
    to.append(_node("div", "ps-to-name", party.denominazione || ""));
    for (const line of _address(party, { fiscalLabel: fiscalLabel(party) })) to.append(_node("div", "ps-to-line", line));
    const recapito = [party.codiceDestinatario && `${t("f_codiceDestinatario")} ${party.codiceDestinatario}`,
      party.pec && `${t("f_pec")} ${party.pec}`].filter(Boolean).join(" · ");
    if (recapito) to.append(_node("div", "ps-to-line ps-muted", recapito));
  } else {
    to.append(_node("div", "ps-to-name ps-muted", "—"));
  }
  sheet.append(to);

  // ---- subject, and a credit note's reference
  if (doc.causale) {
    const causale = _node("section", "ps-subject");
    causale.append(_node("span", "ps-section-label", t("f_causale")), _node("span", null, doc.causale));
    sheet.append(causale);
  }
  const collegate = doc.fattureCollegate || [];
  if (collegate.length) {
    const nota = _node("section", "ps-subject");
    nota.append(_node("span", "ps-section-label", t("printLinked")),
      _node("span", null, collegate.map((ref) => `${ref.numero}${ref.data ? ` (${shownDate(ref.data)})` : ""}`).join(", ")));
    sheet.append(nota);
  }

  // ---- transport, on a delivery note
  if (doc.trasporto && profile.sezioni.includes("trasporto")) {
    const tr = doc.trasporto;
    const box = _node("section", "ps-transport");
    box.append(_node("div", "ps-section-label", t("trasportoTitle")));
    const grid = _node("div", "ps-grid");
    _pair(grid, t("f_causaleTrasporto"), tr.causale);
    _pair(grid, t("f_aspetto"), tr.aspetto);
    _pair(grid, t("f_colli"), tr.colli);
    _pair(grid, t("f_porto"), tr.porto ? t(`porto${tr.porto[0].toUpperCase()}${tr.porto.slice(1)}`) : "");
    _pair(grid, t("f_vettore"), tr.vettore);
    box.append(grid);
    sheet.append(box);
  }

  // ---- lines
  const showsSconto = computed.righe.some((line) => line.sconto);
  const table = _node("table", "ps-lines");
  const thead = _node("thead");
  const hr = _node("tr");
  for (const [text, classe] of [
    [t("f_descrizione"), "ps-desc"], [t("hQuantita"), "ps-num"], [t("hUnita"), ""],
    [t("hPrezzo"), "ps-num"], ...(showsSconto ? [[t("printDiscount"), "ps-num"]] : []),
    [t("hIva"), "ps-num"], [t("printAmount"), "ps-num"],
  ]) {
    hr.append(_node("th", classe, text));
  }
  thead.append(hr);
  const tbody = _node("tbody");
  for (const line of computed.righe) {
    const row = _node("tr");
    row.append(
      _node("td", "ps-desc", line.descrizione || ""),
      _node("td", "ps-num", _qty(line.quantita)),
      _node("td", "", line.unitaMisura || ""),
      _node("td", "ps-num", _price(line.prezzoUnitario)),
      ...(showsSconto ? [_node("td", "ps-num", _sconto(line))] : []),
      _node("td", "ps-num", _iva(line)),
      _node("td", "ps-num", amount(line.prezzoTotale)),
    );
    tbody.append(row);
  }
  table.append(thead, tbody);
  sheet.append(table);

  // ---- summary left, totals right (a delivery note has neither)
  if (doc.tipo !== "ddt") {
    const bottom = _node("section", "ps-bottom");

    const vat = _node("div", "ps-vat");
    vat.append(_node("div", "ps-section-label", t("docSummary")));
    const vtable = _node("table", "ps-vat-table");
    const vhead = _node("tr");
    for (const [text, classe] of [[t("f_aliquota"), ""], [t("docImponibile"), "ps-num"], [t("docImposta"), "ps-num"]]) {
      vhead.append(_node("th", classe, text));
    }
    vtable.append(vhead);
    const note = [];
    for (const r of computed.riepiloghi) {
      const row = _node("tr");
      row.append(
        _node("td", "", r.natura ? `${shownRate(r.aliquota)} · ${r.natura}` : shownRate(r.aliquota)),
        _node("td", "ps-num", amount(r.imponibile)),
        _node("td", "ps-num", amount(r.imposta)),
      );
      vtable.append(row);
      // The legal reference of every untaxed summary, as the XML carries it — TM code in front for
      // a San Marino issuer, because the tax office reads it there and the customer may as well.
      const norma = riferimentoNormativo(r, fileProfile);
      if (norma) note.push(`${r.natura}: ${norma}`);
    }
    vat.append(vtable);
    for (const line of note) vat.append(_node("div", "ps-vat-note", line));
    bottom.append(vat);

    const totals = _node("div", "ps-totals");
    // A document discount is already inside the lines — `totals.js` shares it out across them, so
    // the imponibile is net. Listed *before* the imponibile, from the gross, or the same 330 €
    // would appear taken off twice: once in the lines, once under them.
    const rows = [];
    const sconto = computed.scontoDocumento || ZERO;
    if (cmp(sconto, ZERO) > 0) {
      const pct = (doc.scontoDocumento || {}).percentuale;
      rows.push([t("printGrossLines"), amount(add(computed.imponibile, sconto))]);
      rows.push([pct ? `${t("printDocDiscount")} ${shownRate(pct)}` : t("printDocDiscount"), `-${amount(sconto)}`]);
    }
    rows.push([t("docImponibile"), amount(computed.imponibile)]);
    rows.push([t("docImposta"), amount(computed.imposta)]);
    if (computed.bollo && cmp(computed.bollo, ZERO) > 0) rows.push([t("printStamp"), amount(computed.bollo)]);
    if (computed.ritenuta && cmp(computed.ritenuta, ZERO) > 0) {
      rows.push([t("printGross"), amount(add(add(computed.imponibile, computed.imposta), computed.bollo))]);
      rows.push([t("ritTitle"), `-${amount(computed.ritenuta)}`]);
    }
    for (const [label, value] of rows) {
      const line = _node("div", "ps-total-line");
      line.append(_node("span", null, label), _node("span", "ps-num", value));
      totals.append(line);
    }
    const grand = _node("div", "ps-total-line ps-grand");
    grand.append(_node("span", null, t(profile.deve ? "printToPay" : "docTotale")), _node("span", "ps-num", money(computed.totale)));
    totals.append(grand);
    bottom.append(totals);
    sheet.append(bottom);
  }

  // ---- payment
  const pag = doc.pagamento;
  if (pag && profile.sezioni.includes("pagamento")) {
    const pay = _node("section", "ps-pay");
    pay.append(_node("div", "ps-section-label", t("payTitle")));
    const line = [t(`pay${pag.modalita || "MP05"}`), t(`pay${pag.condizioni || "TP02"}`).toLowerCase()]
      .filter(Boolean).join(" · ");
    pay.append(_node("div", "ps-pay-line", line));
    if (pag.iban) pay.append(_node("div", "ps-pay-line", `IBAN ${pag.iban}`));
    const rate = (pag.rate || []).filter((quota) => quota.scadenza || quota.importo !== undefined);
    if (rate.length) {
      // The same split the XML gets: an instalment with no amount is a share of what the others
      // leave, not the whole total. Two undated instalments used to print as the full amount twice.
      const dichiarati = rate.filter((q) => q.importo !== undefined && q.importo !== "");
      const mancanti = rate.length - dichiarati.length;
      const resto = sub(computed.totale, dichiarati.reduce((sum, q) => add(sum, from(q.importo)), ZERO));
      const quote = mancanti > 0 ? splitRate(resto, mancanti) : [];
      let next = 0;
      const dtable = _node("table", "ps-due");
      const dh = _node("tr");
      dh.append(_node("th", "", t("f_scadenza")), _node("th", "ps-num", t("printAmount")));
      dtable.append(dh);
      for (const quota of rate) {
        const importo = quota.importo !== undefined && quota.importo !== "" ? from(quota.importo) : quote[next++];
        const row = _node("tr");
        row.append(
          _node("td", "", quota.scadenza ? shownDate(quota.scadenza) : "—"),
          _node("td", "ps-num", money(importo)),
        );
        dtable.append(row);
      }
      pay.append(dtable);
    } else if (profile.deve) {
      pay.append(_node("div", "ps-pay-line ps-muted", t("payNoDue")));
    }
    sheet.append(pay);
  }

  // ---- foot
  const foot = _node("footer", "ps-foot");
  foot.append(_node("div", null, el("screenDoc").dataset.printFooter || ""));
  sheet.append(foot);
}
