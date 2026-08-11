Prima di comprare hardware per un progetto pilota, apri il cassetto dei telefoni dismessi. Dentro c'è un accelerometro, un giroscopio, un magnetometro, un ricevitore satellitare multi-costellazione, una o più fotocamere, un sensore di luce, spesso un barometro, Wi-Fi, Bluetooth, un modem cellulare, una batteria, uno schermo e un processore. Con l'alimentatore già incluso.

È l'hardware più sottovalutato che un'azienda possieda: l'ha pagato, l'ha ammortizzato, e ora lo tiene in un cassetto perché lo schermo è crepato.

Non è una proposta di riciclo virtuoso. È una scorciatoia ingegneristica per rispondere prima e a costo quasi zero alla domanda che blocca la maggior parte dei progetti IoT: **il dato che mi serve esiste, ed è abbastanza buono?**

E soprattutto: ci sono confini precisi oltre i quali questa scorciatoia diventa un errore. Quelli contano più della scorciatoia stessa.

## Che cosa hai già a bordo

I sensori di uno smartphone sono componenti MEMS, gli stessi che si trovano nei moduli che compreresti a parte. La differenza è che qui sono già montati, alimentati, calibrati in fabbrica e accessibili da un'unica interfaccia software.

L'inventario tipico di un telefono di fascia media degli ultimi anni:

- **Accelerometro** — accelerazione su tre assi, gravità inclusa. Vibrazioni, urti, orientamento, conteggio dei passi.
- **Giroscopio** — velocità angolare sui tre assi. Unito all'accelerometro dà l'assetto completo.
- **Magnetometro** — bussola digitale, e rilevatore di masse ferrose in movimento.
- **Ricevitore satellitare** — GPS più GLONASS, Galileo e BeiDou sui modelli recenti.
- **Sensore di luce ambientale** — illuminamento in lux.
- **Barometro** — pressione in ettopascal, presente su molti modelli di fascia media e alta. Utile per la quota relativa e per rilevare l'apertura di una porta in un ambiente chiuso.
- **Sensore di prossimità** — presenza entro pochi centimetri, a infrarossi.
- **Fotocamere** — spesso più di una, con ottiche diverse e stabilizzazione.
- **Microfoni** — di solito due o tre, il che rende possibile stimare la direzione di provenienza di un suono.

A questo si aggiunge la parte che di solito costa più dei sensori: connettività di rete, memoria di massa, un sistema operativo con gestione dell'alimentazione, e la capacità di calcolo per far girare a bordo un modello di visione o di classificazione.

Su una scheda a microcontrollore, tutto questo sarebbe una distinta base con una decina di voci e un mese di integrazione.

## Il valore vero non è il risparmio

Qui si annida il fraintendimento più comune. Il vantaggio non è avere sensori gratis: i moduli MEMS costano pochi euro, e su un progetto serio quel risparmio è rumore di fondo.

Il vantaggio è il **tempo fino alla prima misura**.

Con un telefono, dall'idea al primo dato reale passano ore. Puoi mettere il dispositivo dove servirà davvero — sul macchinario, sul mezzo, addosso alla persona — e guardare i numeri veri prima di aver deciso alcunché sull'architettura.

E la domanda a cui rispondi in quelle ore è quella che decide il progetto:

- La grandezza che voglio misurare produce un segnale distinguibile dal rumore, in quel punto preciso?
- Con quale frequenza di campionamento devo registrare per non perderla?
- Quanto varia fra un esemplare e l'altro, fra il turno di giorno e quello di notte?
- Il fenomeno che voglio riconoscere si vede davvero nei dati, o è un'ipotesi che finora nessuno ha verificato?

Un pilota che risponde «no, quel segnale non c'è» in tre giorni vale molto più di uno che ci arriva in sei mesi con l'hardware definitivo già ordinato.

## Dove smette di bastare

