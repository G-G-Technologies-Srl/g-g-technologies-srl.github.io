// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il piano di importazione, e la sua scrittura.
//
// I file di prova sono **costruiti qui**, con lo scrittore di ZIP dell'app: le esportazioni vere sono
// dati di clienti reali e `.gitignore` rifiuta i fogli di calcolo in tutto il repository, quindi una
// fixture binaria non potrebbe stare qui nemmeno volendo. Le intestazioni sono copiate dai file veri;
// i dati sono inventati.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/importing.mjs

import assert from "node:assert/strict";
import * as zip from "../../_lib/zip.js";
import { plan, apply, lastImport, undoLast } from "../run/importing.js";
import { draft, issue } from "../run/model.js";
import { openDatabase } from "../run/db.js";
// Il finto store, non `memory.js`: il loader manda già `gg/store.js` qui, quindi `openDatabase()`
// apre questo. `memory.js` imita la maniglia di IndexedDB per il vero `store.js`, e in un test dove
// `store.js` è già stato sostituito i due si contendono lo stesso posto.
import { list, reset } from "./fake-store.mjs";
import { workbook as biff, labelsst, number as biffNumber } from "./biff-writer.mjs";

let passed = 0;
async function prova(nome, fn) {
  try {
    reset();
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack}`);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  f o g l i   d i   p r o v a
// -----------------------------------------------------------------------------------------------------------------

const encoder = new TextEncoder();

/** Un `.xlsx` di un foglio, da un'intestazione e delle righe di testo. */
function xlsx(head, rows) {
  const strings = [];
  const indice = (text) => {
    const at = strings.indexOf(text);
    if (at >= 0) return at;
    strings.push(text);
    return strings.length - 1;
  };
  // Le lettere di colonna oltre la Z: il registro ha 28 colonne, e «Lordo» sta in AA. La prima
  // versione di questo helper scriveva `[1` per la ventisettesima, e il lettore — giustamente —
  // la buttava in fondo alla riga: la prova sull'incasso leggeva un lordo di zero.
  const lettera = (at) => (at < 26 ? "" : lettera(Math.floor(at / 26) - 1)) + String.fromCharCode(65 + (at % 26));
  const celle = (row, r) => row
    .map((text, at) => (String(text) === ""
      ? ""
      : `<c r="${lettera(at)}${r}" t="s"><v>${indice(String(text))}</v></c>`))
    .join("");
  const body = [head, ...rows]
    .map((row, at) => `<row r="${at + 1}">${celle(row, at + 1)}</row>`)
    .join("");
  const parts = {
    "xl/workbook.xml": `<workbook><sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${body}</sheetData></worksheet>`,
    "xl/sharedStrings.xml": `<sst>${strings.map((s) => `<si><t>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`).join("")}</sst>`,
  };
  return zip.write(Object.entries(parts).map(([name, text]) => ({
    name, bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>${text}`),
  })));
}

const HEAD_CLIENTI = ["Denominazione", "Indirizzo", "Comune", "CAP", "Provincia", "Paese",
                      "P.IVA/TAX ID", "Codice Fiscale", "Indirizzo PEC", "Codice SDI"];
const CLIENTE_A = ["Bianchi Componenti S.r.l.", "Via Verdi 12", "Bologna", "40127", "BO", "Italia",
                   "01234567897", "", "bianchi@pec.it", "M5UXCR1"];
const CLIENTE_B = ["Rossi Impianti S.r.l.", "Corso Prova 3", "Serravalle", "47899", "RSM",
                   "San Marino", "SM29141", "", "", "2R4GTO8"];

const HEAD_LISTINO = ["Codice", "Nome prodotto/servizio", "Descrizione", "Categoria", "Prezzo netto",
                      "Prezzo lordo", "Aliquota IVA", "Descrizione aliquota IVA", "U.D.M."];
const VOCE = ["cons", "Consulenza Base", "Pacchetto di 20 mezze giornate", "consulenza", "8000",
              "", "", "", "gg"];

const HEAD_REGISTRO = ["Data", "Prox scadenza", "Documento", "Numero", "Serie", "Saldato",
                       "Centro ricavo", "Cliente", "Indirizzo cliente", "Comune", "Provincia",
                       "CAP", "Indirizzo extra", "Paese", "P.IVA", "CF", "Oggetto (interno)",
                       "Oggetto (visibile)", "Valuta orig.", "Imponibile", "IVA", "Cassa",
                       "Altra cassa", "Rivalsa", "Rit. acconto", "Rit. prev.", "Lordo",
                       "Contrassegnato"];

