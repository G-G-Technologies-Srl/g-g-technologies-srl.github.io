# Come si consegna il disegno di SPRONIA

Il metodo è cambiato, e in meglio: **si disegna una posa per volta, su fondo trasparente, alla
risoluzione che vuoi.** Il foglio a otto riquadri lo monta uno script. Prima si chiedeva a un
modello di generare otto pose dentro una griglia verde, e sbagliava a ogni giro — usciva dai
riquadri, ridipingeva le guide, spostava i fotogrammi. Chiedere otto cose insieme era il difetto.

---

## Cosa serve, in concreto

**PNG con fondo trasparente, una posa per file**, in `app/spronia/art/pose/`:

| File | Cos'è |
|---|---|
| `base.png` | la posa a riposo. È il riferimento: da qui vengono la tavolozza, la griglia e il corpo |
| `cammina-0..3.png` | i quattro passi. Se ne usano **solo le zampe** |
| `vola-0..3.png` | i quattro battiti. Si usano interi |

E in `app/spronia/art/uova/`, un `uovo-<nome>.png` per colore. Servono a **due cose insieme**, ed è
il motivo per cui basta ridisegnarne uno perché tutto il resto segua.

La prima: da lì il convertitore misura la tinta dominante e ne ricava la tavolozza dei nemici di
quella classe, ruotando i blu del cavaliere. Il nome sta in `KINDS` dentro `game.js`; il colore no,
quello si misura — così ridisegnare un uovo ricolora i suoi nemici e le due cose non possono
divergere.

La seconda: l'uovo **si vede in campo**. Un nemico abbattuto lascia una cella, e la cella è quel
disegno, nel colore della classe che uscirà se la lasci lì.

Su questo secondo uso valgono tre cose:

- **È un disegno solo.** Le quattro uova sono lo stesso uovo di quattro colori, ed è misurato:
  ridotte sulla loro griglia, verde e viola coincidono con l'oro **cella per cella**, zero
  discordanze su duemilacentosessanta. Il convertitore tiene una griglia e quattro tavolozze, quindi
  ridisegnarne uno solo cambia il colore e non la forma. Se ne ridisegni uno con una sagoma diversa
  lo script si ferma e lo dice.
- **Le tavolozze si misurano, non si ruotano.** Ruotare la tinta dell'oro era la strada ovvia: dà un
  errore medio di ottanta livelli per canale, cioè un verde che non è il verde disegnato. Per ogni
  colore del riferimento si guarda che colore ci mette l'altro uovo, e si prende la mediana.
- **Il disegno si dimezza.** Le uova sono disegnate 40 x 54 pixel d'arte, cioè alte quanto tutto il
  cavaliere col dodo. Un uovo grande quanto la bestia che l'ha deposto è sbagliato per il gioco
  qualunque sia la fedeltà, quindi la griglia degli indici si dimezza per maggioranza: ogni cella che
  esce è uno dei colori dell'autore, mai una mescolanza di due. Se vuoi decidere tu il dettaglio a
  quella misura, **disegna l'uovo a 20 x 27**.

L'**oro** non è di nessuna classe: è la cella che sta per schiudersi, negli ultimi tre secondi.

Dalla cella che si schiude esce **il cavaliere già in sella**, cioè le pose che ci sono già: non
servono un cavaliere disarcionato e un dodo senza padrone.

Se le pose non ci sono, lo script mette la stessa posa in tutti i riquadri e la camminata la ricava
muovendo le zampe: il gioco resta giocabile mentre si disegna.

Pixel art vera: niente sfumature, niente antialiasing, il canale alfa a due soli valori. La griglia
può essere quella che vuoi — lo script la misura da sé — purché sia regolare.

Il cavaliere azzurro attuale è `archivio/cavaliere-posa.png`: griglia di 11,67 px, personaggio di
**59 x 50 pixel d'arte, 53 colori esatti**. Convertito, non perde un pixel: zero su centocinquemila
discordano dalla cella che li contiene.

**PNG, mai JPEG, e attenzione all'editor.** Da un PNG pulito il convertitore legge la tavolozza
dell'autore così com'è, senza quantizzare. Un JPEG in mezzo e i cinquantatré colori diventano una
stima a quattordici.

E c'è un secondo modo di rovinarli, che è già successo. Alcuni editor esportano **un'anteprima**:
ridimensionata di un fattore qualunque, con i bordi sfumati e un marchio sopra. Misurato sui
fotogrammi della camminata: canale alfa a 256 valori invece di 2, trentamila colori invece di
cinquantatré, e ognuno riscalato di un fattore diverso — 8,285 pixel per cella in due, 8,148 e
8,108 negli altri. Il disegno vero è ancora là sotto e lo script lo recupera agganciandolo alla
tavolozza di `base.png`, ma il registro no: due fotogrammi su quattro restano sfasati di un pixel
su tutta la sagoma. È il motivo per cui della camminata si prendono solo le zampe.

I fotogrammi di volo erano invece esportati tutti alla stessa scala, e infatti si usano interi: dove
le sagome si sovrappongono il colore coincide esattamente. **Se puoi, esporta il PNG originale.**

---

## Le tre misure che il gioco impone

