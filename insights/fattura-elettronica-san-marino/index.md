---
title: "Fatturazione elettronica interna a San Marino — G&G"
description: "Dal 2027 la fatturazione elettronica interna è obbligatoria a San Marino sopra i 100.000 € di ricavi: chi, come, entro quando, e cosa preparare."
author: "Gian Angelo Geminiani"
publisher: "G&G Technologies"
lang: it
published: 2026-10-06
canonical: https://ggtechnologies.sm/insights/fattura-elettronica-san-marino/
translation: https://ggtechnologies.sm/en/insights/san-marino-e-invoicing/index.md
tags: [automazione]
---

# Dal 2027 la fattura fra aziende sammarinesi passa da HUB-SM.

Chi è obbligato, com'è fatto il file, i termini e le sanzioni, dal decreto e dalle regole tecniche. Poi otto cose da preparare entro dicembre.

*Per le piccole e medie imprese sammarinesi e per chi ne tiene la contabilità.*

Dal 1° ottobre 2026 un'azienda sammarinese può emettere la fattura elettronica anche verso un cliente sammarinese: è la fatturazione elettronica interna. Dal 1° gennaio 2027, per chi ha dichiarato almeno 100.000 € di ricavi, diventa un obbligo. Con l'Italia la fattura elettronica esiste dal 2021: ora arriva anche nelle operazioni interne alla Repubblica.

Il cambiamento è più grande di quanto sembri. Una fattura scartata dal sistema si considera non emessa. Il termine per trasmetterla si conta da un fatto preciso: la consegna dei beni, la fine del servizio o il pagamento. E il cliente che non la riceve ha un obbligo suo.

Questo articolo ricostruisce cosa dicono il Decreto Delegato 133/2026 e le regole tecniche dell'Ufficio Tributario, e chiude con le cose da preparare entro dicembre. Le regole citate vengono dai testi ufficiali, elencati in fondo.

## Il calendario, in tre date

| Da | Che cosa cambia |
|---|---|
| 1° ottobre 2026 | la fatturazione elettronica interna è **facoltativa**: chi vuole la adotta, in alternativa alla carta |
| 1° gennaio 2027 | diventa **obbligatoria** per chi supera la soglia; per gli altri valgono le nuove regole sulla fattura cartacea |
| 1° gennaio 2028 | si applicano le **sanzioni**: 100 € per ogni fattura o nota di variazione omessa o trasmessa in ritardo |

Il 2027, quindi, è un anno di obbligo senza sanzioni, non un anno di proroga. Le fatture emesse nel 2027 restano soggette ai termini e alle regole: cambia soltanto che omissioni e ritardi non sono ancora sanzionati.

Per lo Stato, la Pubblica Amministrazione e gli Enti Pubblici le date sono diverse: il decreto rinvia a un regolamento attuativo successivo.

## Chi è obbligato, e chi resta sulla carta

L'obbligo riguarda gli operatori economici, le imprese agricole e gli enti pubblici e privati in possesso di un codice operatore economico, il COE. Vale per le fatture verso altri operatori sammarinesi con un COE.

Sono esclusi i soggetti che **hanno dichiarato ricavi inferiori a 100.000 € nell'anno solare precedente**. Il testo non precisa, per il primo anno di applicazione, quale dichiarazione conti: è una verifica da fare oggi con chi tiene la contabilità, non a gennaio.

Due regole del decreto vanno lette con attenzione:

- **chi supera la soglia, o sceglie di aderire, resta nella fatturazione elettronica anche negli anni successivi.** Un anno sotto i 100.000 € non riporta alla carta;
- **chi resta escluso emette fatture cartacee, ma con gli stessi dati delle elettroniche.** Dal 2027 anche la fattura su carta riporta quello che il regolamento tecnico richiede, compreso il tipo merce.

## Il formato: la fattura italiana, con regole sammarinesi

Il file è un XML nel formato FatturaPA, lo stesso usato in Italia, secondo lo schema pubblicato dall'Ufficio Tributario. Sopra, il Documento B aggiunge vincoli che valgono solo per le operazioni interne.