function registro(over = {}) {
  const row = new Array(HEAD_REGISTRO.length).fill("");
  const v = {
    0: "27/07/26", 1: "26/08/26", 2: "Fattura", 3: "12", 5: "NO",
    7: "Bianchi Componenti S.r.l.", 8: "Via Verdi 12", 9: "Bologna", 10: "BO", 11: "40127",
    13: "Italia", 14: "01234567897", 17: "Consulenza di luglio", 18: "EUR",
    19: "EUR 5,000.00 ", 20: "EUR 0.00 ", 26: "EUR 5,000.00 ", 27: "NO", ...over,
  };
  for (const [at, text] of Object.entries(v)) row[Number(at)] = text;
  return row;
}

const FATTURA = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12">
  <FatturaElettronicaHeader>
    <DatiTrasmissione><ProgressivoInvio>7</ProgressivoInvio></DatiTrasmissione>
    <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Noi</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567897</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Bianchi Componenti S.r.l.</Denominazione></Anagrafica></DatiAnagrafici>
      <Sede><Indirizzo>Via Verdi</Indirizzo><NumeroCivico>12</NumeroCivico><CAP>40127</CAP>
        <Comune>Bologna</Comune><Provincia>BO</Provincia><Nazione>IT</Nazione></Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento>
      <TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa>
      <Data>2026-07-27</Data><Numero>12</Numero>
      <ImportoTotaleDocumento>5000.00</ImportoTotaleDocumento>
    </DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi><DettaglioLinee>
      <NumeroLinea>1</NumeroLinea><Descrizione>Consulenza specialistica</Descrizione>
      <Quantita>1.00</Quantita><PrezzoUnitario>5000.00</PrezzoUnitario>
      <PrezzoTotale>5000.00</PrezzoTotale><AliquotaIVA>0.00</AliquotaIVA><Natura>N3.1</Natura>
      <AltriDatiGestionali><TipoDato>TM</TipoDato><RiferimentoTesto>3</RiferimentoTesto></AltriDatiGestionali>
    </DettaglioLinee></DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;

const file = (name, bytes) => ({ name, bytes });
const xml = (name, text) => file(name, encoder.encode(text));

// -----------------------------------------------------------------------------------------------------------------
//  r i c o n o s c e r e   i   f i l e
// -----------------------------------------------------------------------------------------------------------------

await prova("i tre fogli si riconoscono dal contenuto, non dal nome", async () => {
  // I nomi sono di proposito sbagliati: quello che decide sono i primi byte e l'intestazione.
  const piano = await plan([
    file("qualcosa.dat", await xlsx(HEAD_CLIENTI, [CLIENTE_A])),
    file("altro.bin", await xlsx(HEAD_LISTINO, [VOCE])),
    file("terzo", await xlsx(HEAD_REGISTRO, [registro()])),
  ]);
  assert.deepEqual(piano.fonti.map((f) => f.tipo), ["clienti", "listino", "registro"]);
});

await prova("il registro arriva come .xls binario, ed è un registro come l'altro", async () => {
  // Fatture in Cloud esporta i documenti in BIFF8: due righe di titolo, una vuota, poi le colonne,
  // con date e importi come numeri — la data con un formato di data, l'importo con uno di valuta.
  const riga = registro();
  const strings = ["Export documenti emessi", ...HEAD_REGISTRO, ...riga.filter((v, i) => v && ![0, 1, 19, 20, 26].includes(i))];
  const at = (text) => strings.indexOf(text);
  const cells = [labelsst(1, 1, 0, 0)];
  HEAD_REGISTRO.forEach((h, c) => cells.push(labelsst(4, c, 0, at(h))));
  riga.forEach((v, c) => {
    if (!v) return;
    if (c === 0 || c === 1) cells.push(biffNumber(5, c, 1, c === 0 ? 46230 : 46260));   // 27/07 e 26/08 2026
    else if ([19, 20, 26].includes(c)) cells.push(biffNumber(5, c, 2, c === 20 ? 0 : 5000));
    else cells.push(labelsst(5, c, 0, at(v)));
  });
  const bytes = biff({ strings, cells, xfs: [[0, 0], [0, 164], [0, 165]],
    formats: [[164, "dd/mm/yy"], [165, "[$EUR ]#,##0.00_-"]] });
  const piano = await plan([file("export 04-09-2026.xls", bytes)]);
  assert.equal(piano.fonti[0].tipo, "registro");
  assert.equal(piano.fonti[0].nuovi, 1);
  assert.equal(piano.documenti[0].data, "2026-07-27");
  assert.equal(piano.documenti[0].totali.totale, "500000000000");
  assert.equal(piano.documenti[0].righe[0].descrizione, "Consulenza di luglio");
});

