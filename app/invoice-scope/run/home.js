// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La Situazione: quello che si guarda aprendo l'app, in una schermata sola.
//
// **Risponde a due domande, nell'ordine.** «Chi mi deve dei soldi, e da quanto?» sta in cima —
// i quattro numeri, le scadenze, chi deve di più — perché è quello che un piccolo imprenditore
// guarda ogni mattina. «Come sta andando?» viene dopo: il fatturato per mese contro l'anno scorso,
// i progetti con le loro scadenze, i preventivi che aspettano una risposta, le bozze lasciate a
// metà. Tutto quello che nel sistema può aspettare qualcuno finisce qui, così non aspetta in
// silenzio.
//
// **I conti stanno da una parte, il disegno dall'altra.** Le funzioni `figures`, `byMonth`,
// `topParties`, `projectRows`, `openQuotes` e `drafts` ricevono dati e restituiscono numeri: si
// provano in Node senza un browser. Il disegno le chiama e basta.
//
// **I grafici sono SVG scritti a mano**, con i colori del tema: niente librerie, per la ragione
// scritta in `app/CLAUDE.md`, e il tema chiaro li ridisegna da solo perché i colori sono variabili
// CSS e non numeri dentro il file.

import * as plan from "gg/plan-model.js";

import { t, tf } from "./i18n.js";
import { kind, numero as shownNumber } from "./kinds.js";
import { label as statoLabel } from "./states.js";
import { signedTotal, editable } from "./model.js";
import { money, date as shownDate } from "./format.js";
import * as progetti from "./projects.js";
import { costOf, payable, taxBalance, signedTotal as costTotal } from "./costs.js";
import { expected } from "./recurring.js";
import { from } from "./decimal.js";

/** Quante righe mostra ogni riquadro. Cinque è quello che si legge senza scorrere. */
export const ROWS = 5;

/** Un preventivo che scade entro questi giorni si segnala: dopo, di solito, è già una risposta. */
export const QUOTE_WARNING_DAYS = 7;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

const SVG = "http://www.w3.org/2000/svg";

function _svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** Giorni interi fra due date ISO, positivi se `a` viene dopo `b`. */
function _days(a, b) {
  const one = Date.UTC(...String(a).slice(0, 10).split("-").map((x, i) => Number(x) - (i === 1 ? 1 : 0)));
  const two = Date.UTC(...String(b).slice(0, 10).split("-").map((x, i) => Number(x) - (i === 1 ? 1 : 0)));
  return Math.round((one - two) / 86400000);
}

/** I documenti che contano nel fatturato: fiscali ed emessi. Le note di credito tolgono. */
function _invoiced(docs) {
  return docs.filter((doc) => doc.totali && kind(doc).fiscale);
}

/**
 * L'imponibile di un documento emesso, con il segno: è quello che entra nel margine.
 *
 * Il totale no: per un'azienda italiana l'IVA incassata non è sua, e un margine calcolato sui
 * lordi direbbe un numero che il commercialista non riconosce.
 */
function _net(doc) {
  let valore = 0n;
  try { valore = BigInt(doc.totali.imponibile || 0); } catch (ignored) { valore = 0n; }
  return kind(doc).storna ? -valore : valore;
}

function _row(cells, href) {
  const tr = document.createElement("tr");
  tr.className = "clickable";
  tr.tabIndex = 0;
  const go = () => { location.hash = href; };
  tr.addEventListener("click", go);
  tr.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      go();
    }
  });
  for (const [text, classe] of cells) {
    const td = document.createElement("td");
    td.textContent = text;
    if (classe) td.className = classe;
    tr.append(td);
  }
  return tr;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i   c o n t i
// -----------------------------------------------------------------------------------------------------------------

/**
 * I quattro numeri, con quello che li qualifica.
 *
 * Il confronto con l'anno scorso è **a oggi**: il fatturato fino allo stesso giorno dell'anno
 * prima, non l'anno intero. A settembre, «−40% sull'anno scorso» contro dodici mesi sarebbe una
 * notizia falsa.
 */