| Elemento | Regola sammarinese |
|---|---|
| Codice destinatario | sempre sette zeri, 0000000: la fattura arriva nell'area riservata del cliente su TribWeb |
| Chi emette e chi riceve | identificati dal prefisso SM e dal COE; HUB-SM verifica che il cliente esista in Anagrafe Tributaria, altrimenti scarta il file |
| Imposta | non si espone: aliquota zero e natura N4, il codice dell'operazione esente, su ogni riga e su ogni riepilogo |
| Tipo merce | obbligatorio su ogni riga con un importo, con uno dei cinque codici della tabella sotto |
| Tipi di documento | fattura, acconto, nota di credito, nota di debito, autofattura del cliente |
| Fatture per file | una sola |
| Nome del file | SM, il COE a cinque cifre, un progressivo; un nome già usato non si riusa, nemmeno dopo uno scarto |

Il tipo merce serve alla gestione dell'imposta monofase, cioè l'imposta sammarinese sulle importazioni, che fra operatori sammarinesi non si espone come voce separata. I codici sono cinque:

| Codice | Che cosa indica |
|---|---|
| 1 | materie prime |
| 2 | servizi in conto lavoro con materie prime |
| 3 | servizi in conto lavoro senza materie prime, e prestazioni di servizi (Legge 131/1991) |
| 4 | beni di consumo |
| 7 | beni strumentali |

Una fattura contiene un solo gruppo: beni (codici 1, 4 e 7), oppure conto lavoro con materie prime (2), cioè una lavorazione per un'altra azienda con materiale proprio, oppure servizi (3). **Chi vende beni e servizi allo stesso cliente emette due fatture.** Conviene saperlo già quando si scrive il preventivo.

Per i beni e per il conto lavoro con materie prime il documento di trasporto è obbligatorio, e la fattura ne riporta numero e data. Per i servizi è facoltativo.

## Il percorso: HUB-SM e TribWeb

Le fatture interne passano da HUB-SM, la struttura dell'Ufficio Tributario che già gestisce l'interscambio con l'Italia. Le strade per trasmettere sono due: il caricamento del file da TribWeb, l'applicazione dell'Ufficio Tributario nel Portale della Pubblica Amministrazione, oppure il collegamento diretto del gestionale con HUB-SM, attraverso un web service.

Entrambe richiedono un **token**, cioè un codice di accesso personale, che si genera da TribWeb. È legato al profilo dell'utente che lo ha generato, vale un anno, e quello già usato per le fatture verso l'Italia vale anche per le interne.

Il file attraversa due controlli. Al caricamento HUB-SM calcola l'impronta del file, un codice ricavato dal suo contenuto che cambia se cambia anche un solo carattere, e ne verifica la struttura; poi, nell'elaborazione programmata, ne verifica il contenuto. Un file che supera entrambi viene messo a disposizione del cliente nella sua area riservata, e chi lo ha trasmesso riceve la ricevuta di consegna.

Due conseguenze pratiche:

- **una fattura scartata si considera non emessa.** Va corretta e trasmessa di nuovo, con un nome di file diverso, entro il termine;
- **la fattura si perfeziona con la ricevuta di consegna**, o con quella di impossibilità di recapito. Fino a quel momento è un file inviato, non un documento emesso.

Nel periodo facoltativo ogni azienda sceglie su TribWeb la propria **data di avvio**, dal menu *Anagrafiche → Contribuente → «Modifica Inizio FE interna SM»*. La data si può cambiare fino al giorno prima; poi è definitiva, e da quel giorno le fatture interne si emettono in formato elettronico. HUB-SM accetta le fatture interne di un'azienda solo a partire dalla sua data di avvio.

## I termini: due mesi, e da quando si contano

Il decreto fissa un termine per ogni tipo di operazione, e il Documento B lo traduce in una formula:

| Operazione | Termine di trasmissione |
|---|---|
| cessione di beni | fine del secondo mese successivo alla data del documento di trasporto |
| prestazione di servizi | fine del secondo mese successivo all'ultimazione del servizio; il controllo di HUB-SM lo conta dalla data della fattura |
| acconto o pagamento anticipato | fine del secondo mese successivo al pagamento, per l'importo pagato |

Se l'ultimo giorno è festivo, il termine passa al primo giorno non festivo. Un esempio: per merce consegnata con un documento di trasporto del 10 marzo 2027, la fattura va trasmessa entro il 31 maggio 2027.

