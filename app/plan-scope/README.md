# Plan Scope — come si modifica

Questo file è per chi apre questa cartella senza averci mai lavorato, persona o modello che sia.
Dice **dove passano i confini**, **cosa non si può rompere** e **cosa toccare** per il tipo di
modifica che si fa più spesso.

Non ripete le regole del catalogo. Quelle stanno in `app/CLAUDE.md` e valgono qui senza eccezioni:
niente passo di build, niente richieste di rete dopo il caricamento, due lingue a runtime, due temi,
PWA installabile, export e import, anagrafica in `_src/apps.py`.

---

## Ordine di lettura, prima di scrivere una riga

1. `app/CLAUDE.md` — le regole del catalogo. È lungo: si legge l'indice e si aprono le sezioni che
   toccano la modifica in corso.
2. Questo file.
3. **Il commento in cima al modulo che si sta per toccare.** Ogni file di `run/` si apre con dieci-venti
   righe che dicono cosa fa, cosa deliberatamente non fa, e quale difetto ha già prodotto la scelta
   che ci si trova dentro. Sono la documentazione vera: qui sotto c'è la mappa, lì c'è il perché.

In questo programma il terzo passo pesa più che altrove, perché **metà delle decisioni sono cose che
l'app non fa**: niente grafo delle dipendenze, niente percorso critico, niente date che si
ricalcolano, niente streak, niente notifiche. Sono scelte argomentate nei commenti, non funzioni
mancanti da completare.

---

## Cos'è, e cosa non è

Progetti, pagine e scadenze in un posto solo, **interamente nel browser**: un archivio di progetti,
pagine scritte in Markdown con un editor a blocchi, attività su una bacheca, un calendario e una
linea del tempo, la rubrica, il cestino con annulla, le versioni di una pagina. Nessun server,
nessun account, i dati in IndexedDB.

Due persone lavorano allo stesso progetto **senza un server**: l'app scrive il progetto come file in
una cartella scelta dalla persona — dentro Dropbox, OneDrive o Drive — e il sistema operativo lo
porta all'altra, che lo legge e lo fonde. L'app non chiama nessuno.

**Non è** un gestore di progetti che mantiene un modello del piano al posto di chi lo usa. La persona per cui è
scritto tiene cinque eventi l'anno in un foglio di calcolo: quello che c'è è una colonna, una data e
le due o tre cose che si scrivono su un foglietto.

---

## La mappa, e i confini

`index.html` nella cartella dell'app **è generato da `build.py`**: non si tocca a mano. L'app vera è
`run/`, scritta a mano, `noindex`, fuori dalla sitemap.

### Le due metà, e il file che le tiene insieme

È la struttura da capire prima di tutto il resto:

- **`gg/plan-model.js`** sa cos'è un progetto, una pagina, un'attività — e **niente di un browser**.
  La persistenza gli arriva come porta, `connect({save, drop})`, detta nelle sue parole.
- **`db.js`** sa di IndexedDB e **niente di progetti**: store, indici, la coda di scrittura.
- **I due non si importano fra loro.** `app.js` è l'unico posto che conosce entrambi, e li presenta
  l'uno all'altro all'avvio.

`gg/plan-model.js` sta in `_lib/` perché lo usano due app: **Plan Scope e Invoice Scope**. Un progetto
esportato da una si apre nell'altra.

### Il nucleo: nessuno di questi file sa cosa sia un browser

Si provano sotto Node, e sono il posto giusto per una regola.

