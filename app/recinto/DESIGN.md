# Recinto — documento di progetto

Gioco vettoriale di conquista d'area per il catalogo `/app/`. Sta accanto ad AstroDroid: stesso
vincolo (gira tutto nel browser, non manda niente da nessuna parte), stessa forma di codice
(`game.js` non conosce il canvas), stessa disciplina di prova (le regole si provano sotto Node).

Questo file è il progetto, non il codice. Le regole del catalogo — due lingue, due temi, PWA,
export e import, anagrafica — stanno in `app/CLAUDE.md` e valgono qui senza essere ripetute.

**Stato.** Tutti e nove i passi, più il giro di accessibilità e la pausa. **L'app è completa e
passa i controlli del catalogo**: sette app, quarantotto pagine, `check_apps.py` e `check_site.py`
verdi, e axe non trova violazioni su nessuna delle quattro schermate in nessuno dei due temi.

Resta **la taratura**, che vuole qualcuno che ci giochi, e una prova su un telefono vero: quelle
qui sono girate tutte in Chromium senza testa, cioè con un mouse che finge di essere un dito.

| | |
|---|---|
| `run/geometry.js` | `ringArea2`, `area2`, `contains`, `split`, `meet`, `chainMeets`, `selfCrosses`, `onBoundary`, `canStep`, `stepToward`, `pathTo`, `walkTo`, `nearestOnBoundary`, `wallsAt`, `aimAt` |
| `run/arenas.js` | otto arene, in ordine di difficoltà misurata: rettangolo, esagono, scala, croce, elle, diamante, anello con isola, due isole — più il **giro**, cioè quante volte l'elenco è già stato percorso |
| `run/game.js` | mondo, marcatore, taglio, conquista, cattura, separazione, quota, punteggio, il Filo, le vite, il rientro, **la Miccia e le Scintille** |
| `run/render.js` · `run/input.js` · `run/app.js` · `index.html` · `styles.css` | il campo, i due temi, i tre modi di giocare, il ciclo dei fotogrammi |
| `run/attract.js` | l'autopilota: la dimostrazione dietro il titolo, e lo strumento con cui si tara |
| `run/i18n.js` | 89 chiavi per lingua, italiano e inglese, con la macchina presa da `gg/i18n.js` |
| `run/audio.js` · `run/haptics.js` | il suono sintetizzato — nessun file, e il contesto che si accende al gettone — e la vibrazione. Due sensi per gli stessi eventi, e nessuno dei due sa cosa sia una regola del gioco |
| `index.html` · `app.js` · `styles.css` | la forma del catalogo: import map, due temi, schermata del titolo, classifica |
| `run/scores.js` | classifica su `gg/store.js`, con export e import via `gg/io.js` |
| `manifest.webmanifest` · `sw.js` · tre icone | installabile, e funzionante senza rete dopo la prima apertura |
| `_src/apps.py` · `_src/article_art.py` | anagrafica e scheda nelle due lingue, e il disegno della card |
| `test/geometry.mjs` · `test/rules.mjs` · `test/attract.mjs` | verdi, e provati rompendo i moduli apposta |
| `tools/tune.mjs` | il banco di taratura: l'autopilota su un livello per volta, molti semi, e i conti. Non è una prova e `check_tests.py` non lo lancia |
| `tools/pilots.mjs` | i giocatori del banco: `base`, che è quello del titolo, e `vigile`, più bravo, che esiste solo per misurare |

L'esclusione di `run/` in `check_site.py` **non è servita**: `_pages()` la scrive già come schema
(`app/<chiave>/run/index.html`), quindi vale per ogni app presente e futura. Era in elenco perché
il documento l'aveva prevista app per app, ed è il caso opposto del solito — una cosa fatta meglio
di come era stata pianificata.

**Quanto costa provare.** `geometry.mjs` e `rules.mjs` sono istantanei; `attract.mjs` gioca dieci
partite intere e ci mette circa un minuto. È un prezzo da prima della pubblicazione, non da ogni
salvataggio.

**Quanto costa girare.** Un passo di mondo sta sotto il decimo di millisecondo anche a partita
avanzata, con le facce da trecento lati: a 120 passi al secondo è l'uno per cento del tempo di un
fotogramma. Il collo di bottiglia non è qui.

---

## Il gesto

Un marcatore vive sul **bordo** della zona già conquistata. Stacca, traccia una linea nel campo
aperto, e quando torna sul bordo il taglio spezza l'aperto in due. La parte senza il nemico
diventa tua. Raggiunta la quota del livello, si passa al successivo.

È il ciclo di un genere di fine anni Settanta, e il riferimento va scritto **nel testo della
scheda**, dove può essere esplicito. Nel nome no: le meccaniche di un genere non sono protette, il
titolo del gioco originale è un marchio ancora rinnovato, e su un dominio aziendale con la pagina
indicizzata usarlo sarebbe uso commerciale del marchio di qualcun altro. Il nome è nostro:
**Recinto**, che è esattamente il gesto — chiudere un recinto attorno a qualcosa.

---

## La regola che tiene tutto

Tutto il gioco discende da una frase sola, e conviene scriverla prima di ogni altra cosa perché è
anche l'unica che il motore geometrico deve sapere:

> **Dopo un taglio, ogni regione risultante che non contiene un Filo diventa tua. Una regione che
> contiene un Filo ma è più piccola della soglia di cattura diventa tua, e quel Filo muore.**

Da quella frase escono, senza aggiungere codice:

| Situazione | Cosa succede | Da quale metà della frase |
|---|---|---|
| Taglio normale, un Filo | La metà libera è tua | prima metà |
| Filo chiuso in una sacca stretta | Cattura: incassi e il Filo sparisce | seconda metà |
| Due Fili separati in due regioni | Nessuna delle due è tua, ma **da qui in poi sono due arene** | prima metà, applicata due volte |
| Ultimo Filo catturato | Livello finito comunque, con tutto il resto in premio | seconda metà |

Il bonus di separazione è l'unica cosa che va riconosciuta a parte: si guarda se il numero di
regioni aperte è cresciuto, e si paga una volta per livello.

**Conseguenza sulla struttura dati, e non è un dettaglio:** l'aperto non è un poligono, è un
*insieme* di facce. Chi lo scrive come una faccia sola si accorge del problema il giorno in cui
aggiunge il secondo Filo, e a quel punto la firma di ogni funzione geometrica è sbagliata.

---

## La geometria è esatta, non una griglia

È la decisione tecnica che decide il gioco, e va presa qui.

Quasi tutti i cloni del genere tengono il campo come una **bitmap** e decidono cosa è tuo con un
riempimento a partire dal nemico. Funziona, è semplice, e rende «vettoriale» solo il disegno: i
bordi sono scalettati, l'area è un conteggio di pixel, e la percentuale dipende dalla risoluzione
scelta.

Qui il campo è un **poligono con coordinate intere**, e ne discendono quattro cose:

- **L'area è esatta.** Formula del laccio su interi: nessun arrotondamento, nessuna percentuale che
  balla, la stessa partita dà lo stesso 78,4% su qualunque macchina.
- **Non esistono epsilon.** Il marcatore si muove su un reticolo (`LATTICE = 4` unità di campo),
  quindi ogni vertice del taglio è un multiplo di 4. Intersezioni e contenimenti si decidono con
  aritmetica intera: o si incrociano o no, senza una soglia da tarare.
- **Le arene possono avere qualunque forma.** Un anello con un'isola al centro costa quanto un
  rettangolo. È il regalo del poligono, ed è ciò che una griglia non dà con la stessa pulizia.
- **Si prova sotto Node.** `geometry.js` è matematica pura: nessun canvas, nessun tempo, nessun
  caso. È il modulo con più test di tutta l'app e il più facile da testarne.

### Le misure

```
FIELD    1024 × 768 unità          // il campo ha misure proprie, comunque sia la finestra
LATTICE  4 unità                   // 256 × 192 posizioni: abbastanza fini da non vedersi
```

**Le pareti delle arene stanno sul reticolo, e vanno solo dritte o a 45°.** È un vincolo sui dati
delle arene, non sul disegno, e si paga da sé: sotto quella regola un passo che attraverserebbe una
parete o ci finisce sopra, oppure ha il punto di mezzo oltre — due controlli, invece di intersecare
ogni passo con ogni lato del contorno. È anche il motivo per cui il gioco resta a spigoli netti.

**I poligoni si tengono in unità di reticolo, non di campo.** Sono numeri piccoli e sempre interi,
e la conversione a unità di campo avviene una volta sola, nel renderer. Tenerli in unità di campo
funzionerebbe finché qualcuno non introduce un mezzo passo.

**E le aree si contano doppie.** La formula del laccio dà il doppio dell'area, che è sempre intero,
mentre l'area può essere una metà. Tenendo il doppio ogni somma, ogni confronto e ogni percentuale
restano in interi, e la quota del livello si decide senza mai dividere.

Il campo ha misure proprie per la stessa ragione di AstroDroid: se il terreno si stirasse per
riempire la finestra, un monitor largo darebbe più spazio di manovra di un telefono, e la
classifica confronterebbe partite diverse. Il renderer mette le bande nere; la geometria non lo
sa.

### Le operazioni, e nient'altro

`geometry.js` espone poco, e ogni funzione è pura:

| Funzione | Cosa fa | Il caso che la rompe |
|---|---|---|
| `area(ring)` | laccio con segno, interi | un anello con meno di tre punti |
| `contains(face, point)` | raggio, pari-dispari, con i buchi | il raggio che passa esatto per un vertice |
| `split(face, chain)` | taglia una faccia con una catena | catena che parte e finisce sullo stesso buco |
| `crosses(chain, segment)` | autointersezione e contatto col bordo | due diagonali che si incrociano a metà passo |
| `meet(a, b, c, d)` | due segmenti si toccano | due diagonali che si incrociano a metà passo |
| `selfCrosses(chain, next)` | la catena tornerebbe su sé stessa | il lato appena percorso, che condivide un punto per costruzione |
| `chainMeets(chain, a, b)` | il Filo tocca la linea incompiuta | la coda, non solo la punta |
| `onBoundary(face, point)` | il punto è sul contorno | la fenditura senza spessore lasciata da un taglio |
| `pathTo(face, from, target)` | il percorso deterministico da un punto verso un altro | bersaglio fuori dalla faccia |

Tre trappole che conviene avere scritte prima di incontrarle:

- **La sacca ritagliata su un'isola viene gratis**, ma solo se l'orientamento porta il significato:
  la sacca si misura positiva e diventa una faccia, quello che resta dell'isola si misura negativo e
  resta un buco. Scritto con un campo `isHole` accanto all'anello sarebbe stato un caso in più da
  riconoscere a mano, e uno da sbagliare.
- **Un taglio che va dal bordo esterno a un'isola non spezza niente.** Topologicamente apre il
  buco: la faccia resta una, con il contorno che ora entra, gira intorno all'isola e torna. È il
  caso che nessuno prevede e che manda in crisi ogni `split` scritta pensando «due metà».
- **Il raggio del contenimento passa per i vertici, e va bene.** La prima idea era provare più
  direzioni finché una non ne tocca nessuno. Non serve: basta che la fascia di altezza del lato sia
  **semiaperta** — `>` da tutte e due le parti, mai `>=` da una sola — e ogni vertice viene contato
  una volta esatta, qualunque raggio si scelga. Mescolare i due confronti è invece il difetto vero,
  e non si vede finché un punto non capita alla stessa altezza di un angolo: dopo un taglio ogni
  angolo è alla stessa altezza di qualcosa.
- **Il taglio di prima diventa un muro, e il muro non ha spessore.** Aperta un'isola, la faccia si
  porta dentro una fenditura di larghezza zero — la linea appena tagliata. Di qua e di là è la
  stessa faccia, quindi il contenimento risponde «dentro» da tutte e due le parti, eppure passarci
  attraverso vorrebbe dire attraversare un taglio già fatto. Detto al giocatore è una regola sola e
  se la aspetta: **le tue linee restano.**
- **Le diagonali si incrociano senza condividere un punto.** Con il movimento a quattro direzioni
  un percorso può incrociarsi solo su un vertice già visitato, e basta un insieme. Con otto
  direzioni due passi diagonali opposti si tagliano a metà cella: serve il test segmento-segmento
  vero. È esatto perché è su interi, ed è la ragione per cui `crosses` esiste come funzione a sé.

---

## Il movimento e il tratto

Otto direzioni, diagonali comprese. È la scelta che si vede: tagli obliqui vogliono dire
triangoli, rombi, stelle — forme che un clone a griglia non produce, e che sono metà del motivo per
cui il gioco si chiama vettoriale.

**La velocità è costante in distanza, non a passo.** Un passo diagonale copre √2, quindi impiega
√2 volte il tempo. Senza questa riga la diagonale sarebbe una scorciatoia e nessuno taglierebbe più
dritto.

Due velocità di tratto, ed è il cuore del rischio del genere:

