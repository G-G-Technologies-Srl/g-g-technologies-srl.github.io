# Lo schema ufficiale, che non sta nel repository

`xsd.sh` valida i documenti di prova contro lo schema XSD della FatturaPA. Lo schema **va scaricato
a mano, una volta**, e messo qui accanto a questo file.

## Perché non è committato

Tre ragioni, in ordine:

- **Non è nostro.** È pubblicato dall'Agenzia delle Entrate con le sue condizioni; ridistribuirlo
  dentro un repository sotto Apache-2.0 mescolerebbe due regimi di licenza, che è la stessa
  ragione per cui alla radice del sito non c'è nessuna `LICENSE`.
- **Invecchia.** Le specifiche cambiano circa una volta l'anno. Una copia congelata qui dentro
  diventerebbe in silenzio la versione contro cui validiamo, mesi dopo che l'Agenzia è andata
  avanti — e il controllo continuerebbe a passare dicendo niente.
- **Non serve all'app.** L'app non legge lo schema: nel browser non c'è un validatore XSD, e i
  controlli che l'app fa stanno in `run/validate.js`. Questo file serve a chi sviluppa.

## Dove si prende

Dal sito della fatturazione elettronica, nella pagina del formato FatturaPA:

<https://www.fatturapa.gov.it/it/norme-e-regole/documentazione-fattura-elettronica/formato-fatturapa/>

Serve **lo schema della fattura ordinaria, versione 1.2.3**, salvato qui come:

```
Schema_del_file_xml_FatturaPA_v1.2.3.xsd
```

Poi:

```bash
node --import ./app/invoice-scope/test/loader.mjs \
  app/invoice-scope/test/samples.mjs      # scrive i documenti in test/out/
sh   app/invoice-scope/test/xsd.sh        # li valida
```

## Quando rifarlo

Quando cambia `TRACCIATO` in `run/fatturapa.js`. Le due cose vanno insieme: la costante dice a
quale versione l'app è allineata, e questa cartella deve contenere lo schema di quella versione.
La versione in vigore oggi è la **1.9.1 delle specifiche**, applicabile dal 15 maggio 2026, che
usa lo schema del file XML **1.2.3**.

Sono due numeri diversi e non è un errore: le *specifiche tecniche* hanno una loro numerazione, lo
*schema XSD* la sua, e cambiano con ritmi diversi.

## Cosa non dimostra

Che lo schema passi vuol dire che il file è **ben formato secondo la struttura**. Non dice che gli
importi siano giusti, che il numero non sia già stato usato, o che l'operazione sia quella che
credi. Quei controlli stanno nei test in Node, e i totali attesi lì sono scritti a mano apposta.
