---
title: "Plan Scope — progetti e scadenze nel browser | G&G Technologies"
description: "Per organizzare progetti, eventi e campagne: pagine scritte, attività e scadenze in un posto solo. Gira nel browser e i dati restano sul vostro computer."
publisher: "G&G Technologies"
lang: it
canonical: https://ggtechnologies.sm/app/plan-scope/
translation: https://ggtechnologies.sm/en/app/plan-scope/index.md
---

# Progetti e scadenze, sul vostro computer.

*App gratuita, codice pubblico*

Le pagine scritte e le date da rispettare nello stesso posto. L'app gira nel browser: quello che si scrive resta sul vostro computer.

Categoria · [Gestionale](https://ggtechnologies.sm/app/?tag=gestionale)

- [Aprite l'app](https://ggtechnologies.sm/app/plan-scope/run/)
- [Codice sorgente](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/plan-scope)

*Il punto di partenza*

## Chi organizza un evento tiene tutto in quattro posti diversi.

Un foglio di calcolo per le scadenze, la posta per i fornitori, un documento per la scaletta, i foglietti per il resto. Ogni pezzo sta in un posto che va bene per quel pezzo, e non esiste un punto da cui si vede a che punto è il lavoro.

Plan Scope tiene le quattro cose insieme: le pagine scritte, le attività con le loro date, l'avanzamento e le scadenze della settimana. Dopo il caricamento della pagina l'app non fa più una richiesta di rete: è possibile verificarlo dagli strumenti per sviluppatori del browser.

Il rovescio è dichiarato, e conviene saperlo prima: senza un server, i dati vivono nel browser di chi li scrive. Per questo l'esportazione è una funzione principale e non una voce di menu — un progetto esce in un file solo, che si rimette dentro identico.

Lavorare in due passa da una cartella, non da un account. Si sceglie una cartella dentro Dropbox, OneDrive o Google Drive: i progetti condivisi vengono scritti lì come file di testo, un file per pagina, e riletti quando un collega li cambia. È la cartella a viaggiare; l'app continua a non mandare niente a nessuno.

![Il progetto in una schermata: cosa serve adesso, il piano, le prossime settimane, gli incontri, le decisioni e chi ci lavora.](https://ggtechnologies.sm/assets/shot-plan-scope-it.png)

![La bacheca: le attività in colonne, con le scadenze e chi le ha in carico. Le colonne si scelgono liberamente.](https://ggtechnologies.sm/assets/shot-plan-scope-bacheca-it.png)

![Lo stesso piano sul calendario, per vedere dove si accavallano le scadenze.](https://ggtechnologies.sm/assets/shot-plan-scope-calendario-it.png)

![La linea del tempo: quanto dura ogni cosa, cosa aspetta cos'altro, e i traguardi.](https://ggtechnologies.sm/assets/shot-plan-scope-timeline-it.png)

![Le pagine si scrivono qui dentro, in Markdown, con immagini e caselle: gli appunti stanno nel progetto invece che altrove.](https://ggtechnologies.sm/assets/shot-plan-scope-pagina-it.png)

![La scheda di una persona, attraverso tutti i progetti: dove lavora, cosa vi siete detti, come eravate rimasti.](https://ggtechnologies.sm/assets/shot-plan-scope-persona-it.png)

### Cosa fa

- Tiene più progetti, ognuno con le sue pagine e il suo piano: bacheca, calendario e timeline sono tre viste della stessa lista.
- Scrive pagine formattate: titoli, elenchi, checklist, tabelle, immagini e allegati. Incolla da Word con titoli, elenchi e tabelle intatti.
- Salva durante la scrittura, e tiene le versioni: un'istantanea ogni dieci minuti, per tornare a com'era una pagina.
- Collega le pagine fra loro con [[doppie parentesi]], mostra chi punta dove, e dà alle pagine tag e proprietà che si leggono in tabella.
- Tiene le attività con data, priorità, assegnatario, tag, checklist, sottoattività e ripetizione; mostra l'avanzamento e le scadenze di tutti i progetti in un pannello solo.
- Crea un'attività della bacheca scrivendo dentro una pagina: la riga resta collegata all'attività, apre la sua scheda, e la spunta in un posto vale anche nell'altro.
- Tiene la rubrica delle persone con cui si lavora, una volta per tutti i progetti: recapiti, progetti, appuntamenti e note di ciascuna in una scheda.
- Fissa appuntamenti e segna telefonate, email e incontri, con un progetto o senza: quello che non appartiene a un progetto va nell'agenda.
- Apre ogni progetto su quello che serve adesso — ritardi, scadenze del giorno, decisioni vicine, attività bloccate, incontri ancora senza note — e accanto il prossimo incontro con quello che c'è da discutere.
- Tiene le decisioni prese negli incontri: la domanda, entro quando, la scelta.
- Riunisce in un calendario gli appuntamenti e le scadenze di tutti i progetti, mese per mese.
- Cerca in tutto con Ctrl+K: pagine, attività, progetti, senza badare agli accenti.
- Esporta un progetto in un file solo, immagini comprese, e lo reimporta identico — o aggiorna quello già presente con le modifiche di un collega.
- Promemoria delle scadenze, in tre modi: dentro il calendario esportato — e lì suona il vostro calendario, sul telefono, anche ad app chiusa da mesi — con un riepilogo alla riapertura dell'app, e con una notifica di sistema dove il browser la permette. Anticipo in giorni e orario si scelgono liberamente.
- Lavora in due attraverso una cartella condivisa: Dropbox, OneDrive, Google Drive. Le pagine sono file Markdown, leggibili anche con Obsidian.
- Importa una bacheca Trello e un export Notion, per quello che si può portare.
- Lo stesso progetto si apre in Invoice Scope, che usa questo formato: lì un piano sta accanto al preventivo e alle fatture di quel lavoro. Un progetto sta dove sta il suo denaro — se è un piano e basta, sta qui.
- Annulla le cancellazioni: quello che si elimina resta recuperabile per trenta giorni, o fino allo svuotamento del cestino.
- Funziona in italiano e in inglese, e nel tema chiaro come in quello scuro.

### Cosa non fa

- Non lavora in tempo reale: la cartella condivisa si legge quando l'app torna in primo piano e poi una volta al minuto. Una pagina cambiata da tutti e due nello stesso momento resta doppia, con il nome dell'altro nel titolo, e la confrontate voi.
- La cartella condivisa funziona su Chrome ed Edge, sul computer: Safari, Firefox e i telefoni non permettono a una pagina web di aprire una cartella. Lì resta lo scambio di file.
- Non promette una notifica a un orario preciso: senza un server, l'app non può svegliarsi da sola. Quello che fa è nella riga «Promemoria» qui sopra — il promemoria dentro il calendario esportato suona ovunque, gli altri due modi dipendono dal browser.
- Non usa modelli di intelligenza artificiale: «Copia per un assistente» mette il testo negli appunti, e l'assistente lo scegliete voi.

*Quello che entra e quello che esce*

Nessun formato chiuso: quello che si scrive esce in file che si aprono anche senza questa app, e quello già scritto altrove può entrare.

### Esce come

- Il progetto intero in un .zip: i dati in project.json e le immagini in assets/. È la forma che sopravvive al cambio di computer, e rientra identica.
- I soli dati in un .json, senza immagini: più piccolo, e leggibile in qualunque editor di testo.
- Una pagina in .md: Markdown con tag e proprietà in testa, il formato che Obsidian e i generatori di siti leggono.
- Il progetto come cartella: project.json, una pagina per file dentro pages/, le immagini in assets/. È quello che l'app scrive nella cartella condivisa, e si apre con Obsidian così com'è.
- Le scadenze in .ics, con il promemoria dentro: si aprono in Calendario, Outlook o Google Calendar, e a suonare è il vostro calendario.
- Le attività in .csv, per Excel, Numbers o Fogli Google.
- La rubrica in .csv e in .vcf (vCard): la seconda si apre in Contatti, Outlook o Google Contatti.
- Una pagina o la bacheca come pagina web in un file solo, che si apre in qualsiasi browser senza l'app.
- In PDF, dalla stampa del browser, con l'impaginazione fatta per la carta.
- Negli appunti, in Markdown: «Copia per un assistente AI», con l'assistente scelto da voi.
- Tutto l'archivio in un file solo, che è la copia da mettere al sicuro.

### Entra da

- Un progetto di questa app (.zip o .json): come progetto nuovo, oppure sopra quello già presente, aggiornandolo con le modifiche di un collega.
- Un backup dell'archivio, per rimettere tutto dov'era.
- Una cartella di file: un progetto scritto come cartella rientra così com'è — anche le pagine corrette con Obsidian, alla lettura successiva.
- Una bacheca Trello (il .json dell'esportazione): colonne, carte, date, etichette, membri e checklist.
- Un export Notion (lo .zip): le pagine con il loro albero e le immagini, e le attività dai database che hanno un nome e uno stato o una data.
- Testo incollato da Word o Google Docs: titoli, elenchi e tabelle restano quello che sono invece di diventare una riga sola.
- Immagini e allegati trascinati dentro una pagina.

*In breve*

#### Dati

Restano nel browser di questo computer. Dopo il caricamento della pagina l'app non fa richieste di rete.

#### Esportazione

Un progetto esce come file .zip con dentro il testo in Markdown e le immagini, e si rimette dentro identico. Ma anche come cartella di file, .md, .ics, .csv, vCard, pagina web o PDF: l'elenco completo è qui sopra.

#### Se si pulisce il browser

I dati vengono cancellati con tutto il resto. È il motivo per cui l'esportazione conta: conviene farne una copia.

#### Senza connessione

Dopo la prima apertura funziona anche senza rete.

#### Aggiornamenti

Automatici. Accanto al nome dell'app c'è la versione; quando ne è pronta una nuova, la scritta lo segnala e basta toccarla per passare. Per saperlo il browser rilegge un file dell'app dal nostro sito, https://ggtechnologies.sm/app/plan-scope/run/sw.js: è l'unica richiesta dopo il caricamento, e non contiene dati vostri.

#### In due

Una cartella condivisa in Dropbox, OneDrive o Google Drive. Un file per pagina, in Markdown; le modifiche degli altri si fondono con le vostre, e un conflitto resta visibile invece di sparire.

#### Installazione

Facoltativa. Si apre nel browser, e dove il sistema lo permette si installa come un'app normale.

#### Lingue

Italiano e inglese, seguono la lingua del browser.

#### Licenza

PolyForm Shield 1.0.0. Il codice è pubblico: si legge, si modifica e si usa anche in un lavoro commerciale. Un prodotto concorrente richiede una licenza commerciale.

#### Stato

In uso e aggiornata: il numero di versione qui sotto è quello vero, e si gira a ogni modifica. Dentro l'app c'è una Guida, come progetto da leggere nell'editor stesso, con la prova da fare in due prima di fidarsi.

**Versione** 4.57.0 · **Aggiornata il** 25 settembre 2026 · **Licenza** PolyForm-Shield-1.0.0 · [Codice sorgente](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/plan-scope)

*FAQ*

## Domande frequenti

### Come verifico che i miei dati restino qui?

Potete verificarlo direttamente. Aprite gli strumenti per sviluppatori del browser, scheda «Rete», e usate l'app: dopo il caricamento della pagina non compare nessuna richiesta — tranne una, di tanto in tanto: il browser rilegge https://ggtechnologies.sm/app/plan-scope/run/sw.js, un file dell'app stessa, per sapere se c'è una versione nuova. È una lettura dal nostro sito, e non contiene dati vostri. Il codice è pubblico, quindi è possibile anche leggere cosa fa.

### Posso usare il codice in un mio prodotto?

Sì, per il vostro lavoro e per prodotti che svolgono un compito diverso. La licenza è la PolyForm Shield 1.0.0: il codice si legge, si modifica e si usa anche in un lavoro commerciale, a due condizioni. Ogni copia porta con sé la licenza e le righe «Required Notice», che nominano G&G Technologies come autore. Un prodotto che svolge lo stesso compito dell'app, venduto o gratuito, esteso o con un proprio server, richiede una licenza commerciale: si chiede a [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm).

### Posso lavorarci in due?

Sì, attraverso una cartella. Si sceglie una cartella dentro Dropbox, OneDrive o Google Drive e si segna un progetto come condiviso: l'app lo scrive lì come file e lo rilegge quando un collega lo cambia; nella scheda del progetto resta scritto chi ha cambiato cosa, e quando. Ognuno ha la sua copia completa, anche senza rete; la cartella è il punto d'incontro. Serve Chrome o Edge sul computer. Su Safari, sul telefono, o senza una cartella in comune, resta lo scambio di file: si esporta, si invia, e chi riceve aggiorna il suo progetto.

### Che succede se la stessa pagina viene cambiata da due persone?

Nessuno perde niente. La vostra versione resta com'è, quella del collega arriva accanto con il suo nome nel titolo — «Scaletta (copia di Marco)» — e le confrontate voi. Per le attività vince chi ha scritto per ultimo: sono piccole, e si sistemano guardandole.

### Posso aprire le pagine con Obsidian?

Sì. Nella cartella condivisa ogni pagina è un file Markdown con le proprietà in testa, il formato che Obsidian legge. Una pagina scritta o corretta lì con Obsidian entra nell'app alla lettura successiva, entro un minuto.

### Che succede se pulisco i dati del browser?

Spariscono, come tutto il resto di quel browser. Senza un server la vostra copia è l'unica che esiste: conviene esportare i progetti che servono, e il file resta sul disco come qualsiasi altro.

### Mi avvisa quando una scadenza si avvicina?

Sì, e conviene sapere come, perché i modi sono tre e non funzionano tutti dappertutto. Il primo vale sempre: il calendario esportato porta il promemoria dentro il file, quindi a suonare è il vostro calendario — sul telefono, alle nove, anche se questa app resta chiusa per mesi. Il secondo vale sempre anche lui: alla riapertura, l'app mostra cosa è maturato nel frattempo. Il terzo è la notifica di sistema, e quella dipende dal browser: con l'app installata su Chrome o Edge arriva anche a finestra chiusa, quando il browser sveglia l'app — non a un orario deciso da noi, perché senza un server l'app non può svegliarsi da sola. Su Safari, su iPhone e su Firefox restano i primi due. Anticipo in giorni e orario si scelgono liberamente.

### In che formato escono i miei testi?

In Markdown, sempre: dentro il file del progetto, come singola pagina .md, o come cartella con una pagina per file — che è la stessa cosa che legge Obsidian. È testo semplice: si apre in qualunque editor, anche senza questa app. Le scadenze escono anche come calendario .ics, le attività come .csv, la rubrica come vCard, e una pagina come sito o come PDF.

### Che rapporto c'è fra questa app e il vostro lavoro?

È lo stesso modo di costruire, su un caso piccolo. Elaborazione sulla macchina di chi usa il software e dati che restano dove sono già: sono le scelte che applichiamo nei progetti su misura, dove la posta in gioco è più alta.

### Come si aggiorna l'app, una volta installata?

Da sola, e lo segnala. Accanto al nome dell'app c'è la sua versione. Quando ne è pronta una nuova, la scritta mostra tutt'e due — quella installata e quella in arrivo — con un punto verde: toccandola, l'app si ricarica aggiornata e i vostri dati restano dove sono. Altrimenti la versione nuova entra comunque alla prossima apertura. Se l'app è stata installata prima che esistesse questo avviso, la prima volta va fatto a mano: si chiudono tutte le finestre dell'app e la si riapre; se accanto al nome la versione non compare ancora, si ricarica la pagina con Ctrl+F5, o ⌘⇧R su Mac. Da lì in poi provvede l'app.

### E per toglierla?

La rimozione la fa il sistema, non l'app: nessun sito può disinstallarsi da solo, ed è una buona regola. Dentro l'app installata, accanto al nome, c'è «Installata»: toccandolo, l'app indica dov'è il comando sul vostro sistema. Un punto da sapere: togliere l'app lascia i dati dove sono, e cancellare i dati lascia l'app dov'è. Se i dati non servono più, conviene esportare prima l'archivio.

## Vi serve la stessa cosa, su misura?

Se avete un processo da organizzare e questa app non basta, descriveteci il caso. Risponde una persona del team, non un messaggio automatico.

- [Scriveteci](mailto:info@ggtechnologies.sm?subject=Plan%20Scope%20%E2%80%94%20strumenti%20su%20misura%20per%20organizzare%20il%20lavoro)
- [Chiamateci](tel:+3780549900824)

### [AI on-premise](https://ggtechnologies.sm/servizi/ai-on-premise/)

Come si sceglie fra tutto in locale, ibrido e cloud, a partire dai vostri dati.

### [DigiSense®](https://ggtechnologies.sm/digisense/)

Cosa c'è sotto, e perché il vostro progetto non parte da zero.

### [Intelligenza Artificiale](https://ggtechnologies.sm/servizi/intelligenza-artificiale/)

Agenti che leggono documenti e interrogano i sistemi aziendali, con la misura decisa prima.
