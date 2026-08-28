// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The strings of the frame, in one file, two objects with the same keys.
//
// **The questions are not here, and that is the whole design.** They live in the four JSON files
// beside this one, each with its own `it`/`en` node, because they are the content: the printed
// sheets, the Python checks and this app all read the same copy, so they cannot drift. What is here
// is everything the app says *around* them — buttons, progress, warnings, the labels of the report.
//
// The machinery — choosing the language, looking a key up, plurals, numbers — is in `gg/i18n.js`.
// Re-exporting it from here keeps every caller importing `./i18n.js`, and keeps `check_apps.py`
// pointed at one file per app when it compares the two key lists.

// **Sette stringhe se ne sono andate, e la regola è la stessa delle domande.** «Ventidue domande»,
// «Autovalutazione sull'AI», «AI Maturity Assessment», «Le sei dimensioni», «Dieci minuti»: sono
// frasi che nominano *questo* questionario, non il telaio che lo mostra. Ora stanno in
// `presentation` dentro questionnaire-N.json, insieme alle domande — che è dove stavano già tutte
// le altre parole del contenuto. Un secondo questionario che ereditasse «ventidue» e «sei» sarebbe
// il difetto che il file sopra dichiara di voler evitare fin dalla prima riga.

export * from "gg/i18n.js";

import { configure } from "gg/i18n.js";

