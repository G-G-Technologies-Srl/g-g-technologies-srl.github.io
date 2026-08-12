// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The shapes a CSV actually arrives in.
//
// The first version of the parser was written against the file a datalogger writes and passed
// every test — because every test was written against the same file. Then a real one downloaded
// from the web went in and the app showed one column out of twelve without saying why.
//
// So the fixtures here are deliberately not ours: comma and semicolon and tab and pipe, quoted and
// unquoted, CRLF and LF, European decimals and English ones, dates in four dialects, ragged rows,
// a BOM, Excel's `sep=` line, and a quoted field with a newline inside it — which is the one that
// cannot be handled by splitting on newlines first, and which the first version got wrong.
//
// Run:  node app/csv-scope/test/shapes.mjs

import { parse, serialise, fields } from "../run/csv.js";

const CASES = [];
const add = (name, text, expect) => CASES.push({ name, text, expect });

// -----------------------------------------------------------------------------------------------------------------
//  s e p a r a t o r s
// -----------------------------------------------------------------------------------------------------------------

add("virgola, senza virgolette, CRLF",
  "Index,Name,Value\r\n1,alfa,10.5\r\n2,beta,11.25\r\n3,gamma,9.75\r\n",
  { delimiter: ",", rows: 3, names: ["Index", "Name", "Value"], numeric: ["Index", "Value"] });

add("punto e virgola, decimali con la virgola",
  "tempo;temp;giri\n0;61,20;1180\n1;61,45;1182\n2;61,90;1179\n",
  { delimiter: ";", rows: 3, numeric: ["temp", "giri"], value: ["temp", 0, 61.2] });

add("tabulazione",
  "a\tb\tc\n1\t2\t3\n4\t5\t6\n",
  { delimiter: "\t", rows: 2, numeric: ["a", "b", "c"] });

add("barra verticale",
  "id|peso|nota\n1|2.5|primo\n2|3.5|secondo\n",
  { delimiter: "|", rows: 2, numeric: ["id", "peso"] });

add("virgola dentro un campo di testo non quotato",
  "citta,paese,abitanti\nEast Leonard,Chile,1200\nIsabelborough,Antigua and Barbuda,800\n",
  { delimiter: ",", rows: 2, numeric: ["abitanti"] });

// -----------------------------------------------------------------------------------------------------------------
//  q u o t e s
// -----------------------------------------------------------------------------------------------------------------

add("virgolette con il separatore dentro",
  'nome,indirizzo,importo\n"Rossi, Mario","Via Roma, 3",1200\n"Bianchi, Ada","Via Po, 7",950\n',
  { delimiter: ",", rows: 2, numeric: ["importo"], value: ["importo", 0, 1200] });

add("virgolette doppie dentro il campo",
  'nome,nota,valore\n"Ada","disse ""ok""",5\n"Bea","niente",6\n',
  { delimiter: ",", rows: 2, numeric: ["valore"] });

add("campo quotato con un a capo dentro",
  'id,nota,valore\n1,"prima riga\nseconda riga",10\n2,"normale",20\n',
  { delimiter: ",", rows: 2, numeric: ["id", "valore"], value: ["valore", 0, 10] });

add("campo quotato con CRLF dentro",
  'id,nota,valore\r\n1,"prima\r\nseconda",10\r\n2,"x",20\r\n',
  { delimiter: ",", rows: 2, numeric: ["valore"] });

// -----------------------------------------------------------------------------------------------------------------
//  h e a d e r s   a n d   d i a l e c t s
// -----------------------------------------------------------------------------------------------------------------

add("BOM davanti all'intestazione",
  "﻿tempo,valore\n0,1.5\n1,2.5\n",
  { delimiter: ",", rows: 2, names: ["tempo", "valore"] });

add("riga sep= di Excel",
  "sep=;\ntempo;valore\n0;1,5\n1;2,5\n",
  { delimiter: ";", rows: 2, names: ["tempo", "valore"], numeric: ["valore"] });

add("senza intestazione",
  "1;2;3\n4;5;6\n",
  { delimiter: ";", rows: 2, names: ["col 1", "col 2", "col 3"] });

add("righe irregolari, alcune più corte",
  "a,b,c\n1,2,3\n4,5\n6,7,8\n",
  { delimiter: ",", rows: 3, numeric: ["a", "b", "c"] });

add("righe irregolari, una più lunga",
  "a,b\n1,2\n3,4,5\n6,7\n",
  { delimiter: ",", rows: 3, ragged: true });

add("righe vuote in mezzo",
  "a,b\n1,2\n\n3,4\n\n",
  { delimiter: ",", rows: 2 });

add("spazi attorno ai separatori",
  "a , b , c\n 1 , 2.5 , x \n 2 , 3.5 , y \n",
  { delimiter: ",", rows: 2, names: ["a", "b", "c"], numeric: ["a", "b"] });

