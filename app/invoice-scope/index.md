---
title: "Invoice Scope — fattura elettronica Italia e San Marino | G&G"
description: "Fattura elettronica gratuita per Italia e San Marino: fatture, note di credito e preventivi in XML. Gira nel browser e i dati dei clienti restano in locale."
publisher: "G&G Technologies"
lang: it
canonical: https://ggtechnologies.sm/app/invoice-scope/
translation: https://ggtechnologies.sm/en/app/invoice-scope/index.md
---

# Le fatture restano sul vostro computer.

*App gratuita, codice pubblico*

Voi preparate il documento, l'app scrive il file XML da trasmettere. Clienti, prezzi e importi restano sul vostro computer, senza passare da alcun server.

Categoria · [Gestionale](https://ggtechnologies.sm/app/?tag=gestionale)

- [Aprite l'app](https://ggtechnologies.sm/app/invoice-scope/run/)
- [Codice sorgente](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/invoice-scope)

*Il punto di partenza*

## I dati dei clienti sono quelli da tenere in casa.

Per emettere una fattura elettronica si passa quasi sempre da un servizio online: si caricano l'anagrafica dei clienti, i prezzi praticati e lo storico delle vendite, e da quel momento vivono sul server di qualcun altro.

Per molte aziende va benissimo. Per altre no, e non è una questione di diffidenza: è che l'elenco dei clienti con quanto paga ciascuno è il documento più delicato che una piccola impresa possiede.

Questa app fa la parte che pesa — i conti, il tracciato, i controlli — e la fa sul vostro computer. Il file esce pronto; la trasmissione resta a voi, con il canale che usate già.

![La Situazione: il fatturato, i crediti da incassare, il fatturato per mese, chi deve di più, i progetti in ritardo.](https://ggtechnologies.sm/assets/shot-invoice-scope-it.png)

![Una fattura emessa: righe, riepilogo IVA, incassi, e il file XML da scaricare.](https://ggtechnologies.sm/assets/shot-invoice-scope-fattura-it.png)

![Un progetto: le fasi con l'importo, le pagine di appunti, i documenti collegati.](https://ggtechnologies.sm/assets/shot-invoice-scope-progetto-it.png)

![La scheda di un cliente: le persone, il diario delle telefonate, i suoi documenti.](https://ggtechnologies.sm/assets/shot-invoice-scope-cliente-it.png)

![Lo scadenzario: le rate, quelle scadute, e l'incasso da registrare.](https://ggtechnologies.sm/assets/shot-invoice-scope-scadenzario-it.png)

![Gli acquisti: fatture ricevute e spese, con lo stato e quello che resta da pagare.](https://ggtechnologies.sm/assets/shot-invoice-scope-acquisti-it.png)

### Cosa fa

- Apre su una situazione sola: il fatturato di quest'anno e il confronto con l'anno scorso, i crediti da incassare e da quanto tempo, il lavoro già svolto e non ancora fatturato. Sotto, il fatturato mese per mese, chi deve di più, i progetti in ritardo, i preventivi che aspettano una risposta, le bozze lasciate a metà.
- Prepara fatture, note di credito e fatture differite, con più aliquote sullo stesso documento.
- Tiene anche i preventivi e i documenti di trasporto, ciascuno con la sua numerazione e i suoi stati: un preventivo si accetta o si rifiuta, un documento di trasporto si consegna.
- Trasforma un preventivo accettato in fattura, e i documenti di trasporto di un cliente in una sola fattura differita, portando righe, sconto e scadenze senza ridigitarli.
- Tiene i progetti: un piano di fasi con le loro scadenze, le pagine di appunti che gli stanno intorno — in sotto-pagine, fino a quattro livelli, con dentro immagini e allegati — e i documenti collegati. Un progetto nasce anche da un preventivo accettato, con una fase per riga.
- Una fase con un importo, quando è fatta, diventa una riga di fattura: accanto al progetto ci sono quotato, fatturato, incassato e quello che resta da fatturare.
- Dà a ogni cliente una scheda sua: le persone di riferimento, con email e telefono, e un diario di telefonate, email e incontri. Accanto ci sono il fatturato, quello che resta da incassare e i suoi documenti.
- Tiene i conti correnti bancari dell'azienda, e mette il predefinito nei documenti nuovi: l'IBAN si scrive una volta invece che su ogni fattura. Un cliente può avere la sua aliquota e il suo conto: si scrivono nella sua scheda, e i suoi documenti nascono già compilati.
- Tiene lo scadenzario: le rate di ogni documento, quelle scadute e quanto resta da incassare, e gli incassi registrati con data, importo e conto.
- Importa da Fatture in Cloud clienti, listino e documenti, dai fogli dell'esportazione così come si scaricano — anche il .xls — con il dettaglio delle righe se si esporta anche quello, e le fatture intere dagli XML del backup. Prima di scrivere mostra cosa ha letto — quanti entrano, quali sono già lì, cosa ha lasciato fuori — e scrive solo dopo la conferma.
- Conosce le sei direzioni che una fattura può prendere — dall'Italia verso l'Italia, verso San Marino e verso l'estero; da San Marino verso l'Italia, verso un altro sammarinese e verso l'estero — e per ciascuna scrive il file che quel canale accetta. La direzione la decidono il paese dell'azienda e quello del cliente, che sono già in anagrafica.
- Fa le fatture interne fra operatori sammarinesi, obbligatorie dal 1° gennaio 2027: imposta monofase, codice destinatario a sette zeri, tipo merce su ogni riga, autofattura del cessionario, nota di debito e acconto.
- Il tipo merce lo chiede una volta per documento — «questa fattura contiene: servizi, beni, lavorazione con materiale» — e dice lì che cosa comporta: se serve il documento di trasporto, e da quale data si conta il termine. Le righe lo prendono da lì, e i codici hanno le parole accanto.
- Calcola il termine entro cui il documento va trasmesso, che non è la scadenza dell'incasso: lo mostra sul documento e nella Situazione, con la conseguenza del ritardo, che nei due canali sammarinesi non è la stessa.
- Verso un paese dove la fattura elettronica non è prevista non produce un file e spiega perché: quel documento si stampa, e fingere un adempimento sarebbe peggio che non averlo.
- Calcola l'IVA sul riepilogo per aliquota, che è il modo in cui la ricalcola il Sistema di Interscambio.
- Tiene i conti in aritmetica esatta, con otto decimali su quantità e prezzi unitari: l'energia, le lavorazioni a peso e i servizi al minuto li usano.
- Propone il bollo da 2,00 € quando l'importo senza IVA supera i 77,47 €, e lascia decidere se addebitarlo.
- Calcola la ritenuta d'acconto sull'imponibile, senza toccare l'IVA.
- Scrive il file XML nel formato FatturaPA, con il nome che le regole richiedono.
- Controlla il documento prima di consentirne l'esportazione, e dice quale campo, quale regola e cosa fare.
- Tiene la numerazione per anno e per serie: le fatture hanno la loro, le note di credito la loro, i preventivi la loro. Due documenti non possono uscire con lo stesso numero, e i contatori di una numerazione cominciata altrove si riprendono da dove erano.
- Esporta e reimporta tutto in un file JSON, che si apre e si legge senza questa app. Scelta una cartella, lo scrive lì da sola a ogni modifica, con una copia al giorno: dentro Dropbox o iCloud, il backup viaggia da sé. E se una cartella non c'è, lo segnala: senza server quella è l'unica copia che esiste, e un avviso che torna vale più di una spiegazione letta una volta.
- Registra anche gli acquisti: le fatture ricevute — dal loro file XML, o a mano — e le spese senza fattura, con il fornitore, la categoria, l'imposta e la scadenza, e i pagamenti effettuati; una nota di credito ricevuta toglie da sola. Lo scadenzario prende i due versi, con il saldo in cima; la Situazione mostra il margine dell'anno, ricavi e costi mese per mese, i fornitori a cui si deve di più, e l'IVA del trimestre e dell'anno — sulle vendite, sugli acquisti, da versare — con finalità di controllo. Per un'azienda sammarinese l'imposta monofase sugli acquisti si registra come costo, con la sua aliquota.
- Per un'azienda sammarinese, quando la fattura di un fornitore della Repubblica non arriva, l'app lo rileva dagli acquisti e propone l'autofattura elettronica con il termine entro cui va trasmessa: è l'adempimento che l'articolo 7 del Decreto Delegato 133/2026 mette in capo al cliente. La bozza nasce già con il fornitore, l'importo e la causale.
- Conosce i costi che tornano: il canone, l'affitto o l'assicurazione si scrivono una volta, con la cadenza, e l'app li aspetta mese per mese fino a fine anno. La Situazione mostra i costi dell'anno come finiranno, lo scadenzario quello che uscirà; quando la fattura arriva, una conferma e la riga attesa sparisce. Una fattura dello stesso fornitore nello stesso mese si aggancia da sola all'importazione.
- Le fatture che tornano ogni mese si scrivono una volta — il canone, il monte ore fisso, l'abbonamento — e in fondo ai Documenti compare quello che c'è da emettere, con il comando che ne prepara la bozza: cliente, riga, importi e scadenza già dentro. Bozza e non fattura, perché numerare è l'atto di emettere.
- Prepara il testo del sollecito per le fatture scadute di un cliente — le fatture, i giorni di ritardo, il totale, le coordinate — da copiare in una email. Uno per cliente, non uno per fattura.
- Mostra l'insoluto diviso per età — quanto deve ancora arrivare, quanto è fermo da trenta, sessanta, novanta giorni — il fatturato e l'incassato affiancati mese per mese, e la media dei giorni con cui ogni cliente salda. Con una categoria sui documenti, facoltativa e assegnabile anche a quelli già emessi, la Situazione dice da dove viene il fatturato dell'anno.
- Esporta un CSV del periodo per chi tiene la contabilità: documenti emessi e acquisti nello stesso file, con una colonna che dice il verso.
- Ricorda le scadenze, nei due versi: lo scadenzario esce come calendario .ics — e con il promemoria dentro, così a suonare è il vostro calendario, sul telefono, anche ad app chiusa — con un riepilogo alla riapertura dell'app, e con una notifica di sistema dove il browser la permette. Anticipo in giorni e orario si scelgono liberamente; installata, l'icona porta il numero di quelle in ritardo.
- Stampa il documento su carta intestata, con il vostro logo e i vostri recapiti. Il piè di pagina dice che cos'è quel foglio: una copia di cortesia dove l'originale è il file trasmesso, l'originale stesso dove un file non è previsto.
- Funziona anche senza connessione, e si installa come un'applicazione.

### Cosa non fa

- Non trasmette il file. Né al Sistema di Interscambio né all'HUB dell'Ufficio Tributario sammarinese: serve un canale accreditato, e questa app non ne ha uno.
- Non fa la conservazione a norma, che è un obbligo separato con requisiti propri.
- Non firma digitalmente, quindi non copre le fatture verso la pubblica amministrazione.
- Non tiene la contabilità: registra quello che esce e quello che entra, ma non fa registri IVA, liquidazioni o prima nota. Quelli restano a chi tiene i conti, con il file che l'app gli prepara.
- Non gestisce ancora l'inversione contabile né la scissione dei pagamenti: cambiano il calcolo, e arrivano quando saranno provate come il resto.

*In breve*

#### Dati

Restano sul vostro computer. Dopo il caricamento della pagina l'app non fa richieste di rete.

#### Uscita

Un file XML per documento, più una copia di cortesia su carta intestata, da stampare o salvare in PDF per il cliente.

#### Figure

Le immagini e gli allegati di una pagina stanno nel browser come tutto il resto, e viaggiano nel pacchetto del progetto. Nella cartella collegata escono come file veri, accanto all'archivio: dentro il JSON peserebbero cento volte tanto, e quel file si riscrive a ogni modifica.

#### Copie

Con una cartella collegata l'app ci scrive l'archivio a ogni modifica e ne tiene una copia al giorno, immagini comprese. La Situazione dice sempre come sta la copia — quando è stata fatta, che cosa contiene, se manca — e si può aprire la copia e vedere quanti documenti, clienti e immagini porta, confrontati con quello che c'è adesso. Dove il browser non consente di scrivere in una cartella resta l'esportazione a mano, e l'app ricorda di farla.

#### Progetti

Un progetto porta le sue fasi, le sue pagine e i suoi documenti, e mostra quanto è stato quotato, fatturato, incassato e quanto resta da fatturare. Un lavoro concluso si archivia, e i suoi importi contano ancora; quello che si elimina resta trenta giorni nel cestino. Si esporta e si riapre in Plan Scope, che usa lo stesso formato.

#### Clienti

Ogni cliente ha una scheda: le persone di riferimento, il diario di quello che vi siete detti, e i suoi documenti accanto ai due numeri che contano.

#### Acquisti

Le fatture ricevute e le spese, con i pagamenti. Un fornitore è un'anagrafica come un cliente, con un ruolo: se un giorno compra, è già lì.

#### Tracciato

FatturaPA, specifiche 1.9.1, in vigore dal 15 maggio 2026. Per San Marino, lo schema VFPR12 1.2.3 pubblicato dall'Ufficio Tributario, che è lo stesso.

#### Direzioni

Sei, e cambiano il file: Italia verso Italia, San Marino o estero; San Marino verso Italia, San Marino o estero. L'ultima non ha una fattura elettronica, e l'app lo dice invece di produrne una.

#### Conti

Aritmetica esatta su interi, mai in virgola mobile: niente centesimi che compaiono da soli.

#### Trasmissione

Resta a voi, dal portale «Fatture e Corrispettivi», da TribWeb per chi emette da San Marino, o tramite il vostro intermediario.

#### Senza connessione

Dopo la prima apertura funziona anche senza rete.

#### Aggiornamenti

Automatici. Accanto al nome dell'app c'è la versione; quando ne è pronta una nuova, la scritta lo segnala e basta toccarla per passare. Per saperlo il browser rilegge un file dell'app dal nostro sito, https://ggtechnologies.sm/app/invoice-scope/run/sw.js: è l'unica richiesta dopo il caricamento, e non contiene dati vostri.

#### Licenza

PolyForm Shield 1.0.0. Il codice è pubblico: si legge, si modifica e si usa anche in un lavoro commerciale. Un prodotto concorrente richiede una licenza commerciale.

#### Prezzo

Gratuita.

**Versione** 0.65.1 · **Aggiornata il** 25 settembre 2026 · **Licenza** PolyForm-Shield-1.0.0 · [Codice sorgente](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/invoice-scope)

*FAQ*

## Domande frequenti

### Mi avvisa quando una scadenza si avvicina?

Sì, e conviene sapere come, perché i modi sono tre e non funzionano tutti dappertutto. Il primo vale sempre: lo scadenzario esce come calendario e il promemoria viaggia dentro il file, quindi a suonare è il vostro calendario — sul telefono, alle nove, anche se questa app resta chiusa per mesi. Il secondo vale sempre anche lui: alla riapertura dell'app, un pannello mostra cosa è maturato nel frattempo. Il terzo è la notifica di sistema, e quella dipende dal browser: con l'app installata su Chrome o Edge arriva anche a finestra chiusa, quando il browser sveglia l'app — non a un orario deciso da noi, perché senza un server l'app non può svegliarsi da sola. Su Safari, su iPhone e su Firefox restano i primi due. Anticipo in giorni e orario si scelgono nelle impostazioni.

### Posso mandare la fattura direttamente da qui?

No, e questo è il confine dell'app. La trasmissione richiede un canale accreditato, una PEC o il portale dell'Agenzia: cose che un programma senza server non può avere. L'app prepara il file corretto, che si carica dove già si caricano gli altri.

### Come verifico che i dati dei miei clienti restino qui?

Potete verificarlo direttamente. Aprite gli strumenti per sviluppatori del browser, scheda «Rete», e usate l'app: dopo il caricamento della pagina non compare nessuna richiesta — tranne una, di tanto in tanto: il browser rilegge https://ggtechnologies.sm/app/invoice-scope/run/sw.js, un file dell'app stessa, per sapere se c'è una versione nuova. È una lettura dal nostro sito, e non contiene dati vostri. Il codice è pubblico, quindi è possibile anche leggere cosa fa.

### Posso usare il codice in un mio prodotto?

Sì, per il vostro lavoro e per prodotti che svolgono un compito diverso. La licenza è la PolyForm Shield 1.0.0: il codice si legge, si modifica e si usa anche in un lavoro commerciale, a due condizioni. Ogni copia porta con sé la licenza e le righe «Required Notice», che nominano G&G Technologies come autore. Un prodotto che svolge lo stesso compito dell'app, venduto o gratuito, esteso o con un proprio server, richiede una licenza commerciale: si chiede a [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm).

### Che prove posso controllare prima di fidarmi dei conti?

I calcoli hanno una serie di prove automatiche in cui i totali attesi sono scritti a mano, non prodotti dallo stesso codice che viene provato. Sono nel repository, si leggono e si rilanciano.

### Vale anche per le fatture con San Marino?

Sì, in tutte e tre le direzioni che lo riguardano. Dall'Italia verso San Marino il codice destinatario è quello dell'Ufficio Tributario e la natura N3.3. Da San Marino verso l'Italia il trasmittente è l'HUB, il COE prende il posto della partita IVA, il CAP e la provincia sono quelli veri — San Marino non è «estero» per l'indirizzo — e il tipo merce sta sulla riga e in testa alla nota di esenzione. Da San Marino verso un altro sammarinese vale la fattura interna, obbligatoria dal 1° gennaio 2027: l'IVA non si espone, il codice destinatario è sette zeri e chi trasmette è l'azienda stessa. Sono tre file diversi, e l'app sceglie da sé guardando i due paesi.

### Faccio servizi: il tipo merce e il tipo cessione mi riguardano?

Il tipo merce sì, ed è il 3: la legge che il suo nome richiama, la 131 del 1991, è quella sulla fatturazione delle prestazioni di servizi in generale. Il tipo cessione no: il rimborso monofase esiste per i tipi merce 1 e 2, quindi su una fattura di servizi quel codice non produrrebbe niente, e infatti l'app non lo chiede. C'è una cosa che conviene sapere e che non riguarda l'app: una fattura di soli servizi verso l'Italia si ferma all'Ufficio Tributario e non viene inoltrata al Sistema di Interscambio, perché l'accordo fra i due Stati riguarda i beni. Al cliente italiano la copia va inviata direttamente da voi.

### Che differenza c'è fra i progetti qui e Plan Scope?

Il modello è lo stesso file, quindi un progetto scritto qui si apre lì e viceversa. Cambia dove vive: un progetto sta dove sta il suo denaro. Se il lavoro ha un preventivo e delle fatture, conviene tenerlo qui, perché solo qui il piano può dire quanto è stato quotato, fatturato e incassato, e una fase fatta può diventare una riga di fattura. Se è un piano e basta — un evento, un libro, un trasloco — Plan Scope resta il posto giusto, ed è più leggero. Quello che conviene evitare è tenere lo stesso progetto aperto in tutt'e due: il passaggio è un file, non una sincronizzazione.

### Posso tenerci anche i contatti e le note delle conversazioni?

Sì, sulla scheda del cliente: le persone di riferimento, e un diario di telefonate, email e incontri, ognuna con la sua data. Sta dentro l'app che fattura e non in un programma a parte perché il browser dà a ogni app un archivio suo: un programma separato non vedrebbe questi clienti, e finirebbe per tenere un secondo elenco delle stesse aziende — quello che poi diverge. Le persone di riferimento restano sul vostro computer: la fattura elettronica non ha un campo per il nome di una persona, e l'app non ne inventa uno.

### Che succede se cambio computer?

Si collega la stessa cartella — quella di Dropbox o iCloud dove l'app scrive — e l'app ci trova l'archivio e lo riporta dentro, immagini comprese. È la stessa strada di un ripristino: la cartella non è solo un posto dove finiscono i file, è da dove si torna. Senza cartella restano l'esportazione e la reimportazione a mano, e senza nemmeno quella non c'è niente: non esiste un server con una copia dei vostri dati, ed è il motivo per cui l'app insiste finché una cartella non c'è.

### Come si aggiorna l'app, una volta installata?

Da sola, e lo segnala. Accanto al nome dell'app c'è la sua versione. Quando ne è pronta una nuova, la scritta mostra tutt'e due — quella installata e quella in arrivo — con un punto verde: toccandola, l'app si ricarica aggiornata e i vostri dati restano dove sono. Altrimenti la versione nuova entra comunque alla prossima apertura. Se l'app è stata installata prima che esistesse questo avviso, la prima volta va fatto a mano: si chiudono tutte le finestre dell'app e la si riapre; se accanto al nome la versione non compare ancora, si ricarica la pagina con Ctrl+F5, o ⌘⇧R su Mac. Da lì in poi provvede l'app.

### E per toglierla?

La rimozione la fa il sistema, non l'app: nessun sito può disinstallarsi da solo, ed è una buona regola. Dentro l'app installata, accanto al nome, c'è «Installata»: toccandolo, l'app indica dov'è il comando sul vostro sistema. Un punto da sapere: togliere l'app lascia i dati dove sono, e cancellare i dati lascia l'app dov'è. Se i dati non servono più, conviene esportare prima l'archivio.

## Vi serve la stessa cosa, su misura?

Se avete un flusso di documenti da emettere o da controllare e questa app non basta, descriveteci il caso. Risponde una persona del team, non un messaggio automatico.

- [Scriveteci](mailto:info@ggtechnologies.sm?subject=Invoice%20Scope%20%E2%80%94%20strumenti%20su%20misura%20per%20i%20documenti%20fiscali)
- [Chiamateci](tel:+3780549900824)

### [AI on-premise](https://ggtechnologies.sm/servizi/ai-on-premise/)

Come si sceglie fra tutto in locale, ibrido e cloud, a partire dai vostri dati.

### [DigiSense®](https://ggtechnologies.sm/digisense/)

Cosa c'è sotto, e perché il vostro progetto non parte da zero.

### [Intelligenza Artificiale](https://ggtechnologies.sm/servizi/intelligenza-artificiale/)

Agenti che leggono documenti e interrogano i sistemi aziendali, con la misura decisa prima.
