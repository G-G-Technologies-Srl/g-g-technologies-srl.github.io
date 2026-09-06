// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A document, out as a FatturaPA file.
//
// **The profile is the reason this file is shaped the way it is.** Nothing here says "Italy": the
// emitter takes a profile that carries the schema name, the version, the file-naming rule and the
// extra checks, and walks the same tree for all of them. The day the Ufficio Tributario publishes
// the technical rules for San Marino's internal invoicing, that is a second profile and not a
// second generator — which is the whole bet of the Fase 7 in the plan.
//
// **The version lives in one place.** `TRACCIATO` below, and the app card names it. Specifications
// change about once a year — 1.9.1 applies from 15 May 2026, 1.9 before it — and a version string
// scattered through twenty call sites is a change nobody finishes.
//
// **What this file does not do.** It does not transmit, it does not sign, and it does not validate
// against the official XSD — there is no XSD validator in a browser. `validate.js` checks the
// subset the app emits, and `test/xsd.sh` checks the output against the real schema on a
// developer's machine, which is where a tool that big belongs.
//
// No DOM in here: `node app/invoice-scope/test/fatturapa.mjs` runs it directly.

import { from, sub, toString } from "./decimal.js";
import { totals, rate, MONEY } from "./totals.js";
import { kind } from "./kinds.js";
import * as xml from "./xml.js";
import { fiscalCode } from "./parse.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * The tracciato this app writes, and the date it applies from.
 *
 * Named on the app card. When the next version comes out, this is what changes, and then the card
 * is read again — the same ageing an article pinned to a live ranking has.
 */
export const TRACCIATO = {
  versione: "1.9.1",
  dal: "2026-05-15",
  schema: "FPR12",
};

const NS = "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2";

/**
 * Il progressivo sta in cinque caratteri, e l'app li usa come cinque cifre decimali.
 *
 * Il tracciato ne ammetterebbe cinque *alfanumerici* — sessanta milioni invece di centomila — e la
 * prima stesura li sfruttava. Il perché non lo fa più sta su `progressivo()`, ed è un caso di
 * ottimizzazione che costa a chi legge: il numero finisce nel nome del file, e i nomi dei file li
 * guarda una persona.
 */
const PROGRESSIVO_MAX = 100000;

/**
 * The profile for the Italian SdI.
 *
 * `codiceDestinatarioEstero` and the San Marino code are here rather than in the walk because they
 * are facts about a destination, not about the shape of a document.
 */
/**
 * I paesi che nel tracciato scrivono un CAP vero e una sigla di provincia.
 *
 * **San Marino sta con l'Italia, non con l'estero**, e questa riga viene da una fattura registrata
 * davvero: un emittente sammarinese scrive il proprio CAP — 47899, che è dentro il sistema postale
 * italiano — e `Provincia SM`. Il codice qui trattava «non Italia» come «estero» e quindi buttava
 * via il CAP sostituendolo con `00000`, che è la regola per un indirizzo che un CAP italiano non ce
 * l'ha. Su una fattura sammarinese cancellava un dato giusto.
 *
 * Il difetto non lo avrebbe trovato lo schema — `00000` è cinque cifre e passa — né una rilettura
 * del codice, che dice esattamente quello che intendeva dire. Lo ha trovato il confronto con un
 * documento vero.
 */
export const PAESI_CON_CAP = new Set(["IT", "SM"]);

export const IT_SDI = {
  id: "it-sdi",
  paese: "IT",
  schema: TRACCIATO.schema,
  versione: TRACCIATO.versione,
  codiceDestinatarioAssente: "0000000",
  codiceDestinatarioEstero: "XXXXXXX",
  codiceDestinatarioSanMarino: "2R4GTO8",
  // Chi trasmette è chi emette: un'azienda italiana manda le proprie fatture allo SdI a nome
  // proprio, o attraverso un intermediario che riscrive questo blocco per conto suo.
  trasmittente: null,
  // Nessun blocco `AltriDatiGestionali` e nessuna riscrittura del riferimento normativo: allo SdI
  // basta la natura, e il testo della norma resta quello di `RIFERIMENTI` in totals.js.
  datiGestionali: null,
  codiciTm: [],
  riferimenti: {},
};

