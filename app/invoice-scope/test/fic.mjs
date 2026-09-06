// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Leggere le tre esportazioni di Fatture in Cloud.
//
// Le intestazioni e i valori qui sotto sono **copiati dai file veri**, i dati no: nomi inventati e
// partite IVA con il carattere di controllo giusto. Da un'esportazione vera si prende la forma —
// quali colonne, in che ordine, con che formato — mai il contenuto, che è di clienti reali.
//
//     node app/invoice-scope/test/fic.mjs

import assert from "node:assert/strict";
import * as fic from "../run/fic.js";

const { _norm, _numero, _data } = fic.internals;

let passed = 0;
function prova(nome, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.message}`);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   i n t e s t a z i o n i   v e r e
// -----------------------------------------------------------------------------------------------------------------

// L'intestazione dell'esportazione clienti, alla lettera, refuso compreso.
const HEAD_CLIENTI = [
  "Denominazione", "Codice interno", "Indirizzo", "Comune", "CAP", "Provincia", "Note indirizzo",
  "Paese", "Indirizzo e-mail", "Referente", "Telefono", "P.IVA/TAX ID", "Codice Fiscale", "Note",
  "Indirizzo PEC", "IBAN", "Codice SDI", "Aliquota iva predefinita", "Termini di pagamento",
  "Metodo di pagamento prefefinito", "FAX", "Indirizzo spedizione", "Sconto predefinito",
  "Lettera d'intento abilitata", "Protocollo ricezione", "Data ricevuta telematica",
];

const HEAD_LISTINO = [
  "Codice", "Nome prodotto/servizio", "Descrizione", "Categoria", "Prezzo netto", "Prezzo lordo",
  "Aliquota IVA", "Descrizione aliquota IVA", "U.D.M.", "Extra", "Prezzo di acquisto", "Giacenza",
];

const HEAD_REGISTRO = [
  "Data", "Prox scadenza", "Documento", "Numero", "Serie", "Saldato", "Centro ricavo", "Cliente",
  "Indirizzo cliente", "Comune", "Provincia", "CAP", "Indirizzo extra", "Paese", "P.IVA", "CF",
  "Oggetto (interno)", "Oggetto (visibile)", "Valuta orig.", "Imponibile", "IVA", "Cassa",
  "Altra cassa", "Rivalsa", "Rit. acconto", "Rit. prev.", "Lordo", "Contrassegnato",
];

/** Una riga clienti, dalle sole colonne che contano. */
function clienteRow(over = {}) {
  const row = new Array(HEAD_CLIENTI.length).fill("");
  const v = {
    0: "Bianchi Componenti S.r.l.", 2: "Via Verdi 12", 3: "Bologna", 4: "40127", 5: "BO",
    7: "Italia", 11: "01234567897", 14: "bianchi@pec.it", 16: "M5UXCR1", ...over,
  };
  for (const [at, text] of Object.entries(v)) row[Number(at)] = text;
  return row;
}

// -----------------------------------------------------------------------------------------------------------------
//  r i c o n o s c e r e   i l   f i l e
// -----------------------------------------------------------------------------------------------------------------

prova("le tre intestazioni vere si riconoscono", () => {
  assert.equal(fic.guess(HEAD_CLIENTI), "clienti");
  assert.equal(fic.guess(HEAD_LISTINO), "listino");
  assert.equal(fic.guess(HEAD_REGISTRO), "registro");
});

prova("il registro non passa per un elenco di clienti", () => {
  // Il difetto vero: il registro ha «Cliente» e «P.IVA», che è la firma dell'anagrafica, e la prima
  // versione lo leggeva come una rubrica di dodici voci — di cui otto la stessa azienda. La risposta
  // sbagliata sembrava del tutto plausibile, che è il motivo per cui questa prova esiste.
  assert.notEqual(fic.guess(HEAD_REGISTRO), "clienti");
});

prova("un'intestazione che non è nessuno dei tre dà null", () => {
  assert.equal(fic.guess(["Nome", "Cognome", "Età"]), null);
  assert.equal(fic.guess([]), null);
});

// -----------------------------------------------------------------------------------------------------------------
//  c l i e n t i
// -----------------------------------------------------------------------------------------------------------------

prova("un cliente italiano, per intero", () => {
  const { records, scartate, problems } = fic.parties(HEAD_CLIENTI, [clienteRow()]);
  assert.equal(records.length, 1);
  assert.deepEqual(problems, []);
  const c = records[0];
  assert.equal(c.denominazione, "Bianchi Componenti S.r.l.");
  assert.equal(c.partitaIva, "01234567897");
  assert.equal(c.pec, "bianchi@pec.it");
  assert.equal(c.codiceDestinatario, "M5UXCR1");
  assert.equal(c.paese, "IT");
  assert.deepEqual(
    { indirizzo: c.indirizzo, comune: c.comune, cap: c.cap, provincia: c.provincia },
    { indirizzo: "Via Verdi 12", comune: "Bologna", cap: "40127", provincia: "BO" },
  );
  assert.equal(scartate.length, 0, `colonne non riconosciute: ${scartate.join(", ")}`);
});

prova("le colonne che non abbiamo sono lasciate, non scartate in silenzio", () => {
  // Telefono, referente, IBAN e fax esistono da loro e non da noi. La prova è che non finiscano
  // nell'elenco delle colonne «non riconosciute», che vuol dire un'altra cosa: quello è il posto
  // dove compare una colonna che hanno rinominato, e va letto.
  const { scartate } = fic.parties(HEAD_CLIENTI, [clienteRow()]);
  assert.deepEqual(scartate, []);
  const inventata = fic.parties([...HEAD_CLIENTI, "Nuova colonna 2027"], [clienteRow()]);
  assert.deepEqual(inventata.scartate, ["Nuova colonna 2027"]);
});

prova("San Marino: RSM diventa SM, perché due lettere è quello che passa", () => {
  // `ProvinciaType` nello schema è `[A-Z]{2}`. Il loro file scrive `RSM`, la fattura che l'Ufficio
  // Tributario ci ha registrato scrive `SM`. Non è una preferenza fra due grafie.
  const row = clienteRow({ 3: "Serravalle", 4: "47899", 5: "RSM", 7: "San Marino", 11: "SM29141" });
  const { records } = fic.parties(HEAD_CLIENTI, [row]);
  assert.equal(records[0].paese, "SM");
  assert.equal(records[0].provincia, "SM");
  assert.equal(records[0].cap, "47899", "il CAP sammarinese resta: non è un indirizzo estero");
});

prova("un paese che non sappiamo nominare si segnala e non si indovina", () => {
  // Sbagliare il paese manda l'indirizzo nel ramo estero dell'emettitore, che scrive `CAP 00000` e
  // nessuna provincia. Meglio dirlo: il record entra come italiano e la riga viene nominata.
  const { records, problems } = fic.parties(HEAD_CLIENTI, [clienteRow({ 7: "Ruritania" })]);
  assert.equal(records.length, 1);
  assert.deepEqual(problems, [{ riga: 1, chiave: "ficCountry", valore: "Ruritania" }]);
});

prova("una riga senza denominazione non entra, e si sa quale", () => {
  const { records, problems } = fic.parties(HEAD_CLIENTI, [clienteRow(), clienteRow({ 0: "" })]);
  assert.equal(records.length, 1);
  assert.deepEqual(problems, [{ riga: 2, chiave: "ficNoName" }]);
});

prova("i nomi di paese arrivano in due lingue e in sigla", () => {
  assert.equal(fic.paese("Italia"), "IT");
  assert.equal(fic.paese("italy"), "IT");
  assert.equal(fic.paese("San Marino"), "SM");
  assert.equal(fic.paese("Repubblica di San Marino"), "SM");
  assert.equal(fic.paese("DE"), "DE");
  assert.equal(fic.paese("de"), "DE");
  assert.equal(fic.paese(""), null);
  assert.equal(fic.paese("Ruritania"), null);
});

// -----------------------------------------------------------------------------------------------------------------
//  l i s t i n o
// -----------------------------------------------------------------------------------------------------------------

prova("una voce di listino prende la descrizione lunga", () => {
  const row = new Array(HEAD_LISTINO.length).fill("");
  row[0] = "consbasic";
  row[1] = "Consulenza Base";
  row[2] = "Pacchetto di 20 mezze giornate di consulenza";
  row[4] = "8000.0";
  const { records } = fic.items(HEAD_LISTINO, [row], { aliquota: "0" });
  assert.equal(records[0].descrizione, "Pacchetto di 20 mezze giornate di consulenza");
  assert.equal(records[0].prezzoUnitario, "8000.0");
});

prova("senza descrizione lunga vale il nome", () => {
  const row = new Array(HEAD_LISTINO.length).fill("");
  row[1] = "Consulenza Base";
  row[4] = "8000";
  const { records } = fic.items(HEAD_LISTINO, [row]);
  assert.equal(records[0].descrizione, "Consulenza Base");
});

prova("l'aliquota mancante è quella dell'azienda, non ventidue", () => {
  // Il file non ne porta nessuna, su nessuna riga. Scrivere `22` qui sarebbe un valore giusto per
  // chi scrive il codice e sbagliato per chi lo usa: le fatture di questa azienda sono N3.1 a zero.
  const row = new Array(HEAD_LISTINO.length).fill("");
  row[1] = "Consulenza";
  row[4] = "100";
  assert.equal(fic.items(HEAD_LISTINO, [row], { aliquota: "0" }).records[0].aliquota, "0");
  assert.equal(fic.items(HEAD_LISTINO, [row], { aliquota: "22" }).records[0].aliquota, "22");
  row[6] = "10";
  assert.equal(fic.items(HEAD_LISTINO, [row], { aliquota: "0" }).records[0].aliquota, "10",
               "quando il file ce l'ha, vince il file");
});

// -----------------------------------------------------------------------------------------------------------------
//  r e g i s t r o
// -----------------------------------------------------------------------------------------------------------------

/** Una riga del registro, nella forma vera: importi con la valuta davanti, date a due cifre. */
function registroRow(over = {}) {
  const row = new Array(HEAD_REGISTRO.length).fill("");
  const v = {
    0: "27/07/26", 1: "26/08/26", 2: "Fattura", 3: "12", 5: "NO", 7: "Bianchi Componenti S.r.l.",
    8: "Via Verdi 12", 9: "Bologna", 10: "BO", 11: "40127", 13: "Italia", 14: "01234567897",
    17: "Consulenza di luglio", 18: "EUR", 19: "EUR 5,000.00 ", 20: "EUR 0.00 ", 26: "EUR 5,000.00 ",
    27: "NO", ...over,
  };
  for (const [at, text] of Object.entries(v)) row[Number(at)] = text;
  return row;
}

prova("una voce di registro, per intero", () => {
  const { records, scartate, problems } = fic.register(HEAD_REGISTRO, [registroRow()]);
  assert.deepEqual(problems, []);
  assert.deepEqual(scartate, [], `colonne non riconosciute: ${scartate.join(", ")}`);
  const d = records[0];
  assert.equal(d.tipo, "TD01");
  assert.equal(d.data, "2026-07-27");
  assert.equal(d.scadenza, "2026-08-26");
  assert.equal(d.numero, "12");
  assert.equal(d.saldato, false);
  assert.equal(d.imponibile, "5000.00");
  assert.equal(d.lordo, "5000.00");
  assert.equal(d.oggetto, "Consulenza di luglio");
  assert.equal(d.cliente.denominazione, "Bianchi Componenti S.r.l.");
  assert.equal(d.cliente.provincia, "BO");
});

prova("«SI» è saldato, tutto il resto no", () => {
  const saldato = (v) => fic.register(HEAD_REGISTRO, [registroRow({ 5: v })]).records[0].saldato;
  assert.equal(saldato("SI"), true);
  assert.equal(saldato("Sì"), true);
  assert.equal(saldato("si"), true);
  assert.equal(saldato("NO"), false);
  assert.equal(saldato(""), false);
});

prova("senza scadenza vale la data del documento", () => {
  const d = fic.register(HEAD_REGISTRO, [registroRow({ 1: "" })]).records[0];
  assert.equal(d.scadenza, "2026-07-27");
});

prova("i tipi di documento che sappiamo tradurre", () => {
  const tipo = (v) => (fic.register(HEAD_REGISTRO, [registroRow({ 2: v })]).records[0] || {}).tipo;
  assert.equal(tipo("Fattura"), "TD01");
  assert.equal(tipo("Nota di credito"), "TD04");
  assert.equal(tipo("Preventivo"), "preventivo");
  assert.equal(tipo("DDT"), "ddt");
});

prova("un tipo che non conosciamo si ferma e si nomina", () => {
  const { records, problems } = fic.register(HEAD_REGISTRO, [registroRow({ 2: "Autofattura" })]);
  assert.equal(records.length, 0);
  assert.deepEqual(problems, [{ riga: 1, chiave: "ficKind", valore: "Autofattura" }]);
});

prova("una data illeggibile si ferma e si nomina", () => {
  const { records, problems } = fic.register(HEAD_REGISTRO, [registroRow({ 0: "luglio" })]);
  assert.equal(records.length, 0);
  assert.deepEqual(problems, [{ riga: 1, chiave: "ficNoDate", valore: "luglio" }]);
});

// -----------------------------------------------------------------------------------------------------------------
//  i   n u m e r i   e   l e   d a t e
// -----------------------------------------------------------------------------------------------------------------

prova("gli importi con due separatori non sono ambigui", () => {
  assert.equal(_numero("EUR 5,000.00 "), "5000.00");     // come li scrive il registro
  assert.equal(_numero("5.000,00"), "5000.00");          // come li scrive un Excel italiano
  assert.equal(_numero("1.234.567,89"), "1234567.89");
  assert.equal(_numero("-1,234.56"), "-1234.56");
});

prova("un separatore solo: la regola dichiarata, e i suoi limiti", () => {
  assert.equal(_numero("1234.56"), "1234.56");
  assert.equal(_numero("12,5"), "12.5");
  assert.equal(_numero("0.001"), "0.001", "uno zero davanti non fa migliaia");
  assert.equal(_numero("1,500"), "1500", "tre cifre dietro, poche davanti: migliaia");
  assert.equal(_numero("1234,567"), "1234.567", "quattro cifre davanti: non è un raggruppamento");
});

prova("quello che non è un numero", () => {
  assert.equal(_numero(""), "");
  assert.equal(_numero(null), "");
  assert.equal(_numero("n.d."), "");
  assert.equal(_numero("EUR 0.00 "), "0.00");
});

prova("le date, e l'anno a due cifre", () => {
  assert.equal(_data("27/07/26"), "2026-07-27");
  assert.equal(_data("1/1/2026"), "2026-01-01");
  assert.equal(_data("2026-09-04"), "2026-09-04", "già nostra: sheet.js ha convertito un seriale");
  assert.equal(_data("31/12/69"), "2069-12-31");
  assert.equal(_data("01/01/70"), "1970-01-01");
  assert.equal(_data("32/01/26"), "");
  assert.equal(_data("01/13/26"), "");
  assert.equal(_data("boh"), "");
  assert.equal(_data(""), "");
});

prova("le intestazioni si confrontano schiacciate", () => {
  assert.equal(_norm("P.IVA/TAX ID"), "p iva tax id");
  assert.equal(_norm("  Città  "), "citta");
  assert.equal(_norm("Oggetto (visibile)"), "oggetto visibile");
  assert.equal(_norm("U.D.M."), "u d m");
  assert.equal(_norm(null), "");
});

console.log(`fic: ${passed} prove passate`);
