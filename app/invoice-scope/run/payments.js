// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Quello che è arrivato: quanto, quando, su quale conto.
//
// **La prima stesura chiedeva sì o no.** Il dialogo diceva «Quanto hai incassato? 1.220,00 €» e
// aveva un solo pulsante: qualunque risposta registrava l'intera rata. Nel commento accanto c'era
// scritto che «un importo diverso si scrive nella riga» — e quella riga non è mai esistita. È un
// difetto di una famiglia precisa: una scorciatoia giustificata da una via d'uscita immaginaria.
//
// Un cliente paga a rate, paga in ritardo, paga metà adesso e metà a fine mese, e paga su uno dei
// conti dell'azienda e non su un altro. Nessuna di queste cose entra in un sì.
//
// **Il file esiste perché i chiamanti sono due.** Lo scadenzario registra un incasso guardando le
// scadenze, la scheda del documento lo registra guardando la fattura, e sono lo stesso gesto: due
// copie divergerebbero il giorno in cui a una si aggiunge un campo.
//
// **The receipt of the transfer is chosen in the same sheet**, and attached once the payment
// exists: the attachment needs the payment's id, and a receipt written before its payment would be a
// file without an owner if the save failed in between. The rules live in `attachments.js`; here are
// the button, the name of the chosen file, and the cell that every list of payments draws.

import { get } from "gg/store.js";

import { money, date as shownDate } from "./format.js";
import { parseAmount } from "./parse.js";
import { t, tf } from "./i18n.js";
import { ask, tell } from "./ask.js";
import { from, add, cmp, sub, toString, ZERO } from "./decimal.js";
import { kind, numero as shownNumber } from "./kinds.js";
import { recordPayment, removePayment, updatePayment, paymentsOf, received, owedOn, schedule, spread } from "./schedule.js";
import { RECEIPT_ACCEPT, attach, blobOf, detach, refusal } from "./attachments.js";
import { updateOutlay, outlaysOf, allCosts, owedOn as costOwedOn, notesOf } from "./costs.js";
import { currentDay } from "./day.js";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _money(value) {
  return money(value);
}

function _oggi() {
  return currentDay();
}

function _open(dialog) {
  try {
    if (!dialog.open) dialog.showModal();
  } catch (ignored) {
    dialog.setAttribute("open", "");
  }
}

function _close(dialog) {
  try {
    if (dialog.open) dialog.close();
  } catch (ignored) {
    dialog.removeAttribute("open");
  }
}

/** The file chosen in the sheet, until the payment is saved. */
let ricevutaScelta = null;

/**
 * The receipt the payment already has, when the sheet corrects one; and whether the person took it
 * off with the cross. Nothing is removed until the sheet is saved: a cancel leaves it where it was.
 */
let ricevutaEsistente = null;
let ricevutaTolta = false;

/** Who is waiting for the file picker opened from a row: the record, and what to redraw. */
let attesa = null;

/**
 * The file under the button: the one just chosen, or the one the payment already has, or nothing;
 * and the button says which of the three it does. The cross takes off the chosen file first, and
 * the existing receipt after it.
 */
function _drawChosen() {
  const tenuta = ricevutaEsistente && !ricevutaTolta ? ricevutaEsistente : null;
  el("payReceiptName").textContent = ricevutaScelta ? ricevutaScelta.name : tenuta ? tenuta.name || t("receiptLabel") : "";
  el("payReceiptClear").hidden = !ricevutaScelta && !tenuta;
  el("payReceiptClear").setAttribute("aria-label", t(ricevutaScelta ? "receiptClear" : "receiptRemove"));
  el("payReceiptPick").textContent = t(ricevutaScelta || tenuta ? "receiptChange" : "receiptAttach");
}

/** A refusal said under the sheet, in the same list as a wrong amount. */
function _sheetProblem(key) {
  const lista = el("payProblems");
  lista.hidden = false;
  lista.textContent = "";
  const riga = document.createElement("li");
  riga.textContent = t(key);
  lista.append(riga);
}