/**
 * Il profilo di un emittente sammarinese.
 *
 * **`IdTrasmittente` è fisso, e non è il COE dell'azienda.** Le fatture passano dall'HUB
 * dell'Ufficio Tributario, che è il trasmittente per tutti: con un codice diverso il documento non
 * supera la validazione sul portale sammarinese — prima ancora di arrivare allo SdI. È un fatto sul
 * *canale*, non sull'azienda, ed è la ragione per cui questo è un profilo e non un campo in
 * anagrafica: chi emette da San Marino non ha niente da scegliere qui, e un campo con un valore
 * obbligatorio è un campo in cui si può solo sbagliare.
 *
 * Preso da una fattura registrata davvero, non da una ricostruzione.
 */
export const SM_UT = {
  ...IT_SDI,
  id: "sm-ut",
  paese: "SM",
  trasmittente: { paese: "SM", codice: "96428100588" },
  // **Il codice che accompagna i servizi.** Sta sulla riga come `AltriDatiGestionali` e torna in
  // testa al riferimento normativo: senza, il portale sammarinese rifiuta il documento. Il nome del
  // dato è qui e non nel codice perché è la cosa che può cambiare — il giorno che l'Ufficio
  // Tributario ne volesse un altro, o due, si riscrive questa riga e non l'emettitore.
  datiGestionali: "TM",
  // **I valori ammessi, quando li sapremo.** Vuoto vuol dire «il campo è libero»: oggi l'elenco
  // dell'Ufficio Tributario non ce l'abbiamo, e inventarlo sarebbe peggio che non averlo — un menù
  // con dentro codici sbagliati è più convincente di un campo vuoto, e altrettanto falso.
  //
  // Riempirlo fa scattare due cose insieme, senza toccare altro: la maschera propone i valori, e
  // `validate.js` rifiuta quelli fuori elenco. Finché è vuoto nessuna delle due si vede.
  codiciTm: [],
  // Il testo che l'Ufficio Tributario ha già accettato. Più corto di quello italiano, e non è una
  // semplificazione nostra: è la forma che passa la validazione.
  riferimenti: { "N3.1": "Non imp. art.8 DPR 633/72" },
};

/** I profili, per paese di chi emette. */
const PROFILI = { IT: IT_SDI, SM: SM_UT };

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** An amount as the tracciato wants it: two decimals, a full stop, no thousands separator. */
function _amount(value) {
  return toString(value, MONEY);
}

/**
 * A quantity or a unit price, at up to eight decimals with the trailing zeros trimmed.
 *
 * The schema allows two to eight, so `1.00` is right and `1` is not. Trimming past two would
 * produce `1.0`, which is rejected — hence the floor.
 *
 * **`PrezzoUnitario` goes through here too**, and the first version sent it through the two-decimal
 * formatter instead: 0,08745 €/kWh became 0,09, the SdI recomputed 1234,56789 × 0,09 = 111,11
 * against a declared total of 107,96, and rejected the file.
 */
function _quantity(value) {
  const full = toString(value, 8);
  const trimmed = full.replace(/(\.\d{2}\d*?)0+$/, "$1");
  return trimmed;
}

/** A rate: two decimals, because `22` is not what the schema wants and `22.00` is. */
function _rate(value) {
  return toString(from(value), MONEY);
}

/**
 * The address block, shared by the two parties.
 *
 * A foreign party has no `Provincia` and its `CAP` is `00000`: the schema wants five digits, and
 * an Italian postcode is the only kind it knows. Sending a real foreign postcode there is the
 * mistake this function exists to prevent.
 */
function _sede(sede, paese) {
  const proprio = PAESI_CON_CAP.has(paese || "IT");
  return [
    ["Indirizzo", sede.indirizzo],
    ["NumeroCivico", sede.numeroCivico],
    ["CAP", proprio ? sede.cap : "00000"],
    ["Comune", sede.comune],
    ["Provincia", proprio ? sede.provincia : null],
    ["Nazione", paese || "IT"],
  ];
}

/** A party's name: either a company or a person, never both. */
function _anagrafica(party) {
  return [
    ["Denominazione", party.denominazione],
    ["Nome", party.denominazione ? null : party.nome],
    ["Cognome", party.denominazione ? null : party.cognome],
  ];
}