Questa è la parte che conta, ed è quella che di solito non viene detta. Un telefono è un ottimo strumento di indagine e un pessimo prodotto finito. I confini sono cinque, e sono netti.

**La batteria.** In un dispositivo pensato per stare acceso anni, la cella al litio è il primo componente a esaurirsi, e in un telefono non è sostituibile senza aprirlo. Una batteria gonfia in un quadro elettrico o addosso a una persona non è un inconveniente: è un rischio. Se il pilota diventa permanente, l'alimentazione va ripensata da zero.

**L'ambiente.** Un telefono non nasce per stare a 60 °C dentro un armadio elettrico, sotto vibrazione continua, in atmosfera umida o polverosa. Regge molto più di quanto ci si aspetti, e proprio per questo inganna: funziona per settimane e poi smette, di solito quando hai iniziato a fidartene.

**Il ciclo di vita del software.** È il vincolo che si sottovaluta di più. Un telefono senza aggiornamenti di sicurezza è un computer connesso alla tua rete di cui nessuno corregge più le falle. Vale la pena guardare i numeri: i Pixel dal modello 8 in avanti e i Galaxy dalla serie S24 in avanti hanno **sette anni** di aggiornamenti di sistema e sicurezza dalla data di uscita; i modelli precedenti si fermano a cinque. Un apparecchio comprato oggi usato ha già consumato una parte di quella finestra, e quando finisce non è che diventa lento: diventa un varco.

**La misura con valore legale.** Se il dato serve a fatturare, a certificare, a decidere una manutenzione obbligatoria o a documentare un collaudo, non basta che sia accurato: deve essere tracciabile a un campione, con una taratura documentata e uno strumento qualificato. Nessuna calibrazione di fabbrica di uno smartphone soddisfa questo requisito.

**L'ambito medicale.** Qui il confine è normativo e non ammette sfumature. Un'applicazione che elabora dati per una finalità medica — diagnosi, monitoraggio, previsione, supporto a una decisione clinica — è un dispositivo medico software ai sensi del Regolamento (UE) 2017/745, e la guida MDCG 2019-11 chiarisce che il criterio vale identico che l'app giri su un telefono, in cloud o altrove. Cambia la classe, cambiano gli obblighi, ma il perimetro non si aggira scrivendo «solo a scopo di benessere» nelle note.

## La regola che usiamo

Da questi cinque confini discende un criterio semplice, che applichiamo prima di scegliere l'hardware.

> Il telefono serve a scoprire se il segnale esiste. L'hardware definitivo serve a misurarlo per anni. Sono due lavori diversi, e usare lo stesso oggetto per entrambi è quasi sempre un errore.

In pratica: il pilota risponde alla domanda, e la risposta diventa la specifica del dispositivo vero. Quali sensori servono davvero — spesso meno di quelli che il telefono ha —, con quale portata, con quale frequenza, con quale precisione. Sono i numeri che senza il pilota si scelgono a intuito, e sbagliarli in eccesso costa quanto sbagliarli in difetto.

## Quando invece il telefono resta

Ci sono casi in cui non è un ponte verso altro, ma la scelta giusta anche a regime.

| Situazione | Perché regge |
|---|---|
| Postazione presidiata, con corrente di rete e persone intorno | i limiti di batteria e ambiente non si applicano |
| Interfaccia di comando o pannello di un impianto | serve schermo, tocco e rete, non misura certificata |
| Unità di percezione di un robot in ambiente controllato | fotocamera, calcolo a bordo e connettività in un pezzo solo |
| Rete di sensori temporanea, per una campagna di misura | il dispositivo va tolto a fine campagna, quindi il ciclo di vita non è un problema |
| Raccolta dati per addestrare un modello | qui l'obiettivo è la varietà dei dati, non la loro tracciabilità metrologica |

