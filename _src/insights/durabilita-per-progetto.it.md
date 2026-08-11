Il 31 luglio 2026 è passato da poco, e per chi progetta hardware ha cambiato una cosa: la durata di un dispositivo non è più una scelta etica del produttore. È un requisito con una data.

Fino a ieri, «quanto dura» era una promessa commerciale. Si scriveva nella brochure, si sottintendeva nel prezzo, e nessuno la verificava. Da adesso è un parametro di progetto, con soglie numeriche, scadenze e un punteggio stampato sull'etichetta.

Vale la pena metterlo in fila, perché tre norme diverse si stanno sovrapponendo su questo punto, e ciascuna arriva da una direzione differente.

## I numeri che non si discutono

Il *Global E-Waste Monitor 2024* — la quarta edizione, pubblicata da UNITAR e ITU il 20 marzo 2024 — misura quanto rifiuto elettronico il mondo produce e quanto ne recupera.

Nel 2022 il pianeta ha generato **62 milioni di tonnellate** di rifiuti da apparecchiature elettriche ed elettroniche. Di quella massa, il **22,3%** risulta documentato come raccolto e riciclato correttamente. Il resto ha seguito percorsi che nessuno traccia. Le proiezioni indicano il superamento degli **80 milioni di tonnellate annue entro il 2030**.

C'è anche una cifra economica: circa **62 miliardi di dollari** di materie prime recuperabili non risultano contabilizzati.

Sono numeri che si citano spesso, di solito per concludere che bisogna riciclare di più. È la conclusione sbagliata, o meglio, quella che arriva troppo tardi. Il riciclo agisce a fine vita, quando il prodotto è già stato progettato, venduto e buttato. La leva che conta sta all'inizio: quanto a lungo quel dispositivo resta utile.

È esattamente il punto su cui il legislatore europeo ha smesso di fare raccomandazioni e ha iniziato a scrivere requisiti.

## Tre regimi, tre date

Non è una norma sola, ed è questo che rende la materia scivolosa. Tre atti diversi convergono sullo stesso oggetto, con obblighi che ricadono su soggetti diversi.

| Norma | Da quando si applica | Che cosa impone |
|---|---|---|
| Ecodesign, Regolamento (UE) 2023/1670 | 20 giugno 2025 | requisiti minimi di progetto: batteria, ricambi, aggiornamenti, resistenza |
| Etichetta energetica, Regolamento (UE) 2023/1669 | 20 giugno 2025 | punteggio di riparabilità da A a E sull'etichetta |
| Diritto alla riparazione, Direttiva (UE) 2024/1799 | 31 luglio 2026, termine di recepimento | obbligo di riparare, e un anno in più di garanzia se scegli la riparazione |
| Batterie, Regolamento (UE) 2023/1542 | 18 febbraio 2027 | batterie portatili rimovibili e sostituibili dall'utente |

I primi due sono regolamenti: si applicano direttamente, uguali in tutta l'Unione. Il terzo è una direttiva, e va recepita da ciascuno Stato: significa ventisette leggi nazionali diverse a partire dallo stesso testo. Il quarto torna a essere un regolamento, e la sua data è la più vicina di tutte quelle ancora da venire.

## Cosa chiede l'ecodesign, in concreto

Il Regolamento 2023/1670 riguarda telefoni cellulari, telefoni cordless e tablet. Ma i requisiti che stabilisce sono la migliore descrizione disponibile di che cosa l'Unione intende per «dispositivo progettato per durare», e vale la pena leggerli anche se il tuo prodotto non rientra in quelle categorie: è la direzione, non l'eccezione.

I punti che cambiano il progetto:

- **La batteria deve reggere almeno 800 cicli di carica** mantenendo almeno l'80% della capacità iniziale.
- **I ricambi critici vanno forniti in 5-10 giorni lavorativi**, e restano dovuti per almeno **7 anni** dopo che il modello esce dal mercato europeo.
- **Gli aggiornamenti del sistema operativo vanno garantiti per almeno 5 anni** dalla data in cui è venduta l'ultima unità del modello.
- **I riparatori professionali devono avere accesso equo** al software e al firmware necessari alla riparazione.
- Il dispositivo deve resistere a cadute, graffi, polvere e acqua secondo soglie definite.

E poi c'è la parte che si vede: sull'etichetta energetica compare un **punteggio di riparabilità da A a E**, con A che indica il prodotto più riparabile. Finisce nella banca dati pubblica EPREL, quindi è confrontabile.

