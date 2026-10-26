// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

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

import { list, get, put, tx } from "gg/store.js";

import { from, add, sub, cmp, sum, ZERO, toString, percent } from "./decimal.js";
import { parseAmount, parseOptional } from "./parse.js";
import { profileFor, completaRighe, PAESI_UE } from "./fatturapa.js";
import { autofattura as terminiAutofattura, integrazione as terminiIntegrazione } from "./terms.js";
import { draft } from "./model.js";
import { forget as forgetReceipts } from "./attachments.js";
import { tf } from "./i18n.js";
import { date as shownDate } from "./format.js";
import { currentDay } from "./day.js";

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
  // **Quello che l'azienda ha già deciso su questa spesa non si perde riaprendo il foglio.** Come
  // `importato`: questa funzione costruisce il record da una lista di campi e scarta il resto, e
  // senza queste due righe correggere un importo farebbe ricomparire un'autofattura già fatta.
  if (fields.autofatturaId) record.autofatturaId = fields.autofatturaId;
  if (fields.autofatturaNonServe) record.autofatturaNonServe = true;
  // **Reverse charge: the VAT the supplier did not charge, and the company owes.** The flag, what was
  // bought (goods or services decide TD17 against TD18/TD19), and what was decided about the
  // integration — kept like the autofattura's, for the same reason.
  if (fields.inversione === true || fields.inversione === "on" || fields.inversione === "true") record.inversione = true;
  if (["beni", "servizi"].includes(fields.beniServizi)) record.beniServizi = fields.beniServizi;
  if (fields.integrazioneId) record.integrazioneId = fields.integrazioneId;
  if (fields.integrazioneNonServe) record.integrazioneNonServe = true;
  // **The withholding and the amount asked for**, from a received invoice: what is paid to the
  // supplier is the total less the withholding (which the company pays to the revenue), or exactly
  // the sum of the file's instalments when it states them. Kept only when there is something to keep.
  // **The instalments, when the supplier set more than one.** One date for the whole amount put a
  // three-instalment invoice entirely on the first date: overdue at once for money not yet due.
  // Kept only with two or more, each with a date and an amount; the first date is the purchase's.
  const rate = Array.isArray(fields.rate) ? fields.rate
    .map((quota) => ({
      scadenza: /^\d{4}-\d{2}-\d{2}$/.test(String(quota && quota.scadenza)) ? String(quota.scadenza) : "",
      importo: quota && quota.importo !== undefined && quota.importo !== "" ? parseAmount(quota.importo) : null,
    }))
    .filter((quota) => quota.scadenza && quota.importo !== null)
    .sort((a, b) => a.scadenza.localeCompare(b.scadenza)) : [];
  if (rate.length >= 2) {
    record.rate = rate;
    if (!record.scadenza) record.scadenza = rate[0].scadenza;
  }
  // A supplier's credit note may name the invoice it reverses: then it comes off that invoice's
  // amount owed, as a customer's note does on the sales side.
  if (tipo === "nota" && fields.fatturaId) record.fatturaId = String(fields.fatturaId);
  for (const key of ["ritenuta", "daPagare", "totaleDichiarato"]) {
    const value = fields[key] !== undefined && fields[key] !== null && fields[key] !== "" ? parseAmount(fields[key]) : null;
    if (value !== null && cmp(_amount(value), ZERO) !== 0) record[key] = value;
  }
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

/**
 * What the supplier is owed on a purchase, before any payment: the instalments the file stated,
 * or the total less the withholding. For a purchase typed by hand, the total.
 */
export function dueOf(record, notes = []) {
  const base = record.daPagare
    ? _amount(record.daPagare)
    : sub(_amount(record.totale), _amount(record.ritenuta || "0"));
  // The supplier's credit notes that name this invoice come off it.
  const stornato = sum((notes || []).filter((nota) => nota.tipo === "nota" && nota.fatturaId === record.id)
    .map((nota) => _amount(nota.totale)));
  const resto = sub(base, stornato);
  return cmp(resto, ZERO) > 0 ? resto : ZERO;
}

/**
 * The instalments of a purchase, each with what is still owed on it.
 *
 * The payments close the oldest instalment first — how a partial payment is meant, the same rule
 * as the sales side. Without instalments the purchase is one, due on its date. The last instalment
 * absorbs any difference between the file's instalments and what is owed (a credit note, a
 * rounding), so the parts always add up to the whole.
 */