| File | Cosa decide | Il confine |
|---|---|---|
| `gg/plan-model.js` | progetti, pagine, attività, colonne, cestino, undo, ricerca, `uid` | condiviso con Invoice Scope |
| `gg/plan-markdown.js` | Markdown ↔ blocchi, `parse`/`serialize` come punto fisso | il testo è la verità, i blocchi sono la lettura |
| `gg/plan-pack.js` | un progetto che esce e rientra: lo zip con le immagini | |
| `vault.js` | un progetto come **cartella di file**: `project.json`, `pages/`, `assets/` | l'identità è l'`uid`, mai il nome del file |
| `diff.js` | cosa è cambiato fra due versioni, paragrafo per paragrafo | non disegna |
| `ics.js` · `csv.js` · `webpage.js` | calendario, foglio di calcolo, pagina HTML autosufficiente | puri: stringhe dentro, stringhe fuori |
| `importers.js` | una bacheca Trello, un export Notion → il payload che l'app già sa importare | non scrive niente |
| `templates.js` | i quattro modelli di partenza | **non contiene testo**: solo chiavi, le parole in `i18n.js` |
| `cheer.js` | i sei traguardi, e dove si ferma | niente streak, niente confronti, niente notifiche |

### Il deposito e le cartelle

| File | Cosa fa |
|---|---|
| `db.js` | schema, coda di scrittura, immagini una per volta e mai in blocco |
| `versions.js` | le istantanee di una pagina: ogni dieci minuti, trenta per pagina |
| `folders.js` | le cartelle «madri», e il conto dei permessi — un permesso vale per tutte le sottocartelle |
| `sync.js` | la cartella condivisa: scrive, rilegge, fonde |
| `backup.js` | la cartella locale: tutto l'archivio, testo in JSON e immagini accanto |
| `importing.js` | l'unica porta d'ingresso, con la conferma prima di scrivere |

Le due cartelle **non sono la stessa cosa**, ed è il punto: la condivisa tiene un progetto e lo
fonde, la locale tiene tutto e non fonde niente. Un progetto che sta in tutte e due ha due copie di
proposito.

### Le schermate

Undici, in `SCREENS` dentro `app.js`: `home`, `project`, `page`, `plan`, `pages`, `trash`, `awards`,
`folderScreen`, `rubrica`, `person`, `agendaScreen`. Il disegno sta in `home.js`, `plan.js`,
`timeline.js`, `agenda.js`, `pages.js`, `search.js`, `outputs.js`; i comandi tornano sempre in
`app.js`, passati una volta con `connect`. È quello che evita l'import circolare, ed è anche perché
ogni file di schermata si legge da solo.

### L'agenda, e il calendario d'insieme

**L'agenda è un progetto con `kind: "agenda"`**, creato da `ensureAgenda` alla prima cosa che ci
finisce dentro: una nota o un appuntamento con una persona che non lavora a nessun progetto, o un
appuntamento preso dal calendario d'insieme. È un progetto e non un secondo contenitore apposta,
così pagine, cestino, copie e cartelle condivise la trattano come tutto il resto.

Cambia soltanto **dove non compare**: `plainProjects()` la tiene fuori dalle schede dell'archivio,
dalle domande «in quale progetto?» e dai traguardi; le sue scadenze entrano invece nel pannello della
home. Chi scrive codice nuovo che elenca progetti deve scegliere fra i due: `liveProjects()` per i
dati — copie, ricerca, sincronizzazione — e `plainProjects()` per quello che una persona sceglie o
conta.

Il **calendario d'insieme** (`agenda.js`) chiede a `calendarBetween(da, a)` tutto quello che ha una
data in ogni progetto, e disegna un mese. **Non si trascina niente**: sono date di piani diversi, e
spostarne una lì vorrebbe dire ripianificare un progetto senza averlo davanti.

### Le schede dei progetti, in archivio

Una scheda parla anche senza date. Quello che mostra viene da `projectOverview` in
`gg/plan-model.js`, che non guarda il calendario: quante pagine, attività e incontri (gli incontri
non sono pagine), le colonne della bacheca con i loro conteggi — la barra ne disegna uno spezzone
per colonna —, l'attività aperta da riprendere (quella più avanti sulla bacheca), le pagine
preferite, l'ultima cosa toccata e le prime parole dell'ultima pagina (`excerptOf`). Il piede è
uguale su ogni scheda: l'ultima modifica, che si apre con un clic, e le persone.

