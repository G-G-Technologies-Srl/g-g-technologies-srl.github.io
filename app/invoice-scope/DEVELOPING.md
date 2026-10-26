# Invoice Scope — guida per chi modifica il codice

Chi cerca cos'è l'app, come si prova e a quali condizioni se ne usa il codice legge il
[README](README.md). Questo file è per chi apre questa cartella per cambiarla, persona o modello che sia.
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
3. **Il commento in cima al modulo che stai per toccare.** Ogni file di `run/` si apre con dieci-venti
   righe che dicono cosa fa, cosa deliberatamente non fa, e quale difetto ha già prodotto la scelta
   che ci trovi dentro. Sono la documentazione vera: qui sotto c'è la mappa, lì c'è il perché.

Nessuno di questi tre passi è facoltativo. Le decisioni di questo programma sono quasi tutte
**pagate** — esistono perché una versione precedente aveva sbagliato — e riscriverle senza leggere
il commento significa ripagarle.

---

## Cos'è, e cosa non è

Fatturazione elettronica per una piccola impresa, **interamente nel browser**: documenti emessi,
clienti, listino, progetti, incassi, acquisti, scadenzario, e l'XML FatturaPA in uscita e in
ingresso. Nessun server, nessun account, i dati in IndexedDB e l'archivio in una cartella scelta
dalla persona.

**Non è** contabilità in partita doppia: niente piano dei conti, niente prima nota, niente bilancio.
`run/costs.js` lo scrive in cima e vale per tutto il programma — quello che c'è è il registro di
quanto si è speso e di quando va pagato, non il libro giornale.

---

## La mappa, e i confini

`index.html` nella cartella dell'app **è generato da `build.py`**: non si tocca a mano. L'app vera è
`run/`, scritta a mano, `noindex`, fuori dalla sitemap.

### Il nucleo: nessuno di questi file sa cosa sia un browser

Si provano sotto Node, e sono il posto giusto per una regola.

| File | Cosa decide | Il confine |
|---|---|---|
| `decimal.js` | l'aritmetica esatta, `BigInt` scalato a 8 decimali | non formatta e non legge: stringhe e BigInt |
| `totals.js` | righe → totali, **nell'ordine di arrotondamento che concorda con l'SdI** | non conosce documenti, solo righe |
| `model.js` | le regole di un documento, e quelle irreversibili: emissione, numerazione, stati | non disegna, non valida il tracciato |
| `kinds.js` | cosa cambia fra i cinque tipi: preventivo, DDT, fattura (TD01), fattura differita (TD24), nota di credito (TD04) — e la **sequenza** da cui esce il numero di ciascuno | è una tabella: cinque tipi, una riga per tipo |
| `validate.js` | se un documento può uscire | **non ha parole**: restituisce chiavi, mai frasi |
| `schedule.js` | cosa è dovuto e quando — derivato, mai salvato; e se un documento è saldato (`ledger`, `settlementOf`) | non incassa: legge |
| `recurring.js` | le ricorrenze e gli acquisti attesi | un atteso è calcolato, non scritto in nessuno store |
| `fatturapa.js` · `xml.js` | il documento come file FatturaPA | `xml.js` emette coppie ordinate, non oggetti |
| `xmlread.js` · `reading.js` | l'XML **scritto da altri**, e i documenti che ne escono | prefissi ignorati, totali ricalcolati |
| `sheet.js` · `xls.js` · `fic.js` · `parse.js` | i formati in ingresso: `.xlsx`, il `.xls` del 1997, le tre esportazioni di Fatture in Cloud | nessuno di loro scrive nel deposito |
| `format.js` | numeri e date come una persona li legge e li scrive; `days(n)` per «1 giorno», «5 giorni» | l'unico posto che formatta, in tutta l'app |
| `day.js` | **oggi**, sul calendario locale (`currentDay`, `isoDay`) | senza import: lo usano anche i moduli puri |
| `csv.js` · `statement.js` | un CSV in righe (separatore e codifica indovinati), e l'estratto conto in movimenti abbinati alle fatture aperte | si abbina solo quando è sicuro: importo dovuto e fattura unica, o nominata dalla causale |
| `safety.js` | se l'unica copia è al sicuro, e cosa dirne nella Situazione | conosce lo stato della cartella, non il DOM |
| `archive.js` | cosa tiene una copia della cartella, e in che cosa differisce da adesso | conta i record, non li legge |
| `bundle.js` | l'archivio con i suoi file: il JSON più `assets/` e `ricevute/`, in uno zip, e il ritorno | la forma è quella della cartella di backup, e `backup.js` prende da qui payload e manifest |
| `attachments.js` | la ricevuta di un pagamento: i byte in `attachments`, l'etichetta `ricevuta` sul pagamento | il deposito lo legge dal pagamento (`docId` o `costId`), non da chi chiama |
| `address.js` | l'intestatario in righe: indirizzo, COE o partita IVA, recapito elettronico | le stesse righe per la carta e per la schermata, o divergono |
| `problems.js` | le chiavi di `validate.js` come frasi | un passo dal dialogo, e niente altro |