export function partsOf(record, outlays, notes = []) {
  const dovuto = dueOf(record, notes);
  const rate = Array.isArray(record.rate) && record.rate.length >= 2
    ? record.rate.map((quota) => ({ scadenza: quota.scadenza, importo: _amount(quota.importo) }))
    : [{ scadenza: record.scadenza || record.data, importo: dovuto }];
  const dichiarato = sum(rate.map((quota) => quota.importo));
  rate[rate.length - 1].importo = add(rate[rate.length - 1].importo, sub(dovuto, dichiarato));
  let pagato = paidOf(outlays || []);
  return rate.map((quota) => {
    const coperto = cmp(pagato, quota.importo) >= 0 ? quota.importo : (cmp(pagato, ZERO) > 0 ? pagato : ZERO);
    pagato = sub(pagato, coperto);
    const resto = sub(quota.importo, coperto);
    return { scadenza: quota.scadenza, importo: cmp(resto, ZERO) > 0 ? resto : ZERO };
  });
}

/** The next instalment still owed, or the purchase's own date when nothing is: what the list shows. */
export function nextDue(record, outlays, notes = []) {
  const aperta = partsOf(record, outlays, notes).find((quota) => cmp(quota.importo, ZERO) > 0);
  return aperta ? aperta.scadenza : (record.scadenza || record.data);
}

/** The credit notes among the purchases, for the functions above. */
export function notesOf(costs) {
  return (costs || []).filter((record) => record.tipo === "nota" && record.fatturaId);
}

/** Quanto è stato pagato di un acquisto, dai suoi pagamenti. */
export function paidOf(outlays) {
  return sum(outlays.map((one) => _amount(one.importo)));
}

/** Quanto resta da pagare: mai sotto zero, un pagamento in più non è un credito. Una nota di credito non si paga. */
export function owedOn(record, outlays, notes = []) {
  if (record.tipo === "nota") return ZERO;
  const resto = sub(dueOf(record, notes), paidOf(outlays));
  return cmp(resto, ZERO) > 0 ? resto : ZERO;
}

/**
 * `pagato`, `scaduto` o `aperto`. Senza scadenza un acquisto è a vista: scade il giorno stesso.
 * With instalments, overdue when an instalment still owed is past its date — not when the first
 * date of the whole has passed.
 */
export function state(record, outlays, { today = currentDay(), notes = [] } = {}) {
  if (cmp(owedOn(record, outlays, notes), ZERO) === 0) return "pagato";
  const scaduta = partsOf(record, outlays, notes)
    .some((quota) => cmp(quota.importo, ZERO) > 0 && quota.scadenza && quota.scadenza < today);
  return scaduta ? "scaduto" : "aperto";
}

/**
 * Lo scadenzario passivo: una riga per acquisto non saldato, dalla scadenza più vicina.
 * Stessa forma delle righe dello scadenzario attivo, con `costId` al posto di `docId`.
 */
export function payable(costs, outlays, { today = currentDay() } = {}) {
  const per = new Map();
  for (const one of outlays) {
    if (!per.has(one.costId)) per.set(one.costId, []);
    per.get(one.costId).push(one);
  }
  // One row per instalment still owed, like the sales side: a three-instalment purchase shows three
  // dates, not one total on the first.
  const notes = notesOf(costs);
  return costs
    .filter((record) => record.tipo !== "nota")
    .flatMap((record) => partsOf(record, per.get(record.id) || [], notes).map((quota) => ({
      costId: record.id, partyId: record.partyId, scadenza: quota.scadenza, importo: quota.importo,
      scaduta: Boolean(quota.scadenza) && quota.scadenza < today,
    })))
    .filter((row) => cmp(row.importo, ZERO) > 0)
    .sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)));
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   l ' a u t o f a t t u r a   d e l l ' a r t i c o l o   7
// -----------------------------------------------------------------------------------------------------------------

