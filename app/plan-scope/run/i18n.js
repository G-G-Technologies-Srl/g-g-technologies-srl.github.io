// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Every word the app says, in one file, two objects with the same keys.
//
// The machinery — choosing the language, looking a key up, plurals, numbers — is in `gg/i18n.js`.
// Re-exporting it from here keeps every caller importing `./i18n.js`, and keeps `check_apps.py`
// pointed at one file per app when it compares the two key lists. That comparison is not a
// formality: a correction applied to one language only is the defect the root CLAUDE.md calls the
// most frequent in this project, and it has reached production twice.
//
// One key per line, indented by two spaces, because the check reads this file with a regular
// expression rather than running it. A key folded onto a line with another one is invisible to it.
//
// The words are the reader's, not the trade's. There is no "record", no "entity", no "sync" and no
// "item" in here — and "task" is "attività" in Italian, because the person this is for has never
// called anything a task. In English *task* is the everyday word, so there it stays.

export * from "gg/i18n.js";

import { configure } from "gg/i18n.js";

const IT = {

  // chrome
  tagline: "Progetti e scadenze, sul tuo computer",
  goHome: "Progetti",
  langSwitch: "EN",
  themeToLight: "Passa al tema chiaro",
  themeToDark: "Passa al tema scuro",
  installButton: "Installa",
  searchLabel: "Cerca in tutti i progetti",
  searchTitle: "Cerca",
  searchEmpty: "Niente con queste parole.",
  searchHint: "Frecce per scegliere, Invio per aprire. Da ovunque: Ctrl+K",
  installHint: "Puoi installarla: funziona anche senza connessione.",
  backToPage: "Torna alla scheda",
  sourceLabel: "Codice sorgente",
  errorTitle: "Qualcosa non ha funzionato",
  errorText: "Ricarica la pagina. Se succede di nuovo, il tuo lavoro è comunque al suo posto.",
  retry: "Ricarica",
  noStoreTitle: "Questo browser non può ricordare niente",
  noStore: "Sei in una finestra privata, o il browser ha lo spazio dati disattivato. Puoi usare "
    + "l'app, ma quello che scrivi sparisce chiudendola: esporta prima di uscire.",

  // home
  homeTitle: "I tuoi progetti",
  newProject: "Nuovo progetto",
  projectNameLabel: "Come si chiama",
  projectNamePlaceholder: "Fiera di settembre",
  projectDateLabel: "Data dell'evento, se ce n'è una",
  createProject: "Crea il progetto",
  cancelProject: "Lascia stare",
  folderButton: "Cartella condivisa",
  folderTitle: "Una cartella per lavorare in due",
  folderHint: "Scegli una cartella dentro Dropbox, OneDrive, Google Drive o SharePoint. I progetti "
    + "che segni come condivisi vengono scritti lì come file — un file per pagina, leggibile con "
    + "qualunque programma — e riletti quando un collega li cambia. È la cartella a viaggiare, non i "
    + "tuoi dati: l'app non manda niente a nessuno.",
  folderWho: "Come ti chiami",
  folderNote: "Il nome compare sulle copie che restano quando due persone cambiano la stessa pagina. "
    + "Funziona su Chrome ed Edge, sul computer: sul telefono e su Safari resta l'export.",
  folderPick: "Scegli la cartella",
  folderUnlink: "Scollega la cartella",
  folderResume: "Riprendi la cartella",
  folderLinked: "Cartella condivisa: «{folder}» · sei {who} · letta alle {time}",
  folderNever: "Cartella condivisa: «{folder}» · sei {who} · non ancora letta",
  folderPrompt: "Cartella «{folder}»: il browser chiede di nuovo il permesso.",
  folderNeedsName: "Serve un nome: è quello che vedono gli altri.",
  folderDone: "Cartella collegata. I progetti condivisi sono scritti lì.",
  folderError: "La cartella non si legge o non si scrive: {error}",
  sharedToggle: "Condiviso nella cartella",
  sharedOff: "Spunta per scriverlo nella cartella «{folder}». Da lì in poi si salva da solo, a ogni modifica: non c'è niente da premere.",
  sharedSoon: "Viene scritto nella cartella «{folder}» fra pochi secondi.",
  sharedWriting: "In scrittura nella cartella «{folder}»…",
  sharedOn: "Nella cartella «{folder}», sottocartella «{sub}» · scritto alle {time} · si aggiorna da solo a ogni modifica, entro pochi secondi.",
  sharedNow: "Da adesso si salva da solo nella cartella, a ogni modifica.",
  pulled: "«{name}» aggiornato da {who}: {added} in più, {changed} aggiornate, {conflicts} da confrontare",
  pulledTrashed: "«{name}» è nel cestino: ce l'ha messo {who}, e vale anche per la tua copia.",
  folderGone: "La cartella di «{name}» non c'è più: il progetto resta qui, ma non è più condiviso.",
  logTitle: "Dalla cartella",
  logLine: "{who}: {added} in più, {changed} aggiornate, {conflicts} da confrontare",
  logPages: " — {titles}",
  logTrashed: "{who} l'ha messo nel cestino",
  dropFolder: "Elimina la cartella condivisa",
  dropTitle: "Eliminare la cartella condivisa?",
  dropText: "«{folder}» sparisce dalla cartella condivisa, per tutti. Qui il progetto resta dov'è; da chi "
    + "ce l'ha resta, ma smette di essere condiviso. Non c'è un annulla.",
  dropConfirm: "Elimina la cartella",
  dropped: "Cartella eliminata.",
  todayTitle: "Oggi",
  todayEmpty: "Niente in scadenza questa settimana. Buona giornata.",
  homeEmpty: "Il primo progetto comincia qui. Dagli un nome: il resto si aggiunge strada facendo.",
  importProject: "Importa un progetto",
  backupAll: "Backup di tutto",
  openTrash: "Cestino",
  storageUsed: "Spazio usato: {size}",
  storageTight: "Lo spazio sta per finire. Esporta i progetti a cui tieni.",
  projectNoDate: "senza data",
  projectProgress: "{done} di {total}",
  projectLate: "{n} in ritardo",
  projectDueWeek: "{n} in scadenza",
  eventIn: "fra {n} giorni",
  eventToday: "è oggi",
  eventPast: "passata da {n} giorni",
  eventTomorrow: "domani",

  // project
  projectUntitled: "Progetto senza nome",
  progressTitle: "Avanzamento",
  progressNone: "Ancora nessuna attività. Scrivi la prima qui sotto.",
  dueTitle: "Prossime scadenze",
  dueEmpty: "Niente in scadenza questa settimana.",
  dueLate: "in ritardo",
  dueToday: "oggi",
  dueTomorrow: "domani",
  docsTitle: "Documenti",
  planTitle: "Piano",
  pagePlaceholder: "Titolo della pagina",
  addPage: "Aggiungi",
  pagesEmpty: "Nessuna pagina. Il brief è di solito la prima.",
  taskPlaceholder: "Cosa c'è da fare?",
  addTask: "Aggiungi",
  tasksEmpty: "Nessuna attività. Basta il titolo: la data si mette dopo.",
  taskDate: "Scadenza",
  taskDone: "Fatto",
  taskUndone: "Da fare",
  removeTask: "Sposta nel cestino",
  removePage: "Sposta nel cestino",
  renamePage: "Rinomina la pagina",
  renamePagePrompt: "Come si chiama la pagina?",
  newSubpage: "Nuova sottopagina qui dentro",
  newSubpagePrompt: "Come si chiama la sottopagina?",
  newSibling: "Nuova pagina accanto",
  newPagePrompt: "Come si chiama la pagina?",
  treeAddPage: "+ Pagina",
  pageMoved: "Pagina spostata",
  movePageUnder: "Sposta sotto…",
  movePagePrompt: "Dove va questa pagina?",
  movePageTop: "Al livello base",
  movePageUp: "Sposta su",
  movePageDown: "Sposta giù",
  treeAddSubpage: "+ Sottopagina di questa",
  pageTitleHint: "Il titolo si cambia qui: scrivici sopra.",
  emptyProject: "Svuota il progetto",
  emptiedProject: "«{name}» svuotato: pagine e attività sono nel cestino",
  // I nomi delle tre colonne di partenza. Sono **dati**, non etichette: appena il progetto esiste
  // appartengono a chi lo tiene, che può rinominarle. Per questo si traducono al momento della
  // creazione e non al momento del disegno — un progetto che cambia i nomi delle colonne quando
  // qualcun altro lo apre in un'altra lingua non è più il suo progetto.
  column_todo: "Da fare",
  column_doing: "In corso",
  column_done: "Fatto",
  openPlan: "Apri il piano",
  planBack: "Torna al progetto",
  viewKanban: "Bacheca",
  viewCalendar: "Calendario",
  viewTimeline: "Timeline",
  planMoreLabel: "Altro sul piano",
  pasteOpen: "Incolla un elenco di attività",
  pasteTitle: "Incolla un elenco",
  pasteHint: "Una riga, un'attività. «@2026-09-20» è la scadenza, «#stampa» un tag, un «!» in fondo "
    + "la priorità alta. I trattini e le caselle degli elenchi vanno bene così.",
  pasteCount: "{n} attività pronte",
  pasteNone: "Nessuna riga da leggere.",
  pasteAdd: "Aggiungi alla bacheca",
  pasted: "{n} attività aggiunte",
  copyForAssistant: "Copia per un assistente AI",
  copied: "Copiato. Incollalo nel tuo assistente: le attività che ti restituisce le puoi incollare "
    + "nella bacheca.",
  copyFailed: "Il browser non ha permesso la copia.",
  copyPageLead: "Queste sono le note di un progetto, in Markdown. Leggile e rispondi a quello che "
    + "ti chiedo qui sotto. Se ti chiedo delle attività, scrivile una per riga, con la scadenza "
    + "come @AAAA-MM-GG e i tag come #parola.",
  copyPlanLead: "Questo è il piano di un progetto: le attività, con colonna, scadenza e "
    + "responsabile. Leggilo e rispondi a quello che ti chiedo qui sotto. Se ti chiedo delle "
    + "attività nuove, scrivile una per riga, con la scadenza come @AAAA-MM-GG e i tag come #parola.",
  exportIcs: "Esporta come calendario (.ics)",
  exportCsv: "Esporta le attività in CSV",
  exportHtml: "Esporta come pagina web",
  printPage: "Stampa o salva in PDF",
  printHint: "Il PDF lo fa il browser: nella finestra di stampa scegli «Salva come PDF».",
  cardIcs: "Aggiungi al calendario (.ics)",
  cardGoogle: "Apri in Google Calendar",
  calendarCopy: "È una copia: quello che cambi nel calendario non torna qui.",
  icsNone: "Nessuna attività con una data.",
  csvColumn: "Colonna",
  csvTags: "Tag",
  csvDone: "Fatto",
  boardEmptyColumn: "Nessuna attività",
  htmlFooter: "Da Plan Scope, {date}. I dati restano sul computer di chi li ha scritti.",
  tlNoDate: "Senza data",
  tlEmpty: "Nessuna attività, per ora. Aggiungine una dalla bacheca e comparirà qui.",
  filtersOpen: "Filtri",
  filtersClear: "Togli i filtri",
  filterTag: "Tag",
  filterAssignee: "Assegnatario",
  filterNoTag: "Senza tag",
  filterNoAssignee: "Senza assegnatario",
  columnAdd: "Aggiungi una colonna",
  columnNew: "Nuova colonna",
  columnRename: "Rinomina",
  columnRemove: "Togli la colonna (solo se vuota)",
  columnRenamePrompt: "Come si chiama la colonna?",
  columnKeepOne: "Questa è la colonna che segna il fatto: resta.",
  columnMoveTo: "Le attività che c'erano vanno in questa colonna:",
  columnMoveOk: "Togli la colonna",
  taskMoved: "Attività spostata",
  taskOpen: "Apri",
  cardTitle: "Attività",
  fieldTitle: "Titolo",
  fieldNotes: "Note",
  fieldStart: "Comincia il",
  fieldEnd: "Scade il",
  fieldPriority: "Priorità",
  fieldAssignee: "Chi se ne occupa",
  fieldTags: "Tag, separati da una virgola",
  fieldChecklist: "Checklist",
  fieldBlocked: "Aspetta che finisca",
  fieldMilestone: "È un traguardo",
  checklistAdd: "Aggiungi una voce",
  checklistPlaceholder: "Cosa manca?",
  showMore: "Mostra altro",
  showLess: "Mostra meno",
  priorityNone: "Nessuna",
  priorityLow: "Bassa",
  priorityHigh: "Alta",
  fieldRepeat: "Si ripete",
  repeatNever: "Mai",
  repeatDaily: "Ogni giorno",
  repeatWeekly: "Ogni settimana",
  repeatBiweekly: "Ogni due settimane",
  repeatMonthly: "Ogni mese",
  repeatShort_daily: "ogni giorno",
  repeatShort_weekly: "ogni settimana",
  repeatShort_biweekly: "ogni due settimane",
  repeatShort_monthly: "ogni mese",
  repeated: "Fatta. La prossima scade il {date}",
  selectCount: "{n} selezionate",
  selectMove: "Sposta in…",
  selectAssign: "Assegna a…",
  selectTag: "Aggiungi un tag…",
  selectTrash: "Sposta nel cestino",
  selectClear: "Togli la selezione",
  selectHint: "Maiusc+clic seleziona più carte",
  selectDone: "{n} attività cambiate",
  selectTrashed: "{n} attività nel cestino",
  cardSubtasks: "Sottoattività",
  subtaskPlaceholder: "Una parte di questa attività",
  subtaskAdd: "Aggiungi",
  cardParentOf: "Parte di «{name}»",
  cardParentOpen: "Apri la madre",
  checklistPromote: "Diventa attività",
  csvParent: "Parte di",
  cardClose: "Chiudi",
  cardDelete: "Sposta nel cestino",
  blockedNone: "Niente",
  blockedBy: "Aspetta: {name}",
  milestoneShort: "Traguardo",
  moveTomorrow: "Sposta a domani",
  calToday: "Oggi",
  calPrev: "Mese prima",
  calNext: "Mese dopo",
  calMore: "+{n}",
  calEmpty: "Niente in questo mese.",
  exportProject: "Esporta il progetto",
  exportData: "Esporta solo i dati",
  renameProject: "Rinomina",
  trashProject: "Sposta nel cestino",
  exportInvite: "Questo progetto non è mai stato esportato. Un file sul disco è la tua copia.",
  exportedOn: "Esportato il {date}",
  renamePrompt: "Come si chiama adesso?",

  // page
  pageBack: "Torna al progetto",
  pageUntitled: "Pagina senza titolo",
  pageMade: "Pagina creata: {name}",
  treeLabel: "Le pagine del progetto",
  treeStarred: "Preferiti",
  treeRecent: "Aperte di recente",
  treePages: "Pagine",
  starAdd: "Aggiungi ai preferiti",
  starRemove: "Togli dai preferiti",
  pageTitlePlaceholder: "Titolo",
  bodyPlaceholder: "Scrivi qui.",
  editorNote: "Scrivi. Su una riga vuota: / apre l'elenco dei blocchi, «# » fa un titolo, «- » un "
    + "elenco. La maniglia ⣿ accanto a un blocco lo sposta, o lo trasforma se la premi.",
  sourceView: "Vedi il sorgente",
  pageMoreLabel: "Altro su questa pagina",
  richView: "Torna a scrivere",

  // i blocchi, e le parole del menu
  addBlock: "Aggiungi un blocco",
  dragHandle: "Trascina per spostare, tocca per trasformare — con la tastiera, Alt e le frecce",
  blockMoved: "Blocco spostato",
  markBoldLabel: "Grassetto",
  markItalicLabel: "Corsivo",
  markStrikeLabel: "Barrato",
  markCodeLabel: "Codice",
  markLinkLabel: "Collegamento",
  markPageLabel: "Collegamento a una pagina",
  linkPrompt: "Dove porta il collegamento?",
  menuTitle: "Aggiungi un blocco",
  menuChange: "Trasforma in",
  blockDuplicate: "Duplica",
  blockDelete: "Elimina il blocco",
  blockRemoved: "Blocco eliminato",
  menuFind: "Cerca",
  sampleHeading: "Titolo",
  sampleText: "Testo normale",
  sampleItem: "Una voce",
  sampleQuote: "Una citazione",
  sampleNote: "Una nota in evidenza",
  menuEmpty: "Niente con questo nome.",
  menuClose: "Chiudi",
  askOk: "Va bene",
  askCancel: "Lascia stare",
  askField: "La risposta",
  askSelect: "La scelta",
  blockParagraph: "Testo",
  blockHeading1: "Titolo grande",
  blockHeading2: "Titolo medio",
  blockHeading3: "Titolo piccolo",
  blockList: "Elenco puntato",
  blockOrdered: "Elenco numerato",
  blockCheck: "Checklist",
  blockQuote: "Citazione",
  blockCallout: "Riquadro in evidenza",
  blockCode: "Codice",
  blockDivider: "Riga di separazione",
  blockTable: "Tabella",
  callout_nota: "Nota",
  callout_attenzione: "Attenzione",
  callout_fatto: "Fatto",
  saveSaved: "Salvato",
  saveSaving: "Salvo…",
  saveFailed: "Non sono riuscito a salvare. Esporta il progetto per non perdere niente.",
  addImage: "Aggiungi un'immagine",
  exportPage: "Esporta come Markdown",
  imageTooBig: "L'immagine supera i {size}. Riducila prima, oppure esportala più leggera.",
  imageAdded: "Immagine aggiunta",
  addFile: "Allega un file",
  fileTooBig: "Il file supera i {size}.",
  fileAdded: "File allegato: {name}",
  fileMissing: "Questo file non c'è più.",

  // trash
  trashTitle: "Cestino",
  trashNote: "Quello che butti resta qui trenta giorni, poi se ne va da solo.",
  trashEmpty: "Il cestino è vuoto.",
  trashPurge: "Svuota il cestino",
  purgeTitle: "Svuotare il cestino?",
  purgeText: "Quello che c'è nel cestino — {count} in tutto — sparisce per sempre. Non c'è un annulla.",
  purgeConfirm: "Svuota",
  purged: "Cestino svuotato.",
  trashBack: "Torna indietro",
  restore: "Ripristina",
  kindProject: "Progetto",
  kindPage: "Pagina",
  kindTask: "Attività",
  trashedOn: "Nel cestino dal {date}",

  // snackbar
  undo: "Annulla",
  undone: "Rimesso a posto",
  trashedProject: "«{name}» nel cestino",
  trashedPage: "«{name}» nel cestino",
  trashedTask: "«{name}» nel cestino",
  restoredOne: "«{name}» è tornato al suo posto",

  // import and export
  importTitle: "Stai per importare",
  importSummary: "{name}: {pages}, {tasks}, {assets}",
  importNew: "Importa come progetto nuovo",
  importReplace: "Sostituisci «{name}»",
  importUpdate: "Aggiorna «{name}»",
  importUpdateHint: "È una copia di «{name}»: aggiornarlo prende quello che nel file è più nuovo e "
    + "lascia il resto com'è. Una pagina cambiata da tutte e due le parti resta doppia, con la data nel titolo.",
  updated: "«{name}» aggiornato: {added} in più, {changed} aggiornate, {conflicts} da confrontare",
  copyFromFile: "{title} (dal file del {date})",
  copyFrom: "{title} (copia di {name})",
  someone: "qualcun altro",
  importRestore: "Rimetti tutto com'era",
  importBackupSummary: "Backup del {date}: {projects}, {pages}, {tasks}. Sostituisce quello che "
    + "c'è adesso — prima ne scarico una copia, così puoi tornare indietro.",
  importCancel: "Lascia stare",
  importForeign: "Da {app}, per quello che si può portare:",
  importDone: "«{name}» importato",
  importNotJson: "Questo file non si legge: non è un export di Plan Scope.",
  importNotExport: "Questo file non contiene un progetto di Plan Scope.",
  importOtherApp: "Questo file viene da un'altra app.",
  importNewer: "Questo file viene da una versione più recente dell'app. Aggiornala e riprova.",
  importNothing: "Il file non contiene niente da importare.",
  importMissingAsset: "Il file è incompleto: promette delle immagini che non ci sono.",
  zipNotArchive: "Questo file non è un archivio leggibile.",
  zipBroken: "L'archivio è danneggiato: qualche pezzo non torna.",
  zipCompressed: "L'archivio è compresso in un modo che questa app non legge.",
  backupDone: "Backup scritto: {name}. Contiene i testi; per le immagini esporta il progetto.",
  backupNothing: "Non c'è ancora niente da salvare.",
  restoreDone: "Rimessi a posto {n} elementi.",

  // i traguardi
  awardsTitle: "Traguardi",
  awardsNote: "Sono qui e da nessun'altra parte: nessuna notifica, nessun punteggio.",
  awardsWaiting: "Non ancora",
  awardNew: "Traguardo: {name}",
  soundOn: "Accendi il suono",
  soundOff: "Spegni il suono",
  award_firstProject: "Il primo progetto",
  award_firstDone: "La prima cosa fatta",
  award_firstMilestone: "Il primo traguardo raggiunto",
  award_tenPages: "Dieci pagine scritte",
  award_firstExport: "La prima copia messa al sicuro",
  award_projectComplete: "Un progetto portato a termine",
  award_fiftyDone: "Cinquanta cose fatte",
  award_twoHundredDone: "Duecento cose fatte",
  award_tenDays: "Dieci giorni di lavoro",
  award_thirtyDays: "Trenta giorni di lavoro",
  awardsCount: "{have} di {need}",

  // i template, e il progetto dimostrativo
  templateLabel: "Da cosa parti",
  tpl_event: "Evento",
  tpl_event_lead: "Prima, durante e dopo: sedici cose da fare e tre traguardi.",
  tpl_campaign: "Campagna",
  tpl_campaign_lead: "Messaggio, canali, calendario dei contenuti, resoconto.",
  tpl_launch: "Lancio",
  tpl_launch_lead: "Cosa cambia per chi lo usa, e le due settimane dopo.",
  tpl_guide: "Guida",
  tpl_guide_lead: "Quattro pagine da leggere nell'editor stesso, e quattro cose da spuntare. Poi si butta.",
  gd_page_write: "Scrivere",
  gd_body_write: "Questa pagina è un documento vero: puoi cambiarla, e quello che scrivi si salva da solo, "
    + "a ogni lettera. Non c'è un pulsante «salva».\n\n"
    + "## I blocchi\n\nOgni riga è un blocco: un testo, un titolo, una voce di elenco. Per aggiungerne uno "
    + "premi **/** su una riga vuota e scegli dall'elenco, oppure usa il **+** che compare a sinistra.\n\n"
    + "Le scorciatoie di chi scrive in fretta, all'inizio di una riga vuota:\n\n"
    + "- «# » fa un titolo grande, «## » uno medio, «### » uno piccolo\n"
    + "- «- » fa un elenco, «1. » un elenco numerato, «[] » una checklist\n"
    + "- «> » fa una citazione, «``` » un blocco di codice\n\n"
    + "## Trasformare, spostare, formattare\n\nLa maniglia ⣿ accanto a un blocco lo sposta se la trascini "
    + "e apre «Trasforma in» se la premi: un testo diventa un titolo senza riscriverlo. Seleziona una "
    + "parola e compare la barretta con **grassetto**, *corsivo*, ~~barrato~~, `codice` e collegamento — "
    + "o usa Ctrl+B, Ctrl+I, Ctrl+E.\n\n"
    + "## Collegare le pagine\n\nScrivi il titolo di una pagina fra doppie parentesi quadre, come "
    + "[[Pianificare]], e diventa un collegamento. Se la pagina non c'è ancora, il collegamento è "
    + "tratteggiato e il clic la crea. In fondo alla colonna di sinistra vedi anche **chi punta qui**.\n\n"
    + "## L'albero delle pagine\n\nLa colonna di sinistra è l'indice del progetto. Da lì aggiungi una "
    + "pagina o una sottopagina, e sposti quelle che ci sono: prendi una riga dalla maniglia ⠿ e "
    + "trascinala. **Su e giù** scegli fra quali righe va; **a destra e a sinistra** scegli il "
    + "livello: più a destra diventa un capitolo della riga sopra, più a sinistra risale fino al "
    + "livello base. La linea compare esattamente dove atterrerà, con il suo rientro. Lo stesso dal "
    + "menu ⋯ della pagina: «Sposta sotto…», «Sposta su», «Sposta giù». Il titolo si cambia "
    + "scrivendo nel campo in alto.\n\n"
    + "> [!nota]\n> Le pagine hanno dei **tag**, nella riga sotto il titolo: servono a ritrovarle con la "
    + "ricerca (Ctrl+K) e a raggrupparle nell'elenco del progetto. Sotto i tag ci sono le **proprietà** — "
    + "tipo, stato, cliente, quello che vuoi — e «Vedi come tabella», nel progetto, le mette in colonna.\n\n"
    + "## Immagini, allegati e tabelle\n\n«Aggiungi un'immagine» in alto mette la figura dove hai il "
    + "cursore; «Allega un file» fa lo stesso con un PDF o un foglio, che resta dentro il progetto. "
    + "In una tabella, Invio va alla riga sotto e Tab alla cella accanto.\n\n"
    + "## Da Word\n\nIncolla da Word o da Google Docs: titoli, elenchi e tabelle arrivano come "
    + "blocchi, non come righe.\n\n"
    + "## Le versioni\n\nOgni dieci minuti di scrittura l'app tiene un'istantanea della pagina, e ne "
    + "tiene trenta. Menu ⋯ → «Versioni»: scegli un momento, vedi cosa cambierebbe paragrafo per "
    + "paragrafo, e se vuoi torni lì.\n\n"
    + "| Cosa | Dove |\n| --- | --- |\n| Il sorgente Markdown | menu ⋯ → «Vedi il sorgente» |\n"
    + "| La pagina stampata o in PDF | menu ⋯ → «Stampa o salva in PDF» |\n",
  gd_page_plan: "Pianificare",
  gd_body_plan: "Ogni progetto ha un **piano**: le attività, su una bacheca a colonne, in un calendario e "
    + "su una timeline. Sono tre viste della stessa lista.\n\n"
    + "## La bacheca\n\nUna carta per attività. Le colonne sono tue: rinominale, aggiungine una, togli "
    + "quelle vuote. L'ultima è quella che segna il fatto — l'anello sulla dashboard conta quello.\n\n"
    + "- Trascina una carta per cambiarle colonna\n- Il quadratino la segna fatta\n"
    + "- Il clic apre la scheda: date, note, chi se ne occupa, priorità, tag, checklist, e cosa aspetta\n"
    + "- Maiusc+clic seleziona più carte: la barra in basso le sposta, le assegna, le tagga in una volta\n\n"
    + "## Sottoattività e checklist\n\nNella scheda, «Sottoattività» sono attività vere — con data e "
    + "responsabile — appese a questa, e compaiono rientrate sotto la carta. La **checklist** è per le "
    + "cose piccole; una voce che cresce ha «Diventa attività».\n\n"
    + "## Quello che si ripete\n\n«Si ripete», nella scheda sotto «Mostra altro»: spuntata una, nasce "
    + "la prossima con la data avanzata.\n\n"
    + "## Le date\n\nUna scadenza è un giorno, non un'ora. Nel calendario e nella timeline le attività si "
    + "spostano e si allungano trascinandole. Dalla scheda, «Aggiungi al calendario» porta la scadenza nel "
    + "tuo calendario, come copia.\n\n"
    + "## Le attività in serie\n\nUn elenco scritto altrove — in Word, in una mail, da un assistente — "
    + "entra tutto insieme: menu ⋯ del piano → «Incolla un elenco di attività», oppure Ctrl+V sulla "
    + "bacheca. Una riga, una carta; «@2026-09-20» è la scadenza, «#stampa» un tag.\n\n"
    + "> [!fatto]\n> Prova adesso: apri il piano di questa guida e sposta «Spostare una carta» nella "
    + "colonna «Fatto».\n",
  gd_page_share: "Esportare e condividere",
  gd_body_share: "Tutto quello che scrivi resta in questo browser. È il motivo per cui l'app funziona "
    + "senza rete, ed è anche il motivo per cui **il file sul disco è la tua copia**.\n\n"
    + "## Le copie\n\n- «Esporta il progetto» fa uno ZIP con pagine, attività e immagini\n"
    + "- «Backup di tutto», in «Progetti», salva ogni progetto in un file solo\n"
    + "- «Importa un progetto» rilegge lo ZIP: come progetto nuovo, oppure **aggiornando** quello che "
    + "hai già, se il file è una sua copia\n"
    + "- Dalla stessa porta entrano una bacheca **Trello** (il suo export JSON) e un export **Notion** "
    + "in Markdown, per quello che si può portare\n\n"
    + "## Lavorare in due\n\nDa «Progetti», «Cartella condivisa»: scegli una cartella dentro Dropbox, "
    + "OneDrive o Google Drive e di' come ti chiami. Poi, in un progetto, segna «Condiviso nella "
    + "cartella»: l'app lo scrive lì — un file per pagina, in Markdown, leggibile anche con Obsidian — "
    + "e lo rilegge quando un collega lo cambia, appena torni sull'app e poi una volta al minuto. "
    + "Funziona su Chrome ed Edge, sul computer.\n\n"
    + "Se cambiate la stessa pagina in due, nessuno perde niente: la tua resta, la sua arriva accanto "
    + "come «Scaletta (copia di Marco)», e le confrontate. Per le attività vince chi scrive per ultimo.\n\n"
    + "Senza una cartella in comune resta lo scambio di file: esporti, mandi, chi riceve **aggiorna** il "
    + "suo progetto con le stesse regole.\n\n"
    + "## Provarla in due, in dieci minuti\n\nPrima di fidarti, fai questa prova con un collega, "
    + "ognuno sul suo computer e con la stessa cartella di Dropbox collegata:\n\n"
    + "- [ ] Tu segni un progetto «Condiviso nella cartella»; entro un minuto il collega lo vede fra i suoi progetti\n"
    + "- [ ] Il collega cambia una pagina; tu la vedi cambiare, e nella scheda del progetto compare «Dalla cartella»\n"
    + "- [ ] Cambiate tutti e due la stessa pagina, senza aspettarvi: a uno dei due resta anche la copia "
    + "con il nome dell'altro, e nessun paragrafo è sparito\n"
    + "- [ ] Tu metti un'attività nel cestino; il collega la vede sparire dalla bacheca\n\n"
    + "Se una delle quattro non va, il difetto è dell'app, non tuo: segnalalo con «Codice sorgente» "
    + "in fondo alla pagina.\n\n"
    + "## Per chi non ha l'app\n\n- «Esporta come pagina web»: un file HTML che si apre ovunque\n"
    + "- «Stampa o salva in PDF»: il PDF lo fa il browser, dalla finestra di stampa\n"
    + "- «Esporta le attività in CSV»: per Excel\n- «Esporta come calendario»: le scadenze nel calendario "
    + "di chiunque\n\n"
    + "## Con un assistente AI\n\n«Copia per un assistente AI» mette negli appunti la pagina o il piano, "
    + "con un'istruzione in testa. Incolli nell'assistente che usi, e le attività che ti restituisce le "
    + "incolli nella bacheca. L'app non parla con nessuno: sei tu che porti il testo avanti e indietro.\n",
  gd_page_keys: "Scorciatoie",
  gd_body_keys: "Da ovunque:\n\n| Tasti | Cosa fa |\n| --- | --- |\n| Ctrl+K | Cerca in tutti i progetti |\n"
    + "| Ctrl+N | Una nuova attività, senza cambiare schermata |\n| ? | Questo elenco |\n"
    + "| Ctrl+Z | Annulla |\n\n"
    + "Nell'editor:\n\n| Tasti | Cosa fa |\n| --- | --- |\n| / | Il menu dei blocchi |\n"
    + "| Ctrl+B, Ctrl+I, Ctrl+E | Grassetto, corsivo, codice |\n| Alt+↑, Alt+↓ | Sposta il blocco |\n"
    + "| Tab, Maiusc+Tab | Rientra una voce di elenco, o passa di cella |\n\n"
    + "Sul Mac, Ctrl è ⌘.\n",
  gd_task_open: "Aprire questa guida",
  gd_task_write: "Scrivere due righe nella pagina «Scrivere»",
  gd_task_move: "Spostare una carta",
  gd_task_export: "Esportare il progetto una volta",
  keysTitle: "Scorciatoie",
  keysGlobal: "Da ovunque",
  keysEditor: "Nell'editor",
  keys_search: "Cerca in tutti i progetti",
  keys_new: "Una nuova attività",
  keys_help: "Questo elenco",
  keys_undo: "Annulla",
  keys_menu: "Il menu dei blocchi, su una riga vuota",
  keys_marks: "Grassetto, corsivo, codice",
  keys_move: "Sposta il blocco",
  keys_tab: "Rientra una voce, o passa di cella",
  keysMac: "Sul Mac, Ctrl è ⌘.",
  quickTitle: "Nuova attività",
  quickProject: "In quale progetto",
  quickAdd: "Aggiungi",
  quickNone: "Prima serve un progetto.",
  quickDone: "«{name}» aggiunta a «{project}»",
  exportNudge: "Sono più di due settimane che non fai un backup. Un file sul disco è la tua copia.",
  exportNudgeOk: "Va bene",
  treeBacklinks: "Puntano qui",
  pageTagsPlaceholder: "Tag, separati da una virgola",
  pageTagsLabel: "Tag della pagina",
  versionsOpen: "Versioni",
  versionsTitle: "Le versioni di questa pagina",
  versionsHint: "Un'istantanea ogni dieci minuti di scrittura, le ultime trenta. Scegline una: "
    + "accanto vedi cosa cambierebbe, paragrafo per paragrafo.",
  versionsEmpty: "Ancora nessuna versione: arriva dopo dieci minuti di scrittura.",
  versionNow: "Adesso",
  versionChange: "{gone} paragrafi via, {added} in più",
  versionRestore: "Ripristina questa versione",
  versionRestored: "Versione ripristinata",
  propAdd: "Aggiungi una proprietà",
  propKey: "Nome",
  propValue: "Valore",
  propRemove: "Togli la proprietà",
  pagesTable: "Vedi come tabella",
  pagesTitle: "Le pagine di «{name}»",
  pagesCount: "{n} pagine",
  pagesTableEmpty: "Nessuna pagina con questi filtri.",
  colTitle: "Titolo",
  colTags: "Tag",
  colUpdated: "Modificata",
  filterClear: "Togli il filtro",
  tpl_blank: "Vuoto",
  tpl_blank_lead: "Tre colonne e basta. Il resto lo aggiungi tu.",

  ev_page_brief: "Brief",
  ev_body_brief: "## Perché lo facciamo\n\nUna frase. Se serve un paragrafo, l'obiettivo non è "
    + "ancora chiaro.\n\n## Chi vogliamo che venga\n\n- \n\n## Cosa portiamo a casa\n\n- \n\n"
    + "## Budget\n\n| Voce | Previsto | Speso |\n| --- | ---: | ---: |\n|  |  |  |\n",
  ev_page_schedule: "Scaletta",
  ev_body_schedule: "> [!nota]\n> Le ore vanno riviste con chi è sul posto: chi monta sa quanto "
    + "ci vuole meglio di chi pianifica.\n\n| Ora | Cosa succede | Chi |\n| --- | --- | --- |\n"
    + "|  |  |  |\n",
  ev_page_suppliers: "Fornitori",
  ev_body_suppliers: "| Fornitore | Cosa fa | Contatto | Confermato |\n| --- | --- | --- | --- |\n"
    + "|  |  |  |  |\n",
  ev_page_day: "Il giorno",
  ev_body_day: "Quello che si porta e quello che si controlla appena arrivati.\n\n"
    + "- [ ] Materiali stampati\n- [ ] Ciabatte e prolunghe\n- [ ] Elenco dei contatti\n"
    + "- [ ] Chi apre e chi chiude\n",
  ev_budget: "Definire obiettivo e budget",
  ev_venue: "Scegliere il posto",
  ev_book: "Prenotare lo spazio",
  ev_schedule: "Scrivere la scaletta",
  ev_quotes: "Chiedere i preventivi",
  ev_confirm: "Confermare i fornitori",
  ev_copy: "Scrivere i testi dei materiali",
  ev_artwork: "Approvare la grafica",
  ev_print: "Mandare in stampa",
  ev_invite: "Invitare la lista contatti",
  ev_rsvp: "Confermare le presenze",
  ev_pack: "Preparare quello che si porta",
  ev_setup: "Montaggio",
  ev_day: "Giorno dell'evento",
  ev_contacts: "Riordinare i contatti raccolti",
  ev_debrief: "Debriefing con chi c'era",

  cm_page_brief: "Brief",
  cm_body_brief: "## Cosa vogliamo che resti in testa\n\nUna frase sola.\n\n## A chi parliamo\n\n"
    + "- \n\n## Cosa misuriamo\n\n- \n",
  cm_page_plan: "Piano editoriale",
  cm_body_plan: "| Data | Canale | Contenuto | Pronto |\n| --- | --- | --- | --- |\n|  |  |  |  |\n",
  cm_message: "Mettere a fuoco il messaggio",
  cm_channels: "Scegliere i canali",
  cm_calendar: "Preparare il calendario dei contenuti",
  cm_copy: "Scrivere i testi",
  cm_images: "Preparare le immagini",
  cm_schedule: "Programmare le uscite",
  cm_start: "Partenza della campagna",
  cm_first: "Prima lettura dei risultati",
  cm_close: "Chiusura e resoconto",

  ln_page_announce: "L'annuncio",
  ln_body_announce: "## Cosa cambia per chi lo usa\n\nSi comincia da qui, non dalle "
    + "funzioni.\n\n## In una riga\n\n\n\n## Domande che arriveranno\n\n- \n",
  ln_page_day: "Il giorno del lancio",
  ln_body_day: "- [ ] La pagina è online\n- [ ] I link portano dove devono\n"
    + "- [ ] Chi risponde alle domande lo sa\n- [ ] C'è un modo per tornare indietro\n",
  ln_change: "Scrivere cosa cambia per chi lo usa",
  ln_page: "Preparare la pagina di presentazione",
  ln_media: "Preparare immagini e video",
  ln_tell: "Avvisare chi deve saperlo prima",
  ln_faq: "Preparare le risposte alle domande",
  ln_walk: "Provare il percorso dall'inizio alla fine",
  ln_freeze: "Congelare le modifiche",
  ln_go: "Lancio",
  ln_watch: "Guardare cosa succede",
  ln_listen: "Raccogliere le prime reazioni",
  ln_fix: "Correggere quello che è emerso",

  demoName: "Fiera di settembre",
  demoBadge: "Esempio",
  demoStrip: "Questo è un progetto d'esempio: tocca tutto, cambia, cancella. Quando hai finito, buttalo.",
  demoDrop: "Butta l'esempio",
  demoDropped: "Esempio nel cestino. Il prossimo progetto è il tuo.",
  welcomeTitle: "Benvenuto in Plan Scope",
  welcomeText: "Pagine da scrivere e scadenze da rispettare, nello stesso posto. «Fiera di settembre» è un esempio "
    + "già pieno, per vedere come funziona: toccalo, cambialo, e quando hai capito buttalo.",
  welcomeNote: "Tutto quello che scrivi resta in questo browser: l'app non manda niente a nessuno. Per averne una "
    + "copia sul disco c'è «Esporta».",
  welcomeExample: "Guarda l'esempio",
  welcomeOwn: "Comincia dal tuo",
  welcomeGuide: "Leggi la Guida",
  openGuide: "Guida",
  demoTag: "stampa",
  demoCheck1: "Ripulire l'elenco dei contatti",
  demoCheck2: "Scrivere il testo dell'invito",
  demoPage: "Come funziona questa app",
  demoBody: "Questo progetto è già pieno per farti vedere com'è fatto. **Buttalo quando vuoi**: "
    + "in fondo alla schermata del progetto c'è «Sposta nel cestino».\n\n"
    + "## Le tre cose da sapere\n\n"
    + "1. Quello che scrivi resta su questo computer. Non c'è un server a cui arrivi.\n"
    + "2. Si salva da solo, a ogni lettera. Non c'è un pulsante «salva».\n"
    + "3. Quello che butti torna indietro: c'è «Annulla» sulla striscia, e poi il cestino.\n\n"
    + "> [!nota]\n> Premi **/** su una riga vuota per aggiungere un titolo, un elenco, una "
    + "tabella. Oppure usa il **+** che compare accanto a ogni blocco.\n\n"
    + "## Un elenco di cose da fare\n\n"
    + "- [x] Aprire l'app\n- [ ] Scrivere due righe qui sotto\n- [ ] Aprire il piano e spostare "
    + "una carta\n\n"
    + "## Una tabella, se serve\n\n"
    + "| Voce | Previsto | Speso |\n| --- | ---: | ---: |\n| Stand | 1.200 | 1.150 |\n"
    + "| Stampa | 300 | 340 |\n\n"
    + "---\n\nQuando hai finito di guardare, fai il tuo progetto: **Progetti → Nuovo progetto**.\n",

  // counts
  projectOne: "1 progetto",
  projectMany: "{n} progetti",
  pageOne: "1 pagina",
  pageMany: "{n} pagine",
  taskOne: "1 attività",
  taskMany: "{n} attività",
  imageOne: "1 immagine",
  imageMany: "{n} immagini",
  dayOne: "1 giorno",
  dayMany: "{n} giorni",
};

