// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The rules that cannot be taken back.
//
// The three this file exists for, and each one is a defect that would be found too late:
//
//  - **the counter only goes up.** Deleting a document must not walk it backwards, or next year's
//    numbering overlaps this one;
//  - **two documents cannot share a number.** Tested by forcing it at the data level, not through
//    a screen: a guard that only holds when the interface behaves is not a guard;
//  - **an issued document does not change.** Not its lines, not its totals, not by deletion.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/model.mjs

import assert from "node:assert/strict";

import { openDatabase, documentKey } from "../run/db.js";
import {
  draft, editable, save, issue, reopen, setState, setType, creditNote, convert, convertMany,
  discard, documents, invoicedBy, markExported, nextProgressivo, NUMERAZIONI,
} from "../run/model.js";
import { put, get, list, reset, failOnWrite } from "./fake-store.mjs";

let passed = 0;

async function test(name, fn) {
  reset();
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  f i x t u r e
// -----------------------------------------------------------------------------------------------------------------

const COMPANY = {
  denominazione: "Esempio S.r.l.",
  partitaIva: "01234567897",
  paese: "IT",
  regimeFiscale: "RF01",
  sede: { indirizzo: "Via Prova", numeroCivico: "1", cap: "47899", comune: "Serravalle", provincia: "RN" },
};

const PARTY = {
  denominazione: "Cliente S.p.A.",
  partitaIva: "09876543217",
  codiceDestinatario: "ABCDEFG",
  sede: { indirizzo: "Corso Esempio", numeroCivico: "2", cap: "20100", comune: "Milano", provincia: "MI" },
};

const CONTEXT = { company: COMPANY, party: PARTY };

const LINE = { descrizione: "Progettazione", quantita: "10", prezzoUnitario: "80.00", aliquota: "22" };

function newDoc(fields = {}) {
  return draft({ data: "2026-09-03", righe: [LINE], ...fields });
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   b o z z a
// -----------------------------------------------------------------------------------------------------------------

await test("una bozza nasce senza numero", async () => {
  const doc = newDoc();
  assert.equal(doc.numero, null);
  assert.equal(doc.stato, "bozza");
  assert.equal(editable(doc), true);
  assert.equal(documentKey(doc), undefined);
});

await test("due bozze non si ostacolano, perché nessuna ha un numero", async () => {
  const db = await openDatabase();
  await save(db, newDoc());
  await save(db, newDoc());
  assert.equal((await list(db, "docs")).length, 2);
});

await test("gli id sono diversi anche fra due bozze create nello stesso istante", async () => {
  const ids = new Set(Array.from({ length: 50 }, () => newDoc().id));
  assert.equal(ids.size, 50);
});

// -----------------------------------------------------------------------------------------------------------------
//  l ' e m i s s i o n e
// -----------------------------------------------------------------------------------------------------------------

await test("il numero si assegna emettendo, non creando", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  assert.equal(issued.numero, "2026/0001");
  assert.equal(issued.stato, "emesso");
  assert.equal(editable(issued), false);
});

await test("i numeri salgono di uno, nell'ordine di emissione", async () => {
  const db = await openDatabase();
  const numeri = [];
  for (let i = 0; i < 3; i += 1) {
    numeri.push((await issue(db, await save(db, newDoc()), CONTEXT)).numero);
  }
  assert.deepEqual(numeri, ["2026/0001", "2026/0002", "2026/0003"]);
});

await test("un documento incompleto non ottiene un numero", async () => {
  const db = await openDatabase();
  const rotto = newDoc({ righe: [] });
  await assert.rejects(() => issue(db, rotto, CONTEXT), /non è completo/);
  // E soprattutto: il contatore non si è mosso, quindi il prossimo valido prende il primo numero.
  const ok = await issue(db, await save(db, newDoc()), CONTEXT);
  assert.equal(ok.numero, "2026/0001");
});

await test("l'errore di emissione porta con sé l'elenco dei problemi", async () => {
  const db = await openDatabase();
  try {
    await issue(db, newDoc({ righe: [] }), CONTEXT);
    assert.fail("doveva rifiutare");
  } catch (error) {
    assert.ok(Array.isArray(error.problems));
    assert.ok(error.problems.some((p) => p.campo === "righe"));
  }
});

await test("i totali si congelano al momento dell'emissione", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  // 10 × 80.00 = 800.00, IVA 176.00, totale 976.00
  assert.equal(issued.totali.totale, "97600000000");
  const back = await get(db, "docs", issued.id);
  assert.equal(back.totali.totale, issued.totali.totale);
});

