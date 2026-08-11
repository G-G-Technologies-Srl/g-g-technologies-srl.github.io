In sala controllo c'è un raccoglitore. Dentro, il manuale della linea. Alla pagina delle soglie di allarme qualcuno ha corretto un numero a penna, e accanto ha scritto una data. Tre pagine dopo, un foglio stampato è infilato fra le buste di plastica: è la procedura nuova, quella che vale davvero.

Nessuno si fida più di quel raccoglitore, e tutti lo tengono lì.

Non è successo perché il manuale era scritto male. Era scritto bene, il giorno in cui è stato consegnato. È successo perché dentro erano mescolate due cose che hanno due vite diverse.

## Due scadenze sulla stessa pagina

Prendi una pagina qualsiasi di un manuale d'impianto e leggila frase per frase, facendoti una sola domanda: **quando smette di essere vera?**

Le risposte sono tre, e non di più.

- **Mai.** «Prima di aprire il carter, seziona l'alimentazione e verifica l'assenza di tensione.» Vale finché la macchina esiste.
- **Al prossimo aggiornamento.** «Soglia di allarme: 78 °C.» «Firmware 2.4.1.» «Coppia di serraggio secondo la tabella del fornitore.» Sono vere oggi.
- **È già falsa.** Il numero corretto a penna.

La prima categoria è la **procedura**: cosa si fa, in che ordine, e perché. La seconda è il **parametro**: un valore che qualcuno prima o poi cambierà. Sono contenuti diversi quanto un disegno meccanico e una bolla di consegna, e in quasi tutti i manuali stanno nella stessa frase.

Da qui viene tutto il resto. Se il parametro sta dentro la procedura, cambiare il parametro vuol dire riaprire il documento, rifare l'impaginazione, aggiornare l'indice di revisione, ristampare, distribuire e ritirare le copie vecchie. Costa così tanto che non si fa. E siccome non si fa, il documento resta sbagliato — non in modo evidente, ma in una riga sola, in mezzo a novanta pagine giuste.

**Un manuale sbagliato in una riga è più pericoloso di un manuale assente.** Quello assente si sa che manca; questo si legge con fiducia.

## La separazione, in pratica

Il rimedio non è scrivere meglio. È montare il documento in un altro modo: la procedura **rimanda** al parametro invece di contenerlo.

| Dove sta | Cosa ci scrivi | Chi lo cambia, e quando |
|---|---|---|
| Nel testo della procedura | l'azione, l'ordine, il motivo, il rischio | chi riprogetta la macchina, quasi mai |
| In una tabella con una data sopra | soglie, versioni, ricambi, contatti, tarature | manutenzione e fornitori, di continuo |

Sulla pagina la differenza è piccola: dove c'era «porta la temperatura a 78 °C» adesso c'è «porta la temperatura al valore indicato in T-04». La tabella T-04 sta in fondo, o su uno schermo, o su un foglio che si sostituisce senza toccare il resto. Ha una data di aggiornamento e un responsabile.

Il rimando però sposta il rischio, non lo elimina: una procedura che punta a una tabella assente non si esegue. Perciò la tabella va dove sta chi lavora — a bordo macchina, non in allegato — e la procedura dice cosa fare quando non la trova.

Nell'uso quotidiano cambia tutto. Cambiare una soglia diventa una riga da correggere in un punto solo, e chiunque sia in turno può verificare quando è stata corretta l'ultima volta. Il documento smette di invecchiare tutto insieme.

Ne seguono tre cose.

**Le traduzioni non divergono.** Un numero dentro una frase va ritradotto in ogni lingua. Un numero in una tabella condivisa si aggiorna una volta.

**Le contraddizioni si vedono.** Se la stessa soglia compare nel manuale, nel programma del PLC e nell'etichetta a bordo macchina, prima o poi le tre copie divergono, e a quel punto nessuno sa quale sia buona. Con una sorgente sola non possono divergere: o sono giuste tutte, o è sbagliata quella.

