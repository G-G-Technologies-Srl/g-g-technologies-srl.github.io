// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The banks under Anagrafiche: the rules of `banks.js`, then the screen on the fake DOM.
//
// Three things that would break silently:
//
//  - **an IBAN with a wrong character is refused.** The shape check on the document passes it; the
//    check digits do not, and that is the difference between a typo and money sent to a stranger;
//  - **there is always exactly one default.** Removing the default, or marking another, must not
//    leave none — a list without one puts the choice back on every document — or two;
//  - **writing the accounts touches nothing else of the company.** They live inside the company
//    record, beside the VAT number and the logo: a save that rebuilt the record would wipe those.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/banks.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { install } from "./fake-dom.mjs";
import { reset } from "./fake-store.mjs";

const html = readFileSync(new URL("../run/index.html", import.meta.url), "utf8");
const dom = install(html);

const { openDatabase } = await import("../run/db.js");
const { setLang } = await import("../run/i18n.js");
const { get, put } = await import("gg/store.js");
const banks = await import("../run/banks.js");
const {
  abiCab, accountProblems, accountRecord, accounts, cleanIban, ibanChecks, saveAccounts, withAccount,
  withoutAccount,
} = banks;

setLang("it");
banks.connect(await openDatabase());

let passed = 0;
async function prova(nome, fn) {
  try {
    reset();
    dom.reset();
    await fn(await openDatabase());
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

async function dicendoSi(azione) {
  const done = azione();
  await new Promise((r) => setTimeout(r, 0));
  await dom.byId("askOk").fire("click");
  return done;
}

const IT = "IT60X0542811101000000123456";
const SM = "SM86U0322509800000000270100";

// -----------------------------------------------------------------------------------------------------------------
//  t h e   r u l e s
// -----------------------------------------------------------------------------------------------------------------

await prova("le cifre di controllo dell'IBAN si verificano, non solo la forma", async () => {
  assert.equal(ibanChecks(IT), true);
  assert.equal(ibanChecks(SM), true);
  assert.equal(ibanChecks("DE89370400440532013000"), true);
  assert.equal(ibanChecks("GB29 NWBK 6016 1331 9268 19"), true, "con gli spazi, come si copia");
  assert.equal(ibanChecks("it60x0542811101000000123456"), true, "in minuscolo");
  // Un carattere cambiato, e due cifre scambiate: la forma è giusta, il numero no.
  assert.equal(ibanChecks("IT60X0542811101000000123457"), false);
  assert.equal(ibanChecks("IT60X0542811101000000124356"), false);
  assert.equal(ibanChecks("IT60"), false);
  assert.equal(ibanChecks(""), false);
});

await prova("ABI e CAB escono da un IBAN italiano o sammarinese, e da nessun altro", async () => {
  assert.deepEqual(abiCab(IT), { abi: "05428", cab: "11101" });
  assert.deepEqual(abiCab(SM), { abi: "03225", cab: "09800" });
  assert.equal(abiCab("DE89370400440532013000"), null);
  assert.equal(cleanIban(" it60 x054 "), "IT60X054");
});

await prova("senza nome, il conto prende quello della banca: nessun menù mostra un IBAN nudo", async () => {
  const conto = accountRecord({ istituto: "Banca di San Marino", iban: "sm86 u032 2509 8000 0000 0270 100", bic: "bsmasmsm xxx" });
  assert.equal(conto.etichetta, "Banca di San Marino");
  assert.equal(conto.iban, SM);
  assert.equal(conto.bic, "BSMASMSMXXX");
  assert.ok(conto.id, "e ha un id che sopravvive a un'esportazione");
});

await prova("i rifiuti sono tre, e una filiale mancante non è uno di quelli", async () => {
  assert.deepEqual(accountProblems(accountRecord({})), ["bankNeedsName"]);
  assert.deepEqual(accountProblems(accountRecord({ etichetta: "Conto", iban: "IT60X0542811101000000123457" })), ["bankIbanCheck"]);
  assert.deepEqual(accountProblems(accountRecord({ etichetta: "Conto", bic: "XYZ" })), ["bankBicShape"]);
  assert.deepEqual(accountProblems(accountRecord({ etichetta: "Cassa", iban: IT })), []);
  assert.deepEqual(accountProblems(accountRecord({ etichetta: "Contanti" })), [], "un conto senza IBAN passa");
});

await prova("c'è sempre un predefinito, e uno solo", async () => {
  const a = accountRecord({ id: "a", etichetta: "A", iban: IT });
  const b = accountRecord({ id: "b", etichetta: "B", iban: SM });
  let conti = withAccount([], a);
  assert.equal(conti[0].predefinito, true, "il primo lo è da sé");
  conti = withAccount(conti, b);
  assert.deepEqual(conti.map((c) => c.predefinito), [true, false], "il secondo no");
  conti = withAccount(conti, { ...b, predefinito: true });
  assert.deepEqual(conti.map((c) => c.predefinito), [false, true], "segnarne un altro sposta il segno");
  conti = withoutAccount(conti, "b");
  assert.deepEqual(conti.map((c) => [c.id, c.predefinito]), [["a", true]], "tolto il predefinito, passa al primo");
  assert.deepEqual(withoutAccount(conti, "a"), []);
});

await prova("scrivere i conti non tocca il resto dell'azienda", async (db) => {
  await put(db, "company", { id: "company", denominazione: "G&G Technologies S.r.l.", logo: "data:x", partitaIva: "29141" });
  await saveAccounts(db, [accountRecord({ etichetta: "Principale", iban: IT, predefinito: true })]);
  const company = await get(db, "company", "company");
  assert.equal(company.denominazione, "G&G Technologies S.r.l.");
  assert.equal(company.logo, "data:x");
  assert.equal(company.conti.length, 1);
});

await prova("senza un'azienda salvata, il record nasce con i soli conti", async (db) => {
  await saveAccounts(db, [accountRecord({ etichetta: "Principale", iban: IT })]);
  assert.equal((await accounts(db)).length, 1);
});

// -----------------------------------------------------------------------------------------------------------------
//  t h e   s c r e e n
// -----------------------------------------------------------------------------------------------------------------

await prova("vuoto, la schermata lo dice e la tabella sta via", async (db) => {
  await banks.render(db);
  assert.equal(dom.byId("banksEmpty").hidden, false);
  assert.equal(dom.byId("banksTable").hidden, true);
});

await prova("un conto nuovo dal foglio: entra, predefinito, con il nome della banca", async (db) => {
  await banks.render(db);
  await dom.byId("bankNew").fire("click");
  assert.equal(dom.byId("bankDialog").open, true);
  assert.equal(dom.byId("bankDelete").hidden, true, "un conto nuovo non si elimina");
  const form = dom.byId("bankForm").elements;
  form.istituto.value = "Banca Malatestiana";
  form.iban.value = "IT60 X054 2811 1010 0000 0123 456";
  await form.iban.fire("input");
  assert.equal(dom.text("bankCodes"), "ABI 05428 · CAB 11101", "ABI e CAB mentre si scrive");
  await dom.byId("bankSave").fire("click");

  assert.equal(dom.byId("bankDialog").open, false);
  const conti = await accounts(db);
  assert.equal(conti.length, 1);
  assert.equal(conti[0].etichetta, "Banca Malatestiana");
  assert.equal(conti[0].iban, IT);
  assert.equal(conti[0].predefinito, true);
  assert.equal(dom.count("banksBody"), 1);
  assert.match(dom.byId("banksBody").at(0).allText, /Predefinito/);
});

await prova("un IBAN sbagliato resta nel foglio, con la ragione scritta sotto", async (db) => {
  await banks.render(db);
  await dom.byId("bankNew").fire("click");
  const form = dom.byId("bankForm").elements;
  form.etichetta.value = "Conto";
  form.iban.value = "IT60X0542811101000000123457";
  await dom.byId("bankSave").fire("click");
  assert.equal(dom.byId("bankDialog").open, true, "il foglio resta aperto");
  assert.equal(dom.byId("bankProblems").hidden, false);
  assert.match(dom.text("bankProblems"), /cifre di controllo/);
  assert.equal((await accounts(db)).length, 0, "e niente è stato scritto");
  await dom.byId("bankCancel").fire("click");
});

await prova("dalla riga si apre il conto, si corregge, si elimina", async (db) => {
  await saveAccounts(db, withAccount(withAccount([], accountRecord({ id: "a", etichetta: "A", iban: IT })),
    accountRecord({ id: "b", etichetta: "B", iban: SM })));
  await banks.render(db);
  assert.equal(dom.count("banksBody"), 2);

  await dom.byId("banksBody").at(1).fire("click");
  const form = dom.byId("bankForm").elements;
  assert.equal(form.etichetta.value, "B");
  assert.equal(dom.byId("bankDelete").hidden, false);
  form.filiale.value = "Serravalle";
  form.predefinito.checked = true;
  await dom.byId("bankSave").fire("click");
  let conti = await accounts(db);
  assert.equal(conti.find((c) => c.id === "b").filiale, "Serravalle");
  assert.deepEqual(conti.map((c) => c.predefinito), [false, true]);

  await dicendoSi(() => dom.byId("banksBody").at(1).at(4).at(0).fire("click"));
  conti = await accounts(db);
  assert.deepEqual(conti.map((c) => [c.id, c.predefinito]), [["a", true]]);
  assert.equal(dom.count("banksBody"), 1);
});

console.log(`banks: ${passed} prove passate`);