export function figures(docs, owed, { today = new Date().toISOString().slice(0, 10), costs = [], outlays = [], attesi = [] } = {}) {
  const anno = today.slice(0, 4);
  const scorso = String(Number(anno) - 1);
  const giornoScorso = `${scorso}${today.slice(4)}`;
  const emesse = _invoiced(docs);
  const somma = (rows) => rows.reduce((sum, doc) => sum + (signedTotal(doc) || 0n), 0n);

  const fatturato = somma(emesse.filter((doc) => String(doc.data).startsWith(anno)));
  const fatturatoScorso = somma(emesse.filter((doc) =>
    String(doc.data).startsWith(scorso) && String(doc.data).slice(0, 10) <= giornoScorso));

  let delta = null;
  if (fatturatoScorso > 0n) {
    // In centesimi di punto, poi arrotondato: BigInt non ha virgola.
    delta = Number((fatturato - fatturatoScorso) * 1000n / fatturatoScorso) / 10;
  }

  const scadute = owed.rows.filter((row) => row.scaduta);
  const piuVecchia = scadute.length
    ? Math.max(...scadute.map((row) => _days(today, row.scadenza)))
    : 0;

  const aperti = plan.liveProjects();
  const fasi = aperti.flatMap((record) => progetti.billable(record.id));
  const daFatturare = aperti.reduce((sum, record) => sum + progetti.billableTotal(record.id), 0n);

  // Il margine: ricavi meno costi, tutt'e due senza l'imposta che torna. Solo se ci sono acquisti,
  // altrimenti sarebbe il fatturato con un altro nome.
  const ricavi = emesse.filter((doc) => String(doc.data).startsWith(anno)).reduce((sum, doc) => sum + _net(doc), 0n);
  const costiAnno = costs.filter((c) => String(c.data).startsWith(anno)).reduce((sum, c) => sum + costOf(c), 0n);
  const daPagare = payable(costs, outlays, { today });

  // Il previsionale: i costi di quest'anno più gli attesi fino a dicembre. Solo con una
  // ricorrenza, altrimenti è il numero dei costi con un altro nome.
  const attesiAnno = attesi.filter((a) => String(a.data).startsWith(anno));
  const previsti = attesiAnno.reduce((sum, a) => sum + costOf(a), 0n);
  const limite = new Date(Date.UTC(...today.slice(0, 10).split("-").map((x, i) => Number(x) - (i === 1 ? 1 : 0))) + 30 * 86400000)
    .toISOString().slice(0, 10);
  const attesiVicini = attesi.filter((a) => a.data <= limite);

  return {
    haAttesi: attesi.length > 0,
    attesiQuanti: attesiAnno.length,
    costiPrevisti: previsti,
    costiFineAnno: costiAnno + previsti,
    attesiTrentaGiorni: attesiVicini.reduce((sum, a) => sum + costTotal(a), 0n),
    attesiTrentaQuanti: attesiVicini.length,
    ricavi,
    costi: costiAnno,
    margine: ricavi - costiAnno,
    haCosti: costs.length > 0,
    daPagare: daPagare.reduce((sum, row) => sum + row.importo, 0n),
    daPagareQuante: daPagare.length,
    daPagareScadute: daPagare.filter((row) => row.scaduta).length,
    daPagareRows: daPagare,
    fatturato,
    fatturatoScorso,
    delta,
    daIncassare: owed.total,
    scadenzeAperte: owed.rows.length,
    scaduto: scadute.reduce((sum, row) => sum + row.importo, 0n),
    scaduteQuante: scadute.length,
    ritardoMassimo: piuVecchia,
    daFatturare,
    fasiDaFatturare: fasi.length,
  };
}

/**
 * Il fatturato mese per mese, per gli ultimi dodici mesi, e lo stesso mese dell'anno prima.
 *
 * Restituisce dodici voci, dalla più vecchia alla più recente: `{ mese, anno, valore, prima,
 * ricavi, costi }` dove `mese` è 1–12, `prima` è il valore dello stesso mese dell'anno precedente,
 * e `ricavi` e `costi` sono gli imponibili del mese — il margine è la loro differenza.
 */
export function byMonth(docs, { today = new Date().toISOString().slice(0, 10), costs = [] } = {}) {
  const emesse = _invoiced(docs);
  const totali = new Map();
  const netti = new Map();
  for (const doc of emesse) {
    const chiave = String(doc.data).slice(0, 7);
    totali.set(chiave, (totali.get(chiave) || 0n) + (signedTotal(doc) || 0n));
    netti.set(chiave, (netti.get(chiave) || 0n) + _net(doc));
  }
  const spese = new Map();
  for (const record of costs) {
    const chiave = String(record.data).slice(0, 7);
    spese.set(chiave, (spese.get(chiave) || 0n) + costOf(record));
  }
  const out = [];
  let anno = Number(today.slice(0, 4));
  let mese = Number(today.slice(5, 7));
  for (let i = 0; i < 12; i += 1) {
    const chiave = `${anno}-${String(mese).padStart(2, "0")}`;
    const prima = `${anno - 1}-${String(mese).padStart(2, "0")}`;
    out.unshift({
      mese, anno,
      valore: totali.get(chiave) || 0n, prima: totali.get(prima) || 0n,
      ricavi: netti.get(chiave) || 0n, costi: spese.get(chiave) || 0n,
    });
    mese -= 1;
    if (mese === 0) {
      mese = 12;
      anno -= 1;
    }
  }
  return out;
}

/**
 * Le imposte del periodo: il trimestre in corso e l'anno a oggi.
 *
 * Per un'azienda italiana è la liquidazione — IVA sulle vendite, IVA sugli acquisti, il saldo da
 * versare o a credito. Per una sammarinese il saldo non esiste, e la riga dice quanta monofase è
 * stata pagata sugli acquisti. `taxBalance` sa già tutto questo; qui si scelgono i due periodi.
 * Nessun numero che l'app inventa: è la somma di quello che c'è, e il commercialista fa il resto.
 */
