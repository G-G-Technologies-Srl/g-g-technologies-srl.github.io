Prima di comprare hardware per un progetto pilota, apri il cassetto dei telefoni dismessi. Dentro trovi un accelerometro, un giroscopio, un magnetometro, un ricevitore satellitare, una o più fotocamere, un sensore di luce, spesso un barometro, Wi-Fi, Bluetooth, un modem cellulare, una batteria, uno schermo e un processore.

È l'hardware più sottovalutato che un'azienda possieda. L'ha comprato, l'ha ammortizzato, e adesso lo tiene in un cassetto perché lo schermo è crepato.

Non è una proposta di riciclo virtuoso. È un modo per rispondere in fretta, e quasi senza spendere, alla domanda che blocca la maggior parte dei progetti IoT: **il dato che ti serve esiste, ed è abbastanza buono?**

Ci sono però dei confini oltre i quali questa strada diventa un errore. Contano più della strada stessa, e li trovi più avanti.

## Che cosa hai già a bordo

I sensori di uno smartphone sono componenti MEMS: gli stessi che compreresti come moduli separati. Qui però sono già montati, alimentati, calibrati in fabbrica e raggiungibili da un'unica interfaccia software.

L'inventario tipico di un telefono di fascia media degli ultimi anni:

- **Accelerometro** — misura l'accelerazione sui tre assi, gravità compresa. Serve per vibrazioni, urti, orientamento, conteggio dei passi.
- **Giroscopio** — misura la velocità di rotazione. Insieme all'accelerometro dice come è orientato l'oggetto e come si sta muovendo.
- **Magnetometro** — è la bussola del telefono. Rileva anche il passaggio di masse metalliche, per esempio un carrello o una porta di ferro che si apre.
- **Ricevitore satellitare** — GPS, e sui modelli recenti anche GLONASS, Galileo e BeiDou insieme.
- **Sensore di luce** — misura quanta luce c'è, in lux.
- **Barometro** — misura la pressione dell'aria. C'è su molti modelli di fascia media e alta, e permette di distinguere un piano dall'altro o di accorgersi che una porta si è aperta in un ambiente chiuso.
- **Sensore di prossimità** — a infrarossi, vede se qualcosa è vicino entro pochi centimetri.
- **Fotocamere** — spesso più di una, con ottiche diverse e stabilizzazione.
- **Microfoni** — di solito due o tre, e con più microfoni si può stimare da che parte arriva un suono.

Poi c'è la parte che di solito costa più dei sensori: la connessione di rete, la memoria, un sistema operativo che gestisce i consumi e abbastanza potenza di calcolo per far girare a bordo un modello di visione o di classificazione.

Su una scheda a microcontrollore, mettere insieme le stesse cose vuol dire una decina di componenti da scegliere e un mese di lavoro per farli parlare fra loro.

## Il vantaggio non è il risparmio

È il fraintendimento più comune. Il punto non è avere sensori gratis: i moduli MEMS costano pochi euro, e su un progetto vero quel risparmio non si nota.

Il vantaggio è **quanto ci metti ad avere il primo dato**.

Con un telefono passano poche ore fra l'idea e la prima misura vera. Puoi mettere il dispositivo dove servirà davvero — sul macchinario, sul mezzo, addosso alla persona — e guardare i numeri prima di aver deciso qualsiasi cosa sull'architettura.

In quelle ore rispondi alle domande che decidono il progetto:

- La grandezza che vuoi misurare produce un segnale che si distingue dal rumore, proprio in quel punto?
- Ogni quanto devi campionare per non perdertelo?
- Quanto cambia da una macchina all'altra, e fra il turno di giorno e quello di notte?
- Il fenomeno che vuoi riconoscere si vede davvero nei dati, o è un'ipotesi che nessuno ha ancora verificato?

Un pilota che risponde «no, quel segnale non c'è» in tre giorni vale molto più di uno che ci arriva in sei mesi, con l'hardware definitivo già ordinato.

## Dove smette di bastare

Questa è la parte che conta, ed è quella che di solito nessuno dice. Un telefono è un ottimo strumento per capire, e un pessimo prodotto finito. I confini sono cinque, e sono netti.

