// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The CSV reader: separators, quotes, byte-order mark, encoding.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/csv.mjs

import assert from "node:assert/strict";
import { read, isCsv } from "../run/csv.js";

let passed = 0;
function prova(nome, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack}`);
    process.exitCode = 1;
  }
}

const enc = (text) => new TextEncoder().encode(text);

prova("il punto e virgola italiano, con la virgola decimale dentro i campi", () => {
  const righe = read(enc("Data;Importo;Descrizione\n01/09/2026;1.220,00;Bonifico da Rossi\n"));
  assert.deepEqual(righe, [["Data", "Importo", "Descrizione"], ["01/09/2026", "1.220,00", "Bonifico da Rossi"]]);
});

prova("virgola, virgolette, a capo dentro un campo e virgolette raddoppiate", () => {
  const righe = read(enc('a,b,c\r\n1,"due, ""tre""\nquattro",5\r\n'));
  assert.deepEqual(righe, [["a", "b", "c"], ["1", 'due, "tre"\nquattro', "5"]]);
});

prova("il BOM davanti non entra nel primo nome di colonna", () => {
  assert.equal(read(enc("﻿Data;Importo;Causale\n"))[0][0], "Data");
});

prova("un file in windows-1252 si legge con le sue lettere accentate", () => {
  const bytes = Uint8Array.from("Data;Descrizione;Importo\n01/09/2026;Società;10\n", (c) => c.charCodeAt(0));
  assert.equal(read(bytes)[1][1], "Società");
});

prova("si riconosce dal nome o dalla prima riga, e un XML no", () => {
  assert.equal(isCsv("movimenti.csv", enc("x")), true);
  assert.equal(isCsv("movimenti", enc("Data;Importo;Descrizione\n")), true);
  assert.equal(isCsv("fattura.xml", enc("<?xml version=\"1.0\"?>")), false);
});

console.log(`csv: ${passed} prove passate`);