export function taxFigures(docs, costs, { today = new Date().toISOString().slice(0, 10), company = null } = {}) {
  const anno = today.slice(0, 4);
  const mese = Number(today.slice(5, 7));
  const primo = Math.floor((mese - 1) / 3) * 3 + 1;
  const mesi = [primo, primo + 1, primo + 2].map((m) => `${anno}-${String(m).padStart(2, "0")}`);
  const somma = (periodi) => periodi
    .map((periodo) => taxBalance(docs, costs, periodo, { company, kindOf: kind }))
    .reduce((acc, uno) => ({
      tipo: uno.tipo,
      debito: acc.debito + uno.debito,
      credito: acc.credito + uno.credito,
      saldo: acc.saldo + uno.saldo,
      monofase: acc.monofase + uno.monofase,
    }), { debito: 0n, credito: 0n, saldo: 0n, monofase: 0n });
  return {
    tipo: taxBalance([], [], anno, { company }).tipo,
    trimestre: { numero: Math.floor((mese - 1) / 3) + 1, anno, ...somma(mesi) },
    anno: { anno, ...somma([anno]) },
  };
}

/**
 * L'anno solare mese per mese — gennaio–dicembre di quest'anno — con ricavi e costi imponibili e,
 * nei mesi a venire, i costi attesi dalle ricorrenze. È il grafico del previsionale: la finestra
 * degli ultimi dodici mesi va bene per «come sta andando», questa per «come finisce l'anno».
 */
export function byYear(docs, costs, attesi, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const anno = Number(today.slice(0, 4));
  const netti = new Map();
  for (const doc of _invoiced(docs)) {
    const chiave = String(doc.data).slice(0, 7);
    netti.set(chiave, (netti.get(chiave) || 0n) + _net(doc));
  }
  const spese = new Map();
  for (const record of costs) {
    const chiave = String(record.data).slice(0, 7);
    spese.set(chiave, (spese.get(chiave) || 0n) + costOf(record));
  }
  const previsti = new Map();
  for (const record of attesi) {
    const chiave = String(record.data).slice(0, 7);
    previsti.set(chiave, (previsti.get(chiave) || 0n) + costOf(record));
  }
  return Array.from({ length: 12 }, (_, i) => {
    const chiave = `${anno}-${String(i + 1).padStart(2, "0")}`;
    return { mese: i + 1, anno, ricavi: netti.get(chiave) || 0n, costi: spese.get(chiave) || 0n, attesi: previsti.get(chiave) || 0n, valore: 0n, prima: 0n };
  });
}

/**
 * Le fasce dell'insoluto: quanto è scaduto, e da quanto.
 *
 * **Le fasce sono quelle che usa chiunque sollecita**, e non sono un'invenzione di questa app:
 * entro trenta giorni è un ritardo che si risolve con una telefonata, oltre novanta è un credito
 * che va trattato come tale. Averle divise cambia la domanda da «quanto mi devono» — che i quattro
 * numeri in cima dicono già — a «quanto di quello che mi devono sta diventando un problema».
 *
 * La prima fascia non è un ritardo: è quello che deve ancora arrivare, e sta nel grafico perché
 * senza si leggerebbe una montagna di scaduto senza sapere quanto pesa sul totale.
 */
export const FASCE = [
  { key: "corrente", da: null, a: 0 },
  { key: "g30", da: 1, a: 30 },
  { key: "g60", da: 31, a: 60 },
  { key: "g90", da: 61, a: 90 },
  { key: "oltre", da: 91, a: null },
];

export function aging(owedRows, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const per = new Map(FASCE.map((fascia) => [fascia.key, { key: fascia.key, importo: 0n, quante: 0 }]));
  for (const row of owedRows || []) {
    // Una rata senza scadenza è dovuta a vista: scade il giorno stesso, come nello scadenzario.
    const giorni = _days(today, row.scadenza || today);
    const fascia = FASCE.find((f) => (f.da === null || giorni >= f.da) && (f.a === null || giorni <= f.a));
    const voce = per.get((fascia || FASCE[0]).key);
    voce.importo += row.importo;
    voce.quante += 1;
  }
  return [...per.values()];
}

/**
 * Fatturato e incassato mese per mese, negli ultimi dodici mesi.
 *
 * **Sono due curve che non coincidono mai, ed è il punto.** Il fatturato dice quanto lavoro è
 * uscito, l'incassato quanto denaro è entrato: la distanza fra le due è il credito che si sta
 * accumulando, e un mese buono di fatture con l'incassato piatto è la cosa che si vede qui e da
 * nessun'altra parte.
 *
 * L'incasso conta nel mese in cui è arrivato, non in quello della fattura: è denaro, e il denaro
 * ha la data del giorno in cui si è mosso.
 */
export function cashByMonth(docs, payments, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const fatturato = new Map();
  for (const doc of _invoiced(docs)) {
    const chiave = String(doc.data).slice(0, 7);
    fatturato.set(chiave, (fatturato.get(chiave) || 0n) + (signedTotal(doc) || 0n));
  }
  const incassato = new Map();
  for (const payment of payments || []) {
    const chiave = String(payment.data || "").slice(0, 7);
    if (chiave.length !== 7) continue;
    let importo = 0n;
    try { importo = from(String(payment.importo || "0")); } catch (ignored) { importo = 0n; }
    incassato.set(chiave, (incassato.get(chiave) || 0n) + importo);
  }
  const out = [];
  let anno = Number(today.slice(0, 4));
  let mese = Number(today.slice(5, 7));
  for (let i = 0; i < 12; i += 1) {
    const chiave = `${anno}-${String(mese).padStart(2, "0")}`;
    out.unshift({
      mese, anno, valore: 0n, prima: 0n,
      fatturato: fatturato.get(chiave) || 0n,
      incassato: incassato.get(chiave) || 0n,
    });
    mese -= 1;
    if (mese === 0) {
      mese = 12;
      anno -= 1;
    }
  }
  return out;
}