**La batteria.** In un dispositivo che deve restare acceso per anni, la cella al litio è il primo componente a esaurirsi, e in un telefono non si cambia senza aprirlo. Una batteria che si gonfia dentro un quadro elettrico, o addosso a una persona, non è un fastidio: è un pericolo. Se il pilota diventa definitivo, l'alimentazione va rifatta da capo.

**L'ambiente.** Un telefono non è pensato per stare a 60 °C dentro un armadio elettrico, sotto vibrazione continua, nell'umidità o nella polvere. Resiste molto più di quanto ci si aspetti, e per questo inganna: funziona per settimane e poi smette, di solito proprio quando hai iniziato a fidarti.

**Gli aggiornamenti.** È il vincolo che si sottovaluta di più. Un telefono che non riceve più aggiornamenti di sicurezza è un computer attaccato alla tua rete di cui nessuno corregge più i difetti. I numeri sono questi: i Pixel dal modello 8 in poi e i Galaxy dalla serie S24 in poi ricevono **sette anni** di aggiornamenti di sistema e di sicurezza dall'uscita del modello; i modelli precedenti si fermano a cinque. Un telefono usato ha già consumato parte di quel periodo. E quando gli aggiornamenti finiscono il telefono non diventa lento: diventa il punto da cui si entra nella tua rete.

**La misura che ha valore legale.** Se il dato serve a fatturare, a certificare, a far scattare una manutenzione obbligatoria o a documentare un collaudo, non basta che sia accurato. Deve essere **riferibile a un campione**: cioè confrontabile, attraverso una catena documentata di tarature, con il campione nazionale di quella grandezza. La calibrazione di fabbrica di uno smartphone non lo è, e nessuna procedura software la rende tale.

**L'ambito medicale.** Qui il confine è normativo e non ammette sfumature. Un'applicazione che elabora dati per una finalità medica — diagnosi, monitoraggio, previsione, supporto a una decisione clinica — è un dispositivo medico software ai sensi del Regolamento (UE) 2017/745. La guida MDCG 2019-11 chiarisce che i criteri sono gli stessi, che l'applicazione giri su un telefono, in cloud o altrove. Cambia la classe di rischio e cambiano gli obblighi, ma scrivere «solo per il benessere» nelle note non sposta il confine.

## La regola che usiamo

Da questi cinque confini esce un criterio semplice, che applichiamo prima di scegliere l'hardware.

> Il telefono serve a scoprire se il segnale c'è. L'hardware definitivo serve a misurarlo per anni. Sono due lavori diversi, e usare lo stesso oggetto per tutti e due è quasi sempre un errore.

In pratica il pilota risponde alla domanda, e la risposta diventa la specifica del dispositivo vero: quali sensori servono davvero — di solito meno di quelli che il telefono ha — con quale campo di misura, ogni quanto campionare, con quale precisione. Senza il pilota questi numeri si scelgono a intuito, e sceglierli troppo alti costa quanto sceglierli troppo bassi.

## Quando invece il telefono resta

In alcuni casi non è un passaggio verso altro: è la scelta giusta anche alla fine.

| Situazione | Perché regge |
|---|---|
| Postazione presidiata, con corrente di rete e persone intorno | i limiti di batteria e ambiente non si applicano |
| Interfaccia di comando o pannello di un impianto | servono schermo, tocco e rete, non una misura certificata |
| Occhi di un robot in ambiente controllato | fotocamera, calcolo a bordo e connessione in un pezzo solo |
| Rete di sensori temporanea, per una campagna di misura | il dispositivo si toglie alla fine, quindi la durata non è un problema |
| Raccolta di dati per addestrare un modello | qui serve varietà di esempi, non una misura riferibile |

L'ultima riga è la più utile, e la meno sfruttata. Un modello di visione o di classificazione ha bisogno di molti esempi raccolti nel posto giusto. Dieci telefoni dismessi, montati per due settimane su dieci macchine diverse, danno una quantità di dati che nessun prototipo singolo sul banco può dare. E fanno scoprire una cosa scomoda ma utile: che le dieci macchine non si comportano allo stesso modo.

