// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The tax deadlines that come out of what is written here, in one list (10 November 2026).
//
// **Why.** The app knew five deadlines and said them in three places: the reverse-charge
// integrations and the San Marino self-invoices at the top of the purchases, the withholding tax in
// a panel beside them, and the VAT of the quarter as a figure on the Situazione with no date at all.
// The stamp duty on e-invoices — two euros on every invoice without VAT above 77,47 €, paid every
// quarter — was written into each XML and never added up. Somebody asking «what do I owe the
// Treasury, and when?» had to know where to look, and for the stamp duty there was nowhere.
//
// **What is counted, and on which rules.**
//
// - **VAT** (Italian companies). Monthly: by the 16th of the next month. Quarterly by option: by
//   16 May, 20 August and 16 November, plus 1% interest; the fourth quarter goes into the annual
//   balance, due by 16 March. A balance under 100 € is carried to the next period (since 2024),
//   except November and the third quarter, which are paid in December; a credit is carried too.
//   The flat-rate scheme (RF19) charges no VAT and owes only the VAT of its reverse-charge
//   integrations, by the 16th of the next month. The December advance is worked out with the
//   historical method — 88% of the year before — when the app holds that whole year.
// - **Stamp duty on e-invoices** (Italian companies): 2 € per invoice that carries it, by quarter
//   of the invoice date — 31 May, 30 September, 30 November, end of February. Under 5.000 € the
//   first quarter moves to September, and the first two to November when together they stay under.
// - **Withholding tax**, **integrations** and **self-invoices**: as `costs.js` already works them out.
//
// Dates move with `fiscalDay`: August, weekends and national holidays. Every figure is the sum of
// what is written in this app, which is what the screen says: the accountant does the rest.
//
// The marks «done» for VAT and stamp duty live on the company record, in `adempimenti.fatti`, so
// they travel in every export; the withholding keeps its marks on the payments, as before.
//
// No DOM: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/obligations.mjs`.

import { from, add, sub, cmp, percent, ZERO, mul } from "./decimal.js";
import { totals, BOLLO } from "./totals.js";
import { kind } from "./kinds.js";
import { profileFor } from "./fatturapa.js";
import { taxBalance, ritenuteDaVersare, daIntegrare, daAutofatturare } from "./costs.js";
import { currentDay, fiscalDay } from "./day.js";
import { t, tf, lang } from "./i18n.js";
import { date as shownDate } from "./format.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** How VAT is settled: the two answers a company gives once. */
export const PERIODICITA = ["mensile", "trimestrale"];

/** Under this a VAT balance is carried to the next period (art. 1 DPR 100/1998, from 2024). */
export const MINIMO_IVA = from("100.00");

/** Under this the annual VAT balance is not paid. */
export const MINIMO_SALDO = from("10.33");

/** The interest a quarterly payer adds to each quarter. */
export const INTERESSI_TRIMESTRALI = from("1");

/** The December VAT advance, historical method: this share of the last period of the year before. */
export const PERCENTUALE_ACCONTO = from("88");

/** At or under this the advance is not paid. */
export const MINIMO_ACCONTO = from("103.29");

/** Under this the stamp duty of the first quarter (and of the first two) moves forward. */
export const SOGLIA_BOLLO = from("5000.00");

/** How far back a VAT or stamp-duty deadline is still shown when it was never marked done. */
export const FINESTRA_GIORNI = 365;

/** F24 codes, for the row that names one. */
const CODICI_BOLLO = ["2521", "2522", "2523", "2524"];
const CODICI_IVA_TRIMESTRE = ["6031", "6032", "6033"];
const CODICE_SALDO_IVA = "6099";
const CODICE_ACCONTO = { mensile: "6013", trimestrale: "6035" };
const CODICE_RITENUTE = "1040";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _pad(n) {
  return String(n).padStart(2, "0");
}

/** The last day of a month, `mese` from 1 to 12. */
function _lastDay(anno, mese) {
  return `${anno}-${_pad(mese)}-${_pad(new Date(Date.UTC(anno, mese, 0)).getUTCDate())}`;
}