/**
 * Come pagano i clienti: la media dei giorni fra la scadenza e l'incasso.
 *
 * Negativa vuol dire in anticipo, positiva in ritardo. Si contano solo le fatture **saldate**: una
 * fattura ancora aperta non ha una risposta, e contarla come «zero giorni» direbbe che quel cliente
 * paga puntuale mentre sta semplicemente non pagando.
 *
 * **Gli incassi importati da un altro programma restano fuori**, ed è la riga che tiene onesta
 * tutta la classifica: un registro non dice quando il denaro è arrivato, quindi l'importazione
 * scrive come data quella di scadenza. Contarli darebbe a ogni cliente una puntualità perfetta —
 * una classifica falsa costruita su dati veri.
 *
 * Servono almeno due fatture saldate per comparire: una media su una fattura sola non è una media.
 */
export function payers(docs, payments, { limit = ROWS, minimo = 2 } = {}) {
  const suoi = new Map();
  for (const payment of payments || []) {
    if (payment.importato) continue;
    if (!suoi.has(payment.docId)) suoi.set(payment.docId, []);
    suoi.get(payment.docId).push(payment);
  }

  const per = new Map();
  for (const doc of _invoiced(docs)) {
    if (kind(doc).storna || !kind(doc).deve) continue;
    const incassi = suoi.get(doc.id) || [];
    if (!incassi.length) continue;
    let arrivato = 0n;
    for (const payment of incassi) {
      try { arrivato += from(String(payment.importo || "0")); } catch (ignored) { /* una riga storta vale zero */ }
    }
    let totale = 0n;
    try { totale = BigInt(doc.totali.totale || 0); } catch (ignored) { totale = 0n; }
    if (totale <= 0n || arrivato < totale) continue;

    // L'ultimo incasso chiude la fattura, e l'ultima rata è la data entro cui doveva chiudersi.
    const ultimo = incassi.map((one) => String(one.data)).sort().pop();
    const rate = ((doc.pagamento || {}).rate || []).map((r) => String(r.scadenza || "")).filter(Boolean).sort();
    const scadenza = rate.length ? rate[rate.length - 1] : String(doc.data);
    const voce = per.get(doc.partyId) || { partyId: doc.partyId, giorni: 0, quante: 0, importo: 0n, somma: 0 };
    voce.somma += _days(ultimo, scadenza);
    voce.quante += 1;
    voce.importo += totale;
    per.set(doc.partyId, voce);
  }

  return [...per.values()]
    .filter((voce) => voce.quante >= minimo)
    .map((voce) => ({ ...voce, giorni: Math.round(voce.somma / voce.quante) }))
    .sort((a, b) => a.giorni - b.giorni || (a.importo < b.importo ? 1 : -1))
    .slice(0, limit);
}

/** I clienti con più da incassare, dal più esposto: `{ partyId, importo, scadute }`. */
export function topParties(owedRows, { limit = ROWS } = {}) {
  const per = new Map();
  for (const row of owedRows) {
    const voce = per.get(row.partyId) || { partyId: row.partyId, importo: 0n, scadute: 0n };
    voce.importo += row.importo;
    if (row.scaduta) voce.scadute += row.importo;
    per.set(row.partyId, voce);
  }
  return [...per.values()]
    .filter((voce) => voce.importo > 0n)
    .sort((a, b) => (a.importo < b.importo ? 1 : a.importo > b.importo ? -1 : 0))
    .slice(0, limit);
}

/**
 * I progetti aperti, con il ritardo se ce l'hanno.
 *
 * Una fase non fatta con la scadenza passata è un ritardo, e il ritardo del progetto è quello
 * della fase più indietro. Senza ritardi, la prossima scadenza. Ordinati: prima chi è in ritardo,
 * di più; poi per prossima scadenza; poi chi non ne ha.
 */
