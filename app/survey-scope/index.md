---
title: "Survey Scope — questionari NIS2 e maturità AI | G&G Technologies"
description: "Questionari di autovalutazione su maturità AI e NIS2, da distribuire alle unità e raccogliere in un elenco. Gira nel browser: le risposte restano in locale."
publisher: "G&G Technologies"
lang: it
canonical: https://ggtechnologies.sm/app/survey-scope/
translation: https://ggtechnologies.sm/en/app/survey-scope/index.md
---

# I questionari da dare a tutte le unità che valutate.

*App gratuita, codice pubblico*

Oggi sono due: la maturità sull'intelligenza artificiale e un controllo sulla NIS2. Reparti, uffici, associati, partecipate: ciascuno sceglie il questionario, risponde a ventidue domande sul proprio computer ed esporta un file. Voi li raccogliete in un elenco solo, e ogni compilazione ha il suo punteggio su sei dimensioni e le sue tre cose da fare per prime.

Categoria · [Gestionale](https://ggtechnologies.sm/app/?tag=gestionale)

- [Aprite l'app](https://ggtechnologies.sm/app/survey-scope/run/)
- [Codice sorgente](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/survey-scope)

*Il punto di partenza*

## Un'autovalutazione misura come l'azienda si racconta.

Di questionari di autovalutazione ne esistono molti, e quasi tutti restituiscono un livello. Il problema è noto a chi li scrive: l'azienda che risponde è la stessa che viene valutata, quindi il numero dipende da come sceglie di raccontarsi. Un questionario che finge di non saperlo promette una misura e consegna un'impressione.

Survey Scope lo dice nella prima riga del report, e poi lavora perché conti meno. Ogni domanda chiede un fatto accaduto invece di uno stato che dura: non «avete una procedura», ma «l'ultima volta che è andato storto qualcosa, chi se n'è accorto per primo». Un fatto o c'è stato o no, e chi risponde se ne accorge mentre risponde.

Le domande sono tutte leggibili: sono file JSON dentro l'app, una cartella per questionario, con licenza Apache-2.0. Quelle sull'AI hanno attraversato tre riscritture e tre misure. La stessa idea che sta sotto al nostro lavoro sull'[intelligenza artificiale](https://ggtechnologies.sm/servizi/intelligenza-artificiale/) — chi decide deve poter controllare su cosa sta decidendo.

È anche il motivo per cui conviene somministrarlo a più unità insieme. Venti compilazioni della stessa impresa dicono dove i reparti non sono d'accordo; venti compilazioni di associati diversi dicono dove il settore ha lo stesso buco. In tutti e due i casi la domanda utile non è la media, ma quanto le risposte si discostano fra loro.

![L'interfaccia dell'app, in esecuzione nel browser.](https://ggtechnologies.sm/assets/shot-survey-scope-it.png)

### Cosa fa

- Due questionari, da scegliere all'inizio: la maturità sull'AI e un controllo sulla NIS2. Ventidue domande ciascuno.
- Una domanda per schermata, con le risposte già scritte: si sceglie, non si compila.
- Un punteggio per ciascuna delle sei dimensioni del questionario, prima del totale.
- Tre cose da cui partire, scelte dalle dimensioni con il punteggio più basso.
- Gli obblighi europei che riguardano il questionario — quattordici sull'AI, dieci sulla NIS2 — ognuno con la data da cui vale e il collegamento al testo.
- Un report stampabile, che resta leggibile anche su una stampante in bianco e nero.
- Esportazione in JSON e in CSV, con l'impronta dell'edizione del questionario dentro il file. Scegliendo una cartella, i risultati ci finiscono da soli a ogni modifica, con una copia al giorno: dentro Dropbox o iCloud, il backup viaggia da sé.
- Le risposte si salvano a ogni passo: ci si può fermare a metà e riprendere.
- Un modulo di approfondimento facoltativo, dove il questionario ce l'ha, per chi vuole raccontare come ci è arrivato.
- Rifacendolo fra sei mesi, il confronto fra i due file dice più del numero di oggi.
- Ogni questionario ha un nome, e si ritrova in un elenco che si cerca per nome o per data.
- I file ricevuti da altri si caricano nello stesso elenco, e lo stesso file caricato due volte resta una riga sola.
- Ogni file porta l'impronta dell'edizione: se qualcuno ha risposto a una versione diversa delle domande, si vede subito.
- Esporta il modello di un questionario in un file, da modificare con un editor di testo e ricaricare con un'altra chiave: diventa uno dei modelli selezionabili.
- Un modello caricato resta sul vostro computer come tutto il resto, e si toglie in qualsiasi momento senza toccare le compilazioni già fatte.

### Cosa non fa

- Non verifica niente: nessuna risposta viene controllata da nessuno.
- Non è una certificazione e non è un parere legale.
- Non fa confronti con altre aziende: dietro non c'è nessuna base dati, e un confronto fra autovalutazioni non verificate non direbbe niente.
- Non raccoglie niente per conto vostro. Non c'è un server: distribuendolo, i risultati ve li mandano le persone e li caricate voi.

*In breve*

#### Dati

Restano sul vostro computer. Dopo il caricamento della pagina l'app non fa richieste di rete.

#### Durata

Dieci minuti circa. Ci si può fermare a metà: le risposte già date restano.

#### Questionari

Due nostri — maturità sull'AI e NIS2 — più quelli caricati da voi. Si sceglie all'inizio, e ogni compilazione porta scritto a quale risponde.

#### Conformità

Un elenco per questionario, con la data da cui l'obbligo vale e il collegamento alla fonte. Verificato ad agosto 2026; dopo la scadenza l'app lo dichiara.

#### Esportazione

JSON e CSV. Il file porta con sé l'edizione del questionario e la sua impronta, così chi lo legge sa a quali domande risponde.

#### Senza connessione

Dopo la prima apertura funziona anche senza rete.

#### Aggiornamenti

Automatici. Accanto al nome dell'app c'è la versione; quando ne è pronta una nuova, la scritta lo segnala e basta toccarla per passare. Per saperlo il browser rilegge un file dell'app dal nostro sito, https://ggtechnologies.sm/app/survey-scope/run/sw.js: è l'unica richiesta dopo il caricamento, e non contiene dati vostri.

#### Installazione

Facoltativa. Si apre nel browser, e dove il sistema lo permette si installa come un'app normale.

#### Più aziende

Lo stesso questionario dato a molti: ognuno risponde sul proprio computer ed esporta un file, che voi caricate nel vostro elenco. La raccolta la fate voi, non un server.

#### Lingue

L'interfaccia è in italiano e in inglese, e segue la lingua del browser. I questionari per ora sono in italiano.

#### Licenza

PolyForm Shield 1.0.0 per il codice: un prodotto concorrente richiede una licenza commerciale. Le domande sono file JSON dentro l'app, con licenza Apache-2.0: chi le vuole adattare può farlo, anche in un lavoro commerciale.

#### Avvertenza

È un'autovalutazione. Non è una certificazione, non è un parere legale e non sostituisce i vostri consulenti.

**Versione** 1.31.1 · **Aggiornata il** 25 settembre 2026 · **Licenza** PolyForm-Shield-1.0.0 · [Codice sorgente](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/survey-scope)

*FAQ*

## Domande frequenti

### A cosa mi serve un punteggio che mi sono dato da solo?

A due cose che un punteggio dato da altri non fa. La prima è il confronto nel tempo: lo stesso questionario fra sei mesi dice se qualcosa si è mosso. La seconda è il confronto dentro l'azienda — conviene farlo compilare anche a chi il lavoro lo fa, e guardare le domande su cui le risposte divergono. Sono quelle che meritano una discussione.

### Come raccolgo i risultati di venti unità?

Ciascuna compila sul proprio computer e vi manda il file che esporta. Il file si carica da «Importa un file esportato»: entra nel vostro elenco, si cerca per nome, e l'impronta dell'edizione indica se qualcuno ha risposto a domande diverse. Il CSV ha nomi di colonna stabili, quindi i file si impilano in un foglio solo. Non c'è un server in mezzo: i file arrivano per gli stessi canali con cui già vi scambiate i documenti.

### Serve qualcuno che coordini la rilevazione?

Sì, ed è una scelta di progetto. Senza un server nessuno vede le risposte prima che gliele mandino: è quello che permette di distribuire l'app senza chiedere niente a nessuno, e comporta che la raccolta la faccia una persona. In pratica sono tre cose: mandare l'indirizzo, ricevere i file, caricarli. L'app tiene l'elenco, la ricerca per nome e il controllo che tutti abbiano risposto alla stessa edizione delle domande.

### Potete adattarlo per le aziende che seguo?

Sì, e potete farlo in autonomia. Dall'app si esporta il modello del questionario — domande, testi del report e voci di conformità in un file solo — lo si apre con un editor di testo, si cambia quello che serve, gli si danno una chiave e un titolo diversi e lo si ricarica: da quel momento è uno dei questionari che si scelgono in cima. Resta sul vostro computer, e i risultati portano la sua chiave, quindi non si confondono con i nostri. Il formato è quello dei file con licenza Apache-2.0: si possono cambiare, tradurre o sfoltire. Cambiando le domande cambia l'impronta, quindi i risultati della vostra versione restano riconoscibili da quelli di questa.

### Le voci sulla conformità dicono se sono in regola?

No, e nessuno può dirlo guardando un elenco di caselle. Ogni riga dice quale obbligo esiste, da quando vale e dove leggerlo; il giudizio resta a voi e ai vostri consulenti. Le date sono verificate, e l'app dichiara quando la verifica è scaduta.

### Come verifico che le risposte restino sul mio computer?

Potete verificarlo direttamente. Aprite gli strumenti per sviluppatori del browser, scheda «Rete», e compilate il questionario: dopo il caricamento della pagina non compare nessuna richiesta — tranne una, di tanto in tanto: il browser rilegge https://ggtechnologies.sm/app/survey-scope/run/sw.js, un file dell'app stessa, per sapere se c'è una versione nuova. È una lettura dal nostro sito, e non contiene dati vostri. Il codice è pubblico, quindi è possibile anche leggere cosa fa.

### Posso usare il codice in un mio prodotto?

Sì, per il vostro lavoro e per prodotti che svolgono un compito diverso. La licenza è la PolyForm Shield 1.0.0: il codice si legge, si modifica e si usa anche in un lavoro commerciale, a due condizioni. Ogni copia porta con sé la licenza e le righe «Required Notice», che nominano G&G Technologies come autore. Un prodotto che svolge lo stesso compito dell'app, venduto o gratuito, esteso o con un proprio server, richiede una licenza commerciale: si chiede a [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm).

### Perché le domande chiedono cosa è successo invece di cosa c'è?

Perché a «avete una procedura» si risponde di sì anche quando la procedura è un file che nessuno apre. A «l'ultima volta che è andato storto qualcosa, chi se n'è accorto per primo» si risponde con un ricordo, e il ricordo o c'è o non c'è. È la regola che ha guidato l'ultima riscrittura del questionario.

### Come si aggiorna l'app, una volta installata?

Da sola, e lo segnala. Accanto al nome dell'app c'è la sua versione. Quando ne è pronta una nuova, la scritta mostra tutt'e due — quella installata e quella in arrivo — con un punto verde: toccandola, l'app si ricarica aggiornata e i vostri dati restano dove sono. Altrimenti la versione nuova entra comunque alla prossima apertura. Se l'app è stata installata prima che esistesse questo avviso, la prima volta va fatto a mano: si chiudono tutte le finestre dell'app e la si riapre; se accanto al nome la versione non compare ancora, si ricarica la pagina con Ctrl+F5, o ⌘⇧R su Mac. Da lì in poi provvede l'app.

### E per toglierla?

La rimozione la fa il sistema, non l'app: nessun sito può disinstallarsi da solo, ed è una buona regola. Dentro l'app installata, accanto al nome, c'è «Installata»: toccandolo, l'app indica dov'è il comando sul vostro sistema. Un punto da sapere: togliere l'app lascia i dati dove sono, e cancellare i dati lascia l'app dov'è. Se i dati non servono più, conviene esportare prima l'archivio.

## Una rilevazione su più unità

Un'impresa con i propri reparti, un ente con i propri uffici, un incubatore con le partecipate, un'associazione di categoria con gli associati. Il giro è sempre lo stesso: si manda l'indirizzo dell'app, ciascuno compila sul proprio computer, esporta il file e ve lo rimanda, e voi lo caricate nel vostro elenco. L'app si distribuisce così com'è. Se vi serve una versione adattata — altre domande, il vostro marchio, una dimensione in più — descriveteci il caso. Risponde una persona del team.

- [Scriveteci](mailto:info@ggtechnologies.sm?subject=Survey%20Scope%20%E2%80%94%20una%20versione%20adattata)
- [Chiamateci](tel:+3780549900824)

### [Intelligenza Artificiale](https://ggtechnologies.sm/servizi/intelligenza-artificiale/)

Agenti che leggono documenti e interrogano i sistemi aziendali, con la misura decisa prima.

### [AI on-premise](https://ggtechnologies.sm/servizi/ai-on-premise/)

Come si sceglie fra tutto in locale, ibrido e cloud, a partire dai vostri dati.

### [DigiSense®](https://ggtechnologies.sm/digisense/)

Cosa c'è sotto, e perché il vostro progetto non parte da zero.
