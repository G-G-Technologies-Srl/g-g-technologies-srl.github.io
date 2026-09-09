// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What is still owed, and the two things you do about it.
//
// **This screen exists because half the app was unreachable without it.** `recordPayment` and
// `setState` were written and tested and had no button anywhere: an invoice stayed owed for ever,
// and four of the six states in the plan — inviato, accettato, scartato, annullato — could not be
// set at all. Code that works and that nobody can reach is not a feature, it is a promise the
// screen never kept.
//
// **Nothing here computes.** `schedule.js` derives the rows from the documents, and it is tested on
// its own; this file draws them and collects two answers. Same division as `doc.js`.
//
// **Due versi, da quando ci sono gli acquisti.** Sopra quello che deve arrivare, sotto quello che
// deve uscire, e in cima il saldo dei due: è la domanda che lo scadenzario esiste per rispondere —
// «ce la faccio, questo mese?» — e con una metà sola rispondeva a un'altra. La metà bassa compare
// solo se c'è almeno un acquisto da pagare: chi non registra i costi vede lo scadenzario di prima.

import { get } from "gg/store.js";

import { money, date as shownDate } from "./format.js";
import { t, lang } from "./i18n.js";
import { toString } from "./decimal.js";
import { summary } from "./schedule.js";
import { parties } from "./parties.js";
import { draw } from "./timeline.js";
import { control as statoControl } from "./states.js";
import { openSheet, openMoney } from "./payments.js";
import { allCosts, allOutlays, payable, recordOutlay, cost as getCost, signedTotal as costTotal } from "./costs.js";
import { expected } from "./recurring.js";
import { list } from "gg/store.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

let database = null;
let onChange = null;
let soloScadute = false;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _money(value) {
  return money(value);
}

/**
 * A month key as a person reads it: «set 26».
 *
 * Built from the language the app is in rather than from a table of names, so it follows the
 * switch — and `Intl` is the one place where a browser already knows the twelve words.
 */
function _mese(key) {
  const [year, month] = key.split("-");
  const nome = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
    .toLocaleDateString(lang() === "it" ? "it-IT" : "en-GB", { month: "short", timeZone: "UTC" });
  return `${nome} ${year.slice(2)}`;
}

/**
 * Apri la scheda dell'incasso su questa rata.
 *
 * **Era una domanda sì o no, e registrava sempre tutta la rata.** Il commento che stava qui diceva
 * che un importo diverso «si scrive nella riga»: quella riga non esisteva. Adesso la rata è la
 * proposta scritta nel campo — il caso frequente resta un `Invio` — e quello che cambia è che
 * adesso *si può* cambiare, dire su quale conto è arrivato, e registrarne un altro la settimana
 * dopo. La scheda sta in `payments.js`, perché la apre anche il documento.
 */
async function _incassa(row) {
  const doc = await get(database, "docs", row.docId);
  if (!doc) return;
  await openSheet(database, doc, {
    proposta: row.importo,
    onDone: async () => {
      await render(database, onChange);
      if (onChange) onChange();
    },
  });
}

/** Il pagamento in uscita su una riga della metà bassa: lo stesso foglio, con il verbo giusto. */
async function _paga(row, people) {
  const record = await getCost(database, row.costId);
  if (!record) return;
  await openMoney(database, {
    titolo: `${people.get(row.partyId) || "—"} · ${row.riferimento || "—"} · ${t("costOwedLabel")} ${_money(row.importo)}`,
    etichetta: t("costPay"),
    residuo: row.importo,
    save: (campi) => recordOutlay(database, record, campi),
    onDone: async () => {
      await render(database, onChange);
      if (onChange) onChange();
    },
  });
}