export function projectRows({ today = new Date().toISOString().slice(0, 10), limit = ROWS } = {}) {
  const rows = plan.liveProjects().map((record) => {
    const done = (record.columns || []).find((column) => column.done);
    const aperte = plan.tasksOf(record.id).filter((task) => !done || task.status !== done.id);
    const conData = aperte.filter((task) => task.end).map((task) => String(task.end).slice(0, 10));
    const passate = conData.filter((end) => end < today);
    const future = conData.filter((end) => end >= today).sort();
    const avanzamento = plan.progressOf(record.id);
    return {
      id: record.id,
      name: record.name || "",
      partyId: record.partyId || "",
      fatte: avanzamento.done,
      tutte: avanzamento.total,
      ritardo: passate.length ? Math.max(...passate.map((end) => _days(today, end))) : 0,
      prossima: future[0] || null,
      daFatturare: progetti.billableTotal(record.id),
    };
  });
  rows.sort((a, b) => {
    if (a.ritardo !== b.ritardo) return b.ritardo - a.ritardo;
    if (a.prossima && b.prossima) return a.prossima.localeCompare(b.prossima);
    if (a.prossima || b.prossima) return a.prossima ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return rows.slice(0, limit);
}

/**
 * I preventivi che aspettano una risposta: emessi o inviati, non ancora accettati né rifiutati.
 * Prima quelli che scadono prima. `giorni` è quanto manca alla scadenza, negativo se passata.
 */
export function openQuotes(docs, { today = new Date().toISOString().slice(0, 10), limit = ROWS } = {}) {
  return docs
    .filter((doc) => doc.tipo === "preventivo" && ["emesso", "inviato"].includes(doc.stato))
    .map((doc) => ({
      doc,
      giorni: doc.validoFino ? _days(doc.validoFino, today) : null,
    }))
    .sort((a, b) => {
      if (a.giorni === null || b.giorni === null) return a.giorni === null ? 1 : -1;
      return a.giorni - b.giorni;
    })
    .slice(0, limit);
}

/** Le bozze, dalla più recente: quello che si è lasciato a metà. */
export function drafts(docs, { limit = ROWS } = {}) {
  return docs
    .filter((doc) => editable(doc))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    .slice(0, limit);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i l   d i s e g n o
// -----------------------------------------------------------------------------------------------------------------

/** Le barre dei mesi: quest'anno pieno, l'anno scorso dietro, in tinta più chiara. */
export function drawMonths(container, mesi, { back = "prima", front = "valore", backClass = "before", frontClass = "now", title = "homeMonths", empty = "homeMonthsEmpty", stack = null, tooltip = null } = {}) {
  container.textContent = "";
  // Con una terza serie impilata sulla seconda — i costi attesi sopra quelli veri — il massimo
  // è la somma delle due, o la pila sfonderebbe il riquadro.
  const dietroDi = (m) => m[back] + (stack ? (m[stack] || 0n) : 0n);
  const massimo = mesi.reduce((max, m) => (m[front] > max ? m[front] : dietroDi(m) > max ? dietroDi(m) : max), 0n);
  if (massimo === 0n) {
    const nota = document.createElement("p");
    nota.className = "note";
    nota.textContent = t(empty);
    container.append(nota);
    return;
  }
  // Largo quanto il riquadro al momento del disegno: un `viewBox` fisso stirato con
  // `preserveAspectRatio="none"` schiacciava le lettere dei mesi sul telefono.
  const W = Math.max(320, container.clientWidth || 720);
  const H = 170;
  const bottom = 24;
  const top = 10;
  const passo = W / mesi.length;
  const larghezza = passo * 0.34;
  const scala = (valore) => Number((valore * 1000n) / massimo) / 1000 * (H - bottom - top);
  const lettere = t("monthLetters").split(" ");

  const svg = _svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "bars" });
  svg.setAttribute("aria-label", t(title));
  svg.append(_svg("line", { x1: 0, y1: H - bottom + 0.5, x2: W, y2: H - bottom + 0.5, class: "axis" }));
  mesi.forEach((m, i) => {
    const x = i * passo + passo / 2;
    const prima = scala(m[back]);
    const ora = scala(m[front]);
    // La serie di confronto dietro e spostata a sinistra, quella principale davanti: si vedono
    // tutt'e due anche quando una è molto più alta dell'altra.
    const dietro = _svg("rect", {
      x: x - larghezza, y: H - bottom - prima, width: larghezza, height: prima, class: backClass, rx: 2,
    });
    const davanti = _svg("rect", {
      x, y: H - bottom - ora, width: larghezza, height: ora, class: frontClass, rx: 2,
    });
    const titolo = _svg("title");
    // La frase del passaggio del mouse la decide chi chiama, quando le due serie non sono un
    // confronto fra anni né una differenza: fatturato e incassato si leggono affiancati, e
    // «incassato − fatturato» sarebbe una sottrazione che non significa niente.
    titolo.textContent = tooltip ? tooltip(m) : back === "prima"
      ? `${lettere[m.mese - 1]} ${m.anno}: ${money(m.valore)} · ${m.anno - 1}: ${money(m.prima)}`
      : `${lettere[m.mese - 1]} ${m.anno}: ${money(m[front])} − ${money(dietroDi(m))} = ${money(m[front] - dietroDi(m))}`
        + (stack && m[stack] > 0n ? ` (${t("homeExpectedShort")} ${money(m[stack])})` : "");
    davanti.append(titolo);
    svg.append(dietro, davanti);
    // Gli attesi: impilati sopra i costi veri, tratteggiati, perché non sono ancora successi.
    if (stack && m[stack] > 0n) {
      const altezza = scala(m[stack]);
      svg.append(_svg("rect", {
        x: x - larghezza, y: H - bottom - prima - altezza, width: larghezza, height: altezza, class: "expected", rx: 2,
      }));
    }
    const label = _svg("text", { x, y: H - 6, class: "label", "text-anchor": "middle" });
    label.textContent = lettere[m.mese - 1];
    svg.append(label);
  });
  container.append(svg);
}

/** Barre orizzontali: il nome, la barra, la cifra. La parte scaduta in tinta più scura. */
export function drawParties(container, rows, byParty, { href = (row) => `#/cliente/${row.partyId}` } = {}) {
  container.textContent = "";
  const massimo = rows.reduce((max, row) => (row.importo > max ? row.importo : max), 0n);
  for (const row of rows) {
    const riga = document.createElement("a");
    riga.className = "hbar";
    riga.href = href(row);
    const nome = document.createElement("span");
    nome.className = "name";
    nome.textContent = byParty.get(row.partyId) || "—";
    const track = document.createElement("span");
    track.className = "track";
    const fill = document.createElement("span");
    fill.className = "fill";
    fill.style.width = `${Number((row.importo * 1000n) / massimo) / 10}%`;
    if (row.scadute > 0n) {
      const late = document.createElement("span");
      late.className = "late";
      late.style.width = `${Number((row.scadute * 1000n) / row.importo) / 10}%`;
      fill.append(late);
    }
    track.append(fill);
    const cifra = document.createElement("span");
    cifra.className = "amount";
    cifra.textContent = money(row.importo);
    riga.append(nome, track, cifra);
    container.append(riga);
  }
}

/**
 * Barre orizzontali per le fasce dell'insoluto: l'etichetta, la barra, la cifra.
 *
 * Le fasce vuote non si disegnano: una riga a zero occupa lo spazio di una che dice qualcosa. La
 * prima fascia — quello che deve ancora arrivare — porta la tinta normale, le altre quella dello
 * scaduto, perché è la distinzione che si legge da lontano.
 */
export function drawBuckets(container, rows) {
  container.textContent = "";
  const visibili = rows.filter((row) => row.importo > 0n);
  const massimo = visibili.reduce((max, row) => (row.importo > max ? row.importo : max), 0n);
  for (const row of visibili) {
    const riga = document.createElement("a");
    riga.className = "hbar";
    riga.href = "#/scadenzario";
    const nome = document.createElement("span");
    nome.className = "name";
    nome.textContent = t(`homeAging_${row.key}`);
    const track = document.createElement("span");
    track.className = "track";
    const fill = document.createElement("span");
    fill.className = "fill";
    fill.style.width = `${Number((row.importo * 1000n) / massimo) / 10}%`;
    if (row.key !== "corrente") {
      const late = document.createElement("span");
      late.className = "late";
      late.style.width = "100%";
      fill.append(late);
    }
    track.append(fill);
    const cifra = document.createElement("span");
    cifra.className = "amount";
    cifra.textContent = money(row.importo);
    riga.title = tf(row.quante === 1 ? "homeAgingOne" : "homeAgingMany", { quante: row.quante });
    riga.append(nome, track, cifra);
    container.append(riga);
  }
}

/**
 * Disegna tutto. `docs` sono i documenti dal più recente, `owed` è `summary(db)`, `byParty` i
 * nomi dei clienti per id.
 */
export function render({ docs, owed, byParty, payments = [], costs = [], outlays = [], recurring = [], company = null, today = new Date().toISOString().slice(0, 10) }) {
  const attesi = expected(recurring, costs, { today, company });
  const n = figures(docs, owed, { today, costs, outlays, attesi });

  el("figYear").textContent = money(n.fatturato);
  el("figYearDelta").textContent = n.delta === null
    ? (n.fatturato > 0n ? t("homeYearFirst") : "")
    : n.delta > 0 ? tf("homeYearUp", { pct: String(n.delta).replace(".", ",") })
      : n.delta < 0 ? tf("homeYearDown", { pct: String(-n.delta).replace(".", ",") })
        : t("homeYearSame");

  el("figDue").textContent = money(n.daIncassare);
  el("figDueSub").textContent = n.scadenzeAperte === 0 ? t("homeDueNone")
    : n.scadenzeAperte === 1 ? t("homeDueOne") : tf("homeDueSub", { quante: n.scadenzeAperte });

  el("figOverdue").textContent = money(n.scaduto);
  el("figOverdue").previousElementSibling.textContent = n.scaduteQuante
    ? tf("homeOverdueCount", { quante: n.scaduteQuante })
    : t("homeOverdue");
  el("figOverdueSub").textContent = n.scaduteQuante ? tf("homeOverdueSub", { giorni: n.ritardoMassimo }) : t("homeOverdueNone");

  el("figToBill").textContent = money(n.daFatturare);
  el("figToBillSub").textContent = n.fasiDaFatturare === 0 ? t("homeToBillNone")
    : n.fasiDaFatturare === 1 ? t("homeToBillOne") : tf("homeToBillSub", { quante: n.fasiDaFatturare });

  // I due numeri degli acquisti: compaiono con il primo acquisto registrato. Prima, un margine
  // uguale al fatturato e uno zero da pagare sarebbero due caselle che dicono «non usi questa
  // parte», e chi non la usa non deve leggerlo ogni mattina.
  el("figMargin").hidden = !n.haCosti;
  el("figToPay").hidden = !n.haCosti;
  if (n.haCosti) {
    el("figMarginValue").textContent = money(n.margine);
    el("figMarginValue").classList.toggle("bad", n.margine < 0n);
    el("figMarginSub").textContent = tf("homeMarginSub", { ricavi: money(n.ricavi), costi: money(n.costi) });
    el("figToPayValue").textContent = money(n.daPagare);
    el("figToPayValue").classList.toggle("bad", n.daPagareScadute > 0);
    el("figToPaySub").textContent = (n.daPagareQuante === 0 ? t("homeToPayNone")
      : n.daPagareScadute > 0 ? tf("homeToPayOverdue", { quante: n.daPagareQuante, scadute: n.daPagareScadute })
        : tf("homeToPaySub", { quante: n.daPagareQuante }))
      + (n.attesiTrentaQuanti ? ` · ${tf("homeToPayExpected", { quante: n.attesiTrentaQuanti, totale: money(n.attesiTrentaGiorni) })}` : "");
  }
  // Il previsionale: con almeno una ricorrenza. Costi dell'anno più gli attesi fino a dicembre.
  el("figForecast").hidden = !n.haAttesi;
  if (n.haAttesi) {
    el("figForecastValue").textContent = money(n.costiFineAnno);
    el("figForecastSub").textContent = tf("homeForecastSub", { attesi: money(n.costiPrevisti), quanti: n.attesiQuanti });
  }

  el("homeLists").hidden = docs.length === 0 && costs.length === 0;
  if (!docs.length && !costs.length) return;

  // Il fatturato per mese.
  const anno = today.slice(0, 4);
  el("legendNow").textContent = anno;
  el("legendBefore").textContent = String(Number(anno) - 1);
  const mesi = byMonth(docs, { today, costs });
  drawMonths(el("chartMonths"), mesi);

  // Ricavi e costi, mese per mese: il margine è la differenza fra le due barre, e il titolo di
  // ogni coppia la scrive. Solo con almeno un acquisto.
  // Con una ricorrenza la finestra diventa l'anno solare, e i mesi a venire portano gli attesi
  // impilati sui costi, tratteggiati: è il previsionale.
  el("wMargin").hidden = !n.haCosti;
  el("legendExpected").hidden = !n.haAttesi;
  el("marginTitle").textContent = t(n.haAttesi ? "homeForecastChart" : "homeMarginChart");
  if (n.haCosti) {
    drawMonths(el("chartMargin"), n.haAttesi ? byYear(docs, costs, attesi, { today }) : mesi, {
      back: "costi", front: "ricavi", backClass: "cost", frontClass: "now",
      title: n.haAttesi ? "homeForecastChart" : "homeMarginChart", empty: "homeMonthsEmpty",
      stack: n.haAttesi ? "attesi" : null,
    });
  }

  // Le imposte del periodo: con almeno una fattura emessa o un acquisto, altrimenti sono zeri.
  const imposte = taxFigures(docs, costs, { today, company });
  const haImposte = _invoiced(docs).length > 0 || costs.length > 0;
  el("wTax").hidden = !haImposte;
  if (haImposte) {
    const iva = imposte.tipo === "iva";
    el("taxTitle").textContent = t(iva ? "homeTaxIva" : "homeTaxMonofase");
    el("taxQuarterHead").textContent = tf("homeTaxQuarter", { n: imposte.trimestre.numero });
    el("taxYearHead").textContent = imposte.anno.anno;
    const righe = iva
      ? [["homeTaxSales", "debito"], ["homeTaxPurchases", "credito"], ["homeTaxBalance", "saldo"]]
      : [["homeTaxSales", "debito"], ["homeTaxMonofasePaid", "monofase"]];
    const body = el("homeTaxBody");
    body.textContent = "";
    for (const [chiave, campo] of righe) {
      const tr = document.createElement("tr");
      if (campo === "saldo") tr.className = "total";
      for (const [text, classe] of [
        [campo === "saldo" && imposte.anno.saldo < 0n ? t("homeTaxCredit") : t(chiave), null],
        [money(imposte.trimestre[campo]), "right"],
        [money(imposte.anno[campo]), "right"],
      ]) {
        const td = document.createElement("td");
        td.textContent = text;
        if (classe) td.className = classe;
        tr.append(td);
      }
      body.append(tr);
    }
  }

  // A chi devo di più: come «chi deve di più», nel verso opposto, e con la stessa soglia.
  const creditori = topParties(n.daPagareRows);
  el("wSuppliers").hidden = creditori.length < 2;
  if (creditori.length >= 2) drawParties(el("chartSuppliers"), creditori, byParty, { href: () => "#/acquisti" });

  // Le prossime scadenze.
  const prossime = [...owed.rows]
    .sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)))
    .slice(0, ROWS);
  const dueBody = el("homeDueBody");
  dueBody.textContent = "";
  el("homeDueEmpty").hidden = prossime.length > 0;
  el("homeDueTable").hidden = prossime.length === 0;
  for (const row of prossime) {
    const quando = row.scaduta ? `${shownDate(row.scadenza)} · ${t("dueOverdue")}` : shownDate(row.scadenza);
    dueBody.append(_row([
      [quando, row.scaduta ? "nowrap overdue" : "nowrap"],
      [byParty.get(row.partyId) || "—", "nowrap"],
      [money(row.importo), "right"],
    ], `#/documento/${row.docId}`));
  }

  // Chi deve di più: solo se c'è più di un cliente esposto, altrimenti dice quello che dicono
  // già le scadenze qui accanto.
  const esposti = topParties(owed.rows);
  el("wParties").hidden = esposti.length < 2;
  if (esposti.length >= 2) drawParties(el("chartParties"), esposti, byParty);

  // L'insoluto per età. Con una rata sola non c'è una ripartizione da guardare: il numero in cima
  // e la riga nelle scadenze dicono già tutto.
  const fasce = aging(owed.rows, { today });
  const conImporto = fasce.filter((f) => f.importo > 0n);
  el("wAging").hidden = owed.rows.length < 2 || conImporto.length < 2;
  if (!el("wAging").hidden) drawBuckets(el("chartAging"), fasce);

  // Fatturato e incassato, mese per mese. Compare con il primo incasso registrato: senza, sarebbe
  // il grafico del fatturato disegnato due volte, una delle quali piatta.
  const cassa = cashByMonth(docs, payments, { today });
  const haIncassi = payments.some((one) => cassa.some((m) => String(one.data || "").slice(0, 7) === `${m.anno}-${String(m.mese).padStart(2, "0")}`));
  el("wCash").hidden = !haIncassi;
  if (haIncassi) {
    const lettere = t("monthLetters").split(" ");
    drawMonths(el("chartCash"), cassa, {
      back: "fatturato", front: "incassato", backClass: "before", frontClass: "now",
      title: "homeCash", empty: "homeMonthsEmpty",
      tooltip: (m) => tf("homeCashTip", {
        mese: lettere[m.mese - 1], anno: m.anno,
        fatturato: money(m.fatturato), incassato: money(m.incassato),
      }),
    });
    el("homeCashNote").hidden = !payments.some((one) => one.importato);
  }

  // Come pagano i clienti. Serve più di un cliente, o è una classifica di uno.
  const puntuali = payers(docs, payments);
  el("wPayers").hidden = puntuali.length < 2;
  const payersBody = el("homePayersBody");
  payersBody.textContent = "";
  for (const row of puntuali) {
    const giorni = row.giorni === 0
      ? t("homePayersOnTime")
      : tf("homePayersDays", { giorni: row.giorni > 0 ? `+${row.giorni}` : String(row.giorni) });
    payersBody.append(_row([
      [byParty.get(row.partyId) || "—"],
      [tf("homePayersCount", { quante: row.quante }), "meta nowrap"],
      [giorni, row.giorni > 0 ? "right nowrap overdue" : "right nowrap"],
    ], `#/cliente/${row.partyId}`));
  }

  // I progetti in corso.
  const lavori = projectRows({ today });
  el("wProjects").hidden = lavori.length === 0;
  const projBody = el("homeProjectsBody");
  projBody.textContent = "";
  for (const row of lavori) {
    const quando = row.ritardo
      ? tf("homeProjectLate", { giorni: row.ritardo })
      : row.prossima ? tf("homeProjectNext", { data: shownDate(row.prossima) }) : t("homeProjectNoDate");
    projBody.append(_row([
      [row.name || t("projectsUntitled"), null],
      [tf("projectPhasesCount", { fatte: row.fatte, tutte: row.tutte }), "nowrap"],
      [quando, row.ritardo ? "nowrap overdue" : "nowrap meta"],
      [row.daFatturare > 0n ? money(row.daFatturare) : "—", "right"],
    ], `#/progetto/${row.id}`));
  }

  // I preventivi in attesa.
  const attesa = openQuotes(docs, { today });
  el("wQuotes").hidden = attesa.length === 0;
  const quoteBody = el("homeQuotesBody");
  quoteBody.textContent = "";
  for (const { doc, giorni } of attesa) {
    const scadenza = giorni === null ? "—"
      : giorni < 0 ? t("homeQuoteExpired")
        : giorni <= QUOTE_WARNING_DAYS ? tf("homeQuoteExpiring", { giorni })
          : tf("homeQuoteUntil", { data: shownDate(doc.validoFino) });
    const totale = signedTotal(doc);
    quoteBody.append(_row([
      [shownNumber(doc) || "—", "nowrap"],
      [byParty.get(doc.partyId) || "—", "nowrap"],
      [scadenza, giorni !== null && giorni <= QUOTE_WARNING_DAYS ? "nowrap overdue" : "nowrap meta"],
      [totale === null ? "—" : money(totale), "right"],
    ], `#/documento/${doc.id}`));
  }

  // Le bozze lasciate a metà.
  const bozze = drafts(docs);
  el("wDrafts").hidden = bozze.length === 0;
  const draftBody = el("homeDraftsBody");
  draftBody.textContent = "";
  for (const doc of bozze) {
    const totale = signedTotal(doc);
    draftBody.append(_row([
      [t(kind(doc).label.replace(/^type/, "short")), "nowrap"],
      [byParty.get(doc.partyId) || "—", "nowrap"],
      [doc.data ? shownDate(doc.data) : "—", "nowrap meta"],
      [totale === null ? "—" : money(totale), "right"],
    ], `#/documento/${doc.id}`));
  }

  // Gli ultimi documenti.
  const recentBody = el("homeRecentBody");
  recentBody.textContent = "";
  for (const record of docs.slice(0, ROWS)) {
    const totale = signedTotal(record);
    recentBody.append(_row([
      [`${t(kind(record).label.replace(/^type/, "short"))} ${shownNumber(record) || ""}`.trim(), "nowrap"],
      [byParty.get(record.partyId) || "—", "nowrap"],
      [statoLabel(record.stato), "nowrap"],
      [totale === null ? "—" : money(totale), "right"],
    ], `#/documento/${record.id}`));
  }
}
