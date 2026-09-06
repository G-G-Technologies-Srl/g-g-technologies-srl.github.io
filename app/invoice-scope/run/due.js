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

import { get } from "gg/store.js";

import { money, date as shownDate } from "./format.js";
import { t, lang } from "./i18n.js";
import { toString } from "./decimal.js";
import { summary } from "./schedule.js";
import { parties } from "./parties.js";
import { draw } from "./timeline.js";
import { control as statoControl } from "./states.js";
import { openSheet } from "./payments.js";

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

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Draw the schedule. Called on every visit: cheap, and never out of date. */
export async function render(db, afterChange = null) {
  database = db;
  onChange = afterChange;

  const { rows, total } = await summary(db);
  const visibili = soloScadute ? rows.filter((row) => row.scaduta) : rows;

  el("dueEmpty").hidden = visibili.length > 0;
  el("dueTable").hidden = visibili.length === 0;
  el("dueTotal").textContent = rows.length ? `${t("dueTotal")}: ${_money(total)}` : "";

  el("dueFilter").textContent = soloScadute ? t("dueOnlyOverdue") : t("dueAll");
  el("dueFilter").setAttribute("aria-pressed", String(soloScadute));

  // Il grafico legge sempre tutte le righe, anche con il filtro «solo scadute» attivo: un grafico
  // che si restringe con la tabella smette di essere il quadro d'insieme che la tabella non dà.
  draw(el("dueChart"), rows, {
    label: _mese,
    money: _money,
    title: t("dueChart"),
  });

  const people = new Map((await parties(db)).map((p) => [p.id, p.denominazione]));
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