Ordinamento (ultima modifica, scadenza, nome) e vista (schede, elenco) sono fatti di questo
browser: stanno in `localStorage` (`gg.plan-scope.homeSort`, `gg.plan-scope.homeView`), non nei
dati, e un progetto mandato a qualcuno non se li porta dietro.

### Le attività scritte dentro una pagina

Dal menù «/» dell'editore, «Attività del progetto» crea un'attività sulla bacheca e scrive nella
pagina una riga agganciata:

```
- [ ] Mandare il listino aggiornato [[#a7f3…]]
```

Le regole, che si rompono facilmente:

- **il gancio è il `uid`, non l'`id`**: l'`id` cambia a ogni importazione, il `uid` viaggia. Il
  rovescio è che un progetto importato due volte ha attività con lo stesso `uid`, quindi
  `taskByUid(uid, { projectId })` cerca **prima nel progetto della pagina**;
- **lo stato non si scrive nel file**: la pastiglia («apri», «fatta», «eliminata») la riempie
  `taskState` a ogni disegno. Nel file c'è solo la casella `[ ]`/`[x]`, che `_syncBoxes` rimette
  d'accordo con la bacheca quando la pagina si apre, quando la finestra torna in primo piano e quando
  un'altra scheda ha scritto;
- **Invio su una riga agganciata non la divide e non ne fa una copia**: la riga resta intera e sotto
  si apre un paragrafo vuoto, dividendo l'elenco se ci sono altre righe (`_splitAt`). Prima nasceva
  una casella semplice, senza attività dietro, che sembrava la riga di sopra e non lo era;
- **«Porta le caselle nel piano» salta le righe agganciate**, che un'attività ce l'hanno già;
- la voce del menù compare **solo dove l'app ospite passa `newTask`**: Invoice Scope monta lo stesso
  editore e non la mostra.

### La testa di un incontro

Una pagina con `tipo: incontro` e una data valida mostra le sue proprietà **chiuse**: l'occhiello sopra
il titolo dice cosa è, quando, con chi e — per una nota — com'è avvenuta («Telefonata del 23 set»);
la riga sotto i tag porta il posto, cliccabile, e «Modifica i dettagli». Le righe `chiave: valore`
restano nel riquadro, nascoste e non tolte (`_fold` in `pages.js`), perché `_readProps` rilegge ogni
riga del riquadro: toglierle dal DOM le toglierebbe dal file al primo salvataggio. **Il Markdown non
cambia**: cambia soltanto quello che se ne mostra.

### Le note di una persona

`notes` sta sulla scheda in rubrica, testo libero. Non viaggia con un progetto condiviso, e non per
un filtro: `travelling` costruisce campo per campo quello che esce, e le note non sono fra quei campi.
La ricerca le legge e ne mostra le parole trovate; il CSV della rubrica le mette nell'ultima colonna,
la vCard nella `NOTE`, davanti ai progetti.

### Una riga vuota in fondo, sempre

L'editore tiene un paragrafo vuoto in fondo al documento (`_keepTail`, chiamato da `load` e da
`_apply`), qualunque cosa sia stata inserita per ultima: una tabella, un'attività, un'immagine. Nel
file non c'è — `serialize` non scrive i paragrafi vuoti in fondo — quindi ricompare a ogni apertura.

Le righe vuote **in mezzo** al testo si salvano come `&nbsp;` su una riga sua (`BLANK_LINE` in
`gg/plan-markdown.js`): il Markdown legge qualunque serie di righe vuote come un separatore solo, e
senza un segno la riga spariva alla riapertura. `&nbsp;` è quello che Obsidian e ogni visualizzatore
mostrano come una riga vuota, e `parse` lo rilegge come un paragrafo vuoto.

`ui.js` tiene i pezzi piccoli: la striscia che offre di annullare, le date, le misure.

### La libreria condivisa

Passa dalla import map (`gg/` → `../../_lib/`), mai da un import relativo. Questa app usa
`store.js`, `io.js`, `zip.js`, `dom.js`, `folder.js`, `theme.js`, `install.js`, `update.js`, e —
insieme a Invoice Scope — `plan-model.js`, `plan-markdown.js`, `plan-editor.js`, `plan-pack.js`.