await prova("un contenitore OLE2 troncato è illeggibile, non un errore", async () => {
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
  const piano = await plan([file("export.xls", ole)]);
  assert.equal(piano.fonti[0].tipo, "ignoto");
  assert.equal(piano.fonti[0].problemi[0].chiave, "impUnreadable");
});

await prova("un file che non c'entra è ignoto, non un errore", async () => {
  const piano = await plan([xml("lettera.txt", "Caro cliente,")]);
  assert.equal(piano.fonti[0].tipo, "ignoto");
});

await prova("uno ZIP di fatture si apre e le legge tutte", async () => {
  // È la forma del backup dell'account: una cartella di XML. Provato con due file e una cartella,
  // perché il nome dentro l'archivio ha le barre e un filtro sull'estensione ci deve arrivare.
  const archivio = await zip.write([
    { name: "2026/IT01234567897_00001.xml", bytes: encoder.encode(FATTURA) },
    { name: "2026/IT01234567897_00002.xml", bytes: encoder.encode(FATTURA.replace("<Numero>12<", "<Numero>13<")) },
    { name: "leggimi.txt", bytes: encoder.encode("non una fattura") },
  ]);
  const piano = await plan([file("backup.zip", archivio)]);
  assert.equal(piano.fonti.length, 2, "il .txt non diventa una fonte");
  assert.equal(piano.documenti.length, 2);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   p i a n o
// -----------------------------------------------------------------------------------------------------------------

await prova("un cliente già presente non entra due volte", async () => {
  const presente = { id: "x1", denominazione: "Bianchi Componenti S.r.l.", partitaIva: "01234567897" };
  const piano = await plan([file("c", await xlsx(HEAD_CLIENTI, [CLIENTE_A, CLIENTE_B]))],
                           { parties: [presente] });
  assert.equal(piano.fonti[0].nuovi, 1);
  assert.equal(piano.fonti[0].esistenti, 1);
  assert.equal(piano.clienti.length, 1);
  assert.equal(piano.clienti[0].denominazione, "Rossi Impianti S.r.l.");
});

await prova("lo stesso cliente in due file è un cliente solo", async () => {
  // Il registro nomina un cliente su ogni riga, e l'anagrafica lo nomina di nuovo. Senza questo,
  // importare i due file insieme creerebbe due volte la stessa azienda con due id diversi, e metà
  // dei documenti punterebbe a un doppione.
  const piano = await plan([
    file("c", await xlsx(HEAD_CLIENTI, [CLIENTE_A])),
    file("r", await xlsx(HEAD_REGISTRO, [registro()])),
  ]);
  assert.equal(piano.clienti.length, 1);
  assert.equal(piano.documenti[0].partyId, piano.clienti[0]._id);
});

await prova("due aziende con lo stesso nome e p.iva diverse restano due", async () => {
  const secondo = [...CLIENTE_A];
  secondo[6] = "09876543217";
  const piano = await plan([file("c", await xlsx(HEAD_CLIENTI, [CLIENTE_A, secondo]))]);
  assert.equal(piano.clienti.length, 2);
});

await prova("una voce di listino già presente non si duplica", async () => {
  const presente = { id: "i1", descrizione: "Pacchetto di 20 mezze giornate" };
  const piano = await plan([file("l", await xlsx(HEAD_LISTINO, [VOCE]))], { items: [presente] });
  assert.equal(piano.fonti[0].nuovi, 0);
  assert.equal(piano.fonti[0].esistenti, 1);
});

await prova("l'aliquota del listino viene dall'azienda", async () => {
  const piano = await plan([file("l", await xlsx(HEAD_LISTINO, [VOCE]))],
                           { company: { aliquotaPredefinita: "0" } });
  assert.equal(piano.listino[0].aliquota, "0");
});

await prova("un documento con lo stesso numero non entra due volte", async () => {
  const primo = await plan([file("r", await xlsx(HEAD_REGISTRO, [registro()]))]);
  const gia = primo.documenti;
  const secondo = await plan([file("r", await xlsx(HEAD_REGISTRO, [registro()]))], { docs: gia });
  assert.equal(secondo.fonti[0].nuovi, 0);
  assert.equal(secondo.fonti[0].esistenti, 1);
});

await prova("la riga ricostruita del registro tiene in piedi il totale", async () => {
  const piano = await plan([file("r", await xlsx(HEAD_REGISTRO, [registro()]))]);
  const doc = piano.documenti[0];
  assert.equal(doc.righe.length, 1);
  assert.equal(doc.righe[0].prezzoUnitario, "5000.00");
  assert.equal(doc.righe[0].descrizione, "Consulenza di luglio", "l'oggetto del documento fa la riga");
  assert.equal(doc.righe[0].natura, undefined, "nessuna natura inventata su un'aliquota a zero");
  assert.ok(piano.fonti[0].avvisi.some((a) => a.chiave === "impRegisterRebuilt"));
  // Nessun avviso sulla natura mancante: quei documenti sono storici, `inviato` ed `esportato`, e
  // non si riaprono né si riesportano. Un avviso che chiede una cosa impossibile è peggio di niente.
  assert.ok(!piano.fonti[0].avvisi.some((a) => a.chiave === "impRegisterNoNature"));
});

await prova("un documento importato porta i suoi totali", async () => {
  // Senza, l'importo non compare da nessuna parte: `issue()` è quello che di solito li calcola, e
  // l'importazione non ci passa — i documenti arrivano già numerati e già spediti. Trovato
  // guardando lo schermo dopo l'importazione, con tutte le prove verdi.
  const piano = await plan([file("r", await xlsx(HEAD_REGISTRO, [registro()]))]);
  assert.deepEqual(piano.documenti[0].totali,
                   { imponibile: "500000000000", imposta: "0", totale: "500000000000" });
  const daXml = await plan([xml("f.xml", FATTURA)]);
  assert.equal(daXml.documenti[0].totali.totale, "500000000000");
});

await prova("l'aliquota si ricava dai due totali quando c'è l'IVA", async () => {
  const con = registro({ 19: "EUR 1,000.00 ", 20: "EUR 220.00 ", 26: "EUR 1,220.00 " });
  const piano = await plan([file("r", await xlsx(HEAD_REGISTRO, [con]))]);
  assert.equal(piano.documenti[0].righe[0].aliquota, "22.00");
});

await prova("un DDT del registro prende uno stato che il suo tipo ammette", async () => {
  // «inviato» è giusto per una fattura e non esiste per una bolla, i cui stati sono «consegnato» e
  // «annullato». Uno stato fuori lista non viene rifiutato da nessuno: rende soltanto un documento
  // che lo scadenzario non sa classificare.
  const piano = await plan([file("r", await xlsx(HEAD_REGISTRO, [registro({ 2: "DDT" })]))]);
  assert.equal(piano.documenti[0].stato, "consegnato");
});

await prova("una fattura XML porta righe, natura e TM", async () => {
  const piano = await plan([xml("f.xml", FATTURA)]);
  const riga = piano.documenti[0].righe[0];
  assert.equal(riga.descrizione, "Consulenza specialistica");
  assert.equal(riga.natura, "N3.1");
  assert.equal(riga.tm, "3");
  assert.equal(piano.clienti.length, 1);
});

await prova("un totale dichiarato che non torna con le righe si dice, con le due cifre", async () => {
  // Il lettore tiene i due numeri separati apposta; qui si incontrano. Un centesimo è un
  // arrotondamento fatto diversamente, mille euro è un file da guardare: in tutti e due i casi lo
  // deve dire il pannello, non il commercialista.
  const alterata = FATTURA.replace("<ImportoTotaleDocumento>5000.00<", "<ImportoTotaleDocumento>4999.99<");
  const piano = await plan([xml("f.xml", alterata)]);
  const avviso = piano.fonti[0].avvisi.find((a) => a.chiave === "impTotalDiffers");
  assert.ok(avviso, "l'avviso c'è");
  assert.equal(avviso.numero, "12");
  assert.equal(avviso.dichiarato, "4.999,99\u00a0€");
  assert.equal(avviso.calcolato, "5.000,00\u00a0€");
  const giusta = await plan([xml("g.xml", FATTURA)]);
  assert.ok(!giusta.fonti[0].avvisi.some((a) => a.chiave === "impTotalDiffers"), "quando torna, niente");
});

await prova("un XML rotto e uno che non è una fattura si distinguono", async () => {
  const rotto = await plan([xml("a.xml", "<FatturaElettronica><non chiuso>")]);
  assert.equal(rotto.fonti[0].problemi[0].chiave, "impBrokenXml");
  const altro = await plan([xml("b.xml", "<qualcosa/>")]);
  assert.equal(altro.fonti[0].problemi[0].chiave, "impreadNotFattura");
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   s c r i t t u r a
// -----------------------------------------------------------------------------------------------------------------

await prova("apply scrive clienti, listino e documenti, e li lega", async () => {
  const db = await openDatabase();
  const piano = await plan([
    file("c", await xlsx(HEAD_CLIENTI, [CLIENTE_A, CLIENTE_B])),
    file("l", await xlsx(HEAD_LISTINO, [VOCE])),
    file("r", await xlsx(HEAD_REGISTRO, [registro()])),
  ]);
  const scritti = await apply(db, piano);
  assert.ok(scritti.lotto, "il lotto identifica l'importazione");
  delete scritti.lotto;
  assert.deepEqual(scritti, { clienti: 2, listino: 1, documenti: 1, incassi: 0 });

  const clienti = await list(db, "parties");
  const docs = await list(db, "docs");
  assert.equal(clienti.length, 2);
  assert.equal(docs.length, 1);
  // Il legame è la ragione per cui i tre store si scrivono in una transazione sola.
  assert.ok(clienti.some((c) => c.id === docs[0].partyId), "il documento punta a un cliente scritto");
});

await prova("il cliente scritto ha la forma dell'anagrafica, San Marino compreso", async () => {
  const db = await openDatabase();
  const piano = await plan([file("c", await xlsx(HEAD_CLIENTI, [CLIENTE_B]))]);
  await apply(db, piano);
  const [cliente] = await list(db, "parties");
  assert.equal(cliente.paese, "SM");
  assert.equal(cliente.sede.provincia, "SM", "RSM non passerebbe la validazione del tracciato");
  assert.equal(cliente.sede.cap, "47899");
  assert.equal(cliente.name, "Rossi Impianti S.r.l.", "l'indice ordina su `name`");
  assert.equal(cliente._riga, undefined, "le impalcature del piano non entrano nel database");
  assert.equal(cliente._id, undefined);
});

await prova("un documento scritto ha la chiave che ne impedisce il doppione", async () => {
  const db = await openDatabase();
  await apply(db, await plan([file("r", await xlsx(HEAD_REGISTRO, [registro()]))]));
  const [doc] = await list(db, "docs");
  assert.equal(doc.chiave, "|TD01|2026|12");
  assert.equal(doc.pagamento.rate[0].scadenza, "2026-08-26");
});

await prova("un piano vuoto non scrive niente", async () => {
  const db = await openDatabase();
  const scritti = await apply(db, await plan([]));
  delete scritti.lotto;
  assert.deepEqual(scritti, { clienti: 0, listino: 0, documenti: 0, incassi: 0 });
  assert.equal((await list(db, "parties")).length, 0);
});

// -----------------------------------------------------------------------------------------------------------------
//  l ' a z i o n e   d o p o :   q u e l l o   c h e   s i   f a   u n a   v o l t a   i m p o r t a t o
// -----------------------------------------------------------------------------------------------------------------

// L'azienda del contesto, con la numerazione semplice: il numero che esce è quello che si legge.
const AZIENDA = {
  denominazione: "Noi S.r.l.", partitaIva: "01234567897", paese: "IT", regimeFiscale: "RF01",
  formatoNumero: "semplice",
  sede: { indirizzo: "Via Prova", numeroCivico: "1", cap: "40127", comune: "Bologna", provincia: "BO" },
};

/** Una fattura nuova al primo cliente in anagrafica, emessa: il numero che prende è la prova. */
async function emettiUna(db) {
  const [cliente] = await list(db, "parties");
  const nuovo = draft({
    partyId: cliente.id, data: "2026-09-04",
    righe: [{ descrizione: "Dopo l'importazione", quantita: "1", prezzoUnitario: "10", aliquota: "22" }],
  });
  return issue(db, nuovo, { company: AZIENDA, party: cliente });
}

await prova("la numerazione continua da dove l'altro programma era arrivato", async () => {
  // Il difetto che questa prova esiste per non far tornare: importate le fatture 1 e 12, la
  // successiva usciva con il numero 1 — e l'indice univoco la rifiutava, quindi dopo l'importazione
  // non si poteva emettere più niente. Il contatore della serie non sapeva dei documenti importati.
  const db = await openDatabase();
  await apply(db, await plan([
    xml("a.xml", FATTURA.replace("<Numero>12<", "<Numero>1<")),
    xml("b.xml", FATTURA),
  ]));
  const emessa = await emettiUna(db);
  assert.equal(emessa.numero, "13");
});

await prova("il contatore si alza e non si abbassa", async () => {
  // Se il contatore è già oltre — l'azienda ha emesso da qui prima di importare l'archivio vecchio —
  // l'importazione non lo tocca: abbassarlo farebbe collidere la prossima fattura con una emessa.
  const db = await openDatabase();
  await apply(db, await plan([file("c", await xlsx(HEAD_CLIENTI, [CLIENTE_A]))]));
  const prima = await emettiUna(db);                    // 1
  assert.equal(prima.numero, "1");
  await apply(db, await plan([xml("x.xml", FATTURA.replace("<Numero>12<", "<Numero>7<").replace("2026-07-27", "2026-03-01"))]));
  const dopo = await emettiUna(db);
  assert.equal(dopo.numero, "8", "7 importata, poi 8: la 1 di prima era già sotto");
});

await prova("i numeri con la serie e con l'anno si leggono lo stesso", async () => {
  const db = await openDatabase();
  const conAnno = FATTURA.replace("<Numero>12<", "<Numero>2026/0012<");
  await apply(db, await plan([xml("a.xml", conAnno)]));
  const emessa = await emettiUna(db);
  assert.equal(emessa.numero, "13");
});

await prova("«Saldato: SI» diventa un incasso, e la scadenza si chiude", async () => {
  // Letto e buttato via, lasciava aperte nello scadenzario sei fatture su dodici già pagate: la
  // prima schermata dopo l'importazione mostrava una somma che l'azienda non doveva avere.
  const db = await openDatabase();
  const scritti = await apply(db, await plan([file("r", await xlsx(HEAD_REGISTRO, [
    registro({ 3: "12", 5: "SI" }),
    registro({ 3: "11", 5: "NO", 0: "02/07/26", 1: "01/08/26" }),
  ]))]));
  assert.equal(scritti.incassi, 1);
  const [incasso] = await list(db, "payments");
  const docs = await list(db, "docs");
  const saldata = docs.find((d) => d.numero === "12");
  assert.equal(incasso.docId, saldata.id);
  assert.equal(incasso.importo, "5000.00");
  assert.equal(incasso.data, "2026-08-26", "la data è quella che il registro dà: la scadenza");
  assert.ok(incasso.nota, "l'incasso dice da dove viene");
});

await prova("ogni record scritto porta la marca dell'importazione", async () => {
  const db = await openDatabase();
  const { lotto } = await apply(db, await plan([
    file("c", await xlsx(HEAD_CLIENTI, [CLIENTE_A])),
    file("l", await xlsx(HEAD_LISTINO, [VOCE])),
    file("r", await xlsx(HEAD_REGISTRO, [registro({ 5: "SI" })])),
  ]));
  for (const store of ["parties", "items", "docs", "payments"]) {
    for (const r of await list(db, store)) {
      assert.equal(r.importato.lotto, lotto, `${store}: lotto`);
      assert.ok(r.importato.fonte, `${store}: fonte`);
      assert.ok(r.importato.quando, `${store}: quando`);
    }
  }
  const ultimo = await lastImport(db);
  assert.equal(ultimo.lotto, lotto);
  assert.deepEqual([ultimo.clienti, ultimo.listino, ultimo.documenti, ultimo.incassi], [1, 1, 1, 1]);
});

await prova("l'annullamento toglie tutto il lotto, e riporta il contatore", async () => {
  const db = await openDatabase();
  await apply(db, await plan([
    file("c", await xlsx(HEAD_CLIENTI, [CLIENTE_A, CLIENTE_B])),
    file("l", await xlsx(HEAD_LISTINO, [VOCE])),
    file("r", await xlsx(HEAD_REGISTRO, [registro({ 5: "SI" })])),
  ]));
  const tolti = await undoLast(db);
  assert.deepEqual(tolti, { clienti: 2, listino: 1, documenti: 1, incassi: 1 });
  for (const store of ["parties", "items", "docs", "payments"]) {
    assert.equal((await list(db, store)).length, 0, store);
  }
  assert.equal(await lastImport(db), null);
  // Il contatore è tornato a zero: la prossima fattura è la 1, non la 13.
  await apply(db, await plan([file("c", await xlsx(HEAD_CLIENTI, [CLIENTE_A]))]));
  assert.equal((await emettiUna(db)).numero, "1");
});

await prova("l'annullamento non toglie un cliente usato da un documento nostro", async () => {
  // Nel frattempo è stata fatta una fattura a quel cliente: cancellarlo lascerebbe una fattura
  // intestata a nessuno, che è peggio di un cliente arrivato per importazione.
  const db = await openDatabase();
  await apply(db, await plan([file("c", await xlsx(HEAD_CLIENTI, [CLIENTE_A, CLIENTE_B]))]));
  await emettiUna(db);                                  // al primo in ordine, Bianchi
  const tolti = await undoLast(db);
  assert.equal(tolti.clienti, 1);
  const rimasti = await list(db, "parties");
  assert.equal(rimasti.length, 1);
  assert.equal(rimasti[0].denominazione, "Bianchi Componenti S.r.l.");
  // E da qui in poi è un cliente nostro: senza togliergli la marca, il pulsante di annullamento
  // tornava a offrire un lotto di un cliente che poi si rifiutava di togliere.
  assert.equal(rimasti[0].importato, undefined);
  assert.equal(await lastImport(db), null);
});

await prova("dopo l'annullamento il contatore rispetta quello che è stato emesso nel frattempo", async () => {
  const db = await openDatabase();
  await apply(db, await plan([xml("a.xml", FATTURA)]));   // la 12, importata
  const mia = await emettiUna(db);                         // la 13, nostra
  assert.equal(mia.numero, "13");
  await undoLast(db);                                      // via la 12
  const dopo = await emettiUna(db);
  assert.equal(dopo.numero, "14", "il contatore resta sulla 13 emessa da noi, non torna a zero");
});

await prova("annullare senza importazioni non fa niente", async () => {
  const db = await openDatabase();
  assert.equal(await undoLast(db), null);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   r a p p o r t o
// -----------------------------------------------------------------------------------------------------------------

await prova("il rapporto porta i nomi, non solo i conteggi", async () => {
  const presente = { id: "x1", denominazione: "Bianchi Componenti S.r.l.", partitaIva: "01234567897" };
  const piano = await plan([
    file("c", await xlsx(HEAD_CLIENTI, [CLIENTE_A, CLIENTE_B])),
    file("r", await xlsx(HEAD_REGISTRO, [registro()])),
  ], { parties: [presente] });
  assert.deepEqual(piano.fonti[0].nomi.nuovi, ["Rossi Impianti S.r.l."]);
  assert.deepEqual(piano.fonti[0].nomi.esistenti, ["Bianchi Componenti S.r.l."]);
  assert.deepEqual(piano.fonti[1].nomi.nuovi, ["12 · 2026-07-27 · Bianchi Componenti S.r.l."]);
});

await prova("un file rotto non affonda gli altri", async () => {
  // Un .xlsx con un foglio malformato: prima l'eccezione usciva da `plan` e i due file buoni accanto
  // sparivano sotto lo stesso «non è riuscita», senza il nome di nessuno.
  const rotto = await zip.write([
    { name: "xl/workbook.xml", bytes: encoder.encode(`<workbook><sheets><sheet name="X" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", bytes: encoder.encode(`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`) },
    { name: "xl/worksheets/sheet1.xml", bytes: encoder.encode(`<worksheet><sheetData><row><c r="A1"><v>1</v></row></sheetData>`) },
  ]);
  const piano = await plan([
    file("buono.xlsx", await xlsx(HEAD_CLIENTI, [CLIENTE_A])),
    file("rotto.xlsx", rotto),
    xml("fattura.xml", FATTURA),
  ]);
  assert.equal(piano.fonti.length, 3);
  assert.equal(piano.fonti[1].tipo, "ignoto");
  assert.deepEqual(piano.fonti[1].problemi, [{ chiave: "impUnreadable" }]);
  assert.equal(piano.clienti.length, 1);
  assert.equal(piano.documenti.length, 1);
});

console.log(`importing: ${passed} prove passate`);