Un punteggio confrontabile e pubblico è una cosa diversa da un obbligo di legge. Un obbligo lo rispetti o no; un punteggio ti mette accanto ai concorrenti su uno scaffale, e la lettera che ti tocca dipende da decisioni prese in fase di progetto, anni prima.

## Il vincolo che si sottovaluta è il software

Fra tutti i requisiti, quello che pesa di più sul modo di lavorare è il meno appariscente: cinque anni di aggiornamenti dopo l'ultima unità venduta.

Se un modello resta a catalogo tre anni, quell'obbligo copre otto anni dal lancio. Otto anni in cui bisogna mantenere una toolchain, ricompilare, testare su hardware che nel frattempo non si produce più, e tenere in piedi le competenze di chi quel codice l'ha scritto.

È un impegno di manutenzione, non una funzione da consegnare. E ha una conseguenza sull'architettura: un prodotto che dipende da un servizio cloud proprietario eredita la vita di quel servizio. Se il servizio chiude, il dispositivo diventa inerte anche se l'hardware funziona ancora perfettamente.

Da qui una regola di progetto che vale la pena scrivere prima di iniziare: **la funzione essenziale del dispositivo deve funzionare senza rete.** Il cloud può aggiungere, non può essere il presupposto. È lo stesso principio che ci porta a far girare i modelli a bordo o in sede invece che su server di altri — e vale per la durata quanto per la riservatezza.

## La batteria decide quanto vive il prodotto

Il 18 febbraio 2027 è la data più vicina fra quelle ancora aperte, ed è quella che tocca più direttamente il disegno meccanico.

Dal Regolamento (UE) 2023/1542, le batterie portatili devono essere **facilmente rimovibili e sostituibili dall'utente finale**, senza strumenti speciali, solventi, calore o competenze professionali. Chi progetta un involucro incollato ha poco più di un anno per cambiare approccio.

Non è una questione di conformità e basta. Nella maggior parte dei dispositivi portatili la batteria è il primo componente a esaurirsi: molto prima del processore, dello schermo o dei sensori. Un prodotto in cui la batteria non si cambia ha una vita utile pari a quella della sua cella, qualunque cosa dica il resto della scheda tecnica.

Nei dispositivi indossabili in ambito medicale questo si intreccia con altri vincoli — tenuta all'acqua, sterilizzabilità, dimensioni — che spingono nella direzione opposta. È un compromesso ingegneristico vero, e non ha una soluzione di catalogo: va deciso a monte, sapendo che cosa si sta scambiando con cosa.

## Cosa la direttiva non copre

Qui serve onestà, perché intorno al diritto alla riparazione circola più entusiasmo di quanto il testo giustifichi.

L'estensione di garanzia — **dodici mesi in più** quando scegli la riparazione invece della sostituzione — si applica ai beni di consumo in generale. Quella è larga.

L'obbligo del produttore di riparare in tempi e a costi ragionevoli, invece, **vale solo per i prodotti già coperti da requisiti di riparabilità europei**, elencati nell'Allegato II della direttiva. Oggi sono, fra gli altri, lavatrici e lavasciuga, lavastoviglie, frigoriferi, display elettronici, server e prodotti per l'archiviazione dati, telefoni cellulari e cordless, tablet, asciugatrici. Le batterie di biciclette e monopattini elettrici entrano dal 18 febbraio 2027.

Tre limiti che è meglio conoscere prima di costruirci sopra una strategia:

1. **«Ragionevole» non è definito.** Il testo chiede prezzi ragionevoli per ricambi e strumenti, senza dire che cosa significhi. Sarà la prassi a stabilirlo.
2. **Il recepimento è disomogeneo.** Al 30 luglio 2026 solo una minoranza di Stati membri aveva notificato alla Commissione di aver completato il recepimento. Chi vende in più paesi, per un po', avrà obblighi diversi in ciascuno.
3. **Gli strumenti di supporto arrivano dopo.** La piattaforma europea per la riparazione avrà l'interfaccia comune entro il 31 luglio 2027 e sarà pienamente operativa dal 1° gennaio 2028. Le misure nazionali di incentivo vanno notificate entro il 31 luglio 2029.

## San Marino, e perché non cambia niente

Progettiamo dalla Repubblica di San Marino, che non è uno Stato membro dell'Unione. Ci viene chiesto spesso se questo cambi qualcosa. Non lo cambia, e la ragione è semplice.

La normativa di prodotto europea si applica in base a **dove il prodotto viene immesso sul mercato**, non a dove è stato disegnato. Un dispositivo destinato a un cliente in Italia, in Germania o in Francia deve rispettare quei requisiti a prescindere dalla sede di chi l'ha progettato. Ragionare al contrario è un errore che si paga alla fine, quando il prodotto è finito e cambiare l'involucro costa quanto rifarlo.

