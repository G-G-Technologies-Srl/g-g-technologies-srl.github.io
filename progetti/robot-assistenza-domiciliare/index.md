---
title: "Robot per l'assistenza agli anziani in casa — G&G Technologies"
description: "Prototipo di robot che assiste anziani e persone fragili in casa: voce, telecamera e sensori, con l'intelligenza artificiale che gira a bordo."
publisher: "G&G Technologies"
lang: it
canonical: https://ggtechnologies.sm/progetti/robot-assistenza-domiciliare/
translation: https://ggtechnologies.sm/en/projects/home-care-robot/index.md
---

# Un robot per gli anziani che sta in casa, non in fabbrica.

*Progetto in sviluppo*

Prototipo in sviluppo: assistenza a persone anziane e fragili, comandato a voce, con l'AI che gira a bordo e i dati che non escono di casa.

- [Contattateci](mailto:info@ggtechnologies.sm?subject=Richiesta%20informazioni)

Oppure scriveteci: [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm)

- **0** flussi audio o video che escono di casa
- **100%** elaborazione a bordo del robot
- **EU** progettato in Europa

*Perché ci lavoriamo*

## La telecamera in casa è il problema, non la soluzione.

Chi assiste un genitore anziano vorrebbe sapere se è caduto, se ha mangiato, se in casa fa troppo freddo. Gli strumenti che lo permettono — telecamere, microfoni, sensori — sono anche quelli che nessuno vuole in salotto, perché mandano tutto sul server di qualcun altro.

Stiamo costruendo un prototipo che affronta la contraddizione dal lato tecnico: il robot vede e sente, ma il modello gira a bordo e quello che riconosce resta in casa. È **DigiSense®** applicato al caso più delicato che conosciamo. Oggi è un **prototipo in sviluppo**, non un prodotto che si può comprare.

#### Stato

Prototipo in sviluppo. Non è un prodotto in vendita e non è un dispositivo medico.

#### Elaborazione

A bordo del robot, sul framework [DigiSense®](https://ggtechnologies.sm/digisense/): audio e video non escono di casa.

#### Cosa esce di casa

È la domanda aperta del progetto, e la decidiamo con chi ci vive: un avviso a chi assiste, mai il flusso della telecamera o del microfono.

#### Base

Reachy Mini, piattaforma open source di Pollen Robotics (gruppo Hugging Face).

![Una donna anziana seduta in salotto guarda un piccolo robot bianco con due antenne, appoggiato al tavolino davanti a lei.](https://ggtechnologies.sm/assets/robot-assistenza-domiciliare-1800.jpg)

*Immagine illustrativa generata con AI. Il prototipo è in sviluppo: la scena non rappresenta un'installazione reale.*

*Com'è fatto*

## Un robot open source, la voce e un modello che gira a bordo.

*Dove passano i dati del robot.* Telecamera, microfono, temperatura e umidità entrano nel robot. Il modello gira a bordo e risponde a voce. Audio e video non escono di casa.

### Base open source

Partiamo da [Reachy Mini](https://pollen-robotics.com/reachy-mini/), la piattaforma robotica open source di Pollen Robotics, invece di costruire la meccanica da zero: il lavoro va sulle capacità.

- Piattaforma robotica open source
- Modifiche hardware documentate
- Hardware e fornitori restano sostituibili

### Voce e modello a bordo

Modulo vocale e LLM interno: si parla al robot con parole normali e la risposta si forma sulla macchina, che funziona in autonomia.

- Si comanda parlando
- LLM in esecuzione locale
- Funziona anche con la rete assente

### Percezione dell'ambiente

Telecamera, temperatura, umidità e microfono, letti a bordo. Sul microfono stiamo lavorando al riconoscimento di rumori che possono indicare una caduta o una richiesta d'aiuto: è in sviluppo, non è una funzione.

- Telecamera e sensori ambientali
- Riconoscimento di suoni anomali — in sviluppo
- Elaborazione a bordo, non in cloud

*A che punto siamo*

## Cosa c'è oggi, cosa stiamo aggiungendo, cosa è previsto.

01

### Oggi

Prototipo funzionante su Reachy Mini, con modulo vocale, LLM a bordo e i sensori di ambiente.

02

### In sviluppo

Riconoscimento dei suoni che possono indicare una caduta o una richiesta d'aiuto, e affinamento dell'interazione vocale.

03

### Previsto

Un hub domotico che colleghi il robot ai dispositivi indossabili già in casa, per leggerne i parametri vitali.

04

### Da studiare

Riconoscere la persona dalla firma elettrocardiografica. È un dato biometrico: prima della tecnica va risolto come trattarlo.

*FAQ*

## Domande frequenti

### Si può comprare?

No. È un prototipo su cui stiamo lavorando, non un prodotto a catalogo. Se vi interessa seguirne lo sviluppo o ospitare una prova sul campo, scriveteci.

### Chi decide cosa il robot può vedere e sentire?

La persona che vive in casa. Prima di installare qualcosa si decide con lei cosa il robot può ascoltare e guardare, e chi riceve gli avvisi. È il primo punto di ogni prova sul campo, prima della tecnica.

### Rileva le cadute?

Diciamo una cosa più precisa, ed è una distinzione che conta: stiamo addestrando il microfono a riconoscere rumori che possono indicare una caduta o una richiesta d'aiuto. È un aiuto, e va trattato come tale: la sicurezza di chi vive in casa resta affidata a quello che c'era prima. Un dispositivo che promette di rilevare le cadute è un'altra cosa, con altri obblighi.

### Le immagini e l'audio dove finiscono?

In casa. Il modello gira a bordo del robot e il riconoscimento avviene lì: non c'è un server che riceve il flusso della telecamera o del microfono. È il motivo per cui abbiamo scelto questa architettura invece di una più semplice in cloud.

### Cosa vuol dire riconoscere una persona dall'elettrocardiogramma?

Che il tracciato cardiaco è abbastanza caratteristico da distinguere una persona da un'altra, quindi un dispositivo indossabile potrebbe dire al robot chi ha davanti senza usare la telecamera. È una possibilità futura, non una funzione: è un dato biometrico e prima della tecnica va deciso come trattarlo.

*Insights*

## Analisi tecniche sullo stesso tema.

### [Il telefono che avete già è il primo sensore](https://ggtechnologies.sm/insights/telefono-come-sensore/)

Prima di comprare hardware per un pilota: cosa uno smartphone dismesso misura già, e i cinque confini oltre i quali smette di bastare.

### [Un numero non è una misura](https://ggtechnologies.sm/insights/numero-o-misura/)

Che cosa distingue davvero un indicatore da una misura, perché anche il misuratore a bracciale stima, e cosa cercare in una scheda tecnica prima di firmare.

## Per approfondire

### [DigiSense®](https://ggtechnologies.sm/digisense/)

Cosa c'è sotto, e perché il vostro progetto non parte da zero.

### [Wearable medicali](https://ggtechnologies.sm/servizi/wearable-medicale/)

Scheda, firmware e piattaforma di telemonitoraggio, in un progetto solo.

### [AI on-premise](https://ggtechnologies.sm/servizi/ai-on-premise/)

Come si sceglie fra tutto in locale, ibrido e cloud, a partire dai vostri dati.

## Vi interessa seguirlo, o ospitare una prova?

Cerchiamo strutture, cooperative e famiglie disposte a provarlo sul campo. Scriveteci e vi indichiamo a che punto siamo davvero.

- [Scriveteci](mailto:info@ggtechnologies.sm?subject=Robot%20per%20assistenza%20domiciliare)
- [Chiamateci](tel:+3780549900824)
