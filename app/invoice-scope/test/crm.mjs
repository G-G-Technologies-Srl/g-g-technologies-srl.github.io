// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Le persone di riferimento e il diario: `crm.js`, senza browser.
//
// Le prove che contano qui sono tre, e sono tutte cose che si rompono in silenzio:
//
//  - **i contatti sopravvivono a una correzione dei dati fiscali.** `partyRecord` costruisce il
//    record da una lista di campi e butta via il resto — è quello che la rende adatta
//    all'importazione — quindi salvare la scheda di un cliente cancellerebbe le sue persone. Non
//    darebbe nessun errore: la tabella sarebbe semplicemente vuota il giorno dopo.
//  - **l'ordine del diario è su due campi.** Il giorno, e poi il momento in cui la voce è stata
//    scritta: una nota di ieri annotata stamattina non deve saltare sopra la telefonata di oggi.
//  - **un archivio vecchio si reimporta ancora.** Chi ha esportato la settimana scorsa non aveva
//    lo store del diario: il file non deve essere rifiutato per quello che non contiene.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/crm.mjs

import assert from "node:assert/strict";

import { openDatabase, EXPORTED, NAME, VERSION } from "../run/db.js";
import { partyRecord, saveParty } from "../run/parties.js";
import {
  ACTIVITY_KINDS, ACTIVITY_MAX, activitiesOf, activities, contactRecord, contactsOf,
  lastContactByParty, removeActivity, removeParty, saveActivity, withContact, withoutContact,
} from "../run/crm.js";
import { collect, restore } from "gg/io.js";
import { get, list } from "gg/store.js";
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

const oggi = () => new Date().toISOString().slice(0, 10);

// -----------------------------------------------------------------------------------------------------------------
//  l e   p e r s o n e
// -----------------------------------------------------------------------------------------------------------------

await prova("una persona è cinque campi ripuliti, e il nome è l'unico che serve", async () => {
  const uno = contactRecord({ nome: "  Chiara Rossi ", ruolo: "Acquisti", email: " c@example.com ",
                              telefono: "", note: "" });
  assert.equal(uno.nome, "Chiara Rossi");
  assert.equal(uno.email, "c@example.com");
  assert.equal(uno.telefono, "");
  assert.ok(uno.id, "un id ce l'ha da sé");
  // Con l'id passato resta quello: è la modifica, non un secondo record con lo stesso nome.
  assert.equal(contactRecord({ id: uno.id, nome: "Chiara Rossi" }).id, uno.id);
});

await prova("aggiungere, sostituire, togliere — senza toccare l'elenco di partenza", async () => {
  const cliente = { id: "p1", contatti: [] };
  const primo = withContact(cliente, { nome: "Chiara" });
  assert.equal(primo.length, 1);
  assert.deepEqual(cliente.contatti, [], "l'elenco del record non si tocca finché non si salva");

  const conDue = withContact({ ...cliente, contatti: primo }, { nome: "Ivan" });
  assert.deepEqual(conDue.map((c) => c.nome), ["Chiara", "Ivan"]);

  const corretto = withContact({ ...cliente, contatti: conDue },
    { id: conDue[0].id, nome: "Chiara Rossi", ruolo: "Acquisti" });
  assert.equal(corretto.length, 2, "stesso id: sostituito, non aggiunto");
  assert.equal(corretto[0].nome, "Chiara Rossi");
  assert.equal(corretto[0].ruolo, "Acquisti");
  assert.equal(corretto[1].nome, "Ivan", "e resta al suo posto");

  assert.deepEqual(withoutContact({ ...cliente, contatti: corretto }, conDue[0].id)
    .map((c) => c.nome), ["Ivan"]);
  // Un cliente di prima dell'aggiornamento non ha la chiave, e non è un caso da gestire a parte.
  assert.deepEqual(contactsOf({ id: "vecchio" }), []);
});

await prova("correggere i dati fiscali non cancella le persone", async () => {
  // Il difetto che questa prova esiste per fermare: `partyRecord` prende una lista di campi e
  // scarta il resto, quindi senza una riga apposta le persone spariscono al primo CAP corretto —
  // e non lo dice nessuno.
  const conPersone = partyRecord({
    denominazione: "Rossi Impianti S.r.l.", paese: "IT", cap: "40068",
    contatti: [{ nome: "Chiara Rossi", ruolo: "Acquisti" }],
  });
  assert.equal(conPersone.contatti.length, 1);
  assert.equal(conPersone.contatti[0].nome, "Chiara Rossi");
  assert.ok(conPersone.contatti[0].id, "e prendono un id, anche arrivando senza");

  const corretto = partyRecord({ ...conPersone, ...conPersone.sede, cap: "40069" });
  assert.equal(corretto.sede.cap, "40069");
  assert.deepEqual(corretto.contatti, conPersone.contatti, "le persone passano intatte");

  // Chi non ne ha non guadagna una chiave vuota: un record senza persone resta come era.
  assert.ok(!("contatti" in partyRecord({ denominazione: "Senza nessuno" })));
});