### Il deposito

`db.js` è l'unico che conosce la forma dello schema: diciassette store (schema 8), e **ogni versione dichiara lo
schema intero**, mai la differenza dalla precedente. L'indice unico `numero_unico` su `docs` si crea
qui, sulla transazione grezza, perché `gg/store.js` crea solo indici non unici.

`memory.js` è un deposito in memoria che parla come IndexedDB, e serve a una cosa sola: `?demo=1`.
Quello che un visitatore apre per curiosità non finisce insieme alle sue fatture.

### Le schermate

Otto rotte fisse più quattro con un parametro, tutte a hash (`app.js`): in finestra installata non
c'è il tasto «indietro» del browser, e la via del ritorno deve stare nell'app.

| File | Schermata |
|---|---|
| `home.js` | la Situazione: i quattro numeri, le scadenze, il fatturato per mese, gli incontri della settimana (`meetingRows`), progetti e preventivi in attesa |
| `doc.js` | il documento, le sue righe, il riepilogo IVA sempre in vista |
| `due.js` · `payments.js` · `states.js` | scadenzario, incassi, il controllo che cambia stato. `editPayment` riapre il foglio dell'incasso su uno registrato (importo, giorno, conto, nota, ricevuta sostituita o tolta); `receiptCell` è la cella della ricevuta di ogni elenco di pagamenti: nome che la apre, freccia che la scarica, croce che la toglie, «Allega» se manca |
| `income.js` | Scadenzario › Incassi (`#/scadenzario/incassi`) e › Pagamenti (`#/scadenzario/pagamenti`): una schermata, due versi (`VERSI`). Tutti gli incassi o tutti i pagamenti ai fornitori, filtrati per anno, soggetto e ricevuta sì/no; i conti li fanno `incomeRows` e `outlayRows` in `schedule.js`, la correzione `updatePayment` / `updateOutlay` (`costs.js`) dai fogli `editPayment` / `editOutlay` |
| `parties.js` · `customer.js` · `crm.js` | clienti (`render`) e listino (`renderItems`), la scheda cliente, le persone e il diario; nel foglio del soggetto la natura predefinita con le adatte in cima (`_fillNatura`, regola 21) |
| `banks.js` | Anagrafiche › Banche: i conti dell'azienda, che restano `conti` nel record `company` — sei file li leggono da lì; la schermata del conto con i suoi movimenti (`movements`, `#/anagrafiche/banche/<id>`); `bankFields`, i dati della banca che una bozza copia accanto all'IBAN |
| `meetings.js` | il CRM: gli incontri di tutti i clienti, che sono voci del diario con `ora`, `luogo`, `persone`, `esito`; i gruppi li decide `agenda` in `crm.js`. Le stesse righe, senza la colonna del cliente, nella sezione «Incontri» della scheda cliente (`renderParty`, ridisegnata da `_drawDiary`: sono le stesse voci); `showParty` filtra il CRM prima di andarci |
| `alarms.js` | i promemoria: le scadenze dei due versi e gli incontri in programma, nel digest del service worker e nel file `.ics` |
| `projects.js` · `project.js` | i progetti e le fasi, con il modello condiviso di Plan Scope |
| `purchases.js` · `costs.js` · `expected.js` | gli acquisti, i loro conti, gli attesi |
| `importing.js` | l'importazione da un altro programma: `plan` legge e decide, `apply` scrive |
| `print.js` · `brand.js` | il foglio stampato, e il logo di cortesia |
| `timeline.js` | lo scadenzario come figura |
| `ask.js` | l'unico dialogo con cui questa app fa domande |