// -----------------------------------------------------------------------------------------------------------------
//  n u m b e r s   a n d   d a t e s
// -----------------------------------------------------------------------------------------------------------------

add("migliaia con il punto, decimali con la virgola",
  "voce;importo\na;1.234,56\nb;2.000,10\nc;900,00\n",
  { numeric: ["importo"], value: ["importo", 0, 1234.56] });

add("migliaia con la virgola, decimali con il punto",
  "voce,importo\na,\"1,234.56\"\nb,\"2,000.10\"\n",
  { numeric: ["importo"], value: ["importo", 0, 1234.56] });

add("colonna di soli n,nnn — decimali, non migliaia",
  "t;bar\n0;2,120\n1;2,340\n2;2,015\n",
  { numeric: ["bar"], value: ["bar", 0, 2.12] });

add("numeri negativi e notazione esponenziale",
  "t,v\n0,-1.5\n1,2.5e-3\n2,-0.25\n",
  { numeric: ["v"], value: ["v", 1, 0.0025] });

add("data ISO come colonna del tempo",
  "Subscription Date,Index\n2020-08-24,1\n2021-04-23,2\n",
  { time: "Subscription Date" });

add("data e ora ISO con la T",
  "when,v\n2026-01-02T10:00:00,1\n2026-01-02T10:00:01,2\n",
  { time: "when" });

add("data italiana gg/mm/aaaa",
  "Data,Valore\n24/08/2020,10\n25/08/2020,11\n",
  { time: "Data" });

add("data americana mm/gg/aaaa con ora",
  "Date,Value\n08/24/2020 10:15,10\n08/25/2020 10:16,11\n",
  { time: "Date" });

// Il tempo trascorso, con l'unità fra parentesi e senza la parola «time». È la forma che scrive un
// registratore quando la parola è sottintesa, ed è quella su cui la riproduzione legge la frequenza
// di campionamento: non riconoscerla non fa sbagliare il disegno, fa scorrere alla velocità
// sbagliata.
add("tempo trascorso: «elapsed (s)»",
  "elapsed (s),ECG (mV)\n0.000,0.10\n0.005,0.35\n0.010,0.90\n",
  { time: "elapsed (s)", numeric: ["ECG (mV)"] });

add("tempo trascorso in italiano: «tempo (s)»",
  "tempo (s),giri\n0,1180\n1,1182\n",
  { time: "tempo (s)", numeric: ["giri"] });

add("nessuna colonna del tempo: solo misure",
  "a,b\n1.5,2.5\n2.5,3.5\n",
  { time: null, numeric: ["a", "b"] });

// -----------------------------------------------------------------------------------------------------------------
//  r e a l   w o r l d
// -----------------------------------------------------------------------------------------------------------------

// The shape of the file that started all this: a records export, not measurements. Twelve columns
// and one of them numeric. It has to parse, and the app has to say what it left out.
add("anagrafica scaricata dal web: dodici colonne, una sola numerica",
  "Index,Customer Id,First Name,Company,Phone 1,Email,Subscription Date,Website\r\n"
  + "1,DD37Cf93aecA6Dc,Sheryl,Rasmussen Group,229.077.5154,z@smith.info,2020-08-24,http://a.com/\r\n"
  + "2,1Ef7b82A4CAAD10,Preston,Vega-Gentry,5153435776,v@colon.com,2021-04-23,http://b.com/\r\n"
  + "3,6F94879bDAfE5a6,Roy,Murillo-Perry,+1-539-402-0259,b@hogan.com,2020-03-25,http://c.com/\r\n",
  { delimiter: ",", rows: 3, time: "Subscription Date", numeric: ["Index"], text: 6 });

// The export format of PhysioNet, which is where an ECG comes from: single quotes around the
// headings — no CSV convention treats those as quoting — and a second header row with the units.
// Left alone, the columns are called «'MLII'», the time column is not recognised because
// «'Elapsed time'» matches no name, and the units line becomes a row of gaps.
add("intestazione con apici singoli e riga delle unità, come PhysioNet",
  "'Elapsed time','MLII','V5'\n'seconds','mV','mV'\n"
  + "0.000,-0.145,-0.065\n0.003,-0.145,-0.065\n0.006,-0.145,-0.065\n0.008,-0.150,-0.070\n",
  { delimiter: ",", rows: 4, names: ["Elapsed time", "MLII", "V5"], time: "Elapsed time",
    numeric: ["MLII", "V5"], value: ["MLII", 0, -0.145] });

add("intestazione con l'unità fra parentesi",
  "time (s),temp (°C)\n0,61.2\n1,61.4\n",
  { time: "time (s)", numeric: ["temp (°C)"] });

// No longer an error: there is nothing to plot and everything to read, and the table reads it.
add("file di solo testo: si apre, senza canali",
  "nome,citta\nAda,Roma\nBea,Milano\n",
  { rows: 2, plottable: 0, text: 2, field: [1, 0, "Bea"] });

