// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// L'intestatario di un documento, in righe: l'indirizzo, l'identificativo fiscale, il recapito.
//
// Le stesse righe le usano la carta e la schermata del documento, che è la ragione per cui il
// blocco sta in un file solo. Senza DOM la lingua è quella predefinita, l'italiano.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/address.mjs

import assert from "node:assert/strict";
import { addressLines, deliveryLine, fiscalLabel, countryName } from "../run/address.js";

let passed = 0;
function prova(nome, fn) {
  try { fn(); passed += 1; } catch (error) { console.error(`✗ ${nome}\n  ${error.message}`); process.exitCode = 1; }
}

const sammarinese = {
  denominazione: "Rossi Impianti S.r.l.", paese: "SM", partitaIva: "29077",
  sede: { indirizzo: "Via Marino Moretti", numeroCivico: "23", cap: "47899", comune: "Serravalle" },
  codiceDestinatario: "2R4GTO8",
};

const italiano = {
  denominazione: "Bianchi S.p.A.", paese: "IT", partitaIva: "01234567890", codiceFiscale: "BNCMRA80A01H501U",
  sede: { indirizzo: "Corso Italia", numeroCivico: "5", cap: "47921", comune: "Rimini", provincia: "RN" },
  pec: "bianchi@pec.it",
};

prova("l'etichetta fiscale la decide il paese, non il campo", () => {
  assert.equal(fiscalLabel(sammarinese), "COE");
  assert.equal(fiscalLabel(italiano), "P. IVA");
  // Senza record e senza paese si fattura come in Italia, che è il caso più frequente.
  assert.equal(fiscalLabel(null), "P. IVA");
  assert.equal(fiscalLabel({}), "P. IVA");
});

prova("un cliente sammarinese: via, città, paese per esteso, COE", () => {
  assert.deepEqual(addressLines(sammarinese), [
    "Via Marino Moretti 23",
    "47899 Serravalle · San Marino",
    "COE 29077",
  ]);
});

prova("una fattura italiana non scrive «Italia»", () => {
  const righe = addressLines(italiano);
  assert.equal(righe[0], "Corso Italia 5");
  assert.equal(righe[1], "47921 Rimini (RN)");
  assert.ok(!righe.some((riga) => riga.includes("Italia ·") || riga.endsWith("· Italia")), righe.join(" | "));
  assert.equal(countryName(italiano), "");
});

prova("il codice fiscale si scrive solo quando dice qualcosa in più", () => {
  assert.ok(addressLines(italiano).includes("codice fiscale BNCMRA80A01H501U"));
  // Per una società i due sono la stessa stringa, e stamparla due volte sembra un errore.
  const doppio = { ...italiano, codiceFiscale: italiano.partitaIva };
  assert.equal(addressLines(doppio).filter((riga) => riga.includes(italiano.partitaIva)).length, 1);
});

prova("un paese che il dizionario non nomina tiene la sua sigla", () => {
  const francese = { paese: "FR", partitaIva: "FR12345678901", sede: { comune: "Lyon" } };
  assert.equal(countryName(francese), "FR");
  assert.equal(addressLines(francese)[0], "Lyon · FR");
});

prova("quello che manca non lascia un buco", () => {
  assert.deepEqual(addressLines(null), []);
  assert.deepEqual(addressLines({}), []);
  // Un cliente con il solo nome non ha righe: la schermata lo fa sparire invece di disegnare un
  // riquadro vuoto sotto il campo.
  assert.deepEqual(addressLines({ denominazione: "Solo il nome" }), []);
});

prova("il recapito elettronico: codice destinatario, PEC, o tutti e due", () => {
  assert.equal(deliveryLine(sammarinese), "codice destinatario 2R4GTO8");
  assert.equal(deliveryLine(italiano), "PEC bianchi@pec.it");
  assert.equal(deliveryLine({ ...italiano, codiceDestinatario: "0000000" }),
    "codice destinatario 0000000 · PEC bianchi@pec.it");
  assert.equal(deliveryLine({}), "");
  assert.equal(deliveryLine(null), "");
});

console.log(`address: ${passed} prove`);
