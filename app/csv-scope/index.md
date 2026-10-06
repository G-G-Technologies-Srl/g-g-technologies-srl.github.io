---
title: "CSV Scope — leggere un CSV nel browser | G&G Technologies"
description: "Apre un file CSV, lo mostra in tabella e ne disegna i canali numerici. Gira nel browser: il file resta sul vostro computer."
publisher: "G&G Technologies"
lang: it
canonical: https://ggtechnologies.sm/app/csv-scope/
translation: https://ggtechnologies.sm/en/app/csv-scope/index.md
---

# I vostri file CSV, letti dove sono già.

*App gratuita e open source*

Basta trascinare il file per leggerlo: in tabella riga per riga, e in grafico dove ci sono numeri. L'app lo legge sul vostro computer, e lì resta.

Categoria · [Dati](https://ggtechnologies.sm/app/?tag=dati)

- [Aprite l'app](https://ggtechnologies.sm/app/csv-scope/run/)
- [Codice sorgente](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/csv-scope)

*Il punto di partenza*

## Un file di misure si legge dove si trova già.

Per guardare un CSV di qualche decina di megabyte le strade sono di solito due: un foglio di calcolo che rallenta fino a fermarsi, oppure un servizio online a cui caricare il file. Nel primo caso si aspetta; nel secondo si consegnano le proprie misure a qualcun altro, e spesso senza sapere per quanto tempo le tiene.

CSV Scope fa la terza cosa. Il browser legge il file dove già si trova e disegna il grafico in locale. Dopo che la pagina si è caricata, l'app non fa più una sola richiesta di rete: è possibile verificarlo dagli strumenti per sviluppatori del browser.

Il caso da cui siamo partiti è un elettrocardiogramma. È il tipo di file che incontriamo nel nostro lavoro sui [wearable medicali](https://ggtechnologies.sm/servizi/wearable-medicale/), ed è anche quello che mette alla prova un visualizzatore: centinaia di campioni al secondo, spesso una colonna sola, e un dettaglio che conta a ogni millisecondo. L'esempio contenuto nell'app è un ECG sintetico, disegnato dall'app stessa.

![L'interfaccia dell'app, in esecuzione nel browser.](https://ggtechnologies.sm/assets/shot-csv-scope-it.png)

### Cosa fa

- Apre file CSV e TSV, con la virgola, il punto e virgola o la tabulazione come separatore.
- Riconosce la colonna del tempo e disegna sullo stesso asse gli altri canali, cioè le colonne che contengono numeri.
- Ingrandisce il grafico e scorre lungo il file: su una registrazione di un'ora si arriva a leggere il singolo battito.
- Fa scorrere il tracciato come su un monitor, alla velocità di registrazione quando il file dichiara i tempi, o a una velocità scelta da voi.
- Mostra tutte le righe in tabella, comprese le colonne di testo.
- Minimo, massimo e media di ogni canale sull'intervallo selezionato.
- Esporta l'intervallo selezionato: le righe escono identiche a come sono entrate.
- Legge anche i file a colonna singola, un campione per riga, come li esporta un ECG.
- Riconosce un file già aperto e ripristina lo zoom e l'intervallo di prima.
- Apre file da centomila righe restando sotto i cento megabyte di memoria.

### Cosa non fa

- Non fa filtraggio del segnale né analisi statistica: serve a guardare, non a elaborare.
- Non apre i formati proprietari dei datalogger: vanno prima esportati in CSV.
- Non sincronizza fra dispositivi: quello che si apre qui resta qui.

*In breve*

#### Dati

Restano sul vostro computer. Dopo il caricamento della pagina l'app non fa richieste di rete.

#### Dimensione

Provata su un file da 12 MB e centomila righe: si apre in poco più di un secondo.

#### Senza connessione

Dopo la prima apertura funziona anche senza rete.

#### Aggiornamenti

Automatici. Accanto al nome dell'app c'è la versione; quando ne è pronta una nuova, la scritta lo segnala e basta toccarla per passare. Per saperlo il browser rilegge un file dell'app dal nostro sito, https://ggtechnologies.sm/app/csv-scope/run/sw.js: è l'unica richiesta dopo il caricamento, e non contiene dati vostri.

#### Installazione

Facoltativa. Si apre nel browser, e dove il sistema lo permette si installa come un'app normale.

#### Storico

Ricorda i file aperti — com'erano fatti e fin dove si era arrivati, non il contenuto. Si esporta, si reimporta o si svuota in qualsiasi momento.

#### Lingue

Italiano e inglese, seguono la lingua del browser.

#### Licenza

Apache-2.0. Il codice è pubblico e riusabile, anche in un lavoro commerciale.

#### Avvertenza

È un visualizzatore di file. Non è un dispositivo medico e non serve a fare diagnosi.

**Versione** 0.15.13 · **Aggiornata il** 24 settembre 2026 · **Licenza** Apache-2.0 · [Codice sorgente](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/csv-scope)

*FAQ*

## Domande frequenti

### Come verifico che il file resti sul mio computer?

Potete verificarlo direttamente. Aprite gli strumenti per sviluppatori del browser, scheda «Rete», e usate l'app: dopo il caricamento della pagina non compare nessuna richiesta — tranne una, di tanto in tanto: il browser rilegge https://ggtechnologies.sm/app/csv-scope/run/sw.js, un file dell'app stessa, per sapere se c'è una versione nuova. È una lettura dal nostro sito, e non contiene dati vostri. Il codice è pubblico, quindi è possibile anche leggere cosa fa.

### Posso usarla nella mia azienda?

Sì, anche in un lavoro commerciale. La licenza Apache-2.0 lo permette, chiede di mantenere le note di copyright e concede anche i diritti d'uso su eventuali brevetti che coprono il codice.

### Che succede ai miei dati se chiudo il browser?

Le preferenze restano, il file no: viene letto ogni volta da dove si trova. Per conservare un intervallo si usa l'esportazione — il file esce sul vostro disco, come qualsiasi altro.

### Che rapporto c'è fra questa app e il vostro lavoro?

È lo stesso modo di costruire, su un caso piccolo. Elaborazione sulla macchina di chi usa il software e dati che restano dove sono già: sono le scelte che applichiamo nei progetti su misura, dove la posta in gioco è più alta.

### Come si aggiorna l'app, una volta installata?

Da sola, e lo segnala. Accanto al nome dell'app c'è la sua versione. Quando ne è pronta una nuova, la scritta mostra tutt'e due — quella installata e quella in arrivo — con un punto verde: toccandola, l'app si ricarica aggiornata e i vostri dati restano dove sono. Altrimenti la versione nuova entra comunque alla prossima apertura. Se l'app è stata installata prima che esistesse questo avviso, la prima volta va fatto a mano: si chiudono tutte le finestre dell'app e la si riapre; se accanto al nome la versione non compare ancora, si ricarica la pagina con Ctrl+F5, o ⌘⇧R su Mac. Da lì in poi provvede l'app.

### E per toglierla?

La rimozione la fa il sistema, non l'app: nessun sito può disinstallarsi da solo, ed è una buona regola. Dentro l'app installata, accanto al nome, c'è «Installata»: toccandolo, l'app indica dov'è il comando sul vostro sistema. Un punto da sapere: togliere l'app lascia i dati dove sono, e cancellare i dati lascia l'app dov'è. Se i dati non servono più, conviene esportare prima l'archivio.

## Vi serve la stessa cosa, su misura?

Se avete un flusso di misure da leggere o da elaborare e questa app non basta, descriveteci il caso. Risponde una persona del team, non un messaggio automatico.

- [Scriveteci](mailto:info@ggtechnologies.sm?subject=CSV%20Scope%20%E2%80%94%20strumenti%20su%20misura%20per%20i%20dati)
- [Chiamateci](tel:+3780549900824)

### [Wearable medicali](https://ggtechnologies.sm/servizi/wearable-medicale/)

Scheda, firmware e piattaforma di telemonitoraggio, in un progetto solo.

### [AI on-premise](https://ggtechnologies.sm/servizi/ai-on-premise/)

Come si sceglie fra tutto in locale, ibrido e cloud, a partire dai vostri dati.

### [DigiSense®](https://ggtechnologies.sm/digisense/)

Cosa c'è sotto, e perché il vostro progetto non parte da zero.