/** `iso` minus `giorni` days. */
function _before(iso, giorni) {
  const at = new Date(`${iso}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - giorni);
  return at.toISOString().slice(0, 10);
}

/** Every month from `primo` to `ultimo`, both "YYYY-MM". */
function _months(primo, ultimo) {
  const mesi = [];
  let [anno, mese] = primo.split("-").map(Number);
  const [fineAnno, fineMese] = ultimo.split("-").map(Number);
  while (anno < fineAnno || (anno === fineAnno && mese <= fineMese)) {
    mesi.push(`${anno}-${_pad(mese)}`);
    mese += 1;
    if (mese > 12) { mese = 1; anno += 1; }
  }
  return mesi;
}

function _italian(company) {
  return Boolean(company) && profileFor(company).paese !== "SM";
}

/** The issued fiscal documents that count: not drafts, not refused, not cancelled. */
function _issued(docs) {
  return (docs || []).filter((doc) => doc && doc.totali && doc.data && kind(doc).fiscale
    && doc.stato !== "bozza" && doc.stato !== "scartato" && doc.stato !== "annullato");
}

/** The first month anything was written in, or `null`. */
function _firstMonth(docs, costs) {
  const mesi = [..._issued(docs).map((doc) => doc.data), ...(costs || []).map((one) => one.data)]
    .map((data) => String(data || "").slice(0, 7))
    .filter((mese) => /^\d{4}-\d{2}$/.test(mese))
    .sort();
  return mesi[0] || null;
}

/** The balance of several months together, as `taxBalance` gives it for one. */
function _balance(docs, costs, mesi, company) {
  return mesi
    .map((mese) => taxBalance(docs, costs, mese, { company, kindOf: kind }))
    .reduce((acc, uno) => ({ debito: add(acc.debito, uno.debito), saldo: add(acc.saldo, uno.saldo) }),
      { debito: ZERO, saldo: ZERO });
}

/** Whether a document carries the stamp duty: charged to the customer, or due all the same. */
function _withStamp(doc) {
  if (doc.bollo) return true;
  try {
    return Boolean(totals(doc).bolloDovuto);
  } catch (ignored) {
    return false;
  }
}

/** The row a VAT period becomes, or a carry. */
function _vatRow(row) {
  return { tipo: "iva", ...row };
}

/** «settembre 2026», in the language the app is in. */
function _monthLabel(mese) {
  const [anno, numero] = String(mese).split("-").map(Number);
  return new Date(Date.UTC(anno, numero - 1, 1))
    .toLocaleDateString(lang() === "it" ? "it-IT" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * The company's choice of VAT settlement, or `null` while it has not said.
 *
 * No default: a monthly payer shown quarterly deadlines would miss two payments out of three, and
 * the screen asks the question instead of guessing it.
 */
export function periodicita(company) {
  const scelta = (((company || {}).adempimenti) || {}).iva;
  return PERIODICITA.includes(scelta) ? scelta : null;
}

/**
 * The VAT payments, one row per period that owes something, in date order.
 *
 * Every period from the first month with data to the current one is worked out, because what a
 * period owes depends on the credit or the small balance carried from the one before. The period
 * still running gets a row with `inCorso` and the amount so far, threshold or not.
 */
export function vatRows(docs, costs, { company = null, today = currentDay() } = {}) {
  if (!_italian(company)) return [];
  const primo = _firstMonth(docs, costs);
  if (!primo) return [];
  const oggi = today.slice(0, 7);
  if (primo > oggi) return [];
  const forfettario = (company.regimeFiscale || "") === "RF19";
  const rows = [];

  // The flat-rate scheme: only the VAT of its integrations, month by month, no threshold.
  if (forfettario) {
    for (const mese of _months(primo, oggi)) {
      const { debito } = _balance(docs, costs, [mese], company);
      if (cmp(debito, ZERO) <= 0) continue;
      const [anno, numero] = mese.split("-").map(Number);
      rows.push(_vatRow({
        key: `iva:${mese}`, periodo: mese, anno, numero, integrazioni: true, importo: debito, interessi: ZERO,
        scadenza: fiscalDay(numero === 12 ? `${anno + 1}-01-16` : `${anno}-${_pad(numero + 1)}-16`),
        codice: `60${_pad(numero)}`, inCorso: mese === oggi,
      }));
    }
    return rows;
  }

  const scelta = periodicita(company);
  if (!scelta) return [];
  const trimestrale = scelta === "trimestrale";
  // The periods: months, or quarters as their three months.
  const periodi = [];
  for (const mese of _months(primo, oggi)) {
    const [anno, numero] = mese.split("-").map(Number);
    if (!trimestrale) {
      periodi.push({ id: mese, anno, numero, mesi: [mese], ultimo: numero === 12, novembre: numero === 11 });
      continue;
    }
    const q = Math.floor((numero - 1) / 3) + 1;
    const id = `${anno}-T${q}`;
    const presente = periodi.find((one) => one.id === id);
    if (presente) presente.mesi.push(mese);
    else periodi.push({ id, anno, numero: q, mesi: [mese], ultimo: q === 4, novembre: q === 3 });
  }
  // A quarter gets all its months, also those before the first data.
  if (trimestrale) {
    for (const periodo of periodi) {
      const inizio = (periodo.numero - 1) * 3 + 1;
      periodo.mesi = [0, 1, 2].map((i) => `${periodo.anno}-${_pad(inizio + i)}`);
    }
  }

  // **The December advance, historical method** (27 December, codes 6013 and 6035, no interest):
  // 88% of December's liquidation for a monthly payer, of the annual balance for a quarterly one,
  // both before the advance of that year — and only when the app holds the whole year before, or
  // the base would be a guess. Not due at or under 103,29 €. It comes off December, or off the
  // annual balance.
  const basi = new Map();
  const acconto = (anno) => {
    if (!basi.has(anno - 1) || primo > `${anno - 1}-01`) return ZERO;
    const dovuto = percent(basi.get(anno - 1), PERCENTUALE_ACCONTO, 2);
    return cmp(dovuto, MINIMO_ACCONTO) > 0 ? dovuto : ZERO;
  };

  let riporto = ZERO;
  for (const periodo of periodi) {
    const inCorso = periodo.mesi.includes(oggi);
    let netto = add(_balance(docs, costs, periodo.mesi, company).saldo, riporto);
    const { anno, numero } = periodo;
    if (periodo.ultimo) {
      basi.set(anno, cmp(netto, ZERO) > 0 ? netto : ZERO);
      netto = sub(netto, acconto(anno));
    }

    // Where the period is paid, and with which code.
    let key = `iva:${periodo.id}`;
    let scadenza;
    let codice;
    let saldo = false;
    if (!trimestrale) {
      scadenza = fiscalDay(numero === 12 ? `${anno + 1}-01-16` : `${anno}-${_pad(numero + 1)}-16`);
      codice = `60${_pad(numero)}`;
    } else if (numero < 4) {
      scadenza = fiscalDay(`${anno}-${["05", "08", "11"][numero - 1]}-16`);
      codice = CODICI_IVA_TRIMESTRE[numero - 1];
    } else {
      scadenza = fiscalDay(`${anno + 1}-03-16`);
      codice = CODICE_SALDO_IVA;
      key = `iva:saldo:${anno}`;
      saldo = true;
    }

    if (inCorso) {
      if (cmp(netto, ZERO) > 0) {
        const interessi = trimestrale ? percent(netto, INTERESSI_TRIMESTRALI, 2) : ZERO;
        rows.push(_vatRow({ key, periodo: periodo.id, anno, numero, trimestrale, saldo, importo: add(netto, interessi), interessi, scadenza, codice, inCorso: true }));
      }
      break;
    }
    // A credit is carried to the next period.
    if (cmp(netto, ZERO) <= 0) {
      riporto = netto;
      continue;
    }
    // A small balance is carried too — but not past November (or the third quarter), which are paid
    // in December, and December (or the fourth quarter) goes into the annual balance.
    if (cmp(netto, MINIMO_IVA) < 0) {
      if (periodo.novembre) {
        scadenza = fiscalDay(`${anno}-12-16`);
      } else if (periodo.ultimo) {
        if (cmp(netto, MINIMO_SALDO) <= 0) { riporto = ZERO; continue; }
        scadenza = fiscalDay(`${anno + 1}-03-16`);
        codice = CODICE_SALDO_IVA;
        key = `iva:saldo:${anno}`;
        saldo = true;
      } else {
        riporto = netto;
        continue;
      }
    }
    const interessi = trimestrale ? percent(netto, INTERESSI_TRIMESTRALI, 2) : ZERO;
    rows.push(_vatRow({ key, periodo: periodo.id, anno, numero, trimestrale, saldo, importo: add(netto, interessi), interessi, scadenza, codice, inCorso: false }));
    riporto = ZERO;
  }

  for (let anno = Number(primo.slice(0, 4)) + 1; anno <= Number(oggi.slice(0, 4)); anno += 1) {
    const importo = acconto(anno);
    if (cmp(importo, ZERO) <= 0) continue;
    rows.push(_vatRow({
      key: `iva:acconto:${anno}`, periodo: `${anno}-acconto`, anno, numero: 12, trimestrale, acconto: true,
      importo, interessi: ZERO, scadenza: fiscalDay(`${anno}-12-27`), codice: CODICE_ACCONTO[scelta], inCorso: false,
    }));
  }
  return rows.sort((a, b) => a.scadenza.localeCompare(b.scadenza));
}

/**
 * The stamp duty on e-invoices, one row per quarter that has some, with its deadline.
 *
 * Counted on the invoice date. The first quarter under 5.000 € moves to the deadline of the second,
 * and the first two to that of the third when together they stay under it; `rinviato` says so.
 */
export function stampRows(docs, { company = null, today = currentDay() } = {}) {
  if (!_italian(company)) return [];
  const trimestri = new Map();
  for (const doc of _issued(docs)) {
    if (!_withStamp(doc)) continue;
    const anno = Number(String(doc.data).slice(0, 4));
    const q = Math.floor((Number(String(doc.data).slice(5, 7)) - 1) / 3) + 1;
    const id = `${anno}-${q}`;
    const voce = trimestri.get(id) || { anno, numero: q, quante: 0 };
    voce.quante += 1;
    trimestri.set(id, voce);
  }
  const importoDi = (voce) => (voce ? mul(BOLLO, from(String(voce.quante)), 2) : ZERO);
  const rows = [];
  for (const voce of trimestri.values()) {
    const { anno, numero } = voce;
    const base = [`${anno}-05-31`, `${anno}-09-30`, `${anno}-11-30`, _lastDay(anno + 1, 2)][numero - 1];
    let termine = base;
    let rinviato = false;
    const primo = importoDi(trimestri.get(`${anno}-1`));
    const primiDue = add(primo, importoDi(trimestri.get(`${anno}-2`)));
    if (numero === 1 && cmp(primo, SOGLIA_BOLLO) <= 0) {
      termine = cmp(primiDue, SOGLIA_BOLLO) <= 0 ? `${anno}-11-30` : `${anno}-09-30`;
      rinviato = true;
    } else if (numero === 2 && cmp(primiDue, SOGLIA_BOLLO) <= 0) {
      termine = `${anno}-11-30`;
      rinviato = true;
    }
    const ultimoMese = numero * 3;
    rows.push({
      tipo: "bollo",
      key: `bollo:${anno}-${numero}`,
      periodo: `${anno}-${numero}`,
      anno,
      numero,
      quante: voce.quante,
      importo: importoDi(voce),
      scadenza: fiscalDay(termine),
      codice: CODICI_BOLLO[numero - 1],
      rinviato,
      inCorso: today <= _lastDay(anno, ultimoMese),
    });
  }
  return rows.sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/**
 * Everything due, in one list: open rows by deadline, and the VAT and stamp-duty rows already
 * marked done (`fatti`), most recent first, so that a mark given by mistake can be taken back.
 *
 * `anagrafiche` is a Map of parties by id, as `daIntegrare` and `daAutofatturare` want it.
 */
export function obligations({ docs = [], costs = [], outlays = [], company = null, anagrafiche = new Map(), today = currentDay() } = {}) {
  const segnati = (((company || {}).adempimenti) || {}).fatti || {};
  const forfettario = ((company || {}).regimeFiscale || "") === "RF19";
  const dal = _before(today, FINESTRA_GIORNI);
  const conSegno = [...vatRows(docs, costs, { company, today }), ...stampRows(docs, { company, today })]
    // Older than the window and never marked: left out, or a first import of three years of
    // invoices would open on a page of red rows that were paid long ago outside this app.
    .filter((row) => row.scadenza >= dal)
    .map((row) => ({ ...row, fatto: segnati[row.key] || null }));

  const ritenute = ritenuteDaVersare(costs, outlays, { company, today }).map((voce) => ({
    tipo: "ritenute",
    key: `ritenute:${voce.mese}`,
    periodo: voce.mese,
    importo: voce.importo,
    quante: voce.pagamenti.length,
    outlayIds: voce.pagamenti.map((one) => one.outlayId),
    scadenza: voce.scadenza,
    codice: CODICE_RITENUTE,
    fatto: null,
  }));
  const integrazioni = daIntegrare(costs, { company, anagrafiche, oggi: today }).map(({ record, party, tipo, termine }) => ({
    tipo: "integrazione",
    key: `integrazione:${record.id}`,
    costId: record.id,
    fornitore: (party && party.denominazione) || "",
    data: record.data,
    documento: tipo,
    importo: from(String(record.imponibile || "0")),
    scadenza: termine.al,
    fatto: null,
  }));
  const autofatture = daAutofatturare(costs, { company, anagrafiche, oggi: today }).map(({ record, party, termine }) => ({
    tipo: "autofattura",
    key: `autofattura:${record.id}`,
    costId: record.id,
    fornitore: (party && party.denominazione) || "",
    data: record.data,
    importo: from(String(record.totale || "0")),
    scadenza: termine.al,
    fatto: null,
  }));

  const tutte = [...conSegno, ...ritenute, ...integrazioni, ...autofatture]
    .map((row) => ({ ...row, scaduta: !row.fatto && !row.inCorso && row.scadenza < today }));
  return {
    // Whether the VAT question still has to be answered: Italian, not flat-rate, not chosen.
    chiedeIva: _italian(company) && !forfettario && !periodicita(company),
    italiana: _italian(company),
    forfettario,
    aperti: tutte.filter((row) => !row.fatto)
      .sort((a, b) => a.scadenza.localeCompare(b.scadenza) || a.key.localeCompare(b.key)),
    fatti: tutte.filter((row) => row.fatto)
      .sort((a, b) => b.scadenza.localeCompare(a.scadenza)),
  };
}

/** The company record with a VAT or stamp-duty row marked done on `data`, or unmarked with `null`. */
export function mark(company, key, data) {
  const adempimenti = { ...((company || {}).adempimenti || {}) };
  const fatti = { ...(adempimenti.fatti || {}) };
  if (data) fatti[key] = data;
  else delete fatti[key];
  return { ...company, adempimenti: { ...adempimenti, fatti } };
}

/** The company record with its VAT settlement set. */
export function withPeriodicita(company, scelta) {
  const adempimenti = { ...((company || {}).adempimenti || {}) };
  return { ...company, adempimenti: { ...adempimenti, iva: PERIODICITA.includes(scelta) ? scelta : null } };
}

/** What a row is, in one line, in the language the app is in: for the screen, the calendar and the reminders. */
export function describe(row) {
  switch (row.tipo) {
    case "iva":
      if (row.acconto) return tf("dutyVatAdvance", { anno: row.anno });
      if (row.integrazioni) return tf("dutyVatIntegrations", { mese: _monthLabel(row.periodo) });
      if (row.saldo) return tf("dutyVatBalance", { anno: row.anno });
      if (row.trimestrale) return tf("dutyVatQuarter", { n: row.numero, anno: row.anno });
      return tf("dutyVatMonth", { mese: _monthLabel(row.periodo) });
    case "bollo":
      return tf(row.quante === 1 ? "dutyStampOne" : "dutyStamp", { n: row.numero, anno: row.anno, quante: row.quante });
    case "ritenute":
      return tf("dutyWithholding", { mese: _monthLabel(row.periodo), n: row.quante });
    case "integrazione":
      return tf("dutyIntegration", {
        tipo: row.documento === "?" ? t("integrazioniTipoDaScegliere") : row.documento,
        fornitore: row.fornitore || "—",
        data: shownDate(row.data),
      });
    case "autofattura":
      return tf("dutySelfInvoice", { fornitore: row.fornitore || "—", data: shownDate(row.data) });
    default:
      return row.key;
  }
}
