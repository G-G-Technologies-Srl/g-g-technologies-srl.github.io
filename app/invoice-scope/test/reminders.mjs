// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il sollecito: quali fatture entrano, e che cosa dice il testo.
//
// Le prove che contano sono tre, e sono tutte cose che si sbagliano davanti a un cliente:
//
//  - **entra solo lo scaduto.** Una fattura che scade fra una settimana in un sollecito è un
//    errore che si paga con una telefonata imbarazzata;
//  - **un sollecito per cliente.** Tre fatture scadute dello stesso cliente sono una
//    conversazione sola, non tre email nello stesso pomeriggio;
//  - **il testo prevede che il pagamento possa essere già partito.** Succede di continuo, e un
//    testo che dà per scontato l'inadempimento fa rispondere un avvocato invece dell'ufficio
//    pagamenti.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/reminders.mjs

import assert from "node:assert/strict";

import { from } from "../run/decimal.js";
import { perCliente, testo, oggetto, destinatario, mailto } from "../run/reminders.js";

let passed = 0;
function prova(nome, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

const OGGI = "2026-09-17";
const rata = (partyId, numero, scadenza, importo, scaduta = true) =>
  ({ docId: `d-${numero}`, tipo: "TD01", numero, partyId, scadenza, importo: from(importo), scaduta });

const AZIENDA = {
  denominazione: "Officine Marecchia S.r.l.",
  conti: [{ id: "c1", etichetta: "Conto", iban: "SM90X0851409800000000123456", predefinito: true }],
};

prova("nel sollecito entra solo quello che è scaduto", () => {
  const rows = [
    rata("p1", "2026/0001", "2026-07-02", "1200"),
    rata("p1", "2026/0009", "2026-10-31", "500", false),
  ];
  const gruppi = perCliente(rows, { today: OGGI });
  assert.equal(gruppi.length, 1);
  assert.deepEqual(gruppi[0].righe.map((r) => r.numero), ["2026/0001"]);
});

prova("un sollecito per cliente, con il ritardo della fattura più vecchia", () => {
  const rows = [
    // In ordine di scadenza crescente, com'è lo scadenzario: il ritardo del cliente resta quello
    // della più vecchia anche se l'ultima letta è la più recente.
    rata("p1", "2026/0001", "2026-04-07", "1500"),
    rata("p1", "2026/0002", "2026-05-20", "1800"),
    rata("p2", "2026/0012", "2026-08-26", "5000"),
  ];
  const gruppi = perCliente(rows, { today: OGGI });
  assert.deepEqual(gruppi.map((g) => g.partyId), ["p2", "p1"], "prima chi deve di più");
  const uno = gruppi.find((g) => g.partyId === "p1");
  assert.equal(uno.righe.length, 2);
  assert.deepEqual(uno.righe.map((r) => r.numero), ["2026/0001", "2026/0002"], "dalla più vecchia");
  assert.equal(uno.giorni, 163, "il ritardo del cliente è quello della fattura più vecchia");
  assert.equal(uno.totale, from("3300"));
});

prova("il testo nomina le fatture, il totale, il conto — e lascia aperta la porta", () => {
  const gruppi = perCliente([rata("p1", "2026/0001", "2026-04-07", "1500")], { today: OGGI });
  const scritto = testo(gruppi[0], { company: AZIENDA, party: { denominazione: "Bitmakers Srl" } });
  assert.ok(scritto.includes("Bitmakers Srl"));
  assert.ok(scritto.includes("2026/0001"));
  assert.ok(scritto.includes("07/04/2026"));
  assert.ok(scritto.includes("1.500,00"));
  assert.ok(scritto.includes("SM90X0851409800000000123456"), "le coordinate, o il pagamento tarda ancora");
  assert.ok(scritto.includes("priva di effetto"), "la frase che prevede il pagamento già disposto");
  assert.ok(scritto.endsWith("Officine Marecchia S.r.l."));
  assert.ok(oggetto(AZIENDA).includes("Officine Marecchia S.r.l."));

  // Senza conti in anagrafica la riga delle coordinate non compare: una riga «IBAN:» vuota in
  // fondo a un sollecito è la ragione per cui il pagamento arriva ancora più tardi.
  const senza = testo(gruppi[0], { company: { denominazione: "Tizio" }, party: { denominazione: "Caio" } });
  assert.ok(!senza.includes("Coordinate"));
});

prova("il destinatario è la prima email delle persone di riferimento, non la PEC", () => {
  const conPersone = {
    denominazione: "Bitmakers Srl",
    pec: "bitmakers@pec.sm",
    contatti: [
      { nome: "Amministrazione", email: "" },
      { nome: "Chiara", email: " chiara@bitmakers.sm " },
      { nome: "Ivan", email: "ivan@bitmakers.sm" },
    ],
  };
  // La PEC è il canale degli atti: un sollecito mandato lì alza il tono di due gradi senza volerlo.
  assert.equal(destinatario(conPersone), "chiara@bitmakers.sm");
  assert.equal(destinatario({ denominazione: "Senza nessuno", pec: "x@pec.sm" }), "");
  assert.equal(destinatario(), "");

  // L'indirizzo `mailto` porta oggetto e testo, e si apre anche senza destinatario: chi scrive lo
  // completa nel programma di posta.
  const gruppi = perCliente([rata("p1", "2026/0001", "2026-04-07", "1500")], { today: OGGI });
  const link = mailto(gruppi[0], { company: AZIENDA, party: conPersone });
  assert.ok(link.startsWith("mailto:chiara%40bitmakers.sm?subject="));
  assert.ok(decodeURIComponent(link).includes("2026/0001"));
  assert.ok(mailto(gruppi[0], { company: AZIENDA, party: {} }).startsWith("mailto:?subject="));
});

console.log(`reminders: ${passed} prove passate`);
