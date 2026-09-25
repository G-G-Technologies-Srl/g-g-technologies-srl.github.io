// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Le schede doppie: riconoscerle, e unirle senza perdere niente.
//
// Le prove che contano qui sono tre, e sono tutte cose che si rompono in silenzio:
//
//  - **si raggruppa per identificativo fiscale, non per nome.** Due aziende omonime unite per
//    sbaglio non si separano più: l'unione cancella una scheda, e non c'è «annulla».
//  - **l'unione non sovrascrive e non perde.** La PEC scritta solo sulla scheda minore deve
//    restare, e quella scritta su tutte e due deve restare quella della scheda tenuta.
//  - **niente resta appeso.** Documenti, diario, acquisti e ricorrenti cambiano cliente nella
//    stessa transazione in cui la scheda sparisce: una riga che punta a un id cancellato è un
//    cliente che non si apre più, e lo si scopre mesi dopo.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/duplicates.mjs

import assert from "node:assert/strict";

import { openDatabase } from "../run/db.js";
import { chiaveFiscale, conteggi, fusione, gruppi, principale, unisci } from "../run/duplicates.js";
import { get, list, put } from "gg/store.js";
import { reset } from "./fake-store.mjs";

let passed = 0;
async function prova(nome, fn) {
  try {
    reset();
    await fn(await openDatabase());
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.message}`);
    process.exitCode = 1;
  }
}

/** Una scheda cliente, con quel poco che serve a queste prove. */
function scheda(id, fields = {}) {
  return { id, sede: {}, paese: "IT", denominazione: id, ruolo: "cliente", ...fields };
}

// -----------------------------------------------------------------------------------------------------------------
//  r i c o n o s c e r e
// -----------------------------------------------------------------------------------------------------------------

await prova("la chiave è il paese più il codice, e senza codice non c'è chiave", async () => {
  assert.equal(chiaveFiscale(scheda("a", { partitaIva: "02561790991" })), "IT|02561790991");
  // Lo stesso numero scritto col paese davanti, come lo esporta Fatture in Cloud, è lo stesso
  // soggetto: `fiscalCode` toglie la sigla, e senza quel passaggio il duplicato non si vedrebbe.
  assert.equal(chiaveFiscale(scheda("b", { paese: "SM", partitaIva: "SM29077" })), "SM|29077");
  assert.equal(chiaveFiscale(scheda("c", { paese: "SM", partitaIva: "29077" })), "SM|29077");
  // Solo il codice fiscale vale come chiave: un privato non ha partita IVA.
  assert.equal(chiaveFiscale(scheda("d", { codiceFiscale: "RSSMRA80A01H501U" })), "IT|RSSMRA80A01H501U");
  assert.equal(chiaveFiscale(scheda("e")), "", "senza dati fiscali non si raggruppa niente");
});

await prova("due nomi uguali senza codice non sono un duplicato", async () => {
  const people = [
    scheda("a", { denominazione: "Rossi S.r.l." }),
    scheda("b", { denominazione: "Rossi S.r.l." }),
  ];
  assert.deepEqual(gruppi(people), [], "omonimi, non duplicati: unirli non si annulla");

  const conCodice = [
    scheda("a", { denominazione: "Rossi S.r.l.", partitaIva: "02561790991" }),
    scheda("b", { denominazione: "ROSSI SRL", partitaIva: "02561790991" }),
    scheda("c", { denominazione: "Bianchi S.p.A.", partitaIva: "00743110157" }),
  ];
  const trovati = gruppi(conCodice);
  assert.equal(trovati.length, 1);
  assert.deepEqual(trovati[0].records.map((one) => one.id), ["a", "b"]);
  assert.equal(trovati[0].chiave, "IT|02561790991");
});

await prova("lo stesso paese conta: due paesi non sono lo stesso soggetto", async () => {
  const people = [
    scheda("a", { paese: "IT", partitaIva: "29077" }),
    scheda("b", { paese: "SM", partitaIva: "29077" }),
  ];
  assert.deepEqual(gruppi(people), [], "stesso numero, due registri diversi");
});

await prova("resta quella che porta più righe", async () => {
  const records = [scheda("a"), scheda("b")];
  const pesi = new Map([["a", 1], ["b", 4]]);
  assert.equal(principale(records, pesi).id, "b");
  // A pari righe decide quanto è compilata: la scheda con la PEC è quella che qualcuno ha curato.
  const pieno = [scheda("a"), scheda("b", { pec: "b@pec.it", codiceDestinatario: "ABCDEFG" })];
  assert.equal(principale(pieno, new Map()).id, "b");
});

// -----------------------------------------------------------------------------------------------------------------
//  u n i r e
// -----------------------------------------------------------------------------------------------------------------

await prova("l'unione riempie i vuoti e non sovrascrive niente", async () => {
  const tenuto = scheda("a", {
    denominazione: "Rossi S.r.l.", pec: "buona@pec.it", sede: { comune: "Imola" },
    contatti: [{ id: "c1", nome: "Chiara", email: "chiara@example.com" }],
  });
  const scartato = scheda("b", {
    denominazione: "ROSSI SRL", pec: "vecchia@pec.it", codiceDestinatario: "ABCDEFG",
    sede: { comune: "Bologna", indirizzo: "Via Emilia 1" },
    contatti: [{ id: "c2", nome: "Ivan", email: "ivan@example.com" },
               { id: "c3", nome: "Chiara", email: "chiara@example.com" }],
  });
  const unito = fusione(tenuto, scartato);

  assert.equal(unito.id, "a", "l'unione è la scheda tenuta, non una terza");
  assert.equal(unito.pec, "buona@pec.it", "quello che c'era non si tocca");
  assert.equal(unito.sede.comune, "Imola");
  assert.equal(unito.codiceDestinatario, "ABCDEFG", "e quello che mancava arriva dall'altra");
  assert.equal(unito.sede.indirizzo, "Via Emilia 1");
  assert.deepEqual(unito.contatti.map((one) => one.nome), ["Chiara", "Ivan"],
    "le persone si sommano, e chi era su tutte e due resta una sola");
  assert.equal(unito.name, unito.denominazione, "il nome dell'indice segue la ragione sociale");
});

await prova("un cliente e un fornitore che sono lo stesso soggetto diventano entrambi", async () => {
  assert.equal(fusione(scheda("a", { ruolo: "cliente" }), scheda("b", { ruolo: "fornitore" })).ruolo, "entrambi");
  assert.equal(fusione(scheda("a", { ruolo: "fornitore" }), scheda("b", { ruolo: "fornitore" })).ruolo, "fornitore");
});

await prova("le righe cambiano cliente, e la scheda in più sparisce", async (db) => {
  await put(db, "parties", scheda("a", { partitaIva: "02561790991", denominazione: "Rossi S.r.l." }));
  await put(db, "parties", scheda("b", { partitaIva: "02561790991", denominazione: "ROSSI SRL" }));
  await put(db, "docs", { id: "d1", partyId: "a", tipo: "TD01", data: "2026-01-10", stato: "emessa" });
  await put(db, "docs", { id: "d2", partyId: "b", tipo: "TD01", data: "2026-02-10", stato: "emessa" });
  await put(db, "activities", { id: "n1", partyId: "b", tipo: "nota", data: "2026-02-11", testo: "chiamato" });
  await put(db, "costs", { id: "s1", partyId: "b", data: "2026-03-01" });
  await put(db, "recurring", { id: "r1", partyId: "b" });

  const esito = await unisci(db, "a", "b");
  assert.equal(esito.spostati, 4, "documento, nota, acquisto e ricorrente");
  assert.equal(await get(db, "parties", "b"), undefined, "la seconda scheda non c'è più");
  for (const store of ["docs", "activities", "costs", "recurring"]) {
    for (const record of await list(db, store)) {
      assert.equal(record.partyId, "a", `${store}: nessuna riga resta appesa`);
    }
  }
});

await prova("unire due volte la stessa, o una che non c'è, non fa niente", async (db) => {
  await put(db, "parties", scheda("a", { partitaIva: "02561790991" }));
  assert.equal(await unisci(db, "a", "a"), null);
  assert.equal(await unisci(db, "a", "mai-esistita"), null);
  assert.equal((await list(db, "parties")).length, 1);
});

await prova("i conteggi sono una lettura per store, e dicono quante righe muove l'unione", async (db) => {
  await put(db, "docs", { id: "d1", partyId: "a", data: "2026-01-10" });
  await put(db, "docs", { id: "d2", partyId: "a", data: "2026-01-11" });
  await put(db, "costs", { id: "s1", partyId: "b", data: "2026-01-12" });
  const pesi = await conteggi(db);
  assert.equal(pesi.get("a"), 2);
  assert.equal(pesi.get("b"), 1);
  assert.equal(pesi.get("c"), undefined);
});

console.log(`duplicates: ${passed} prove passate`);
