---
title: "AI per la sicurezza: il perimetro di un agente — G&G"
description: "Sicurezza degli agenti AI: un perimetro di azioni definito, accessi ridotti al necessario e approvazione umana. Revisione degli strumenti AI già in uso."
publisher: "G&G Technologies"
lang: it
canonical: https://ggtechnologies.sm/servizi/ai-sicurezza/
translation: https://ggtechnologies.sm/en/services/ai-security/index.md
---

# Un agente fa quello che gli è concesso di fare.

*AI per la sicurezza*

Un agente AI legge i dati e le istruzioni nello stesso testo. Il perimetro delle azioni, gli accessi e i casi che richiedono una conferma si decidono in fase di progetto.

- [Contattateci](mailto:info@ggtechnologies.sm?subject=Richiesta%20informazioni)

Oppure scriveteci: [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm)

- **1997** il primo progetto
- **18** anni nella manifattura
- **900** operatori nello studio

*Il punto di partenza*

## Il rischio non è il modello. È quello che può toccare.

Un modello linguistico non distingue i dati che legge dalle istruzioni che riceve: sono lo stesso testo. Un documento, un messaggio di posta o una pagina web possono quindi contenere una richiesta che l'agente esegue come se arrivasse da voi. Si chiama iniezione di istruzioni — in inglese *prompt injection* — ed è la ragione per cui un agente si progetta a partire dai suoi poteri.

Il metodo è quello di qualsiasi applicazione che tocca dati aziendali: quali azioni può compiere, su quali sistemi, con quali credenziali e in quali casi serve l'approvazione di una persona. La scelta del modello viene dopo, e si può cambiare.

#### Un caso pubblico

