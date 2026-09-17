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
import { totals, rate, chiaveConTm, MONEY } from "./totals.js";
import { kind, numero as shownNumber } from "./kinds.js";
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

/**
 * I cinque tipi merce del regime monofase, e le combinazioni che una fattura può contenere.
 *
 * Le combinazioni non sono un'opinione: una fattura porta **solo** beni (1, 4, 7), **solo** conto
 * lavoro con materie prime (2), **solo** conto lavoro senza (3). Mescolarli è uno scarto, e il
 * gruppo è anche quello che decide se il DDT è obbligatorio.
 */
export const TIPI_MERCE = ["1", "2", "3", "4", "7"];
export const GRUPPI_MERCE = [["1", "4", "7"], ["2"], ["3"]];

/** I tipi merce per cui il DDT è obbligatorio: tutto tranne il 3. */
export const MERCE_CON_DDT = new Set(["1", "2", "4", "7"]);

/**
 * The profile for the Italian SdI.
 *
 * `codiceDestinatarioEstero` and the San Marino code are here rather than in the walk because they
 * are facts about a destination, not about the shape of a document.
 */
export const IT_SDI = {
  id: "it-sdi",
  paese: "IT",
  // **Il canale, non il paese di chi emette.** Da qui in avanti è quello che cambia le regole: lo
  // SdI italiano e l'HUB dell'Ufficio Tributario vogliono due file diversi dalla stessa azienda.
  canale: "sdi",
  // Se questa direzione produce un file. È l'unico campo che può essere falso, e vale per una
  // direzione sola — vedi `SM_ESTERO`.
  file: true,
  schema: TRACCIATO.schema,
  versione: TRACCIATO.versione,
  codiceDestinatarioAssente: "0000000",
  codiceDestinatarioEstero: "XXXXXXX",
  codiceDestinatarioSanMarino: "2R4GTO8",
  // Un canale che recapita a un destinatario preciso non ha un codice fisso: lo sceglie il cliente.
  destinatarioFisso: null,
  // Chi trasmette è chi emette: un'azienda italiana manda le proprie fatture allo SdI a nome
  // proprio, o attraverso un intermediario che riscrive questo blocco per conto suo.
  trasmittente: null,
  // I `TipoDocumento` che questo canale accetta. Erano una costante di `validate.js`, uguale per
  // tutti; sono invece la prima cosa che cambia fra un canale e l'altro.
  tipi: ["TD01", "TD02", "TD04", "TD05", "TD24", "TD29"],
  // Un tipo dell'app che sul filo diventa un altro codice. Vuoto qui: in Italia la fattura
  // differita è `TD24` e si scrive così.
  rimappa: {},
  // `null` vuol dire «tutte quelle dello schema». Un elenco vuol dire quelle e basta.
  nature: null,
  aliquotaFissa: null,
  // Nessun blocco `AltriDatiGestionali` e nessuna riscrittura del riferimento normativo: allo SdI
  // basta la natura, e il testo della norma resta quello di `RIFERIMENTI` in totals.js.
  datiGestionali: null,
  codiciTm: [],
  tmObbligatorio: false,
  // Gli elementi che questo canale non vuole vedere valorizzati. Lo schema li ammette, il canale no,
  // e un campo che non si valorizza non deve comparire affatto.
  campiVietati: [],
  riferimenti: {},
  // I regimi fiscali che il canale ammette. In Italia il forfettario esiste; a San Marino il
  // Documento A dice «deve essere valorizzato con RF01» e basta.
  regimi: ["RF01", "RF19"],
  // Se un riepilogo con imponibile zero è un file scartato. Lo dice l'Allegato B dell'esportazione.
  imponibileNonZero: false,
  merceSenzaImposta: [],
  // I termini di trasmissione, in mesi, e da quale data si contano. `null` dove non li calcoliamo.
  termini: null,
};

