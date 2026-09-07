// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Every visible string of this app, in one file, two objects with the same keys. Text written
// inline in the markup or inside a function is how one language quietly falls behind the other.
//
// The machinery — choosing the language, looking a key up, plurals, numbers — lives in
// `gg/i18n.js`. What stays here is what belongs to this app and to nothing else: the words.
// Re-exporting the library keeps every caller importing `./i18n.js`, and keeps `check_apps.py`
// pointed at one file per app when it compares the two key lists.
//
// **The field names are part of the interface.** `validate.js` returns a field path — `cliente.
// sede.cap` — and the screen has to show it as a person would say it. Those labels are here, under
// `f_`, and they are the reason this dictionary is longer than the other apps'.

export * from "gg/i18n.js";

import { configure } from "gg/i18n.js";

const IT = {
  tagline: "Fatture elettroniche, sul tuo computer",

  // ---- navigazione
  navHome: "Situazione",
  navDocs: "Documenti",
  navParties: "Anagrafiche",
  navCompany: "Azienda",
  navSettings: "Impostazioni",

  // ---- casa
  homeTitle: "Situazione",
  homeEmpty: "Qui compaiono le scadenze e quello che hai emesso quest'anno.",
  homeSetup: "Prima di emettere serve l'anagrafica della tua azienda.",
  homeSetupGo: "Compila i dati dell'azienda",
  homeNew: "Nuova fattura",
  homeYear: "Fatturato dell'anno",
  homeDue: "In scadenza",
  homeOverdue: "Scadute",
  homeOverdueCount: "Scadute ({quante})",
  homeNextDue: "Prossime scadenze",
  homeRecent: "Ultimi documenti",
  homeSeeAll: "Vedi tutti",
  homeDueEmpty: "Niente da incassare.",
  homeBackupNever: "Non hai mai esportato un archivio. Con l'app senza server, quella è l'unica "
    + "copia che esiste.",
  homeBackupGo: "Esporta adesso",

  // ---- scadenzario
  navDue: "Scadenzario",
  dueTitle: "Scadenzario",
  dueEmpty: "Non c'è niente da incassare.",
  dueWhen: "Scadenza",
  dueDoc: "Documento",
  dueLeft: "Da incassare",
  dueTotal: "In tutto",
  dueOverdue: "scaduta",
  dueRecord: "Registra un incasso",
  dueRecordShort: "Incassa",
  dueBadAmount: "L'importo dev'essere un numero maggiore di zero.",
  dueOverpaid: "Incasso registrato. È {di_piu} più di quello che risultava da incassare: il "
    + "documento risulta saldato.",
  incassiTitle: "Incassi",
  incassiEmpty: "Gli incassi che registri compaiono qui.",
  incassiAmount: "Importo",
  incassiNote: "Nota",
  incassiTotal: "Incassato",
  incassiRemove: "Togli l'incasso",
  incassiRemoveAsk: "Tolgo questo incasso? Il documento torna da incassare per quell'importo.",
  dueState: "Cambia stato",
  dueAll: "Tutte",
  dueOnlyOverdue: "Solo scadute",
  dueChart: "Quanto scade, mese per mese. La parte accesa è già scaduta.",

  // ---- documenti
  docsTitle: "Documenti",
  docsEmpty: "Non c'è ancora nessun documento.",
  docsNew: "Nuova fattura",
  docsOtherType: "Un altro tipo",
  docsType: "Tipo",
  docsNumber: "Numero",
  docsDate: "Data",
  docsParty: "Cliente",
  docsTotal: "Totale",
  docsState: "Stato",

  // ---- stati
  stateBozza: "Bozza",
  stateEmesso: "Emesso",
  stateInviato: "Inviato",
  stateAccettato: "Accettato",
  stateRifiutato: "Rifiutato",
  stateConsegnato: "Consegnato",
  stateScartato: "Scartato",
  stateAnnullato: "Annullato",

  // ---- tipi di documento
  typePreventivo: "Preventivo",
  typeDdt: "Documento di trasporto",
  typeTD01: "Fattura",
  typeTD04: "Nota di credito",
  typeTD24: "Fattura differita",
  // Le stesse, corte, per la colonna «Tipo» dell'elenco: «Documento di trasporto» per esteso
  // spingeva il totale fuori dallo schermo, e DDT lo dice già il numero.
  shortPreventivo: "Preventivo",
  shortDdt: "DDT",
  shortTD01: "Fattura",
  shortTD04: "Nota di credito",
  shortTD24: "Fatt. differita",
  convertToTD01: "Crea la fattura",
  convertToTD24: "Crea la fattura differita",
  convertGroupAskOne: "Per questo cliente c'è un altro documento di trasporto da fatturare. Lo "
    + "metto in questa fattura?",
  convertGroupAskMany: "Per questo cliente ci sono altri {n} documenti di trasporto da fatturare. "
    + "Li metto tutti in questa fattura?",
  convertGroupAll: "Tutti insieme",
  convertGroupOne: "Solo questo",

  // ---- anagrafiche
  partiesTitle: "Anagrafiche",
  partiesClients: "Clienti",
  partiesItems: "Listino",
  partiesEmpty: "Qui compaiono i clienti che aggiungi.",
  partiesNew: "Nuovo cliente",
  partiesEdit: "Modifica cliente",
  partyDeleteAsk: "Elimino questo cliente? I documenti già emessi restano come sono.",
  itemsNew: "Nuova voce",
  itemsEdit: "Modifica voce",
  itemDeleteAsk: "Elimino questa voce dal listino?",
  partyNeedsName: "Serve almeno la ragione sociale.",
  partyWarnings: "Puoi salvare così, ma per fatturare a questo cliente servirà:",
  sedeEsteraNote: "Su un indirizzo estero il tracciato vuole CAP 00000 e nessuna provincia: l'app "
    + "li scrive così da sé. Quello che metti qui compare sul foglio stampato, dove il CAP vero e "
    + "il nome della regione servono a chi riceve.",

  itemsEmpty: "Qui compaiono le voci che usi spesso.",

  // ---- azienda
  companyTitle: "La tua azienda",
  companyNote: "Sono i dati che finiscono nell'intestazione di ogni documento. Si compilano una "
    + "volta sola.",
  companySaved: "Dati dell'azienda salvati.",
  progressivoNote: "Il numero che porterà il prossimo file, nel nome e dentro il documento. Serve "
    + "se arrivi da un altro programma: si scrive una volta e poi conta l'app. Si può spostare in "
    + "avanti quando vuoi, indietro no — un progressivo già uscito viene rifiutato come duplicato.",
  contiTitle: "Conti correnti",
  contiNote: "Il conto predefinito entra da sé nei documenti nuovi. L'IBAN resta modificabile sul "
    + "singolo documento, per gli incassi che vanno altrove.",
  contiEmpty: "I conti che aggiungi compaiono qui.",
  contiNew: "Aggiungi un conto",
  contiDefault: "Predefinito",
  contiRemove: "Togli il conto",

  // ---- impostazioni
  settingsTitle: "Impostazioni",
  settingsData: "I tuoi dati",
  settingsExport: "Esporta tutto",
  settingsImport: "Importa un archivio",
  settingsImportAsk: "L'importazione sostituisce quello che c'è adesso. Vado avanti?",
  settingsImportDone: "Archivio importato.",
  settingsImportBad: "Questo file non è un archivio di Invoice Scope.",
  settingsCsv: "Esporta un CSV per il commercialista",
  settingsSpace: "Spazio usato",

  backupTitle: "Copia automatica in una cartella",
  backupNote: "Scegli una cartella e l'app ci scrive da sola l'archivio a ogni modifica — lo "
    + "stesso file di «Esporta tutto». Se la cartella è dentro Dropbox o iCloud, la copia arriva "
    + "da sé sugli altri tuoi computer. Tiene anche una copia al giorno degli ultimi trenta "
    + "giorni. Da qui scrive un computer solo: sull'altro apri l'archivio con «Importa un "
    + "archivio».",
  backupPick: "Scegli la cartella…",
  backupResume: "Riprendi la cartella",
  backupUnlink: "Scollega la cartella",
  backupUnlinkAsk: "L'app smette di scrivere nella cartella. I file che ci sono restano dove "
    + "sono. Vado avanti?",
  backupUnavailable: "Questo browser non sa aprire una cartella: funziona con Chrome o Edge sul "
    + "computer. Qui resta «Esporta tutto».",
  backupNone: "Nessuna cartella collegata.",
  backupPrompt: "La cartella «{folder}» aspetta il tuo permesso: il browser lo chiede di nuovo a "
    + "ogni apertura.",
  backupLinked: "Cartella «{folder}» · ultima copia {when}.",
  backupNever: "Cartella «{folder}» · nessuna copia ancora.",
  backupError: "Non riesco a scrivere nella cartella «{folder}» ({error}). Controlla che esista "
    + "ancora, o scegline un'altra.",
  settingsFormat: "Tracciato",
  settingsFormatNote: "L'app scrive il formato FatturaPA nella versione qui sopra. Quando "
    + "l'Agenzia pubblica una versione nuova, l'app va aggiornata.",
  settingsLimits: "Quello che l'app non fa",
  settingsLimitsNote: "Non trasmette il file, non fa la conservazione a norma e non firma "
    + "digitalmente. Il file lo prepari qui e lo mandi tu.",

  // ---- il documento
  docNewTitle: "Nuovo documento",
  docParty: "Cliente",
  docPartyChoose: "Scegli un cliente",
  docPartyNone: "Aggiungi prima un cliente.",
  docLines: "Righe",
  docAddLine: "Aggiungi una riga",
  docAddFromList: "Dal listino",
  docAddLineHint: "Sull'ultima riga, Invio ne aggiunge un'altra.",
  docRemoveLine: "Togli la riga",
  docEmptyLines: "Il documento non ha ancora righe.",
  tmNote: "Il codice TM accompagna i servizi e lo chiede l'Ufficio Tributario sammarinese: finisce "
    + "sulla riga e in testa alla nota di esenzione. Senza, il portale non accetta il documento.",
  docSummary: "Riepilogo IVA",
  docImponibile: "Imponibile",
  docImposta: "Imposta",
  docTotale: "Totale",
  docBollo: "Addebita il bollo di 2,00 €",
  docBolloDue: "Sopra i 77,47 € senza IVA il bollo è dovuto. Se lo addebiti al cliente, spuntalo.",
  docIssue: "Emetti",
  docIssueAsk: "Una volta emessa, la fattura non si modifica più: si storna con una nota di "
    + "credito. Emetto?",
  docIssued: "Emesso con il numero",
  docDeleteAsk: "Cancello questa bozza?",
  docCreditNote: "Storna con una nota di credito",
  docReopen: "Riporta in bozza",
  docReopenAsk: "Il documento torna modificabile e libera il suo numero. Vado avanti?",
  docLinked: "Storna il documento",
  docFromQuote: "Dal preventivo",
  docFromDdt: "Dai documenti di trasporto",
  docAlreadyInvoiced: "Già fatturato con",
  docSaveFirst: "Salvato.",
  docXml: "Scarica l'XML",
  docNotIssued: "Prima emetti il documento: una bozza non ha un numero, e un file senza "
    + "numero viene scartato.",
  docNoXml: "Il preventivo e il documento di trasporto restano qui: si stampano, e quando il "
    + "cliente conferma diventano una fattura. È la fattura che produce il file.",
  docIssueAskPreventivo: "Una volta emesso, il preventivo prende un numero e non si modifica più. "
    + "Se il cliente chiede una variante, ne fai un altro. Emetto?",
  docIssueAskTD04: "Una volta emessa, la nota di credito prende un numero e non si modifica più. Emetto?",
  docIssueAskDdt: "Una volta emesso, il documento di trasporto prende un numero e non si modifica "
    + "più. Emetto?",
  printFrom: "Mittente",
  printTo: "Destinatario",
  printPiva: "P. IVA",
  printCoe: "COE",
  printNumber: "Numero",
  printDate: "Data",
  printDraft: "Bozza",
  printLinked: "Storna",
  printDiscount: "Sconto",
  printAmount: "Importo",
  printGrossLines: "Totale righe",
  printDocDiscount: "Sconto",
  printStamp: "Bollo",
  printGross: "Totale documento",
  printToPay: "Totale da pagare",
  printFooter: "Copia di cortesia. L'originale fiscale è il file XML trasmesso al Sistema di "
    + "Interscambio. Prodotta con Invoice Scope.",
  printFooterSm: "Copia di cortesia. L'originale fiscale è il file XML trasmesso all'Ufficio Tributario "
    + "della Repubblica di San Marino. Prodotta con Invoice Scope.",
  printFooterBozza: "Bozza: non è un documento emesso e non ha un numero. Serve a rileggere prima di emettere.",
  printFooterPreventivo: "Preventivo. I prezzi valgono fino alla data indicata. Non è un documento "
    + "fiscale. Prodotto con Invoice Scope.",
  printFooterDdt: "Documento di trasporto: accompagna la merce. Non è un documento fiscale, la "
    + "fattura segue. Prodotto con Invoice Scope.",
  docPrint: "Stampa o PDF",
  docXmlDone: "File scaricato. Ora caricalo su «Fatture e Corrispettivi» o passalo al tuo "
    + "intermediario: l'app non lo trasmette.",
  docXmlAgain: "Di questo documento hai già scaricato un file. Ne scarico un altro, con un "
    + "progressivo nuovo?",

  // ---- pagamento, ritenuta, sconto
  payTitle: "Pagamento",
  payCondizioni: "Condizioni",
  payTP01: "A rate",
  payTP02: "In un'unica soluzione",
  payConto: "Conto",
  payContoChoose: "Scegli un conto",
  payModalita: "Modalità",
  payMP01: "Contanti",
  payMP05: "Bonifico",
  payMP08: "Carta",
  payMP12: "RIBA",
  payMP19: "Addebito SEPA",
  payDue: "Scadenze",
  payAddDue: "Aggiungi una scadenza",
  payRemoveDue: "Togli la scadenza",
  payNoDue: "Senza scadenze il pagamento si intende a vista.",
  trasportoTitle: "Trasporto",
  trasportoNote: "Sono i dati che accompagnano la merce, e chi la riceve li controlla alla "
    + "consegna. Il porto è franco se il trasporto lo paghi tu, assegnato se lo paga chi riceve.",
  portoFranco: "Franco",
  portoAssegnato: "Assegnato",
  ritTitle: "Ritenuta d'acconto",
  ritApply: "Applica la ritenuta",
  ritRT01: "Persona fisica",
  ritRT02: "Società",
  ritCausale: "Causale",
  ritNote: "Si calcola sull'imponibile e scende dal totale da pagare. Non tocca l'IVA.",
  discTitle: "Sconto sul documento",
  discPercent: "Sconto in percentuale",
  discNote: "Si applica prima dell'IVA, spartito fra i riepiloghi in proporzione.",

  // ---- il listino
  itemName: "Descrizione",
  itemPrice: "Prezzo",
  itemUnit: "Unità",
  itemVat: "Aliquota",

  // ---- comandi comuni
  save: "Salva",
  cancel: "Lascia stare",
  ok: "Va bene",
  del: "Elimina",
  close: "Chiudi",
  install: "Installa",
  backToPage: "Torna alla scheda",
  sourceLabel: "Codice sorgente",
  versionLabel: "v{version}",
  versionNext: "v{current} → {next}",
  versionNextUnknown: "v{current} → nuova",
  versionUpdate: "Aggiorna alla versione {next}",
  versionUpdateUnknown: "Aggiorna alla versione nuova",
  installIos: "Per installarla: tocca Condividi, poi «Aggiungi alla schermata Home».",

  // ---- i campi, come li chiama chi compila
  f_azienda: "la tua azienda",
  f_cliente: "il cliente",
  f_denominazione: "ragione sociale",
  f_partitaIva: "partita IVA",
  f_codiceFiscale: "codice fiscale",
  f_codiceDestinatario: "codice destinatario",
  f_regimeFiscale: "regime fiscale",
  f_progressivoInvio: "prossimo progressivo di invio",
  f_formatoNumero: "numerazione dei documenti",
  num_anno: "Progressivo con anno",
  num_progressivo: "Progressivo con gli zeri",
  num_semplice: "Progressivo semplice",
  vTmFuoriFix: "L'app scrive {elenco}. Se ne serve un altro, l'elenco va aggiornato.",
  f_sede: "sede",
  f_indirizzo: "indirizzo",
  f_numeroCivico: "numero civico",
  f_cap: "CAP",
  f_comune: "comune",
  f_provincia: "provincia",
  f_tipo: "tipo di documento",
  f_data: "data",
  f_numero: "numero",
  f_causale: "causale",
  f_righe: "righe",
  f_riepiloghi: "riepilogo",
  f_riferimentoNormativo: "riferimento normativo",
  f_tm: "codice TM",
  f_descrizione: "descrizione",
  f_quantita: "quantità",
  f_unitaMisura: "unità di misura",
  f_prezzoUnitario: "prezzo unitario",
  f_aliquota: "aliquota IVA",
  f_natura: "natura",
  f_pagamento: "pagamento",
  f_condizioni: "condizioni",
  f_modalita: "modalità",
  f_iban: "IBAN",
  f_etichetta: "nome del conto",
  f_scadenza: "scadenza",
  f_rate: "rate",
  f_sconto: "sconto",
  f_trasporto: "trasporto",
  f_validoFino: "valido fino al",
  f_causaleTrasporto: "causale del trasporto",
  f_aspetto: "aspetto dei beni",
  f_colli: "colli",
  f_porto: "porto",
  f_vettore: "vettore",
  f_fattureCollegate: "fattura collegata",
  f_paese: "paese",
  f_pec: "PEC",
  paeseIT: "Italia",
  paeseSM: "San Marino",
  regimeRF01: "Ordinario",
  regimeRF19: "Forfettario",
  f_ritenuta: "ritenuta",
  f_totale: "totale",

  // ---- i controlli: che cosa dice la regola, e che cosa fare
  // Le chiavi arrivano da `validate.js`, che restituisce chiavi e non frasi. I `{segnaposto}` li
  // riempie `tf` con i valori che il controllo ha misurato: così il numero può stare in mezzo alla
  // frase italiana e in fondo a quella inglese, e nessuna delle due deve saperlo.
  vRequired: "è un campo obbligatorio",
  vTooLong: "supera i {max} caratteri ammessi",
  vTooLongFix: "Accorcia il testo: adesso è di {lunghezza} caratteri.",
  vPartyMissing: "manca del tutto",
  vPartyMissingFix: "Scegli un cliente, o compila i dati dell'azienda.",
  vNameFix: "Scrivi la ragione sociale, oppure nome e cognome se è una persona fisica.",
  vNeedsFiscalId: "serve la partita IVA o il codice fiscale",
  vFiscalIdFix: "Un cliente privato può avere il solo codice fiscale; un'azienda ha la partita IVA.",
  vVatCheckDigit: "non supera il controllo di validità",
  vVatCheckDigitFix: "Undici cifre, e la cifra di controllo deve tornare: ricontrolla le cifre "
    + "trasposte.",
  vTaxCodeShape: "non ha la forma di un codice fiscale",
  vTaxCodeShapeFix: "Sedici caratteri per una persona fisica, undici cifre per una società.",
  vStreetFix: "Scrivi la via.",
  vTownFix: "Scrivi il comune.",
  vCapFive: "deve essere di cinque cifre",
  vCapFix: "Per un indirizzo estero l'app scrive 00000 da sé: qui serve il CAP italiano.",
  vProvinceTwo: "deve essere la sigla di due lettere",
  vProvinceFix: "Per esempio RN. Su un indirizzo estero la provincia non si scrive.",
  vProvinceFixSm: "Per San Marino si scrive SM.",
  vNoLines: "il documento non ha righe",
  vNoLinesFix: "Aggiungi almeno una riga: un documento senza righe non ha un imponibile.",
  vDescriptionFix: "Descrivi che cosa hai venduto: è il campo che il cliente legge per primo.",
  vUnitFix: "Usa un'abbreviazione: ora, kg, pz.",
  vRateFix: "Scrivi l'aliquota. Se l'operazione non ha IVA, scrivi 0 e scegli una natura.",
  vNaturaWhenZero: "è obbligatoria quando l'aliquota è zero",
  vNaturaWhenZeroFix: "Scegli perché l'operazione non ha IVA: esente, non imponibile, esclusa.",
  vNaturaWithRate: "non va indicata quando c'è un'aliquota",
  vNaturaWithRateFix: "Togli la natura, oppure porta l'aliquota a zero se l'operazione non ha IVA.",
  vPriceFix: "Scrivi il prezzo. Una voce gratuita si scrive con prezzo zero, non lasciandolo vuoto.",
  vDiscountBoth: "ha sia un importo sia una percentuale",
  vDiscountBothFix: "Tienine uno solo: con tutti e due, vale l'importo e la percentuale viene "
    + "ignorata.",
  vOutsideSubset: "«{valore}» è fuori dal sottoinsieme che l'app emette",
  vNaturaOutsideFix: "Le nature del tracciato sono {elenco}.",
  vTypeUnknown: "«{valore}» non è un tipo che l'app conosce",
  vTypeUnknownFix: "L'app emette {elenco}, e tiene preventivi e documenti di trasporto, che "
    + "restano sul tuo computer.",
  vDateShape: "deve essere nella forma AAAA-MM-GG",
  vDateFix: "Per esempio {esempio}.",
  vNumberOnIssueFix: "Il numero si assegna quando emetti: una bozza non ne ha uno.",
  vNumberTooLongFix: "Accorcia la numerazione: la serie può stare in una sigla.",
  vCausaleTooLongFix: "Accorcia, o sposta il testo nella descrizione di una riga.",
  vRegimeFix: "L'app scrive {elenco}: ordinario e forfettario.",
  vDestinatarioSeven: "deve essere di sette caratteri",
  vDestinatarioFix: "Sette lettere o cifre. Senza codice l'app scrive 0000000 e la fattura arriva "
    + "nel cassetto fiscale del cliente.",
  vCreditNoteLink: "una nota di credito deve dire che cosa storna",
  vCreditNoteLinkFix: "Indica numero e data della fattura che stai stornando.",
  vQuoteValidity: "il preventivo deve dire fino a quando vale",
  vQuoteValidityFix: "Scrivi una data: un prezzo senza scadenza resta valido finché il cliente lo "
    + "trova.",
  vValidityBefore: "è prima della data del documento",
  vValidityBeforeFix: "La validità viene dopo: sposta la data, o allunga la validità.",
  vTransportReasonFix: "Per esempio vendita, conto visione, reso, lavorazione.",
  vRitenutaFix: "L'app scrive RT01 per le persone fisiche e RT02 per le società.",
  vCondizioniFix: "TP01 a rate, TP02 in un'unica soluzione.",
  vModalitaFix: "L'app scrive {elenco}.",
  vIbanShape: "non ha la forma di un IBAN",
  vIbanFix: "Due lettere del paese, due cifre di controllo, poi il resto del codice.",
  vInstalmentsSum: "non sommano al totale del documento",
  vInstalmentsSumFix: "Le rate fanno {somma}, il documento {atteso}. Lascia vuoto un importo e "
    + "l'app calcola il resto.",
  vTotalMismatch: "non corrisponde alla somma dei riepiloghi",
  vTotalMismatchFix: "Atteso {atteso}.",
  vTmFix: "Il codice dell'Ufficio Tributario è corto: di solito una cifra.",
  vTmMisto: "le righe con la stessa aliquota e la stessa natura portano codici TM diversi",
  vTmMistoFix: "Il riepilogo ne può indicare uno solo. Usa lo stesso codice, o separa le righe in "
    + "due documenti.",
  vRifNormFix: "Accorcia il riferimento normativo: con il codice TM davanti supera la misura "
    + "ammessa.",

  // ---- il dimostrativo
  demoNote: "Dimostrativo: i dati sono inventati e restano in memoria. Chiudendo la scheda "
    + "spariscono, e le tue fatture non li vedono.",
  demoItemProgettazione: "Progettazione meccanica",
  demoItemOfficina: "Ora di officina",
  demoItemTelaio: "Telaio saldato",
  demoItemCollaudo: "Collaudo in sede",
  demoUnitHour: "ora",
  demoUnitPiece: "pz",
  demoQuoteCausale: "Revisione della linea di montaggio, secondo lotto",
  demoTransportReason: "Vendita",
  demoTransportLook: "Pallet",
  demoPaymentNote: "Acconto, saldo a fine mese",

  // ---- importazione da un altro programma
  //
  // Le chiavi `fic*` e `read*` sono prodotte dal profilo e dal lettore, che non conoscono la lingua:
  // restituiscono una chiave e i valori misurati, e la frase si compone qui. È la stessa regola del
  // validatore, e per la stessa ragione — un messaggio scritto dentro la logica esiste in una lingua
  // sola, e questo è un progetto in cui una correzione a una lingua sola è già finita online.
  impTitle: "Da un altro programma",
  impNote: "Porti dentro clienti, listino e documenti da Fatture in Cloud, e le fatture in XML da "
    + "qualsiasi gestionale. Scegli i file così come li scarichi — .xlsx, .xls, XML, anche tutti "
    + "insieme, anche lo ZIP del backup: prima di scrivere vedi cosa è stato letto, e niente entra "
    + "finché non confermi.",
  impPick: "Scegli i file…",
  impReading: "Sto leggendo…",
  impEmpty: "Fra i file scelti non c'è un'esportazione che sappia leggere.",
  impFile: "File",
  impWhat: "Contenuto",
  impNew: "Nuovi",
  impExisting: "Già presenti, non toccati",
  impGo: "Importa",
  impDone: "Importati: {clienti} clienti, {listino} voci di listino, {documenti} documenti, "
    + "{incassi} incassi.",
  impNothing: "Non c'è niente di nuovo da importare: tutto quello che ho letto è già qui.",
  impFailed: "L'importazione non è riuscita, e non è stato scritto niente.",

  impKindClienti: "Anagrafica clienti",
  impKindListino: "Listino",
  impKindRegistro: "Registro dei documenti",
  impKindFattura: "Fattura elettronica",
  impKindVecchio: "Foglio Excel del 1995",
  impKindIgnoto: "Non lo riconosco",

  impOld: "Aprilo e salvalo come .xlsx: è un formato di Excel 95 o precedente, che non si legge "
    + "nel browser.",
  impSkipped: "Colonne lette e lasciate fuori: {elenco}.",
  impRegisterLineOf: "{tipo} n. {numero} del {data} — importata dal registro, senza il dettaglio "
    + "delle righe",
  impRegisterRebuilt: "Il registro porta i totali e non le righe: ogni documento entra con una riga "
    + "sola, che tiene il totale e dice di essere una ricostruzione. Per avere le righe vere — "
    + "anche per ristampare — importa gli XML del backup di Fatture in Cloud: prendono il posto "
    + "di queste ricostruzioni, incassi compresi.",
  impUnreadable: "Il file non si legge: è danneggiato, o è un formato che sembra un altro.",
  impPaidNote: "Saldata secondo il registro di Fatture in Cloud",
  impNamesNew: "Nuovi",
  impNamesExisting: "Già presenti",
  impNamesCompleted: "Completati dall'XML, al posto della ricostruzione",
  impUndo: "Annulla l'ultima importazione",
  impUndoWhen: "Ultima importazione: {quando} — {clienti} clienti, {listino} voci di listino, "
    + "{documenti} documenti, {incassi} incassi.",
  impUndoAsk: "Tolgo tutto quello che è entrato con l'ultima importazione. I clienti a cui nel "
    + "frattempo hai fatto un documento restano.",
  impUndoDone: "Tolti: {clienti} clienti, {listino} voci di listino, {documenti} documenti, "
    + "{incassi} incassi.",
  impFrom: "Importato da {fonte} il {quando}.",
  emptyImport: "Se arrivi da un altro programma, puoi importare quello che hai.",
  impTotalDiffers: "documento {numero}: il file dichiara {dichiarato}, le righe fanno {calcolato}",
  impBrokenXml: "L'XML è rotto: non si apre.",
  impreadNotFattura: "È un XML, ma non una fattura elettronica.",
  impreadNoBody: "La fattura non ha nessun corpo.",

  ficNoName: "riga {riga}: senza denominazione, non entra",
  ficCountry: "riga {riga}: «{valore}» non è un paese che sappia nominare, entra come Italia",
  ficNoDate: "riga {riga}: «{valore}» non è una data",
  ficKind: "riga {riga}: «{valore}» non è un tipo di documento che gestisco",

  readKind: "tipo {valore}: non lo gestisco, entra come fattura",
  readNoLines: "nessuna riga di dettaglio",
  readOrder: "dati dell'ordine di acquisto ({valore}): non li leggo",
  readContract: "dati del contratto ({valore}): non li leggo",
  readConvention: "dati della convenzione ({valore}): non li leggo",
  readReceipt: "dati della ricezione ({valore}): non li leggo",
  readSal: "dati SAL ({valore}): non li leggo",
  readVehicles: "dati dei veicoli ({valore}): non li leggo",
  readAttachment: "allegati ({valore}): non li leggo",

  // ---- le nature IVA, con una parola accanto alla sigla
  //
  // Nel menù compare «N3.1 — Non imponibile, esportazione»: la sigla da sola presume che chi
  // fattura conosca il tracciato a memoria, e chi lo conosce a memoria non usa un'app come questa.
  naturaN1: "Esclusa (art. 15)",
  "naturaN2.1": "Non soggetta, fuori campo (artt. 7-7-septies)",
  "naturaN2.2": "Non soggetta, altri casi",
  "naturaN3.1": "Non imponibile, esportazione",
  "naturaN3.2": "Non imponibile, cessione intra UE",
  "naturaN3.3": "Non imponibile, cessione verso San Marino",
  "naturaN3.4": "Non imponibile, assimilata all'esportazione",
  "naturaN3.5": "Non imponibile, dichiarazione d'intento",
  "naturaN3.6": "Non imponibile, altre senza plafond",
  naturaN4: "Esente (art. 10)",
  naturaN5: "Regime del margine",
  "naturaN6.1": "Inversione contabile, rottami",
  "naturaN6.2": "Inversione contabile, oro e argento",
  "naturaN6.3": "Inversione contabile, subappalto edile",
  "naturaN6.4": "Inversione contabile, fabbricati",
  "naturaN6.5": "Inversione contabile, telefoni cellulari",
  "naturaN6.6": "Inversione contabile, prodotti elettronici",
  "naturaN6.7": "Inversione contabile, comparto edile",
  "naturaN6.8": "Inversione contabile, settore energetico",
  "naturaN6.9": "Inversione contabile, altri casi",
  naturaN7: "IVA assolta in altro Stato UE",

  // ---- valori predefiniti dell'azienda per le righe a IVA zero
  companyWho: "Chi sei",
  companyLetterhead: "Carta intestata",
  companyLetterheadNote: "Quello che sta in testa a ogni documento stampato. Finché non ne scegli "
    + "uno, il logo è quello di G&G Technologies: il tuo entra come immagine — PNG, JPG o SVG — e "
    + "viene ridotto se è grande. Email, telefono e sito stanno sotto l'indirizzo.",
  companyLogoPick: "Scegli il logo…",
  companyLogoRemove: "Togli il logo",
  companyLogoBad: "Non riesco a leggere questa immagine. Prova un PNG, un JPG o un SVG.",
  companyLogoBig: "L'immagine è troppo grande anche dopo la riduzione. Prova con un file più piccolo.",
  f_email: "email",
  f_telefono: "telefono",
  f_sito: "sito web",
  companyWhere: "Dove sei",
  companyNumbering: "Come numeri",
  companyDefaultsTitle: "Le righe nuove",
  companyDefaultsNote: "Quello che l'app scrive da sé su ogni riga nuova: l'aliquota, e se è zero "
    + "la natura e il codice TM. Per chi fattura senza IVA è quasi ogni riga: scritto qui una "
    + "volta, non si ridigita.",
  f_aliquotaPredefinita: "aliquota predefinita",
  f_naturaPredefinita: "natura predefinita per aliquota zero",
  f_tmPredefinito: "codice TM predefinito",
  f_coe: "codice operatore economico (COE)",
  companyProvinciaSm: "SM",

  // ---- l'elenco dei documenti
  docsSearch: "Cerca",
  docsSearchHint: "numero, cliente, causale",
  docsYear: "Anno",
  docsAllYears: "Tutti gli anni",
  docsState: "Stato",
  docsAllStates: "Tutti gli stati",
  docsNoMatch: "Nessun documento corrisponde ai filtri.",
  docsInvoiced: "fatturato",

  // ---- il documento chiuso
  partyDeliveryNote: "Codice destinatario o PEC: è dove arriva la fattura elettronica, e ne basta uno. Per un privato senza partita IVA lascia vuoto.",
  paeseAltro: "Altro paese…",
  f_paeseSigla: "sigla del paese",
  hQuantita: "q.tà",
  hUnita: "u.m.",
  hPrezzo: "prezzo",
  hIva: "IVA",
  hTm: "TM",
  docBolloCharged: "Bollo di 2,00 € addebitato al cliente.",
  docNoDiscount: "Nessuno sconto sul documento.",
  docNoWithholding: "Nessuna ritenuta.",
  docXmlDoneSm: "File scaricato. Ora caricalo sul portale dell'Ufficio Tributario: l'app non lo "
    + "trasmette.",

  // ---- messaggi
  errIntro: "Il documento non è ancora completo:",
  loadFailed: "Non riesco ad aprire il deposito dei dati. Se sei in navigazione privata, il "
    + "browser lo impedisce.",
};