const EN = {

  // chrome
  tagline: "Projects and deadlines, on your computer",
  goHome: "Projects",
  langSwitch: "IT",
  themeToLight: "Switch to the light theme",
  themeToDark: "Switch to the dark theme",
  installButton: "Install",
  searchLabel: "Search every project",
  searchTitle: "Search",
  searchEmpty: "Nothing with these words.",
  searchHint: "Arrows to choose, Enter to open. From anywhere: Ctrl+K",
  installHint: "You can install it: it works without a connection too.",
  backToPage: "Back to the app page",
  sourceLabel: "Source code",
  errorTitle: "Something did not work",
  errorText: "Reload the page. If it happens again, your work is still where you left it.",
  retry: "Reload",
  noStoreTitle: "This browser cannot remember anything",
  noStore: "You are in a private window, or the browser has site storage turned off. You can use "
    + "the app, but what you write goes when you close it: export before you leave.",

  // home
  homeTitle: "Your projects",
  newProject: "New project",
  projectNameLabel: "What it is called",
  projectNamePlaceholder: "September trade fair",
  projectDateLabel: "Date of the event, if there is one",
  createProject: "Create the project",
  cancelProject: "Never mind",
  folderButton: "Shared folder",
  folderTitle: "A folder for working as two",
  folderHint: "Choose a folder inside Dropbox, OneDrive, Google Drive or SharePoint. The projects "
    + "you mark as shared are written there as files — one file per page, readable with any "
    + "program — and read back when a colleague changes them. The folder travels, not your data: "
    + "the app sends nothing to anybody.",
  folderWho: "Your name",
  folderNote: "The name appears on the copies kept when two people change the same page. Works on "
    + "Chrome and Edge, on a computer: on a phone and on Safari the export remains.",
  folderPick: "Choose the folder",
  folderUnlink: "Unlink the folder",
  folderResume: "Take up the folder again",
  folderLinked: "Shared folder: “{folder}” · you are {who} · read at {time}",
  folderNever: "Shared folder: “{folder}” · you are {who} · not read yet",
  folderPrompt: "Folder “{folder}”: the browser asks for permission again.",
  folderNeedsName: "A name is needed: it is what the others see.",
  folderDone: "Folder linked. Shared projects are written there.",
  folderError: "The folder cannot be read or written: {error}",
  sharedToggle: "Shared in the folder",
  sharedOff: "Tick to write it into the folder “{folder}”. From then on it saves itself, at every change: there is nothing to press.",
  sharedSoon: "It is written into the folder “{folder}” in a few seconds.",
  sharedWriting: "Writing into the folder “{folder}”…",
  sharedOn: "In the folder “{folder}”, sub-folder “{sub}” · written at {time} · updates itself at every change, within seconds.",
  sharedNow: "From now on it saves itself into the folder, at every change.",
  pulled: "“{name}” updated by {who}: {added} added, {changed} updated, {conflicts} to compare",
  pulledTrashed: "“{name}” is in the bin: {who} put it there, and that holds for your copy too.",
  folderGone: "The folder of “{name}” is gone: the project stays here, but it is no longer shared.",
  logTitle: "From the folder",
  logLine: "{who}: {added} added, {changed} updated, {conflicts} to compare",
  logPages: " — {titles}",
  logTrashed: "{who} put it in the bin",
  dropFolder: "Remove the shared folder",
  dropTitle: "Remove the shared folder?",
  dropText: "“{folder}” goes from the shared folder, for everybody. Here the project stays where it is; "
    + "whoever has it keeps it, but it stops being shared. There is no undo.",
  dropConfirm: "Remove the folder",
  dropped: "Folder removed.",
  todayTitle: "Today",
  todayEmpty: "Nothing due this week. Have a good day.",
  homeEmpty: "The first project starts here. Give it a name: the rest gets added as you go.",
  importProject: "Import a project",
  backupAll: "Back up everything",
  openTrash: "Bin",
  storageUsed: "Space used: {size}",
  storageTight: "Space is running out. Export the projects you care about.",
  projectNoDate: "no date",
  projectProgress: "{done} of {total}",
  projectLate: "{n} late",
  projectDueWeek: "{n} due",
  eventIn: "in {n} days",
  eventToday: "is today",
  eventPast: "{n} days ago",
  eventTomorrow: "tomorrow",

  // project
  projectUntitled: "Project with no name",
  progressTitle: "Progress",
  progressNone: "No tasks yet. Write the first one below.",
  dueTitle: "Coming up",
  dueEmpty: "Nothing due this week.",
  dueLate: "late",
  dueToday: "today",
  dueTomorrow: "tomorrow",
  docsTitle: "Documents",
  planTitle: "Plan",
  pagePlaceholder: "Title of the page",
  addPage: "Add",
  pagesEmpty: "No pages yet. The brief is usually the first one.",
  taskPlaceholder: "What needs doing?",
  addTask: "Add",
  tasksEmpty: "No tasks yet. A title is enough: the date can come later.",
  taskDate: "Due date",
  taskDone: "Done",
  taskUndone: "To do",
  removeTask: "Move to the bin",
  removePage: "Move to the bin",
  renamePage: "Rename the page",
  renamePagePrompt: "What is the page called?",
  newSubpage: "New sub-page inside this one",
  newSubpagePrompt: "What is the sub-page called?",
  newSibling: "New page beside this one",
  newPagePrompt: "What is the page called?",
  treeAddPage: "+ Page",
  pageMoved: "Page moved",
  movePageUnder: "Move under…",
  movePagePrompt: "Where does this page go?",
  movePageTop: "To the top",
  movePageUp: "Move up",
  movePageDown: "Move down",
  treeAddSubpage: "+ Sub-page of this one",
  pageTitleHint: "The title is changed here: type over it.",
  emptyProject: "Empty the project",
  emptiedProject: "“{name}” emptied: pages and tasks are in the bin",
  // The names of the three starting columns. They are **data** and not labels: the moment the
  // project exists they belong to whoever keeps it, who can rename them. So they are translated
  // when the project is created and never when it is drawn.
  column_todo: "To do",
  column_doing: "In progress",
  column_done: "Done",
  openPlan: "Open the plan",
  planBack: "Back to the project",
  viewKanban: "Board",
  viewCalendar: "Calendar",
  viewTimeline: "Timeline",
  planMoreLabel: "More about the plan",
  pasteOpen: "Paste a list of tasks",
  pasteTitle: "Paste a list",
  pasteHint: "One line, one task. \"@2026-09-20\" is the deadline, \"#print\" a tag, a trailing \"!\" "
    + "a high priority. Dashes and list boxes are fine as they are.",
  pasteCount: "{n} tasks ready",
  pasteNone: "No lines to read.",
  pasteAdd: "Add to the board",
  pasted: "{n} tasks added",
  copyForAssistant: "Copy for an AI assistant",
  copied: "Copied. Paste it into your assistant: the tasks it gives back can be pasted onto the "
    + "board.",
  copyFailed: "The browser did not allow the copy.",
  copyPageLead: "These are the notes of a project, in Markdown. Read them and answer what I ask "
    + "below. If I ask for tasks, write one per line, with the deadline as @YYYY-MM-DD and tags "
    + "as #word.",
  copyPlanLead: "This is the plan of a project: the tasks, with column, deadline and owner. Read "
    + "it and answer what I ask below. If I ask for new tasks, write one per line, with the "
    + "deadline as @YYYY-MM-DD and tags as #word.",
  exportIcs: "Export as a calendar (.ics)",
  exportCsv: "Export the tasks as CSV",
  exportHtml: "Export as a web page",
  printPage: "Print or save as PDF",
  printHint: "The browser makes the PDF: in the print window choose \"Save as PDF\".",
  cardIcs: "Add to calendar (.ics)",
  cardGoogle: "Open in Google Calendar",
  calendarCopy: "It is a copy: what you change in the calendar does not come back here.",
  icsNone: "No task has a date.",
  csvColumn: "Column",
  csvTags: "Tags",
  csvDone: "Done",
  boardEmptyColumn: "No tasks",
  htmlFooter: "From Plan Scope, {date}. The data stays on the computer of whoever wrote it.",
  tlNoDate: "No date",
  tlEmpty: "No tasks yet. Add one from the board and it will show up here.",
  filtersOpen: "Filters",
  filtersClear: "Clear the filters",
  filterTag: "Tag",
  filterAssignee: "Assignee",
  filterNoTag: "No tag",
  filterNoAssignee: "Nobody yet",
  columnAdd: "Add a column",
  columnNew: "New column",
  columnRename: "Rename",
  columnRemove: "Remove the column (only when empty)",
  columnRenamePrompt: "What is the column called?",
  columnKeepOne: "This is the column that means done: it stays.",
  columnMoveTo: "What was in it goes into this column:",
  columnMoveOk: "Remove the column",
  taskMoved: "Task moved",
  taskOpen: "Open",
  cardTitle: "Task",
  fieldTitle: "Title",
  fieldNotes: "Notes",
  fieldStart: "Starts on",
  fieldEnd: "Due on",
  fieldPriority: "Priority",
  fieldAssignee: "Who is on it",
  fieldTags: "Tags, separated by commas",
  fieldChecklist: "Checklist",
  fieldBlocked: "Waits for",
  fieldMilestone: "It is a milestone",
  checklistAdd: "Add an item",
  checklistPlaceholder: "What is left?",
  showMore: "Show more",
  showLess: "Show less",
  priorityNone: "None",
  priorityLow: "Low",
  priorityHigh: "High",
  fieldRepeat: "Repeats",
  repeatNever: "Never",
  repeatDaily: "Every day",
  repeatWeekly: "Every week",
  repeatBiweekly: "Every two weeks",
  repeatMonthly: "Every month",
  repeatShort_daily: "every day",
  repeatShort_weekly: "every week",
  repeatShort_biweekly: "every two weeks",
  repeatShort_monthly: "every month",
  repeated: "Done. The next one is due on {date}",
  selectCount: "{n} selected",
  selectMove: "Move to…",
  selectAssign: "Assign to…",
  selectTag: "Add a tag…",
  selectTrash: "Move to the bin",
  selectClear: "Clear the selection",
  selectHint: "Shift+click selects more cards",
  selectDone: "{n} tasks changed",
  selectTrashed: "{n} tasks in the bin",
  cardSubtasks: "Sub-tasks",
  subtaskPlaceholder: "A part of this task",
  subtaskAdd: "Add",
  cardParentOf: "Part of “{name}”",
  cardParentOpen: "Open the parent",
  checklistPromote: "Make it a task",
  csvParent: "Part of",
  cardClose: "Close",
  cardDelete: "Move to the bin",
  blockedNone: "Nothing",
  blockedBy: "Waits for: {name}",
  milestoneShort: "Milestone",
  moveTomorrow: "Move to tomorrow",
  calToday: "Today",
  calPrev: "Previous month",
  calNext: "Next month",
  calMore: "+{n}",
  calEmpty: "Nothing this month.",
  exportProject: "Export the project",
  exportData: "Export the data only",
  renameProject: "Rename",
  trashProject: "Move to the bin",
  exportInvite: "This project has never been exported. A file on disk is your copy.",
  exportedOn: "Exported on {date}",
  renamePrompt: "What is it called now?",

  // page
  pageBack: "Back to the project",
  pageUntitled: "Page with no title",
  pageMade: "Page created: {name}",
  treeLabel: "The project's pages",
  treeStarred: "Favourites",
  treeRecent: "Opened recently",
  treePages: "Pages",
  starAdd: "Add to favourites",
  starRemove: "Remove from favourites",
  pageTitlePlaceholder: "Title",
  bodyPlaceholder: "Write here.",
  editorNote: "Just write. On an empty line: / opens the list of blocks, “# ” makes a heading, "
    + "“- ” a list. The ⣿ handle beside a block moves it, or turns it into something else if you "
    + "press it.",
  sourceView: "See the source",
  pageMoreLabel: "More about this page",
  richView: "Back to writing",

  // the blocks, and the words of the menu
  addBlock: "Add a block",
  dragHandle: "Drag to move, click to turn into — with a keyboard, Alt and the arrows",
  blockMoved: "Block moved",
  markBoldLabel: "Bold",
  markItalicLabel: "Italic",
  markStrikeLabel: "Strikethrough",
  markCodeLabel: "Code",
  markLinkLabel: "Link",
  markPageLabel: "Link to a page",
  linkPrompt: "Where does the link go?",
  menuTitle: "Add a block",
  menuChange: "Turn into",
  blockDuplicate: "Duplicate",
  blockDelete: "Delete the block",
  blockRemoved: "Block deleted",
  menuFind: "Search",
  sampleHeading: "Heading",
  sampleText: "Ordinary text",
  sampleItem: "An item",
  sampleQuote: "A quotation",
  sampleNote: "A highlighted note",
  menuEmpty: "Nothing by that name.",
  menuClose: "Close",
  askOk: "OK",
  askCancel: "Leave it",
  askField: "The answer",
  askSelect: "The choice",
  blockParagraph: "Text",
  blockHeading1: "Large heading",
  blockHeading2: "Medium heading",
  blockHeading3: "Small heading",
  blockList: "Bulleted list",
  blockOrdered: "Numbered list",
  blockCheck: "Checklist",
  blockQuote: "Quote",
  blockCallout: "Highlighted box",
  blockCode: "Code",
  blockDivider: "Divider",
  blockTable: "Table",
  callout_nota: "Note",
  callout_attenzione: "Careful",
  callout_fatto: "Done",
  saveSaved: "Saved",
  saveSaving: "Saving…",
  saveFailed: "I could not save. Export the project so nothing is lost.",
  addImage: "Add an image",
  exportPage: "Export as Markdown",
  imageTooBig: "The image is over {size}. Make it smaller first, or export it lighter.",
  imageAdded: "Image added",
  addFile: "Attach a file",
  fileTooBig: "The file is over {size}.",
  fileAdded: "File attached: {name}",
  fileMissing: "This file is not here any more.",

  // trash
  trashTitle: "Bin",
  trashNote: "What you throw away stays here for thirty days, then it goes on its own.",
  trashEmpty: "The bin is empty.",
  trashPurge: "Empty the bin",
  purgeTitle: "Empty the bin?",
  purgeText: "What is in the bin — {count} in all — goes for good. There is no undo.",
  purgeConfirm: "Empty",
  purged: "Bin emptied.",
  trashBack: "Go back",
  restore: "Restore",
  kindProject: "Project",
  kindPage: "Page",
  kindTask: "Task",
  trashedOn: "In the bin since {date}",

  // snackbar
  undo: "Undo",
  undone: "Put back",
  trashedProject: "“{name}” is in the bin",
  trashedPage: "“{name}” is in the bin",
  trashedTask: "“{name}” is in the bin",
  restoredOne: "“{name}” is back where it was",

  // import and export
  importTitle: "You are about to import",
  importSummary: "{name}: {pages}, {tasks}, {assets}",
  importNew: "Import as a new project",
  importReplace: "Replace “{name}”",
  importUpdate: "Update “{name}”",
  importUpdateHint: "It is a copy of “{name}”: updating takes what is newer in the file and "
    + "leaves the rest as it is. A page changed on both sides stays twice, with the date in the title.",
  updated: "“{name}” updated: {added} added, {changed} updated, {conflicts} to compare",
  copyFromFile: "{title} (from the file of {date})",
  copyFrom: "{title} ({name}'s copy)",
  someone: "somebody else",
  importRestore: "Put everything back",
  importBackupSummary: "Backup of {date}: {projects}, {pages}, {tasks}. It replaces what is here "
    + "now — a copy of that is downloaded first, so you can go back.",
  importCancel: "Never mind",
  importForeign: "From {app}, as far as it carries over:",
  importDone: "“{name}” imported",
  importNotJson: "This file cannot be read: it is not a Plan Scope export.",
  importNotExport: "This file holds no Plan Scope project.",
  importOtherApp: "This file comes from another app.",
  importNewer: "This file comes from a newer version of the app. Update it and try again.",
  importNothing: "The file holds nothing to import.",
  importMissingAsset: "The file is incomplete: it promises images that are not in it.",
  zipNotArchive: "This file is not a readable archive.",
  zipBroken: "The archive is damaged: some of it does not add up.",
  zipCompressed: "The archive is compressed in a way this app does not read.",
  backupDone: "Backup written: {name}. It holds the text; for the images, export the project.",
  backupNothing: "There is nothing to save yet.",
  restoreDone: "{n} things put back.",

  // the achievements
  awardsTitle: "Milestones",
  awardsNote: "They live here and nowhere else: no notifications, no score.",
  awardsWaiting: "Not yet",
  awardNew: "Milestone: {name}",
  soundOn: "Turn the sound on",
  soundOff: "Turn the sound off",
  award_firstProject: "The first project",
  award_firstDone: "The first thing finished",
  award_firstMilestone: "The first milestone reached",
  award_tenPages: "Ten pages written",
  award_firstExport: "The first copy kept safe",
  award_projectComplete: "A project seen through",
  award_fiftyDone: "Fifty things finished",
  award_twoHundredDone: "Two hundred things finished",
  award_tenDays: "Ten days of work",
  award_thirtyDays: "Thirty days of work",
  awardsCount: "{have} of {need}",

  // the templates, and the demo project
  templateLabel: "What you start from",
  tpl_event: "Event",
  tpl_event_lead: "Before, during and after: sixteen things to do and three milestones.",
  tpl_campaign: "Campaign",
  tpl_campaign_lead: "Message, channels, a content calendar, a write-up.",
  tpl_launch: "Launch",
  tpl_launch_lead: "What changes for whoever uses it, and the fortnight after.",
  tpl_guide: "Guide",
  tpl_guide_lead: "Four pages to read in the editor itself, and four things to tick. Then bin it.",
  gd_page_write: "Writing",
  gd_body_write: "This page is a real document: you can change it, and what you write saves itself, "
    + "letter by letter. There is no “save” button.\n\n"
    + "## Blocks\n\nEvery line is a block: a text, a heading, a list item. To add one, press **/** on an "
    + "empty line and choose from the list, or use the **+** that appears on the left.\n\n"
    + "The shortcuts of people who write fast, at the start of an empty line:\n\n"
    + "- “# ” makes a large heading, “## ” a medium one, “### ” a small one\n"
    + "- “- ” makes a list, “1. ” a numbered list, “[] ” a checklist\n"
    + "- “> ” makes a quote, “``` ” a code block\n\n"
    + "## Turn, move, format\n\nThe handle ⣿ beside a block moves it when dragged and opens "
    + "“Turn into” when pressed: a text becomes a heading without retyping. Select a word and the "
    + "strip appears with **bold**, *italic*, ~~strikethrough~~, `code` and link — or use Ctrl+B, "
    + "Ctrl+I, Ctrl+E.\n\n"
    + "## Linking pages\n\nWrite a page's title between double square brackets, like [[Planning]], and "
    + "it becomes a link. If the page is not there yet the link is dotted, and clicking it makes the "
    + "page. At the bottom of the left column you also see **who points here**.\n\n"
    + "## The tree of pages\n\nThe left column is the project's index. From there you add a page or "
    + "a sub-page, and move the ones there are: take a row by its ⠿ handle and drag it. **Up and "
    + "down** chooses which rows it goes between; **left and right** chooses the level: further "
    + "right it becomes a chapter of the row above, further left it climbs back to the top. The line "
    + "appears exactly where it will land, at its indent. The same from the page's ⋯ menu: “Move "
    + "under…”, “Move up”, “Move down”. The title is changed by typing in the field at the top.\n\n"
    + "> [!nota]\n> Pages have **tags**, on the line under the title: they help find them with the "
    + "search (Ctrl+K) and group them in the project's list. Under the tags sit the **properties** — "
    + "type, status, client, whatever you need — and “See as a table”, in the project, puts them in columns.\n\n"
    + "## Images, attachments and tables\n\n“Add an image” at the top puts the picture where your "
    + "caret is; “Attach a file” does the same with a PDF or a sheet, which stays inside the project. "
    + "In a table, Enter goes to the row below and Tab to the next cell.\n\n"
    + "## From Word\n\nPaste from Word or Google Docs: headings, lists and tables arrive as blocks, "
    + "not as lines.\n\n"
    + "## Versions\n\nEvery ten minutes of writing the app keeps a snapshot of the page, and keeps "
    + "thirty. ⋯ menu → “Versions”: pick a moment, see what would change paragraph by paragraph, and "
    + "go back there if you want.\n\n"
    + "| What | Where |\n| --- | --- |\n| The Markdown source | ⋯ menu → “See the source” |\n"
    + "| The page on paper or as PDF | ⋯ menu → “Print or save as PDF” |\n",
  gd_page_plan: "Planning",
  gd_body_plan: "Every project has a **plan**: the tasks, on a board of columns, in a calendar and on "
    + "a timeline. They are three views of the same list.\n\n"
    + "## The board\n\nOne card per task. The columns are yours: rename them, add one, remove the empty "
    + "ones. The last one marks what is done — the ring on the dashboard counts that.\n\n"
    + "- Drag a card to change its column\n- The small box marks it done\n"
    + "- A click opens the card: dates, notes, owner, priority, tags, checklist, and what it waits for\n"
    + "- Shift+click picks several cards: the bar at the bottom moves, assigns and tags them at once\n\n"
    + "## Sub-tasks and checklists\n\nOn the card, “Sub-tasks” are real tasks — with a date and an "
    + "owner — hanging from this one, and they show indented under the card. The **checklist** is for "
    + "the small things; an item that grows has “Make it a task”.\n\n"
    + "## What repeats\n\n“Repeats”, on the card under “Show more”: tick one, and the next is born "
    + "with the date moved on.\n\n"
    + "## Dates\n\nA deadline is a day, not an hour. In the calendar and on the timeline, tasks move and "
    + "stretch by dragging. From the card, “Add to calendar” takes the deadline into your own "
    + "calendar, as a copy.\n\n"
    + "## Tasks in bulk\n\nA list written elsewhere — in Word, in a mail, by an assistant — comes in all "
    + "at once: the plan's ⋯ menu → “Paste a list of tasks”, or Ctrl+V on the board. One line, one "
    + "card; “@2026-09-20” is the deadline, “#print” a tag.\n\n"
    + "> [!fatto]\n> Try it now: open this guide's plan and move “Move a card” into the “Done” "
    + "column.\n",
  gd_page_share: "Exporting and sharing",
  gd_body_share: "Everything you write stays in this browser. That is why the app works without a "
    + "network, and it is also why **the file on disk is your copy**.\n\n"
    + "## Copies\n\n- “Export the project” makes a ZIP with pages, tasks and images\n"
    + "- “Back up everything”, under “Projects”, saves every project in one file\n"
    + "- “Import a project” reads the ZIP back: as a new project, or **updating** the one you already "
    + "have, if the file is a copy of it\n"
    + "- Through the same door come a **Trello** board (its JSON export) and a **Notion** export in "
    + "Markdown, as far as they carry over\n\n"
    + "## Working as two\n\nFrom “Projects”, “Shared folder”: choose a folder inside Dropbox, "
    + "OneDrive or Google Drive and say your name. Then, in a project, tick “Shared in the folder”: "
    + "the app writes it there — one file per page, in Markdown, readable with Obsidian too — and "
    + "reads it back when a colleague changes it, as soon as you return to the app and then once a "
    + "minute. Works on Chrome and Edge, on a computer.\n\n"
    + "If you both change the same page, nobody loses anything: yours stays, theirs arrives beside it "
    + "as “Running order (Marco's copy)”, and you compare. For tasks the last writer wins.\n\n"
    + "Without a folder in common the exchange of files remains: you export, you send, and whoever "
    + "receives **updates** their project by the same rules.\n\n"
    + "## Trying it as two, in ten minutes\n\nBefore you trust it, run this trial with a colleague, "
    + "each on their own computer, with the same Dropbox folder linked:\n\n"
    + "- [ ] You tick a project “Shared in the folder”; within a minute they see it among their projects\n"
    + "- [ ] They change a page; you see it change, and “From the folder” appears on the project's screen\n"
    + "- [ ] You both change the same page, without waiting for each other: one of you also keeps the "
    + "copy with the other's name, and no paragraph has gone\n"
    + "- [ ] You put a task in the bin; they see it leave the board\n\n"
    + "If one of the four fails, the fault is the app's, not yours: report it through “Source code” "
    + "at the foot of the page.\n\n"
    + "## For people without the app\n\n- “Export as a web page”: an HTML file that opens anywhere\n"
    + "- “Print or save as PDF”: the browser makes the PDF, from the print window\n"
    + "- “Export the tasks as CSV”: for Excel\n- “Export as a calendar”: the deadlines in anybody's "
    + "calendar\n\n"
    + "## With an AI assistant\n\n“Copy for an AI assistant” puts the page or the plan on the clipboard, "
    + "with an instruction on top. You paste it into the assistant you use, and the tasks it gives back "
    + "you paste onto the board. The app talks to nobody: you carry the text back and forth.\n",
  gd_page_keys: "Shortcuts",
  gd_body_keys: "From anywhere:\n\n| Keys | What it does |\n| --- | --- |\n| Ctrl+K | Search every project |\n"
    + "| Ctrl+N | A new task, without leaving the screen |\n| ? | This list |\n"
    + "| Ctrl+Z | Undo |\n\n"
    + "In the editor:\n\n| Keys | What it does |\n| --- | --- |\n| / | The block menu |\n"
    + "| Ctrl+B, Ctrl+I, Ctrl+E | Bold, italic, code |\n| Alt+↑, Alt+↓ | Move the block |\n"
    + "| Tab, Shift+Tab | Indent a list item, or move between cells |\n\n"
    + "On a Mac, Ctrl is ⌘.\n",
  gd_task_open: "Open this guide",
  gd_task_write: "Write two lines on the “Writing” page",
  gd_task_move: "Move a card",
  gd_task_export: "Export the project once",
  keysTitle: "Shortcuts",
  keysGlobal: "From anywhere",
  keysEditor: "In the editor",
  keys_search: "Search every project",
  keys_new: "A new task",
  keys_help: "This list",
  keys_undo: "Undo",
  keys_menu: "The block menu, on an empty line",
  keys_marks: "Bold, italic, code",
  keys_move: "Move the block",
  keys_tab: "Indent an item, or move between cells",
  keysMac: "On a Mac, Ctrl is ⌘.",
  quickTitle: "New task",
  quickProject: "In which project",
  quickAdd: "Add",
  quickNone: "A project comes first.",
  quickDone: "“{name}” added to “{project}”",
  exportNudge: "It has been over two weeks since your last backup. A file on disk is your copy.",
  exportNudgeOk: "All right",
  treeBacklinks: "Point here",
  pageTagsPlaceholder: "Tags, separated by a comma",
  pageTagsLabel: "The page's tags",
  versionsOpen: "Versions",
  versionsTitle: "This page's versions",
  versionsHint: "A snapshot every ten minutes of writing, the last thirty kept. Choose one: "
    + "beside it you see what would change, paragraph by paragraph.",
  versionsEmpty: "No version yet: the first comes after ten minutes of writing.",
  versionNow: "Now",
  versionChange: "{gone} paragraphs gone, {added} added",
  versionRestore: "Restore this version",
  versionRestored: "Version restored",
  propAdd: "Add a property",
  propKey: "Name",
  propValue: "Value",
  propRemove: "Remove the property",
  pagesTable: "See as a table",
  pagesTitle: "The pages of “{name}”",
  pagesCount: "{n} pages",
  pagesTableEmpty: "No page matches these filters.",
  colTitle: "Title",
  colTags: "Tags",
  colUpdated: "Changed",
  filterClear: "Clear the filter",
  tpl_blank: "Empty",
  tpl_blank_lead: "Three columns and nothing else. The rest is yours to add.",

  ev_page_brief: "Brief",
  ev_body_brief: "## Why we are doing it\n\nOne sentence. If it takes a paragraph, the point is not "
    + "clear yet.\n\n## Who we want there\n\n- \n\n## What we take home\n\n- \n\n"
    + "## Budget\n\n| Item | Planned | Spent |\n| --- | ---: | ---: |\n|  |  |  |\n",
  ev_page_schedule: "Running order",
  ev_body_schedule: "> [!nota]\n> Go through the times with whoever is on site: the people setting "
    + "up know how long it takes better than the people planning it.\n\n"
    + "| Time | What happens | Who |\n| --- | --- | --- |\n|  |  |  |\n",
  ev_page_suppliers: "Suppliers",
  ev_body_suppliers: "| Supplier | What they do | Contact | Confirmed |\n"
    + "| --- | --- | --- | --- |\n|  |  |  |  |\n",
  ev_page_day: "On the day",
  ev_body_day: "What to bring, and what to check on arrival.\n\n"
    + "- [ ] Printed material\n- [ ] Extension leads\n- [ ] The contact list\n"
    + "- [ ] Who opens and who closes\n",
  ev_budget: "Agree the aim and the budget",
  ev_venue: "Choose the place",
  ev_book: "Book the space",
  ev_schedule: "Write the running order",
  ev_quotes: "Ask for quotes",
  ev_confirm: "Confirm the suppliers",
  ev_copy: "Write the copy for the materials",
  ev_artwork: "Approve the artwork",
  ev_print: "Send it to print",
  ev_invite: "Invite the contact list",
  ev_rsvp: "Confirm who is coming",
  ev_pack: "Pack what goes with you",
  ev_setup: "Set-up",
  ev_day: "Day of the event",
  ev_contacts: "Sort out the contacts you gathered",
  ev_debrief: "Debrief with the people who were there",

  cm_page_brief: "Brief",
  cm_body_brief: "## What we want to stick\n\nOne sentence.\n\n## Who we are talking to\n\n- \n\n"
    + "## What we measure\n\n- \n",
  cm_page_plan: "Content plan",
  cm_body_plan: "| Date | Channel | Content | Ready |\n| --- | --- | --- | --- |\n|  |  |  |  |\n",
  cm_message: "Sharpen the message",
  cm_channels: "Choose the channels",
  cm_calendar: "Draw up the content calendar",
  cm_copy: "Write the copy",
  cm_images: "Prepare the images",
  cm_schedule: "Schedule the posts",
  cm_start: "Campaign starts",
  cm_first: "First read of the results",
  cm_close: "Wrap up and write it down",

  ln_page_announce: "The announcement",
  ln_body_announce: "## What changes for whoever uses it\n\nStart here, not with the "
    + "features.\n\n## In one line\n\n\n\n## Questions that will come\n\n- \n",
  ln_page_day: "Launch day",
  ln_body_day: "- [ ] The page is live\n- [ ] The links go where they should\n"
    + "- [ ] Whoever answers questions knows\n- [ ] There is a way back\n",
  ln_change: "Write what changes for whoever uses it",
  ln_page: "Prepare the announcement page",
  ln_media: "Prepare images and video",
  ln_tell: "Tell the people who should know first",
  ln_faq: "Prepare the answers to the questions",
  ln_walk: "Walk the whole thing end to end",
  ln_freeze: "Freeze the changes",
  ln_go: "Launch",
  ln_watch: "Watch what happens",
  ln_listen: "Gather the first reactions",
  ln_fix: "Fix what came up",

  demoName: "September trade fair",
  demoBadge: "Example",
  demoStrip: "This is an example project: touch everything, change it, delete it. When you are done, throw it away.",
  demoDrop: "Throw the example away",
  demoDropped: "Example in the bin. The next project is yours.",
  welcomeTitle: "Welcome to Plan Scope",
  welcomeText: "Pages to write and deadlines to keep, in one place. “September trade fair” is an example, "
    + "already full, to see how it works: touch it, change it, and once you have got it throw it away.",
  welcomeNote: "Everything you write stays in this browser: the app sends nothing to anybody. For a copy on "
    + "disk there is “Export”.",
  welcomeExample: "See the example",
  welcomeOwn: "Start with yours",
  welcomeGuide: "Read the Guide",
  openGuide: "Guide",
  demoTag: "print",
  demoCheck1: "Tidy up the contact list",
  demoCheck2: "Write the wording of the invitation",
  demoPage: "How this app works",
  demoBody: "This project is already full so you can see how it fits together. **Throw it away "
    + "whenever you like**: at the bottom of the project screen there is “Move to the bin”.\n\n"
    + "## Three things worth knowing\n\n"
    + "1. What you write stays on this computer. There is no server for it to reach.\n"
    + "2. It saves itself, letter by letter. There is no save button.\n"
    + "3. What you throw away comes back: there is “Undo” on the strip, and then the bin.\n\n"
    + "> [!nota]\n> Press **/** on an empty line to add a heading, a list, a table. Or use the "
    + "**+** that appears beside every block.\n\n"
    + "## A list of things to do\n\n"
    + "- [x] Open the app\n- [ ] Write a couple of lines below\n- [ ] Open the plan and move a "
    + "card\n\n"
    + "## A table, if you need one\n\n"
    + "| Item | Planned | Spent |\n| --- | ---: | ---: |\n| Stand | 1,200 | 1,150 |\n"
    + "| Print | 300 | 340 |\n\n"
    + "---\n\nWhen you have finished looking, make your own: **Projects → New project**.\n",

  // counts
  projectOne: "1 project",
  projectMany: "{n} projects",
  pageOne: "1 page",
  pageMany: "{n} pages",
  taskOne: "1 task",
  taskMany: "{n} tasks",
  imageOne: "1 image",
  imageMany: "{n} images",
  dayOne: "1 day",
  dayMany: "{n} days",
};

configure({ it: IT, en: EN, key: "gg.plan-scope.lang" });
