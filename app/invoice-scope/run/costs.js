// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Gli acquisti: fatture ricevute e spese senza fattura, con quello che si può dire di loro senza
// un browser — il record, i totali, lo stato, lo scadenzario passivo, l'imposta del periodo.
//
// **Non è contabilità in partita doppia.** È il registro di quello che si è speso e di quando va
// pagato, cioè il rovescio del registro dei documenti emessi: quanto basta per sapere ogni mattina
// cosa devo, per dare al commercialista un file pulito e per vedere il margine accanto al fatturato.
// Piano dei conti, prima nota e bilancio restano a chi li tiene con il suo software.
//
// **L'imposta dipende da dove sta l'azienda, non dal fornitore.** Per un'azienda italiana una
// fattura ricevuta porta IVA a credito, che si detrae. Per una sammarinese una fattura dall'Italia
// arriva senza IVA — natura N3.3, art. 71 — e sull'acquisto si paga all'Ufficio Tributario
// l'**imposta sulle importazioni**, detta monofase (Legge 22 dicembre 1972 n. 40): un costo, non un
// credito. Le aliquote sono nel `MONOFASE` qui sotto, con la fonte accanto; l'app propone quella
// ordinaria e lascia scrivere le altre.
//
// Nessun DOM: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/costs.mjs`.
// In fondo c'è anche quello che legge e scrive il deposito — acquisti e pagamenti in uscita —
// perché la schermata non debba sapere che esiste uno store `outlays`.

import { list, get, put, remove, tx } from "gg/store.js";

import { from, add, sub, cmp, sum, ZERO, toString, percent } from "./decimal.js";
import { parseAmount, parseOptional } from "./parse.js";
import { profileFor } from "./fatturapa.js";

/** Due decimali: l'imposta si arrotonda al centesimo, come nel riepilogo IVA. */
const MONEY = 2;

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * I tre tipi: una fattura ha il numero del fornitore, una spesa no, una nota di credito ricevuta
 * è una fattura al contrario.
 *
 * **La nota si scrive con gli importi positivi, e il segno lo mette chi conta.** È la regola dei
 * documenti emessi: le sue cifre sono quelle del documento, e in una colonna di acquisti si legge
 * con il meno davanti. Non è da pagare — è il fornitore che deve a noi — e nel margine, nei conti
 * del periodo e nella liquidazione toglie invece di aggiungere.
 */
export const TIPI = ["fattura", "spesa", "nota"];

/** Il segno con cui un acquisto entra nei conti: −1 per una nota di credito, +1 per il resto. */
export function signOf(record) {
  return record.tipo === "nota" ? -1n : 1n;
}

/**
 * Le aliquote dell'imposta monofase sammarinese, come le dicono le fonti.
 *
 * Ordinaria 17%; ridotte dal 2% al 6% per categorie di merci (alimentari, medicinali); 1% per i
 * beni strumentali all'attività; 8% per gli autoveicoli. Legge 40/1972 e Decreto 108/1997.
 * Fonti: fiscooggi.it (scheda San Marino), consigliograndeegenerale.sm (testo della legge).
 * Scritte qui perché si vedano e si correggano: un numero dentro un menù senza la sua fonte è un
 * numero che nessuno rilegge.
 */
export const MONOFASE = ["17", "8", "6", "2", "1", "0"];

/** Le aliquote IVA italiane che una fattura ricevuta porta di solito. */
export const IVA = ["22", "10", "5", "4", "0"];