/** La metà bassa: gli acquisti non saldati, dalla scadenza più vicina. */
function _drawOut(rows, people) {
  const visibili = soloScadute ? rows.filter((row) => row.scaduta) : rows;
  el("dueOutSection").hidden = rows.length === 0;
  el("dueOutEmpty").hidden = visibili.length > 0;
  el("dueOutTable").hidden = visibili.length === 0;
  const body = el("dueOutBody");
  body.textContent = "";
  for (const row of visibili) {
    const tr = document.createElement("tr");
    const quando = document.createElement("td");
    quando.className = "nowrap";
    quando.textContent = row.scadenza ? shownDate(row.scadenza) : "—";
    if (row.scaduta) {
      quando.classList.add("overdue");
      const nota = document.createElement("span");
      nota.className = "meta";
      nota.textContent = ` · ${t("dueOverdue")}`;
      quando.append(nota);
    }
    if (row.attesa) tr.className = "expected";
    const riferimento = document.createElement("td");
    riferimento.className = "nowrap";
    riferimento.textContent = row.riferimento || "—";
    if (row.attesa) {
      const nota = document.createElement("span");
      nota.className = "meta";
      nota.textContent = ` · ${t("dueExpected")}`;
      riferimento.append(nota);
    }
    const fornitore = document.createElement("td");
    fornitore.className = "nowrap";
    fornitore.textContent = people.get(row.partyId) || "—";
    const importo = document.createElement("td");
    importo.className = "right";
    importo.textContent = _money(row.importo);
    const azioni = document.createElement("td");
    azioni.className = "right actions-cell";
    if (row.attesa) {
      const conferma = document.createElement("button");
      conferma.type = "button";
      conferma.className = "ghost small row-action";
      conferma.textContent = t("expectedConfirm");
      conferma.addEventListener("click", () => { location.hash = "#/acquisti"; });
      azioni.append(conferma);
    } else {
      const apri = document.createElement("button");
      apri.type = "button";
      apri.className = "ghost small row-action";
      apri.textContent = t("dueOpen");
      apri.addEventListener("click", () => { location.hash = `#/acquisto/${row.costId}`; });
      const paga = document.createElement("button");
      paga.type = "button";
      paga.className = "ghost small row-action";
      paga.textContent = t("costPayShort");
      paga.setAttribute("aria-label", `${t("costPay")} — ${row.riferimento || ""}`);
      paga.addEventListener("click", () => _paga(row, people));
      azioni.append(apri, paga);
    }
    tr.append(quando, riferimento, fornitore, importo, azioni);
    body.append(tr);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Draw the schedule. Called on every visit: cheap, and never out of date. */
export async function render(db, afterChange = null) {
  database = db;
  onChange = afterChange;

  const { rows, total } = await summary(db);
  const visibili = soloScadute ? rows.filter((row) => row.scaduta) : rows;

  // Le uscite: gli acquisti non saldati. `payable` sa già cos'è scaduto; qui si aggiunge solo il
  // riferimento da scrivere nella riga.
  const costs = await allCosts(db);
  const byCost = new Map(costs.map((c) => [c.id, c]));
  const out = payable(costs, await allOutlays(db)).map((row) => {
    const record = byCost.get(row.costId);
    const riferimento = record.tipo === "spesa" ? (record.categoria || t("costTipoSpesa")) : (record.numero || "");
    return { ...row, riferimento };
  });
  // Gli attesi delle ricorrenze, in coda: righe tratteggiate, senza «Paga», con «Conferma» che
  // porta in Acquisti. Non entrano nel totale da pagare — non sono ancora un debito — ma nel
  // grafico sì, tratteggiati, perché la domanda del grafico è «cosa esce».
  const company = await get(db, "company", "company");
  const attesi = expected(await list(db, "recurring"), costs, { company }).map((a) => ({
    costId: a.id, partyId: a.partyId, scadenza: a.data, importo: costTotal(a), scaduta: a.scaduta,
    riferimento: a.descrizione || a.categoria || "", attesa: true,
  }));
  const tutte = [...out, ...attesi].sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)));
  const totalOut = out.reduce((sum, row) => sum + row.importo, 0n);

  el("dueEmpty").hidden = visibili.length > 0;
  el("dueTable").hidden = visibili.length === 0;
  // Con le uscite il totale diventa tre numeri: cosa entra, cosa esce, e la differenza — che è
  // l'unico dei tre che risponde alla domanda.
  el("dueTotal").textContent = tutte.length
    ? `${t("dueLeft")}: ${_money(total)} · ${t("costOwedLabel")}: ${_money(totalOut)} · ${t("dueNet")}: ${_money(total - totalOut)}`
    : rows.length ? `${t("dueTotal")}: ${_money(total)}` : "";
  el("dueInTitle").hidden = tutte.length === 0;

  el("dueFilter").textContent = soloScadute ? t("dueOnlyOverdue") : t("dueAll");
  el("dueFilter").setAttribute("aria-pressed", String(soloScadute));

  // Il grafico legge sempre tutte le righe, anche con il filtro «solo scadute» attivo: un grafico
  // che si restringe con la tabella smette di essere il quadro d'insieme che la tabella non dà.
  draw(el("dueChart"), rows, {
    label: _mese,
    money: _money,
    title: t(tutte.length ? "dueChartTwoWay" : "dueChart"),
    out: tutte,
  });

  const people = new Map((await parties(db)).map((p) => [p.id, p.denominazione]));
  _drawOut(tutte, people);
  const body = el("dueBody");
  body.textContent = "";

  for (const row of visibili) {
    const doc = await get(db, "docs", row.docId);
    if (!doc) continue;

    const tr = document.createElement("tr");

    const quando = document.createElement("td");
    quando.className = "nowrap";
    quando.textContent = row.scadenza ? shownDate(row.scadenza) : "—";
    // Overdue is said in words as well as in colour: the site's rule is that colour never carries
    // the information on its own, and here the information is somebody's money.
    if (row.scaduta) {
      quando.classList.add("overdue");
      const nota = document.createElement("span");
      nota.className = "meta";
      nota.textContent = ` · ${t("dueOverdue")}`;
      quando.append(nota);
    }

    const documento = document.createElement("td");
    documento.className = "nowrap";
    documento.textContent = row.numero || "—";

    const cliente = document.createElement("td");
    cliente.className = "nowrap";
    cliente.textContent = people.get(row.partyId) || "—";

    const importo = document.createElement("td");
    importo.className = "right";
    importo.textContent = _money(row.importo);

    const azioni = document.createElement("td");
    azioni.className = "right actions-cell";
    const incassa = document.createElement("button");
    incassa.type = "button";
    incassa.className = "ghost small row-action";
    // Short on the row — the long label is the accessible name — because beside the state menu
    // «Registra un incasso» pushed the two controls off the right edge of the table.
    incassa.textContent = t("dueRecordShort");
    incassa.setAttribute("aria-label", `${t("dueRecord")} — ${row.numero}`);
    incassa.addEventListener("click", () => _incassa(row));
    const stato = statoControl(database, doc, {
      hint: row.numero,
      onDone: async () => {
        await render(database, onChange);
        if (onChange) onChange();
      },
    });
    azioni.append(incassa, stato);

    tr.append(quando, documento, cliente, importo, azioni);
    body.append(tr);
  }
}

/** Wire the filter. Called once, at start-up. */
export function connect(db, afterChange = null) {
  database = db;
  onChange = afterChange;
  el("dueFilter").addEventListener("click", async () => {
    soloScadute = !soloScadute;
    await render(database, onChange);
  });
}