const EN = {
  tagline: "Electronic invoices, on your own computer",

  navHome: "Home",
  navDocs: "Documents",
  navParties: "Contacts",
  navCompany: "Company",
  navSettings: "Settings",

  homeTitle: "Home",
  homeEmpty: "Due dates and what you have issued this year show up here.",
  homeSetup: "Before issuing anything, your company details are needed.",
  homeSetupGo: "Fill in the company details",
  homeNew: "New invoice",
  homeYear: "Invoiced this year",
  homeDue: "Falling due",
  homeOverdue: "Overdue",
  homeOverdueCount: "Overdue ({quante})",
  homeNextDue: "Next due",
  homeRecent: "Latest documents",
  homeSeeAll: "See all",
  homeDueEmpty: "Nothing to collect.",
  homeBackupNever: "You have never exported an archive. With the app running without a server, "
    + "that is the only copy there is.",
  homeBackupGo: "Export now",

  navDue: "Payments",
  dueTitle: "Payments due",
  dueEmpty: "There is nothing to collect.",
  dueWhen: "Due",
  dueDoc: "Document",
  dueLeft: "Outstanding",
  dueTotal: "In total",
  dueOverdue: "overdue",
  dueRecord: "Record a payment",
  dueRecordShort: "Collect",
  dueBadAmount: "The amount has to be a number greater than zero.",
  dueOverpaid: "Payment recorded. It is {di_piu} more than was outstanding: the document is now "
    + "settled.",
  incassiTitle: "Payments received",
  incassiEmpty: "The payments you record show up here.",
  incassiAmount: "Amount",
  incassiNote: "Note",
  incassiTotal: "Received",
  incassiRemove: "Remove the payment",
  incassiRemoveAsk: "Remove this payment? The document goes back to being owed that amount.",
  dueState: "Change state",
  dueAll: "All",
  dueOnlyOverdue: "Overdue only",
  dueChart: "What falls due, month by month. The lit part is already overdue.",

  docsTitle: "Documents",
  docsEmpty: "There are no documents yet.",
  docsNew: "New invoice",
  docsOtherType: "Another type",
  docsType: "Type",
  docsNumber: "Number",
  docsDate: "Date",
  docsParty: "Customer",
  docsTotal: "Total",
  docsState: "State",

  stateBozza: "Draft",
  stateEmesso: "Issued",
  stateInviato: "Sent",
  stateAccettato: "Accepted",
  // "Declined" and not "rejected": `scartato` is the exchange system refusing a file, and the two
  // things happen for entirely different reasons.
  stateRifiutato: "Declined",
  stateConsegnato: "Delivered",
  stateScartato: "Rejected",
  stateAnnullato: "Cancelled",

  typePreventivo: "Quote",
  typeDdt: "Delivery note",
  typeTD01: "Invoice",
  typeTD04: "Credit note",
  typeTD24: "Deferred invoice",
  shortPreventivo: "Quote",
  shortDdt: "DDT",
  shortTD01: "Invoice",
  shortTD04: "Credit note",
  shortTD24: "Deferred inv.",
  convertToTD01: "Create the invoice",
  convertToTD24: "Create the deferred invoice",
  convertGroupAskOne: "There is one more delivery note to invoice for this customer. Shall I put "
    + "it on this invoice?",
  convertGroupAskMany: "There are {n} more delivery notes to invoice for this customer. Shall I "
    + "put them all on this invoice?",
  convertGroupAll: "All together",
  convertGroupOne: "Only this one",

  partiesTitle: "Contacts",
  partiesClients: "Customers",
  partiesItems: "Price list",
  partiesEmpty: "The customers you add show up here.",
  partiesNew: "New customer",
  partiesEdit: "Edit customer",
  partyDeleteAsk: "Delete this customer? Documents already issued stay as they are.",
  itemsNew: "New line",
  itemsEdit: "Edit line",
  itemDeleteAsk: "Delete this line from the price list?",
  partyNeedsName: "A company name is the least it needs.",
  partyWarnings: "You can save it like this, but invoicing this customer will need:",
  sedeEsteraNote: "For a foreign address the format wants postcode 00000 and no province: the app "
    + "writes them that way itself. What you put here goes on the printed sheet, where the real "
    + "postcode and the region's name are of use to whoever receives it.",

  itemsEmpty: "The lines you use often show up here.",

  companyTitle: "Your company",
  companyNote: "These are the details that head every document. You fill them in once.",
  companySaved: "Company details saved.",
  progressivoNote: "The number the next file will carry, in its name and inside the document. It "
    + "matters when you come from another program: you write it once and the app counts from there. "
    + "It can move forward at any time, never back — a progressive already sent is refused as a "
    + "duplicate.",
  contiTitle: "Bank accounts",
  contiNote: "The default account goes into new documents on its own. The IBAN stays editable on "
    + "each document, for the payments that go elsewhere.",
  contiEmpty: "The accounts you add show up here.",
  contiNew: "Add an account",
  contiDefault: "Default",
  contiRemove: "Remove the account",

  settingsTitle: "Settings",
  settingsData: "Your data",
  settingsExport: "Export everything",
  settingsImport: "Import an archive",
  settingsImportAsk: "Importing replaces what is here now. Shall I go ahead?",
  settingsImportDone: "Archive imported.",
  settingsImportBad: "This file is not an Invoice Scope archive.",
  settingsCsv: "Export a CSV for the accountant",
  settingsSpace: "Space used",

  backupTitle: "Automatic copy in a folder",
  backupNote: "Choose a folder and the app writes the archive there by itself at every change — "
    + "the same file as «Export everything». If the folder sits inside Dropbox or iCloud, the "
    + "copy reaches your other computers on its own. It also keeps one copy a day for the last "
    + "thirty days. Only one computer writes here: on the other, open the archive with «Import "
    + "an archive».",
  backupPick: "Choose the folder…",
  backupResume: "Resume the folder",
  backupUnlink: "Unlink the folder",
  backupUnlinkAsk: "The app stops writing into the folder. The files already there stay where "
    + "they are. Go on?",
  backupUnavailable: "This browser cannot open a folder: it works with Chrome or Edge on a "
    + "computer. Here, «Export everything» remains.",
  backupNone: "No folder linked.",
  backupPrompt: "The folder «{folder}» is waiting for your permission: the browser asks for it "
    + "again at every opening.",
  backupLinked: "Folder «{folder}» · last copy {when}.",
  backupNever: "Folder «{folder}» · no copy yet.",
  backupError: "Cannot write into the folder «{folder}» ({error}). Check that it still exists, "
    + "or choose another one.",
  settingsFormat: "Format",
  settingsFormatNote: "The app writes the FatturaPA format in the version above. When the revenue "
    + "publishes a new one, the app has to be updated.",
  settingsLimits: "What the app does not do",
  settingsLimitsNote: "It does not transmit the file, it does not keep the legal archive and it "
    + "does not sign digitally. You prepare the file here and send it yourself.",

  docNewTitle: "New document",
  docParty: "Customer",
  docPartyChoose: "Choose a customer",
  docPartyNone: "Add a customer first.",
  docLines: "Lines",
  docAddLine: "Add a line",
  docAddFromList: "From the price list",
  docAddLineHint: "On the last line, Enter adds another one.",
  docRemoveLine: "Remove the line",
  docEmptyLines: "The document has no lines yet.",
  tmNote: "The TM code goes with services and the San Marino tax office asks for it: it lands on "
    + "the line and in front of the exemption note. Without it the portal refuses the document.",
  docSummary: "VAT summary",
  docImponibile: "Taxable",
  docImposta: "VAT",
  docTotale: "Total",
  docBollo: "Charge the 2.00 € stamp duty",
  docBolloDue: "Above 77.47 € without VAT the stamp duty is due. Tick it to charge it to the "
    + "customer.",
  docIssue: "Issue",
  docIssueAsk: "Once issued, an invoice cannot be changed: it is reversed with a credit note. "
    + "Shall I issue it?",
  docIssued: "Issued with number",
  docDeleteAsk: "Shall I delete this draft?",
  docCreditNote: "Reverse with a credit note",
  docReopen: "Take back to draft",
  docReopenAsk: "The document becomes editable again and gives up its number. Shall I go ahead?",
  docLinked: "Reverses document",
  docFromQuote: "From quote",
  docFromDdt: "From delivery notes",
  docAlreadyInvoiced: "Already invoiced on",
  docSaveFirst: "Saved.",
  docXml: "Download the XML",
  docNotIssued: "Issue the document first: a draft has no number, and a file without one is "
    + "rejected.",
  docNoXml: "A quote and a delivery note stay here: you print them, and when the customer confirms "
    + "they become an invoice. The invoice is what produces the file.",
  docIssueAskPreventivo: "Once issued, a quote takes a number and cannot be changed. If the "
    + "customer asks for a variant, you write another one. Shall I issue it?",
  docIssueAskTD04: "Once issued, the credit note takes a number and cannot be changed. Issue it?",
  docIssueAskDdt: "Once issued, a delivery note takes a number and cannot be changed. Shall I "
    + "issue it?",
  printFrom: "From",
  printTo: "To",
  printPiva: "VAT no.",
  printCoe: "COE",
  printNumber: "Number",
  printDate: "Date",
  printDraft: "Draft",
  printLinked: "Reverses",
  printDiscount: "Discount",
  printAmount: "Amount",
  printGrossLines: "Lines total",
  printDocDiscount: "Discount",
  printStamp: "Stamp duty",
  printGross: "Document total",
  printToPay: "Total due",
  printFooter: "Courtesy copy. The fiscal original is the XML file sent to the Italian exchange "
    + "system. Produced with Invoice Scope.",
  printFooterSm: "Courtesy copy. The fiscal original is the XML file sent to the Ufficio Tributario of the "
    + "Republic of San Marino. Produced with Invoice Scope.",
  printFooterBozza: "Draft: not an issued document, and it has no number. For reading over before issuing.",
  printFooterPreventivo: "Quote. The prices hold until the date shown. This is not a fiscal "
    + "document. Produced with Invoice Scope.",
  printFooterDdt: "Delivery note: it travels with the goods. This is not a fiscal document, the "
    + "invoice follows. Produced with Invoice Scope.",
  docPrint: "Print or PDF",
  docXmlDone: "File downloaded. Now upload it to the revenue's portal or pass it to your "
    + "intermediary: the app does not transmit it.",
  docXmlAgain: "You have already downloaded a file for this document. Shall I make another one, "
    + "with a new progressive?",

  payTitle: "Payment",
  payCondizioni: "Terms",
  payTP01: "By instalments",
  payTP02: "In full",
  payConto: "Account",
  payContoChoose: "Choose an account",
  payModalita: "Method",
  payMP01: "Cash",
  payMP05: "Bank transfer",
  payMP08: "Card",
  payMP12: "RIBA",
  payMP19: "SEPA direct debit",
  payDue: "Due dates",
  payAddDue: "Add a due date",
  payRemoveDue: "Remove the due date",
  payNoDue: "With no due date, payment is on receipt.",
  trasportoTitle: "Transport",
  trasportoNote: "These are the details that travel with the goods, and whoever receives them "
    + "checks them on delivery. Carriage is paid when you pay the transport, forward when the "
    + "recipient does.",
  portoFranco: "Carriage paid",
  portoAssegnato: "Carriage forward",
  ritTitle: "Withholding tax",
  ritApply: "Apply the withholding",
  ritRT01: "Individual",
  ritRT02: "Company",
  ritCausale: "Reason code",
  ritNote: "It is worked out on the taxable amount and comes off the total to pay. It does not "
    + "touch the VAT.",
  discTitle: "Discount on the document",
  discPercent: "Percentage discount",
  discNote: "Applied before VAT, shared between the summaries in proportion.",

  itemName: "Description",
  itemPrice: "Price",
  itemUnit: "Unit",
  itemVat: "Rate",

  save: "Save",
  cancel: "Never mind",
  ok: "All right",
  del: "Delete",
  close: "Close",
  install: "Install",
  backToPage: "Back to the app page",
  sourceLabel: "Source code",
  versionLabel: "v{version}",
  versionNext: "v{current} → {next}",
  versionNextUnknown: "v{current} → new",
  versionUpdate: "Update to version {next}",
  versionUpdateUnknown: "Update to the new version",
  installIos: "To install it: tap Share, then “Add to Home Screen”.",

  f_azienda: "your company",
  f_cliente: "the customer",
  f_denominazione: "company name",
  f_partitaIva: "VAT number",
  f_codiceFiscale: "tax code",
  f_codiceDestinatario: "recipient code",
  f_regimeFiscale: "tax regime",
  f_progressivoInvio: "next transmission progressive",
  f_formatoNumero: "document numbering",
  num_anno: "Number with the year",
  num_progressivo: "Number with leading zeros",
  num_semplice: "Plain number",
  vTmFuoriFix: "The app writes {elenco}. If another one is needed, the list has to be updated.",
  f_sede: "address",
  f_indirizzo: "street",
  f_numeroCivico: "number",
  f_cap: "postcode",
  f_comune: "town",
  f_provincia: "province",
  f_tipo: "document type",
  f_data: "date",
  f_numero: "number",
  f_causale: "reason",
  f_righe: "lines",
  f_riepiloghi: "summary",
  f_riferimentoNormativo: "legal reference",
  f_tm: "TM code",
  f_descrizione: "description",
  f_quantita: "quantity",
  f_unitaMisura: "unit",
  f_prezzoUnitario: "unit price",
  f_aliquota: "VAT rate",
  f_natura: "nature",
  f_pagamento: "payment",
  f_condizioni: "terms",
  f_modalita: "method",
  f_iban: "IBAN",
  f_etichetta: "account name",
  f_scadenza: "due date",
  f_rate: "instalments",
  f_sconto: "discount",
  f_trasporto: "transport",
  f_validoFino: "valid until",
  f_causaleTrasporto: "reason for transport",
  f_aspetto: "appearance of goods",
  f_colli: "packages",
  f_porto: "carriage",
  f_vettore: "carrier",
  f_fattureCollegate: "linked invoice",
  f_paese: "country",
  f_pec: "certified email",
  paeseIT: "Italy",
  paeseSM: "San Marino",
  regimeRF01: "Standard",
  regimeRF19: "Flat rate",
  f_ritenuta: "withholding",
  f_totale: "total",

  vRequired: "is a required field",
  vTooLong: "is over the {max} characters allowed",
  vTooLongFix: "Shorten it: it runs to {lunghezza} characters.",
  vPartyMissing: "is missing altogether",
  vPartyMissingFix: "Choose a customer, or fill in the company details.",
  vNameFix: "Write the company name, or a first and last name for an individual.",
  vNeedsFiscalId: "needs a VAT number or a tax code",
  vFiscalIdFix: "A private customer may have only a tax code; a company has a VAT number.",
  vVatCheckDigit: "does not pass the check-digit test",
  vVatCheckDigitFix: "Eleven digits, and the check digit has to come out: look for two swapped "
    + "digits.",
  vTaxCodeShape: "is not shaped like an Italian tax code",
  vTaxCodeShapeFix: "Sixteen characters for an individual, eleven digits for a company.",
  vStreetFix: "Write the street.",
  vTownFix: "Write the town.",
  vCapFive: "has to be five digits",
  vCapFix: "For a foreign address the app writes 00000 itself: this one wants the Italian postcode.",
  vProvinceTwo: "has to be the two-letter code",
  vProvinceFix: "RN, for example. A foreign address carries no province.",
  vProvinceFixSm: "For San Marino it is SM.",
  vNoLines: "the document has no lines",
  vNoLinesFix: "Add at least one line: a document with no lines has no taxable amount.",
  vDescriptionFix: "Describe what you sold: it is the field the customer reads first.",
  vUnitFix: "Use an abbreviation: hr, kg, pcs.",
  vRateFix: "Write the rate. If the operation carries no VAT, write 0 and choose a nature.",
  vNaturaWhenZero: "is required when the rate is zero",
  vNaturaWhenZeroFix: "Choose why the operation carries no VAT: exempt, not taxable, excluded.",
  vNaturaWithRate: "does not belong on a line that has a rate",
  vNaturaWithRateFix: "Remove the nature, or take the rate to zero if the operation carries no VAT.",
  vPriceFix: "Write the price. A free item is written with a price of zero, not left blank.",
  vDiscountBoth: "carries both an amount and a percentage",
  vDiscountBothFix: "Keep one of the two: with both, the amount stands and the percentage is "
    + "ignored.",
  vOutsideSubset: "“{valore}” is outside the subset the app writes",
  vNaturaOutsideFix: "The natures the tracciato admits are {elenco}.",
  vTypeUnknown: "“{valore}” is not a type the app knows",
  vTypeUnknownFix: "The app issues {elenco}, and keeps quotes and delivery notes, which stay on "
    + "your own computer.",
  vDateShape: "has to be in the form YYYY-MM-DD",
  vDateFix: "{esempio}, for example.",
  vNumberOnIssueFix: "The number is assigned when you issue: a draft has none.",
  vNumberTooLongFix: "Shorten the numbering: the series fits in a short code.",
  vCausaleTooLongFix: "Shorten it, or move the text into a line's description.",
  vRegimeFix: "The app writes {elenco}: standard and flat rate.",
  vDestinatarioSeven: "has to be seven characters",
  vDestinatarioFix: "Seven letters or digits. With none, the app writes 0000000 and the invoice "
    + "reaches the customer's tax mailbox.",
  vCreditNoteLink: "a credit note has to say what it reverses",
  vCreditNoteLinkFix: "Give the number and date of the invoice you are reversing.",
  vQuoteValidity: "a quote has to say how long it holds",
  vQuoteValidityFix: "Write a date: a price with no expiry holds for as long as the customer can "
    + "find it.",
  vValidityBefore: "falls before the document's own date",
  vValidityBeforeFix: "The validity comes after: move the date, or extend the validity.",
  vTransportReasonFix: "Sale, on approval, return or processing, for example.",
  vRitenutaFix: "The app writes RT01 for individuals and RT02 for companies.",
  vCondizioniFix: "TP01 by instalments, TP02 in full.",
  vModalitaFix: "The app writes {elenco}.",
  vIbanShape: "is not shaped like an IBAN",
  vIbanFix: "Two country letters, two check digits, then the rest of the code.",
  vInstalmentsSum: "do not add up to the document's total",
  vInstalmentsSumFix: "The instalments come to {somma}, the document to {atteso}. Leave one amount "
    + "blank and the app works out the rest.",
  vTotalMismatch: "does not match the sum of the summaries",
  vTotalMismatchFix: "{atteso} was expected.",
  vTmFix: "The San Marino tax office code is short: usually a single digit.",
  vTmMisto: "lines with the same rate and the same nature carry different TM codes",
  vTmMistoFix: "A summary can name only one. Use the same code, or split the lines into two "
    + "documents.",
  vRifNormFix: "Shorten the legal reference: with the TM code in front it goes over the limit.",

  demoNote: "Demo: the data is invented and lives in memory. Close the tab and it is gone, and "
    + "your own invoices never see it.",
  demoItemProgettazione: "Mechanical design",
  demoItemOfficina: "Workshop hour",
  demoItemTelaio: "Welded frame",
  demoItemCollaudo: "On-site testing",
  demoUnitHour: "hr",
  demoUnitPiece: "pcs",
  demoQuoteCausale: "Assembly line overhaul, second batch",
  demoTransportReason: "Sale",
  demoTransportLook: "Pallet",
  demoPaymentNote: "Part payment, balance at month end",

  impTitle: "From another program",
  impNote: "Bring customers, price list and documents over from Fatture in Cloud, and XML invoices "
    + "from any management system. Pick the files as you downloaded them — .xlsx, .xls, XML, all at "
    + "once is fine, and so is the backup ZIP: before anything is written you see what was read, and "
    + "nothing goes in until you confirm.",
  impPick: "Choose files…",
  impReading: "Reading…",
  impEmpty: "None of the files you picked is an export this can read.",
  impFile: "File",
  impWhat: "Contents",
  impNew: "New",
  impExisting: "Already here, untouched",
  impGo: "Import",
  impDone: "Imported: {clienti} customers, {listino} price-list lines, {documenti} documents, "
    + "{incassi} payments.",
  impNothing: "There is nothing new to import: everything read is already here.",
  impFailed: "The import did not go through, and nothing was written.",

  impKindClienti: "Customer list",
  impKindListino: "Price list",
  impKindRegistro: "Document register",
  impKindFattura: "Electronic invoice",
  impKindVecchio: "Excel sheet from 1995",
  impKindIgnoto: "Not recognised",

  impOld: "Open it and save it as .xlsx: it is an Excel 95 or earlier format, which cannot be read "
    + "in a browser.",
  impSkipped: "Columns read and left out: {elenco}.",
  impRegisterLineOf: "{tipo} no. {numero} of {data} — imported from the register, without the "
    + "line detail",
  impRegisterRebuilt: "The register carries totals and not lines, so each document arrives with a "
    + "single line that holds its total and says it is a reconstruction. For the real lines — to "
    + "reprint, too — import the XML files from the Fatture in Cloud backup: they take the place "
    + "of these reconstructions, payments included.",
  impUnreadable: "The file cannot be read: it is damaged, or one format dressed as another.",
  impPaidNote: "Paid, according to the Fatture in Cloud register",
  impNamesNew: "New",
  impNamesExisting: "Already here",
  impNamesCompleted: "Completed from the XML, in place of the reconstruction",
  impUndo: "Undo the last import",
  impUndoWhen: "Last import: {quando} — {clienti} customers, {listino} price-list lines, "
    + "{documenti} documents, {incassi} payments.",
  impUndoAsk: "Everything that came in with the last import is removed. Customers you have since "
    + "made a document for stay.",
  impUndoDone: "Removed: {clienti} customers, {listino} price-list lines, {documenti} documents, "
    + "{incassi} payments.",
  impFrom: "Imported from {fonte} on {quando}.",
  emptyImport: "Coming from another program? You can import what you have.",
  impTotalDiffers: "document {numero}: the file states {dichiarato}, the lines add up to {calcolato}",
  impBrokenXml: "The XML is broken: it will not open.",
  impreadNotFattura: "It is XML, but not an electronic invoice.",
  impreadNoBody: "The invoice has no body at all.",

  ficNoName: "row {riga}: no name, so it stays out",
  ficCountry: "row {riga}: «{valore}» is not a country this can name, entered as Italy",
  ficNoDate: "row {riga}: «{valore}» is not a date",
  ficKind: "row {riga}: «{valore}» is not a document type this handles",

  readKind: "type {valore}: not handled, entered as an invoice",
  readNoLines: "no detail lines",
  readOrder: "purchase order data ({valore}): not read",
  readContract: "contract data ({valore}): not read",
  readConvention: "agreement data ({valore}): not read",
  readReceipt: "receipt data ({valore}): not read",
  readSal: "SAL data ({valore}): not read",
  readVehicles: "vehicle data ({valore}): not read",
  readAttachment: "attachments ({valore}): not read",

  naturaN1: "Excluded (art. 15)",
  "naturaN2.1": "Out of scope (arts. 7-7-septies)",
  "naturaN2.2": "Not subject, other cases",
  "naturaN3.1": "Non-taxable, export",
  "naturaN3.2": "Non-taxable, intra-EU supply",
  "naturaN3.3": "Non-taxable, supply to San Marino",
  "naturaN3.4": "Non-taxable, treated as export",
  "naturaN3.5": "Non-taxable, declaration of intent",
  "naturaN3.6": "Non-taxable, other without plafond",
  naturaN4: "Exempt (art. 10)",
  naturaN5: "Margin scheme",
  "naturaN6.1": "Reverse charge, scrap",
  "naturaN6.2": "Reverse charge, gold and silver",
  "naturaN6.3": "Reverse charge, building subcontract",
  "naturaN6.4": "Reverse charge, buildings",
  "naturaN6.5": "Reverse charge, mobile phones",
  "naturaN6.6": "Reverse charge, electronics",
  "naturaN6.7": "Reverse charge, building sector",
  "naturaN6.8": "Reverse charge, energy sector",
  "naturaN6.9": "Reverse charge, other cases",
  naturaN7: "VAT paid in another EU state",

  companyWho: "Who you are",
  companyLetterhead: "Letterhead",
  companyLetterheadNote: "What sits at the top of every printed document. Until you choose one, "
    + "the logo is G&G Technologies' own: yours goes in as an image — PNG, JPG or SVG — and is "
    + "scaled down if large. Email, phone and website sit under the address.",
  companyLogoPick: "Choose the logo…",
  companyLogoRemove: "Remove the logo",
  companyLogoBad: "This image cannot be read. Try a PNG, a JPG or an SVG.",
  companyLogoBig: "The image is too large even after scaling. Try a smaller file.",
  f_email: "email",
  f_telefono: "phone",
  f_sito: "website",
  companyWhere: "Where you are",
  companyNumbering: "How you number",
  companyDefaultsTitle: "New lines",
  companyDefaultsNote: "What the app writes by itself on every new line: the rate, and at zero the "
    + "nature and the TM code. For a company invoicing without VAT that is nearly every line: "
    + "written here once, never retyped.",
  f_aliquotaPredefinita: "default VAT rate",
  f_naturaPredefinita: "default nature at zero rate",
  f_tmPredefinito: "default TM code",
  f_coe: "economic operator code (COE)",
  companyProvinciaSm: "SM",

  docsSearch: "Search",
  docsSearchHint: "number, customer, subject",
  docsYear: "Year",
  docsAllYears: "All years",
  docsState: "State",
  docsAllStates: "All states",
  docsNoMatch: "No document matches the filters.",
  docsInvoiced: "invoiced",

  partyDeliveryNote: "Recipient code or PEC: where the electronic invoice is delivered, and one is enough. For a private person without a VAT number leave both empty.",
  paeseAltro: "Other country…",
  f_paeseSigla: "country code",
  hQuantita: "qty",
  hUnita: "unit",
  hPrezzo: "price",
  hIva: "VAT",
  hTm: "TM",
  docBolloCharged: "Stamp duty of 2.00 € charged to the customer.",
  docNoDiscount: "No discount on the document.",
  docNoWithholding: "No withholding tax.",
  docXmlDoneSm: "File downloaded. Now upload it to the tax office portal: the app does not "
    + "transmit it.",

  errIntro: "The document is not complete yet:",
  loadFailed: "The data store will not open. If you are browsing privately, the browser prevents "
    + "it.",
};

configure({ it: IT, en: EN, key: "gg.invoice-scope.lang" });