Nelle schermate **non si calcola**. `doc.js` lo dichiara in cima e vale per tutte: l'aritmetica è
`totals.js`, le regole sono `model.js`, i controlli sono `validate.js`. Una schermata legge campi e
disegna risultati.

### I progetti: elenco, archivio, cestino

L'elenco mostra `openProjects()` — cioè `plainProjects()` del modello, con quelli in evidenza in
cima — e non tutti i progetti vivi. **I conti invece usano `projects()`**, che tiene anche gli
archiviati: un lavoro concluso con una fase ancora da fatturare resta nel «da fatturare» della
Situazione, mentre esce dai ritardi (`projectRows`). L'agenda di Plan Scope non è un lavoro, e
resta fuori da tutti e due.

Pagine, fasi e progetti **si eliminano senza domande**: vanno nel cestino del modello, la striscia
di `snack.js` offre «Annulla» con il passo che il modello ha restituito (`undoStep`, mai `undo`), e
sotto l'elenco «Cestino · n» li riporta indietro per trenta giorni. Le domande di `ask.js` restano
per quello che non si annulla. Archiviare chiede solo se sul progetto resta denaro aperto
(`openMoney`).

I modelli di pagina sono `PAGE_TEMPLATES` in `project.js`, diversi da quelli di Plan Scope: le due
app condividono modello ed editore, non il tipo di lavoro. Con «@» si nominano le persone di
riferimento del cliente del progetto; il nome porta alla scheda del cliente.

### Le due librerie

Passano dalla import map, mai da un import relativo, e hanno due licenze diverse:

- **`gg/` → `app/_lib/`**, Apache-2.0, comune a tutte le app: `store.js`, `io.js`, `dom.js`,
  `i18n.js`, `theme.js`, `install.js`, `update.js`;
- **`biz/` → `app/_business/`**, PolyForm Shield 1.0.0 come l'app, comune alle app gestionali:
  `plan-model.js`, `plan-markdown.js`, `plan-editor.js`, `plan-pack.js`, `zip.js`, `folder.js`,
  `ics.js`, `remind.js`.

> **Toccare `_business/plan-*.js` tocca anche Plan Scope.** Sono lo stesso file, e ogni service
> worker se lo mette nella propria cache. Una modifica lì obbliga a girare la versione di **entrambe**
> le app: `check_apps.py` non se ne accorge, è una regola umana (`app/CLAUDE.md`).

---

## Le ventidue cose che non si rompono

1. **Nessun importo passa da un float.** `0.1 + 0.2` su una fattura non è una curiosità, è un numero
   sbagliato depositato all'Agenzia. Tutto passa da `decimal.js`, che sta a otto decimali perché il
   tracciato ne ammette otto su `PrezzoUnitario` e `Quantita`.
2. **L'ordine degli arrotondamenti in `totals.js` non è negoziabile**: riga, riepilogo, imposta
   (sul riepilogo, mai per riga), documento. Cambiarlo significa un file che l'SdI rifiuta.
3. **Il contatore è un record e sale soltanto.** `max() + 1` sembra equivalente e non lo è: si
   cancella l'ultima fattura di dicembre e la numerazione torna indietro. Un documento emesso non si
   rinumera: si riapre (`modify`, punto 20) e torna fuori con lo stesso numero.
   **E il contatore è per sequenza, non per tipo** (`counterKey` in `db.js`, `sequenza` in
   `kinds.js`): una fattura differita è una fattura e sta nella stessa sequenza, una nota di credito
   ha la sua e lo dichiara con la sigla «NC». Con un contatore per tipo uscivano tutte e tre come
   «2026/0001» — il deposito le accettava, perché la chiave unica contiene il tipo, e per il cliente
   erano tre documenti con lo stesso numero. Chi tocca la numerazione guarda anche
   `legacyCounterKeys`: un archivio scritto prima delle sequenze ha un contatore per tipo, e
   ripartire da uno vuol dire riusare numeri già in mano a qualcuno.