/**
 * Gli acquisti per cui la fattura non è mai arrivata, e per cui l'autofattura è ora dovuta.
 *
 * **La norma.** L'articolo 7 del DD 133/2026 mette in capo al cliente un obbligo che di solito si
 * pensa del fornitore: chi non riceve la fattura nei termini deve emetterne una lui — il `TD29` —
 * e trasmetterla a HUB-SM entro trenta giorni, passati due mesi dal termine che aveva il
 * fornitore. Chi non lo fa incorre nella stessa sanzione di chi non ha fatturato.
 *
 * **Che cosa l'applicazione considera un acquisto senza fattura.** Una spesa: è il tipo che il
 * registro degli acquisti usa per il denaro uscito senza un documento del fornitore, e infatti è
 * l'unico che non ha un numero. Una fattura ricevuta, per definizione, è arrivata.
 *
 * **Il perimetro è stretto, e per scelta.** Solo fra due soggetti sammarinesi: l'obbligo nasce da
 * una norma della Repubblica e riguarda il canale interno, e un fornitore italiano fattura con le
 * regole sue. Fuori da lì la funzione non propone niente, invece di proporre un adempimento che
 * non esiste.
 *
 * Restano fuori anche le spese che l'azienda ha già valutato: quelle da cui un'autofattura è già
 * nata (`autofatturaId`) e quelle marcate come non dovute (`autofatturaNonServe`) — perché una
 * ricevuta di un soggetto non obbligato alla fattura elettronica è una spesa legittima senza
 * fattura, e l'applicazione non può saperlo da sola.
 */
export function daAutofatturare(costs, { company, anagrafiche, oggi } = {}) {
  if (!company || String(company.paese || "IT").toUpperCase() !== "SM") return [];
  const chi = anagrafiche instanceof Map ? anagrafiche : new Map();
  return (costs || [])
    .filter((record) => record.tipo === "spesa" && !record.autofatturaId && !record.autofatturaNonServe)
    .map((record) => {
      const party = chi.get(record.partyId) || null;
      if (!party || String(party.paese || "IT").toUpperCase() !== "SM") return null;
      const termine = terminiAutofattura(record, profileFor(company, party), { oggi });
      return termine ? { record, party, termine } : null;
    })
    .filter((row) => row && (row.termine.key === "aperto" || row.termine.key === "scaduto"))
    // Prima quella che scade prima: è l'ordine in cui vanno fatte, e in cima sta quella in ritardo.
    .sort((a, b) => String(a.termine.al).localeCompare(String(b.termine.al)));
}

/**
 * L'autofattura di un acquisto, come bozza, senza salvarla.
 *
 * **Una riga sola, con l'imponibile della spesa.** L'autofattura sostituisce la fattura che non è
 * arrivata, e di quella fattura l'azienda conosce quello che ha pagato: importo, fornitore e data
 * dell'operazione. Il dettaglio delle righe non ce l'ha nessuno, e inventarlo sarebbe scrivere in
 * un documento fiscale una cosa che non è successa — quindi una riga, con la descrizione della
 * spesa, e la causale che dice di quale operazione si tratta.
 *
 * **L'aliquota la decide il canale, non la spesa.** Sull'interna sammarinese l'IVA non si espone —
 * `aliquotaFissa` a zero e natura `N4` — mentre sulla spesa può esserci l'imposta monofase, che è
 * una cosa diversa e si gestisce fuori dalla fattura. Copiarla qui sarebbe un file scartato.
 */
