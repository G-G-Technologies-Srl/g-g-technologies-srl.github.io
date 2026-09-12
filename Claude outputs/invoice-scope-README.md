# Invoice Scope — come si modifica

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
| `kinds.js` | cosa cambia fra i cinque tipi: preventivo, DDT, fattura (TD01), fattura differita (TD24), nota di credito (TD04) | è una tabella: cinque tipi, una riga per tipo |
| `validate.js` | se un documento può uscire | **non ha parole**: restituisce chiavi, mai frasi |
| `schedule.js` | cosa è dovuto e quando — derivato, mai salvato | non incassa: legge |
| `recurring.js` | le ricorrenze e gli acquisti attesi | un atteso è calcolato, non scritto in nessuno store |
| `fatturapa.js` · `xml.js` | il documento come file FatturaPA | `xml.js` emette coppie ordinate, non oggetti |
| `xmlread.js` · `reading.js` | l'XML **scritto da altri**, e i documenti che ne escono | prefissi ignorati, totali ricalcolati |
| `sheet.js` · `xls.js` · `fic.js` · `parse.js` | i formati in ingresso: `.xlsx`, il `.xls` del 1997, le tre esportazioni di Fatture in Cloud | nessuno di loro scrive nel deposito |
| `format.js` | numeri e date come una persona li legge e li scrive | l'unico posto che formatta, in tutta l'app |
| `problems.js` | le chiavi di `validate.js` come frasi | un passo dal dialogo, e niente altro |

### Il deposito

`db.js` è l'unico che conosce la forma dello schema: quindici store, e **ogni versione dichiara lo
schema intero**, mai la differenza dalla precedente. L'indice unico `numero_unico` su `docs` si crea
qui, sulla transazione grezza, perché `gg/store.js` crea solo indici non unici.

`memory.js` è un deposito in memoria che parla come IndexedDB, e serve a una cosa sola: `?demo=1`.
Quello che un visitatore apre per curiosità non finisce insieme alle sue fatture.

### Le schermate

Otto rotte fisse più quattro con un parametro, tutte a hash (`app.js`): in finestra installata non
c'è il tasto «indietro» del browser, e la via del ritorno deve stare nell'app.

| File | Schermata |
|---|---|
| `home.js` | la Situazione: i quattro numeri, le scadenze, il fatturato per mese, progetti e preventivi in attesa |
| `doc.js` | il documento, le sue righe, il riepilogo IVA sempre in vista |
| `due.js` · `payments.js` · `states.js` | scadenzario, incassi, il controllo che cambia stato |
| `parties.js` · `customer.js` · `crm.js` | clienti e listino, la scheda cliente, le persone e il diario |
| `projects.js` · `project.js` | i progetti e le fasi, con il modello condiviso di Plan Scope |
| `purchases.js` · `costs.js` · `expected.js` | gli acquisti, i loro conti, gli attesi |
| `importing.js` | l'importazione da un altro programma: `plan` legge e decide, `apply` scrive |
| `print.js` · `brand.js` | il foglio stampato, e il logo di cortesia |
| `timeline.js` | lo scadenzario come figura |
| `ask.js` | l'unico dialogo con cui questa app fa domande |

Nelle schermate **non si calcola**. `doc.js` lo dichiara in cima e vale per tutte: l'aritmetica è
`totals.js`, le regole sono `model.js`, i controlli sono `validate.js`. Una schermata legge campi e
disegna risultati.

### La libreria condivisa

Passa dalla import map (`gg/` → `../../_lib/`), mai da un import relativo. Questa app usa
`store.js`, `io.js`, `zip.js`, `folder.js`, `theme.js`, `install.js`, `update.js`, e — insieme a
Plan Scope — `plan-model.js`, `plan-editor.js`, `plan-pack.js`.

> **Toccare `_lib/plan-*.js` tocca anche Plan Scope.** Sono lo stesso file, e ogni service worker se
> lo mette nella propria cache. Una modifica lì obbliga a girare la versione di **entrambe** le app:
> `check_apps.py` non se ne accorge, è una regola umana (`app/CLAUDE.md`, «Toccare `_lib/`…»).

---

## Le sette cose che non si rompono