function _cedente(company) {
  return [
    ["DatiAnagrafici", [
      ["IdFiscaleIVA", [
        ["IdPaese", company.paese || "IT"],
        // Belt and braces: the screens strip the country on the way in, and this strips it again on
        // the way out, so a record written before that rule existed — or by an import that predates
        // it — still leaves as `29141` and not `SM29141`.
        ["IdCodice", fiscalCode(company.partitaIva, company.paese || "IT")],
      ]],
      ["CodiceFiscale", fiscalCode(company.codiceFiscale, company.paese || "IT")],
      ["Anagrafica", _anagrafica(company)],
      ["RegimeFiscale", company.regimeFiscale || "RF01"],
    ]],
    ["Sede", _sede(company.sede || {}, company.paese)],
    company.rea ? ["IscrizioneREA", [
      ["Ufficio", company.rea.ufficio],
      ["NumeroREA", company.rea.numero],
      ["StatoLiquidazione", company.rea.statoLiquidazione || "LN"],
    ]] : null,
  ];
}

function _cessionario(party) {
  return [
    ["DatiAnagrafici", [
      party.partitaIva ? ["IdFiscaleIVA", [
        ["IdPaese", party.paese || "IT"],
        ["IdCodice", fiscalCode(party.partitaIva, party.paese || "IT")],
      ]] : null,
      ["CodiceFiscale", fiscalCode(party.codiceFiscale, party.paese || "IT")],
      ["Anagrafica", _anagrafica(party)],
    ]],
    ["Sede", _sede(party.sede || {}, party.paese)],
  ];
}

/** The header block that says who is sending, to whom, and in what format. */
function _trasmissione(doc, company, party, profile) {
  const chi = profile.trasmittente;
  return [
    ["IdTrasmittente", [
      ["IdPaese", chi ? chi.paese : (company.paese || profile.paese)],
      ["IdCodice", chi ? chi.codice : fiscalCode(company.partitaIva, company.paese || profile.paese)],
    ]],
    ["ProgressivoInvio", progressivo(doc.progressivo ?? 1)],
    ["FormatoTrasmissione", profile.schema],
    ["CodiceDestinatario", destinatario(party, profile)],
    party.pec ? ["PECDestinatario", party.pec] : null,
  ];
}

function _datiGenerali(doc, computed) {
  const ritenuta = doc.ritenuta
    ? ["DatiRitenuta", [
      ["TipoRitenuta", doc.ritenuta.tipo || "RT01"],
      ["ImportoRitenuta", _amount(computed.ritenuta)],
      ["AliquotaRitenuta", _rate(doc.ritenuta.aliquota)],
      ["CausalePagamento", doc.ritenuta.causale || "A"],
    ]]
    : null;

  const bollo = doc.bollo
    ? ["DatiBollo", [["BolloVirtuale", "SI"], ["ImportoBollo", _amount(computed.bollo)]]]
    : null;

  return [
    ["DatiGeneraliDocumento", [
      ["TipoDocumento", doc.tipo || "TD01"],
      ["Divisa", doc.divisa || "EUR"],
      ["Data", doc.data],
      ["Numero", doc.numero],
      ritenuta,
      bollo,
      ["ImportoTotaleDocumento", _amount(computed.totale)],
      ["Causale", doc.causale],
    ]],
    ...(doc.fattureCollegate || []).map((ref) => ["DatiFattureCollegate", [
      ["IdDocumento", ref.numero],
      ["Data", ref.data],
    ]]),
    ...(doc.ddt || []).map((ref) => ["DatiDDT", [
      ["NumeroDDT", ref.numero],
      ["DataDDT", ref.data],
      ...(ref.righe || []).map((n) => ["RiferimentoNumeroLinea", String(n)]),
    ]]),
  ];
}