| | Velocità | Vale | Perché sceglierla |
|---|---|---|---|
| Tratto **veloce** | 100% | ×1 all'area | esci e rientri prima che il Filo arrivi |
| Tratto **lento** | ~55% | **×2 all'area** | il doppio dei punti per il doppio del tempo scoperto |

Senza il tratto lento il gioco è solo evitare cose. Con il tratto lento il giocatore decide quanto
rischiare a ogni singola uscita, che è una decisione ogni tre secondi per tutta la partita.

Sul bordo il marcatore si muove sempre alla velocità piena, e lì non è vulnerabile al Filo — solo
alle Scintille.

---

## Si gioca col dito e col mouse, non solo da tastiera

Da tastiera il giocatore esprime una **direzione**, otto volte al secondo o quante ne servono. Col
dito e col mouse esprime una **destinazione**. Sono due cose diverse, e provare a far finta che
siano la stessa — uno stick virtuale disegnato in un angolo — dà il peggio dei due: la precisione
della tastiera senza la sua immediatezza, e la comodità del tocco senza la sua diretta.

Quindi il puntatore ha un modello suo, e sta in una riga sola:

> **Il marcatore va sempre verso il bersaglio corrente. Premere e trascinare sposta il bersaglio.
> Rilasciare lo lascia dov'è.**

Da quell'unica regola escono tutti i gesti, senza modalità da distinguere:

| Gesto | Cosa fa | Perché cade fuori dalla regola |
|---|---|---|
| Tocco secco, clic | il marcatore parte verso quel punto | premi e rilasci nello stesso posto |
| Trascinamento | lo guidi dal vivo, mentre si muove | il bersaglio si sposta sotto il dito |
| Puntatore che passa senza premere | anteprima e basta | il bersaglio non è ancora cambiato |
| Nuovo tocco mentre stai tagliando | ripunti da dove sei | il bersaglio cambia, il taglio no |

L'ultima riga è quella che rende il tocco giocabile: il Filo cambia idea e tu devi poter cambiare
la tua **mentre la linea è già fuori**, senza tornare indietro e senza fermarti.

### Tagliare o camminare lo decide dove alzi il dito

Un bordo e un campo aperto vogliono due cose diverse, e chiedere un bottone per scegliere sarebbe
un bottone in più da spiegare. Lo decide il punto di rilascio:

- **sulla fascia del bordo** (due celle di reticolo, quindi una striscia sottile) → il marcatore
  **cammina** lungo il confine fino a lì, dalla parte più corta;
- **dentro il campo aperto** → **taglia** verso quel punto, e il taglio si chiude da sé quando il
  percorso incontra il bordo.

Da cui una cosa comoda e non ovvia: per tagliare da parte a parte non serve mirare esatto sulla
parete opposta. Si punta poco prima e il percorso ci arriva comunque, perché è il bordo a fermarlo.
Un bersaglio fuori dalla faccia in cui ti trovi non è un errore da segnalare: il percorso si taglia
dove finisce la faccia, che è esattamente quello che il giocatore voleva.

### L'anteprima mostra l'intenzione, mai il risultato

È la riga da non tradire, ed è una questione di classifica prima che di gusto.

Il percorso è **deterministico** — `pathTo` è una funzione pura di faccia, partenza e bersaglio —
quindi disegnarlo in trasparenza non regala niente: mostra al giocatore l'ingresso che ha appena
dato, che chi gioca da tastiera vede già perché lo sta componendo passo per passo.

**L'area che verrebbe conquistata, e i punti che varrebbe, non si mostrano.** Sarebbero
informazione sul mondo, non sull'intenzione, e la classifica non distingue per periferica: un modo
di giocare che sa in anticipo quanto vale un taglio starebbe confrontando una partita diversa.
La tentazione tornerà, perché ombreggiare il poligono risultante è bello e costa due righe —
quelle due righe sono il difetto.

### Il tratto lento è un interruttore, non una pressione

Il tratto lento vale il doppio e va scelto **prima** di uscire, non tenuto premuto durante. Quindi
sul puntatore è un interruttore a schermo, sempre visibile, che dice anche il ×2 — e resta com'è
finché non lo tocchi. Le scorciatoie restano: modificatore da tastiera, secondo tasto del mouse,
grilletto sul gamepad.

Un interruttore invece di una pressione dice anche la cosa giusta sulla meccanica: quella scelta
è una scommessa presa in anticipo, non una regolazione continua.

### Le cinque cose che il tocco rompe se non le previeni

- **Il dito copre il bersaglio.** Il punto di mira sta un centimetro **sopra** il dito, e il
  percorso in trasparenza si vede comunque perché esce da sotto la mano.
- **Il tocco non ha il passaggio sopra.** Niente anteprima gratis come col mouse: appare
  premendo, e per questo premere e rilasciare senza muoversi deve già valere come mira.
- **Fermarsi è ancora un errore, e ora è più facile.** Un bersaglio piazzato in mezzo al campo si
  raggiunge, e lì il marcatore si ferma e la Miccia parte. È giusto che sia così — è lo stesso
  errore del tasto lasciato — ma va **detto a schermo**, con il marcatore che cambia stato in modo
  inequivocabile nell'istante in cui si ferma.
- **Lo scorrimento della pagina e il pizzico per ingrandire.** `touch-action: none` sul campo,
  `preventDefault` sui gesti, e nessun elemento sopra il canvas che li intercetti.
- **I bersagli sotto il pollice.** Interruttore del tratto, pausa e ritorno stanno ai lati bassi,
  fuori dal campo, e non sotto i 44 px per lato.

### Dove vive tutto questo: in `input.js`, non nel mondo

**`game.js` continua a ricevere solo una direzione e una velocità di tratto.** È `input.js` a
tradurre un bersaglio nella direzione del passo, una volta per passo, leggendo la posizione del
marcatore e nient'altro.

Non è pulizia: è ciò che fa sì che il puntatore aggiunga **zero righe** al modulo che i test
provano sotto Node, e che una partita registrata resti una sequenza di direzioni — la stessa,
qualunque sia stata la periferica che le ha prodotte. La dimostrazione dietro il titolo continua a
funzionare per la stessa ragione, perché anche l'autopilota parla la lingua delle direzioni.

L'anteprima invece è disegno, quindi sta in `render.js`, che chiama `pathTo` e ne traccia il
risultato. La stessa funzione la può usare l'autopilota per scegliere dove andare.

---

## Le tre minacce sono tre paure diverse

Non è ridondanza: ognuna vieta una cosa diversa, e insieme non lasciano nessun posto sicuro dove
stare fermi.

### Il Filo — *non stare fuori*

**Com'è fatto, e perché così.** Due capi che vanno per conto loro, tenuti dentro una forbice da un
guinzaglio che li **sterza** invece di spostarli, e una scia di quello che il segmento fra loro è
stato. Il contorcersi non è animato da nessuno: esce da lì. E la scia non è un effetto, **è il
corpo** — ogni segmento disegnato uccide, così non esiste una sagoma di collisione diversa da quella
che si vede né qualcosa di letale che non fosse sullo schermo.

Due capi senza guinzaglio non si contorcono: divergono, e dopo cinque secondi sono in due angoli
opposti con mezzo schermo di segmento in mezzo. E la deriva sulla direzione va **bassa**, che è il
contrario di quello che sembra: girata su, la direzione fa una passeggiata a caso e il Filo
serpeggia sul posto.

Un nastro di segmenti che si contorce e rimbalza dentro una faccia aperta. Uccide il marcatore
mentre traccia, e uccide la **linea incompiuta**: toccarla in un punto qualsiasi finisce la vita,
il che rende pericoloso anche il tratto già lasciato alle spalle.

Rimbalza con un margine di sicurezza dal bordo (`CLEARANCE`), e non è un dettaglio estetico: tiene
il suo centro sempre strettamente interno, così il test di contenimento dopo un taglio non ha mai
un caso ambiguo da decidere.

Dal livello 3 i Fili sono due. Finché condividono la stessa faccia si ignorano; il taglio che li
mette in due facce diverse paga il bonus grosso — e da lì in poi sono due arene da chiudere.

### Le Scintille — *non stare sul bordo*

Corrono lungo il confine delle facce aperte, cioè esattamente dove cammina il marcatore. Contatto:
una vita.

Il punto interessante è che **il confine cambia a ogni conquista**, quindi cambia il loro percorso:
ogni taglio riscrive il tabellone anche per loro. Da cui l'unico pezzo di codice davvero noioso di
tutto il progetto — riagganciare ogni scintilla al punto più vicino del nuovo bordo, mantenendo il
verso di marcia. Va scritto una volta, in una funzione sola, con il suo test.

Una scintilla al livello 1, una in più ogni due livelli fino al tetto, e accelerano dentro il
livello: chi tiene il bordo a lungo viene sloggiato.

**Il riaggancio, scritto com'è venuto.** L'indice che una Scintilla tiene sulla sua pista è una
**comodità verificata, non una verità**, e la funzione che lo risolve ha tre gradini in ordine di
costo: la scommessa — quasi sempre la pista è quella di un fotogramma fa e l'indice è ancora buono,
due confronti; il ripescaggio — stesso bordo, posto diverso nell'elenco; e il riaggancio vero, per
quando il bordo su cui correva è stato proprio conquistato via, che va al punto più vicino di quello
che è rimasto tenendo il verso di marcia. Nessun altro tocca quell'indice.

**E il punto più vicino non può essere il marcatore.** Dal 23 settembre 2026 il riaggancio sceglie il
punto più vicino del bordo rimasto **fra quelli ad almeno 30 unità dal marcatore** (`SPARK.clear`).
Se in una sacca piccola nessun punto è abbastanza lontano, sceglie il più lontano. Il perché, e le
misure, stanno in «La Scintilla non ricompare sotto il marcatore».

E le piste ci sono per **ogni anello**, isole comprese: su un'isola si cammina, quindi sull'isola ti
prendono.

### La Miccia — *non stare fermo*

**Premere non è muoversi.** La Miccia guarda se il marcatore ha cambiato posto, non se il giocatore
stava premendo: spingere contro un muro o all'indietro sulla propria linea è stare fermi tanto
quanto non premere niente, e non c'è niente da distinguere fra le due cose. Ne discende una coda di
un fotogramma o due quando riparti — il marcatore deve ancora accumulare abbastanza strada per il
primo passo, e in quei fotogrammi è fermo davvero. La linea non ricresce mai: quello che è bruciato
è bruciato.

Misurato sul Filo finito, e vale la pena averlo scritto prima di scriverla: **su quaranta partite,
in una dozzina il Filo non trova mai una linea lasciata fuori nel giro di un minuto.** Vaga, e una
linea abbandonata in un angolo tranquillo resta lì. Non è un difetto del Filo da tarare via — è che
a fare la guardia a una linea ferma ci deve pensare un'altra cosa, e quella cosa è questa.

Se il marcatore si ferma mentre sta tracciando, la sua stessa linea comincia a bruciare da dietro.
La miccia avanza solo mentre sei fermo, non arretra quando riparti, e se ti raggiunge è una vita.

È la regola che rende impossibile la strategia «esco di un passo e aspetto di vedere cosa fa il
Filo», che senza di lei è la strategia ottima e uccide il gioco.

---

## Il punteggio

```
punti del taglio = area conquistata × 5 × (lento ? 2 : 1) × numero del livello
```

Più tre voci che non dipendono dall'area:

- **Cattura**: chiudere un Filo in una sacca sotto la soglia vale 3000 punti a Filo, fissi.
- **Separazione**: vale 5000 punti, una volta per livello, quando due Fili finiscono in facce diverse.
- **Oltre quota**: 250 punti per ogni punto percentuale conquistato oltre il bersaglio del livello,
  pagati alla chiusura. È ciò che convince a non fermarsi al 70% esatto.

**Il moltiplicatore è il numero del livello, lineare e senza tetto.** Al decimo livello un taglio
vale dieci volte lo stesso taglio al primo. È stato lasciato così di proposito: cambiarlo senza
partite vere vorrebbe dire scegliere a tavolino chi vince in classifica, se chi va lontano o chi
gioca pulito.

**Vite in più non ce ne sono.** Le tre vite iniziali passano da un livello all'altro e non
ricrescono. Questo diario prometteva «una vita in più a soglie fisse», un Filo che accelera del 6% a
livello e una soglia di cattura che si stringe. Nessuna delle tre cose è mai stata scritta nel
codice. Il diario le ha date per fatte fino al 23 settembre 2026, quando le ho confrontate con
`game.js`. La scheda e le istruzioni non le avevano mai promesse. Se una delle tre torna, torna come
decisione da misurare, non come riga di questa tabella.

---

## I livelli

Tutto quello che cresce, com'è **nel codice** (`RULES` e `SPARK` in `game.js`):