export function autofatturaDa(record, { company, party, oggi = currentDay() } = {}) {
  const profile = profileFor(company, party);
  const descrizione = record.descrizione || record.categoria
    || tf("autofatturaLine", { fornitore: (party || {}).denominazione || "", data: shownDate(record.data) });
  const doc = draft({
    tipo: "TD29",
    data: oggi,
    partyId: record.partyId,
    causale: tf("autofatturaCausale", {
      fornitore: (party || {}).denominazione || "",
      data: shownDate(record.data),
    }),
    righe: [{
      descrizione,
      quantita: "1",
      prezzoUnitario: record.imponibile,
      aliquota: profile.aliquotaFissa ?? record.aliquota,
    }],
  });
  // Same rule as the import for the nature: where the channel admits one, it is written.
  //
  // **The goods type is asked, not guessed.** The company's default describes what the company
  // sells; this document describes what the supplier sold, and an expense does not say whether
  // that was goods or a service. A default here put «services» on a purchase of material, with no
  // delivery note asked and the wrong deadline. Left empty, the document's «this invoice contains»
  // choice shows «to choose», and the checks refuse to issue until it is made.
  completaRighe(doc, company, party, { tipoMerce: false });
  // Da quale spesa viene: è quello che toglie la spesa dall'elenco delle autofatture da fare, e che
  // permette di risalire dal documento al denaro uscito.
  doc.daAcquisto = { costId: record.id, data: record.data, importo: record.totale };
  return doc;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   l e   i n t e g r a z i o n i   d e l l ' i n v e r s i o n e   c o n t a b i l e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Which integration a reverse-charge purchase owes: `TD16`…`TD19`, `?` while goods or services is
 * not known, or `null`.
 *
 * **Italian companies only**, because the obligation is Italian: an Italian supplier's invoice under
 * N6.x is integrated with TD16; from abroad, services are TD17, goods from another EU country TD18,
 * goods from anywhere else TD19 — San Marino included, where the Agenzia's guide makes TD19
 * compulsory for goods invoiced without VAT. Goods imported through customs pay VAT at the border
 * and need nothing: that is what «Non serve» is for. A supplier's credit note under reverse charge
 * gets the same document with negative amounts, which is how the guide says to correct one.
 */
export function tipoIntegrazione(record, party, company) {
  if (!record || !record.inversione) return null;
  if (String((company || {}).paese || "IT").toUpperCase() !== "IT") return null;
  const paese = String((party || {}).paese || "IT").toUpperCase();
  if (paese === "IT") return record.tipo === "spesa" ? null : "TD16";
  if (record.beniServizi === "servizi") return "TD17";
  if (record.beniServizi === "beni") return PAESI_UE.has(paese) ? "TD18" : "TD19";
  return "?";
}

/**
 * The reverse-charge purchases still waiting for their integration, the earliest deadline first.
 *
 * Out: those already integrated (`integrazioneId`) and those the company declared need none
 * (`integrazioneNonServe`) — a service under 5.000 € not relevant in Italy, goods through customs.
 */
export function daIntegrare(costs, { company, anagrafiche, oggi = currentDay() } = {}) {
  if (!company || String(company.paese || "IT").toUpperCase() !== "IT") return [];
  const chi = anagrafiche instanceof Map ? anagrafiche : new Map();
  return (costs || [])
    .filter((record) => record.inversione && !record.integrazioneId && !record.integrazioneNonServe)
    .map((record) => {
      const party = chi.get(record.partyId) || null;
      const tipo = tipoIntegrazione(record, party, company);
      const termine = terminiIntegrazione(record, { oggi });
      return tipo && termine ? { record, party, tipo, termine } : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(a.termine.al).localeCompare(String(b.termine.al)));
}

/**
 * The integration of a purchase, as a draft, without saving it.
 *
 * **The amounts are the supplier's, the rate is the company's.** The supplier wrote no VAT, so the
 * rate is the one the company applies — its default, to be checked on the draft. The lines of an
 * imported invoice come across one by one at their net amount (for TD16 only those under N6.x);
 * without lines, one line with the taxable amount.
 *
 * **The date.** For TD16, TD18 and services from the EU it is the date the invoice was received, or
 * any date in that month: today when today is still that month, otherwise the invoice's date. For
 * TD19 and services from outside the EU it is the date of the operation, the invoice's.
 */
export function integrazioneDa(record, { company, party, tipo, oggi = currentDay() } = {}) {
  const aliquota = String((company || {}).aliquotaPredefinita || "22");
  // A credit note is integrated with negative amounts: the correction the guide prescribes.
  const nota = record.tipo === "nota";
  const segno = (valore) => {
    const testo = String(valore ?? "0");
    if (!nota) return testo;
    return testo.startsWith("-") ? testo.slice(1) : `-${testo}`;
  };
  const paese = String((party || {}).paese || "IT").toUpperCase();
  const daRicezione = tipo === "TD16" || tipo === "TD18" || (tipo === "TD17" && PAESI_UE.has(paese));
  const stessoMese = String(oggi).slice(0, 7) === String(record.data).slice(0, 7) && String(oggi) >= String(record.data);
  const righe = (record.righe || [])
    .filter((riga) => tipo !== "TD16" || /^N6/.test(String(riga.natura || "")))
    .map((riga) => ({
      descrizione: riga.descrizione || record.descrizione || "",
      quantita: "1",
      prezzoUnitario: segno(riga.imponibile ?? riga.prezzoUnitario ?? "0"),
      aliquota,
    }));
  const doc = draft({
    tipo,
    data: daRicezione && stessoMese ? oggi : record.data,
    partyId: record.partyId,
    causale: tf(nota ? "integrazioneCausaleNota" : (record.numero ? "integrazioneCausale" : "integrazioneCausaleSpesa"), {
      numero: record.numero || "",
      fornitore: (party || {}).denominazione || "",
      data: shownDate(record.data),
    }),
    righe: righe.length ? righe : [{
      descrizione: record.descrizione || record.categoria || tf("integrazioneLine", {
        fornitore: (party || {}).denominazione || "", data: shownDate(record.data),
      }),
      quantita: "1",
      prezzoUnitario: segno(record.imponibile),
      aliquota,
    }],
  });
  // The supplier's invoice, which the guide asks to name: the file links the two.
  if (record.numero) doc.fattureCollegate = [{ numero: record.numero, data: record.data }];
  doc.daAcquisto = { costId: record.id, data: record.data, importo: record.totale };
  return doc;
}

/**
 * Untie a purchase from a draft that is being deleted: the autofattura or integration it was waiting
 * for is again to be made. Only the link that points at this very draft is removed.
 */
export async function releasePurchase(db, doc) {
  const costId = doc && doc.daAcquisto && doc.daAcquisto.costId;
  if (!costId) return null;
  const record = await get(db, "costs", costId);
  if (!record) return null;
  const libero = { ...record };
  if (libero.autofatturaId === doc.id) delete libero.autofatturaId;
  if (libero.integrazioneId === doc.id) delete libero.integrazioneId;
  if (libero.autofatturaId === record.autofatturaId && libero.integrazioneId === record.integrazioneId) return record;
  return saveCost(db, libero);
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
  // Refused or cancelled documents carry their frozen totals still, and owe no VAT.
  const emessi = docs.filter((doc) => doc.totali && String(doc.data).startsWith(periodo)
    && doc.stato !== "scartato" && doc.stato !== "annullato");
  let debito = ZERO;
  // **An integration is in both registers.** Its VAT is owed (sales) and, for whoever deducts,
  // deductible (purchases): the balance does not move — except for the flat-rate scheme, which pays
  // it and deducts nothing.
  let integrata = ZERO;
  for (const doc of emessi) {
    const k = kindOf ? kindOf(doc) : { fiscale: true, storna: false };
    if (!k.fiscale) continue;
    // I totali congelati sono già scalati, come li scrive `issue`: si leggono come BigInt.
    let imposta = ZERO;
    try { imposta = BigInt(doc.totali.imposta || 0); } catch (ignored) { imposta = ZERO; }
    debito = k.storna ? sub(debito, imposta) : add(debito, imposta);
    if (k.integrazione) integrata = add(integrata, imposta);
  }
  const acquisti = periodTotals(costs, periodo);
  if (taxKind(company) === "monofase") {
    return { tipo: "monofase", debito, credito: ZERO, saldo: debito, monofase: acquisti.monofase };
  }
  const credito = (company || {}).regimeFiscale === "RF19" ? acquisti.iva : add(acquisti.iva, integrata);
  return { tipo: "iva", debito, credito, saldo: sub(debito, credito), monofase: ZERO };
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
  // The receipts of its payments go too: they prove payments that no longer exist.
  await tx(db, ["costs", "outlays", "attachments"], async (scope) => {
    await scope.remove("costs", id);
    for (const one of suoi) await scope.remove("outlays", one.id);
    await forgetReceipts(scope, suoi);
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
    // When it was written down, for the backup reminder (see `recordPayment`).
    created: new Date().toISOString(),
  };
  await put(db, "outlays", record);
  return record;
}

/**
 * Correct a payment made: amount, day, account, note. The id, the purchase, the receipt and
 * `created` stay; `updated` says when (see `updatePayment` in schedule.js, the same rule for money
 * received). Resolves with the record as stored, or `null` when it no longer exists.
 */
export async function updateOutlay(db, id, { importo, data, conto = null, nota = null }) {
  const before = await get(db, "outlays", id);
  if (!before) return null;
  const after = {
    ...before,
    importo: String(importo),
    data,
    conto: conto ? { id: conto.id, etichetta: conto.etichetta || "", iban: conto.iban || "" } : null,
    nota: nota || null,
    updated: new Date().toISOString(),
  };
  await put(db, "outlays", after);
  return after;
}

/** Togli un pagamento registrato per sbaglio: si cancella, non si storna, come un incasso. */
export async function removeOutlay(db, id) {
  const record = await get(db, "outlays", id);
  await tx(db, ["outlays", "attachments"], async (scope) => {
    await scope.remove("outlays", id);
    if (record) await forgetReceipts(scope, [record]);
  });
}

/** Un acquisto per id, o `null`. */
export async function cost(db, id) {
  return (id && (await get(db, "costs", id))) || null;
}