const IT = {

  // chrome
  langSwitch: "EN",
  themeToLight: "Passa al tema chiaro",
  themeToDark: "Passa al tema scuro",
  installButton: "Installa",
  installHint: "Puoi installarla: funziona anche senza connessione.",
  backToPage: "Torna alla scheda",
  sourceLabel: "Codice sorgente",
  errorTitle: "Qualcosa non ha funzionato",
  errorLoad: "Non sono riuscito a caricare le domande. Ricarica la pagina.",
  retry: "Riprova",

  // start
  factLocal: "Le risposte restano su questo computer. Nessuna esce da qui.",
  factExport: "Gli dai un nome all'inizio, lo esporti in JSON o CSV, e stampi il report.",
  factHonest: "Nessuno verifica le risposte: il risultato vale quanto la tua sincerità.",
  // La quarta riga esisteva già come funzione e non era detta da nessuna parte: chi riceve un file
  // da qualcun altro non immagina di poterlo caricare qui, e quindi non ci prova.
  factCollect: "I file esportati da altri si caricano qui: entrano nello stesso elenco.",
  // Etichetta del selettore: compare solo sopra i due questionari.
  pickLabel: "Questionario",
  begin: "Comincia",
  // «Ricomincia da capo» diceva la cosa sbagliata due volte: suonava come rifare lo stesso
  // questionario, e come se il precedente andasse perso. Non va perso — resta fra i salvati.
  beginAgain: "Nuovo questionario",
  savedOpenDialog: "Apri un questionario salvato",
  savedClose: "Chiudi",
  savedImportFile: "Importa un file",
  startPrivacy: "L'app non fa richieste di rete. Quello che scrivi non viene inviato a nessuno, "
    + "e non c'è nessun account da creare.",

  // saved results
  savedTitle: "Risultati salvati",
  savedNote: "Restano su questo computer, in questo browser — questi e quelli che carichi da un "
    + "file. Esportali se ti servono altrove, o se vuoi rifare il questionario fra sei mesi e "
    + "confrontare.",
  savedEmpty: "Qui compaiono i questionari che completi.",
  savedExport: "Esporta",
  savedClear: "Svuota",
  savedClearAsk: "Cancello i risultati salvati? Non si può annullare.",
  savedImportedOne: "Importato un risultato.",
  savedImportedMany: "Importati {n} risultati.",
  // Lo stato di avanzamento sta **nella riga**, non in un pulsante che ne offriva una sola. Se le
  // bozze sono due, il pulsante ne sceglieva una in silenzio e l'altra restava invisibile.
  savedProgress: "{n} di {total} · {section}",
  savedOpenReport: "Vedi il report",
  savedResume: "Riprendi",
  // Torna dopo essere sparita: era stata tolta insieme al pulsante «Riprendi», ma la conferma di
  // cancellazione la usava ancora, e la finestra chiedeva «Cancello il risultato del … ("
  // + "(savedPartial)?». Nessun controllo poteva vederlo — vedi `_check_used_keys`.
  savedPartial: "a metà",
  savedRemove: "Elimina",
  // La conferma nomina la riga, perché nell'elenco si somigliano tutte: senza la data e il
  // punteggio, «cancello questo?» chiede di fidarsi di aver premuto il pulsante giusto.
  savedRemoveAsk: "Cancello il risultato del {date} ({what})? Non si può annullare.",
  savedRemoveLabel: "Elimina il risultato del {date}",
  savedPrev: "Precedenti",
  savedNext: "Successivi",
  savedPage: "Pagina {n} di {total}",
  savedOff: "Questo browser non permette di conservare i risultati, quindi l'app non li tiene. "
    + "Esporta il file alla fine, o va perso.",
  importNotJson: "Questo file non è un JSON leggibile.",
  importNotExport: "Questo file non è un'esportazione di Survey Scope.",
  importOtherApp: "Questa esportazione viene da un'altra app.",
  importNewer: "Questa esportazione viene da una versione più recente dell'app.",
  importNothing: "Nell'esportazione non c'è niente da rimettere.",
  // L'impronta serve a questo: risposte date a domande diverse non si sommano, e il difetto sarebbe
  // silenzioso — venti righe in una lista, con dentro due questionari che non sono lo stesso.
  importOtherQuestionnaire: "Questo file risponde a un questionario diverso da quello aperto. Se non ce l'hai, "
                            + "fattelo mandare da chi ti ha mandato il file: si carica da qui come i risultati.",
  importOtherEdition: "Questo file risponde a un'altra edizione del questionario: non si può "
    + "mettere insieme a questi.",
  importAdded: "Aggiunto all'elenco.",
  importAlready: "Questo risultato era già nell'elenco: è stato aggiornato, non duplicato.",

  // aiuto
  // I quattro casi d'uso stanno **qui e non nella prima pagina**: chi apre l'app venti volte su
  // ventuno è una persona che deve rispondere, non chi ha organizzato la rilevazione. Una home che
  // spiega come somministrare un questionario parlerebbe al lettore sbagliato.
  openerNameLabel: "Nome di questa compilazione",
  // Un default, non un campo vuoto: un vuoto obbliga a inventare un nome prima di sapere cosa si
  // sta per compilare, e chi non lo inventa lascia la riga anonima — che è il difetto di partenza.
  openerNameDefault: "Questionario {n}",
  openerNameNote: "Puoi cambiarlo adesso o alla fine. Viaggia dentro il file che esporti.",
  startAdminText: "Devi somministrarlo a più unità — reparti, uffici, associati? ",
  startAdminLink: "Come si fa",
  helpButton: "Aiuto",
  helpTitle: "Come si usa",
  helpIntro: "Puoi usarlo da solo, per la tua impresa. Oppure distribuirlo a più unità — reparti, "
    + "uffici, aziende associate — e raccogliere i risultati in un elenco solo.",
  helpFlowTitle: "Distribuirlo a più unità",
  helpFlow1: "Decidi chi deve rispondere: i reparti dell'impresa, gli uffici dell'ente, le aziende "
    + "che segui. Una compilazione per unità.",
  helpFlow2: "Manda a ciascuno l'indirizzo di questa pagina. Non serve un account, e le risposte "
    + "restano sul computer di chi compila.",
  helpFlow3: "Alla fine ognuno dà un nome al proprio questionario e lo esporta in JSON o in CSV. Il "
    + "file te lo manda come manderebbe qualunque allegato.",
  helpFlow4: "Tu carichi i file da «Importa un file esportato»: entrano nel tuo elenco e si cercano "
    + "per nome. I CSV hanno le stesse colonne, quindi si impilano in un foglio solo.",
  helpCasesTitle: "Quattro situazioni",
  helpCase1Title: "Un'impresa e i suoi reparti",
  helpCase1: "Produzione, amministrazione e commerciale rispondono separatamente. Le differenze fra "
    + "i reparti dicono più della media: dove due unità della stessa impresa si discostano, c'è una "
    + "pratica che vale la pena guardare.",
  helpCase2Title: "Un ente e i suoi uffici",
  helpCase2: "Una rilevazione interna fra uffici, con lo stesso metro per tutti. La parte sugli "
    + "obblighi europei vale per ciascuno, e quello che resta da chiarire emerge ufficio per "
    + "ufficio invece "
    + "che in un documento unico.",
  helpCase3Title: "Un incubatore e le partecipate",
  helpCase3: "Una fotografia della coorte in un pomeriggio, e un secondo giro a sei mesi. Il "
    + "confronto fra le due compilazioni della stessa azienda dice più del punteggio di oggi.",
  helpCase4Title: "Un'associazione e i suoi associati",
  helpCase4: "Il quadro del settore, costruito da chi ci lavora dentro. Per ogni associato restano "
    + "tre cose da fare, che è anche un motivo concreto per ricontattarlo.",

  helpPackTitle: "Se le domande che ti servono sono altre",
  helpPackIntro: "I due questionari che trovi qui sono modelli, e si possono cambiare. Il giro è "
                 + "questo, e resta tutto sul tuo computer:",
  helpPack1: "Dalla prima schermata premi «Esporta questo modello di questionario»: esce un file "
             + "con dentro le domande, i testi del report e — se il modello ce li ha — gli "
             + "obblighi e l'approfondimento.",
  helpPack2: "Aprilo con un editor di testo e cambia quello che ti serve. Cambia anche la chiave "
             + "e il titolo: la chiave è il nome corto che distingue il tuo modello dagli altri, e "
             + "finisce dentro ogni file che chi risponde ti manderà.",
  helpPack3: "Ricaricalo da «Importa un file», la stessa porta dei risultati. Da quel momento è "
             + "uno dei modelli che si scelgono in cima, e si toglie quando vuoi.",
  helpPackNote: "Un modello che carichi tu non passa da nessun controllo nostro, e va bene così: "
                + "è tuo. L'app verifica solo che sia scritto in modo da poter essere aperto, e "
                + "se qualcosa manca ti dice cosa. Il modo più semplice per scriverne uno è "
                + "partire da uno di questi due e cambiarlo un pezzo alla volta.",
  helpLimitTitle: "Quello che non fa",
  helpLimit: "Non c'è un server. Nessuno vede le risposte prima che qualcuno gliele mandi: è il "
    + "motivo per cui l'app si distribuisce senza chiedere niente a nessuno, e vuol dire che la "
    + "raccolta la fai tu, con i file che ti arrivano.",
  helpClose: "Chiudi",

  // questions
  progressCount: "{n} / {total}",
  progressSection: "Sezione {n} di {total}",
  // Dove sei dentro la sezione, sopra la domanda. Le due misure rispondono a due domande diverse —
  // «quanto manca» e «di cosa stiamo parlando» — e la seconda è quella che si perdeva.
  qWhere: "{section} · domanda {n} di {total}",
  openerGo: "Vai alle domande",
  qBack: "Indietro",
  qNext: "Avanti",
  qReview: "Rivedi le risposte",
  qResult: "Vedi il report",
  // La destinazione, non l'azione: «Interrompi» diceva cosa smetti di fare e non dove vai, e
  // chiedeva una conferma per rassicurare su una perdita che non c'era.
  goHome: "I tuoi questionari",
  reviewKicker: "Tutte le domande",
  reviewTitle: "Rivedi e correggi",
  reviewIntro: "Ogni domanda porta alla sua schermata: aprila e cambia la risposta. Quello che "
    + "correggi resta salvato.",
  reviewBack: "Torna dove eri",
  reviewUnanswered: "Senza risposta",
  reviewSkipped: "Non chiesta: una risposta precedente la rende inutile",
  reviewNotApplicable: "Fuori conteggio: non riguarda la tua azienda",
  reviewLeft: "Ne mancano {n}",
  reviewLeftOne: "Ne manca una",
  reviewDone: "Hai risposto a tutte",
  reviewDeep: "Le domande in più",
  reviewCompliance: "Gli obblighi",
  reviewNotAsked: "Non ti riguarda, per come hai risposto",
  notApplicable: "Questa domanda non riguarda la mia azienda",
  notApplicableUndo: "Rispondi invece a questa domanda",
  // La spiegazione della contraddizione non sta più qui: sta accanto alla regola che la produce,
  // in questionnaire-1.json. Qui resta solo l'etichetta del pulsante, che è dell'interfaccia.
  warnGo: "Vai all'altra domanda",

  // deep dive
  offerKicker: "Facoltativo",
  offerYes: "Sì, {n} domande in più",
  offerNo: "No, vai al risultato",

  // compliance
  clKicker: "Conformità",
  // I due numeri erano scritti a mano ed erano di *questo* questionario, come le sette stringhe
  // già spostate: un modulo con sei voci avrebbe annunciato «Quattordici obblighi» sopra sei righe.
  clTitle: "{n} obblighi, e da quando valgono",
  clIntro: "Nessuna di queste righe dice se sei in regola: dicono quale obbligo esiste, da quando, "
    + "e dove leggerlo. La risposta che dai resta tua, e finisce nel file insieme al resto.",
  clStale: "Queste voci sono state verificate il {verified} e la verifica è scaduta il {until}. "
    + "Leggile come un punto di partenza e ricontrolla le fonti: l'AI Act cambia.",
  clFrom: "Vale dal {date}",
  clChanges: "Cambia il {date}",
  clSource: "Fonte",
  clBack: "Indietro",
  clDone: "Vedi il risultato",
  // Added when the branch rule fires: a customer has already asked, so these rows have stopped
  // being a legal appendix and are the questions the next customer will ask.
  clBecauseAsked: "Hai risposto che nell'ultimo anno un cliente ti ha già chiesto qualcosa su "
    + "sicurezza o protezione dei dati: queste righe sono le domande che arriveranno.",

  // report
  rKicker: "Il tuo quadro",
  rPrint: "Stampa",
  rJson: "Esporta JSON",
  rCsv: "Esporta CSV",
  rAgain: "Rifai il questionario",
  rActionsTitle: "Da dove partire",
  // **«Scoperte» era la metafora assicurativa, e faceva rientrare dalla finestra un giudizio.**
  // «Scoperto» implica che ci sia un'esposizione e che esista una copertura che la chiude: due cose
  // che l'app non sa e non dice. Il modulo di conformità è costruito perché nessuna riga affermi se
  // sei in regola o no — `guard.py` ha un caso apposta — e quella parola lo contraddiceva nel
  // titolo della sezione.
  //
  // Il titolo ora nomina **le risposte**, non il rischio, ed è lo stesso movimento dell'apertura del
  // report: «da come l'hai descritta». Scartato «le voci che non hai confermato», che sembra più
  // preciso e non lo è: vale per «Non lo so» e non per «No», dove una conferma c'è — è la conferma
  // del contrario. Quello che unisce le due risposte non è l'ignoranza, è il lavoro che resta.
  rComplianceTitle: "Dove hai risposto no o non lo so",
  rComplianceIntro: "Sono {n} obblighi su {total}, ognuno con la sua data e la sua fonte. La "
    + "prima cosa da fare è stabilire quali ti riguardano davvero, e chi risponde di ciascuno.",
  rComplianceNone: "Hai risposto sì a tutte le voci che ti riguardano.",
  // «Non è una violazione» resta al negativo di proposito, ed è uno dei tre casi ammessi: è un
  // confine di responsabilità, e detto in positivo confonderebbe proprio chi deve decidere.
  // Uguale nelle due lingue, e va bene: è una frazione, non una frase.
  rOutOf: "/ 100",
  rCompareLabel: "Confronta con",
  rCompareNone: "Nessun confronto",
  rCompareWith: "Confronto con «{label}», compilato il {date}: {delta} sul punteggio complessivo. "
    + "I numeri accanto alle dimensioni sono la differenza fra le due compilazioni.",
  rActionRelated: "Un punteggio basso non è una violazione. Queste però sono voci a cui hai "
    + "risposto no o non lo so nella checklist, e toccano la stessa area:",
  // **«Stampa» descriveva metà dell'effetto, e negava l'altra.** La casella non filtra la stampa:
  // aggiunge il blocco al foglio, che a schermo è l'anteprima di quello che esce dalla stampante —
  // ed è così che capisci di averla spuntata. Un comando che promette di agire solo altrove è un
  // comando che sembra rotto la prima volta che lo usi, perché la pagina cambia lo stesso.
  rAppendixLabel: "Aggiungi le risposte al foglio",
  rAppendixTitle: "Le tue risposte",
  rAppendixSkipped: "Non chiesta",
  rAppendixNa: "Non applicabile",
  rGapsInForce: "Già in vigore",
  rGapsAhead: "Da qui in avanti",
  rGapEnforced: "sanzionabile dal {date}",
  rDeepTitle: "Come ci sei arrivato",
  rEdition: "Questionario edizione {edition}, revisione {revision}. Impronta {digest}.",
  // «Copri» era lo stesso verbo della metafora, e prometteva anche che dopo saresti a posto.
  // «Prendi in mano» dice il gesto — qualcuno se ne occupa — senza promettere l'esito.
  rActionCompliance: "Prendi in mano gli obblighi che hanno già una data",
  rActionComplianceWhy: "Le altre raccomandazioni migliorano qualcosa. Queste no: sono obblighi "
    + "in vigore, e il tempo passa anche se non fai niente.",
  rActionComplianceHow: "Scorri le voci qui sotto, decidi chi risponde di ciascuna e mettici una "
    + "data. Se non sai rispondere, quella è la prima domanda da fare a chi ti assiste.",
  rActionComplianceEffort: "Un'ora per capire quali ti riguardano davvero.",
  rActionComplianceMeasure: "Per ogni voce c'è un nome e una data, e nessuna è più «non lo so».",
  rDimensionLabel: "Dimensione",
  rLabelLabel: "Dai un nome a questo questionario",
  rLabelPlaceholder: "Per esempio il nome dell'azienda",
  // L'avvertenza è obbligatoria, non cortese: è l'unico campo in cui finisce qualcosa che una
  // persona scrive, e va in un file che di solito viene mandato a qualcun altro.
  rLabelNote: "Serve a ritrovarlo, e finisce dentro il file che esporti. Se il file lo mandi a "
    + "qualcuno, scrivi solo quello che vuoi che legga.",
  savedUnnamed: "Senza nome",
  savedSearch: "Cerca per nome o data",
  savedNoMatch: "Nessun questionario con questo nome.",
  // Quattro chiavi e non due, perché «1 non applicabili» è comparso sulla prima prova dal vivo:
  // una dimensione ha tre domande, quindi sia il conteggio sia le non applicabili possono valere
  // uno, e la forma al plurale è sbagliata in tutt'e due i punti.
  rCountOne: "{scored} domanda su {asked}",
  rCountMany: "{scored} domande su {asked}",
  rCountNaOne: "{na} non applicabile",
  rCountNaMany: "{na} non applicabili",
  rCountNone: "Nessuna domanda applicabile: la dimensione non entra nel totale.",
  exportedJson: "Esportato {name}",
  exportedCsv: "Esportato {name}",

  // pacchi — un questionario intero che esce e rientra
  // gli avvisi dell'app: due tasti, e il secondo sparisce quando c'è solo da prendere atto
  askOk: "Va bene",
  askCancel: "Annulla",

  packExport: "Esporta questo modello di questionario",
  packRemove: "Togli questo modello",
  packRemoveAsk: "Togliere il modello «{title}» dall'elenco? Le compilazioni già fatte restano "
                 + "nel deposito, e tornano visibili solo ricaricando questo modello: se ti "
                 + "servono adesso, esportale prima.",
  packReplaceAsk: "«{title}» c'è già. Sostituirlo con questa versione?",
  packAdded: "Aggiunto «{title}». Lo trovi nella tendina in cima.",
  packReplaced: "Sostituito «{title}» con questa versione.",
  packNotAPack: "Questo file non è un modello di questionario di Survey Scope.",
  packWrongSchema: "Questo questionario è scritto in un formato più nuovo di quello che "
                   + "quest'app sa leggere.",
  packBadKey: "La chiave del questionario manca, o non ha la forma richiesta: lettere minuscole, "
              + "cifre e trattini.",
  packKeyTaken: "Quella chiave è già di un questionario che l'app porta con sé. Cambiala nel file, "
                + "e cambia anche il titolo se serve.",
  packNoQuestionnaire: "Nel file manca il questionario.",
  packKeyMismatch: "La chiave scritta nel file e quella dentro il questionario non coincidono.",
  packNoEdition: "Manca il numero di edizione, o non è un numero intero.",
  packNoTitle: "Il questionario non ha un titolo in nessuna lingua.",
  packNoDimensions: "Il questionario non ha dimensioni.",
  packBadDimension: "Una dimensione è senza identificativo o senza nome.",
  packNoBands: "Il questionario non ha le fasce del punteggio.",
  packBadBand: "Una fascia è senza testo.",
  packNoQuestions: "Il questionario non ha domande.",
  packBadQuestion: "Una domanda è senza identificativo o senza testo.",
  packBadOptions: "Una domanda ha meno di due opzioni, o un'opzione è senza punti interi e testo.",
  packNoReport: "Manca il report, o non ha raccomandazioni: senza, l'app arriva in fondo alle "
                + "domande e non ha niente da dire.",
  packBadBandRange: "Una fascia non dice da quale punteggio a quale arriva, e senza il report "
                    + "direbbe la stessa cosa a chiunque.",
  packDuplicateQuestion: "Due domande hanno lo stesso identificativo, e la seconda coprirebbe la "
                         + "risposta della prima.",
  packGhostDimension: "Una domanda dice di appartenere a una dimensione che non esiste: verrebbe "
                      + "chiesta e non peserebbe su niente.",
  packBadSections: "Le sezioni ci sono ma sono scritte male: ognuna vuole un identificativo e "
                   + "l'elenco delle sue domande. Toglile del tutto e l'app ne fa una da sé.",
  packSectionGhost: "Una sezione nomina una domanda che non esiste.",
  packSectionsIncomplete: "Le sezioni non coprono tutte le domande una volta sola: quelle fuori "
                          + "non verrebbero mai mostrate.",
  packNoFrame: "Al report mancano la cornice o le azioni, e senza l'app arriva in fondo alle "
               + "domande e si ferma lì.",
  savedOtherEditionAsk: "Questa compilazione risponde a una versione diversa delle domande. I "
                        + "punteggi che vedrai vengono dal file, non ricalcolati su queste. "
                        + "Aprirla lo stesso?",
};