## Cosa fare, in ordine

1. **Scrivi la domanda prima di accendere qualsiasi cosa.** Non «raccogliamo dati e vediamo». Una domanda utile dice tre cose: che cosa misuri, dove lo misuri, e quali due situazioni devi riuscire a distinguere. Per esempio: «la vibrazione, misurata sul fianco del motore, permette di distinguere un cuscinetto integro da uno che sta per rompersi?»
2. **Fai l'inventario dei telefoni che hai** e controlla fino a quando ognuno riceve aggiornamenti. Quelli non più aggiornati vanno tenuti su una rete separata da quella aziendale.
3. **Controlla che i sensori che ti servono ci siano davvero.** Barometro e magnetometro mancano su parecchi modelli, e la qualità del ricevitore satellitare cambia molto da telefono a telefono.
4. **Registra i dati grezzi, non solo i risultati elaborati.** Sui dati grezzi puoi tornare fra sei mesi con un'idea nuova; su una media già calcolata no.
5. **Tieni il pilota acceso abbastanza a lungo** da coprire un ciclo intero: un turno completo, una settimana, un cambio di stagione se misuri qualcosa di ambientale.
6. **Scrivi la specifica del dispositivo definitivo partendo dai dati raccolti**, non dal catalogo dei fornitori.
7. **Decidi quando finisce il pilota nel momento in cui lo inizi.** Un telefono lasciato su un macchinario «per adesso» diventa un'installazione permanente che nessuno ha progettato — ed è così che i cinque confini di prima diventano un problema vero.

## Perché ne scriviamo

Progettiamo dispositivi, e questo è il modo in cui riduciamo il rischio di progettarne uno sbagliato. Il pilota fatto con l'hardware che c'è già è la fase in cui vengono fuori le cose che cambiano il progetto: che il segnale è più debole del previsto, che bisogna campionare più spesso, che due impianti all'apparenza identici non lo sono.

DigiSense®, il framework su cui costruiamo le implementazioni con sensori, AI e robot, tiene separate tre cose: la raccolta dei dati, la loro elaborazione e il comando della macchina. Serve proprio a questo. La sorgente dei dati può cambiare — da un telefono a una scheda dedicata — senza riscrivere quello che ci sta sopra. Fra il pilota e il prodotto finito resta lo stesso ragionamento, anche se l'hardware è diverso.

Se hai un'idea che dipende da una misura che nessuno ha ancora fatto, si parte da lì: quale sarebbe quella misura, e come ottenerla la settimana prossima invece che fra sei mesi.

## Fonti

- [Regolamento (UE) 2017/745 sui dispositivi medici](https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng) — definizione e obblighi per i dispositivi medici, software compreso.
- [MDCG 2019-11 — Guida alla qualificazione e classificazione del software nel MDR e nell'IVDR](https://health.ec.europa.eu/system/files/2020-09/md_mdcg_2019_11_guidance_en_0.pdf) — criteri validi anche per le applicazioni su telefono; revisione 1 pubblicata il 17 giugno 2025.
- [Google — Aggiornamenti e supporto dei dispositivi Pixel](https://support.google.com/pixelphone/answer/4457705) — durata degli aggiornamenti di sistema e di sicurezza, modello per modello.
- [Samsung — Aggiornamenti di sicurezza per i dispositivi mobili](https://security.samsungmobile.com/workScope.smsb) — politica di supporto e modelli coperti.
- [Regolamento (UE) 2023/1670 — requisiti di ecodesign per smartphone, telefoni cordless e tablet](https://eur-lex.europa.eu/eli/reg/2023/1670/oj/eng) — durata minima degli aggiornamenti e disponibilità dei ricambi.
- [Android — Panoramica dei sensori](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview) — sensori disponibili sulla piattaforma e loro caratteristiche.
- [Direttiva 2014/32/UE sugli strumenti di misura](https://eur-lex.europa.eu/eli/dir/2014/32/oj/eng) — requisiti per gli strumenti usati in misure con effetti legali.
