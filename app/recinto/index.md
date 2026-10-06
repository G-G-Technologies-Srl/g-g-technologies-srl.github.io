---
title: "Recinto — gioco vettoriale nel browser | G&G Technologies"
description: "Un recinto da chiudere attorno al terreno da conquistare, lontano da quello che ci gira dentro. Gettone e classifica come in sala giochi, nel browser."
publisher: "G&G Technologies"
lang: it
canonical: https://ggtechnologies.sm/app/recinto/
translation: https://ggtechnologies.sm/en/app/recinto/index.md
---

# Una linea che esce, gira, e torna.

*App gratuita e open source*

Si stacca dal bordo, si taglia il campo e si rientra: la parte rimasta senza il Filo è conquistata. Il doppio dei punti andando piano, e il doppio del tempo allo scoperto.

Categoria · [Svago](https://ggtechnologies.sm/app/?tag=svago)

- [Aprite l'app](https://ggtechnologies.sm/app/recinto/run/)
- [Codice sorgente](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/recinto)

*Che gioco è*

## Sul bordo si è al sicuro. Ed è lì che non si guadagna niente.

Il marcatore parte dal bordo del campo, e finché ci resta non gli può succedere niente. Per prendere terreno però bisogna staccarsi: attraversare l'aperto e tornare dall'altra parte. La linea tracciata divide il campo in due, e la metà in cui non è rimasto nessun Filo è conquistata. Una partita è la stessa domanda rifatta cento volte: quanto lontano conviene andare, adesso.

Le minacce sono tre, e sono tre perché ognuna chiude una via di fuga diversa. Il Filo è un nastro che si contorce nell'aperto e uccide la linea tracciata fuori dal bordo — tutta la linea, non solo la punta. Le Scintille corrono lungo il bordo, cioè proprio dove si starebbe al sicuro. E la Miccia è la linea stessa che prende fuoco quando il marcatore si ferma: parte dal punto di stacco e gli risale incontro. Messe insieme dicono una cosa sola, ed è la regola che tiene in piedi il gioco — non esiste un posto in cui aspettare di vedere cosa fanno gli altri.

Poi c'è la scommessa. Tagliare piano vale il doppio dei punti e raddoppia il tempo allo scoperto, quindi la domanda non è mai «conviene il tratto lento», è «conviene adesso». E due mosse si possono andare a cercare invece che subire: chiudere un Filo in una sacca abbastanza stretta lo cattura invece di costare una vita, e un taglio che lascia due Fili in due regioni separate vale più di qualunque conquista.

La percentuale indicata in alto non è una stima. Un gioco di questo genere di solito tiene il campo come un'immagine e conta i pixel colorati; qui il campo è un poligono a coordinate intere e l'area si calcola esatta. Quel numero è quindi lo stesso su un telefono e su un monitor, e due partite si possono confrontare davvero — che è l'unica cosa che rende una classifica qualcosa di più di una fila di numeri. È il principio del resto del catalogo, la misura si fa dove stanno i dati, applicato a un gioco invece che a un file di misure.

### Cosa fa

- Si taglia il campo e si tiene la parte in cui il Filo non è rimasto. Raggiunta la quota — il 70% al primo livello, un po' di più a ogni livello dopo — il livello è chiuso.
- Tratto veloce o tratto lento: il lento vale il doppio all'area e raddoppia il tempo allo scoperto.
- Tre minacce diverse: il Filo che gira nell'aperto, le Scintille che corrono sul bordo, e la Miccia che consuma la linea quando ci si ferma.
- Chiudere il Filo in una sacca stretta lo cattura, invece di costare una vita.
- Otto arene, isole comprese, messe in ordine di difficoltà misurata e non decisa a occhio. Un secondo Filo dal terzo livello, dove l'arena ha spazio per due.
- Finite le otto si ricomincia da capo, ma non uguali: a ogni giro completo le Scintille partono più veloci.
- Si gioca da tastiera, col mouse e col dito: si indica dove andare e il marcatore ci va, con la linea tratteggiata che mostra prima cosa succederà. Sul telefono il campo si gira di lato da solo, e una vibrazione segnala cos'è successo anche a suono spento.
- Classifica con il nome di chi gioca, chiesto a fine partita.
- Esporta e reimporta la classifica in un file, così una pulizia del browser non la porta via.
- Funziona senza connessione dopo la prima apertura, e si installa come un'app.

### Cosa non fa

- Non chiede un account, e non ne ha uno da chiedere.
- Non manda il punteggio da nessuna parte: la classifica è di questa macchina, come quella del cabinato era della sua.
- Non ha pubblicità, né acquisti, né niente da sbloccare pagando.
- Non funziona meglio online: dopo la prima apertura non ha più bisogno della rete.

*In breve*

#### Classifica

È di questo browser. I punteggi restano qui, e si esportano in qualsiasi momento.

#### Dati

Restano sul vostro computer. Dopo il caricamento della pagina l'app non fa richieste di rete.

#### Gettoni

Infiniti e gratuiti. Il gettone è il rito d'avvio, non un limite.

#### Comandi

Tastiera, mouse, tocco. Le stesse regole per tutti e tre.

#### Licenza

Apache-2.0: il codice è quello che il browser scarica, senza passi di build in mezzo.

**Versione** 0.15.5 · **Aggiornata il** 24 settembre 2026 · **Licenza** Apache-2.0 · [Codice sorgente](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/recinto)

*FAQ*

## Domande frequenti

### Perché la classifica non è condivisa?

Perché una classifica condivisa richiede un server che riceva i punteggi, e queste app non ne hanno uno. È la stessa scelta che rende il gioco utilizzabile senza connessione e senza account. Per un confronto con altri giocatori si esporta il file: contiene la classifica per intero.

### Si gioca bene da telefono?

Sì, ed è stato progettato per farlo, non adattato dopo. Tenendo lo schermo in verticale il campo si gira di novanta gradi: una rotazione non cambia né le aree né le distanze, quindi è lo stesso gioco tenuto di traverso — e ci sta quasi il doppio più grande. Col dito si indica il punto d'arrivo e il marcatore ci va: vicino a una parete cammina sul bordo, in mezzo al campo taglia, e la linea tratteggiata lo mostra prima che il dito si alzi. Il punto di mira sta un po' sopra il dito, così la mano non copre la zona di gioco, e si abbassa avvicinandosi al fondo dello schermo, dove sotto la mano non c'è più niente da scoprire e l'unica cosa che conta è arrivare al muro.

### Il tratto lento conviene?

Dipende da dov'è il Filo, ed è tutta la decisione del gioco. Vale il doppio all'area e raddoppia il tempo allo scoperto, quindi la domanda giusta non è «conviene» ma «conviene adesso».

## Vi serve la stessa cosa, su misura?

Se avete un caso in cui i dati restano sulla macchina di chi li usa, descrivetecelo. Risponde una persona del team, non un messaggio automatico.

- [Scriveteci](mailto:info@ggtechnologies.sm?subject=Recinto%20%E2%80%94%20applicazioni%20che%20girano%20in%20locale)
- [Chiamateci](tel:+3780549900824)

### [AI on-premise](https://ggtechnologies.sm/servizi/ai-on-premise/)

Come si sceglie fra tutto in locale, ibrido e cloud, a partire dai vostri dati.

### [Intelligenza Artificiale](https://ggtechnologies.sm/servizi/intelligenza-artificiale/)

Agenti che leggono documenti e interrogano i sistemi aziendali, con la misura decisa prima.

### [DigiSense®](https://ggtechnologies.sm/digisense/)

Cosa c'è sotto, e perché il vostro progetto non parte da zero.
