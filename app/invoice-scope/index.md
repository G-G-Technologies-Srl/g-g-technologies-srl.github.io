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

Per emettere una fattura elettronica si usa di solito un servizio online: l'anagrafica dei clienti, i prezzi praticati e lo storico delle vendite vengono caricati sui server di chi offre il servizio.

Per molte imprese è una soluzione adeguata. Per altre l'elenco dei clienti, con gli importi fatturati a ciascuno, è un'informazione riservata da tenere in azienda.

Invoice Scope svolge sul vostro computer la parte che richiede competenza — i calcoli, il tracciato FatturaPA, i controlli — e restituisce il file pronto per l'invio. La trasmissione resta sul canale che usate già.

![La Situazione: il fatturato, i crediti da incassare, il fatturato per mese, chi deve di più, i progetti in ritardo.](https://ggtechnologies.sm/assets/shot-invoice-scope-it.png)

![Una fattura emessa: righe, riepilogo IVA, incassi, e il file XML da scaricare.](https://ggtechnologies.sm/assets/shot-invoice-scope-fattura-it.png)

![Un progetto: le fasi con l'importo, le pagine di appunti, i documenti collegati.](https://ggtechnologies.sm/assets/shot-invoice-scope-progetto-it.png)

![La scheda di un cliente: le persone, il diario delle telefonate, i suoi documenti.](https://ggtechnologies.sm/assets/shot-invoice-scope-cliente-it.png)

![Lo scadenzario: le rate, quelle scadute, e l'incasso da registrare.](https://ggtechnologies.sm/assets/shot-invoice-scope-scadenzario-it.png)

![Gli acquisti: fatture ricevute e spese, con lo stato e quello che resta da pagare.](https://ggtechnologies.sm/assets/shot-invoice-scope-acquisti-it.png)

### Cosa fa

- Emette fatture, fatture differite, acconti, note di credito e di debito, con più aliquote sullo stesso documento. Tiene anche preventivi, fatture proforma e documenti di trasporto, ciascuno con la sua numerazione, e li trasforma in fattura senza ridigitare righe, sconti e scadenze. Dall'elenco ogni documento si duplica per il cliente e le righe di sempre.
- Riapre per la modifica un documento già emesso, che conserva il suo numero, con l'avviso che un documento già trasmesso non si corregge ma si storna con una nota di credito.
- Scrive il file FatturaPA per ogni direzione: dall'Italia verso l'Italia, San Marino e l'estero; da San Marino verso l'Italia, l'estero e gli altri operatori sammarinesi, con la fattura interna obbligatoria dal 1° gennaio 2027. La direzione la ricava dal paese dell'azienda e da quello del cliente.
- Controlla ogni documento prima dell'emissione e indica il campo, la regola e la correzione. Calcola l'IVA per aliquota come la ricalcola il Sistema di Interscambio, in aritmetica esatta.
- Fattura alla pubblica amministrazione in formato FPA12, con il codice univoco dell'ufficio, CIG e CUP e la scissione dei pagamenti. Gestisce la ritenuta d'acconto, la cassa previdenziale dei professionisti, il bollo virtuale e il regime forfettario.
- Registra gli acquisti: le fatture ricevute dal file XML — anche firmato (.p7m) o raccolto nello zip dello SdI — o inserite a mano, le spese senza fattura, le note di credito dei fornitori, le rate e i pagamenti. I costi ricorrenti si inseriscono una volta e restano attesi fino a fine anno.
- Riconosce gli acquisti in inversione contabile e prepara l'integrazione da trasmettere allo SdI — TD16, TD17, TD18 o TD19 — con il termine del 15 del mese successivo. Per un'azienda sammarinese propone l'autofattura dell'articolo 7 del Decreto Delegato 133/2026 quando la fattura del fornitore non arriva.
- Tiene lo scadenzario in entrata e in uscita: rate, incassi con la ricevuta del bonifico, bonifici che saldano più fatture, l'estratto conto della banca letto da CSV. Prepara il testo dei solleciti e ricorda le scadenze con un calendario .ics e, dove il browser lo consente, con una notifica.
- Apre su una situazione d'insieme: fatturato dell'anno confrontato con il precedente, crediti divisi per anzianità, margine, IVA del periodo a fini di controllo e documenti vicini al termine di trasmissione.
- Dedica a ogni cliente una scheda con le persone di riferimento, gli incontri in programma e quelli da annotare, il diario di telefonate, email e incontri e l'elenco dei suoi documenti.
- Gestisce i progetti: fasi con scadenze e importi, pagine di appunti con immagini e allegati, e fasi completate che diventano righe di fattura. Il formato è lo stesso di Plan Scope.
- Importa clienti, listino e documenti da Fatture in Cloud e dagli XML di un archivio, mostrando prima che cosa entrerà. Esporta un CSV del periodo per chi tiene la contabilità.
- Stampa i documenti su carta intestata, con logo e recapiti, o li salva in PDF.
- Salva l'archivio a ogni modifica in una cartella collegata, con una copia al giorno. Si installa come un'applicazione e funziona anche senza connessione.

### Cosa non fa

- Non trasmette il file, né al Sistema di Interscambio né all'HUB dell'Ufficio Tributario sammarinese: la trasmissione richiede un canale accreditato.
- Non svolge la conservazione a norma, che è un obbligo distinto con requisiti propri.
- Non appone la firma digitale. Il file destinato alla pubblica amministrazione va firmato con il vostro dispositivo di firma (CAdES o XAdES) prima dell'invio.
- Non tiene la contabilità: registri IVA, liquidazioni e prima nota restano a chi se ne occupa, che riceve dall'applicazione il file del periodo.
- Non riporta nelle integrazioni l'identificativo SdI della fattura del fornitore, che la guida dell'Agenzia chiede quando è disponibile; numero e data sì.

*Formati in ingresso e in uscita*

I documenti escono nei formati ufficiali e in file aperti, leggibili anche senza questa applicazione.

### Esce come

- XML FatturaPA: FPR12 per imprese e privati, FPA12 per la pubblica amministrazione e il tracciato sammarinese per HUB-SM, con il nome di file previsto dalle regole.
- PDF su carta intestata, dalla stampa del browser.
- CSV del periodo per la contabilità, con documenti emessi e acquisti nello stesso file.
- Calendario .ics delle scadenze, con il promemoria incluso.
- Archivio completo in JSON, o in .zip con ricevute e immagini, per la copia di sicurezza o il cambio di computer.
- Progetti nel formato di Plan Scope.

### Entra da

- XML FatturaPA ricevuti o emessi, anche firmati (.p7m) o raccolti nello zip dello SdI.
- Esportazioni di Fatture in Cloud: anagrafiche, listino e documenti, in .xlsx, .xls o CSV.
- Estratto conto della banca in CSV o in foglio di calcolo, per abbinare incassi e pagamenti.
- Un archivio di Invoice Scope, per il ripristino o il cambio di computer.
- Progetti di Plan Scope.

*In breve*

#### A chi serve

Imprese, professionisti e studi che usano la fattura elettronica in Italia o da San Marino e preferiscono tenere i dati dei clienti sul proprio computer.

#### Dati

Restano nel browser del vostro computer, dall'inserimento all'archivio. L'applicazione si apre senza registrazione e, dopo il caricamento della pagina, lavora interamente in locale.

#### Tracciato

FatturaPA, specifiche 1.9.1 in vigore dal 15 maggio 2026, e lo schema VFPR12 1.2.3 dell'Ufficio Tributario per San Marino. Ogni versione è provata su documenti di esempio validati con lo schema ufficiale.

#### Trasmissione

Il file si carica sul portale «Fatture e Corrispettivi», su TribWeb per chi emette da San Marino, oppure si consegna al proprio intermediario.

#### Copie di sicurezza

Su Chrome ed Edge l'archivio si salva da sé in una cartella collegata, anche dentro Dropbox o iCloud, con una copia al giorno. Negli altri browser si esporta a mano, e l'applicazione lo ricorda.

#### Requisiti

Un browser aggiornato su computer, tablet o telefono. Installata, si apre come un'applicazione e funziona anche senza connessione.

#### Aggiornamenti

Automatici: quando è disponibile una versione nuova, l'applicazione lo segnala accanto al nome. Per saperlo il browser rilegge https://ggtechnologies.sm/app/invoice-scope/run/sw.js, l'unica richiesta di rete dopo il caricamento, che non contiene dati vostri.

#### Licenza

PolyForm Shield 1.0.0. Il codice è pubblico: si legge, si modifica e si usa anche in un lavoro commerciale. Un prodotto concorrente richiede una licenza commerciale.

#### Prezzo

Gratuita.

**Versione** 0.72.0 · **Aggiornata il** 14 ottobre 2026 · **Licenza** PolyForm-Shield-1.0.0 · [Codice sorgente](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/invoice-scope)

*FAQ*

## Domande frequenti

### Posso trasmettere la fattura direttamente da qui?

No. La trasmissione richiede un canale accreditato — il portale dell'Agenzia, una PEC o un intermediario — che un'applicazione senza server non può avere. Invoice Scope prepara il file corretto, che si carica dove già si caricano gli altri.

### Come verifico che i dati dei miei clienti restino sul computer?

Aprite gli strumenti per sviluppatori del browser, scheda «Rete», e usate l'applicazione: dopo il caricamento della pagina compare una sola richiesta, di tanto in tanto, verso https://ggtechnologies.sm/app/invoice-scope/run/sw.js. È la lettura di un file dell'applicazione, per sapere se esiste una versione nuova, e non contiene dati vostri. Il codice è pubblico e si può leggere.

### Posso importare l'archivio da un altro programma?

Sì. Da Fatture in Cloud entrano clienti, listino e documenti, dai fogli dell'esportazione così come si scaricano; da qualunque programma entrano le fatture in formato XML, anche firmate o raccolte nello zip dello SdI. Prima di scrivere, l'applicazione mostra che cosa ha letto, che cosa è già presente e che cosa ha lasciato fuori, e procede solo dopo la conferma.

### Vale anche per le fatture con San Marino?

Sì, in tutte e tre le direzioni che lo riguardano. Dall'Italia verso San Marino il codice destinatario è quello dell'Ufficio Tributario; la natura è N3.3 per le cessioni di beni e N2.1 per i servizi resi a un operatore, fuori campo IVA. Da San Marino verso l'Italia il trasmittente è l'HUB, il COE prende il posto della partita IVA e il tipo merce sta su ogni riga. Fra operatori sammarinesi vale la fattura interna, obbligatoria dal 1° gennaio 2027: l'IVA non si espone e il codice destinatario è di sette zeri. L'applicazione sceglie il file giusto dai paesi dell'azienda e del cliente.

### Posso fatturare a un comune, a una scuola, a un ente pubblico?

Sì. Nella scheda del cliente si indica «Pubblica amministrazione» e, se l'ente la applica, la scissione dei pagamenti; il codice destinatario è il codice univoco dell'ufficio, di sei caratteri, pubblicato sull'Indice delle PA. Il file esce in formato FPA12, con CIG e CUP quando previsti. Resta a voi la firma digitale, obbligatoria verso la pubblica amministrazione, che l'applicazione ricorda al momento dell'emissione.

### Come gestisce gli acquisti in inversione contabile?

L'acquisto da un fornitore italiano con natura N6, o da un fornitore estero senza IVA, viene riconosciuto all'importazione oppure indicato nel foglio dell'acquisto. Negli Acquisti compare il documento di integrazione da emettere — TD16, TD17, TD18 o TD19 — con il suo termine; la bozza riporta gli importi del fornitore all'aliquota predefinita dell'azienda, da verificare, e la fattura collegata.

### Fornisco servizi da San Marino: il tipo merce e il tipo cessione mi riguardano?

Il tipo merce sì, ed è il 3, quello delle prestazioni di servizi. Il tipo cessione no: il rimborso monofase riguarda i tipi merce 1 e 2, e infatti l'applicazione non lo chiede su una fattura di servizi. Da sapere: una fattura di soli servizi verso l'Italia si ferma all'Ufficio Tributario e non viene inoltrata al Sistema di Interscambio, perché l'accordo fra i due Stati riguarda i beni; al cliente italiano la copia va inviata direttamente.

### Mi avvisa quando una scadenza si avvicina?

Sì, in tre modi. Lo scadenzario si esporta come calendario .ics con il promemoria incluso, quindi l'avviso arriva dal vostro calendario anche ad applicazione chiusa. Alla riapertura, un riepilogo mostra le scadenze maturate. Con l'applicazione installata su Chrome o Edge arriva anche una notifica di sistema; su Safari, iPhone e Firefox restano i primi due. Anticipo e orario si scelgono nelle impostazioni.

### Che cosa succede se cambio computer?

Sul computer nuovo si collega la stessa cartella usata per le copie, per esempio in Dropbox o iCloud, e l'applicazione riporta dentro l'archivio, immagini comprese. Senza cartella si esporta l'archivio dal computer vecchio e lo si importa nel nuovo. Non esiste una copia su un server: per questo l'applicazione segnala finché una cartella non è collegata.

### Che prove posso controllare prima di affidarmi ai calcoli?

I calcoli hanno prove automatiche con i totali attesi scritti a mano, non prodotti dal codice che si sta provando, e i documenti di esempio sono validati con lo schema ufficiale dell'Agenzia. Le prove sono nel repository pubblico: si leggono e si rilanciano.

### Posso usare il codice in un mio prodotto?

Sì, per il vostro lavoro e per prodotti che svolgono un compito diverso. La licenza è la PolyForm Shield 1.0.0: il codice si legge, si modifica e si usa anche in un lavoro commerciale, a due condizioni. Ogni copia porta con sé la licenza e le righe «Required Notice», che nominano G&G Technologies come autore. Un prodotto che svolge lo stesso compito dell'applicazione, venduto o gratuito, richiede una licenza commerciale: si chiede a [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm).

### Che differenza c'è fra i progetti qui e Plan Scope?

Il formato è lo stesso, quindi un progetto passa dall'una all'altra applicazione come file. Conviene tenerlo qui quando il lavoro ha un preventivo e delle fatture, perché solo qui il piano mostra quanto è stato quotato, fatturato e incassato; un piano senza aspetti economici sta meglio in Plan Scope, che è più leggero.

### Come si aggiorna, e come si rimuove, l'applicazione installata?

Si aggiorna da sola: quando è pronta una versione nuova, accanto al nome compare un punto verde, e toccandolo l'applicazione si ricarica con i dati intatti. La rimozione la esegue il sistema operativo: accanto al nome, «Installata» indica dove si trova il comando. Togliere l'applicazione non cancella i dati, e cancellare i dati non toglie l'applicazione: se l'archivio non serve più, conviene esportarlo prima.

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