function _beniServizi(doc, computed, profile) {
  const linee = computed.righe.map((line) => ["DettaglioLinee", [
    ["NumeroLinea", String(line.numero)],
    ["Descrizione", line.descrizione],
    ["Quantita", line.quantita === undefined ? null : _quantity(from(line.quantita))],
    ["UnitaMisura", line.unitaMisura],
    ["PrezzoUnitario", line.prezzoUnitario === undefined ? null : _quantity(from(line.prezzoUnitario))],
    ...(line.sconto ? [["ScontoMaggiorazione", [
      ["Tipo", "SC"],
      ["Percentuale", line.sconto.percentuale === undefined ? null : _rate(line.sconto.percentuale)],
      ["Importo", line.sconto.importo === undefined ? null : _amount(from(line.sconto.importo))],
    ]]] : []),
    ["PrezzoTotale", _amount(line.prezzoTotale)],
    ["AliquotaIVA", _rate(line.aliquota)],
    ["Natura", line.natura],
    // Il codice dell'Ufficio Tributario, in coda alla riga come vuole lo schema, e solo per un
    // profilo che lo dichiara. Lo stesso codice torna davanti al `RiferimentoNormativo` del
    // riepilogo: nel file compare due volte, ed è così che deve essere.
    ...(profile.datiGestionali && line.tm ? [["AltriDatiGestionali", [
      ["TipoDato", profile.datiGestionali],
      ["RiferimentoTesto", String(line.tm)],
    ]]] : []),
  ]]);

  const riepiloghi = computed.riepiloghi.map((r) => ["DatiRiepilogo", [
    ["AliquotaIVA", _rate(r.aliquota)],
    ["Natura", r.natura],
    ["ImponibileImporto", _amount(r.imponibile)],
    ["Imposta", _amount(r.imposta)],
    ["EsigibilitaIVA", r.esigibilita],
    ["RiferimentoNormativo", riferimentoNormativo(r, profile)],
  ]]);

  return [...linee, ...riepiloghi];
}

function _pagamento(doc, computed) {
  if (!doc.pagamento) return null;
  const quote = doc.pagamento.rate || [{}];

  // **An instalment with no amount is a share of the total, not the whole of it.** Two undated
  // instalments used to be written as the full amount twice, so a document of 1220,00 asked for
  // 2440,00 — and `CondizioniPagamento` stayed at TP02 while two instalments were listed. The
  // split is `rate()` in totals.js, which existed and was called from nowhere.
  const mancanti = quote.filter((quota) => quota.importo === undefined).length;
  const dichiarati = quote
    .filter((quota) => quota.importo !== undefined)
    .reduce((sum, quota) => sum + from(quota.importo), 0n);
  const resto = sub(computed.totale, dichiarati);
  const quotePari = mancanti > 0 ? rate(resto, mancanti) : [];
  let next = 0;

  const dettagli = quote.map((quota) => ["DettaglioPagamento", [
    ["ModalitaPagamento", quota.modalita || doc.pagamento.modalita || "MP05"],
    ["DataScadenzaPagamento", quota.scadenza],
    ["ImportoPagamento", _amount(quota.importo === undefined
      ? quotePari[next++]
      : from(quota.importo))],
    ["IBAN", quota.iban || doc.pagamento.iban],
  ]]);

  // Two instalments and "payable in full" cannot both be true. The terms follow the count rather
  // than a field somebody has to remember to change.
  const condizioni = quote.length > 1 ? "TP01" : (doc.pagamento.condizioni || "TP02");

  return ["DatiPagamento", [
    ["CondizioniPagamento", condizioni],
    ...dettagli,
  ]];
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Il progressivo di trasmissione, in decimale e fino a cinque cifre.
 *
 * **It never goes back**, not even after a file is rejected: the SdI treats a repeated
 * trasmittente-plus-progressive as a duplicate and refuses the second one, whatever happened to
 * the first. So it is a counter of its own, separate from the invoice number, and the app stores
 * it as such.
 *
 * **Era in base 36, e sembrava la scelta furba.** Cinque caratteri alfanumerici ne contengono
 * sessanta milioni invece di centomila, e il tracciato li ammette: un tetto dieci volte più alto,
 * gratis. Il costo si vedeva solo guardando un file vero. Il progressivo finisce nel *nome* del
 * file — che oggi è quello che l'Ufficio Tributario sammarinese legge — e in base 36 dopo il 54
 * viene `0001J`: un numero che non si legge, che non prosegue una numerazione già iniziata
 * altrove, e che nessuno può controllare a occhio contro l'elenco di quello che ha mandato.
 *
 * Centomila trasmissioni sono la vita intera di una piccola impresa. La headroom serviva a un caso
 * che non esiste, e la pagava chi legge i nomi dei file tutti i giorni.
 */
export function progressivo(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`progressivo non valido: ${value}`);
  }
  if (value >= PROGRESSIVO_MAX) {
    throw new RangeError(`progressivo oltre il massimo di cinque cifre: ${value}`);
  }
  return String(value);
}