| | Livello 1 | Come cresce | Tetto |
|---|---|---|---|
| Quota | 70% | +2% a livello | 85%, dal livello 9 |
| Fili | 1 | 2 dal livello 3, se l'arena ha almeno 15.000 unità d'area a Filo | 2 |
| Scintille | 1 | +1 ogni due livelli: 2 al 3, 3 al 5, 4 al 7 | 4 |
| Velocità delle Scintille | 30 | +1,1 al secondo dentro il livello, dopo 3 s di tregua; +9 alla partenza a ogni giro delle otto arene | 110 |
| Velocità del Filo | 68 | **non cresce** | — |
| Soglia di cattura | sacca sotto 700 unità d'area | **non cambia** | — |

**L'arena cambia forma.** È la cosa che il poligono regala: rettangolo, elle, anello con un'isola
al centro, esagono, e più avanti forme composte. Le arene stanno in un file di dati — una lista di
anelli in coordinate reticolari — non nel codice, così aggiungerne una è aggiungere righe a un
array e il test le passa tutte con lo stesso ciclo.

L'isola è più di un ornamento: cambia il gioco, perché è un bordo su cui si può camminare ma da cui
non si può scappare verso il resto del campo, e le Scintille ci arrivano.

---

## I file, e dove passano i confini

```
app/recinto/
├── index.html                  ← generata da build.py, non si tocca a mano
├── LICENSE  NOTICE
├── run/
│   ├── index.html  styles.css  manifest.webmanifest  sw.js
│   ├── geometry.js   poligoni interi. Matematica pura, nessun tempo, nessun caso.
│   ├── game.js       il mondo e un passo. Nessun canvas, nessun DOM, nessun audio, nessun timer.
│   ├── render.js     canvas, bande nere, interpolazione
│   ├── input.js      tastiera, mouse, tocco, gamepad: da tutte esce una direzione
│   ├── audio.js      sintesi, niente file
│   ├── attract.js    l'autopilota dietro il titolo
│   ├── i18n.js  scores.js  card.js  app.js
│   └── icon-192.png  icon-512.png  icon-maskable-512.png
└── test/
    ├── geometry.mjs  rules.mjs  attract.mjs
```

`geometry.js` è separato da `game.js` di proposito. Sono due cose diverse: una è matematica che
vale in astratto e va provata a fondo, l'altra sono le regole di un gioco. Tenerle insieme
significa che i test della prima devono costruire un mondo per esistere.

Dal catalogo si riusa `_lib/`: `store.js`, `io.js`, `theme.js`, `install.js`, `i18n.js`,
`base.css`. Niente di nuovo entra in `_lib/` prima di un secondo uso vero.

### Come si scrive il codice

Vale quanto già stabilito: commenti in inglese, metodi privati con l'underscore e la minuscola,
niente `#region` ma commenti che dividono le sezioni —

```js
// -----------------------------------------------------------------------------------------------------------------
//  c t r
// -----------------------------------------------------------------------------------------------------------------
```

E il resto dal catalogo: ES modules, nessun bundler, nessun transpilatore. Il file servito è il
sorgente, perché «open» sia letterale per chi apre il sorgente della pagina.

---

## I test sotto Node

Un gioco d'azione è il programma più difficile da provare attraverso la sua interfaccia e il più
facile da provare sotto, purché la simulazione sia una funzione di uno stato e di un'intenzione.

**`test/geometry.mjs`** — il grosso del lavoro, e va scritto per primo, prima del gioco:
area con segno e con i buchi; taglio che spezza in due; taglio dal bordo esterno a un'isola che
*non* spezza; contenimento con il raggio che tocca un vertice; due diagonali che si incrociano;
catena che tocca il bordo a metà percorso; catena degenere di un solo passo; e che la somma delle
aree dopo un taglio sia esattamente l'area prima. Più `pathTo`: che si fermi sul bordo quando il
bersaglio sta fuori dalla faccia, che non attraversi una fenditura lasciata da un taglio
precedente, e che ricalcolarlo da un punto qualsiasi del percorso dia la coda di quello disegnato —
è quel controllo, e non l'intenzione di chi scrive, a garantire che l'anteprima non menta.

**Un test che passa al primo colpo non dice ancora niente.** Tutti e due i file sono stati provati
rompendo il modulo apposta, una riga per volta, e ogni volta qualcosa è sopravvissuto:

| Mutazione sopravvissuta | Cosa voleva dire |
|---|---|
| l'anello più piccolo che contiene il buco | codice morto: uno split rende al massimo due contorni, affiancati e mai annidati — via |
| il controllo di mezzo passo | nessun caso lo esercitava, finché non è stata scritta la fenditura obliqua |
| il tratto lento letto a ogni passo | il punteggio leggeva già il valore giusto: a tradire era il **tempo**, e serviva una prova sui fotogrammi |
| il premio di separazione pagato ogni volta | nella prova si separava una volta sola. Ora si separa due volte |

Rifarlo a ogni funzione nuova: sono dieci minuti e finora ha trovato qualcosa ogni volta.

**`test/rules.mjs`** — in cima a tutto un invariante: **conquistato più ancora aperto fa sempre
quello che l'arena era all'inizio**. Se smette di valere, la percentuale sullo schermo è
un'invenzione e la classifica confronta partite diverse; costa una riga per prova e prende quasi
tutto il resto. Poi la cattura sotto soglia; la separazione pagata una volta sola *e non due*; la
scommessa del tratto lento piazzata uscendo e non regolabile per strada; la quota raggiunta che
chiude il livello; tutte le arene percorse dallo stesso ciclo; e **lo stesso seme che dà la
stessa partita**. Con la Miccia e le Scintille arriveranno qui la miccia che avanza solo da fermi e
la scintilla riagganciata al bordo nuovo senza cambiare verso.

**`test/attract.mjs`** — la dimostrazione dietro il titolo taglia, conquista, fa punti e prima o
poi perde. Serve perché un autopilota che non fa niente **non sembra rotto**: lo schermo non è
vuoto e la console tace. E siccome quella schermata è anche lo screenshot della scheda, la prima
cosa che si vedrebbe del gioco sarebbe il gioco non giocato.

Le tre regole di simulazione già pagate una volta in AstroDroid, che qui valgono identiche:

- **Il passo è fisso** (`STEP = 1/120`) **e il disegno interpola.** Un passo per fotogramma lega la
  velocità del Filo alla frequenza dello schermo.
- **Il tempo accumulato ha un tetto.** Una scheda in secondo piano non riceve fotogrammi; al
  ritorno sarebbero minuti eseguiti in un colpo solo, con il marcatore già morto.
- **Il caso ha un seme, e il seme sta nel mondo.** Non in una chiusura: un mondo va poter essere
  copiato, rigiocato e scritto su disco.

---

## Cosa eredita dal catalogo, senza sconti

Sono le cinque cose che si rimandano alla versione successiva, e la versione successiva di un'app
gratuita spesso non arriva. Dalla prima versione:

- **Due lingue** a runtime, italiano e inglese, in una copia sola di codice.
- **Due temi**, gli stessi del sito.
- **Installabile** come PWA, con `run/` come `start_url`.
- **Export e import** — per un gioco sono la classifica e i progressi. Una pulizia del browser non
  deve portarli via.
- **Anagrafica completa** in `_src/apps.py`: chiave `recinto`, tag `svago`, e l'**ordine deciso a
  mano dopo ogni app che lavora** — per data un gioco sarebbe la prima cosa che vede chi arriva su
  `/app/`, ed è la meno rappresentativa di quello che l'azienda fa.

Il gettone: le partite sono infinite, il gettone serve a dire che quello che stai per fare comincia
adesso — ed è anche il gesto che il browser richiede per far partire l'audio, quindi il rito si
paga da sé.

**`check_site.py` va tenuto lontano da `run/`.** L'esclusione si scrive una volta sola, in
`_pages()`. La barra di condivisione sta sulla scheda, non dentro l'app.

---

## Il campo si gira, non si stira

Su un telefono in verticale un campo 4:3 diventava una striscia di 360×270 dentro un riquadro di
360×564: **il quarantotto per cento** dello spazio disponibile, e due fasce nere. Per un gioco
progettato per il dito era la cosa che stonava di più.

La tentazione è far riempire il campo alla finestra. Non si fa, e non è pignoleria: le misure del
campo sono quelle su cui la classifica confronta partite diverse — un monitor largo darebbe più
spazio di manovra di un telefono, e le percentuali confronterebbero giochi diversi.

Ma **stirare e ruotare non sono la stessa cosa.** Una rotazione è un'isometria: stesse aree, stesse
distanze, stessi angoli. Girato di novanta gradi è lo **stesso identico gioco**, tenuto di traverso.
Quindi su una finestra più alta che larga il renderer gira il campo, e:

| | prima | adesso |
|---|---|---|
| campo su un telefono 360×740 | 360×270 | **360×480** |
| spazio usato | 48% | 85% |

**E non se ne accorge una riga di `game.js`.** La rotazione vive nella trasformazione del renderer,
che `input.js` percorre già all'indietro per sapere dove è stato toccato: un solo posto, in due
direzioni. Il mondo resta quello di sempre, le prove non cambiano di una virgola, e la classifica
confronta ancora partite identiche.

Ne segue una cosa sola, e va fatta: **i comandi girano con lo schermo.** «Giù» premuto è giù
guardato, non giù nel campo — la conversione sta in `input.js`, l'unico posto che conosce sia lo
schermo sia il mondo.

L'invito a girare il telefono, scritto il giorno prima, è stato tolto: adesso in verticale si gioca,
e il manifesto torna a non avere preferenze sull'orientamento.

---

## Camminare o tagliare: la domanda era sbagliata

Col mouse, cliccando la parete opposta per chiudere il recinto, il marcatore faceva **il giro del
perimetro**. La regola guardava una cosa sola — «il bersaglio è vicino a un muro?» — ed era la
risposta corretta alla domanda sbagliata. La domanda è: *da dove sono in piedi, quel punto lo
raggiungo prima girando o tagliando?*

Tre casi, in ordine, e fra il secondo e il terzo non c'è nessuna soglia inventata:

1. il bersaglio è sul bordo **e** ci si arriva in pochi passi → si cammina, anche se girare
   l'angolo passerebbe per un pezzetto di campo: è un riposizionamento;
2. il taglio può partire → si taglia. Se una linea può uscire verso quel punto, è quello che chi la
   traccia voleva;
3. il taglio non può nemmeno cominciare → si cammina, quanto serve. È il bersaglio **sulla stessa
   parete su cui si è in piedi**: di là non si taglia, e non c'è altro da volere.

**E la seconda metà dello stesso difetto**, che si è vista solo provando: cliccando tre pixel prima
del bordo si mira a un'unità dal muro, il marcatore ci si ferma davanti — perché è lì che gli è
stato detto di andare — e la Miccia gli mangia la linea mentre aspetta. Mirare vicino a un muro
vuol dire **quel muro**: il bersaglio si appoggia sul bordo, e il recinto si chiude.

La decisione sta in `geometry.js` e non in `input.js`, così si prova sotto Node: sono otto righe di
prova e sono il difetto che tornerebbe per primo.

---

## Il telefono in verticale, misurato

A 360 px la pagina **scorreva di lato**: 529 px di contenuto in 360 di finestra, con «High scores»
e i tre interruttori tagliati fuori dallo schermo. Non si vede a larghezza da scrivania, e nessuna
delle prove precedenti l'aveva mai chiesto.

La correzione è due righe, ma la prima versione ne ha introdotta un'altra: comprimendo tutto su una
riga sola i bottoni scendevano a **40 px**, sotto la soglia difesa in ogni altro punto dell'app e
proprio sullo schermo dove il dito è l'unico puntatore. Ora la barra va **a due righe**: quaranta
pixel di altezza in più, e li vale — un comando che si manca non è un comando.

**Quello che il CSS non risolve** è che un campo 4:3 dentro uno schermo verticale resta un terzo
dell'altezza. Le misure del campo non si toccano, perché è su quelle che la classifica confronta
partite diverse: quindi il manifesto dichiara `landscape` e l'app, in verticale su uno schermo
basso, chiede di girare il telefono.

---

## Far vedere quello che brucia

Due cose che il giocatore non vedeva, e in un gioco dove si muore per quelle due cose.

**La Scintilla era un puntino di tre pixel appoggiato sopra la linea del bordo** — cioè sopra la
cosa più luminosa dello schermo. Il contrasto col campo era ottimo (7,5) e non si vedeva lo stesso,
perché competeva con un muro acceso: un difetto che nessuna misura di contrasto trova, perché non è
un problema di contrasto. Adesso ha tre cose che il puntino non aveva: una **scia** che dice da che
parte sta arrivando, un **cuore bianco** che non è del colore di nient'altro sullo schermo, e dei
**raggi** che rompono la linea invece di starci sopra.