/**
 * Il profilo di un emittente sammarinese che fattura in Italia — l'esportazione.
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
export const SM_EXPORT = {
  ...IT_SDI,
  id: "sm-export",
  paese: "SM",
  canale: "hub-sm",
  trasmittente: { paese: "SM", codice: "96428100588" },
  // L'Allegato B del Regolamento 14/2021 ne ammette tre, e `TD24` non è fra questi: una differita
  // che parte da San Marino è una `TD01` con i suoi `DatiDDT`, ed è la `rimappa` qui sotto a dirlo.
  tipi: ["TD01", "TD04", "TD05"],
  rimappa: { TD24: "TD01" },
  // In esportazione la natura è formalmente opzionale — una fattura può portare IVA prepagata — ma
  // se c'è può essere solo questa.
  nature: ["N3.1"],
  // **Il codice che accompagna i servizi.** Sta sulla riga come `AltriDatiGestionali` e torna in
  // testa al riferimento normativo: senza, il portale sammarinese rifiuta il documento. Il nome del
  // dato è qui e non nel codice perché è la cosa che può cambiare — il giorno che l'Ufficio
  // Tributario ne volesse un altro, o due, si riscrive questa riga e non l'emettitore.
  datiGestionali: "TM",
  // **I valori ammessi.** Sono nell'Allegato B e nel Documento B, gli stessi cinque per i due
  // canali. Riempirlo fa scattare due cose insieme: la maschera propone i valori e `validate.js`
  // rifiuta quelli fuori elenco.
  codiciTm: TIPI_MERCE,
  tmObbligatorio: true,
  // Il testo che l'Ufficio Tributario ha già accettato. Più corto di quello italiano, e non è una
  // semplificazione nostra: è la forma che passa la validazione.
  riferimenti: { "N3.1": "Non imp. art.8 DPR 633/72" },
  regimi: ["RF01"],
  imponibileNonZero: true,
  // I tipi merce che non possono portare imposta: conto lavoro, con e senza materie prime. Lo dice
  // l'Allegato B dell'esportazione — «se TipoMerce = 2 o 3 allora deve essere AliquotaIVA = 0» — e
  // nell'interna è vero per tutti, perché lì l'aliquota è fissa a zero comunque.
  merceSenzaImposta: ["2", "3"],
  // Beni: tre mesi dalla data del DDT, e oltre il termine la fattura **non è vidimabile**. Servizi:
  // due mesi dalla data della fattura.
  termini: { beni: 3, servizi: 2, bloccante: true },
};

/**
 * Il profilo di un emittente sammarinese che fattura a un altro sammarinese — l'interna.
 *
 * **Non è l'esportazione con un destinatario diverso**, ed è l'errore che il codice faceva: un solo
 * profilo per paese di chi emette mandava questo documento con il trasmittente dell'Ufficio
 * Tributario e il codice destinatario dello SdI. Qui il file non va da nessuna parte — resta dentro
 * HUB-SM — quindi il trasmittente torna a essere chi trasmette e il destinatario è sette zeri.
 *
 * **L'IVA non si espone.** Il regime è monofase: aliquota `0.00`, natura `N4`, imposta `0.00`, e
 * l'imposta vera si gestisce fuori dalla fattura, con i rimborsi monofase.
 */
export const SM_INTERNA = {
  ...SM_EXPORT,
  id: "sm-interna",
  // Chi trasmette è chi emette, come in Italia: l'HUB non è più il trasmittente di tutti.
  trasmittente: null,
  // Il file resta dentro HUB-SM, quindi non c'è un canale telematico da indicare.
  destinatarioFisso: "0000000",
  // Il Documento B ne ammette cinque, e ci sono l'acconto e l'autofattura del cessionario.
  tipi: ["TD01", "TD02", "TD04", "TD05", "TD29"],
  rimappa: { TD24: "TD01" },
  nature: ["N4"],
  aliquotaFissa: "0.00",
  // Il Documento A li dichiara «non previsti ai fini della fatturazione elettronica nelle
  // transazioni interne al territorio della Repubblica». Su `EsigibilitaIVA` i due documenti si
  // contraddicono — l'esempio del Documento B la riporta — e ometterla è la scelta prudente:
  // l'elemento è facoltativo nello schema.
  campiVietati: ["codiceFiscale", "provincia", "rea", "esigibilita", "pec"],
  // Il testo dell'esenzione, con il codice TM davanti come vuole il Documento B.
  riferimenti: { N4: "ESENTE" },
  // Due mesi in tutti e due i casi. Fuori termine la fattura viene comunque accettata, e costa cento
  // euro: è una sanzione, non uno sbarramento.
  termini: { beni: 2, servizi: 2, bloccante: false },
};

