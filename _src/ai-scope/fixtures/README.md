# Fixture del contratto dati

Quattro file, e la convenzione dei nomi è il test: **`valid-*` deve passare, `invalid-*` deve
essere bocciato.** Se un `invalid-` passa, `check_all` lo segnala — un contratto che non boccia
niente non è un contratto.

Non stanno qui per documentare il formato: stanno qui perché la prima stesura dello schema aveva un
solo esempio, scritto a mano, e **violava due delle proprie regole**. Un esempio che nessuno esegue
è prosa.

| File | Cosa dimostra |
|---|---|
| `valid-complete.json` | Il caso normale, ed è l'esempio pubblicato in `ai-scope-nucleo.md`: i punteggi sono ricalcolati dal codice, quindi documento e contratto non possono divergere |
| `valid-incomplete.json` | Compilazione interrotta: `complete: false`, niente `scores`, id mancanti leciti. Su una coorte di quaranta questo caso sarà più frequente dei fork |
| `valid-no-ai.json` | Chi non usa AI: `q005` saltata e a zero, `q017` fuori dal denominatore, e la **regola a soglia** che tiene la fascia a 0 |
| `invalid-no-floor.json` | Il difetto peggiore trovato dalla review: le stesse risposte di `valid-no-ai.json`, con `overall` 58 e fascia **2** — «Qualcosa è in produzione» detto a un'azienda che ha appena dichiarato di non usare nessuno strumento AI. Senza le due domande derivate e senza la soglia |

L'ultimo è il più importante e vale la pena dire perché. Il difetto non era un errore di calcolo:
era una regola mancante, e una regola mancante non lascia tracce nel codice. Averla congelata in un
file che **deve** fallire significa che il giorno in cui qualcuno semplifica lo scoring e la perde,
i controlli lo dicono invece di lasciar passare un punteggio gentile con chi non ha ancora
cominciato.

Le fixture si aggiornano quando cambia l'edizione del questionario: il `questionnaire_digest` è
l'impronta delle domande, quindi cambia con loro. `python3 _src/test_ai_scope_guard.py` ricalcola e
dice quale valore mettere.