Il resto è libero. Queste tre no, e il convertitore si ferma dicendo di quanti pixel sei fuori.

| | Valore oggi | Da cosa viene |
|---|---|---|
| Riquadro | 62 x 54 pixel di sprite | `SPRITE` in `game.js`, che segue il disegno |
| Punta della lancia | 27 px a destra del centro del corpo, 11 sopra | `lanceReach` e `lanceRise` |
| Tavolozza | fino a 62 colori | l'alfabeto in `sprites.js` |

Attenzione a come si legge la seconda riga: **lo sprite non è centrato sul corpo, è appoggiato per
i piedi.** La riga più bassa che la camminata disegna cade sul fondo della scatola di collisione,
che è dove il dodo sta in piedi; il convertitore esporta quello scarto come `lift` e da lì discende
`lanceRise`. Quindi disegna i piedi dove vuoi che il dodo tocchi terra, e lascia che i due numeri
li ricavi lo script.

**La lancia non si muove fra una posa e l'altra.** È un oggetto rigido incastrato sotto il braccio:
se in una posa la punta finisce due pixel più in alto, la regola dell'altezza legge una quota che il
disegno nega, e il duello si decide su qualcosa che non si vede. Il controllo lo dice per
fotogramma, con lo scarto in pixel.

Se una posa richiede davvero una lancia più alta o più lunga, si cambiano le due costanti in
`game.js` — non si sposta la punta in un fotogramma solo.

---

## Le otto pose

Due cicli da quattro. In tutti e otto **il cavaliere sta seduto alla stessa altezza** e il dodo
guarda a destra: la direzione opposta è uno specchio a tempo di disegno, quindi la posa «verso
sinistra» non si disegna.

- **Camminata**, quattro fotogrammi: cambiano **solo le zampe**. Corpo, testa, cavaliere e lancia
  restano identici pixel per pixel — è quello che rende la camminata una camminata invece di un
  tremolio.
- **Volo**, quattro fotogrammi: l'ala percorre l'arco da tutta alzata a tutta abbassata. Il corpo
  non deve sobbalzare, e il controllo lo misura **sulle celle disegnate in tutte e quattro le pose**
  — cioè sul dodo, non sull'inchiostro totale, che il baricentro lo insegue dietro le ali.

  **L'ordine dei file non conta**: lo script mette i quattro in ordine di battuta da sé, misurando
  quanto in basso sta l'ala in ciascuno. La banda del volo non è un anello — il renderer tiene fermo
  il primo fotogramma finché il dodo plana e scorre gli altri tre nei 0,32 secondi del battito — per
  cui l'ordine è la battuta, e va dall'ala alzata a quella abbassata.

L'occhio è dell'autore e non viene ridipinto: basta che dentro il suo riquadro ci sia del chiaro e
dello scuro che staccano davvero. Nel cavaliere azzurro è una colonna di bianco e una di pupilla,
due pixel per due.

**Il pennacchio dipingilo tu, sull'elmo.** Il gioco non ne disegna più uno: ne aveva uno animato,
bianco e azzurro, e con quello del cavaliere azzurro sull'elmo faceva due pennacchi — uno di troppo,
e quello di troppo era il nostro.

Quello che il gioco aggiunge è un **cimiero** alto due o tre pixel, sulla calotta, davanti al
pennacchio: dice se l'uccello è tuo e, se è un nemico, di che classe. Lo trova da sé andando avanti
dall'ancora finché il profilo comincia più in basso — è lì che il pennacchio finisce e l'elmo
comincia. Quindi **lascia un po' di calotta libera davanti al pennacchio**: due o tre colonne
bastano.

---

## Il giro completo

```bash
python3 _src/spronia/sheet.py
python3 _src/spronia/sprites.py
node app/spronia/test/physics.mjs
```

Il primo comando misura la griglia di `base.png`, controlla che il disegno ci stia sopra davvero —
si ferma se anche un pixel discorda — rimette in registro le pose di `pose/`, toglie il marchio
dell'editor e scrive `cavaliere-azzurro.png`, il foglio a otto riquadri. Il riquadro comune è
l'unione di tutte e otto: le ali aperte sbordano dal dodo fermo, e ritagliare fotogramma per
fotogramma farebbe saltare il personaggio a ogni battito.

Il secondo lo converte. Cosa deve stampare, su un foglio fatto bene:

```
rumore dentro le celle: 0.0  → foglio pulito, riparazioni spente
tavolozza letta dal foglio: 53 colori esatti
lancia: la punta disegnata cade dove la regola la legge in tutti i fotogrammi
SPRITE in game.js concorda: 124 x 108 unità
```

Se dice «foglio compresso», è passato per un JPEG da qualche parte e la tavolozza esatta è persa.

---

## Provarlo davvero

`python3 -m http.server 8000`, poi `localhost:8000/app/spronia/run/`.

**Il ricaricamento forzato non basta.** L'app ha un service worker che tiene i file in cache e non
li rilascia finché la versione non cambia, e sotto c'è anche la cache HTTP del browser: si finisce
per guardare gli sprite di tre conversioni fa e chiedersi cosa sia andato storto. O DevTools →
Application → Unregister, o una finestra in incognito.