L'ultima riga è quella più utile e meno sfruttata. Un modello di visione o di classificazione ha bisogno di molti esempi raccolti nel posto giusto. Dieci telefoni dismessi, montati per due settimane su dieci macchine diverse, producono un insieme di dati che nessun singolo prototipo su banco può dare — e producono anche la scoperta, di solito spiacevole e sempre utile, che le dieci macchine si comportano in modo diverso.

## Cosa fare, in ordine

1. **Scrivi la domanda prima di accendere qualcosa.** Non «raccogliamo dati e vediamo», ma: quale grandezza, in quale punto, per distinguere quali due situazioni.
2. **Inventaria i telefoni che hai** e verifica per ciascuno fino a quando riceve aggiornamenti. Quelli fuori supporto vanno tenuti fuori dalla rete aziendale, su una rete separata.
3. **Verifica che i sensori che ti servono ci siano davvero.** Il barometro e il magnetometro mancano su parecchi modelli, e la qualità del ricevitore satellitare varia molto.
4. **Registra i dati grezzi, non solo le elaborazioni.** Il grezzo lo puoi rianalizzare fra sei mesi con un'idea nuova; una media già calcolata no.
5. **Fai girare il pilota abbastanza a lungo** da attraversare un ciclo intero: un turno completo, una settimana, un cambio di stagione se la grandezza è ambientale.
6. **Scrivi la specifica del dispositivo definitivo partendo dai dati raccolti**, non dal catalogo dei fornitori.
7. **Decidi la fine del pilota quando lo inizi.** Un telefono che resta attaccato a un macchinario «per ora» diventa un'installazione permanente che nessuno ha progettato — ed è così che i cinque confini di prima si trasformano in un problema.

## Perché ne scriviamo

Progettiamo dispositivi, e questo è il modo in cui riduciamo il rischio di progettarne uno sbagliato. Il pilota con l'hardware che c'è già è la fase in cui si scoprono le cose che cambiano il progetto: che il segnale è più debole del previsto, che serve campionare più in fretta, che due impianti apparentemente identici non lo sono.

DigiSense®, il framework su cui costruiamo le implementazioni con sensori, AI e robot, tiene separati l'acquisizione, l'elaborazione e il controllo proprio per questo: la sorgente dei dati può cambiare — da un telefono a una scheda dedicata — senza riscrivere quello che c'è sopra. Il pilota e il prodotto condividono il ragionamento, non il ferro.

Se hai un'idea che dipende da una misura che nessuno ha ancora fatto, la conversazione utile parte da lì: quale sarebbe quella misura, e come si fa a ottenerla la settimana prossima invece che fra sei mesi.

## Fonti

- [Regolamento (UE) 2017/745 sui dispositivi medici](https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng) — definizione e obblighi per i dispositivi medici, software incluso.
- [MDCG 2019-11 — Guida alla qualificazione e classificazione del software nel MDR e nell'IVDR](https://health.ec.europa.eu/system/files/2020-09/md_mdcg_2019_11_guidance_en_0.pdf) — criteri applicabili anche alle applicazioni per telefono; revisione 1 pubblicata il 17 giugno 2025.
- [Google — Aggiornamenti e supporto dei dispositivi Pixel](https://support.google.com/pixelphone/answer/4457705) — durata degli aggiornamenti di sistema e sicurezza per modello.
- [Samsung — Aggiornamenti di sicurezza per i dispositivi mobili](https://security.samsungmobile.com/workScope.smsb) — politica di supporto e modelli coperti.
- [Regolamento (UE) 2023/1670 — requisiti di ecodesign per smartphone, telefoni cordless e tablet](https://eur-lex.europa.eu/eli/reg/2023/1670/oj/eng) — durata minima degli aggiornamenti e disponibilità dei ricambi.
- [Android — Panoramica dei sensori](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview) — sensori disponibili sulla piattaforma e loro caratteristiche.
- [Direttiva 2014/32/UE sugli strumenti di misura](https://eur-lex.europa.eu/eli/dir/2014/32/oj/eng) — requisiti per gli strumenti usati in misure con effetti legali.