/**
 * The recipient code, which has four legitimate shapes and no fifth.
 *
 * Seven characters always: the one the customer gave you; `0000000` when they have none, in which
 * case the invoice reaches them through the cassetto fiscale and the PEC is optional; `XXXXXXX`
 * for a customer abroad; and the Ufficio Tributario's `2R4GTO8` for San Marino.
 */
/**
 * La nota di esenzione di un riepilogo, come la vuole il profilo.
 *
 * **Una funzione sola, due chiamanti.** La scrive l'emettitore e la misura `validate.js`, che deve
 * fermarsi ai cento caratteri dello schema: se la componessero separatamente, il controllo
 * misurerebbe una stringa e il file ne porterebbe un'altra — e la differenza si vedrebbe soltanto
 * quando il documento viene scartato.
 */
export function riferimentoNormativo(r, profile = IT_SDI) {
  if (!r.natura) return null;
  const norma = (profile.riferimenti || {})[r.natura] || r.riferimentoNormativo;
  if (!norma) return null;
  return r.tm && profile.datiGestionali ? `${profile.datiGestionali}:${r.tm},${norma}` : norma;
}

/**
 * Il profilo da usare, dedotto da chi emette.
 *
 * Il paese dell'azienda è già in anagrafica e decide tutto il resto — il canale, il trasmittente,
 * le regole del CAP — quindi chiederlo una seconda volta sarebbe chiedere due volte la stessa cosa
 * e lasciare aperta la possibilità che le due risposte non coincidano.
 */
export function profileFor(company) {
  return PROFILI[(company || {}).paese] || IT_SDI;
}

export function destinatario(party, profile = IT_SDI) {
  if (party.codiceDestinatario) return party.codiceDestinatario;
  const paese = party.paese || "IT";
  if (paese === "SM") return profile.codiceDestinatarioSanMarino;
  if (paese !== "IT") return profile.codiceDestinatarioEstero;
  return profile.codiceDestinatarioAssente;
}

/**
 * The file name: country, fiscal code, an underscore, and the progressive.
 *
 * `.xml`, and `.xml.p7m` only for a signed file — which this app does not produce, which is why
 * the extension is not a parameter.
 */
export function fileName(company, value, profile = IT_SDI) {
  const paese = company.paese || profile.paese;
  return `${paese}${fiscalCode(company.partitaIva, paese)}_${progressivo(value)}.xml`;
}

/**
 * A document as FatturaPA text, plus the name the file should carry.
 *
 * Returns `{ name, text, totals }`: the totals come back because whoever writes the file also
 * shows the amounts, and recomputing them somewhere else is how two numbers on the same screen
 * start to disagree.
 */
export function build(doc, { company, party, profile = profileFor(company) } = {}) {
  // **Refused loudly, and here.** A quote has no `TipoDocumento` the SdI would accept, so a file
  // built from one would carry the word `preventivo` where a code belongs and be rejected on
  // receipt — after the app had marked the quote as exported and moved its transmission counter,
  // neither of which can be walked back. The screen hides the button; this is what makes it a rule.
  if (!kind(doc).fiscale) {
    throw new Error(`un documento «${doc.tipo}» non diventa un file FatturaPA`);
  }
  const computed = totals(doc);
  const children = [
    ["FatturaElettronicaHeader", [
      ["DatiTrasmissione", _trasmissione(doc, company, party, profile)],
      ["CedentePrestatore", _cedente(company)],
      ["CessionarioCommittente", _cessionario(party)],
    ]],
    ["FatturaElettronicaBody", [
      ["DatiGenerali", _datiGenerali(doc, computed)],
      ["DatiBeniServizi", _beniServizi(doc, computed, profile)],
      _pagamento(doc, computed),
    ]],
  ];

  const text = xml.document("p:FatturaElettronica", {
    "xmlns:p": NS,
    versione: profile.schema,
  }, children);

  return { name: fileName(company, doc.progressivo ?? 1, profile), text, totals: computed };
}