**La Miccia era una linea spenta con un pallino arancione in cima.** Diceva «qui», e quello che
serve dire è «*qui sta bruciando*». Ora la testa ha tre strati dal freddo al caldo, un alone che
pulsa, e delle faville che saltano via; la parte già mangiata resta leggibile — è l'informazione
«quanta corda ti resta» — ma sottile, perché è cenere e non linea.

**Il tremolio è deterministico**, e non è pignoleria: dipende da quanto la Miccia ha bruciato e da
dove la Scintilla si trova, non da `Math.random`. Così il disegno resta **una funzione del mondo** —
lo stesso mondo torna a disegnare lo stesso fotogramma, e lo screenshot della scheda resta identico
a ogni build. Con il caso vero la fiamma sarebbe stata più facile e quella proprietà sarebbe sparita.

La scia delle Scintille vive nel renderer e non nel mondo, di proposito: è decorazione, non regola,
e una cosa che non decide niente non deve finire in un salvataggio né in un test.

---

## Il riquadro della versione, e una domanda senza risposta

La registrazione del service worker scritta a mano è stata buttata: `gg/update.js` la fa meglio —
aspetta sullo **stato** e non solo sull'evento `load`, che è esattamente l'errore che avevo fatto —
e in più dice quello che il worker taceva: che c'è una versione nuova, e che si prende premendo.

Poi il riquadro sotto il nome dell'app è rimasto **vuoto e visibile**. `gg/update.js` chiede la
versione **al worker**, su un canale, perché la versione vive in `sw.js` e in nessun altro posto —
e il mio `sw.js` non rispondeva a quella domanda. Nessun errore da nessuna parte: una domanda senza
risposta non è un'eccezione, è solo un bottone che non dice niente.

---

## Le prove esistono, e adesso qualcuno le lancia

`check_apps.py` controlla ventiquattro cose e nessuna di queste era «le tre suite passano». Ora c'è
un lanciatore che le esegue tutte, per tutte le app, e la prima volta che è girato ha detto una cosa
che nessuno sapeva: **32 suite su 68 non partivano nemmeno.** Importano la libreria condivisa come
`gg/…`, che nel browser risolve la import map e in Node non risolve niente.

Insegnata quella mappa a Node — venti righe fra gli attrezzi, non un `node_modules` in fondo al
repository, che è precisamente quello che questo catalogo ha scelto di non avere — ne passano
**51 su 62**. Le undici che restano sono tutte di un'altra app e vogliono un IndexedDB finto: è
lavoro di quella, e non si scrive di nascosto.

Il lanciatore ha un tetto **per suite** e non per l'insieme, dopo che una prova ferma ad aspettare
qualcosa che non sarebbe mai arrivato ha bloccato tutte quelle dopo di lei.

---

## I contrasti si misurano, e misurandoli è saltato fuori il difetto peggiore

La tavolozza era stata scelta a occhio. Misurata con le soglie di WCAG — 4,5 per il testo, 3 per
tutto ciò che porta informazione senza essere testo — sono cadute tre coppie, e la prima è la cosa
più importante che questo gioco disegna:

| | prima | adesso |
|---|---|---|
| **conquistato contro campo aperto** | **1,23** | 3,01 |
| linea già bruciata dalla Miccia | 2,27 | 3,02 |
| bordo di un bottone | 1,35 | 3,02 |

**A 1,23 la distinzione fra «questo pezzo è tuo» e «questo no» era quasi invisibile** per chiunque
non avesse una vista perfetta su un buon monitor — cioè il dato principale del gioco, quello che
tutta la geometria esatta esiste per calcolare. Alzarlo cambia l'aspetto del gioco, e va bene così:
adesso quale metà è tua si legge a colpo d'occhio.

Il primo tentativo prendeva il colore più vicino all'originale che passasse il 3:1, e usciva un blu
squillante. **Il minimo di contrasto non obbliga al massimo di colore**: a parità di luminanza la
tinta si può dimezzare, e il risultato è lo stesso 3,02 con metà del chiasso.

Il bordo dei bottoni ha portato con sé una distinzione che mancava: **`--line` e `--control` sono
due ruoli, non due sfumature.** Il primo separa e può essere discreto; il secondo disegna il
contorno di una cosa che si preme e deve arrivare a 3. Fonderli vuol dire o separatori pesanti o
bottoni senza contorno.

**E axe non avrebbe visto niente di tutto questo**, perché sono pixel dentro un canvas. Zero
violazioni automatiche e un difetto grave nello stesso schermo: gli strumenti dicono dove guardare,
non cosa è importante.

### Il resto del giro

- **Il fuoco da tastiera si vede**, con due anelli — uno chiaro e uno scuro — così non sparisce né
  sul chip né sul campo. Il gioco è giocabile da tastiera per progetto, e senza indicatore non si
  sa su quale bottone si è.
- **Il campo racconta sé stesso.** Per un lettore di schermo un canvas è un rettangolo muto:
  adesso porta una descrizione — percentuale, vite, livello — riscritta **solo quando cambia**,
  perché riscriverla a ogni fotogramma vorrebbe dire una voce che parla centoventi volte al secondo.
  Accanto c'è una regione viva e gentile che dice le morti e i livelli chiusi.
- **Il campo prende il fuoco con Tab**, perché un comando che si usa e non si raggiunge con la
  tastiera, per qualcuno, non esiste.

---

## Il gioco si ferma quando smetti di guardarlo

Tre buchi trovati rileggendo, e sono tutti e tre lo stesso buco: **momenti in cui si muore per
qualcosa che non è una mossa del giocatore.**

- Non c'era la **pausa**. Le stringhe erano nel dizionario dal primo giorno e non le usava nessuno.
- Cambiando scheda con la linea fuori si tornava morti. Il tetto sul tempo accumulato impedisce che
  al ritorno venga eseguito mezzo minuto in un colpo solo, ma non impedisce questo. **Una telefonata
  non è una mossa**, quindi `visibilitychange` mette in pausa.
- **Aprire la classifica uccideva.** Si leggeva la tabella e intanto la Miccia mangiava la linea.
  Ora aprirla mette in pausa e chiuderla riprende.

In pausa il tempo accumulato si butta: ripartire non deve mai voler dire recuperare i secondi
passati a leggere.

---

## Due difetti che si vedono solo senza rete

**Il service worker registrato da un modulo, e il `load` che è già passato.** La registrazione
stava dentro un `addEventListener("load", …)`: i moduli girano dopo il documento, e su una pagina
piccola come questa quel momento è passato prima che il modulo arrivi a chiederlo. Il listener non
scatta mai, il worker non si registra, e non se ne accorge nessuno — finché qualcuno non prova a
usare l'app in galleria. Si prova con `document.readyState`, e si verifica staccando la rete.

**E `addAll` che fallisce tutto insieme.** Se **un solo** file dell'elenco di precache non
risponde, l'installazione del worker fallisce per intero e in silenzio: la registrazione va a buon
fine, la pagina non dice niente, e l'app semplicemente non funziona offline. È il motivo per cui
quell'elenco è tenuto a mano e confrontato con la cartella da `check_apps.py`, e il motivo per cui
la prova vera è una sola: **spegnere la rete e ricaricare.**

---

## Dietro il titolo si gioca

La schermata del titolo non copre il campo: ci sta sopra, e sotto la dimostrazione continua a
giocare. È una riga di CSS ed è la prima cosa che qualcuno vede di questo gioco — anche
letteralmente, perché quella schermata è lo screenshot della scheda.

Il velo va tenuto **leggero**, e la prima versione l'aveva al 78%: tecnicamente la dimostrazione
c'era, praticamente era un'ombra. La leggibilità del testo la porta il testo, con la sua ombra, non
il velo. L'unica schermata col velo pieno è quella delle istruzioni, perché lì guardare il campo
dietro non serve a niente.

---

## L'autopilota non è la dimostrazione: è lo strumento di misura

Nasce per la schermata del titolo — e quella schermata è anche lo screenshot della scheda, quindi
la prima cosa che qualcuno vede di questo gioco è un gioco giocato invece che un gioco fermo. Ma il
mestiere vero se l'è preso subito dopo: **è l'unica cosa che risponde alle domande sui numeri.**
Quanto deve andare veloce il tratto, quanto deve essere alta la quota, quando le Scintille diventano
insopportabili non si decidono a tavolino. Si decidono giocando quattrocento partite e contando.

Parla la stessa lingua di una persona — una direzione e una velocità di tratto, una volta per passo
— e non ha accesso privilegiato a niente: legge il mondo che legge il renderer e muore delle stesse
tre cause. Il suo caso ha un seme **suo**, tenuto separato da quello del mondo: mescolarli
vorrebbe dire che cambiare come ragiona l'autopilota cambia quello che fanno i Fili, e allora due
misure non si possono più confrontare.

E ha dovuto imparare una cosa che nessuno aveva scritto: **quando la strada è bloccata, si gira.**
Una linea in diagonale può incontrare una parete a 45° lasciata da un taglio di prima — il passo
viene rifiutato, perché non si taglia l'angolo attraverso un muro — e chi tiene la barra dritta
resta lì appeso finché la Miccia non gli mangia la linea. Le prime tre partite sono finite così,
tutte e tre.

---

## Il difetto che solo giocare poteva trovare

Dopo qualche taglio succede da solo, senza che nessuno faccia niente di strano: **un pezzo di
terreno conquistato finisce appoggiato alla parete esterna lungo un tratto intero.** I punti di quel
tratto stanno su due anelli, e «su quale anello sono» smette di avere risposta — che è la prima
domanda che si fa `split`, e che rispondeva prendendo il primo anello dell'elenco, cioè quello
sbagliato la metà delle volte.

Il modo in cui si manifestava è la parte che vale la pena ricordare. Il taglio veniva cucito al
pezzo sbagliato e produceva **un buco dentro un altro buco** — terreno conquistato dentro terreno
conquistato, che non vuol dire niente. Il gioco andava avanti per tre tagli con quella faccia in
pancia, e poi esplodeva altrove, con un messaggio che non nominava né quel punto né quel taglio.
L'area, nel frattempo, si conservava alla perfezione: l'invariante che ha retto tutto il resto del
progetto qui non vedeva niente.

La regola è una riga e vale per tutte e due le estremità: **dove due pareti si toccano non si
stacca e non ci si chiude.** Camminarci sopra resta libero, ed è come si esce di lì. `canStep` sa
guardare dove il passo arriva, quindi il controllo sulla partenza sta in `game.js`, che è l'unico
posto che sa che quel passo è l'inizio di un taglio; e `split` rifà la domanda per conto suo, perché
chi la chiama può non averla fatta.

Adesso ci sono tre reti: la prova di geometria sul caso costruito a mano, il rifiuto in `split`, e
un invariante di sanità sulle facce che gira dopo ogni conquista per dieci partite intere. Tredici
minuti di gioco simulato: zero esplosioni, zero facce malate.

---

## Non esiste un posto dove aspettare

È uscita da una prova che falliva, ed è la frase che descrive il gioco finito meglio di qualunque
altra nel documento.