La fattura si può sempre emettere prima. Per i rapporti continuativi oltre l'anno, senza pagamenti nel periodo, il termine cade alla fine del secondo mese dopo ogni anno solare.

![Una fattura interna in Invoice Scope, da un'azienda sammarinese a un'altra: tipo merce «Servizi», aliquota zero e natura N4 su ogni riga, e in alto il termine entro cui va trasmessa.](https://ggtechnologies.sm/assets/shot-invoice-scope-sm-fattura-it.png)

## Il cliente ha un obbligo suo

Si legge facilmente come un obbligo del fornitore, ed è del cliente. Se il cliente non riceve la fattura nei termini, **trascorsi due mesi dalla scadenza del fornitore ha trenta giorni per trasmettere lui un documento sostitutivo**: un'autofattura elettronica, che le regole tecniche chiamano TD29. Chi non è obbligato alla fattura elettronica presenta all'Ufficio Tributario un documento cartaceo con gli stessi dati.

La sanzione, se il cliente non provvede, è la stessa del fornitore: 100 €. Per un'azienda vuol dire tenere sotto controllo anche le fatture **in arrivo**, non solo quelle in uscita.

![Gli acquisti in Invoice Scope: per una spesa presso un fornitore sammarinese la fattura non è arrivata, e l'app segnala l'autofattura con il termine entro cui trasmetterla.](https://ggtechnologies.sm/assets/shot-invoice-scope-sm-acquisti-it.png)

## La conservazione resta a voi

L'Ufficio Tributario **non conserva le fatture per conto delle aziende**. Mette a disposizione un servizio di consultazione e di acquisizione in un'area di HUB-SM, ma la conservazione resta in capo all'operatore economico. Il decreto rinvia le regole a regolamenti successivi del Congresso di Stato, e fissa i termini a quelli dell'articolo 100 della Legge 166/2013.

Conviene quindi decidere fin da ora dove stanno, per ogni fattura, il file XML trasmesso e la ricevuta di HUB-SM. La ricevuta riporta l'impronta del file: confrontarla con quella del file conservato dimostra che il documento non è cambiato.

## Con l'Italia e con l'estero

Per un'azienda sammarinese i flussi diventano tre, con tre regole diverse:

- **verso l'Italia** la fattura elettronica esiste dal 1° ottobre 2021 e passa da HUB-SM al Sistema di Interscambio italiano. Le fatture di prestazioni di servizi e di conto lavoro non vengono inoltrate, quindi al cliente italiano vanno consegnate per altra via;
- **verso un altro sammarinese** vale la nuova fattura interna descritta qui. Il formato è lo stesso, ma cambiano chi risulta come trasmittente, il codice destinatario e la natura dell'operazione;
- **verso altri paesi** nessuno dei due decreti prevede un formato elettronico: la fattura resta su carta, o in PDF.

I campi che cambiano fra il primo e il secondo caso sono proprio quelli che HUB-SM controlla. Per questo le regole del file non si scelgono dal solo paese di chi emette, ma dalla coppia: il paese di chi emette e quello di chi riceve.

## Cosa fare, in ordine

1. **Verificare la soglia con chi tiene la contabilità**, compresa la questione di quale anno conti per il 2027. La risposta decide tutto il resto.
2. **Controllare l'accesso a TribWeb**: chi in azienda ha un profilo, con quali deleghe, e se il token è attivo. Scade dopo un anno.
3. **Raccogliere il COE di ogni cliente sammarinese.** HUB-SM lo verifica in Anagrafe Tributaria, e un codice sbagliato fa scartare il file.
4. **Scegliere lo strumento che produce il file.** Il Documento B lo dice esplicitamente: ogni operatore deve dotarsi di propri strumenti informatici, per esempio un software gestionale. La trasmissione si può anche affidare a un delegato.
5. **Provare prima dell'obbligo.** La pagina ufficiale riporta le modalità di accesso a un ambiente di test di TribWeb; in alternativa si fissa una data di avvio nel periodo facoltativo e si comincia con poche fatture, sapendo che da quel giorno la carta non torna.
6. **Separare beni e servizi già nell'offerta**, perché finiranno in due fatture distinte.
7. **Considerare emessa una fattura solo con la ricevuta di consegna**, e conservare file e ricevuta insieme.
8. **Tenere uno scadenzario anche per le fatture dei fornitori sammarinesi**, per sapere in tempo quando scatta l'autofattura.

## Perché ne scriviamo

G&G Technologies è un'azienda sammarinese, e queste regole le abbiamo lette per intero per scrivere [Invoice Scope](https://ggtechnologies.sm/app/invoice-scope/), un'applicazione gratuita, con il codice pubblico, per preparare fatture elettroniche italiane e sammarinesi.

Per la fatturazione elettronica interna fa il lavoro descritto in questo articolo. Sceglie le regole del file dalla coppia dei paesi, scrive il codice destinatario a sette zeri, la natura N4 e il nome del file con il COE a cinque cifre, e un nome già usato non torna. Chiede il tipo merce una volta per documento, quindi beni e servizi non finiscono nella stessa fattura. Calcola il termine di trasmissione e lo mostra accanto al documento. Dagli acquisti rileva la fattura di un fornitore sammarinese che non arriva, e prepara la bozza dell'autofattura. Verso un paese senza formato elettronico non produce un file, e lo dice.

I limiti sono dichiarati nella sua scheda. L'applicazione non trasmette: il file si carica su TribWeb, come per le fatture verso l'Italia. Non si occupa della conservazione e non firma digitalmente. Gira nel browser, e i dati dei clienti restano sul computer di chi la usa.

Se il gestionale che usate già deve essere adeguato alle nuove regole, o avete un flusso che l'app non copre, si parte da lì: progettiamo e realizziamo anche software su misura.

## Fonti

- [Decreto Delegato 4 settembre 2026 n.133, *Disciplina delle fatture nell'interscambio di beni e servizi tra operatori economici sammarinesi*](https://www.finanze.sm/pub2/FinanzeSM/dam/jcr:cfa6c2d9-721b-4b43-8d79-35ef107c6401/DD133-2026.pdf) — soggetti obbligati e soglia (art. 2), termini (art. 3), scarto (art. 4), sanzioni (art. 6), obblighi del cliente (art. 7), conservazione (art. 8), calendario (art. 11).
- [Regolamento 10 settembre 2026 n.28](https://www.finanze.sm/pub2/FinanzeSM/dam/jcr:e881d660-d2cf-4f9a-90fa-4741d221afab/R028-2026.pdf) — adotta le regole tecniche, aggiornabili con circolare dell'Ufficio Tributario.
- [Documento A, *Specifiche tecniche della fattura elettronica*](https://www.finanze.sm/pub2/FinanzeSM/dam/jcr:99b8a6ab-e50c-4129-88ad-84c98d772768/DOCUMENTO%20A%20.pdf) — la struttura del file, campo per campo, e la verifica del COE in Anagrafe Tributaria.
- [Documento B, *Modalità di trasmissione, ricezione e presentazione all'UO Ufficio Tributario*](https://www.finanze.sm/pub2/FinanzeSM/dam/jcr:2f14f48e-2e0a-415b-be19-af1824ff8d34/DOCUMENTI%20%20B.pdf) — codice destinatario, natura N4, tipo merce, nome del file, formule dei termini, data di avvio, strumenti informatici.
- [Segreteria di Stato per le Finanze e il Bilancio, *Fatturazione elettronica interna*](https://www.finanze.sm/pub2/FinanzeSM/FATTURAZIONE-ELETTRONICA-INTERNA.html) — la pagina ufficiale con norme, manuali tecnici, schemi e la presentazione pubblica del progetto.
- [Decreto Delegato 20 settembre 2021 n.163, *Della fattura elettronica nell'interscambio di beni e servizi con l'Italia*](https://www.finanze.sm/pub2/FinanzeSM/dam/jcr:d67f2bfb-a20f-4c43-b9a1-38b9d02c1102/17127484DD163-2021%20%282%29.pdf) — l'interscambio con l'Italia dal 1° ottobre 2021, e le prestazioni di servizi che non vengono inoltrate al Sistema di Interscambio (art. 5).

---

*Questo articolo ha finalità informative e non costituisce consulenza fiscale. Riflette i testi pubblicati al 6 ottobre 2026: le regole tecniche possono essere aggiornate con circolare dell'Ufficio Tributario. Per un caso specifico è opportuno rivolgersi al proprio commercialista o all'Ufficio Tributario.*