/**
 * San Marino verso un paese diverso dall'Italia: **non esiste un file da produrre**.
 *
 * Il perimetro della fattura elettronica sammarinese è definito da due norme, e nessuna comprende
 * questa direzione: il DD 163/2021 riguarda le operazioni con l'Italia, il DD 133/2026 quelle
 * interne alla Repubblica. La fattura resta cartacea o PDF.
 *
 * È un profilo e non un `null` perché tutto il resto dell'app chiede al profilo — la maschera per
 * sapere se mostrare la colonna TM, il pulsante per sapere se può esistere. Un profilo che dichiara
 * `file: false` risponde a tutte quelle domande; un `null` le farebbe esplodere una alla volta.
 */
export const SM_ESTERO = {
  ...SM_EXPORT,
  id: "sm-estero",
  canale: null,
  file: false,
  trasmittente: null,
  tipi: [],
  tmObbligatorio: false,
  termini: null,
};

/**
 * I profili, per direzione: chi emette → chi riceve.
 *
 * **Le direzioni sono sei e i paesi di partenza due**, quindi una tabella per paese di partenza non
 * può distinguerle: `SM → SM` e `SM → IT` sono due tracciati diversi che partono dalla stessa
 * azienda. Le tre direzioni italiane invece sono lo stesso file con tre destinatari diversi, e
 * `destinatario()` basta a separarle.
 */