await test("serie e anno hanno contatori separati", async () => {
  const db = await openDatabase();
  const a = await issue(db, await save(db, newDoc({ serie: "A" })), CONTEXT);
  const b = await issue(db, await save(db, newDoc({ serie: "B" })), CONTEXT);
  const c = await issue(db, await save(db, newDoc({ serie: "A" })), CONTEXT);
  assert.deepEqual([a.numero, b.numero, c.numero], ["2026/0001", "2026/0001", "2026/0002"]);
});

await test("l'anno nuovo riparte da uno", async () => {
  const db = await openDatabase();
  const a = await issue(db, await save(db, newDoc({ data: "2026-12-31" })), CONTEXT);
  const b = await issue(db, await save(db, newDoc({ data: "2027-01-02" })), CONTEXT);
  assert.deepEqual([a.numero, b.numero], ["2026/0001", "2027/0001"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   c o n t a t o r e   n o n   t o r n a   i n d i e t r o
// -----------------------------------------------------------------------------------------------------------------

await test("cancellare una bozza non muove il contatore", async () => {
  const db = await openDatabase();
  const primo = await issue(db, await save(db, newDoc()), CONTEXT);
  const bozza = await save(db, newDoc());
  await discard(db, bozza);
  const secondo = await issue(db, await save(db, newDoc()), CONTEXT);
  assert.deepEqual([primo.numero, secondo.numero], ["2026/0001", "2026/0002"]);
});

await test("una fattura emessa non si cancella: si storna", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  await assert.rejects(() => discard(db, issued), /si storna/);
  assert.equal((await list(db, "docs")).length, 1);
});

await test("una fattura emessa non si modifica", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  await assert.rejects(() => save(db, { ...issued, righe: [] }), /non si modifica/);
});

await test("non si emette due volte lo stesso documento", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  await assert.rejects(() => issue(db, issued, CONTEXT), /già stato emesso/);
});

// -----------------------------------------------------------------------------------------------------------------
//  q u a n d o   q u a l c o s a   f a l l i s c e   a   m e t à
// -----------------------------------------------------------------------------------------------------------------

await test("se l'emissione fallisce dopo il contatore, il numero non si perde", async () => {
  // Il difetto che questa prova non poteva nemmeno esprimere finché il finto deposito non ha avuto
  // le transazioni: contatore e documento erano due scritture separate, quindi un errore fra le due
  // lasciava il contatore avanzato e nessun documento con quel numero. Il buco restava per sempre.
  const db = await openDatabase();
  const bozza = await save(db, newDoc());
  failOnWrite(1);                       // il contatore passa, il documento no
  await assert.rejects(() => issue(db, bozza, CONTEXT));
  failOnWrite(null);

  // Niente è rimasto scritto: il contatore è dove era, e la prima fattura buona prende il numero 1.
  assert.equal(await get(db, "counters", "doc||TD01|2026"), undefined);
  const ok = await issue(db, await save(db, newDoc()), CONTEXT);
  assert.equal(ok.numero, "2026/0001");
});

await test("se il ritorno in bozza fallisce a metà, il documento resta emesso e numerato", async () => {
  // L'altro verso, ed era il peggiore: il contatore scendeva, il documento restava emesso, e da
  // lì ogni emissione successiva sbatteva contro l'indice unico. L'app smetteva di emettere.
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  failOnWrite(1);
  await assert.rejects(() => reopen(db, issued));
  failOnWrite(null);

  const ancora = await get(db, "docs", issued.id);
  assert.equal(ancora.stato, "emesso");
  assert.equal(ancora.numero, "2026/0001");
  assert.equal((await get(db, "counters", "doc||TD01|2026")).value, 1);
  // E si può ancora emettere: è la conseguenza che contava.
  assert.equal((await issue(db, await save(db, newDoc()), CONTEXT)).numero, "2026/0002");
});

await test("due emissioni in corsa non ottengono lo stesso numero", async () => {
  // Due schede aperte sullo stesso archivio. Con lettura e scrittura in transazioni separate
  // leggevano entrambe lo stesso valore e scrivevano lo stesso numero.
  const db = await openDatabase();
  const uno = await save(db, newDoc());
  const due = await save(db, newDoc());
  const [a, b] = await Promise.all([issue(db, uno, CONTEXT), issue(db, due, CONTEXT)]);
  assert.notEqual(a.numero, b.numero);
  assert.deepEqual([a.numero, b.numero].sort(), ["2026/0001", "2026/0002"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   n u m e r o   è   u n i c o ,   e   l o   d i c e   i l   d e p o s i t o
// -----------------------------------------------------------------------------------------------------------------

await test("due documenti con lo stesso numero li rifiuta il deposito, non l'interfaccia", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  // Forzato al livello dati, che è l'unico modo di provare una difesa strutturale: un test che
  // passa dai comandi dello schermo prova l'interfaccia, non il vincolo.
  const gemello = { ...issued, id: "un-altro-id" };
  await assert.rejects(() => put(db, "docs", gemello), /esiste già/);
});

await test("la chiave unica tiene conto di serie, tipo e anno", async () => {
  const base = { numero: "2026/0001", data: "2026-09-03", stato: "emesso", tipo: "TD01" };
  assert.notEqual(documentKey(base), documentKey({ ...base, serie: "A" }));
  assert.notEqual(documentKey(base), documentKey({ ...base, tipo: "TD04" }));
  assert.notEqual(documentKey(base), documentKey({ ...base, data: "2027-09-03" }));
  assert.equal(documentKey(base), documentKey({ ...base }));
});

// -----------------------------------------------------------------------------------------------------------------
//  g l i   s t a t i   d o p o   l ' e m i s s i o n e
// -----------------------------------------------------------------------------------------------------------------

await test("scartato e annullato tengono il numero occupato", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  const scartato = await setState(db, issued, "scartato");
  assert.equal(scartato.numero, "2026/0001");
  assert.ok(scartato.chiave);
  // E il successivo prende il numero dopo, non quello lasciato libero.
  const dopo = await issue(db, await save(db, newDoc()), CONTEXT);
  assert.equal(dopo.numero, "2026/0002");
});

await test("una bozza non salta direttamente a inviato", async () => {
  const db = await openDatabase();
  await assert.rejects(() => setState(db, newDoc(), "inviato"), /si chiude emettendola/);
});

await test("setState non riporta in bozza: quella strada è solo di reopen", async () => {
  // Era il buco più largo del modello: `setState(doc, "bozza")` rendeva di nuovo modificabile una
  // fattura emessa, che teneva il numero e usciva dall'indice unico. Da lì si riscrivevano righe e
  // totali di un documento già uscito, e l'emissione successiva gli dava un numero nuovo lasciando
  // il vecchio sparito dalla sequenza. Saltava ogni controllo dell'app con una chiamata.
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  await assert.rejects(() => setState(db, issued, "bozza"), /si usa reopen/);
  const ancora = await get(db, "docs", issued.id);
  assert.equal(ancora.stato, "emesso");
  assert.ok(ancora.chiave, "il documento è uscito dall'indice unico");
});

await test("uno stato inventato è un errore", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  await assert.rejects(() => setState(db, issued, "spedito"), /stato sconosciuto/);
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   s o l a   s t r a d a   i n d i e t r o
// -----------------------------------------------------------------------------------------------------------------

await test("l'ultimo emesso torna bozza, e il contatore scende con lui", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  const back = await reopen(db, issued);
  assert.equal(back.stato, "bozza");
  assert.equal(back.numero, null);
  // Il contatore è tornato a zero, quindi il prossimo riprende lo stesso numero e non ne salta uno.
  const di_nuovo = await issue(db, await save(db, newDoc()), CONTEXT);
  assert.equal(di_nuovo.numero, "2026/0001");
});

await test("segnare l'export non fa uscire il documento dall'indice unico", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  // Ricostruito in memoria senza `chiave`, come farebbe una schermata che tiene il documento in
  // una variabile: markExported deve ricalcolarla, non fidarsi.
  const senzaChiave = { ...issued, chiave: undefined };
  const uscito = await markExported(db, senzaChiave, 1);
  assert.ok(uscito.chiave, "la chiave non è stata ricalcolata");
  const gemello = { ...uscito, id: "un-altro-id" };
  await assert.rejects(() => put(db, "docs", gemello), /esiste già/);
});

await test("un documento il cui XML è uscito non torna indietro", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  const uscito = await markExported(db, issued, 1);
  await assert.rejects(() => reopen(db, uscito), /si storna, non si riapre/);
});

await test("non torna bozza un documento che non è l'ultimo della serie", async () => {
  const db = await openDatabase();
  const primo = await issue(db, await save(db, newDoc()), CONTEXT);
  await issue(db, await save(db, newDoc()), CONTEXT);
  await assert.rejects(() => reopen(db, primo), /lascerebbe un buco/);
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   n o t a   d i   c r e d i t o
// -----------------------------------------------------------------------------------------------------------------

await test("la nota di credito nasce bozza, collegata, e con importi positivi", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  const nota = creditNote(issued);
  assert.equal(nota.tipo, "TD04");
  assert.equal(nota.stato, "bozza");
  assert.deepEqual(nota.fattureCollegate, [{ numero: "2026/0001", data: "2026-09-03" }]);
  // Positivi: TD04 dice da sé che cos'è, e importi negativi sono un file scartato.
  assert.equal(nota.righe[0].quantita, "10");
  assert.equal(nota.righe[0].prezzoUnitario, "80.00");
});

await test("la nota di credito prende un numero della sua serie", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  const nota = await issue(db, await save(db, creditNote(issued)), CONTEXT);
  // Contatore separato per tipo: la nota è la prima del suo, la fattura resta la prima del suo.
  assert.equal(nota.numero, "2026/0001");
  assert.equal(nota.tipo, "TD04");
  assert.notEqual(documentKey(nota), documentKey(issued));
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   p r o g r e s s i v o   d i   t r a s m i s s i o n e
// -----------------------------------------------------------------------------------------------------------------

// -----------------------------------------------------------------------------------------------------------------
//  l a   f o r m a   d e l   n u m e r o
// -----------------------------------------------------------------------------------------------------------------

await test("le tre forme del numero escono come dice l'esempio", async () => {
  const forme = [["anno", "2026/0001"], ["progressivo", "0001"], ["semplice", "1"]];
  for (const [formatoNumero, atteso] of forme) {
    // Deposito nuovo a ogni giro: il contatore è per serie, tipo e anno, e senza svuotarlo il
    // secondo formato uscirebbe col numero due — cioè la prova direbbe di no per il motivo sbagliato.
    reset();
    // eslint-disable-next-line no-await-in-loop
    const db = await openDatabase();
    // eslint-disable-next-line no-await-in-loop
    const doc = await issue(db, await save(db, newDoc()), {
      ...CONTEXT, company: { ...COMPANY, formatoNumero },
    });
    assert.equal(doc.numero, atteso, formatoNumero);
  }
});

await test("l'esempio nel menù è quello che il formato produce davvero", () => {
  // La voce del menù mostra l'esempio invece del nome della regola: «2026/0012» dice come esce il
  // numero, «progressivo con anno» no. Questo lega l'etichetta al codice, così non possono
  // divergere — e un'etichetta che promette una forma diversa da quella vera è peggio di nessuna.
  for (const [chiave, forma] of Object.entries(NUMERAZIONI)) {
    assert.equal(forma.scrivi(12, 2026), forma.esempio, chiave);
  }
});

await test("un formato sconosciuto, o nessuno, ricade su quello storico", async () => {
  const db = await openDatabase();
  const doc = await issue(db, await save(db, newDoc()), {
    ...CONTEXT, company: { ...COMPANY, formatoNumero: "inventato" },
  });
  assert.equal(doc.numero, "2026/0001");
});

await test("cambiare forma non riscrive quello che è già uscito", async () => {
  // Il numero si congela all'emissione ed è un dato del documento come la data: chi passa da
  // «2026/0012» a «13» trova il vecchio ancora scritto com'era.
  const db = await openDatabase();
  const primo = await issue(db, await save(db, newDoc()), CONTEXT);
  assert.equal(primo.numero, "2026/0001");
  const secondo = await issue(db, await save(db, newDoc()), {
    ...CONTEXT, company: { ...COMPANY, formatoNumero: "semplice" },
  });
  assert.equal(secondo.numero, "2");
  assert.equal((await get(db, "docs", primo.id)).numero, "2026/0001");
});

await test("si torna in bozza anche con un numero senza anno", async () => {
  // `reopen` legge il progressivo dal numero: con «12» invece di «2026/0012» deve funzionare
  // uguale, o la via del ritorno esisterebbe per una forma sola.
  const db = await openDatabase();
  const doc = await issue(db, await save(db, newDoc()), {
    ...CONTEXT, company: { ...COMPANY, formatoNumero: "semplice" },
  });
  assert.equal(doc.numero, "1");
  const bozza = await reopen(db, doc);
  assert.equal(bozza.numero, null);
  const dopo = await issue(db, await save(db, bozza), {
    ...CONTEXT, company: { ...COMPANY, formatoNumero: "semplice" },
  });
  assert.equal(dopo.numero, "1");
});

await test("il progressivo riparte dal numero dichiarato in anagrafica", async () => {
  // Chi arriva da un altro programma è già a 54: ripartire da uno vorrebbe dire riusare progressivi
  // già spesi, e il Sistema di Interscambio li rifiuta come duplicati.
  const db = await openDatabase();
  assert.equal(await nextProgressivo(db, { da: 55 }), 55);
  assert.equal(await nextProgressivo(db, { da: 55 }), 56);
});

await test("il progressivo si sposta in avanti, mai indietro", async () => {
  const db = await openDatabase();
  assert.equal(await nextProgressivo(db), 1);
  assert.equal(await nextProgressivo(db), 2);
  // Una correzione al rialzo si può fare in qualunque momento.
  assert.equal(await nextProgressivo(db, { da: 100 }), 100);
  // Una al ribasso non fa niente: un numero già uscito è uscito, e il contatore resta l'autorità.
  assert.equal(await nextProgressivo(db, { da: 5 }), 101);
});

await test("un campo vuoto o sciocco vale come non scritto", async () => {
  const db = await openDatabase();
  for (const da of ["", null, undefined, 0, -3, "ciao"]) {
    // eslint-disable-next-line no-await-in-loop
    assert.ok((await nextProgressivo(db, { da })) >= 1);
  }
});

await test("il progressivo di trasmissione è un contatore a parte, e sale sempre", async () => {
  const db = await openDatabase();
  assert.equal(await nextProgressivo(db), 1);
  assert.equal(await nextProgressivo(db), 2);
  // Non c'entra con i numeri di documento: dopo due file, la prima fattura è ancora la 0001.
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  assert.equal(issued.numero, "2026/0001");
  assert.equal(await nextProgressivo(db), 3);
});

await test("i documenti tornano dal più recente", async () => {
  const db = await openDatabase();
  await save(db, newDoc({ data: "2026-01-10" }));
  await save(db, newDoc({ data: "2026-09-03" }));
  await save(db, newDoc({ data: "2026-05-20" }));
  const date = (await documents(db)).map((d) => d.data);
  assert.deepEqual(date, ["2026-09-03", "2026-05-20", "2026-01-10"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   t i p o ,   e   l a   s e r i e   c h e   l o   s e g u e
// -----------------------------------------------------------------------------------------------------------------

await test("la serie viene dal tipo, e non si scrive a mano", async () => {
  assert.equal(newDoc().serie, "");
  assert.equal(newDoc({ tipo: "preventivo" }).serie, "PR");
  assert.equal(newDoc({ tipo: "ddt" }).serie, "DDT");
  // Chi la dichiara la tiene: serve all'importazione di un archivio scritto da un'altra versione.
  assert.equal(newDoc({ tipo: "preventivo", serie: "OFF" }).serie, "OFF");
});

await test("cambiare tipo cambia la serie, quindi la sequenza del numero", async () => {
  const db = await openDatabase();
  const doc = newDoc();
  setType(doc, "preventivo");
  assert.equal(doc.serie, "PR");
  doc.validoFino = "2026-10-04";
  const issued = await issue(db, await save(db, doc), CONTEXT);
  assert.equal(issued.numero, "2026/0001");
  // Il contatore del preventivo è suo: la prima fattura resta la prima.
  const fattura = await issue(db, await save(db, newDoc()), CONTEXT);
  assert.equal(fattura.numero, "2026/0001");
  assert.notEqual(documentKey(issued), documentKey(fattura));
});

await test("un documento emesso non cambia tipo", async () => {
  const db = await openDatabase();
  const issued = await issue(db, await save(db, newDoc()), CONTEXT);
  assert.throws(() => setType(issued, "preventivo"), /non cambia tipo/);
});

await test("un tipo inventato viene rifiutato invece di produrre una serie vuota", async () => {
  assert.throws(() => setType(newDoc(), "TD06"), /tipo sconosciuto/);
});

// -----------------------------------------------------------------------------------------------------------------
//  g l i   s t a t i   a p p a r t e n g o n o   a l   t i p o
// -----------------------------------------------------------------------------------------------------------------

await test("un preventivo si rifiuta, una fattura si scarta, e non viceversa", async () => {
  const db = await openDatabase();
  const preventivo = await issue(db, await save(db, newDoc({
    tipo: "preventivo", validoFino: "2026-10-04",
  })), CONTEXT);
  const rifiutato = await setState(db, preventivo, "rifiutato");
  assert.equal(rifiutato.stato, "rifiutato");
  // «Scartato» vuol dire che il Sistema di Interscambio ha respinto un file, e di un preventivo non
  // c'è nessun file: offrirlo qui sarebbe offrire una parola che non descrive niente.
  await assert.rejects(setState(db, preventivo, "scartato"), /non appartiene a questo tipo/);

  const fattura = await issue(db, await save(db, newDoc()), CONTEXT);
  await assert.rejects(setState(db, fattura, "rifiutato"), /non appartiene a questo tipo/);
  assert.equal((await setState(db, fattura, "scartato")).stato, "scartato");
});

await test("un documento di trasporto si consegna, e nient'altro", async () => {
  const db = await openDatabase();
  const ddt = await issue(db, await save(db, newDoc({
    tipo: "ddt", trasporto: { causale: "Vendita" },
  })), CONTEXT);
  assert.equal((await setState(db, ddt, "consegnato")).stato, "consegnato");
  await assert.rejects(setState(db, ddt, "accettato"), /non appartiene a questo tipo/);
});

await test("tornare a «emesso» resta permesso a tutti", async () => {
  // «L'ho segnato inviato per sbaglio» è una cosa normale, e non toglie niente a nessuno.
  const db = await openDatabase();
  const doc = await issue(db, await save(db, newDoc()), CONTEXT);
  const inviato = await setState(db, doc, "inviato");
  assert.equal((await setState(db, inviato, "emesso")).stato, "emesso");
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   c o n v e r s i o n e
// -----------------------------------------------------------------------------------------------------------------

await test("un preventivo emesso diventa una bozza di fattura, col riferimento", async () => {
  const db = await openDatabase();
  const preventivo = await issue(db, await save(db, newDoc({
    tipo: "preventivo",
    validoFino: "2026-10-04",
    scontoDocumento: { percentuale: "10" },
    pagamento: { condizioni: "TP02", modalita: "MP05", rate: [{ scadenza: "2026-10-31" }] },
  })), CONTEXT);

  const fattura = convert(preventivo);
  assert.equal(fattura.tipo, "TD01");
  assert.equal(fattura.stato, "bozza");
  assert.equal(fattura.numero, null);
  assert.equal(fattura.serie, "");
  // Quello che era stato concordato attraversa; quello che era stato deciso sul preventivo no.
  assert.deepEqual(fattura.righe, preventivo.righe);
  assert.deepEqual(fattura.scontoDocumento, { percentuale: "10" });
  assert.deepEqual(fattura.pagamento.rate, [{ scadenza: "2026-10-31" }]);
  assert.deepEqual(fattura.daPreventivo, {
    numero: "PR 2026/0001", data: "2026-09-03", id: preventivo.id,
  });
  assert.equal(fattura.validoFino, undefined);
});

await test("le righe e le rate sono copiate, non condivise", async () => {
  const db = await openDatabase();
  const preventivo = await issue(db, await save(db, newDoc({
    tipo: "preventivo",
    validoFino: "2026-10-04",
    pagamento: { condizioni: "TP02", rate: [{ scadenza: "2026-10-31" }] },
  })), CONTEXT);

  const fattura = convert(preventivo);
  fattura.righe[0].prezzoUnitario = "90.00";
  fattura.pagamento.rate[0].scadenza = "2026-11-30";
  // Se gli array fossero condivisi, ritoccare la fattura riscriverebbe il preventivo già emesso —
  // cioè un documento che per definizione non si modifica più.
  assert.equal(preventivo.righe[0].prezzoUnitario, "80.00");
  assert.equal(preventivo.pagamento.rate[0].scadenza, "2026-10-31");
});

await test("un documento di trasporto diventa una fattura differita che lo nomina", async () => {
  const db = await openDatabase();
  const ddt = await issue(db, await save(db, newDoc({
    tipo: "ddt", trasporto: { causale: "Vendita", colli: "3" },
  })), CONTEXT);

  const fattura = convert(ddt);
  assert.equal(fattura.tipo, "TD24");
  // Il riferimento finisce nell'XML come DatiDDT: è quello che lega la fattura alla merce partita.
  // L'`id` accanto resta qui — `fatturapa.js` scrive solo numero e data — e serve a sapere quali
  // consegne sono già state fatturate senza scrivere niente sul documento di trasporto.
  assert.deepEqual(fattura.ddt, [{ numero: "DDT 2026/0001", data: "2026-09-03", id: ddt.id }]);
  assert.equal(fattura.daPreventivo, undefined);
  assert.equal(fattura.trasporto, undefined);
});

await test("una bozza e una fattura non si convertono", async () => {
  const db = await openDatabase();
  const bozza = await save(db, newDoc({ tipo: "preventivo", validoFino: "2026-10-04" }));
  assert.throws(() => convert(bozza), /non si converte/);
  const fattura = await issue(db, await save(db, newDoc()), CONTEXT);
  assert.throws(() => convert(fattura), /non si converte/);
});

// -----------------------------------------------------------------------------------------------------------------
//  p i ù   d o c u m e n t i   d i   t r a s p o r t o ,   u n a   f a t t u r a
// -----------------------------------------------------------------------------------------------------------------

/** Un DDT emesso, con una riga sua e una data sua. */
async function ddtEmesso(db, { data, descrizione }) {
  return issue(db, await save(db, newDoc({
    tipo: "ddt",
    data,
    partyId: "p1",
    trasporto: { causale: "Vendita" },
    righe: [{ ...LINE, descrizione }],
  })), CONTEXT);
}

await test("tre consegne dello stesso cliente diventano una fattura differita sola", async () => {
  const db = await openDatabase();
  const a = await ddtEmesso(db, { data: "2026-09-03", descrizione: "Prima consegna" });
  const b = await ddtEmesso(db, { data: "2026-09-10", descrizione: "Seconda consegna" });
  const c = await ddtEmesso(db, { data: "2026-09-17", descrizione: "Terza consegna" });

  const fattura = convertMany([c, a, b]);
  assert.equal(fattura.tipo, "TD24");
  // In ordine di data, non nell'ordine in cui sono stati passati: è l'ordine in cui la merce è
  // uscita, ed è quello in cui il cliente ha i propri documenti.
  assert.deepEqual(fattura.righe.map((r) => r.descrizione),
    ["Prima consegna", "Seconda consegna", "Terza consegna"]);
  assert.deepEqual(fattura.ddt.map((r) => r.numero),
    ["DDT 2026/0001", "DDT 2026/0002", "DDT 2026/0003"]);
});

await test("documenti di clienti diversi non finiscono nella stessa fattura", async () => {
  const db = await openDatabase();
  const a = await ddtEmesso(db, { data: "2026-09-03", descrizione: "Consegna" });
  const altro = await issue(db, await save(db, newDoc({
    tipo: "ddt", data: "2026-09-04", partyId: "p2", trasporto: { causale: "Vendita" },
  })), CONTEXT);
  assert.throws(() => convertMany([a, altro]), /clienti diversi/);
});

await test("due preventivi non si uniscono, perché ognuno ha il suo sconto", async () => {
  const db = await openDatabase();
  const uno = await issue(db, await save(db, newDoc({
    tipo: "preventivo", validoFino: "2026-10-04", scontoDocumento: { percentuale: "10" },
  })), CONTEXT);
  const due = await issue(db, await save(db, newDoc({
    tipo: "preventivo", data: "2026-09-04", validoFino: "2026-10-04",
    scontoDocumento: { percentuale: "5" },
  })), CONTEXT);
  assert.throws(() => convertMany([uno, due]), /uno alla volta/);
});

await test("un elenco vuoto non produce una fattura vuota", async () => {
  assert.throws(() => convertMany([]), /niente da convertire/);
});

await test("una consegna già fatturata risulta tale, e torna libera se la bozza sparisce", async () => {
  const db = await openDatabase();
  const a = await ddtEmesso(db, { data: "2026-09-03", descrizione: "Consegna" });
  const b = await ddtEmesso(db, { data: "2026-09-10", descrizione: "Altra consegna" });

  const fattura = await save(db, convertMany([a, b]));
  const fatturati = invoicedBy(await documents(db));
  assert.equal(fatturati.get(a.id).id, fattura.id);
  assert.equal(fatturati.get(b.id).id, fattura.id);

  // **Ed è il motivo per cui è derivato invece che scritto sul documento di trasporto.** Buttata
  // via la bozza, nessuno li nomina più: tornano fatturabili da sé, senza niente da disfare.
  await discard(db, fattura);
  assert.equal(invoicedBy(await documents(db)).size, 0);
});

await test("un preventivo convertito risulta fatturato dalla bozza che ne è nata", async () => {
  const db = await openDatabase();
  const preventivo = await issue(db, await save(db, newDoc({
    tipo: "preventivo", validoFino: "2026-10-04",
  })), CONTEXT);
  const fattura = await save(db, convert(preventivo));
  assert.equal(invoicedBy(await documents(db)).get(preventivo.id).id, fattura.id);
});

await test("un preventivo non si storna con una nota di credito", async () => {
  const db = await openDatabase();
  const preventivo = await issue(db, await save(db, newDoc({
    tipo: "preventivo", validoFino: "2026-10-04",
  })), CONTEXT);
  assert.throws(() => creditNote(preventivo), /documento fiscale/);
});

console.log(`model: ${passed} prove passate`);
