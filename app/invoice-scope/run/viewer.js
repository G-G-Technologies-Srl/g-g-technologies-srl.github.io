// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// A supplier's invoice, read from its XML and shown as an invoice.
//
// **Why.** The file of record of an Italian invoice is XML, and an XML opened in a browser is code:
// the purchase card offered it as a download, which left the person with a file nobody could read
// without a viewer of their own (10 November 2026). The app already reads that file — the import
// does — and already lays out an invoice for paper — `print.js` does. This file joins the two.
//
// **Same sheet as the invoices the company issues, with the roles turned round**: the supplier
// stands where the company stands, the company where the customer stands. The figures come from
// `totals.js` like every other sheet, and what the file states is not trusted over its own lines.
//
// **In a tab of its own**, as a page: an invoice is read, printed, saved as PDF — things a tab does
// and a dialog does not. The page is built here, with the print stylesheet turned into a screen
// one, and handed to the browser as a Blob: nothing leaves the computer.
//
// The foot says what the page is: a readable copy, and the XML is the original.

import { t, tf } from "./i18n.js";
import { tell } from "./ask.js";
import { blobOf } from "./attachments.js";
import { read } from "./reading.js";
import { totals } from "./totals.js";
import { render as renderSheet } from "./print.js";
import { xmlText } from "./importing.js";
import { kind } from "./kinds.js";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

/** The text that is safe inside an HTML page: a supplier's name may contain anything. */
function _escape(text) {
  return String(text || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/**
 * The print stylesheet as a screen one: the rules out of `@media print`, without the two that hide
 * the app — there is no app in the new tab, only the sheet.
 */
function _screenCss(css) {
  const start = css.indexOf("@media print");
  if (start < 0) return css;
  const open = css.indexOf("{", start);
  const close = css.lastIndexOf("}");
  return css.slice(open + 1, close)
    // `*` is dropped when the browser writes the rule back out: «body > :not(#printSheet)».
    .replace(/body\s*>\s*\*?\s*:not\(#printSheet\)\s*\{[^}]*\}/g, "")
    .replace(/#printSheet\s*\{\s*display:[^}]*\}/, "");
}

/** One invoice of the file, laid out by `print.js` and taken back as markup. */
function _sheet(doc, mittente, cliente) {
  const pagamento = doc.pagamento
    ? { ...doc.pagamento, iban: doc.pagamento.iban || (doc.pagamento.rate || []).map((r) => r.iban).find(Boolean) }
    : undefined;
  const pronto = { ...doc, ...(pagamento ? { pagamento } : {}) };
  // `logo: null`: the supplier's sheet has no logo of ours, and without the key print.js would
  // put the company's own default one on it.
  renderSheet(pronto, { company: { ...mittente, logo: null }, party: cliente, computed: totals(pronto), draft: false });
  const page = el("printSheet");
  const foot = page.querySelector(".ps-foot");
  if (foot) foot.textContent = t("viewFoot");
  const html = page.innerHTML;
  page.textContent = "";
  return html;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Open the XML kept on a purchase as a readable invoice, in a new tab. Resolves `false` when it
 * cannot — the bytes are not in this browser, or the file is not an invoice — after saying why.
 */
export async function openReceived(db, record, { field = "documento" } = {}) {
  // The new tab is opened first, inside the click, and filled when the page is ready: opened after
  // an await, a browser takes it for a pop-up and blocks it.
  const tab = window.open("", "_blank");
  const blob = await blobOf(db, record, { field });
  if (!blob) {
    if (tab) tab.close();
    await tell(t("costDocMissing"));
    return false;
  }
  let letto;
  try {
    letto = read(xmlText(new Uint8Array(await blob.arrayBuffer())));
  } catch (ignored) {
    if (tab) tab.close();
    await tell(t("viewUnreadable"));
    return false;
  }
  // The print stylesheet is already in the page: read from there, nothing is requested again.
  const foglio = [...document.styleSheets].find((one) => String(one.href || "").endsWith("print.css"));
  let css = "";
  try {
    css = foglio ? _screenCss([...foglio.cssRules].map((rule) => rule.cssText).join("\n")) : "";
  } catch (ignored) {
    css = "";
  }
  const pagine = letto.documenti.map(({ doc, cliente }) => _sheet(doc, letto.mittente, cliente));
  const primo = letto.documenti[0].doc;
  const titolo = tf("viewTitle", {
    tipo: t(kind(primo).label), numero: primo.numero || "—", fornitore: letto.mittente.denominazione || "",
  });
  const html = `<!doctype html>
<html lang="${document.documentElement.lang || "it"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${_escape(titolo)}</title>
<style>
${css}
html, body { background: #e9edf3; color: #0d1220; font-family: Inter, "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 10pt; margin: 0; }
.iv-page { background: #fff; max-width: 210mm; margin: 16px auto; padding: 0 15mm; box-shadow: 0 2px 12px rgba(13,18,32,.12); }
.iv-bar { max-width: 210mm; margin: 16px auto 0; display: flex; gap: 12px; align-items: center; font-size: 10pt; color: #4a5266; }
.iv-bar button { font: inherit; padding: 6px 14px; border-radius: 8px; border: 1px solid #c9d0dc; background: #fff; cursor: pointer; }
@media print { html, body { background: #fff; } .iv-bar { display: none; } .iv-page { box-shadow: none; margin: 0; max-width: none; } .iv-page + .iv-page { page-break-before: always; } }
</style>
</head>
<body>
<div class="iv-bar"><span>${_escape(t("viewNote"))}</span><button type="button" onclick="window.print()">${_escape(t("docPrint"))}</button></div>
${pagine.map((p) => `<div class="iv-page">${p}</div>`).join("\n")}
</body>
</html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  if (tab) tab.location.href = url;
  else window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return true;
}