// One value per line, no separator anywhere: how a single-channel export is written, an ECG
// included. Looking for a delimiter that is not there used to end in "no separated columns".
add("una colonna sola di numeri, con intestazione",
  " Sample Value\n-0.00162229\n0.00245922\n0.00017747\n-0.01512071\n",
  { rows: 4, names: ["Sample Value"], plottable: 1, time: null,
    value: ["Sample Value", 1, 0.00245922] });

add("una colonna sola di numeri, senza intestazione",
  "-0.0016\n0.0024\n0.0001\n",
  { rows: 3, names: ["col 1"], plottable: 1 });

add("una colonna sola di testo: non è una tabella",
  "prima riga\nseconda riga\nterza riga\n",
  { error: "errorNoColumns" });

add("file vuoto", "", { error: "errorEmpty" });

add("solo l'intestazione",
  "a,b,c\n",
  { error: "errorNoRows" });

// -----------------------------------------------------------------------------------------------------------------
//  r u n n e r
// -----------------------------------------------------------------------------------------------------------------

let failed = 0;

function check(name, condition, detail) {
  if (condition) return;
  failed += 1;
  console.log(`  !  ${name}\n       ${detail}`);
}

for (const { name, text, expect } of CASES) {
  const r = parse(text);

  if (expect.error) {
    check(name, r.error === expect.error, `atteso ${expect.error}, ottenuto ${r.error || "nessun errore"}`);
    continue;
  }
  if (r.error) {
    failed += 1;
    console.log(`  !  ${name}\n       errore inatteso: ${r.error}`);
    continue;
  }

  if (expect.delimiter !== undefined) {
    check(name, r.delimiter === expect.delimiter,
      `separatore ${JSON.stringify(r.delimiter)}, atteso ${JSON.stringify(expect.delimiter)}`);
  }
  if (expect.rows !== undefined) {
    check(name, r.rowCount === expect.rows, `${r.rowCount} righe, attese ${expect.rows}`);
  }
  if (expect.names) {
    check(name, JSON.stringify(r.names) === JSON.stringify(expect.names),
      `intestazioni ${JSON.stringify(r.names)}, attese ${JSON.stringify(expect.names)}`);
  }
  if (expect.numeric) {
    const got = r.names.filter((n, i) => r.columns[i] && i !== r.timeIndex);
    for (const wanted of expect.numeric) {
      check(name, got.includes(wanted),
        `«${wanted}» doveva essere numerica; numeriche trovate: ${JSON.stringify(got)}`);
    }
  }
  if (expect.time !== undefined) {
    const got = r.timeIndex > -1 ? r.names[r.timeIndex] : null;
    check(name, got === expect.time, `colonna del tempo «${got}», attesa «${expect.time}»`);
  }
  if (expect.value) {
    const [column, row, wanted] = expect.value;
    const values = r.columns[r.names.indexOf(column)];
    const got = values ? values[row] : undefined;
    check(name, got !== undefined && Math.abs(got - wanted) < 1e-9,
      `${column}[${row}] = ${got}, atteso ${wanted}`);
  }
  if (expect.plottable !== undefined) {
    const got = r.columns.filter((c, i) => c && i !== r.timeIndex).length;
    check(name, got === expect.plottable, `${got} canali disegnabili, attesi ${expect.plottable}`);
  }
  if (expect.field) {
    const [row, column, wanted] = expect.field;
    const got = fields(r, row)[column];
    check(name, got === wanted, `riga ${row} colonna ${column} = ${JSON.stringify(got)}, atteso ${JSON.stringify(wanted)}`);
  }
  if (expect.text !== undefined) {
    const got = r.columns.filter((c) => c === null).length;
    check(name, got === expect.text, `${got} colonne di testo, attese ${expect.text}`);
  }
  if (expect.ragged) {
    check(name, r.ragged === true, "la riga più lunga doveva essere segnalata come irregolare");
  }

  // Whatever the shape, a file exported and read back must hold the same rows and the same values.
  //
  // Counting lines in the exported text would be simpler and wrong: a quoted field containing a
  // newline is one field on two lines, and the naive count reported a defect that was in the test.
  const again = parse(serialise(r, 0, r.rowCount - 1));
  check(name, !again.error && again.rowCount === r.rowCount,
    `export e rilettura: ${again.error || `${again.rowCount} righe invece di ${r.rowCount}`}`);
  if (!again.error && expect.value) {
    const [column, row, wanted] = expect.value;
    const values = again.columns[again.names.indexOf(column)];
    check(name, values && Math.abs(values[row] - wanted) < 1e-9,
      `export e rilettura: ${column}[${row}] = ${values && values[row]}, atteso ${wanted}`);
  }
}

console.log(failed
  ? `\n${failed} controlli falliti su ${CASES.length} formati.`
  : `\n${CASES.length} formati letti correttamente.`);
process.exit(failed ? 1 : 0);