> **Toccare `_lib/plan-*.js` tocca anche Invoice Scope.** Sono lo stesso file, e ogni service worker
> se lo mette nella propria cache. Una modifica lì obbliga a girare la versione di **entrambe** le
> app: `check_apps.py` non se ne accorge, è una regola umana (`app/CLAUDE.md`, «Toccare `_lib/`…»).

---

## Le otto cose che non si rompono

1. **`model.js` non conosce il browser, `db.js` non conosce i progetti.** Se ci si trova a importare
   l'uno dall'altro, la cosa che si sta scrivendo va in `app.js` o in un file suo.
2. **Niente si scrive da un bottone.** Ogni modifica entra nel modello, che disegna subito e accoda
   la scrittura dietro di sé. L'indicatore dice «Salvato» quando la coda è vuota, ed è l'unica cosa
   che l'app afferma sul disco.
3. **La coda si svuota quando la pagina viene nascosta.** È quello che rende vero «chiudere il
   browser non perde niente» su un telefono, dove `beforeunload` non arriva mai.
4. **Il Markdown è la verità, i blocchi sono la lettura.** Al contrario il file esportato sarebbe una
   *traduzione*, e una traduzione può perdere qualcosa senza dirlo.
5. **L'identità è l'`uid`, mai il nome del file.** Una pagina rinominata a mano è la stessa pagina;
   una pagina scritta in Obsidian senza id ne prende uno alla prima lettura.
6. **Le immagini non si leggono mai in blocco.** Una lettura di store è tutto-o-niente: `list()` sugli
   assets tirerebbe in memoria ogni immagine di ogni progetto per mostrarne una. Si prendono per
   chiave, una alla volta. Per la stessa ragione il testo va in JSON e le immagini accanto, in
   `assets/`: trenta copie datate condividono un solo insieme di figure.
7. **«Sei sicuro?» non si chiede.** Chiede di prevedere una conseguenza che non si è ancora vista, e
   la risposta è sempre sì. Si fa la cosa e si offre di annullarla (`ui.js`). Restano due domande
   vere, ed è perché non si possono annullare: svuotare il cestino, togliere una cartella condivisa.
8. **Nessuna richiesta di rete**, con l'unica eccezione dichiarata nella scheda: `gg/update.js` fa
   rileggere `sw.js`. La cartella condivisa è del sistema operativo, e il trasporto pure.

E una che non è tecnica ma vale come le altre: **dove ci si trova sta nell'URL.** Ricaricare riporta lì, e
il tasto «indietro» fa la cosa che sembra fare — che conta il doppio una volta installata, dove quel
tasto non c'è.

---

## Le prove

Girano con Node, dalla radice del repository, e stanno **fuori da `run/`** perché `check_apps.py`
esige che ogni file dentro `run/` sia nell'elenco di precache. Il modello, il formato e l'editor
stanno in `_lib/`, quindi ogni prova passa dal loader.

```bash
P="--import ./app/plan-scope/test/loader.mjs"
node $P app/plan-scope/test/markdown.mjs    # parse e serialize sono un punto fisso, escape compreso
node $P app/plan-scope/test/model.mjs       # cestino, undo, date, importazione, ricerca, rubrica
node $P app/plan-scope/test/templates.mjs   # i quattro modelli e il dimostrativo, nelle due lingue
node $P app/plan-scope/test/cheer.mjs       # i traguardi: quando scattano, e una volta sola
node $P app/plan-scope/test/exchange.mjs    # calendario .ics, CSV, pagina web autosufficiente
node $P app/plan-scope/test/diff.mjs        # le differenze fra due versioni, paragrafo per paragrafo
node $P app/plan-scope/test/sync.mjs        # due persone, una cartella: conflitti, cestino, ritardi
node $P app/plan-scope/test/backup.mjs      # la cartella locale: le immagini accanto al testo
node $P app/plan-scope/test/editor.mjs      # l'editor senza browser
node $P app/plan-scope/test/pack.mjs        # export → import identico, immagini e CRC compresi
node $P app/plan-scope/test/importers.mjs   # una bacheca Trello e un export Notion come progetto
node $P app/plan-scope/test/vault.mjs       # un progetto come cartella di file, e ritorno
node $P app/plan-scope/test/folders.mjs     # le cartelle madri, e il conto dei permessi
node $P app/plan-scope/test/glance.mjs      # il colore e la data che le liste mostrano
```

