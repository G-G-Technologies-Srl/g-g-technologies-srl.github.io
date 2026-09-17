// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il sollecito: il testo pronto per chiedere quello che non è ancora arrivato.
//
// **L'applicazione non manda niente, e non deve.** Non ha un server, non conosce la casella di
// posta di chi la usa e non firma niente a nome suo. Quello che può fare è la parte noiosa e
// delicata: raccogliere le fatture scadute di un cliente, contarne i giorni di ritardo, sommarle,
// e scriverne il testo in un registro che non offende nessuno. Il resto — mandarlo, e decidere a
// chi — resta a una persona, che è anche il punto in cui un sollecito si sbaglia.
//
// **Un sollecito per cliente, non per fattura.** Tre fatture scadute dello stesso cliente sono una
// conversazione sola: tre email separate lo stesso giorno sono un modo per farsi rispondere da un
// avvocato invece che dall'ufficio pagamenti.
//
// **La formula prevede sempre che il pagamento possa essere già partito.** Non è cortesia
// formale: succede di continuo — un bonifico ordinato ieri, una registrazione non ancora fatta —
// e un testo che dà per scontato l'inadempimento costringe chi lo riceve a difendersi invece che
// a pagare.
//
// Niente DOM nei conti e nel testo:
// `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/reminders.mjs`.

import { get } from "gg/store.js";

import { t, tf } from "./i18n.js";
import { money, date as shownDate } from "./format.js";
import { summary } from "./schedule.js";
import { parties } from "./parties.js";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Giorni interi fra due date ISO, positivi se `a` viene dopo `b`. */
function _giorni(a, b) {
  const uno = Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`);
  const due = Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(uno) || Number.isNaN(due)) return 0;
  return Math.round((uno - due) / 86400000);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Le rate scadute raccolte per cliente, dal più esposto.
 *
 * Solo le scadute: una fattura che scade fra una settimana non si sollecita, e infilarla nello
 * stesso elenco farebbe sembrare un ritardo una cosa che è ancora in tempo.
 */
export function perCliente(rows, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const per = new Map();
  for (const row of rows || []) {
    if (!row.scaduta) continue;
    const voce = per.get(row.partyId) || { partyId: row.partyId, righe: [], totale: 0n, giorni: 0 };
    const giorni = _giorni(today, row.scadenza);
    voce.righe.push({ ...row, giorni });
    voce.totale += row.importo;
    // Il ritardo del cliente è quello della fattura più vecchia: è il numero che dice quanto è
    // seria la situazione, e una media lo annacquerebbe con le scadute di ieri.
    voce.giorni = Math.max(voce.giorni, giorni);
    per.set(row.partyId, voce);
  }
  return [...per.values()]
    .map((voce) => ({ ...voce, righe: voce.righe.slice().sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza))) }))
    .sort((a, b) => (a.totale < b.totale ? 1 : a.totale > b.totale ? -1 : 0));
}

/**
 * Il testo del sollecito, pronto da copiare in una email.
 *
 * Le frasi stanno in `i18n.js` come tutte le altre, quindi il sollecito esce nella lingua in cui
 * l'applicazione sta parlando. Le coordinate di pagamento compaiono solo se l'azienda ne ha una:
 * una riga «IBAN:» vuota in fondo a un sollecito è la ragione per cui il pagamento arriva ancora
 * più tardi.
 */
export function testo(gruppo, { company = {}, party = {} } = {}) {
  const righe = gruppo.righe.map((riga) => tf("solleciteRow", {
    numero: riga.numero || "—",
    scadenza: shownDate(riga.scadenza),
    importo: money(riga.importo),
    giorni: riga.giorni,
  }));
  const iban = (company.conti || []).find((conto) => conto.predefinito && conto.iban)
    || (company.conti || []).find((conto) => conto.iban);
  return [
    tf("solleciteHello", { cliente: party.denominazione || "" }),
    "",
    t("solleciteLead"),
    "",
    righe.join("\n"),
    "",
    tf("solleciteTotal", { totale: money(gruppo.totale) }),
    ...(iban ? ["", tf("solleciteIban", { iban: iban.iban })] : []),
    "",
    t("solleciteClosing"),
    "",
    t("solleciteRegards"),
    company.denominazione || "",
  ].join("\n");
}

/** L'oggetto della email, che è la riga che decide se il resto viene letto. */
export function oggetto(company = {}) {
  return tf("solleciteSubject", { azienda: company.denominazione || "" });
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   f o g l i o
// -----------------------------------------------------------------------------------------------------------------

let database = null;                                     // il deposito, tenuto per le riaperture
let gruppi = [];
let anagrafiche = new Map();
let azienda = null;

function el(id) {
  return document.getElementById(id);
}

/** Riscrive oggetto e testo per il cliente scelto nel menù. */
function _mostra() {
  const gruppo = gruppi.find((uno) => uno.partyId === el("dunParty").value) || gruppi[0];
  if (!gruppo) return;
  el("dunSubject").value = oggetto(azienda || {});
  el("dunText").value = testo(gruppo, { company: azienda || {}, party: anagrafiche.get(gruppo.partyId) || {} });
  el("dunDone").textContent = "";
}

/**
 * Apri il foglio sui clienti che hanno qualcosa di scaduto.
 *
 * Le rate le rilegge da `summary`, e non le riceve da chi apre: la schermata da cui si arriva può
 * essere ferma da un minuto, e un sollecito che cita una fattura incassata stamattina è il modo
 * più veloce per perdere un cliente.
 */
export async function open(db) {
  database = db;
  const { rows } = await summary(db);
  gruppi = perCliente(rows);
  anagrafiche = new Map((await parties(db)).map((p) => [p.id, p]));
  azienda = await get(db, "company", "company");

  const menu = el("dunParty");
  menu.textContent = "";
  for (const gruppo of gruppi) {
    const option = document.createElement("option");
    option.value = gruppo.partyId;
    const nome = (anagrafiche.get(gruppo.partyId) || {}).denominazione || "—";
    option.textContent = `${nome} — ${money(gruppo.totale)}`;
    menu.append(option);
  }
  if (!gruppi.length) {
    const option = document.createElement("option");
    option.textContent = t("solleciteNobody");
    menu.append(option);
    el("dunText").value = "";
    el("dunSubject").value = "";
  } else {
    _mostra();
  }
  el("dunCopy").disabled = gruppi.length === 0;
  el("dunDialog").showModal();
}

/** Quanti clienti hanno qualcosa di scaduto: decide se il comando si mostra. */
export function quanti(rows) {
  return perCliente(rows).length;
}

export function connect(db) {
  database = db;
  el("dunCancel").addEventListener("click", () => el("dunDialog").close());
  el("dunParty").addEventListener("change", _mostra);
  el("dunCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el("dunText").value);
      el("dunDone").textContent = t("solleciteCopied");
    } catch (ignored) {
      // Senza il permesso degli appunti resta il modo di sempre: il testo si seleziona da sé, e la
      // riga accanto lo dice. Un pulsante che non fa niente e non spiega niente è peggio di un
      // pulsante che non c'è.
      el("dunText").select();
      el("dunDone").textContent = t("solleciteCopyManual");
    }
  });
}