/** Le categorie proposte nel campo. Testo libero: queste sono un suggerimento, non un vincolo. */
export const CATEGORIE = ["affitto", "software", "consulenze", "hardware", "utenze", "viaggi",
  "bancarie", "assicurazioni", "materiali", "altro"];

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _id() {
  return globalThis.crypto?.randomUUID?.() || `cost-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function _now() {
  return new Date().toISOString();
}

/** Un importo del record come valore scalato, o zero se non c'è. */
function _amount(text) {
  try {
    return from(String(text || "0"));
  } catch (ignored) {
    return ZERO;
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i l   r e c o r d
// -----------------------------------------------------------------------------------------------------------------

/**
 * Che imposta porta un acquisto per questa azienda: `iva` per chi sta in Italia, `monofase` per chi
 * sta a San Marino. È l'unico posto in cui il profilo decide una cosa degli acquisti.
 */
export function taxKind(company) {
  return profileFor(company).paese === "SM" ? "monofase" : "iva";
}

/** L'aliquota proposta a un acquisto nuovo, per il tipo di imposta. */
export function defaultRate(company) {
  return taxKind(company) === "monofase" ? "17" : ((company || {}).aliquotaPredefinita || "22");
}

/**
 * L'imposta su un imponibile, a un'aliquota: arrotondata al centesimo, come fa il riepilogo IVA.
 * Esposta perché il foglio la ricalcola mentre si scrive.
 */
export function taxOn(imponibile, aliquota) {
  return percent(_amount(imponibile), _amount(aliquota), MONEY);
}

/**
 * Il record di un acquisto, dai campi come li scrive una persona.
 *
 * Gli importi entrano come li scrive una persona — «1.250,50» — ed escono nella forma che i conti
 * accettano. Il totale non si scrive: è imponibile più imposta, sempre, così non può divergere.
 * `impostaTipo` è deciso dall'azienda, non dal campo: `nessuna` solo se l'imposta è zero.
 */
export function costRecord(fields, { company = null } = {}) {
  const tipo = TIPI.includes(fields.tipo) ? fields.tipo : "fattura";
  const imponibile = parseAmount(fields.imponibile) ?? "0";
  // Senza zeri in coda: «22.00» dal tracciato e «22» dal menù sono la stessa aliquota.
  const aliquota = (parseOptional(fields.aliquota) || "0").replace(/\.(\d*?)0+$/, ".$1").replace(/\.$/, "");
  const imposta = fields.imposta !== undefined && fields.imposta !== ""
    ? (parseAmount(fields.imposta) ?? "0")
    : toString(taxOn(imponibile, aliquota), 2);
  const totale = toString(add(_amount(imponibile), _amount(imposta)), 2);
  const kind = cmp(_amount(imposta), ZERO) === 0 ? "nessuna" : (fields.impostaTipo || taxKind(company));

  const record = {
    id: fields.id || _id(),
    tipo,
    partyId: fields.partyId || "",
    data: String(fields.data || "").slice(0, 10),
    numero: tipo === "spesa" ? "" : String(fields.numero || "").trim(),
    categoria: String(fields.categoria || "").trim(),
    descrizione: String(fields.descrizione || "").trim(),
    imponibile,
    aliquota,
    imposta,
    impostaTipo: kind,
    totale,
    scadenza: fields.scadenza ? String(fields.scadenza).slice(0, 10) : null,
    righe: Array.isArray(fields.righe) && fields.righe.length ? fields.righe : null,
    origine: fields.origine || null,
    created: fields.created || _now(),
    updated: _now(),
  };
  if (fields.importato) record.importato = fields.importato;
  // Un acquisto nato da una ricorrenza la ricorda, con il periodo che copre: è così che l'atteso
  // di quel periodo sparisce, e non compare due volte.
  if (fields.ricorrenzaId) {
    record.ricorrenzaId = fields.ricorrenzaId;
    record.periodo = String(fields.periodo || record.data.slice(0, 7));
  }
  return record;
}

/**
 * Quanto pesa un acquisto nel margine: l'imponibile, più l'imposta quando è un costo davvero.
 *
 * L'IVA a credito non è un costo — torna nella liquidazione — quindi per il profilo italiano conta
 * solo l'imponibile. La monofase invece si paga e non torna: per il profilo sammarinese conta
 * tutta. È la differenza fra i due profili detta in una riga, ed è l'unica che il margine vede.
 */
export function costOf(record) {
  const base = _amount(record.imponibile);
  return signOf(record) * (record.impostaTipo === "monofase" ? add(base, _amount(record.imposta)) : base);
}

/** Il totale di un acquisto con il segno: negativo per una nota di credito. */
export function signedTotal(record) {
  return signOf(record) * _amount(record.totale);
}

/** Quello che manca perché il record abbia senso, come chiavi di testo. Vuoto se va bene. */
export function problems(record) {
  const out = [];
  if (!record.partyId) out.push("costNeedsParty");
  if (!record.data) out.push("costNeedsDate");
  if (cmp(_amount(record.imponibile), ZERO) <= 0 && cmp(_amount(record.imposta), ZERO) <= 0) out.push("costNeedsAmount");
  if (record.tipo !== "spesa" && !record.numero) out.push("costNeedsNumber");
  return out;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   p a g a m e n t i   e   s t a t o
// -----------------------------------------------------------------------------------------------------------------

/** Quanto è stato pagato di un acquisto, dai suoi pagamenti. */
export function paidOf(outlays) {
  return sum(outlays.map((one) => _amount(one.importo)));
}

/** Quanto resta da pagare: mai sotto zero, un pagamento in più non è un credito. Una nota di credito non si paga. */
export function owedOn(record, outlays) {
  if (record.tipo === "nota") return ZERO;
  const resto = sub(_amount(record.totale), paidOf(outlays));
  return cmp(resto, ZERO) > 0 ? resto : ZERO;
}

/** `pagato`, `scaduto` o `aperto`. Senza scadenza un acquisto è a vista: scade il giorno stesso. */
export function state(record, outlays, { today = new Date().toISOString().slice(0, 10) } = {}) {
  if (cmp(owedOn(record, outlays), ZERO) === 0) return "pagato";
  const quando = record.scadenza || record.data;
  return quando && quando < today ? "scaduto" : "aperto";
}

/**
 * Lo scadenzario passivo: una riga per acquisto non saldato, dalla scadenza più vicina.
 * Stessa forma delle righe dello scadenzario attivo, con `costId` al posto di `docId`.
 */
export function payable(costs, outlays, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const per = new Map();
  for (const one of outlays) {
    if (!per.has(one.costId)) per.set(one.costId, []);
    per.get(one.costId).push(one);
  }
  return costs
    .map((record) => {
      const importo = owedOn(record, per.get(record.id) || []);
      const scadenza = record.scadenza || record.data;
      return { costId: record.id, partyId: record.partyId, scadenza, importo, scaduta: Boolean(scadenza) && scadenza < today };
    })
    .filter((row) => cmp(row.importo, ZERO) > 0)
    .sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)));
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i   c o n t i   d e l   p e r i o d o
// -----------------------------------------------------------------------------------------------------------------

/** I costi di un periodo `AAAA` o `AAAA-MM`: imponibile, imposta e totale, e quante voci. */
export function periodTotals(costs, periodo) {
  const dentro = costs.filter((record) => String(record.data).startsWith(periodo));
  const con = (r, campo) => signOf(r) * _amount(r[campo]);
  return {
    quante: dentro.length,
    imponibile: sum(dentro.map((r) => con(r, "imponibile"))),
    imposta: sum(dentro.map((r) => con(r, "imposta"))),
    totale: sum(dentro.map((r) => con(r, "totale"))),
    monofase: sum(dentro.filter((r) => r.impostaTipo === "monofase").map((r) => con(r, "imposta"))),
    iva: sum(dentro.filter((r) => r.impostaTipo === "iva").map((r) => con(r, "imposta"))),
  };
}

/**
 * La liquidazione del periodo, per chi sta in Italia: IVA a debito dai documenti emessi, a credito
 * dagli acquisti, e il saldo. Per chi sta a San Marino il saldo non esiste — la monofase è un costo
 * — e la voce dice quanto se n'è pagata.
 *
 * `docs` sono i documenti emessi con i totali congelati; contano quelli fiscali e non stornati, con
 * la nota di credito che toglie.
 */
export function taxBalance(docs, costs, periodo, { company = null, kindOf = null } = {}) {
  const emessi = docs.filter((doc) => doc.totali && String(doc.data).startsWith(periodo));
  let debito = ZERO;
  for (const doc of emessi) {
    const k = kindOf ? kindOf(doc) : { fiscale: true, storna: false };
    if (!k.fiscale) continue;
    // I totali congelati sono già scalati, come li scrive `issue`: si leggono come BigInt.
    let imposta = ZERO;
    try { imposta = BigInt(doc.totali.imposta || 0); } catch (ignored) { imposta = ZERO; }
    debito = k.storna ? sub(debito, imposta) : add(debito, imposta);
  }
  const acquisti = periodTotals(costs, periodo);
  if (taxKind(company) === "monofase") {
    return { tipo: "monofase", debito, credito: ZERO, saldo: debito, monofase: acquisti.monofase };
  }
  return { tipo: "iva", debito, credito: acquisti.iva, saldo: sub(debito, acquisti.iva), monofase: ZERO };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i l   d e p o s i t o
// -----------------------------------------------------------------------------------------------------------------

/** Tutti gli acquisti, dal più recente. */
export async function allCosts(db) {
  return (await list(db, "costs")).sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

/** Tutti i pagamenti in uscita, per chi fa i conti di tutto l'archivio in una lettura. */
export async function allOutlays(db) {
  return list(db, "outlays");
}

/** Scrivi un acquisto, nuovo o corretto. Il record passa da `costRecord`, così i totali tornano. */
export async function saveCost(db, fields, { company = null } = {}) {
  const record = costRecord(fields, { company });
  await put(db, "costs", record);
  return record;
}

/**
 * Togli un acquisto, e i suoi pagamenti con lui.
 *
 * In una transazione sola: un pagamento senza il suo acquisto è un riferimento a vuoto, ed è la
 * sesta lezione di `app/CLAUDE.md` — la fase che puntava a una bozza cancellata. Qui si evita in
 * partenza.
 */
export async function removeCost(db, id) {
  const suoi = await outlaysOf(db, id);
  await tx(db, ["costs", "outlays"], async (scope) => {
    await scope.remove("costs", id);
    for (const one of suoi) await scope.remove("outlays", one.id);
  });
}

/** I pagamenti di un acquisto, dal più vecchio: è l'ordine in cui sono usciti. */
export async function outlaysOf(db, costId) {
  return (await list(db, "outlays"))
    .filter((one) => one.costId === costId)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
}

/** Un pagamento in uscita: la stessa forma di un incasso, con `costId` al posto di `docId`. */
export async function recordOutlay(db, cost, { importo, data, conto = null, nota = null }) {
  const record = {
    id: globalThis.crypto?.randomUUID?.() || `out-${Date.now()}`,
    costId: cost.id,
    importo: String(importo),
    data,
    conto: conto ? { id: conto.id, etichetta: conto.etichetta || "", iban: conto.iban || "" } : null,
    nota: nota || null,
  };
  await put(db, "outlays", record);
  return record;
}

/** Togli un pagamento registrato per sbaglio: si cancella, non si storna, come un incasso. */
export async function removeOutlay(db, id) {
  await remove(db, "outlays", id);
}

/** Un acquisto per id, o `null`. */
export async function cost(db, id) {
  return (id && (await get(db, "costs", id))) || null;
}