Quattro pezzi di impalcatura: `test/fake-db.mjs`, `test/fake-folder.mjs`, `test/fake-archive.mjs` e `test/dom.mjs`, che non sono prove e non si lanciano. Una
schermata si prova sopra un DOM finto, non aprendo la pagina.

---

## Ricette

| Per | Si tocca | E poi |
|---|---|---|
| un campo nuovo su progetto, pagina o attività | `gg/plan-model.js` | **è condiviso con Invoice Scope**: si gira la versione di tutte e due |
| una vista nuova del piano | un file accanto a `plan.js`/`timeline.js`, che legge le stesse attività | non una seconda copia dei dati: non c'è niente da sincronizzare |
| un formato in ingresso | una funzione in `importers.js` che restituisce `{project, pages, tasks, assets}` | da lì in poi è codice che esiste già ed è già provato |
| un formato in uscita | un modulo puro (come `ics.js`), più una riga in `outputs.js` | `test/exchange.mjs` |
| qualcosa nel file Markdown di una pagina | `gg/plan-markdown.js` | `parse(serialize(x)) == x` deve restare vero |
| qualcosa nella cartella condivisa | `vault.js` per il formato, `sync.js` per la fusione | una cartella scritta da una versione vecchia deve restare leggibile |
| un traguardo | `cheer.js` | prima si legge cosa quel file tiene fuori, e perché — gli incontri non sono pagine scritte, l'agenda non è un progetto |
| un elenco di progetti da mostrare o da contare | `plainProjects()`, non `liveProjects()` | l'agenda sta nella seconda e non nella prima |
| una parola | `i18n.js`, **entrambe le lingue nella stessa modifica**, una chiave per riga | `check_apps.py` legge il file con una espressione regolare |
| un file nuovo in `run/` | il file + l'elenco `ASSETS` in `sw.js` | e si gira la versione |

**Ogni file nuovo comincia con l'intestazione di licenza** (`// Copyright 2026 G&G Technologies
S.r.l. — SPDX-License-Identifier: Apache-2.0`) e con il commento che dice perché esiste.

---

## Prima di chiudere

- [ ] **Versione girata** in `sw.js`: è l'unico meccanismo di aggiornamento che l'app ha. Numero
      fermo e contenuto cambiato significa che chi ha già aperto l'app continua a ricevere la copia
      vecchia, senza errori e per sempre. `_check_version_moved` lo verifica
- [ ] `ASSETS` in `sw.js` elenca esattamente quello che l'app importa, `_lib/` compreso
- [ ] Le chiavi italiane e inglesi di `i18n.js` coincidono, una per riga
- [ ] `python3 _src/check_apps.py` passa; se si è toccata la scheda, anche `build.py` e `check_site.py`
- [ ] Le prove sopra passano — in particolare `markdown`, `model`, `pack` e `vault` se si sono toccati il
      testo, il modello o quello che esce
- [ ] Il giro completo funziona: esportare e reimportare restituisce la stessa cosa
- [ ] Provata **davvero**: nelle due lingue, nei due temi (con il chiaro impostato *prima* di
      aprirla), installata in finestra `standalone`, e su un telefono vero
- [ ] Nessuna richiesta di rete nel pannello di rete, a scheda aperta
- [ ] Se si è toccato `_lib/`: girata anche la versione di **Invoice Scope**

La lista completa, con le voci che riguardano la scheda e il sito, è in «Prima di pubblicare un'app»
dentro `app/CLAUDE.md`.