**CVE-2025-32711** ha una data, due valutazioni di gravità e un indirizzo dove chiunque può leggerlo. [L'articolo che lo racconta](https://ggtechnologies.sm/insights/agenti-autonomi-perimetro/).

#### Norme

GDPR e AI Act per il trattamento e per gli obblighi sui sistemi ad alto rischio; per i reati e la responsabilità civile legati all'AI, il D.Lgs. 160/2026.

#### Le persone

Chi userà gli strumenti impara a riconoscere una richiesta che non va eseguita: [uso professionale dell'AI](https://ggtechnologies.sm/formazione/uso-professionale-ai/).

#### Sviluppo

Software progettato e sviluppato interamente in Europa.

*La prova · un identificatore pubblico*

### La domanda difficile ce la siamo fatta in pubblico.

Nel 2025 una vulnerabilità di un assistente AI collegato ai documenti aziendali ha ricevuto un identificatore pubblico, **CVE-2025-32711**: una richiesta nascosta dentro un documento otteneva dall'assistente dati che l'autore del documento non avrebbe mai potuto leggere.

Ne abbiamo scritto per esteso, con la data, le valutazioni di gravità e le fonti in fondo alla pagina. È un caso che si controlla da fuori, senza passare da noi. [Leggete l'articolo](https://ggtechnologies.sm/insights/agenti-autonomi-perimetro/).

Prova una cosa sola, ed è quella che conta prima di firmare: il ragionamento su dove passa il confine di un agente è stato fatto, ed è scritto.

*Cosa costruiamo*

## Quattro decisioni che delimitano quello che un agente può fare.

Se i dati non possono uscire dall'azienda, il capitolo è un altro: [come funziona l'AI on-premise](https://ggtechnologies.sm/servizi/ai-on-premise/). Per chi userà gli strumenti ci sono i [corsi di formazione](https://ggtechnologies.sm/formazione/).

### Il perimetro delle azioni

Ogni agente ha un elenco chiuso di operazioni disponibili: quello che sta fuori dall'elenco passa da una persona.

- Gli strumenti a disposizione sono dichiarati uno per uno
- Le operazioni sensibili chiedono una conferma
- Ogni azione lascia una traccia consultabile

### Accessi ridotti al necessario

Credenziali dedicate all'agente, con i permessi del compito che deve svolgere e niente di più.

- Un'utenza per agente, distinta da quelle delle persone
- Sola lettura dove basta leggere
- Revoca immediata, senza toccare gli altri sistemi

### Il luogo dell'elaborazione

Dove gira il modello è una decisione di progetto, e cambia chi risponde dei dati che l'agente legge.

- Modelli sui vostri server quando i dati restano dentro
- Mascheramento dei dati personali nelle architetture ibride
- [L'AI on-premise](https://ggtechnologies.sm/servizi/ai-on-premise/)

### La revisione di quello che è già in uso

Assistenti e automazioni collegati alla posta, ai file o al gestionale, riletti uno per uno.

- Quali dati raggiunge ciascuno strumento
- Dove manca l'approvazione di una persona
- Un elenco di correzioni, in ordine di gravità

*Come lavoriamo*

## Prima il perimetro, poi il modello. Mai il contrario.

01

### Elencare le azioni

Quali operazioni l'agente compie da solo, e quali restano a una persona.

02

### Assegnare gli accessi

Credenziali dedicate e permessi minimi per ogni sistema che l'agente tocca.

03

### Provare gli abusi

Documenti e messaggi costruiti apposta per far deviare l'agente, prima della messa in esercizio.

04

### Tenere la traccia

Registro delle azioni, revisione periodica e revoca rapida quando cambia qualcosa.

*FAQ*

## Domande frequenti

### Che cos'è l'iniezione di istruzioni?

È una richiesta nascosta dentro un documento, un messaggio o una pagina web, che l'agente legge ed esegue come se arrivasse da voi. La difesa sta nei poteri: se l'agente non può disporre un pagamento o cancellare un archivio, una richiesta nascosta non ottiene nulla.

### Posso collegare un assistente alla posta aziendale?

Sì, ed è una decisione di architettura più che una configurazione: quali cartelle legge, che cosa può inviare, quali messaggi richiedono una conferma. La differenza fra una prova e un servizio in esercizio sta in queste risposte.

### Uso già strumenti AI comprati altrove: potete rivederli?

Sì. La revisione elenca, per ogni strumento, quali dati raggiunge, quali azioni compie da solo e dove manca l'approvazione di una persona. Quello che ne esce è un elenco di correzioni in ordine di gravità, con il lavoro che ciascuna richiede.

### Un modello in locale basta a mettere in sicurezza un agente?

No, e le due cose rispondono a domande diverse. Il modello in locale decide dove vengono elaborati i dati; il perimetro decide che cosa l'agente può fare. Un agente che gira sui vostri server può comunque scrivere nei vostri sistemi.

### Come faccio a sapere che cosa ha fatto l'agente?

Dal registro: ogni azione lascia il momento, l'operazione e i dati toccati. È anche il modo in cui si misura se sta facendo il lavoro per cui è stato messo lì.

*Insights*

## Analisi tecniche sullo stesso tema.

### [Prima di dare le chiavi a un agente AI](https://ggtechnologies.sm/insights/agenti-autonomi-perimetro/)

Per un agente AI il contenuto che legge e le istruzioni che riceve sono lo stesso testo: è la prompt injection. Tre domande prima di collegarlo alla posta.

### [AI Act e dati dei clienti](https://ggtechnologies.sm/insights/ai-act-dati-clienti/)

Cosa rischia davvero uno studio che usa l'AI sui dati dei clienti, fra AI Act, GDPR e legge 132/2025, e cosa può fare da lunedì mattina.

## Per approfondire

### [Intelligenza Artificiale](https://ggtechnologies.sm/servizi/intelligenza-artificiale/)

Agenti che leggono documenti e interrogano i sistemi aziendali, con la misura decisa prima.

### [AI on-premise](https://ggtechnologies.sm/servizi/ai-on-premise/)

Come si sceglie fra tutto in locale, ibrido e cloud, a partire dai vostri dati.

### [Formazione](https://ggtechnologies.sm/formazione/)

Corsi pratici di quattro ore sull'intelligenza artificiale, per imprese e professionisti.

## Avete un agente AI collegato ai vostri sistemi?

Descriveteci che cosa fa oggi e a che cosa accede. Da lì si capisce dove serve un perimetro e dove serve una conferma.

- [Scriveteci](mailto:info@ggtechnologies.sm?subject=Sicurezza%20di%20un%20agente%20AI)
- [Chiamateci](tel:+3780549900824)