4. **`validate.js` resta senza parole.** Il giorno in cui importa un dizionario importa anche una
   lingua corrente, che è roba da schermata. Chiavi fuori, frasi in `problems.js`.
5. **Saldato non è uno stato.** Gli stati dicono dov'è il documento rispetto al Sistema di
   Interscambio — emesso, inviato, accettato, scartato — e i soldi sono un altro asse: una fattura
   accettata e mai pagata è la normalità, una pagata e poi scartata succede. Quanto resta è la somma
   degli incassi, chiesta a `schedule.js` e mai scritta sul documento: scritta, un incasso cancellato
   per sbaglio lascerebbe «saldata» per sempre — che è il difetto che il registro importato da un
   altro programma portava con sé.
6. **Le differenze fra tipi stanno in `kinds.js`.** Allargare una lista alla volta in `schedule.js` o
   in `validate.js` produce un preventivo accettato che compare nello scadenzario: è già successo.
7. **Niente `confirm()` e niente `alert()`.** Li rifiuta `check_apps.py`, e su iOS in finestra
   installata alcuni non compaiono affatto — su un'app di fatturazione vuol dire una conferma che
   nessuno vede prima che un numero sia assegnato per sempre. Si usa `ask.js`.
8. **Quello che sta solo qui va detto.** Senza server la copia è una, e questa è l'app in cui
   perderla costa di più. Tre stati sembrano «cartella collegata» e non scrivono niente —
   trattenuta, permesso scaduto, ultima scrittura fallita — e si dicono sempre, anche con un
   documento solo (`safety.js`). Dove la cartella non esiste (Firefox, Safari, telefono) il
   promemoria dell'archivio a mano **torna**: vale finché il lavoro fatto dopo non è al sicuro, non
   una volta sola. E il ripristino passa da `gg/io.js`, che valida il file intero prima di scrivere
   un record: mezzo ripristino è l'unico esito senza ritorno.
9. **Nessuna richiesta di rete a app aperta**, con l'unica eccezione dichiarata nella scheda:
   `gg/update.js` fa rileggere `sw.js`. Una seconda chiamata va scritta nella scheda **prima** che
   nel codice.
10. **Una ricevuta esce in tre modi, e nessuno dei tre si perde.** La cartella di copia la scrive in
    `ricevute/`, lo zip «Esporta tutto, con ricevute e immagini» la porta dentro, l'archivio JSON ne
    porta solo l'etichetta. Chi cancella un pagamento — `removePayment`, `removeOutlay`, `removeCost`
    — chiama `forget` di `attachments.js` **nella stessa transazione**; la zona di cancellazione
    chiama `sweep`, perché `clear()` svuota uno store senza guardare chi lo nominava.
11. **Quello che esce nell'XML si congela sulla bozza.** Banca, ABI, CAB e BIC accanto all'IBAN si
    copiano sul documento al salvataggio (`bankFields`), come l'IBAN; `fatturapa.js` scrive quello
    che il documento porta e non rilegge i conti. Un conto rinominato l'anno dopo non deve cambiare un
    file che qualcuno ha già ricevuto. L'ordine dei campi nel `DettaglioPagamento` è quello dello
    schema — `IstitutoFinanziario` prima dell'IBAN, `ABI`, `CAB`, `BIC` dopo — e il campione
    `14-dati-della-banca` lo mette davanti allo schema vero.
12. **Il voi vale per pronomi, possessivi e verbi all'indicativo; l'imperativo resta singolare.**
    È la decisione del 22 settembre 2026, scritta in `app/CLAUDE.md` (§ *Voce*): «Esporta tutto»,
    «Scrivi la via.», «Scegli un cliente, o compila i dati dell'azienda» vanno bene; «paghi
    l'imposta», «finché non la togli», «se lo addebiti», «Chi sei» no. Il 13 ottobre 2026 una
    revisione ha portato al voi una cinquantina di imperativi e la decisione ha detto di no: sono
    tornati com'erano. Prima di «correggere» un imperativo, rileggere quella sezione.
13. **«Oggi» si chiede a `day.js`, mai a `toISOString()`.** `new Date().toISOString().slice(0, 10)`
    è la data di Greenwich: fra mezzanotte e l'una (le due d'estate) in Italia è ancora ieri, e una
    bozza aperta alle 00:30 del primo gennaio usciva datata e numerata nell'anno vecchio. La review
    del 13 ottobre 2026 ne ha trovati quaranta; ne resta solo il calcolo sulle date già in UTC
    (`Date.UTC(...)`), che è coerente con sé stesso. Un timestamp (`created`, `updated`) resta ISO.