/**
 * Open the receipt in a tab of its own, or save it where the browser cannot show it.
 *
 * A PDF and a picture open in a tab, which is where somebody looks at a receipt; a HEIC photo from
 * an iPhone does not open in most browsers, so it is downloaded under its own name instead.
 */
async function _show(db, record, { download = false } = {}) {
  const blob = await blobOf(db, record);
  if (!blob) {
    await tell(t("receiptMissing"));
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  if (download || /heic|heif/i.test(record.ricevuta.type || record.ricevuta.name || "")) {
    link.download = record.ricevuta.name || "ricevuta";
  } else {
    link.target = "_blank";
    link.rel = "noopener";
  }
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked later and not now: the tab that opens reads the address after this function returns.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** I conti dell'azienda, per il menù. Vuoto se non ne è stato registrato nessuno. */
async function _conti(db) {
  const company = await get(db, "company", "company");
  return ((company || {}).conti || []).filter((conto) => conto.iban || conto.etichetta);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * La scheda dell'incasso, aperta su un documento.
 *
 * `proposta` è quello che il chiamante sa del residuo — la rata su cui si è premuto, o il totale
 * ancora aperto — e finisce nel campo già scritto: il caso frequente resta un `Invio`, ma adesso è
 * una proposta e non un obbligo.
 *
 * Risolve `true` se qualcosa è stato registrato, così chi ha chiamato ridisegna una volta sola.
 */
export async function openSheet(db, doc, { proposta = ZERO, onDone = null } = {}) {
  const residuo = await owedOn(db, doc.id);
  return openMoney(db, {
    titolo: `${t(kind(doc).label)} ${shownNumber(doc)} · ${t("dueLeft")} ${_money(residuo)}`,
    residuo,
    proposta,
    onDone,
    save: (campi) => _recordSpread(db, doc, residuo, campi),
  });
}

/**
 * The same sheet on a payment already recorded, to correct it: amount, day, account, note, and the
 * receipt — replaced, taken off, or attached now if it was never there.
 *
 * The amount still owed it shows is the document's with this payment taken out, so the figure under
 * the title is what the payment is being measured against, as when it was recorded. Resolves `true`
 * when something was written.
 */
export async function editPayment(db, payment, { onDone = null } = {}) {
  const doc = await get(db, "docs", payment.docId);
  let importo = ZERO;
  try {
    importo = from(payment.importo || "0");
  } catch (ignored) {
    importo = ZERO;
  }
  const residuo = add(await owedOn(db, payment.docId), importo);
  return openMoney(db, {
    titolo: doc
      ? `${t(kind(doc).label)} ${shownNumber(doc)} · ${t("dueLeft")} ${_money(residuo)}`
      : t("incassiNoDoc"),
    residuo,
    onDone,
    etichetta: t("incassiEdit"),
    diPiu: "incassiOverpaid",
    iniziale: payment,
    save: (campi) => updatePayment(db, payment.id, campi),
  });
}

/**
 * The same correction for a payment made to a supplier: the sheet opens on it, and what the
 * purchase still owes is measured with this payment taken out.
 */
export async function editOutlay(db, outlay, { onDone = null } = {}) {
  const cost = await get(db, "costs", outlay.costId);
  const party = cost && cost.partyId ? await get(db, "parties", cost.partyId) : null;
  let importo = ZERO;
  try {
    importo = from(outlay.importo || "0");
  } catch (ignored) {
    importo = ZERO;
  }
  const residuo = cost
    ? add(costOwedOn(cost, await outlaysOf(db, cost.id), notesOf(await allCosts(db))), importo)
    : importo;
  const riferimento = cost ? cost.numero || cost.categoria || "" : "";
  return openMoney(db, {
    titolo: cost
      ? [party ? party.denominazione : "", riferimento, `${t("costOwedLabel")} ${_money(residuo)}`].filter(Boolean).join(" · ")
      : t("outlaysNoCost"),
    residuo,
    onDone,
    etichetta: t("outlaysEdit"),
    diPiu: "outlaysOverpaid",
    iniziale: outlay,
    save: (campi) => updateOutlay(db, outlay.id, campi),
  });
}

/**
 * The payment on this document, and — when it is more than the document still owes and the
 * customer has other open invoices — the rest on those, oldest first, if the person says so.
 *
 * A customer who pays three invoices with one transfer is ordinary; recording the transfer three
 * times by hand, splitting it in one's head, is where the mistakes come from. The receipt of the
 * transfer goes on this document's payment, the one the person opened.
 */
async function _recordSpread(db, doc, residuo, campi) {
  const importo = from(campi.importo);
  if (cmp(residuo, ZERO) > 0 && cmp(importo, residuo) > 0) {
    const { quote, avanzo } = spread((await schedule(db)), {
      partyId: doc.partyId, escludi: doc.id, importo: sub(importo, residuo),
    });
    if (quote.length && await ask(tf("dueSpreadAsk", { di_piu: _money(sub(importo, residuo)) }), {
      okLabel: t("dueSpreadYes"), cancelLabel: t("dueSpreadNo"),
      lines: quote.map((quota) => tf("dueSpreadLine", { numero: quota.numero || "—", importo: _money(quota.importo) })),
    })) {
      const nota = campi.nota || t("dueSpreadNote");
      const record = await recordPayment(db, doc, { ...campi, importo: toString(residuo, 2) });
      for (const quota of quote) {
        const altro = await get(db, "docs", quota.docId);
        if (altro) await recordPayment(db, altro, { ...campi, importo: toString(quota.importo, 2), nota });
      }
      return {
        record,
        distribuito: true,
        messaggio: cmp(avanzo, ZERO) > 0 ? tf("dueSpreadLeft", { avanzo: _money(avanzo) }) : null,
      };
    }
  }
  return recordPayment(db, doc, campi);
}

/**
 * La stessa scheda per un incasso e per un pagamento in uscita: cambiano il titolo, il residuo e
 * chi scrive il record. Un pagamento a un fornitore è un incasso al contrario, sullo stesso conto,
 * e due schede diverse per la stessa forma sarebbero due schede che divergono.
 *
 * `save` riceve `{ importo, data, conto, nota }` e scrive dove deve; `titolo` è la riga sotto il
 * titolo; `etichetta` il verbo sul pulsante, «Registra un incasso» se manca.
 */
export async function openMoney(db, { titolo, residuo = ZERO, proposta = ZERO, onDone = null, save, etichetta = null,
  diPiu = "dueOverpaid", iniziale = null }) {
  const form = el("payForm");
  form.reset();
  // A correction is saved, not recorded again: the title says what the sheet is, the button what it does.
  el("paySave").textContent = iniziale ? t("save") : etichetta || t("dueRecord");
  el("payDialogTitle").textContent = etichetta || t("dueRecord");

  const conti = await _conti(db);
  const scelta = form.elements.conto;
  scelta.textContent = "";
  const nessuno = document.createElement("option");
  nessuno.value = "";
  nessuno.textContent = t("payContoChoose");
  scelta.append(nessuno);
  for (const conto of conti) {
    const option = document.createElement("option");
    option.value = conto.id;
    option.textContent = conto.etichetta
      ? `${conto.etichetta}${conto.iban ? ` · …${conto.iban.slice(-4)}` : ""}`
      : conto.iban;
    scelta.append(option);
  }
  // A payment being corrected keeps the account it was recorded on, even one taken out of the
  // register since: it is offered as it was written, so saving without touching it changes nothing.
  const fotografia = iniziale && iniziale.conto;
  if (fotografia && !conti.some((conto) => conto.id === fotografia.id)) {
    conti.push({ id: fotografia.id || "", etichetta: fotografia.etichetta, iban: fotografia.iban, opzione: "__fotografia" });
    const option = document.createElement("option");
    option.value = fotografia.id || "__fotografia";
    option.textContent = fotografia.etichetta || fotografia.iban || "—";
    scelta.append(option);
  }
  // Senza conti registrati il menù non chiede niente e non offre niente: sparisce, e l'incasso si
  // registra lo stesso. L'anagrafica dei conti è comoda, non obbligatoria.
  el("payContoRow").hidden = conti.length === 0;
  const predefinito = conti.find((conto) => conto.predefinito) || conti[0];
  if (iniziale) scelta.value = fotografia ? fotografia.id || "__fotografia" : "";
  else scelta.value = predefinito ? predefinito.id : "";

  if (iniziale) {
    form.elements.importo.value = toString(from(iniziale.importo || "0"), 2);
    form.elements.data.value = iniziale.data || _oggi();
    form.elements.nota.value = iniziale.nota || "";
  } else {
    form.elements.importo.value = cmp(proposta, ZERO) > 0 ? toString(proposta, 2) : toString(residuo, 2);
    form.elements.data.value = _oggi();
  }
  el("payDialogDoc").textContent = titolo;
  el("payProblems").hidden = true;
  el("payProblems").textContent = "";
  ricevutaScelta = null;
  ricevutaEsistente = iniziale && iniziale.ricevuta ? iniziale.ricevuta : null;
  ricevutaTolta = false;
  _drawChosen();

  _open(el("payDialog"));
  form.elements.importo.focus();
  form.elements.importo.select();

  return new Promise((resolve) => {
    const chiudi = (esito) => {
      el("paySave").onclick = null;
      el("payCancel").onclick = null;
      el("payDialog").oncancel = null;
      form.onkeydown = null;
      ricevutaScelta = null;
      ricevutaEsistente = null;
      ricevutaTolta = false;
      _close(el("payDialog"));
      resolve(esito);
    };

    el("payCancel").onclick = () => chiudi(false);
    // Escape closes a <dialog> by itself: without this the promise never settled and the receipt
    // chosen before Escape waited for the next sheet.
    el("payDialog").oncancel = () => chiudi(false);
    // **Invio registra**, as the comment above promises. The save button is not a submit button —
    // the form is a dialog form, and a submit would close it before the checks — so the key is
    // taken here, in the fields and not on the buttons.
    form.onkeydown = (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      const tag = event.target && event.target.tagName;
      if (tag !== "INPUT" && tag !== "SELECT") return;
      event.preventDefault();
      el("paySave").click();
    };

    // A second click while the first is still writing — a large receipt takes a moment — recorded
    // the same payment twice. The button is off until the first click has finished.
    let inCorso = false;
    el("paySave").onclick = async () => {
      if (inCorso) return;
      inCorso = true;
      el("paySave").disabled = true;
      try {
        await _registra();
      } finally {
        inCorso = false;
        el("paySave").disabled = false;
      }
    };

    const _registra = async () => {
      let importo;
      try {
        importo = from(parseAmount(form.elements.importo.value) ?? "x");
      } catch (ignored) {
        importo = null;
      }
      // L'unico rifiuto: un incasso di zero o negativo non è un incasso, è un'altra cosa che questa
      // scheda non sa fare. Tutto il resto passa, compreso il di più.
      if (importo === null || cmp(importo, ZERO) <= 0) {
        const lista = el("payProblems");
        lista.hidden = false;
        lista.textContent = "";
        const riga = document.createElement("li");
        riga.textContent = t("dueBadAmount");
        lista.append(riga);
        form.elements.importo.focus();
        return;
      }

      const conto = conti.find((uno) => (uno.opzione || uno.id) === form.elements.conto.value) || null;
      // `save` answers the record, or `{ record, distribuito, messaggio }` when the transfer was
      // shared among several documents (`_recordSpread`): then the overpayment is not one.
      const esito = await save({
        importo: toString(importo, 2),
        data: form.elements.data.value || _oggi(),
        conto,
        nota: form.elements.nota.value.trim() || null,
      });
      const record = esito && esito.record ? esito.record : esito;
      const distribuito = Boolean(esito && esito.distribuito);
      // **The payment first, then its receipt.** If the file fails — the disk is full, the browser
      // refuses — the payment is recorded anyway, which is the part that changes the money, and the
      // receipt can be attached from the row afterwards. Saying so beats losing both.
      let ricevutaPersa = false;
      if (ricevutaScelta && record) {
        try {
          await attach(db, record, ricevutaScelta);
        } catch (ignored) {
          ricevutaPersa = true;
        }
      } else if (ricevutaTolta && record && record.ricevuta) {
        await detach(db, record);
      }
      ricevutaScelta = null;

      chiudi(true);
      // **Prima si ridisegna, poi si parla.** La lista si aggiornava solo dopo che qualcuno aveva
      // chiuso il dialogo di conferma: chi registra un incasso e guarda la riga la vedeva ancora
      // aperta, con l'importo di prima, e la parola «registrato» sopra. E il dialogo nel caso normale
      // non serve: la riga che cambia sotto gli occhi *è* la conferma.
      if (onDone) await onDone();
      if (ricevutaPersa) await tell(t("receiptNotSaved"));
      // **Il di più si registra e si dice, non si rifiuta.** Un cliente che arrotonda per eccesso,
      // o che paga due fatture con un bonifico solo, esiste; rifiutare l'importo lascerebbe chi
      // registra davanti a una casella che non accetta quello che è successo davvero.
      if (distribuito) {
        if (esito.messaggio) await tell(esito.messaggio);
      } else if (cmp(importo, residuo) > 0) {
        await tell(tf(diPiu, { di_piu: _money(sub(importo, residuo)) }));
      }
    };
  });
}

/**
 * Gli incassi di un documento, disegnati dentro un contenitore.
 *
 * Un incasso è il verbale di una cosa arrivata in banca. Si toglie quando non è mai arrivato, e si
 * corregge (`editPayment`) quando il verbale è sbagliato: il giorno, il conto, una cifra scritta male.
 */
export async function render(db, doc, { onChange = null } = {}) {
  const incassi = await paymentsOf(db, doc.id);

  el("incassiEmpty").hidden = incassi.length > 0;
  el("incassiTable").hidden = incassi.length === 0;

  const body = el("incassiBody");
  body.textContent = "";
  for (const incasso of incassi) {
    const tr = document.createElement("tr");

    const quando = document.createElement("td");
    quando.className = "nowrap";
    quando.textContent = incasso.data ? shownDate(incasso.data) : "—";

    const dove = document.createElement("td");
    dove.textContent = incasso.conto
      ? (incasso.conto.etichetta || incasso.conto.iban || "—")
      : "—";

    const nota = document.createElement("td");
    nota.className = "meta";
    nota.textContent = incasso.nota || "";

    const quanto = document.createElement("td");
    quanto.className = "right";
    quanto.textContent = _money(from(incasso.importo || "0"));

    const prova = receiptCell(db, incasso, {
      onChange: async () => {
        await render(db, doc, { onChange });
        if (onChange) await onChange();
      },
    });

    const azioni = document.createElement("td");
    azioni.className = "right nowrap";
    const correggi = document.createElement("button");
    correggi.type = "button";
    correggi.className = "ghost small";
    correggi.textContent = t("edit");
    correggi.setAttribute("aria-label", `${t("incassiEdit")} ${incasso.data}`);
    correggi.addEventListener("click", () => editPayment(db, incasso, {
      onDone: async () => {
        await render(db, doc, { onChange });
        if (onChange) await onChange();
      },
    }));
    const togli = document.createElement("button");
    togli.type = "button";
    togli.className = "ghost small";
    togli.textContent = "×";
    togli.setAttribute("aria-label", `${t("incassiRemove")} ${incasso.data}`);
    togli.addEventListener("click", async () => {
      if (!(await ask(t("incassiRemoveAsk"), { okLabel: t("del"), danger: true }))) return;
      await removePayment(db, incasso.id);
      await render(db, doc, { onChange });
      if (onChange) await onChange();
    });
    azioni.append(correggi, togli);

    tr.append(quando, dove, nota, prova, quanto, azioni);
    body.append(tr);
  }

  const incassato = received(incassi);
  const residuo = await owedOn(db, doc.id);
  el("incassiTotals").textContent = incassi.length
    ? `${t("incassiTotal")}: ${_money(incassato)} · ${t("dueLeft")}: ${_money(residuo)}`
    : "";
}

/**
 * The receipt of a payment, as a table cell: a link to open it and a cross to take it off, or a
 * button to attach one.
 *
 * Every list of payments draws this same cell — the incassi on a document, the payments of a
 * purchase — so a receipt is reached the same way wherever its payment is shown.
 */
export function receiptCell(db, record, { onChange = null } = {}) {
  const td = document.createElement("td");
  td.className = "receipt-cell";
  if (record.ricevuta) {
    const apri = document.createElement("button");
    apri.type = "button";
    apri.className = "link-button receipt-link";
    apri.textContent = record.ricevuta.name || t("receiptLabel");
    apri.title = t("receiptOpen");
    apri.addEventListener("click", () => _show(db, record));
    // Opening shows it; saving it is the other half of the question — the accountant wants the
    // file, not a tab. The arrow stays small beside the name, which is the thing one reads.
    const scarica = document.createElement("button");
    scarica.type = "button";
    scarica.className = "ghost small";
    scarica.textContent = "↓";
    scarica.title = t("receiptDownload");
    scarica.setAttribute("aria-label", `${t("receiptDownload")} — ${record.ricevuta.name || ""}`);
    scarica.addEventListener("click", () => _show(db, record, { download: true }));
    const togli = document.createElement("button");
    togli.type = "button";
    togli.className = "ghost small";
    togli.textContent = "×";
    togli.setAttribute("aria-label", `${t("receiptRemove")} — ${record.ricevuta.name || ""}`);
    togli.addEventListener("click", async () => {
      if (!(await ask(t("receiptRemoveAsk"), { okLabel: t("del"), danger: true }))) return;
      await detach(db, record);
      if (onChange) await onChange();
    });
    td.append(apri, scarica, togli);
    return td;
  }
  const allega = document.createElement("button");
  allega.type = "button";
  allega.className = "ghost small";
  allega.textContent = t("receiptAttachShort");
  allega.setAttribute("aria-label", t("receiptAttach"));
  allega.addEventListener("click", () => {
    attesa = { db, record, onChange };
    el("receiptPick").value = "";
    el("receiptPick").click();
  });
  td.append(allega);
  return td;
}

/** Wire the sheet's file button and the picker the rows share. Called once, at start-up. */
export function connect() {
  el("payReceiptFile").accept = RECEIPT_ACCEPT;
  el("receiptPick").accept = RECEIPT_ACCEPT;
  el("payReceiptPick").addEventListener("click", () => {
    el("payReceiptFile").value = "";
    el("payReceiptFile").click();
  });
  el("payReceiptFile").addEventListener("change", () => {
    const file = el("payReceiptFile").files && el("payReceiptFile").files[0];
    if (!file) return;
    const why = refusal(file);
    if (why) {
      _sheetProblem(why);
      return;
    }
    el("payProblems").hidden = true;
    ricevutaScelta = file;
    _drawChosen();
  });
  el("payReceiptClear").addEventListener("click", () => {
    if (ricevutaScelta) ricevutaScelta = null;
    else if (ricevutaEsistente) ricevutaTolta = true;
    _drawChosen();
  });
  el("receiptPick").addEventListener("change", async () => {
    const file = el("receiptPick").files && el("receiptPick").files[0];
    const chi = attesa;
    attesa = null;
    if (!file || !chi) return;
    const why = refusal(file);
    if (why) {
      await tell(t(why));
      return;
    }
    try {
      await attach(chi.db, chi.record, file);
    } catch (ignored) {
      await tell(t("receiptNotSaved"));
      return;
    }
    if (chi.onChange) await chi.onChange();
  });
}
