// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

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
import { money, date as shownDate, days } from "./format.js";
import { summary } from "./schedule.js";
import { parties } from "./parties.js";
import { activities, saveActivity } from "./crm.js";
import { currentDay } from "./day.js";

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
export function perCliente(rows, { today = currentDay() } = {}) {
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
export function testo(gruppo, { company = {}, party = {}, tono = 1 } = {}) {
  // **Il secondo sollecito è più fermo, non più lungo.** Dice che c'è già stata una richiesta e
  // chiede una data; la formula sul pagamento già partito resta, perché resta vera.
  const fermo = Number(tono) === 2;
  const righe = gruppo.righe.map((riga) => tf("solleciteRow", {
    numero: riga.numero || "—",
    scadenza: shownDate(riga.scadenza),
    importo: money(riga.importo),
    giorni: days(riga.giorni),
  }));
  const iban = (company.conti || []).find((conto) => conto.predefinito && conto.iban)
    || (company.conti || []).find((conto) => conto.iban);
  return [
    tf("solleciteHello", { cliente: party.denominazione || "" }),
    "",
    t(fermo ? "solleciteLead2" : "solleciteLead"),
    "",
    righe.join("\n"),
    "",
    tf("solleciteTotal", { totale: money(gruppo.totale) }),
    ...(iban ? ["", tf("solleciteIban", { iban: iban.iban })] : []),
    "",
    t(fermo ? "solleciteClosing2" : "solleciteClosing"),
    "",
    t("solleciteRegards"),
    company.denominazione || "",
  ].join("\n");
}

/**
 * A chi si manda: la prima email fra le persone di riferimento del cliente.
 *
 * **Non la PEC**, e non è una svista. La posta certificata è il canale degli atti — una diffida,
 * una comunicazione che deve fare data certa — e un sollecito è una cosa che si scrive all'ufficio
 * pagamenti, non un atto. Mandarlo via PEC alza il tono di due gradi senza volerlo, e la prima
 * risposta arriva dall'amministrazione invece che da chi paga.
 *
 * Vuoto quando non c'è: il messaggio si apre lo stesso, con il destinatario da scrivere a mano, e
 * il foglio dice che in anagrafica quell'indirizzo manca.
 */
export function destinatario(party = {}) {
  const persona = (party.contatti || []).find((one) => String(one.email || "").includes("@"));
  return persona ? String(persona.email).trim() : "";
}

/** L'indirizzo `mailto:` con oggetto e testo già dentro. */
export function mailto(gruppo, { company = {}, party = {} } = {}) {
  const a = encodeURIComponent(destinatario(party));
  const oggettoQui = encodeURIComponent(oggetto(company));
  const corpo = encodeURIComponent(testo(gruppo, { company, party }));
  return `mailto:${a}?subject=${oggettoQui}&body=${corpo}`;
}

/** L'oggetto della email, che è la riga che decide se il resto viene letto. */
export function oggetto(company = {}, tono = 1) {
  return tf(Number(tono) === 2 ? "solleciteSubject2" : "solleciteSubject", { azienda: company.denominazione || "" });
}

/**
 * Il gruppo ridotto alle rate scelte, con il totale rifatto.
 *
 * Non tutto quello che è scaduto si sollecita: una rata concordata a voce, una fattura contestata
 * di cui si sta parlando. Il foglio le propone tutte spuntate e chi scrive toglie quelle che non
 * vanno; il totale segue, perché un totale che non torna con le righe è il primo errore che chi
 * riceve trova.
 */
export function scelte(gruppo, chiavi) {
  const righe = gruppo.righe.filter((riga) => chiavi.has(chiaveRata(riga)));
  return {
    ...gruppo,
    righe,
    totale: righe.reduce((somma, riga) => somma + riga.importo, 0n),
    giorni: righe.reduce((massimo, riga) => Math.max(massimo, riga.giorni), 0),
  };
}

/** La chiave di una rata nel foglio: documento e scadenza. */
export function chiaveRata(riga) {
  return `${riga.docId}|${riga.scadenza}`;
}

/**
 * Il tono proposto: il secondo se nel diario c'è già un sollecito a questo cliente scritto dopo la
 * scadenza della rata più vecchia fra quelle scelte. Quella richiesta riguardava gli stessi soldi,
 * e ripetere il primo testo farebbe finta che non ci sia stata.
 */
export function tonoProposto(gruppo, diario) {
  const prima = gruppo.righe.reduce((min, riga) => (!min || riga.scadenza < min ? riga.scadenza : min), "");
  const gia = (diario || []).some((voce) => voce.partyId === gruppo.partyId && voce.sollecito
    && (!prima || String(voce.data) >= String(prima)));
  return gia ? 2 : 1;
}

/** La riga del diario che dice che il sollecito è partito: quale, per quali fatture, per quanto. */
export function vocePerDiario(gruppo, tono) {
  const numeri = gruppo.righe.map((riga) => riga.numero || "—").join(", ");
  return tf(Number(tono) === 2 ? "solleciteDiary2" : "solleciteDiary", { numeri, totale: money(gruppo.totale) });
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   f o g l i o
// -----------------------------------------------------------------------------------------------------------------

let database = null;                                     // il deposito, tenuto per le riaperture
let gruppi = [];
let anagrafiche = new Map();
let azienda = null;
let diario = [];
let spuntate = new Set();                                // le rate scelte, per chiave
let annotati = new Set();                                // i clienti già scritti nel diario in questa apertura

function el(id) {
  return document.getElementById(id);
}

/** Il gruppo del cliente scelto nel menù. */
function _gruppo() {
  return gruppi.find((uno) => uno.partyId === el("dunParty").value) || gruppi[0];
}

/** Le rate del cliente, una spunta ciascuna, tutte scelte. */
function _disegnaRate(gruppo) {
  const box = el("dunRows");
  box.textContent = "";
  spuntate = new Set(gruppo.righe.map(chiaveRata));
  for (const riga of gruppo.righe) {
    const label = document.createElement("label");
    label.className = "check";
    const spunta = document.createElement("input");
    spunta.type = "checkbox";
    spunta.checked = true;
    spunta.addEventListener("change", () => {
      if (spunta.checked) spuntate.add(chiaveRata(riga));
      else spuntate.delete(chiaveRata(riga));
      _scrivi();
    });
    const testoRiga = document.createElement("span");
    testoRiga.textContent = `${riga.numero || "—"} · ${shownDate(riga.scadenza)} · ${money(riga.importo)}`;
    label.append(spunta, testoRiga);
    box.append(label);
  }
}

/** Oggetto e testo, dalle rate scelte e dal tono. */
function _scrivi() {
  const gruppo = _gruppo();
  if (!gruppo) return;
  const cliente = anagrafiche.get(gruppo.partyId) || {};
  const ridotto = scelte(gruppo, spuntate);
  const tono = Number(el("dunTone").value) || 1;
  el("dunSubject").value = oggetto(azienda || {}, tono);
  el("dunText").value = ridotto.righe.length ? testo(ridotto, { company: azienda || {}, party: cliente, tono }) : "";
  const vuoto = ridotto.righe.length === 0;
  el("dunCopy").disabled = vuoto;
  el("dunMail").disabled = vuoto;
}

/** Riscrive tutto per il cliente scelto nel menù. */
function _mostra() {
  const gruppo = _gruppo();
  if (!gruppo) return;
  const cliente = anagrafiche.get(gruppo.partyId) || {};
  const a = destinatario(cliente);
  el("dunTo").value = a;
  el("dunTo").placeholder = a ? "" : t("solleciteNoAddress");
  _disegnaRate(gruppo);
  el("dunTone").value = String(tonoProposto(gruppo, diario));
  _scrivi();
  el("dunDone").textContent = "";
}

/**
 * Il sollecito nel diario del cliente, una volta per apertura.
 *
 * Scritto quando il testo esce — copiato o aperto nella posta — perché è il momento più vicino
 * all'invio che l'app possa vedere. È una riga di tipo «email» con la marca `sollecito`, ed è da lì
 * che la volta dopo il foglio propone il tono più fermo.
 */
async function _annota() {
  const gruppo = _gruppo();
  if (!gruppo || annotati.has(gruppo.partyId)) return;
  const ridotto = scelte(gruppo, spuntate);
  if (!ridotto.righe.length) return;
  const tono = Number(el("dunTone").value) || 1;
  try {
    const voce = await saveActivity(database, {
      partyId: gruppo.partyId, tipo: "email", data: currentDay(), testo: vocePerDiario(ridotto, tono), sollecito: tono,
    });
    annotati.add(gruppo.partyId);
    diario.push(voce);
  } catch (ignored) {
    // The diary is a convenience: a refused write must not stop the reminder from leaving.
  }
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
  diario = await activities(db);
  annotati = new Set();

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
    // The address of the customer reminded last time stayed in the field with nobody to remind.
    el("dunTo").value = "";
    el("dunRows").textContent = "";
    el("dunCopy").disabled = true;
    el("dunMail").disabled = true;
  } else {
    _mostra();
  }
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
  el("dunTone").addEventListener("change", _scrivi);
  // La posta si apre con il programma di chi usa l'app: l'indirizzo `mailto:` porta oggetto e
  // testo già dentro, e il destinatario quando l'anagrafica ce l'ha. Da lì in poi decide una
  // persona — che è il punto in cui un sollecito si sbaglia, e l'unico posto in cui va deciso.
  el("dunMail").addEventListener("click", () => {
    const gruppo = gruppi.find((uno) => uno.partyId === el("dunParty").value) || gruppi[0];
    if (!gruppo) return;
    const cliente = anagrafiche.get(gruppo.partyId) || {};
    // Il testo che si apre è quello che si vede, corretto a mano compreso: `mailto` si costruisce
    // dal campo e non dal modello, o le modifiche di chi scrive resterebbero nel foglio.
    const corpo = encodeURIComponent(el("dunText").value);
    const soggetto = encodeURIComponent(el("dunSubject").value);
    const a = encodeURIComponent(el("dunTo").value.trim());
    window.location.href = `mailto:${a}?subject=${soggetto}&body=${corpo}`;
    _annota().then(() => { el("dunDone").textContent = t("solleciteLogged"); });
  });

  el("dunCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el("dunText").value);
      await _annota();
      el("dunDone").textContent = `${t("solleciteCopied")} ${t("solleciteLogged")}`;
    } catch (ignored) {
      // Senza il permesso degli appunti resta il modo di sempre: il testo si seleziona da sé, e la
      // riga accanto lo dice. Un pulsante che non fa niente e non spiega niente è peggio di un
      // pulsante che non c'è.
      el("dunText").select();
      el("dunDone").textContent = t("solleciteCopyManual");
    }
  });
}