14. **Una riga del file deve tornare al controllo 00423.** `PrezzoTotale` = [`PrezzoUnitario` −
    sconti della riga] × `Quantita`: per questo la quota dello sconto sul documento che `totals.js`
    toglie da una riga esce su quella riga come `ScontoMaggiorazione` per unità (`_shareOf` in
    `fatturapa.js`). Toglierla dal totale senza scriverla era un file scartato. Stessa famiglia: con
    `DatiRitenuta` almeno una riga dice `<Ritenuta>SI</Ritenuta>` (00411) — quelle che non sono N1,
    `soggettaRitenuta` in `totals.js` — e `ImportoTotaleDocumento` è **prima** della ritenuta
    (`totaleDocumento`), che esce solo dall'`ImportoPagamento`.
15. **Una nota nomina la fattura per id.** `creditNote` scrive `{ id, numero, data }` con il numero
    per esteso; `schedule.js` cerca per id, poi per numero stampato, poi per numero e data. Una nota
    che nomina più fatture si divide fra loro, ciascuna fino al suo totale. E un cliente nominato da
    un documento non si elimina (`partyUses` in `crm.js`): il documento porta solo l'id.
16. **Il ripristino è tutto o niente.** `gg/io.js` scrive tutti gli store in una transazione sola
    (`replaceStores` in `gg/store.js`); dopo, `_afterRestore` in `app.js` ricarica i progetti,
    spazza le ricevute orfane e rifà i promemoria — le stesse tre cose di `_reset`. Una via nuova per
    rimettere un archivio passa da lì.
17. **Un documento emesso legge il cliente e l'azienda com'erano.** `issue` scrive `cliente` ed
    `emittente` (`snapshot` in `fatturapa.js`, senza contatti, logo, conti e date); `build`, la stampa,
    la scheda e `validate` passano da `frozen(doc, { company, party })`. Un documento emesso prima
    non ha la copia e rilegge l'anagrafica, com'è sempre stato: nessuna migrazione.
18. **PA, cassa e scissione stanno nel tracciato, non accanto.** Il profilo `IT_PA` (FPA12, codice
    ufficio di sei caratteri) si sceglie in `profileFor` da `party.pa`; la cassa è una pseudo-riga del
    riepilogo in `totals.js` (tolta dalle righe dopo il calcolo) e `DatiCassaPrevidenziale` dopo
    `DatiBollo`; l'esigibilità `S` toglie l'imposta da `totale` (`impostaScissa`) ma non da
    `totaleDocumento`. E `DatiPagamento` ha sempre almeno un `DettaglioPagamento`: lo schermo salva
    `rate: []`, e un elenco vuoto non è «nessun pagamento». Verso la PA il file va firmato fuori
    dall'app: lo dicono i messaggi dopo l'emissione e dopo lo scarico (`docIssuedNextPa`,
    `docXmlDonePa`). `creditNote` copia `cassa`, `esigibilita` e `ordine` anche quando sono `null`
    (una risposta, non un vuoto); una bozza senza la chiave (`undefined`, come quella nata da una
    conversione) prende in `open` la cassa dell'azienda e la scissione del cliente. `reading.js`
    legge esigibilità, ordine, `<Ritenuta>SI</Ritenuta>` per riga e, da un FPA12, il cliente PA.
19. **Autofattura e integrazioni non sono ricavi.** `kinds.js` ha `ricavo` accanto a `fiscale`: il
    fatturato (Situazione, cliente, progetto) legge `ricavo`, il CSV del commercialista e i
    controlli leggono `fiscale`. TD16–TD19 sono `autofattura` (ruoli invertiti in `fatturapa.js`) e
    `integrazione`: serie e contatore «INT», solo sul canale italiano (`IT_SDI.tipi`), termine il 15
    del mese dopo (`terms.integrazione`, contato dalla data della fattura del fornitore), IVA nei
    due registri in `taxBalance` (il forfettario non detrae). La proposta nasce da `daIntegrare`
    in `costs.js` sugli acquisti con `inversione`; cancellare la bozza la ridà (`releasePurchase`).
