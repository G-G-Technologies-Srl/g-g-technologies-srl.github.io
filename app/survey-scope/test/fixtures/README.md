# Fixture del contratto dati

Quattro file, e la convenzione dei nomi è il test: **`valid-*` deve passare, `invalid-*` deve
essere bocciato.** Se un `invalid-` passa, `check_all` lo segnala — un contratto che non boccia
niente non è un contratto.

Non stanno qui per documentare il formato: stanno qui perché la prima stesura dello schema aveva un
solo esempio, scritto a mano, e **violava due delle proprie regole**. Un esempio che nessuno esegue
è prosa.

**Una cartella per questionario**, come sotto `run/`: `ai-maturity/` e `nis2/`. Il campo
`questionnaire` dentro il file resta la fonte — la cartella è una comodità per chi guarda — e
`guard.py` si ferma se le due non coincidono, o se un questionario non ha nessuna fixture. Quel
controllo è nato dicendo la verità al primo giro: **NIS2 non ne aveva.**

## `ai-maturity/`

| File | Cosa dimostra |
|---|---|
| `valid-complete.json` | Il caso normale, ed è l'esempio pubblicato in `survey-scope-nucleo.md`: i punteggi sono ricalcolati dal codice, quindi documento e contratto non possono divergere |
| `valid-incomplete.json` | Compilazione interrotta: `complete: false`, niente `scores`, id mancanti leciti. Su una coorte di quaranta questo caso sarà più frequente dei fork |
| `valid-no-ai.json` | Chi non usa AI: `q005` saltata e a zero, `q017` fuori dal denominatore, e la **regola a soglia** che tiene la fascia a 0 |
| `invalid-no-floor.json` | Il difetto peggiore trovato dalla review: le stesse risposte di `valid-no-ai.json`, con `overall` 58 e fascia **2** — «Qualcosa è in produzione» detto a un'azienda che ha appena dichiarato di non usare nessuno strumento AI. Senza le due domande derivate e senza la soglia |

L'ultimo è il più importante e vale la pena dire perché. Il difetto non era un errore di calcolo:
era una regola mancante, e una regola mancante non lascia tracce nel codice. Averla congelata in un
file che **deve** fallire significa che il giorno in cui qualcuno semplifica lo scoring e la perde,
i controlli lo dicono invece di lasciar passare un punteggio gentile con chi non ha ancora
cominciato.

Le fixture si aggiornano quando cambia l'edizione del questionario: il `questionnaire_digest` è
l'impronta delle domande, quindi cambia con loro. `python3 _src/survey_scope/guard.py` ricalcola e
dice quale valore mettere.

## `nis2/`

| File | Cosa dimostra |
|---|---|
| `valid-complete.json` | Il fornitore che il questionario immagina: 45 persone, manifattura, cliente in perimetro. Le risposte sono **disuguali fra le sei aree** di proposito — la sicurezza vera è a chiazze, e una fixture piatta non mette alla prova né le fasce né la scelta delle tre cose da fare per prime |
| `valid-incomplete.json` | Undici risposte e niente `scores`. Su una coorte di venti unità è il caso più frequente, e un file senza punteggi deve restare valido |
| `invalid-mixed-ids.json` | Un file che si dichiara NIS2 e porta due risposte dell'altro questionario. **Prima non poteva esistere** — di questionari ce n'era uno — e adesso è l'errore più facile da commettere raccogliendo due rilevazioni nello stesso elenco |

L'ultima ha già ripagato il costo di scriverla. Il primo giro non la bocciava per il motivo giusto:
la bocciava perché `schema.json` imponeva `^q[0-9]{3}$` alle chiavi delle risposte — il prefisso del
**primo** questionario scritto come se fosse una legge — quindi rifiutava ogni risultato NIS2,
compresi quelli buoni. Il difetto era nel contratto, non nel file, e senza una fixture di NIS2
nessuno l'avrebbe visto: i controlli giravano tutti sull'unico questionario che il pattern
descriveva.