const PROFILI = {
  IT: { IT: IT_SDI, SM: IT_SDI, estero: IT_SDI },
  SM: { IT: SM_EXPORT, SM: SM_INTERNA, estero: SM_ESTERO },
};

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
function _sede(sede, paese, profile) {
  const proprio = PAESI_CON_CAP.has(paese || "IT");
  return [
    ["Indirizzo", sede.indirizzo],
    ["NumeroCivico", sede.numeroCivico],
    ["CAP", proprio ? sede.cap : "00000"],
    ["Comune", sede.comune],
    // La sigla di provincia è giusta su una fattura sammarinese diretta in Italia, e non va scritta
    // su una interna: lo stesso campo, due canali, due risposte. Per questo la domanda è al profilo.
    ["Provincia", proprio && !vietato(profile, "provincia") ? sede.provincia : null],
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

function _cedente(company, profile) {
  const paese = company.paese || "IT";
  return [
    ["DatiAnagrafici", [
      ["IdFiscaleIVA", [
        ["IdPaese", paese],
        // Belt and braces: the screens strip the country on the way in, and this strips it again on
        // the way out, so a record written before that rule existed — or by an import that predates
        // it — still leaves as `29141` and not `SM29141`.
        ["IdCodice", identificativo(company.partitaIva, paese)],
      ]],
      ["CodiceFiscale", vietato(profile, "codiceFiscale")
        ? null
        : fiscalCode(company.codiceFiscale, paese)],
      ["Anagrafica", _anagrafica(company)],
      ["RegimeFiscale", company.regimeFiscale || "RF01"],
    ]],
    ["Sede", _sede(company.sede || {}, paese, profile)],
    company.rea && !vietato(profile, "rea") ? ["IscrizioneREA", [
      ["Ufficio", company.rea.ufficio],
      ["NumeroREA", company.rea.numero],
      ["StatoLiquidazione", company.rea.statoLiquidazione || "LN"],
    ]] : null,
  ];
}

function _cessionario(party, profile) {
  const paese = party.paese || "IT";
  return [
    ["DatiAnagrafici", [
      party.partitaIva ? ["IdFiscaleIVA", [
        ["IdPaese", paese],
        ["IdCodice", identificativo(party.partitaIva, paese)],
      ]] : null,
      ["CodiceFiscale", vietato(profile, "codiceFiscale")
        ? null
        : fiscalCode(party.codiceFiscale, paese)],
      ["Anagrafica", _anagrafica(party)],
    ]],
    ["Sede", _sede(party.sede || {}, paese, profile)],
  ];
}

/** The header block that says who is sending, to whom, and in what format. */
function _trasmissione(doc, company, party, profile) {
  const chi = profile.trasmittente;
  return [
    ["IdTrasmittente", [
      ["IdPaese", chi ? chi.paese : (company.paese || profile.paese)],
      ["IdCodice", chi ? chi.codice : identificativo(company.partitaIva, company.paese || profile.paese)],
    ]],
    ["ProgressivoInvio", progressivo(doc.progressivo ?? 1)],
    ["FormatoTrasmissione", profile.schema],
    ["CodiceDestinatario", destinatario(party, profile)],
    party.pec && !vietato(profile, "pec") ? ["PECDestinatario", party.pec] : null,
  ];
}

function _datiGenerali(doc, computed, profile) {
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
      // **Il tipo che il canale accetta, non quello che l'app usa.** Una fattura differita da San
      // Marino è una `TD01` con i suoi `DatiDDT`: `TD24` non è fra i codici che l'HUB ammette, né
      // in esportazione né all'interno, e un documento così esce scartato. La corrispondenza sta
      // nel profilo perché è un fatto sul canale.
      ["TipoDocumento", tipoDocumento(doc, profile)],
      ["Divisa", doc.divisa || "EUR"],
      ["Data", doc.data],
      // **Il numero per esteso, sigla compresa.** Nel file andava il solo progressivo, e finché le
      // fatture erano l'unico documento che esce era la stessa cosa. Con la serie «NC» non lo è
      // più: la nota di credito e la fattura che storna uscivano tutte e due come «2026/0001»,
      // dallo stesso cedente e nello stesso anno. Il campo ammette venti caratteri alfanumerici,
      // e quello che ci va è il numero che sta anche sulla carta.
      ["Numero", shownNumber(doc)],
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
    ["EsigibilitaIVA", vietato(profile, "esigibilita") ? null : r.esigibilita],
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
 * Il profilo da usare, dedotto dalla **coppia**: chi emette e chi riceve.
 *
 * **Per due versioni ha guardato solo chi emette**, e sembrava giusto: il paese dell'azienda è già
 * in anagrafica e decide il canale, il trasmittente, le regole del CAP. Ma le direzioni sono sei e
 * i paesi di partenza due, quindi una tabella per paese di partenza non può distinguerle — e
 * `SM → SM` usciva con il profilo dell'esportazione: trasmittente l'Ufficio Tributario, codice
 * destinatario quello dello SdI, natura `N3.1` dove ci vuole `N4`. Tre elementi su cui HUB-SM
 * scarta, in un documento che sull'altro canale sarebbe stato perfetto.
 *
 * Niente viene chiesto due volte: i due paesi stanno già in anagrafica, uno per parte.
 */
export function profileFor(company, party) {
  const da = String((company || {}).paese || "IT").toUpperCase();
  const tavola = PROFILI[da] || PROFILI.IT;
  // **Un cliente senza paese è italiano**, come in ogni altro punto di questo file: `IdPaese` si
  // scrive `party.paese || "IT"` e la direzione deve leggere la stessa cosa, o il file e il profilo
  // parlerebbero di due clienti diversi. Chi fattura dentro San Marino ha comunque il paese in
  // anagrafica, perché senza non si scrive `IdCodice`.
  const a = String((party || {}).paese || "IT").toUpperCase();
  return tavola[a] || tavola.estero;
}

/**
 * Se un elemento è fra quelli che il canale non vuole valorizzati.
 *
 * Lo schema li ammette tutti; il canale interno sammarinese ne dichiara alcuni «non previsti», e la
 * regola generale del tracciato è che un campo che non si valorizza **non deve comparire**, nemmeno
 * vuoto.
 */
export function vietato(profile, campo) {
  return (profile && profile.campiVietati || []).includes(campo);
}

/**
 * L'identificativo fiscale come lo vuole il tracciato, con il codice sammarinese a cinque cifre.
 *
 * «Codice OESM: valore numerico a **5 cifre con eventuali 0 in testa**» — lo dicono con le stesse
 * parole il Documento B dell'interna e l'Allegato B dell'esportazione. Il codice finisce anche nel
 * *nome del file*, e un nome non conforme viene rifiutato prima di qualunque controllo sul
 * contenuto: un COE di quattro cifre usciva come `SM1234_7.xml`.
 */
export function identificativo(value, paese) {
  const codice = fiscalCode(value, paese);
  return String(paese || "").toUpperCase() === "SM" ? codice.padStart(5, "0") : codice;
}

/**
 * Il `TipoDocumento` da scrivere: quello dell'app, tradotto in quello che il canale accetta.
 *
 * La traduzione è una riga di tabella nel profilo, non una condizione qui: il giorno che l'Ufficio
 * Tributario ammettesse anche `TD24`, si cancella la riga.
 */
export function tipoDocumento(doc, profile = IT_SDI) {
  const tipo = (doc || {}).tipo || "TD01";
  return (profile.rimappa || {})[tipo] || tipo;
}

export function destinatario(party, profile = IT_SDI) {
  // **Un canale che non recapita non ha un destinatario da scegliere.** Nell'interna sammarinese il
  // file resta dentro HUB-SM: sette zeri, e il codice che il cliente ha in anagrafica — che è quello
  // che usa per ricevere le fatture italiane — non c'entra nulla e non deve prevalere.
  if (profile.destinatarioFisso) return profile.destinatarioFisso;
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
  return `${paese}${identificativo(company.partitaIva, paese)}_${progressivo(value)}.xml`;
}

/**
 * A document as FatturaPA text, plus the name the file should carry.
 *
 * Returns `{ name, text, totals }`: the totals come back because whoever writes the file also
 * shows the amounts, and recomputing them somewhere else is how two numbers on the same screen
 * start to disagree.
 */
export function build(doc, { company, party, profile = profileFor(company, party) } = {}) {
  // **Refused loudly, and here.** A quote has no `TipoDocumento` the SdI would accept, so a file
  // built from one would carry the word `preventivo` where a code belongs and be rejected on
  // receipt — after the app had marked the quote as exported and moved its transmission counter,
  // neither of which can be walked back. The screen hides the button; this is what makes it a rule.
  if (!kind(doc).fiscale) {
    throw new Error(`un documento «${doc.tipo}» non diventa un file FatturaPA`);
  }
  // **Una direzione che non ha un file.** Da San Marino verso un paese diverso dall'Italia la
  // fattura elettronica non esiste come adempimento: nessuna delle due norme la prevede. Le
  // schermate tolgono il pulsante; questo è quello che ne fa una regola.
  if (!profile.file) {
    throw new Error(`da ${profile.paese} verso l'estero non si emette un file elettronico`);
  }
  const computed = totals(doc, { tm: chiaveConTm(profile) });
  // **Nell'autofattura i due blocchi si scambiano.** Il documento lo scrive il cliente, e riguarda
  // un fornitore che non ha fatturato: il cedente/prestatore è quel fornitore, il cessionario è chi
  // sta scrivendo. Chi trasmette resta chi scrive, ed è per questo che `_trasmissione` continua a
  // ricevere `company`. La domanda la fa `kinds.js`, che è dove stanno i fatti sui tipi.
  const autofattura = kind(doc).autofattura;
  const cedente = autofattura ? party : company;
  const cessionario = autofattura ? company : party;
  const children = [
    ["FatturaElettronicaHeader", [
      ["DatiTrasmissione", _trasmissione(doc, company, party, profile)],
      ["CedentePrestatore", _cedente(cedente, profile)],
      ["CessionarioCommittente", _cessionario(cessionario, profile)],
      // «CC» sta per cessionario/committente: dice a chi riceve il file che il documento non è
      // stato emesso da chi ci figura come cedente. Senza, l'autofattura è indistinguibile da una
      // fattura che il fornitore non ha mai scritto.
      autofattura ? ["SoggettoEmittente", "CC"] : null,
    ]],
    ["FatturaElettronicaBody", [
      ["DatiGenerali", _datiGenerali(doc, computed, profile)],
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