**Si può controllare in automatico.** A una condizione, che è il punto: i parametri devono stare in un file che un programma legge senza aprirlo — un foglio di calcolo, un CSV — non impaginati dentro un PDF. A quel punto il controllo è banale: manca un valore, la data è più vecchia di un anno, il firmware citato non esiste più. È il tipo di errore che una rilettura umana non trova mai, perché per trovarlo bisognerebbe ricordarsi a memoria novanta pagine.

## È una decisione di progetto, non di redazione

La separazione fra procedura e parametro non si può fare alla fine, quando il manuale si scrive. A quel punto il testo esiste già, i valori sono già sepolti dentro le frasi, e rifarlo costa quanto scriverlo. Si fa **quando si progetta la macchina**, decidendo quali grandezze sono configurabili e quali no — che è una decisione tecnica, non editoriale.

La domanda giusta, in fase di progetto, è questa: *di questo valore, chi risponde fra tre anni?* Se la risposta è «il manutentore», quel valore non va scritto in un paragrafo. Se la risposta è «nessuno lo toccherà mai», può stare nel testo.

Chi progetta e chi documenta di solito sono due persone diverse, che si parlano alla fine. È lì che nasce il raccoglitore in sala controllo.

## Il quadro normativo sta cambiando

L'obbligo di corredare una macchina di istruzioni non è nuovo, e non è una formalità: fa parte di quello che rende la macchina conforme. Stanno però cambiando le regole che lo disciplinano.

Il **Regolamento (UE) 2023/1230**, adottato il 14 giugno 2023 ed entrato in vigore il 19 luglio 2023, abroga la direttiva macchine 2006/42/CE, che resta in vigore fino al giorno in cui il regolamento comincia ad applicarsi. Quel giorno è fissato nell'articolo finale del regolamento: leggilo lì. Il regolamento dice anche in che forma vanno date le istruzioni e per quanto devono restare disponibili.

Tenere il parametro fuori dal testo non toglie niente al fascicolo tecnico: il parametro resta parte delle istruzioni, cambia solo dove è scritto. Quello che va tenuto è la tracciabilità — chi ha cambiato quel valore e quando — ed è esattamente quello che una tabella datata dà e una correzione a penna no.

Quello che non ti riportiamo sono i dettagli sui formati ammessi e sulle deroghe, e il motivo è lo stesso di cui parla questo articolo: **di riassunti di seconda mano ne circolano molti**, non tutti concordi. Se stai pianificando, leggi gli articoli e gli allegati nel testo pubblicato in Gazzetta ufficiale, che trovi in fondo. È l'unica versione che, quando cambia, lo dichiara.

Vale la pena aggiungere una cosa. Quello che il regolamento chiede è un risultato — istruzioni comprensibili, disponibili, aggiornate — non un modo di ottenerlo. Il modo è una scelta tua: meglio farla adesso, con calma, che di corsa sotto la scadenza.

## Chi ci ha già pensato, e da quanto

Esiste una norma tecnica dedicata solo a questo: **IEC/IEEE 82079-1:2019**, *Preparation of information for use (instructions for use) of products*. Seconda edizione, pubblicata nel maggio 2019, centotrenta pagine, sviluppata insieme da IEC, IEEE e ISO. Copre le istruzioni d'uso di qualunque prodotto, dal più semplice agli impianti industriali completi.

È una norma orizzontale: nasce per essere richiamata da altre norme di settore, e da sola non si applica a niente. Ma la sua struttura dice una cosa utile a chi non la comprerà mai — che preparare le informazioni d'uso è un **processo con delle fasi**, e che quel processo sta fra i requisiti, non fra i consigli. Non è un documento da consegnare: è qualcosa che qualcuno deve gestire.

C'è poi un dettaglio. Nel catalogo ISO la norma è in stato «da rivedere» dal 12 giugno 2023, e una nuova edizione è in preparazione.

**Anche la norma su come si scrivono le istruzioni ha una data di scadenza.** Se cerchi un motivo per non considerare definitivo nessun documento tecnico, è questo.