20. **Riaprire un emesso non tocca il contatore.** `modify` in `model.js` rimette il documento in
    bozza **con il suo numero** e scrive in `riaperta` stato, esportato e la chiave del contatore
    (`counterKey`); `issue` vede `riaperta` + `numero`, salta il contatore e rifiuta se la serie o
    l'anno sono cambiati — per questo il tipo resta bloccato finché la bozza è riaperta. Una bozza con
    numero non si scarta (`discard`) e non si cancella dall'elenco: si riemette. L'avviso cambia con
    lo stato (`docModifyAskSent` dopo l'invio: lì la strada è la nota di credito). `duplicate` fa una
    bozza nuova, senza numero, con righe, condizioni e rate (date vuote). La **proforma** è un tipo
    in `kinds.js` (`fiscale:false`, serie «PF», sequenza sua, `converteIn:"TD01"`): non entra nel
    fatturato né nello scadenzario, e «Crea la fattura» la converte come un preventivo. Le azioni di
    ogni riga dell'elenco stanno in un `select` (`_rowActions`/`_rowAction` in `app.js`); «Scarica
    l'XML» apre il documento e passa da `queueAction` di `doc.js`, così il file esce dalla stessa
    strada dello schermo. Il piede della stampa e il termine di trasmissione leggono
    `trasmissioneElettronica` di `fatturapa.js`: sul canale interno sammarinese dipende da
    `company.feInterna` («auto» = obbligo dal `INTERNA_OBBLIGATORIA_DAL`, 1° gennaio 2027); senza
    trasmissione il foglio è l'originale (`printFooterCartaceo`) e nessun termine compare.
21. **Le nature suggerite sono un suggerimento, in un posto solo.** `natureSuggerite(da, a)` in
    `fatturapa.js` dice quali nature si addicono a due paesi (zone di `zonaIva`: IT, SM, UE, EXTRA)
    nel verso della fattura; la usano il menù della natura predefinita nella scheda del soggetto
    (`_fillNatura` in `parties.js`: un fornitore emette verso l'azienda, quindi il verso si gira) e
    quello di ogni riga del documento (`_natureGroups` in `doc.js`, opzione `gruppi` di `_cell`:
    sull'autofattura il verso è fornitore → azienda). Le adatte stanno in un `<optgroup>` in cima,
    tutte le altre sotto: **non si tolgono**, perché la natura dipende anche dall'operazione. Un
    colore sulle opzioni non si vede nei menù di sistema (Mac), un gruppo con il titolo sì. Le regole
    vere — una natura sola per canale sammarinese — restano in `nature` dei profili e in
    `validate.js`. E **un menù non è mai più largo del suo contenitore** (`select { max-width: 100% }`
    in `styles.css`): un `<select>` prende la larghezza dell'opzione più lunga, e «Dal listino» con
    una descrizione lunga usciva dalla finestra; i menù nelle intestazioni hanno il loro tetto
    (`.head-tools select`).
22. **Chi trasmette lo dice `trasmittente`, e il nome del file lo segue.** `trasmittente(company,
    profile)` in `fatturapa.js` è l'unico posto che risponde: il trasmittente fisso del profilo
    (l'Ufficio Tributario verso l'Italia, `96428100588`), oppure l'azienda — oppure, solo sul canale
    interno sammarinese, l'intermediario (`company.coeIntermediario`, Documento A §2.1.1). `fileName`
    usa lo stesso codice per l'interna con intermediario, perché il codice nel nome identifica il
    trasmittente (§1.2.1); verso l'Italia il nome tiene il COE dell'azienda. Il progressivo resta
    quello dell'azienda. `validate.js` rifiuta un COE dell'intermediario che non sia di cinque cifre
    al massimo (`vCoeIntermediario`).

---

## Le prove

Girano con Node, dalla radice del repository, e stanno **fuori da `run/`** perché `check_apps.py`
esige che ogni file dentro `run/` sia nell'elenco di precache.

```bash
# Foglie: girano da sole.
node app/invoice-scope/test/fic.mjs
node app/invoice-scope/test/xmlread.mjs
node app/invoice-scope/test/parse.mjs

# Tutte le altre passano da `gg/` o da `biz/`, quindi vogliono il loader.
I="--import ./app/invoice-scope/test/loader.mjs"
node $I app/invoice-scope/test/decimal.mjs   node $I app/invoice-scope/test/totals.mjs
node $I app/invoice-scope/test/model.mjs     node $I app/invoice-scope/test/validate.mjs
node $I app/invoice-scope/test/kinds.mjs     node $I app/invoice-scope/test/schedule.mjs
node $I app/invoice-scope/test/fatturapa.mjs node $I app/invoice-scope/test/reading.mjs
node $I app/invoice-scope/test/format.mjs    node $I app/invoice-scope/test/sheet.mjs
node $I app/invoice-scope/test/xls.mjs       node $I app/invoice-scope/test/importing.mjs
node $I app/invoice-scope/test/backup.mjs    node $I app/invoice-scope/test/update.mjs
node $I app/invoice-scope/test/install.mjs   node $I app/invoice-scope/test/memory.mjs
node $I app/invoice-scope/test/crm.mjs       node $I app/invoice-scope/test/customer.mjs
node $I app/invoice-scope/test/projects.mjs  node $I app/invoice-scope/test/project.mjs
node $I app/invoice-scope/test/home.mjs      node $I app/invoice-scope/test/reset.mjs
node $I app/invoice-scope/test/costs.mjs     node $I app/invoice-scope/test/purchases.mjs
node $I app/invoice-scope/test/recurring.mjs node $I app/invoice-scope/test/problems.mjs
node $I app/invoice-scope/test/address.mjs   node $I app/invoice-scope/test/restore.mjs
node $I app/invoice-scope/test/safety.mjs    node $I app/invoice-scope/test/archive.mjs
node $I app/invoice-scope/test/timeline.mjs    node $I app/invoice-scope/test/attachments.mjs
node $I app/invoice-scope/test/banks.mjs       node $I app/invoice-scope/test/meetings.mjs
node $I app/invoice-scope/test/bundle.mjs      node $I app/invoice-scope/test/alarms.mjs
node $I app/invoice-scope/test/income.mjs
```

**Una prova non legge l'orologio.** Se quello che prova dipende da oggi — gli attesi delle
ricorrenze partono dal mese scorso, il CRM divide gli incontri sulla data, la Situazione mostra i
prossimi sette giorni — il giorno si passa come parametro (`oggi`, `today`) e la prova lo fissa. Il 1°
ottobre 2026 una prova scritta il 9 settembre ha cominciato a fallire senza che il codice fosse
cambiato: `plan` di `importing.js` non accettava il giorno, e adesso lo accetta. Una data relativa
(«fra tre giorni») va bene per quello che resta vero ogni giorno; una data scritta va bene solo con il
giorno fissato accanto.

L'elenco aggiornato, con la riga che dice cosa prova ciascuno, sta nel `CLAUDE.md` alla radice del
repository.

Tre pezzi di impalcatura, e vale la pena sapere che ci sono:

- `test/loader.mjs` — Node non ha una import map. Il hook manda `gg/` a `_lib/` e `biz/` a
  `_business/`, **e solo
  `gg/store.js` al deposito finto**: una impalcatura che sostituisce più del necessario finisce per
  provare sé stessa.
- `test/fake-dom.mjs` — il DOM finto su cui si provano le schermate. Una schermata si prova così, non
  aprendo la pagina.
- `test/xsd.sh` — valida i documenti di prova contro lo schema ufficiale, che **non sta nel
  repository**: le istruzioni in `test/schema/README.md`.

---

## Ricette

| Vuoi | Tocchi | E poi |
|---|---|---|
| un campo nuovo sul documento | `model.js` (forma) → `doc.js` (campo) → `validate.js` se è obbligatorio → `fatturapa.js` se esce nell'XML | chiavi `f_` in `i18n.js`, nelle due lingue |
| un tipo di documento nuovo | **solo `kinds.js`**, se il tipo è una riga di quella tabella | se non basta, la domanda è se il tipo esiste davvero |
| un controllo nuovo | `validate.js` (chiave) → `problems.js` (frase) → `i18n.js` (due lingue) | `test/validate.mjs` |
| un formato in ingresso | un modulo nuovo accanto a `sheet.js`/`xls.js`, che restituisce righe di stringhe | provalo **con file veri**, non con file inventati |
| una schermata nuova | una rotta in `app.js` + un file suo | i conti li fa un modulo senza DOM, provato a parte |
| un dato del cliente che si vede sul documento | `address.js` | lo prendono la carta (`print.js`) e la schermata (`doc.js`): una riga sola, due posti |
| mostrare quanto resta da incassare | `ledger` in `schedule.js`, mai un conto nuovo nella schermata | elenco, documento e scadenzario devono dire lo stesso numero |
| una serie o una numerazione | `kinds.js` (`serie`, `sequenza`) | e il numero per esteso esce anche nell'XML: `fatturapa.js` scrive `shownNumber`, non `doc.numero` |
| una parola | `i18n.js`, **entrambe le lingue nella stessa modifica** | `check_apps.py` confronta le chiavi |
| un menù di nature | `natureSuggerite` in `fatturapa.js` per le adatte, `<optgroup>` per mostrarle | regola 21: si suggerisce, non si toglie |
| un segno nell'elenco documenti | una riga piccola sotto lo stato, come `_settleLine` e `_clipLine` in `app.js` (la graffetta delle ricevute), letta una volta per tutto l'elenco | non una colonna nuova: la tabella è già larga |
| un file nuovo in `run/` | il file + l'elenco `ASSETS` in `sw.js` | e gira la versione |
| un tipo di byte nuovo da conservare | uno store a parte, fuori da `EXPORTED` (`BINARY` in `db.js`) | e nel manifest di `bundle.js`: così lo portano la cartella e lo zip, e il ripristino lo rimette |
| un promemoria nuovo | una riga in `_rows` di `alarms.js`, con `time` se ha un orario | `biz/remind.js` misura la sveglia da lì: `before` minuti prima, non il giorno prima |
| un campo in una maschera | nel punto che la sequenza gli assegna: **chi → quando → cosa → come si paga**; nel documento, i totali nell'ordine della somma; nel cliente, il paese prima della partita IVA e il recapito dopo l'indirizzo. Etichette in minuscolo, il maiuscolo è delle intestazioni di colonna | `test/customer.mjs` apre il foglio del cliente con tutti i campi: un `name` finito nel modulo sbagliato (è successo il 13 ottobre, con il codice destinatario nell'Azienda) lo ferma lì |

**Ogni file nuovo comincia con l'intestazione di licenza** (`// Copyright 2026 G&G Technologies
S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0`) e con il commento che dice perché esiste.

---

## Prima di chiudere

- [ ] **Versione girata** in `sw.js`: è l'unico meccanismo di aggiornamento che l'app ha. Numero
      fermo e contenuto cambiato significa che chi ha già aperto l'app continua a ricevere la copia
      vecchia, senza errori e per sempre. `_check_version_moved` lo verifica
- [ ] **Una versione già pubblicata non si riusa.** Prima di lavorare, `git log origin/main` dice se
      il numero in `sw.js` è già uscito: se sì, la modifica va in quello successivo. Il 13 ottobre
      2026 la 0.68.0 è stata pubblicata a metà giornata e le modifiche del pomeriggio stavano per
      finirci dentro — per chi l'aveva già aperta non sarebbero mai arrivate
- [ ] `ASSETS` in `sw.js` elenca esattamente quello che l'app importa, `_lib/` e `_business/` compresi
- [ ] Le chiavi italiane e inglesi di `i18n.js` coincidono
- [ ] `python3 _src/check_apps.py` passa; se hai toccato la scheda, anche `build.py` e `check_site.py`
- [ ] Le prove sopra passano — in particolare `totals`, `model`, `validate` e `fatturapa` se hai
      toccato i conti o il tracciato
- [ ] Provata **davvero**: nelle due lingue, nei due temi (con il chiaro impostato *prima* di
      aprirla), installata in finestra `standalone`, e su un telefono vero
- [ ] Nessuna richiesta di rete nel pannello di rete, a scheda aperta
- [ ] Se hai toccato `_business/`: girata anche la versione di **Plan Scope**

La lista completa, con le voci che riguardano la scheda e il sito, è in «Prima di pubblicare un'app»
dentro `app/CLAUDE.md`.