## Sette decisioni da prendere in fase di progetto

Non sono adempimenti da spuntare a valle. Sono scelte che, se prese dopo, costano un riprogetto.

1. **Decidi la vita utile del prodotto prima dell'architettura**, e scrivila. Da quel numero discendono batteria, ricambi, aggiornamenti e costo di manutenzione.
2. **Rendi la batteria sostituibile**, o accetta consapevolmente che la vita del prodotto sia quella della cella. Se il vincolo è reale — tenuta, dimensioni, sterilizzazione — mettilo per iscritto insieme a ciò che ti costa.
3. **Conta i ricambi che dovrai tenere a magazzino** per sette anni dopo la fine delle vendite, e includili nel costo del prodotto, non in quello del servizio post-vendita.
4. **Tratta gli aggiornamenti software come un impegno pluriennale**, con un responsabile e un budget. Non come una voce del piano di lancio.
5. **Non far dipendere la funzione essenziale da un servizio remoto.** Se il tuo cloud si spegne, l'oggetto deve continuare a fare la cosa per cui è stato comprato.
6. **Documenta la procedura di smontaggio mentre progetti**, non alla fine. Se serve un ingegnere per scriverla dopo, vuol dire che il prodotto non era pensato per essere aperto.
7. **Verifica il punteggio di riparabilità che otterresti oggi**, con il progetto com'è adesso. È l'unico modo per scoprire in tempo che la lettera non ti piace.

## Cosa significa per come lavoriamo

Non abbiamo una scorciatoia da vendere su questo. La conformità a queste norme non è un modulo da compilare: è il risultato di decisioni prese nelle prime settimane di un progetto, quando ancora sembra che ci sia tempo per tutto.

Quello che possiamo dire è come lo affrontiamo. DigiSense®, il framework su cui costruiamo le implementazioni con sensori, AI e robot, tiene separati l'acquisizione dei dati, l'elaborazione e il controllo della macchina. Non è nato per la durabilità — è nato perché tre livelli distinti si aggiornano indipendentemente. Ma l'effetto è quello: un modulo che cambia non trascina con sé gli altri, e un prodotto che deve restare aggiornato per otto anni ne guadagna.

Se stai progettando un dispositivo, o ne hai uno a catalogo che dovrà rientrare in queste regole, la conversazione utile è presto e su carta: quale vita utile stai promettendo, e che cosa nel progetto attuale la contraddice.

## Fonti

- [Global E-Waste Monitor 2024 — UNITAR, ITU](https://ewastemonitor.info/the-global-e-waste-monitor-2024/) — dati 2022 su produzione, raccolta e riciclo dei rifiuti elettronici, e proiezioni al 2030.
- [Regolamento (UE) 2023/1670 — requisiti di ecodesign per smartphone, telefoni cordless e tablet](https://eur-lex.europa.eu/eli/reg/2023/1670/oj/eng) — testo dell'atto.
- [Regolamento delegato (UE) 2023/1669 — etichettatura energetica](https://eur-lex.europa.eu/eli/reg_del/2023/1669/oj/eng) — punteggio di riparabilità e informazioni di prodotto.
- [Commissione europea, «New EU rules for durable, energy-efficient and repairable smartphones and tablets start applying», 20 giugno 2025](https://single-market-economy.ec.europa.eu/news/new-eu-rules-durable-energy-efficient-and-repairable-smartphones-and-tablets-start-applying-2025-06-20_en) — sintesi ufficiale dei requisiti in vigore.
- [Direttiva (UE) 2024/1799 sul diritto alla riparazione — sintesi EUR-Lex](https://eur-lex.europa.eu/EN/legal-content/summary/common-rules-promoting-the-repair-of-goods-and-amending-related-eu-legislation.html) — ambito, obblighi e termini.
- [Right to Repair Europe, «The Right to Repair Directive: what changes on 31 July?», 30 luglio 2026](https://repair.eu/news/the-right-to-repair-directive/) — stato del recepimento e prodotti coperti dall'Allegato II.
- [Regolamento (UE) 2023/1542 su batterie e rifiuti di batterie — sintesi EUR-Lex](https://eur-lex.europa.eu/EN/legal-content/summary/sustainability-rules-for-batteries-and-waste-batteries.html) — rimovibilità delle batterie portatili e scadenze.
- [Banca dati EPREL — Commissione europea](https://eprel.ec.europa.eu/screen/home) — registro pubblico delle etichette energetiche.