## Cosa fare, in ordine

1. **Prendi il manuale che hai e conta i numeri.** Non leggerlo: cerca le cifre, le versioni, i nomi di fornitore, i codici di ricambio. Quanti sono, e quanti sono ancora veri? È il lavoro di un pomeriggio e dice più di una revisione completa.
2. **Segna quelli che sono cambiati almeno una volta.** Sono i candidati: un valore che è già cambiato cambierà ancora.
3. **Portali fuori dal testo**, in un file che un programma legge senza aprirlo — un foglio di calcolo, un CSV — con una data e un responsabile per riga. Il testo li richiama con un codice. È il formato, non la tabella, a rendere possibile il punto 5.
4. **Decidi dove vive quella tabella**, e che sia un posto solo. Se la stessa soglia sta anche nel PLC o su un'etichetta, stabilisci quale delle tre è la sorgente e da dove derivano le altre.
5. **Metti un controllo automatico su quella tabella.** Anche minimo: un valore mancante, una data vecchia. Deve fermare qualcosa — un collaudo, una spedizione — altrimenti nessuno lo guarda.
6. **Sposta la decisione a monte, sul progetto della prossima macchina.** Per ogni grandezza configurabile: chi risponde di questo valore fra tre anni?
7. **Scrivi una data su tutto.** Ogni tabella, ogni schermata, ogni foglio: quando è stato aggiornato l'ultima volta. Una pagina senza data non si può né usare né buttare.

## Perché ne scriviamo

Progettiamo e realizziamo macchine e impianti, e la documentazione arriva sempre alla fine, quando il budget è finito e la voglia pure. Abbiamo smesso di considerarla un adempimento perché ci siamo accorti di una cosa: **il documento sbagliato torna indietro come chiamata di assistenza**, e la chiamata costa più di quanto sarebbe costato scrivere bene.

DigiSense®, il framework su cui costruiamo le implementazioni con sensori, AI e robot, tiene separati l'acquisizione dei dati, l'elaborazione e il controllo della macchina. La stessa separazione vale per quello che si scrive: la procedura da una parte, i valori che cambiano dall'altra, e un controllo che blocca la consegna invece di far uscire un documento che si contraddice.

Se hai un manuale che nessuno apre più, si parte da lì: quanti numeri contiene, e quanti sono ancora veri.

*Chi scrive è l'autore di* [Claude: la guida completa](https://angelogeminiani.github.io/claude-la-guida-completa/)*, manuale tecnico gratuito su un prodotto che cambia ogni settimana. È costruito con la separazione descritta qui: i dati con una scadenza stanno fuori dal testo, ognuno con la sua data, e il documento non si genera se un dato non torna. Non è una macchina — il meccanismo però è lo stesso, ed è pubblico.*

## Fonti

- [IEC/IEEE 82079-1:2019 — Preparation of information for use (instructions for use) of products — Part 1: Principles and general requirements](https://www.iso.org/standard/71620.html) — scheda di catalogo ISO: seconda edizione, pubblicata nel maggio 2019, 130 pagine, comitato ISO/TC 10/SC 1, stato «da rivedere» dal 12 giugno 2023.
- [IEC/IEEE CD 82079-1 — terza edizione, in preparazione](https://www.iso.org/standard/87206.html) — la revisione della norma citata sopra.
- [Regolamento (UE) 2023/1230 relativo alle macchine](https://eur-lex.europa.eu/eli/reg/2023/1230/oj/ita) — testo pubblicato in Gazzetta ufficiale dell'Unione europea: adottato il 14 giugno 2023, pubblicato il 29 giugno 2023, in vigore dal 19 luglio 2023; abroga la direttiva 2006/42/CE e la direttiva 73/361/CEE.
- [Direttiva 2006/42/CE relativa alle macchine](https://eur-lex.europa.eu/eli/dir/2006/42/oj/ita) — la disciplina vigente fino all'applicazione del regolamento.