1. **Nessun importo passa da un float.** `0.1 + 0.2` su una fattura non è una curiosità, è un numero
   sbagliato depositato all'Agenzia. Tutto passa da `decimal.js`, che sta a otto decimali perché il
   tracciato ne ammette otto su `PrezzoUnitario` e `Quantita`.
2. **L'ordine degli arrotondamenti in `totals.js` non è negoziabile**: riga, riepilogo, imposta
   (sul riepilogo, mai per riga), documento. Cambiarlo significa un file che l'SdI rifiuta.
3. **Il contatore è un record e sale soltanto.** `max() + 1` sembra equivalente e non lo è: si
   cancella l'ultima fattura di dicembre e la numerazione torna indietro. Un documento emesso non si
   rinumera e non si dis-emette.
4. **`validate.js` resta senza parole.** Il giorno in cui importa un dizionario importa anche una
   lingua corrente, che è roba da schermata. Chiavi fuori, frasi in `problems.js`.
5. **Le differenze fra tipi stanno in `kinds.js`.** Allargare una lista alla volta in `schedule.js` o
   in `validate.js` produce un preventivo accettato che compare nello scadenzario: è già successo.
6. **Niente `confirm()` e niente `alert()`.** Li rifiuta `check_apps.py`, e su iOS in finestra
   installata alcuni non compaiono affatto — su un'app di fatturazione vuol dire una conferma che
   nessuno vede prima che un numero sia assegnato per sempre. Si usa `ask.js`.
7. **Nessuna richiesta di rete a app aperta**, con l'unica eccezione dichiarata nella scheda:
   `gg/update.js` fa rileggere `sw.js`. Una seconda chiamata va scritta nella scheda **prima** che
   nel codice.

---

## Le prove

Girano con Node, dalla radice del repository, e stanno **fuori da `run/`** perché `check_apps.py`
esige che ogni file dentro `run/` sia nell'elenco di precache.

```bash
# Foglie: girano da sole.
node app/invoice-scope/test/fic.mjs
node app/invoice-scope/test/xmlread.mjs
node app/invoice-scope/test/parse.mjs

# Tutte le altre passano da `gg/`, quindi vogliono il loader.
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
node $I app/invoice-scope/test/timeline.mjs
```

L'elenco aggiornato, con la riga che dice cosa prova ciascuno, sta nel `CLAUDE.md` alla radice del
repository.

Tre pezzi di impalcatura, e vale la pena sapere che ci sono:

- `test/loader.mjs` — Node non ha una import map. Il hook manda `gg/` a `_lib/`, **e solo
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
| una parola | `i18n.js`, **entrambe le lingue nella stessa modifica** | `check_apps.py` confronta le chiavi |
| un file nuovo in `run/` | il file + l'elenco `ASSETS` in `sw.js` | e gira la versione |

**Ogni file nuovo comincia con l'intestazione di licenza** (`// Copyright 2026 G&G Technologies
S.r.l. — SPDX-License-Identifier: Apache-2.0`) e con il commento che dice perché esiste.

---

## Prima di chiudere

- [ ] **Versione girata** in `sw.js`: è l'unico meccanismo di aggiornamento che l'app ha. Numero
      fermo e contenuto cambiato significa che chi ha già aperto l'app continua a ricevere la copia
      vecchia, senza errori e per sempre. `_check_version_moved` lo verifica
- [ ] `ASSETS` in `sw.js` elenca esattamente quello che l'app importa, `_lib/` compreso
- [ ] Le chiavi italiane e inglesi di `i18n.js` coincidono
- [ ] `python3 _src/check_apps.py` passa; se hai toccato la scheda, anche `build.py` e `check_site.py`
- [ ] Le prove sopra passano — in particolare `totals`, `model`, `validate` e `fatturapa` se hai
      toccato i conti o il tracciato
- [ ] Provata **davvero**: nelle due lingue, nei due temi (con il chiaro impostato *prima* di
      aprirla), installata in finestra `standalone`, e su un telefono vero
- [ ] Nessuna richiesta di rete nel pannello di rete, a scheda aperta
- [ ] Se hai toccato `_lib/`: girata anche la versione di **Plan Scope**

La lista completa, con le voci che riguardano la scheda e il sito, è in «Prima di pubblicare un'app»
dentro `app/CLAUDE.md`.