La prova diceva: «resta fermo con la linea fuori e la Miccia ti prende». Tirava dritto per duemila
passi e ne collezionava **due**, di morti — perché dopo il rientro il marcatore resta fermo sul
bordo, e lì arriva la Scintilla. La prova era sbagliata (si ferma alla morte, non all'orologio), ma
la seconda morte non era un difetto: era il gioco che funzionava.

Le tre minacce insieme non lasciano un posto sicuro dove fermarsi a pensare. Fuori ti trova il
Filo, sul bordo ti trova la Scintilla, e fermo ti mangia la linea la Miccia. Ora c'è una prova per
ciascuno dei tre, e quella sulla Scintilla è nata dall'incidente.

---

## Tre cose che si sono viste solo guardando

Il passo 3 è il primo che produce un'immagine, e ha trovato subito quello che i test non potevano.

**L'isola veniva disegnata come una buca.** Il terreno conquistato è l'arena meno quello che è
ancora aperto, sottratto con la regola pari-dispari. Passando alla sottrazione **tutta** l'anagrafe
dell'arena, isole comprese, l'isola veniva ritagliata anche da lì e usciva del colore di fuori
campo: un pozzo in mezzo al terreno, cioè l'opposto di quello che è. Un'isola è terreno che era tuo
prima che la partita cominciasse, e nella sottrazione va solo la **parete esterna**. Nessuna
asserzione avrebbe potuto dirlo: l'invariante sull'area era perfetto in tutte e due le versioni.

**L'anteprima si è vista essere vera.** Lo schermo con la linea tratteggiata e quello con la linea
percorsa sono la stessa linea, spezzata nello stesso punto. Era già garantito per costruzione da
`pathTo` senza memoria e da un test che lo ricalcola da ogni punto — vederlo è un'altra cosa.

**Un test si appoggiava alla velocità senza dirlo.** Alzando le velocità del marcatore, novecento
passi non bastavano più per un taglio solo: ne facevano due, il secondo nella faccia accanto, e la
prova sulla separazione falliva senza che il codice fosse cambiato. Contare i fotogrammi è il modo
sbagliato di aspettare un taglio: ci si ferma su **quello che si sta aspettando** — l'evento di
conquista — non sull'orologio.

---

## La punta dell'insenatura, e un contatore che contava la cosa sbagliata

Il difetto più caro di tutti, perché il gioco continuava a tornare i conti giusti mentre era già
rotto.

Un taglio che arriva su un'isola non divide: **apre**. La faccia resta una e il suo contorno entra
lungo la fenditura, gira l'isola e riesce lungo la stessa fenditura — un muro di larghezza zero.
Questo pezzo era previsto, scritto, provato e giusto. Quello che nessuno aveva previsto è la riga
dopo: su ogni punto di quella fenditura il bordo passa **due volte**, e lì «da che parte sto» non
ha risposta.

`wallsAt` esisteva apposta per rifiutare quei punti, e li lasciava passare tutti. Chiedeva *su
quanti anelli sta questo punto*, e la fenditura è un anello solo percorso due volte: rispondeva uno.
Il taglio successivo poteva quindi partire dalla punta dell'insenatura, `split` sceglieva la prima
delle due occorrenze del vertice, e restituiva un buco con due vertici appoggiati al muro
dell'arena — cioè non terra circondata, ma un pezzo di bordo travestito da buco. L'area tornava
esatta, la percentuale sullo schermo era giusta, le facce superavano i controlli di sanità
esistenti. Quattro tagli dopo, da tutt'altra parte, il gioco esplodeva con «un buco senza faccia
intorno».

La domanda giusta è **quante volte il bordo ci passa**, e copre in una riga sola sia due anelli che
si toccano — il caso per cui `wallsAt` era nata — sia un anello che tocca sé stesso. Un vertice
conta una volta, un punto in mezzo a un segmento pure; quello che fa due è un vertice ripetuto.

Trovato non giocando e non leggendo, ma con un metodo: eseguire la partita che esplodeva
controllando **dopo ogni passo** un invariante più stretto di quelli dei test — *nessun vertice di
un buco sta sul muro dell'arena* — e fermarsi al primo passo in cui smette di valere. Il crash era
al passo 2 di un livello; la malattia era cominciata 570 passi prima, in un altro livello, su un
taglio che nessuno avrebbe guardato. Un invariante che si controlla a ogni passo vale dieci sessioni
di lettura del codice.

La prova adesso c'è, costruisce l'insenatura a mano e ne misura la punta, la bocca e il mezzo. E
controlla anche il contrario, che è la metà che si dimentica: un angolo dell'arena, un vertice
dell'isola e un punto qualunque del muro devono restare a uno. Un contatore troppo generoso
rifiuterebbe tagli legittimi ovunque, e sarebbe un difetto peggiore di quello che sostituisce.

---

## L'ordine delle arene non è un'opinione

Le arene sono otto: rettangolo, esagono, scala, croce, elle, diamante, anello, isole. Le quattro
nuove sono novanta righe di dati e nessuna riga di `game.js`.

L'ordine in cui compaiono **è** la curva di difficoltà, e per le prime quattro era stato deciso a
occhio. Misurandolo — ogni arena fatta giocare all'autopilota otto volte con le condizioni identiche
del primo livello — è venuto fuori che l'anello, che stava al secondo livello, era l'arena più
difficile di tutte: tre partite chiuse su otto contro le sette o otto delle altre. Il secondo
livello era il picco della curva.

Adesso l'elenco segue il numero, con due scostamenti voluti e scritti accanto ai dati. Il rettangolo
resta primo anche se non è il più facile misurato, perché è la forma che si capisce senza
spiegazioni e il primo livello insegna. E «isole» sta dopo «anello» anche se il numero direbbe il
contrario, perché due isole dopo una sola è l'ordine in cui si impara.

La prova nuova, `test/arenas.mjs`, controlla le arene **come dati**: orientamento di ogni anello,
ogni parete diritta o a 45°, vertici interi e dentro il campo, partenza sul bordo e non su un
vertice, Fili che nascono dentro e lontani dalle pareti. Nessuno di quegli errori si vede guardando
l'arena: si vedono tre mosse dopo, altrove. È la ragione per cui aggiungerne una adesso costa dieci
minuti.

---

## Un Filo vuole spazio, e l'arena può non averne

Il secondo Filo compariva al terzo livello e basta. Nel diamante — che è un terzo di campo — voleva
dire due Fili su una superficie dove uno solo è già stretto: l'autopilota ci moriva tre volte su
tre, con qualunque seme. Non era difficile, era invivibile, ed era un difetto dell'**arena piccola**
e non del livello.

Quindicimila unità a testa, poco meno di un terzo del campo pieno: è il numero che decide, una volta
sola, alla nascita del livello. Un'arena grande ne prende due, una piccola resta a uno — e non per
questo è più facile, perché ha molto meno posto in cui scappare. Il diamante è passato dal 30% al
50% di terreno conquistato in media.

Nello stesso giro è saltata fuori la cugina del difetto: il gradino più basso della scala era alto
64, e l'autopilota chiuso lì dentro con un Filo girava per dodici minuti senza morire e senza
finire. Una stanza in cui non si può né vincere né perdere non è difficile: è ferma. Adesso il
gradino più piccolo è 96 × 96, e la prova sull'autopilota ha un tetto sulla durata proprio per
prendere questo caso — una partita che non finisce è un difetto, non una partita lunga.

---

## Il giro che non finisce

Dal settimo livello la quota era al massimo, i Fili erano due e le Scintille quattro. Dall'ottavo in
poi il numero del livello saliva davanti a una partita **identica** a quella di dieci livelli prima.
Una classifica che a quel punto premia chi resiste più a lungo invece di chi gioca meglio non misura
più niente.

Adesso a ogni giro completo dell'elenco delle arene le Scintille partono nove unità più veloci. È
uno spostamento della curva verso l'alto, non una pendenza diversa: il tetto se lo mangia dopo un
minuto abbondante di livello, e va benissimo — oltre quel tetto non si scappa da nessuna velocità, e
un numero più grande non vorrebbe dire più difficile ma solo più uguale. Quello che il giro cambia è
il primo minuto, che è dove i livelli si decidono.

Una manopola sola, di proposito. La successiva, se giocando si vedrà che non basta, è un terzo Filo
— ma quella cambia il gioco e non lo scala, e va decisa con dei dati di gioco vero in mano.

---

## Meno movimento, dove il CSS non arriva

Il foglio di stile rispettava `prefers-reduced-motion` da sempre, per l'unica animazione che
conosceva: il pulsante del gettone che pulsa. Sul canvas, dove si muove tutto, la richiesta restava
lettera morta — la fiamma della Miccia pulsava, i raggi delle Scintille tremolavano, il marcatore in
attesa lampeggiava. Le tre cose che si muovono di più, spente ovunque tranne dove sono.

Quello che si spegne è il **battito**, non la forma. I raggi restano, di lunghezze diverse, e
smettono di cambiare; l'alone resta e smette di respirare. Niente sparisce, perché quelle forme sono
lì per farsi vedere e chi ha chiesto meno movimento non ha chiesto di vedere meno. Costa una
variabile nel renderer e un `calm ? …` in quattro punti, tutti dentro `render.js`: il mondo non sa
che esista.

La stessa preferenza governa la cosa nuova, la **vibrazione**. Su un telefono è l'unica che può dire
«è successo» mentre il pollice copre un quarto del campo e la parte che conta è proprio sotto.
Cattura, separazione, morte, livello chiuso e fine partita hanno ciascuna la sua scossa, corte —
una vibrazione che dura si sente come un guasto.

**Non passa dall'interruttore del suono**, e non è una dimenticanza. Il suono si spegne per non
disturbare chi sta intorno, ed è esattamente il momento in cui una vibrazione serve di più, perché è
quello che resta. L'unico interruttore che la governa è quello del sistema, ed è giusto che sia
quello: «meno movimento» non parla di animazioni sullo schermo, parla di stimoli, e un telefono che
sussulta in mano è uno stimolo.

Un punto solo legge la preferenza — `app.js` — e due la ascoltano. Su iOS `navigator.vibrate` non
esiste: il gioco non cambia, perde una rifinitura.

---

## La versione era sullo schermo, e non la vedeva nessuno

«Non vedo la versione e gli aggiornamenti, hai messo qualcosa a video?». C'era: `v0.8.0`, dieci
pixel di grigio tenue nella barra in alto, fra i punteggi e quattro pulsanti grandi. Il worker
rispondeva, il numero arrivava, il pulsante era visibile e cliccabile — e non lo trovava nessuno.
Nelle altre app del catalogo quella riga sta sotto il nome dell'app, dove ha qualcosa a cui
appoggiarsi; qui il nome dell'app nella barra non c'è, e il numero galleggiava.

Adesso sta sulla **schermata del titolo**, sotto «Come si gioca», a tredici pixel. È lì che si
guarda prima di cominciare, ed è anche il momento giusto per la luce dell'aggiornamento: prima della
partita, non a metà. E nasce `hidden` come nelle altre app — dove un service worker non c'è, un
pulsante vuoto è peggio di niente.

Vale come regola generale: *un elemento che c'è, è colorato come si deve e supera i controlli di
contrasto può essere invisibile lo stesso, se non ha niente attorno che lo tenga.* Il contrasto si
misura sul colore; l'attenzione si misura sul contesto, e non c'è nessuno strumento che la controlli
al posto tuo.

---

## Le istruzioni erano vere e nessuno le finiva

Otto paragrafi di fila, ognuno esatto, ognuno compresso: «Il tratto lento vale il doppio all'area e
ti lascia scoperto il doppio del tempo». Vero, e illeggibile se non sai già cosa sia il tratto lento.
Peggio: i nomi inventati — il Filo, la Miccia, le Scintille — non venivano mai legati a quello che si
vede sullo schermo, così per riconoscerli bisognava morirci.

La riscrittura non è «frasi più lunghe», è una **struttura**: sei titoli — lo scopo, come ci si
muove, il tratto lento, i tre modi di morire, le due mosse che pagano, i livelli — e sotto ciascuno
il testo che serve. I titoli non sono decorazione: sono il modo in cui si torna a cercare la cosa che
serve, che è quello che si fa davvero con le istruzioni di un gioco. E ogni minaccia adesso comincia
dicendo **com'è fatta**: il nastro che si contorce, la fiamma che parte da dove hai staccato, i
puntini bianchi con i raggi.

Allungandole è comparso un difetto che prima non poteva esistere: il pulsante che fa cominciare
finiva in fondo a millenovecento pixel di scorrimento, e per giocare bisognava prima leggere tutto.
Adesso è appiccicato in basso. È il genere di cosa che si vede solo aprendo la pagina alla larghezza
di un telefono e provando a premere il pulsante — non leggendo il CSS.

Nello stesso passaggio il foglio di stile ha restituito una sezione duplicata parola per parola e le
regole di un `#rotate` che non esiste più da quando il campo si gira da solo. Il codice morto non fa
danni: fa credere che qualcosa sia ancora vero.

---

## Misurare quello che si è affermato

Chiuso il difetto dell'insenatura, restavano due cose che avevo **ragionato** e non misurato. Le
ho misurate, e una delle due era falsa.

**La prima era vera.** Rendendo `wallsAt` più severa erano aumentati i punti da cui un taglio non
può cominciare, e avevo concluso che camminare resta sempre possibile, quindi il marcatore non può
restare intrappolato. Verificato: ottomila punti di bordo su otto arene, più la fenditura di
un'insenatura costruita a mano, e non c'è un solo punto senza uscita. Adesso è una prova, non una
conclusione — sta in `test/arenas.mjs` per il bordo di partenza e in `test/attract.mjs`, campionata
una volta al secondo simulato, per tutto il resto della partita.

**La seconda era falsa, e il difetto stava lì accanto.** Misurando la prima è saltato fuori che su
un punto della fenditura `canStep` risponde ancora «open» in otto direzioni — e ha ragione: guarda
dove il passo *arriva*, e lì arriva dentro la faccia. Ma staccare da lì è vietato, e quel divieto
viveva in una riga sola, dentro `game.js`. `pathTo` non lo conosceva. Risultato: il tratteggio
disegnava un taglio di settanta passi, si premeva, e non succedeva niente.

È esattamente la bugia che la scelta di tenere `pathTo` **senza memoria** serve a rendere
impossibile — *l'anteprima è la linea che verrà percorsa* — solo che la rendeva impossibile per un
motivo e non per l'altro: garantiva che le due linee avessero la stessa forma, non che la linea
esistesse. Adesso `pathTo` fa la stessa domanda che fa `game.js` un istante prima di staccare, e
dalla punta l'anteprima dice «cammina», che è quello che poi succede.

La morale non è sul difetto, è sul metodo. **Una cosa affermata in un commento sembra verificata.**
Quel «camminarci sopra resta libero, ed è come si esce di lì» era scritto accanto al codice giusto,
era vero, ed era la metà di una frase la cui altra metà era falsa. Ci sono voluti venti minuti di
sonda per scoprirlo; senza, sarebbe uscito da un giocatore che preme e non vede succedere niente e
che non ha nessun modo di raccontare cosa ha fatto.

Nello stesso giro l'invariante che aveva trovato il difetto dell'insenatura — *nessun vertice di un
buco sta sul muro dell'arena* — è passato dalla sonda usa-e-getta alle suite: `rules.mjs` lo
controlla su tutte le arene, `attract.mjs` a ogni conquista di ogni partita dimostrativa. Costa un
giro di anello per buco e solo alle conquiste, e da qui in avanti ogni partita che le prove giocano
lo verifica gratis. La prova di regressione scritta prima prendeva *quel* difetto se fosse tornato;
questa prende il prossimo della stessa famiglia, cioè una faccia che si corrompe mentre l'area
continua a tornare esatta.

---

## Una scelta giusta che aveva smesso di esserlo

Sul telefono il nome dell'arena era nascosto: sotto i 560 pixel la barra non ci stava, e il livello
lo dice comunque il numero accanto. Era vero quando le arene erano quattro e la barra stava su una
riga sola.

Non lo è più. Le arene sono otto, le istruzioni adesso le chiamano per nome, e «8» da solo non dice
in che campo stai giocando. E soprattutto la ragione tecnica è scaduta senza che nessuno lo
notasse: da quando la barra va su due righe i riquadri si stringono fra loro, e rimettere il nome
non costa niente — misurato a 320, 360 e 430 pixel, la barra resta alta uguale, il campo non perde
un pixel, la pagina non scorre di lato e «rettangolo», il nome più lungo, non viene troncato.

Vale come promemoria: le decisioni prese per un vincolo vanno **datate insieme al vincolo**. Questa
era sopravvissuta di due giri alla ragione che l'aveva prodotta, ed era diventata una cosa che il
gioco faceva senza che nessuno sapesse più perché.

---

## Due difetti che solo un telefono vero poteva dire

«Sul telefono è difficile giocare: non si riesce a raggiungere il bordo perché il clic si ferma a
diversi pixel, e se strisci sposti tutto lo schermo.» Due frasi, due difetti distinti, tutti e due
gravi, e nessuno dei due visibile in una prova automatica — le mie giravano in un browser senza
testa, con un mouse che finge di essere un dito.

**Il primo: la mira stava quarantaquattro pixel sopra il dito, sempre.**

L'alzata esiste per una ragione vera — la mano copre il bersaglio — e per quasi tutto il campo fa
esattamente quello che deve. Ma verso il fondo dello schermo sotto il dito non c'è più posto, e
allora l'alzata non scopre il bersaglio: lo **porta via**. Per mirare al muro in basso bisognava
appoggiare il dito quarantaquattro pixel *sotto* il muro, e sotto il muro c'è il bordo dello
schermo. Il muro in basso era irraggiungibile, sempre, qualunque cosa facesse il giocatore.

Adesso l'alzata si consuma avvicinandosi al fondo: piena in mezzo al campo, zero sull'ultimo pixel,
e lì il dito mira esattamente dove appoggia — che è giusto, perché quando si punta un muro non c'è
niente da guardare sotto la mano.

**E la fascia «sei sul muro» era quattro unità di reticolo, cioè sette pixel.**

Sette pixel sono meno della precisione con cui un dito sa dove sta andando. Col mouse bastavano —
per il mouse quel numero era stato tarato, e per il mouse funzionava. Col dito il taglio si fermava
una decina di unità prima del bordo, il recinto non si chiudeva, e la Miccia se lo mangiava.

Lo scarto adesso è in **pixel di schermo**, non in unità di campo, e la ragione sta in una frase:
non è una proprietà del campo, è la larghezza di un polpastrello, ed è la stessa su ogni telefono.
Sedici pixel col mouse — su un monitor tipico sono le stesse quattro unità di prima, misurate
invece che scritte a mano — e ventiquattro col dito, che su un telefono fanno circa dodici unità di
reticolo. Molte, e giusto così: un taglio che si ferma dodici unità prima del muro non è una scelta
del giocatore, è una mira che non c'è.

**Il secondo: la pagina si muoveva invece del marcatore.**

`touch-action: none` sul campo c'era già, e non bastava, perché il documento restava scorribile di
suo per tre ragioni indipendenti — e vanno tolte tutte e tre.

- `height: 100%` su un telefono è l'altezza della finestra **grande**, quella senza la barra degli
  indirizzi. Con la barra visibile la pagina è più alta di quello che si vede, quindi scorre: di
  pochi pixel, che è tutto quello che serve perché il dito muova la pagina invece del gioco.
  `100dvh` è la finestra che c'è adesso, e con `top` e `bottom` già fissati vince su `bottom` — un
  ripiego che non ha bisogno di `@supports`.
- Il rimbalzo elastico ai bordi: `overscroll-behavior` stava su `body` e non su `html`, e la
  propagazione parte da `html`.
- La pressione lunga, che seleziona testo e apre il menù di sistema proprio mentre si sta tenendo
  premuto per tagliare. La selezione resta dove serve leggere: istruzioni e classifica.

Più `position: fixed`, che è la cintura oltre alle bretelle: su iOS il documento rimbalza anche
senza avere niente da scorrere.

---

## Misurare la cosa che si è cambiata, non quello che viene dopo

Vale la pena scriverlo perché mi ha quasi fatto annullare una correzione giusta.

Per provare la mira col dito la prima sonda faceva la cosa ovvia: tocca in fondo allo schermo, tieni
premuto sette secondi, guarda **quanto terreno hai conquistato**. Prima della correzione: 84%. Dopo:
15%. Letto così, la correzione aveva rovinato il gioco.

Non era vero. La percentuale dopo sette secondi dipende da dove passa il taglio, da dove sono i
Fili, da quante volte si muore — da tutto. È una misura a valle, e a valle il segnale che cerchi è
sepolto sotto il rumore di tutto il resto. Misurando invece **la cosa che avevo cambiato** — dove
finisce la linea che il gioco ha in mente, un dato che si legge subito dopo il tocco e che non
dipende da niente altro — il quadro è diventato leggibile in una riga:

| tocco | prima | adesso |
|---|---|---|
| ultimo pixel in fondo | `[256,96]`, sul muro | `[256,96]`, sul muro |
| venti pixel più su | `[244,96]`, **dodici unità dal muro** | `[256,96]`, sul muro |
| sessanta pixel più su | `[223,96]` | `[223,96]` |

La riga di mezzo è il difetto, la terza dice che una mira davvero dentro al campo resta dentro al
campo, e l'84% contro 15% non c'entrava niente. *Una misura a valle può dire il contrario della
verità e sembrare ugualmente convincente.*

---

## La scheda diceva cose vere di un gioco che non esiste più

Tre difetti in una pagina sola, e nessuno dei tre si vedeva rileggendola per conto suo.

**Stampava gli asterischi.** Nel testo c'era `**misurare**`, che è markdown — e quel campo finisce
dritto dentro un `<p>` senza passare da nessun renderer. Sulla pagina pubblicata, in tutt'e due le
lingue, si leggeva letteralmente `**misurare**`. Un errore che si vede solo guardando la pagina
costruita, mai il sorgente: nel sorgente quegli asterischi *sembrano* enfasi.

**Era il modulo di un'altra scheda riempito con parole diverse.** L'introduzione cominciava con la
stessa identica frase di AstroDroid — «Le app che pubblichiamo hanno una cosa sola in comune, ed è
un vincolo tecnico…» — e ne ricalcava la struttura paragrafo per paragrafo. La prima volta quella
struttura era una voce; la seconda è un calco, ed è per questo che suonava sciatta anche se ogni
singola affermazione era vera. Tre paragrafi sull'azienda e sul vincolo, e alla fine chi leggeva non
sapeva ancora com'è giocarci.

Adesso l'introduzione racconta il gioco: dove stai e perché devi staccarti; perché le minacce sono
**tre** e non una, cioè perché ognuna chiude una via di fuga diversa; la scommessa del tratto lento
e le due mosse che si possono andare a cercare. Il principio del catalogo arriva per ultimo e come
conseguenza — la percentuale in alto non è una stima, quindi due partite si possono confrontare
davvero — invece che per primo e come dichiarazione d'intenti. Il vincolo tecnico resta dov'è
verificabile: nei fatti in breve e nel «cosa non fa».

**E descriveva un gioco che non esiste più.** «Quattro arene» quando sono otto, «un secondo Filo dal
terzo livello» quando adesso dipende anche da quanto è grande l'arena, e — la peggiore — una risposta
alle domande frequenti che spiegava con orgoglio che «il punto di mira sta sopra il dito», cioè
esattamente il difetto che rendeva il bordo irraggiungibile e che era stato corretto un'ora prima.

Non c'è un controllo che possa accorgersene: `check_apps.py` verifica che le due lingue abbiano la
stessa forma, che le chiavi esistano, che i numeri di versione coincidano — tutte cose che erano a
posto. *Nessuno strumento sa che «quattro» è diventato «otto».* L'unico rimedio è una regola di
mestiere: **la scheda fa parte dell'app**, e si cambia nello stesso giro in cui si cambia il gioco,
non alla fine.

---

## Sostituire testo dentro una struttura che parla due lingue

Cicatrice di mezz'ora, e vale la pena scriverla perché la trappola è invisibile.

Per riscrivere l'introduzione italiana ho preso «da `"intro": [` fino a `"does_title"`». Giusto. Poi
per quella inglese ho fatto la stessa cosa — e la prima occorrenza di `"intro": [` era ormai quella
*italiana appena riscritta*, mentre `"does_title"` trovato era quello inglese. Il taglio si è
mangiato tutto quello che stava in mezzo: l'elenco italiano, i fatti, le domande frequenti e
l'apertura del blocco inglese. Il file continuava a essere Python valido — per questo `ast.parse`
non ha detto niente — e si è rotto solo dopo, con un `KeyError: 'en'`.

La lezione non è «stai attento». È che **in una struttura che contiene le stesse chiavi due volte,
una in italiano e una in inglese, non si sostituisce per ancora**: si trovano prima i confini dei due
blocchi, si lavora dentro ciascuno separatamente, e si riemette la lista intera invece di rattoppare
le righe. Lo stesso ragionamento per cui `check_apps.py` esiste — la divergenza fra le due lingue è
il difetto più frequente di questo progetto — vale anche per gli strumenti che quelle due lingue le
modificano.

---

## La domanda che usava il marchio per dire che non lo usava

Fra le domande frequenti della scheda ce n'era una intitolata «È un clone di X?», dove X era il nome
di un gioco di qualcun altro. La risposta era corretta e perfino scrupolosa: spiegava che le
meccaniche del genere sono quelle e che il riferimento è voluto, ma che **il nome è un marchio
altrui e su un sito aziendale non si usa**.

Il problema è che per dirlo lo usava. Nel titolo della domanda, cioè in grassetto, e nel corpo della
risposta. Una regola enunciata dentro la propria violazione.

Non serviva nemmeno a niente: nessuno arriva su una scheda di un gioco gratuito chiedendosi di quale
titolo degli anni Settanta sia parente, e se anche se lo chiedesse, le tre differenze elencate lì —
geometria esatta invece che a griglia, arene di forma libera, tagli in diagonale — sono già dette
meglio altrove. Tolta, in tutt'e due le lingue.

**E messa fra le frasi vietate**, che è la parte che conta. Una regola che vive solo nella testa di
chi scrive torna indietro alla prima scheda nuova; una che vive in `BANNED` fa fallire la build.

Togliendola è saltato fuori un buco nella guardia. `_check_banned` spogliava la pagina di script e
di tag e guardava quello che restava — il testo visibile, e basta. Ma il titolo della scheda del
browser, la descrizione per i motori di ricerca e i dati strutturati sono **attributi** e contenuto
di `<script>`: cioè esattamente i tre posti che quel taglio buttava via, ed esattamente i tre in cui
una parola vietata farebbe il danno peggiore, perché sono quelli che finiscono nei risultati di
ricerca. Adesso li guarda. Provato mettendo il nome in ciascuno dei tre posti, uno per volta: tre su
tre segnalati, e le quarantotto pagine restano pulite, quindi la maglia più larga non ha pescato
falsi positivi.

---

## Il comando che c'era e non si vedeva, e tre difetti della stessa famiglia

«Terminato il livello non c'è un bottone per passare al successivo.» Vero: per andare avanti
bisognava **toccare il campo**, e il campo dietro il velo di una schermata non sembra una cosa che
si preme. L'unico posto dove lo si leggeva era una riga piccola di suggerimento. Adesso c'è un
pulsante, prende il fuoco appena la schermata compare, e il tocco sul campo resta come scorciatoia
per chi l'ha imparata.

Il pulsante era la punta. Sotto c'erano tre difetti, e sono lo stesso difetto tre volte: **un
ascoltatore di tastiera sulla finestra che non guarda chi ha il fuoco.**

- **A livello chiuso, Invio non continuava: ricominciava.** Il tasto era trattato come dal titolo —
  «non stai giocando, quindi gettone» — e faceva ripartire la partita da zero. Chi aveva appena
  chiuso il quinto livello perdeva tutto premendo il tasto più ovvio dello schermo, senza che niente
  glielo dicesse.
- **Nel campo del nome della classifica, la barra spaziatrice faceva partire una partita nuova** —
  e l'Invio che doveva salvare ne faceva partire una e poi ci registrava sopra il punteggio appena
  azzerato, con il nome giusto e zero punti.
- **E la «a» non si riusciva a scrivere.** `KeyA` è «sinistra» nella mappa dei comandi, e l'evento
  veniva annullato: «Gian Angelo» usciva «Gin ngelo». Lo stesso per w, s e d. Il campo del nome
  serve a una cosa sola, e per metà dei nomi italiani non funzionava.

Un ascoltatore sulla finestra sente **tutto**, anche quello che non è per lui, e finché l'unica cosa
sullo schermo è un canvas non si nota. Il confine adesso è scritto una volta per ognuno dei due
ascoltatori, e con le stesse parole: se il fuoco è dentro un campo di testo, un menù a tendina o una
finestra di dialogo aperta, i tasti sono testo e non comandi.

La schermata di fine aveva anche un difetto suo, più piccolo: il testo non ha chiavi nel markup —
dipende da com'è andata — e quindi cambiando lingua restava nell'altra. Adesso `_end` si ricorda le
chiavi e `_words` le riscrive.

**E un difetto che ho introdotto io, preso dalla sonda un minuto dopo.** Avevo dichiarato le due
variabili nuove accanto alla funzione che le usa, in fondo al file. Ma le funzioni si issano e `let`
no, e `_words()` gira in fondo all'avvio, cioè *prima* di quella riga: il modulo moriva con «Cannot
access before initialization» e l'app non partiva per niente — schermo nero, nessuna schermata,
niente. Le prove sotto Node non lo potevano vedere: `app.js` è l'unico file che non gira lì. È il
promemoria che il guscio ha bisogno di un browser per essere provato, e che «tanto è una riga» è
esattamente il pensiero che precede questo genere di errore.

---

## «Sei sicuro che il worker per l'aggiornamento funzioni?»

No, non lo ero: quel percorso non l'avevo mai provato da un capo all'altro. Provandolo sono venuti
fuori due difetti, tutti e due in codice condiviso da tutte e sette le app, e tutti e due invisibili
a qualunque prova che non sia una pubblicazione vera seguita da un browser che aveva già aperto
l'app prima.

Il banco di prova è questo: si serve la versione vecchia, si aspetta che il service worker prenda il
comando, si **riscrivono i file al loro posto** come fa una pubblicazione, si ricarica, e si guarda.

**Primo difetto: il riquadro della versione spariva.**

Non «non proponeva l'aggiornamento»: spariva proprio, vuoto e nascosto, come se l'app non avesse una
versione. La causa è una riga di struttura — in `update.js` tutto stava in fila dietro
`await navigator.serviceWorker.register(…)`, compreso il numero della versione corrente. Ma quella
promessa si risolve quando il browser ha finito di controllare e installare l'eventuale worker
nuovo, cioè **può metterci un minuto proprio dopo una pubblicazione**, che è l'unico momento in cui
qualcuno guarda quel riquadro. Misurato: sessantun secondi di riquadro vuoto.

Eppure la versione che gira si sa subito: chi sta servendo la pagina è già lì, `controller` c'è dal
primo istante e risponde in millisecondi. Le due cose non hanno mai avuto motivo di stare in fila.
Adesso il numero compare al primo respiro e la registrazione va per conto suo.

La correzione ha rotto una prova, ed era la prova ad avere ragione: chiedevo la versione allo stesso
worker **due volte**, e con un worker di prima di questa libreria — che non risponde — due attese da
un secondo e mezzo diventavano tre. Da lì la distinzione fra «ha taciuto» e «non gliel'ho chiesto»,
che vale un'attesa intera.

**Secondo difetto, peggiore: la cache nuova si riempiva di file vecchi.**

`cache.addAll(ASSETS)` fa dei fetch normali, e un fetch normale rispetta la cache HTTP. Con un
`max-age` di dieci minuti — quello che mette qualunque host statico — il worker nuovo, installandosi
subito dopo una pubblicazione, si prendeva i file **vecchi**, ancora freschi lì dentro. L'unico a
sfuggire è `sw.js`, perché quello il browser lo ricontrolla sempre da sé.

E `sw.js` è il file che porta il numero di versione. Il risultato è la peggiore forma di
aggiornamento sbagliato che esista: **l'app dichiara la versione nuova e gira col codice vecchio.**
Verificato guardando dentro la cache: `recinto-v0.15.0` conteneva l'`i18n.js` della 0.13.0, e dopo
l'aggiornamento il pulsante del gettone diceva ancora la parola della versione precedente mentre il
riquadro diceva 0.15.0. `cache: 'reload'` sulle richieste di `addAll` lo toglie di mezzo, in una
riga, in tutti e sette i service worker.

**Le due misure, prima e dopo, sullo stesso banco:**

| | prima | dopo |
|---|---|---|
| riquadro a +6s dalla pubblicazione | vuoto e nascosto | `v0.13.0` |
| riquadro quando il controllo finisce | `v0.13.0 → 0.15.0` | `v0.13.0 → 0.15.0` |
| dopo il clic: versione dichiarata | 0.15.0 | 0.15.0 |
| dopo il clic: codice che gira | **quello vecchio** | quello nuovo |

I sessantun secondi restano, e non sono nostri: è il browser che decide quando ricontrollare
`sw.js`. Vanno presi per quello che sono — una misura in Chromium senza testa, dentro un container;
su una macchina vera possono essere due secondi. Quello che era nostro, e adesso è a posto, è che
per tutto quel tempo non si vedesse niente.

Le regole sono finite in `app/CLAUDE.md`, dove valgono per tutte le app, e non solo qui: una lezione
che vive nel diario di un'app sola è una lezione che la prossima app non riceve.

---

## Il banco di taratura, e dove il gioco diventa difficile davvero

Il diario diceva che l'autopilota, sui livelli dal 5 all'8, chiudeva fra il 23% e il 50% delle
partite. Quel numero non era scritto da nessuna parte, né qui né in una prova, e non si sapeva come
fosse stato misurato. Prima di decidere se quei livelli sono ingiusti serviva uno strumento che
misurasse sempre allo stesso modo.

**`tools/tune.mjs`** gioca l'autopilota su un livello per volta, con quaranta semi per livello, e
conta. Ogni livello parte con **vite nuove e zero punti**: trascinarsi dietro le vite vorrebbe dire
misurare com'è andato il livello prima, non questo. Per ogni livello riporta:

- quante partite chiudono, e in quanto tempo;
- le morti divise per causa: Filo, Scintilla, Miccia;
- quanta parte dell'arena si è presa quando si perde;
- quanti tagli sono lenti, e quante linee lente e veloci finiscono con una morte.

Le manopole si girano da riga di comando (`--set RULES.threadsMax=1`) sulle tabelle esportate da
`game.js`, e solo dentro quel processo. `--arena` mette un'arena al posto di quella del livello: così
si separa quanto pesa la forma da quanto pesano i numeri. Lo strumento sta fuori da `run/` apposta:
misurare non vuol dire alzare una versione. Un livello con quaranta semi costa da dieci a trenta
secondi. Gli otto livelli, in parallelo sui quattro processori, poco meno di un minuto.

**La curva misurata il 23 settembre 2026**, sulla 0.15.3:

| liv | arena | Fili | Scintille | quota | chiusi | Filo | Scintilla | Miccia |
|---|---|---|---|---|---|---|---|---|
| 1 | rettangolo | 1 | 1 | 70% | 85% | 92% | 8% | 0% |
| 2 | esagono | 1 | 1 | 72% | 98% | 86% | 14% | 0% |
| 3 | scala | 2 | 2 | 74% | **10%** | 80% | 20% | 0% |
| 4 | croce | 2 | 2 | 76% | 15% | 81% | 19% | 0% |
| 5 | elle | 2 | 3 | 78% | 8% | 66% | 34% | 0% |
| 6 | diamante | 1 | 3 | 80% | 13% | 51% | 49% | 0% |
| 7 | anello | 2 | 4 | 82% | 10% | 64% | 36% | 0% |
| 8 | isole | 2 | 4 | 84% | 3% | 53% | 47% | 0% |

**Il salto non è fra il quarto e il quinto livello: è al terzo**, da 98% a 10% in un livello solo.
Dal terzo in poi la curva è piatta e bassa. Le tre prove per fattore dicono da dove viene:

| prova | risultato |
|---|---|
| un Filo solo, livelli 3–8 | livello 3 dal 10% al 68%, livello 4 dal 15% al 58%. Dal 5 all'8 si chiude fra il 13% e il 35%, e le morti passano alle Scintille: al livello 5 sono il 69% |
| una Scintilla sola, livelli 3–8 | quasi niente sul 3 (dal 10% al 13%); dal 5 all'8 si sale al 25–28%, e le morti tornano al Filo per il 90% |
| ogni arena alle condizioni del livello 1 | fra il 58% (diamante) e il 98% (esagono): le arene da sole non fanno il salto |
| il rettangolo alle condizioni dei livelli 3, 5 e 7 | 40%, 15% e **0 su 40** |

Quindi **la difficoltà la fanno i numeri, non le forme.** Al terzo livello è il secondo Filo quasi da
solo. Dal quinto si sommano il secondo Filo e la terza e quarta Scintilla, e togliere uno dei due
fattori sposta le morti sull'altro. La Miccia non uccide mai l'autopilota: non si ferma mai.

**Quello che queste prove non dicono è se il limite sia del livello o dell'autopilota.** Dicono
quale manopola rende il livello difficile per *lui*. Ed è un giocatore con un buco noto: quando decide
di staccare guarda quanto sono lontani i Fili (`NERVE.room`) e ignora le Scintille, che evita solo
mentre cammina. Dal quinto livello le Scintille fanno fra un terzo e metà delle morti. Il prossimo
passo è quindi un secondo autopilota che le veda: se chiude molto di più, i livelli si possono
giocare; se resta basso, i numeri sono da rivedere. E va provato giocando: un salto dal 98% al 10%
in un livello solo, se una persona lo sente come l'autopilota, è il primo difetto da correggere.

Le quattro prove per fattore, lanciate un livello per processo e in parallelo, hanno richiesto
circa quattro minuti in tutto. Una controprova gratuita: il diamante ha un Filo solo per via dello
spazio, quindi con `RULES.threadsMax=1` deve uscire identico, e infatti esce 5 su 40 in tutte e due
le misure.

---

## Un giocatore più bravo, e una regola che uccide senza preavviso

Il banco diceva quale manopola rende difficile un livello *per l'autopilota*. Restava da capire se
quei livelli sono difficili o se l'autopilota li gioca male. La prova è un secondo giocatore, più
bravo: se chiude molto di più, i livelli si possono giocare.

**`vigile`** sta in `tools/pilots.mjs` e non nel gioco. Entra dalla stessa porta dell'altro — una
direzione e una velocità di tratto a ogni passo — e corregge i due difetti che il banco aveva
misurato in `base`:

- **Taglia a morsi, non da parete a parete.** `base` esce in una direzione e va dritto fino al muro
  opposto: le linee su cui moriva di Filo erano lunghe da sessanta a ottanta passi. `vigile` prova
  anche la mossa che chi gioca a questo genere impara per prima: fuori di poco, lungo il muro, di
  nuovo dentro. Ogni candidata la pesa per l'area che prenderebbe contro il tempo che la linea resta
  scoperta.
- **Guarda le Scintille dove atterra.** Metà delle morti di Scintilla di `base` arrivavano entro mezzo
  secondo dal rientro: chiudeva la linea davanti a una Scintilla. `vigile` controlla il punto
  d'arrivo e, se è occupato, aspetta un quinto di secondo nel campo, dentro la tolleranza della
  Miccia, oppure cerca un altro muro. Da una Scintilla vicina scappa uscendo, perché fuori non può
  morderlo.

Tre cose trovate costruendolo, e sono lezioni di metodo:

- **Il primo `vigile` moriva più di prima.** Scappando da una Scintilla la sua linea d'emergenza
  veniva annullata al passo dopo da un controllo più severo, e lui tornava al muro più vicino, cioè
  addosso alla Scintilla da cui scappava. Il registro passo per passo di una partita l'ha mostrato
  in venti righe. Le percentuali dicevano solo «peggio».
- **Trenta secondi per una partita del primo livello non sono uno strumento.** Quasi tutto il tempo lo prendeva `canStep`,
  che per ogni passo ripercorre tutti i lati della faccia. Adesso la faccia è disegnata una volta su
  una griglia a mezza unità, e la griglia risponde solo «aperto». Tutto il resto, e ogni passo vicino
  a un muro, lo chiede ancora a `canStep`. Così un errore del disegno può solo far sembrare peggiore
  un piano, mai far sembrare legale un piano che non lo è. Con `VIGILE_CHECK=1` ogni risposta della
  griglia viene riverificata con `canStep`. Seimila passi al livello 3: nessuna differenza. La
  partita costa quattro volte meno.
- **Una chiamata dura al massimo tre minuti.** Sul Mac i processi lasciati in fondo muoiono con la
  chiamata che li ha lanciati, e quaranta partite di `vigile` non ci stanno. Il banco quindi divide i semi
  (`--part 3/8`) e poi rimette insieme i pezzi (`--merge`). La tabella che esce è identica a quella di
  una corsa sola, e la prova è stata fatta.

**La curva, rimisurata con i due giocatori**, quaranta semi, vite nuove a ogni livello:

| liv | arena | `base` | `vigile` | partite di `vigile` senza fine |
|---|---|---|---|---|
| 1 | rettangolo | 85% | 95% | 1 |
| 2 | esagono | 98% | 98% | 0 |
| 3 | scala | 10% | **60%** | 7 |
| 4 | croce | 15% | 43% | 6 |
| 5 | elle | 8% | 38% | 8 |
| 6 | diamante | 13% | 40% | 5 |
| 7 | anello | 10% | **18%** | 9 |
| 8 | isole | 3% | **5%** | 6 |

«Senza fine» vuol dire tre minuti senza chiudere e senza perdere: `vigile` è prudente, e in quei
casi resta a girare sul bordo. Non sono partite vinte, ed è giusto contarle così.

Quindi **dal terzo al sesto livello il gioco si può giocare**. Un giocatore migliore chiude quattro o
sei volte più di `base`, e quel salto era in buona parte dell'autopilota. **Il settimo e l'ottavo
restano chiusi anche per lui**, e il motivo non è di abilità.

**Il riaggancio mette la Scintilla sul marcatore.** Quando un taglio si prende il tratto di muro su
cui correva una Scintilla, la Scintilla viene riagganciata al punto più vicino del bordo nuovo. Il
bordo nuovo è la linea appena tracciata, e il punto più vicino è spesso quello dove il marcatore è
appena atterrato. Contato con `base`, su quaranta semi per livello: al livello 7, 18 riagganci sono
finiti entro 1,6 unità dal marcatore, cioè a distanza di morso, e le morti di Scintilla arrivate
entro un quarto di secondo da un riaggancio sono state 17. Al livello 8, 20 e 19.
Per `vigile`, che le altre morti di Scintilla le evita, i riagganci sono la causa principale:

| liv | morti di Scintilla | entro ¼ s da un riaggancio | all'atterraggio, senza riaggancio | sul bordo da più di 0,1 s |
|---|---|---|---|---|
| 5 | 67 | 27 | 30 | 10 |
| 7 | 79 | **42** | 23 | 14 |
| 8 | 94 | **50** | 25 | 19 |

Una morte così non si vede arrivare. La Scintilla stava su un muro che nel fotogramma dopo non
esiste più, e ricompare sotto il marcatore. **È una regola da decidere, non una manopola da tarare**, e
non l'ho toccata. Le strade possibili, tutte da misurare con il banco prima di scegliere:

- riagganciare al punto più vicino **tra quelli ad almeno una certa distanza dal marcatore**;
- dare alla Scintilla riagganciata **un attimo di tregua**, per esempio mezzo secondo senza morso,
  e farla vedere mentre ricompare;
- toglierla dal livello, come premio per averle chiuso il muro.

La colonna «all'atterraggio, senza riaggancio» è in parte di `vigile` e in parte dello stesso
fenomeno: un riaggancio che sposta la Scintilla di meno di due unità il banco non lo vede come salto.

---

## La Scintilla non ricompare sotto il marcatore

Deciso il 23 settembre 2026, fra le tre strade scritte qui sopra: **riagganciare al punto più vicino
fra quelli ad almeno 30 unità dal marcatore.** Le altre due sono state scartate prima di misurarle,
per ragioni di progetto:

- **la tregua** lascia la Scintilla ricomparire sotto il marcatore, aggiunge uno stato da disegnare
  («c'è ma non morde») e alla fine della tregua il marcatore ce l'ha addosso. Sposta il colpo di
  mezzo secondo, non lo toglie;
- **toglierla dal livello** cambia il gioco invece di correggerlo. Chiudere il muro di una Scintilla
  diventerebbe una tattica da cercare, e ai livelli 7 e 8 la pressione calerebbe proprio dove deve
  essere più alta. È una scelta da partite vere, come il terzo Filo.

**Trenta unità** perché il numero c'era già: è `RULES.safe`, la distanza che il gioco pretende dal
nemico prima di ridare il comando dopo una morte. Il cambio sta tutto nel terzo gradino di
`_trackFor`, cioè nell'unico punto che tocca l'indice di una Scintilla. Il mondo non ha uno stato in
più e il disegno non cambia.

**Una seconda regola è stata misurata e scartata.** In linea d'aria 30 unità possono essere poche:
una Scintilla rimessa dietro il marcatore e diretta verso di lui a 100 unità al secondo lo
raggiunge in tre decimi. Era stato provato quindi anche un tempo minimo lungo la pista, nel suo
verso. Autopilota del titolo, livello 7, 40 semi:

| | prima | distanza 30 | tempo 0,6 s + distanza 8 | tutte e due |
|---|---|---|---|---|
| Scintille rimesse a distanza di morso | 18 | **0** | 0 | 0 |
| morti di Scintilla entro 0,6 s da una Scintilla rimessa | 24 | **11** | 16 | 12 |

Il tempo non aggiunge niente alla distanza, e da solo fa peggio. È rimasta la regola più semplice.
Con la manopola a zero il banco ridà esattamente i numeri di prima: è la prova che misura la cosa
cambiata e non altro.

**Le prove in `rules.mjs`** sono tre. La Scintilla sul muro che sparisce, a pochi passi da dove la
linea atterra, si rimette ad almeno 30 unità e il marcatore resta vivo. Fra i punti lontani
abbastanza sceglie il più vicino a dove correva. Se nessun punto lo è, sceglie il più lontano, e non
il marcatore. La funzione è stata rotta apposta in quattro modi: ogni volta almeno un controllo si
ferma.

**La curva dopo**, quaranta semi per livello, vite nuove:

| liv | arena | `base` prima | `base` dopo | `vigile` prima | `vigile` dopo | `vigile`: morti a partita, prima → dopo | `vigile` senza fine, dopo |
|---|---|---|---|---|---|---|---|
| 1 | rettangolo | 85% | 83% | 95% | 98% | 0,35 → 0,20 | 1 |
| 2 | esagono | 98% | 98% | 98% | 98% | 0,33 → 0,38 | 0 |
| 3 | scala | 10% | 15% | 60% | 73% | 1,60 → 1,23 | 6 |
| 4 | croce | 15% | 28% | 43% | 43% | 1,90 → 1,63 | 13 |
| 5 | elle | 8% | 8% | 38% | 33% | 2,08 → 1,52 | 17 |
| 6 | diamante | 13% | 20% | 40% | 55% | 2,15 → 1,65 | 5 |
| 7 | anello | 10% | 8% | 18% | **38%** | 2,30 → 1,45 | 18 |
| 8 | isole | 3% | 3% | 5% | **23%** | 2,75 → 2,08 | 14 |

Le morti di Scintilla di `vigile` arrivate entro un quarto di secondo da un riaggancio erano 42 al
livello 7 e 50 all'8. Adesso sono 2 e 3.

Come si legge:

- **i primi due livelli non cambiano**, ed era la condizione. Il gioco non è diventato facile dove
  insegna;
- **il settimo e l'ottavo tornano giocabili per un giocatore attento**, e restano i più duri;
- **l'autopilota del titolo quasi non se ne accorge**, perché muore soprattutto di Filo;
- con quaranta semi uno scarto di dieci punti è dentro il rumore. Il 33% contro il 38% del livello 5
  non dice niente. Dicono qualcosa le morti a partita, scese su ogni livello dal 3 in su;
- **le partite «senza fine» di `vigile` sono aumentate**: muore meno, ma non per questo chiude, e
  resta sul bordo ad aspettare. È un limite suo, di giocatore prudente, e il gioco non c'entra. Una
  persona a quel punto rischia.

Resta la prova che nessun banco sostituisce: giocare il settimo e l'ottavo livello e sentire se
sono duri e giusti.

Versione 0.15.4. La scheda e le istruzioni non descrivono il riaggancio e non cambiano. «Ogni
conquista riscrive il bordo… possono arrivare da un lato che un attimo prima non esisteva» resta
vero.

---

## Cosa non fa

Da scrivere nella scheda, ed è la sezione che qualifica il resto:

- Non chiede un account e non ne ha uno da chiedere.
- Non manda il punteggio da nessuna parte: la classifica è di questa macchina, come quella del
  cabinato in sala giochi.
- Non ha pubblicità, né acquisti, né niente da sbloccare pagando.
- Non funziona meglio online: dopo la prima apertura non ha più bisogno della rete.

---

## L'ordine di lavoro

Uno alla volta, e ognuno finisce con qualcosa che si può guardare o provare.

1. **`geometry.js` con i suoi test, prima di ogni altra riga.** Se la geometria non regge, tutto il
   resto va riscritto; se regge, il gioco è quasi meccanica.
2. **`game.js`: mondo, marcatore, taglio, conquista.** Provato sotto Node. Punti e vite passano di
   livello in livello — senza, ogni livello è una partita nuova con un fondale diverso, ed è stato
   così per tre passi senza che se ne accorgesse nessuno.

   Con **un vagante segnaposto**, e di proposito: la regola della conquista ha bisogno di sapere da
   che parte sta il nemico, e senza nessun nemico si scriverebbe una regola finta — «tieni la parte
   più grande» — da riscrivere al passo 4. Il segnaposto è un punto che gira e che non uccide
   nessuno; il nastro che si contorce, il rimbalzo e la morte arrivano dopo, ma **la regola in cui
   si innestano è vera da oggi**.
3. **`render.js` e `input.js`, tastiera e puntatore insieme:** si gioca, in un rettangolo, da soli.
   Il puntatore entra qui e non dopo: rimandato, si scopre a cose fatte che il modello a
   destinazione voleva `pathTo` nella geometria, cioè nel modulo già chiuso. È il primo momento in
   cui si capisce se il tratto ha la velocità giusta — e non lo si capisce prima. **Infatti no:** le
   prime velocità erano la metà di quelle buone e il gioco sembrava un provino al rallentatore.
4. **Il Filo**, con il suo rimbalzo e le sue collisioni.
5. **Miccia e Scintille**, in quest'ordine: la miccia è locale, le scintille toccano il riaggancio
   al bordo.
6. **Punteggio, livelli.** ~~Arene di forma libera~~: sono arrivate al passo 2, in `run/arenas.js`.
   Erano previste qui e le ha tirate avanti una ragione sola — `create()` doveva pur partire da
   qualcosa, e quel qualcosa scritto dentro `game.js` sarebbe stato un rettangolo da estirpare
   dopo. Un'arena costa una manciata di righe di dati e i test le percorrono tutte con lo stesso
   ciclo: erano quattro, adesso sono otto, e `game.js` non se n'è accorto.
7. **Secondo Filo, cattura, separazione.**
8. **Audio, attract mode, classifica, PWA, due lingue, due temi.**
9. **Anagrafica e scheda** in `_src/apps.py`, nelle due lingue, con il riferimento al genere scritto
   per esteso.

---

## I tre punti dove ci si fa male

Scritti adesso perché adesso costano una riga.

- **`split` con le isole.** Il taglio dal bordo esterno a un'isola non spezza la faccia. Se il test
  non c'è, il difetto salta fuori al livello dell'anello, cioè settimane dopo, in una funzione che
  nel frattempo si è dato per buona.

  *Previsto giusto e sottostimato.* La prova c'era e il ponte era corretto: quello che è saltato
  fuori settimane dopo non era il ponte, era il taglio **successivo** al ponte, che partiva dalla
  punta dell'insenatura. Il punto pericoloso non era la funzione nominata qui: era lo stato che
  quella funzione lascia dietro di sé.
- **Il riaggancio delle Scintille.** È l'unico punto in cui una struttura dati cambia sotto i piedi
  di un'entità che la stava percorrendo. Una funzione sola, un test suo, e non toccarla da altrove.
- **La taratura del tratto lento.** Se il ×2 non compensa il rischio, nessuno lo usa e metà del
  gioco non esiste; se lo sopravanza, si gioca solo lento e il gioco rallenta. Si tara sulla
  dimostrazione e su qualche partita vera, non a tavolino.