const EN = {

  // chrome
  langSwitch: "IT",
  themeToLight: "Switch to the light theme",
  themeToDark: "Switch to the dark theme",
  installButton: "Install",
  installHint: "You can install it: it works without a connection.",
  backToPage: "Back to the page",
  sourceLabel: "Source code",
  errorTitle: "Something did not work",
  errorLoad: "I could not load the questions. Reload the page.",
  retry: "Try again",

  // start
  factLocal: "The answers stay on this computer. None of them leaves it.",
  factExport: "You name it at the start, export it as JSON or CSV, and print the report.",
  factHonest: "Nobody verifies the answers: the result is worth exactly as much as your candour.",
  factCollect: "Files other people exported load here: they join the same list.",
  pickLabel: "Questionnaire",
  begin: "Begin",
  beginAgain: "New questionnaire",
  savedOpenDialog: "Open a saved questionnaire",
  savedClose: "Close",
  savedImportFile: "Import a file",
  startPrivacy: "The app makes no network requests. What you type is sent to nobody, and there is "
    + "no account to create.",

  // saved results
  savedTitle: "Saved results",
  savedNote: "They stay on this computer, in this browser — these and the ones you load from a "
    + "file. Export them if you need them elsewhere, or if you want to take the questionnaire "
    + "again in six months and compare.",
  savedEmpty: "The questionnaires you finish appear here.",
  savedExport: "Export",
  savedClear: "Clear",
  savedClearAsk: "Delete the saved results? This cannot be undone.",
  savedImportedOne: "Imported one result.",
  savedImportedMany: "Imported {n} results.",
  savedProgress: "{n} of {total} · {section}",
  savedOpenReport: "See the report",
  savedResume: "Resume",
  savedPartial: "half done",
  savedRemove: "Delete",
  savedRemoveAsk: "Delete the result from {date} ({what})? This cannot be undone.",
  savedRemoveLabel: "Delete the result from {date}",
  savedPrev: "Previous",
  savedNext: "Next",
  savedPage: "Page {n} of {total}",
  savedOff: "This browser does not allow results to be kept, so the app does not keep them. Export "
    + "the file at the end, or it is lost.",
  importNotJson: "This file is not readable JSON.",
  importNotExport: "This file is not a Survey Scope export.",
  importOtherApp: "This export comes from another app.",
  importNewer: "This export comes from a newer version of the app.",
  importNothing: "There is nothing in the export to put back.",
  importOtherQuestionnaire: "This file answers a different questionnaire from the one open. If you do not have it, "
                            + "ask whoever sent you the file for it: it loads from here like the results.",
  importOtherEdition: "This file answers a different edition of the questionnaire: it cannot be "
    + "put together with these.",
  importAdded: "Added to the list.",
  importAlready: "This result was already in the list: it has been updated, not duplicated.",

  // help
  openerNameLabel: "Name of this run",
  openerNameDefault: "Questionnaire {n}",
  openerNameNote: "You can change it now or at the end. It travels inside the file you export.",
  startAdminText: "Handing it to several units — departments, offices, members? ",
  startAdminLink: "How it works",
  helpButton: "Help",
  helpTitle: "How it is used",
  helpIntro: "You can use it on your own, for your company. Or hand it to several units — "
    + "departments, offices, member companies — and collect the results into one list.",
  helpFlowTitle: "Handing it to several units",
  helpFlow1: "Decide who answers: the departments of the company, the offices of the body, the "
    + "companies you work with. One questionnaire per unit.",
  helpFlow2: "Send each of them the address of this page. No account is needed, and the answers "
    + "stay on the computer of whoever answers.",
  helpFlow3: "At the end each one names their questionnaire and exports it as JSON or CSV. They "
    + "send you the file the way they would send any attachment.",
  helpFlow4: "You load the files from «Import an exported file»: they join your list and are "
    + "searchable by name. The CSVs share the same columns, so they stack into one sheet.",
  helpCasesTitle: "Four situations",
  helpCase1Title: "A company and its departments",
  helpCase1: "Production, administration and sales answer separately. The differences between "
    + "departments say more than the average: where two units of the same company diverge, there "
    + "is a practice worth looking at.",
  helpCase2Title: "A public body and its offices",
  helpCase2: "An internal survey across offices, with the same yardstick for all. The European "
    + "obligations apply to each of them, and what is left to clarify surfaces office by office "
    + "rather "
    + "than in a single document.",
  helpCase3Title: "An incubator and its portfolio",
  helpCase3: "A picture of the cohort in an afternoon, and a second round six months later. "
    + "Comparing the two runs of the same company says more than today's score.",
  helpCase4Title: "An association and its members",
  helpCase4: "A picture of the sector, built by the people working in it. Every member is left "
    + "with three things to do, which is also a concrete reason to get back in touch.",

  helpPackTitle: "If the questions you need are different ones",
  helpPackIntro: "The two questionnaires here are templates, and they can be changed. The round is "
                 + "this one, and it all stays on your computer:",
  helpPack1: "From the first screen press «Export this questionnaire template»: out comes a file "
             + "holding the questions, the report texts and — if the template has them — the "
             + "obligations and the deep-dive.",
  helpPack2: "Open it in a text editor and change what you need. Change the key and the title too: "
             + "the key is the short name that tells your template from the others, and it ends up "
             + "inside every file the people answering send you.",
  helpPack3: "Load it back from «Import a file», the same door as the results. From that moment it "
             + "is one of the templates picked at the top, and it is removed whenever you like.",
  helpPackNote: "A template you load yourself goes through no check of ours, and that is right: it "
                + "is yours. The app only verifies that it is written so it can be opened, and if "
                + "something is missing it tells you what. The simplest way to write one is to "
                + "start from one of these two and change it a piece at a time.",
  helpLimitTitle: "What it does not do",
  helpLimit: "There is no server. Nobody sees the answers before somebody sends them: that is why "
    + "the app can be handed out without asking anything of anyone, and it means you do the "
    + "collecting, with the files that reach you.",
  helpClose: "Close",

  // questions
  progressCount: "{n} / {total}",
  progressSection: "Section {n} of {total}",
  qWhere: "{section} · question {n} of {total}",
  openerGo: "Go to the questions",
  qBack: "Back",
  qNext: "Next",
  qReview: "Review your answers",
  qResult: "See the report",
  goHome: "Your questionnaires",
  reviewKicker: "Every question",
  reviewTitle: "Review and correct",
  reviewIntro: "Every question takes you to its own screen: open it and change the answer. What "
    + "you correct stays saved.",
  reviewBack: "Back to where you were",
  reviewUnanswered: "Not answered",
  reviewSkipped: "Not asked: an earlier answer makes it pointless",
  reviewNotApplicable: "Out of the count: it does not apply to your company",
  reviewLeft: "{n} left",
  reviewLeftOne: "One left",
  reviewDone: "You have answered them all",
  reviewDeep: "The extra questions",
  reviewCompliance: "The obligations",
  reviewNotAsked: "Does not apply to you, from what you answered",
  notApplicable: "This question does not apply to my company",
  notApplicableUndo: "Answer this question instead",
  warnGo: "Go to the other question",

  // deep dive
  offerKicker: "Optional",
  offerYes: "Yes, {n} more questions",
  offerNo: "No, go to the result",

  // compliance
  clKicker: "Compliance",
  clTitle: "{n} obligations, and when each one starts",
  clIntro: "None of these rows says whether you comply: they name the obligation, the date it "
    + "starts, and where to read it. The answer you give stays yours, and goes into the file with "
    + "the rest.",
  clStale: "These rows were verified on {verified} and the verification expired on {until}. Read "
    + "them as a starting point and check the sources again: the AI Act changes.",
  clFrom: "Applies from {date}",
  clChanges: "Changes on {date}",
  clSource: "Source",
  clBack: "Back",
  clDone: "See the result",
  clBecauseAsked: "You answered that a customer has already asked you something about security or "
    + "data protection in the past year: these rows are the questions that will arrive.",

  // report
  rKicker: "Your picture",
  rPrint: "Print",
  rJson: "Export JSON",
  rCsv: "Export CSV",
  rAgain: "Take the questionnaire again",
  rActionsTitle: "Where to start",
  rComplianceTitle: "Where you answered no or don't know",
  rComplianceIntro: "That is {n} obligations out of {total}, each with its own date and source. "
    + "The first thing to do is work out which ones actually reach you, and who answers for each.",
  rComplianceNone: "You answered yes to every row that applies to you.",
  rOutOf: "/ 100",
  rCompareLabel: "Compare with",
  rCompareNone: "No comparison",
  rCompareWith: "Compared with «{label}», answered on {date}: {delta} on the overall score. The "
    + "numbers beside the dimensions are the difference between the two runs.",
  rActionRelated: "A low score is not a breach. These, however, are rows you answered no or don't "
    + "know to in the checklist, and they touch the same area:",
  rAppendixLabel: "Add the answers to the sheet",
  rAppendixTitle: "Your answers",
  rAppendixSkipped: "Not asked",
  rAppendixNa: "Not applicable",
  rGapsInForce: "Already in force",
  rGapsAhead: "From here on",
  rGapEnforced: "enforceable from {date}",
  rDeepTitle: "How you got there",
  rEdition: "Questionnaire edition {edition}, revision {revision}. Fingerprint {digest}.",
  rActionCompliance: "Take charge of the obligations that already carry a date",
  rActionComplianceWhy: "The other recommendations improve something. These do not: they are "
    + "obligations in force, and time passes whether you act or not.",
  rActionComplianceHow: "Go through the rows below, decide who is answerable for each one, and put "
    + "a "
    + "date on it. If you cannot answer, that is the first question to ask whoever advises you.",
  rActionComplianceEffort: "An hour to work out which ones really apply to you.",
  rActionComplianceMeasure: "Every row has a name and a date against it, and none is still "
    + "“I do not know”.",
  rDimensionLabel: "Dimension",
  rLabelLabel: "Give this questionnaire a name",
  rLabelPlaceholder: "The company name, for instance",
  rLabelNote: "It is there to help you find it again, and it goes inside the file you export. If "
    + "you send that file to somebody, write only what you want them to read.",
  savedUnnamed: "Unnamed",
  savedSearch: "Search by name or date",
  savedNoMatch: "No questionnaire with that name.",
  rCountOne: "{scored} question out of {asked}",
  rCountMany: "{scored} questions out of {asked}",
  rCountNaOne: "{na} not applicable",
  rCountNaMany: "{na} not applicable",
  rCountNone: "No question applies: this dimension does not enter the total.",
  exportedJson: "Exported {name}",
  exportedCsv: "Exported {name}",

  // packs — a whole questionnaire that goes out and comes back
  askOk: "All right",
  askCancel: "Cancel",

  packExport: "Export this questionnaire template",
  packRemove: "Remove this template",
  packRemoveAsk: "Remove the template «{title}» from the list? The runs already answered stay "
                 + "in the store, and become visible again only by loading this template back: "
                 + "if you need them now, export them first.",
  packReplaceAsk: "«{title}» is already here. Replace it with this version?",
  packAdded: "Added «{title}». You will find it in the chooser at the top.",
  packReplaced: "Replaced «{title}» with this version.",
  packNotAPack: "This file is not a Survey Scope questionnaire template.",
  packWrongSchema: "This questionnaire is written in a format newer than the one this app can "
                   + "read.",
  packBadKey: "The questionnaire key is missing, or not in the required form: lower-case letters, "
              + "digits and hyphens.",
  packKeyTaken: "That key already belongs to a questionnaire the app carries. Change it in the "
                + "file, and change the title too if you need to.",
  packNoQuestionnaire: "The questionnaire is missing from the file.",
  packKeyMismatch: "The key written in the file and the one inside the questionnaire do not match.",
  packNoEdition: "The edition number is missing, or is not a whole number.",
  packNoTitle: "The questionnaire has no title in any language.",
  packNoDimensions: "The questionnaire has no dimensions.",
  packBadDimension: "A dimension has no identifier or no name.",
  packNoBands: "The questionnaire has no score bands.",
  packBadBand: "A band has no text.",
  packNoQuestions: "The questionnaire has no questions.",
  packBadQuestion: "A question has no identifier or no text.",
  packBadOptions: "A question has fewer than two options, or an option lacks whole points and text.",
  packNoReport: "The report is missing, or has no recommendations: without it the app reaches the "
                + "end of the questions with nothing to say.",
  packBadBandRange: "A band does not say which score it runs from and to, and without that the "
                    + "report would say the same thing to everybody.",
  packDuplicateQuestion: "Two questions have the same identifier, and the second would cover the "
                         + "answer to the first.",
  packGhostDimension: "A question says it belongs to a dimension that does not exist: it would be "
                      + "asked and would weigh on nothing.",
  packBadSections: "The sections are there but written wrongly: each one wants an identifier and "
                   + "the list of its questions. Remove them and the app makes one itself.",
  packSectionGhost: "A section names a question that does not exist.",
  packSectionsIncomplete: "The sections do not cover every question exactly once: the ones left "
                          + "out would never be shown.",
  packNoFrame: "The report is missing its frame or its actions, and without them the app reaches "
               + "the end of the questions and stops there.",
  savedOtherEditionAsk: "This run answers a different version of the questions. The scores you "
                        + "will see come from the file, not recomputed against these ones. Open "
                        + "it anyway?",
};

configure({ it: IT, en: EN, key: "gg.survey-scope.lang" });