await prova("l'IVA e il conto del cliente sopravvivono al record, nella forma giusta", async () => {
  // L'aliquota come la scrive una persona — «0», «22,0», vuota — e come la vogliono i conti; la
  // natura solo quando l'aliquota è zero, perché a 22 sarebbe un dato che il tracciato rifiuta.
  const zero = partyRecord({
    denominazione: "Müller GmbH", paese: "DE",
    aliquotaPredefinita: "0", naturaPredefinita: "N3.2", ibanPredefinito: "it60 x054 2811 1010 0000 0123 456",
  });
  assert.equal(zero.aliquotaPredefinita, "0");
  assert.equal(zero.naturaPredefinita, "N3.2");
  assert.equal(zero.ibanPredefinito, "IT60X0542811101000000123456", "senza spazi, in maiuscolo");

  const pieno = partyRecord({ denominazione: "Rossi", aliquotaPredefinita: "22,0", naturaPredefinita: "N3.2" });
  assert.equal(pieno.aliquotaPredefinita, "22");
  assert.equal(pieno.naturaPredefinita, "", "a 22 la natura non ha senso, e non resta");

  const vuoto = partyRecord({ denominazione: "Senza" });
  assert.equal(vuoto.aliquotaPredefinita, "", "vuota vuol dire «quella dell'azienda»");
  assert.equal(vuoto.ibanPredefinito, "");
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   d i a r i o
// -----------------------------------------------------------------------------------------------------------------

await prova("una voce nuova: tipo noto, data valida, testo entro il limite", async (db) => {
  const voce = await saveActivity(db, { partyId: "p1", tipo: "chiamata", data: "2026-09-03",
                                        testo: "  Richiamare Chiara  " });
  assert.equal(voce.tipo, "chiamata");
  assert.equal(voce.data, "2026-09-03");
  assert.equal(voce.testo, "Richiamare Chiara");
  assert.ok(voce.created && voce.updated);

  // Un tipo che questa versione non conosce — un archivio scritto da una più nuova — si legge come
  // nota invece di sparire: la voce vale per il testo, non per l'etichetta.
  const strano = await saveActivity(db, { partyId: "p1", tipo: "videochiamata", testo: "x" });
  assert.equal(strano.tipo, ACTIVITY_KINDS[0]);
  // Una data che non è una data finirebbe in fondo all'elenco per sempre: l'ordine è su questo campo.
  assert.equal((await saveActivity(db, { partyId: "p1", data: "03/09/2026", testo: "x" })).data, oggi());
  const lungo = await saveActivity(db, { partyId: "p1", testo: "a".repeat(ACTIVITY_MAX + 500) });
  assert.equal(lungo.testo.length, ACTIVITY_MAX);
});

await prova("le due voci che non si scrivono: senza cliente, e senza testo", async (db) => {
  await assert.rejects(() => saveActivity(db, { testo: "orfana" }), /activityNeedsParty/);
  await assert.rejects(() => saveActivity(db, { partyId: "p1", testo: "   " }), /activityNeedsText/);
  assert.equal((await list(db, "activities")).length, 0, "e non ne resta niente nel deposito");
});

await prova("il diario è del suo cliente, dal giorno più recente", async (db) => {
  await saveActivity(db, { partyId: "p1", data: "2026-09-01", testo: "prima" });
  await saveActivity(db, { partyId: "p1", data: "2026-09-05", testo: "dopo" });
  await saveActivity(db, { partyId: "p2", data: "2026-09-09", testo: "di un altro" });

  const sue = await activitiesOf(db, "p1");
  assert.deepEqual(sue.map((v) => v.testo), ["dopo", "prima"]);
  assert.deepEqual((await activitiesOf(db, "p2")).map((v) => v.testo), ["di un altro"]);
  assert.equal((await activities(db)).length, 3);
  assert.equal((await activities(db))[0].testo, "di un altro", "in tutto, sempre dal più recente");
});

await prova("due voci dello stesso giorno tengono l'ordine in cui sono state scritte", async (db) => {
  // Il giorno da solo non basta: due telefonate di oggi hanno la stessa data, e l'ordine con cui
  // il deposito le restituisce non è un ordine.
  await saveActivity(db, { partyId: "p1", data: "2026-09-05", testo: "la prima",
                           created: "2026-09-05T09:00:00.000Z" });
  await saveActivity(db, { partyId: "p1", data: "2026-09-05", testo: "la seconda",
                           created: "2026-09-05T16:30:00.000Z" });
  assert.deepEqual((await activitiesOf(db, "p1")).map((v) => v.testo), ["la seconda", "la prima"]);
});

await prova("modificare una voce non ne crea una seconda, e la data di scrittura resta", async (db) => {
  const voce = await saveActivity(db, { partyId: "p1", data: "2026-09-05", testo: "prima stesura" });
  const dopo = await saveActivity(db, { id: voce.id, created: voce.created, partyId: "p1",
                                        data: "2026-09-05", tipo: "email", testo: "seconda stesura" });
  assert.equal(dopo.id, voce.id);
  assert.equal(dopo.created, voce.created);
  assert.equal((await activitiesOf(db, "p1")).length, 1);
  assert.equal((await activitiesOf(db, "p1"))[0].testo, "seconda stesura");
});

await prova("una voce si elimina, e le altre restano", async (db) => {
  const una = await saveActivity(db, { partyId: "p1", testo: "questa va via" });
  await saveActivity(db, { partyId: "p1", testo: "questa resta" });
  await removeActivity(db, una.id);
  assert.deepEqual((await activitiesOf(db, "p1")).map((v) => v.testo), ["questa resta"]);
});

await prova("l'ultimo contatto per cliente, da una lettura sola", async () => {
  const ultimo = lastContactByParty([
    { partyId: "p1", data: "2026-09-01" },
    { partyId: "p1", data: "2026-09-07" },
    { partyId: "p2", data: "2026-08-30" },
  ]);
  assert.equal(ultimo.get("p1"), "2026-09-07");
  assert.equal(ultimo.get("p2"), "2026-08-30");
  assert.equal(ultimo.get("p3"), undefined, "un cliente mai contattato non compare");
});

await prova("cancellare un cliente porta via il suo diario, e solo il suo", async (db) => {
  await saveParty(db, { id: "p1", denominazione: "Rossi Impianti S.r.l." });
  await saveParty(db, { id: "p2", denominazione: "Brandi & Figli S.n.c." });
  await saveActivity(db, { partyId: "p1", testo: "sua" });
  await saveActivity(db, { partyId: "p1", testo: "sua, la seconda" });
  await saveActivity(db, { partyId: "p2", testo: "dell'altro" });

  await removeParty(db, "p1");
  assert.equal(await get(db, "parties", "p1"), undefined);
  assert.deepEqual((await list(db, "activities")).map((v) => v.testo), ["dell'altro"],
    "niente voci orfane, e niente conversazioni perse per un cliente che non era quello");
  assert.ok(await get(db, "parties", "p2"));
});

// -----------------------------------------------------------------------------------------------------------------
//  l ' a r c h i v i o
// -----------------------------------------------------------------------------------------------------------------

await prova("l'archivio porta le persone e il diario, e torna identico", async (db) => {
  await saveParty(db, { id: "p1", denominazione: "Rossi Impianti S.r.l.",
                        contatti: [{ nome: "Chiara Rossi", ruolo: "Acquisti" }] });
  await saveActivity(db, { partyId: "p1", tipo: "incontro", data: "2026-09-02", testo: "in officina" });

  const file = JSON.stringify(await collect(db, { app: NAME, schema: VERSION, stores: EXPORTED }));
  assert.ok(JSON.parse(file).data.activities, "lo store del diario è dentro l'esportazione");

  reset();
  const vuoto = await openDatabase();
  const esito = await restore(vuoto, file, { app: NAME, stores: EXPORTED });
  assert.equal(esito.ok, true);
  assert.equal((await get(vuoto, "parties", "p1")).contatti[0].nome, "Chiara Rossi");
  assert.deepEqual((await activitiesOf(vuoto, "p1")).map((v) => v.testo), ["in officina"]);
});

await prova("un archivio di prima del diario si reimporta ancora", async (db) => {
  // Il caso vero: si reimporta il backup della settimana scorsa, che non aveva questo store.
  const vecchio = JSON.stringify({
    format: 1, app: NAME, schema: 1, exported: "2026-09-01T10:00:00.000Z",
    data: { parties: [{ id: "p1", name: "rossi", denominazione: "Rossi Impianti S.r.l." }], docs: [] },
  });
  const esito = await restore(db, vecchio, { app: NAME, stores: EXPORTED });
  assert.equal(esito.ok, true, "quello che il file non contiene non è un motivo per rifiutarlo");
  assert.equal((await get(db, "parties", "p1")).denominazione, "Rossi Impianti S.r.l.");
  assert.deepEqual(await list(db, "activities"), []);
});

console.log(`crm: ${passed} prove passate`);
