// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

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

import { get } from "gg/store.js";

import { money, date as shownDate } from "./format.js";
import { parseAmount } from "./parse.js";
import { t, tf } from "./i18n.js";
import { ask, tell } from "./ask.js";
import { from, cmp, sub, toString, ZERO } from "./decimal.js";
import { kind, numero as shownNumber } from "./kinds.js";
import { recordPayment, removePayment, paymentsOf, received, owedOn } from "./schedule.js";

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
  return new Date().toISOString().slice(0, 10);
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
    save: (campi) => recordPayment(db, doc, campi),
  });
}

/**
 * La stessa scheda per un incasso e per un pagamento in uscita: cambiano il titolo, il residuo e
 * chi scrive il record. Un pagamento a un fornitore è un incasso al contrario, sullo stesso conto,
 * e due schede diverse per la stessa forma sarebbero due schede che divergono.
 *
 * `save` riceve `{ importo, data, conto, nota }` e scrive dove deve; `titolo` è la riga sotto il
 * titolo; `etichetta` il verbo sul pulsante, «Registra un incasso» se manca.
 */
export async function openMoney(db, { titolo, residuo = ZERO, proposta = ZERO, onDone = null, save, etichetta = null }) {
  const form = el("payForm");
  form.reset();
  el("paySave").textContent = etichetta || t("dueRecord");
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
  // Senza conti registrati il menù non chiede niente e non offre niente: sparisce, e l'incasso si
  // registra lo stesso. L'anagrafica dei conti è comoda, non obbligatoria.
  el("payContoRow").hidden = conti.length === 0;
  const predefinito = conti.find((conto) => conto.predefinito) || conti[0];
  scelta.value = predefinito ? predefinito.id : "";

  form.elements.importo.value = cmp(proposta, ZERO) > 0 ? toString(proposta, 2) : toString(residuo, 2);
  form.elements.data.value = _oggi();
  el("payDialogDoc").textContent = titolo;
  el("payProblems").hidden = true;
  el("payProblems").textContent = "";

  _open(el("payDialog"));
  form.elements.importo.focus();
  form.elements.importo.select();

  return new Promise((resolve) => {
    const chiudi = (esito) => {
      el("paySave").onclick = null;
      el("payCancel").onclick = null;
      _close(el("payDialog"));
      resolve(esito);
    };

    el("payCancel").onclick = () => chiudi(false);

    el("paySave").onclick = async () => {
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

      const conto = conti.find((uno) => uno.id === form.elements.conto.value) || null;
      await save({
        importo: toString(importo, 2),
        data: form.elements.data.value || _oggi(),
        conto,
        nota: form.elements.nota.value.trim() || null,
      });

      chiudi(true);
      // **Prima si ridisegna, poi si parla.** La lista si aggiornava solo dopo che qualcuno aveva
      // chiuso il dialogo di conferma: chi registra un incasso e guarda la riga la vedeva ancora
      // aperta, con l'importo di prima, e la parola «registrato» sopra. E il dialogo nel caso normale
      // non serve: la riga che cambia sotto gli occhi *è* la conferma.
      if (onDone) await onDone();
      // **Il di più si registra e si dice, non si rifiuta.** Un cliente che arrotonda per eccesso,
      // o che paga due fatture con un bonifico solo, esiste; rifiutare l'importo lascerebbe chi
      // registra davanti a una casella che non accetta quello che è successo davvero.
      if (cmp(importo, residuo) > 0) {
        await tell(tf("dueOverpaid", { di_piu: _money(sub(importo, residuo)) }));
      }
    };
  });
}

/**
 * Gli incassi di un documento, disegnati dentro un contenitore.
 *
 * Sola lettura tranne il comando per toglierne uno: un incasso è il verbale di una cosa arrivata in
 * banca, e le cose che si correggono di un verbale sono «non è mai arrivato» e nient'altro.
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

    const azioni = document.createElement("td");
    azioni.className = "right";
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
    azioni.append(togli);

    tr.append(quando, dove, nota, quanto, azioni);
    body.append(tr);
  }

  const incassato = received(incassi);
  const residuo = await owedOn(db, doc.id);
  el("incassiTotals").textContent = incassi.length
    ? `${t("incassiTotal")}: ${_money(incassato)} · ${t("dueLeft")}: ${_money(residuo)}`
    : "";
}
