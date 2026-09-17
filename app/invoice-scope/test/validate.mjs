// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The checks, and what they say when they fire.
//
// Two things are tested here, and the second is unusual: that a wrong document is caught, and that
// **the message names a field and says what to do**. A validator whose messages are useless is a
// validator people learn to click through, so the wording is part of the behaviour and not
// decoration on top of it.
//
// The other rule under test: a document with three mistakes reports three problems. Revealing one
// error per attempt turns a two-minute correction into six rounds.
//
//     node app/invoice-scope/test/validate.mjs

import assert from "node:assert/strict";

import { validate, esportabile, NATURE, TIPI_FISCALI } from "../run/validate.js";
import { build } from "../run/fatturapa.js";
import { describe } from "../run/problems.js";

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  f i x t u r e
// -----------------------------------------------------------------------------------------------------------------

// Invented parties whose VAT numbers are formally valid — check digit included — and belong to
// nobody. A fixture with a real fiscal number in it is the mistake the plan warns about.
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

const DOC = {
  tipo: "TD01",
  data: "2026-09-03",
  numero: "2026/000123",
  righe: [{ descrizione: "Progettazione", quantita: "10", prezzoUnitario: "80.00", aliquota: "22" }],
};

const context = { company: COMPANY, party: PARTY };
const check = (doc, ctx = context) => validate(doc, ctx);
const campi = (doc, ctx = context) => check(doc, ctx).map((p) => p.campo);

// I problemi resi in italiano, che è come li legge chi corregge. `validate.js` restituisce chiavi;
// dove qui si controlla una parola, si controlla la frase che ne esce — così la prova dice anche che
// la chiave esiste, invece di confrontare due nomi di chiave fra loro.
const reso = (doc, ctx = context) => describe(check(doc, ctx));

// -----------------------------------------------------------------------------------------------------------------
//  i l   d o c u m e n t o   g i u s t o   p a s s a
// -----------------------------------------------------------------------------------------------------------------

test("una fattura completa non ha problemi", () => {
  assert.deepEqual(check(DOC), []);
  assert.equal(esportabile(DOC, context), true);
});

test("una fattura senza codice destinatario passa lo stesso", () => {
  // 0000000 è una forma legittima: la fattura arriva nel cassetto fiscale.
  const senza = { ...PARTY, codiceDestinatario: null };
  assert.deepEqual(check(DOC, { ...context, party: senza }), []);
});

test("un cliente estero non deve avere CAP e provincia italiani", () => {
  const estero = {
    ...PARTY, paese: "DE", codiceDestinatario: null, partitaIva: null, codiceFiscale: null,
    sede: { indirizzo: "Musterstrasse", numeroCivico: "3", comune: "Berlin" },
  };
  // Manca l'identificativo, che è l'unico problema atteso: CAP e provincia non lo sono.
  assert.deepEqual(campi(DOC, { ...context, party: estero }), ["cliente.partitaIva"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  n a t u r a   e   a l i q u o t a
// -----------------------------------------------------------------------------------------------------------------

test("aliquota zero senza natura è un errore", () => {
  const doc = { ...DOC, righe: [{ descrizione: "Merce", quantita: "1", prezzoUnitario: "100", aliquota: "0" }] };
  assert.deepEqual(campi(doc), ["righe[1].natura"]);
});

test("natura su una riga con IVA è l'altro errore, quello che si dimentica", () => {
  const doc = { ...DOC, righe: [{ descrizione: "Merce", quantita: "1", prezzoUnitario: "100", aliquota: "22", natura: "N4" }] };
  const problemi = check(doc);
  assert.deepEqual(problemi.map((p) => p.campo), ["righe[1].natura"]);
  assert.match(reso(doc)[0], /non va indicata/);
});

test("aliquota zero con natura passa", () => {
  const doc = { ...DOC, righe: [{ descrizione: "Merce", quantita: "1", prezzoUnitario: "100", aliquota: "0", natura: "N3.1" }] };
  assert.deepEqual(check(doc), []);
});

test("una natura che il tracciato non conosce è rifiutata, e la lista è nel messaggio", () => {
  // L'elenco ora è quello intero del tracciato — inversione contabile compresa, che prima era fra i
  // «casi rimandati» e lasciava un edile senza modo di fatturare un subappalto. Quello che resta
  // fuori è un codice inventato.
  const doc = { ...DOC, righe: [{ descrizione: "Merce", quantita: "1", prezzoUnitario: "100", aliquota: "0", natura: "N9" }] };
  const problemi = check(doc);
  assert.equal(problemi.length, 1);
  const riga = reso(doc)[0];
  for (const natura of ["N1", "N3.1", "N6.3", "N7"]) assert.ok(riga.includes(natura), natura);
});

test("l'inversione contabile è una natura come le altre", () => {
  const doc = { ...DOC, righe: [{ descrizione: "Subappalto", quantita: "1", prezzoUnitario: "100", aliquota: "0", natura: "N6.3" }] };
  assert.deepEqual(campi(doc), []);
});

test("l'aliquota mancante è un errore, e non trascina un secondo errore sulla natura", () => {
  const doc = { ...DOC, righe: [{ descrizione: "Merce", quantita: "1", prezzoUnitario: "100" }] };
  assert.deepEqual(campi(doc), ["righe[1].aliquota"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   p a r t i
// -----------------------------------------------------------------------------------------------------------------

test("una partita IVA con due cifre scambiate viene presa", () => {
  // Il motivo per cui il controllo non è sulla sola lunghezza: undici cifre le ha anche.
  const storta = { ...PARTY, partitaIva: "09876543271" };
  const problemi = check(DOC, { ...context, party: storta });
  assert.deepEqual(problemi.map((p) => p.campo), ["cliente.partitaIva"]);
  assert.match(reso(DOC, { ...context, party: storta })[0], /trasposte/);
});

test("un cliente senza alcun identificativo è un errore", () => {
  const anonimo = { ...PARTY, partitaIva: null, codiceFiscale: null };
  assert.deepEqual(campi(DOC, { ...context, party: anonimo }), ["cliente.partitaIva"]);
});

test("un privato con il solo codice fiscale va bene", () => {
  const privato = {
    denominazione: null, nome: "Mario", cognome: "Rossi",
    codiceFiscale: "RSSMRA80A01H501U", codiceDestinatario: "0000000",
    sede: { indirizzo: "Via Roma", numeroCivico: "1", cap: "00100", comune: "Roma", provincia: "RM" },
  };
  assert.deepEqual(check(DOC, { ...context, party: privato }), []);
});

test("una ragione sociale troppo lunga dice quanto è lunga", () => {
  const lungo = { ...PARTY, denominazione: "A".repeat(81) };
  const problemi = check(DOC, { ...context, party: lungo });
  assert.deepEqual(problemi.map((p) => p.campo), ["cliente.denominazione"]);
  assert.match(reso(DOC, { ...context, party: lungo })[0], /81 caratteri/);
});

test("un CAP di quattro cifre è un errore, e il messaggio spiega il caso estero", () => {
  const corto = { ...PARTY, sede: { ...PARTY.sede, cap: "2010" } };
  const problemi = check(DOC, { ...context, party: corto });
  assert.deepEqual(problemi.map((p) => p.campo), ["cliente.sede.cap"]);
  assert.match(reso(DOC, { ...context, party: corto })[0], /00000/);
});

test("l'azienda che emette è controllata come il cliente", () => {
  const rotta = { ...COMPANY, partitaIva: "12345", sede: { ...COMPANY.sede, comune: "" } };
  const trovati = campi(DOC, { ...context, company: rotta });
  assert.ok(trovati.includes("azienda.partitaIva"));
  assert.ok(trovati.includes("azienda.sede.comune"));
});

test("un regime fiscale fuori dal sottoinsieme è rifiutato", () => {
  const rf = { ...COMPANY, regimeFiscale: "RF02" };
  assert.deepEqual(campi(DOC, { ...context, company: rf }), ["azienda.regimeFiscale"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  t e s t a t a
// -----------------------------------------------------------------------------------------------------------------

test("un tipo documento fuori dal sottoinsieme dice quali ci sono", () => {
  const problemi = check({ ...DOC, tipo: "TD06" });
  // Solo il campo `tipo`: un tipo sconosciuto ricade sul profilo della fattura, che è il più
  // severo, quindi il resto del documento continua a passare i controlli invece di sbriciolarsi.
  assert.deepEqual(problemi.map((p) => p.campo), ["tipo"]);
  const riga = reso({ ...DOC, tipo: "TD06" })[0];
  for (const tipo of TIPI_FISCALI) assert.ok(riga.includes(tipo));
});

test("la data vuole la forma AAAA-MM-GG", () => {
  for (const data of ["03/09/2026", "2026-9-3", "", null, "ieri"]) {
    assert.deepEqual(campi({ ...DOC, data }), ["data"], `accettata: ${data}`);
  }
});

test("il numero manca finché il documento è una bozza, e il messaggio lo dice", () => {
  const problemi = check({ ...DOC, numero: null });
  assert.deepEqual(problemi.map((p) => p.campo), ["numero"]);
  assert.match(reso({ ...DOC, numero: null })[0], /bozza/);
});

test("chi sta per emettere non deve avere già il numero", () => {
  // Il numero lo assegna l'emissione. Chiederlo anche lì rendeva impossibile emettere, ed è il
  // difetto che il test del modello ha tirato fuori: l'unico punto che distribuisce numeri
  // rifiutava ogni documento perché non ne aveva uno.
  const bozza = { ...DOC, numero: null };
  assert.deepEqual(campi(bozza), ["numero"]);
  assert.deepEqual(check(bozza, { ...context, richiedeNumero: false }), []);
});

test("un numero troppo lungo resta un errore anche in emissione", () => {
  const lungo = { ...DOC, numero: "2026/".padEnd(30, "0") };
  assert.deepEqual(campi(lungo, { ...context, richiedeNumero: false }), ["numero"]);
});

test("un documento senza righe non è esportabile", () => {
  assert.deepEqual(campi({ ...DOC, righe: [] }), ["righe"]);
  assert.equal(esportabile({ ...DOC, righe: [] }, context), false);
});

test("una nota di credito deve dire che cosa storna", () => {
  const nota = { ...DOC, tipo: "TD04" };
  assert.deepEqual(campi(nota), ["fattureCollegate"]);
  const collegata = { ...nota, fattureCollegate: [{ numero: "2026/000100", data: "2026-08-01" }] };
  assert.deepEqual(check(collegata), []);
});

// -----------------------------------------------------------------------------------------------------------------
//  p a g a m e n t o
// -----------------------------------------------------------------------------------------------------------------

test("un IBAN storto viene preso", () => {
  const doc = { ...DOC, pagamento: { condizioni: "TP02", modalita: "MP05", iban: "IT60 X05428 QUALCOSA!" } };
  assert.deepEqual(campi(doc), ["pagamento.iban"]);
});

test("un IBAN con gli spazi va bene", () => {
  const doc = { ...DOC, pagamento: { iban: "IT60 X054 2811 1010 0000 0123 456" } };
  assert.deepEqual(check(doc), []);
});

test("modalità e condizioni fuori dal sottoinsieme sono rifiutate", () => {
  assert.deepEqual(campi({ ...DOC, pagamento: { modalita: "MP02" } }), ["pagamento.modalita"]);
  assert.deepEqual(campi({ ...DOC, pagamento: { condizioni: "TP03" } }), ["pagamento.condizioni"]);
});

test("la scadenza di una rata vuole la stessa forma della data", () => {
  const doc = { ...DOC, pagamento: { rate: [{ scadenza: "03/10/2026" }] } };
  assert.deepEqual(campi(doc), ["pagamento.rate[1].scadenza"]);
});

test("le rate devono sommare al totale", () => {
  // Non lo controllava nessuno, e un campione nostro chiedeva ottanta centesimi più della fattura:
  // un errore che non viene scartato da nessuno e che si discute con il cliente.
  const doc = { ...DOC, pagamento: { rate: [
    { scadenza: "2026-10-03", importo: "500.00" },
    { scadenza: "2026-11-03", importo: "500.00" },
  ] } };
  const problemi = check(doc);
  assert.deepEqual(problemi.map((p) => p.campo), ["pagamento.rate"]);
  assert.match(reso(doc)[0], /976\.00/);
});

test("rate che sommano al totale vanno bene", () => {
  const doc = { ...DOC, pagamento: { rate: [
    { scadenza: "2026-10-03", importo: "500.00" },
    { scadenza: "2026-11-03", importo: "476.00" },
  ] } };
  assert.deepEqual(check(doc), []);
});

test("una rata senza importo non viene contestata: la calcola l'app", () => {
  const doc = { ...DOC, pagamento: { rate: [
    { scadenza: "2026-10-03", importo: "500.00" },
    { scadenza: "2026-11-03" },
  ] } };
  assert.deepEqual(check(doc), []);
});

// -----------------------------------------------------------------------------------------------------------------
//  i   t o t a l i   d i c h i a r a t i
// -----------------------------------------------------------------------------------------------------------------

test("un totale dichiarato che non torna viene corretto nel messaggio", () => {
  const doc = { ...DOC, totaleDichiarato: "999.00" };
  const problemi = check(doc);
  assert.deepEqual(problemi.map((p) => p.campo), ["totale"]);
  assert.match(reso(doc)[0], /976\.00/);
});

test("un documento che i totali li calcola da sé non ha niente da confrontare", () => {
  assert.deepEqual(check(DOC), []);
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   f o r m a   d e i   m e s s a g g i
// -----------------------------------------------------------------------------------------------------------------

test("tre errori danno tre problemi, non il primo", () => {
  const rotto = { tipo: "TD99", data: "ieri", numero: null, righe: [] };
  const problemi = check(rotto);
  assert.ok(problemi.length >= 4, `trovati solo ${problemi.length}`);
  assert.ok(problemi.map((p) => p.campo).includes("tipo"));
  assert.ok(problemi.map((p) => p.campo).includes("data"));
  assert.ok(problemi.map((p) => p.campo).includes("righe"));
});

test("ogni problema ha campo, regola e cosa fare, e nessuno è vuoto", () => {
  const rotto = { tipo: "TD99", data: "", numero: "", righe: [{ descrizione: "", aliquota: "22", natura: "N4" }] };
  const problemi = validate(rotto, { company: { partitaIva: "1" }, party: null });
  assert.ok(problemi.length > 0);
  for (const p of problemi) {
    assert.ok(p.campo && p.campo.trim(), "campo vuoto");
    // Le tre parti adesso sono chiavi. Che esistano davvero nelle due lingue, e che finiscano come
    // frasi, lo verifica `test/problems.mjs`: qui basta che ci siano tutte e tre.
    assert.ok(p.regola && p.regola.trim(), `regola vuota su ${p.campo}`);
    assert.ok(p.cosaFare && p.cosaFare.trim(), `manca cosa fare su ${p.campo}`);
    assert.ok(p.valori && typeof p.valori === "object", `valori mancanti su ${p.campo}`);
  }
});

test("i messaggi si leggono in riga, come li legge chi corregge", () => {
  const righe = describe(check({ ...DOC, data: "ieri" }));
  assert.deepEqual(righe.length, 1);
  assert.match(righe[0], /^data: deve essere nella forma AAAA-MM-GG\. /);
});

test("un documento senza cliente non esplode, lo dice", () => {
  const problemi = validate(DOC, { company: COMPANY, party: null });
  assert.ok(problemi.some((p) => p.campo === "cliente"));
});

// -----------------------------------------------------------------------------------------------------------------
//  i   d o c u m e n t i   c h e   n o n   d i v e n t a n o   u n   f i l e
// -----------------------------------------------------------------------------------------------------------------

// Un cliente appena raccolto al telefono: c'è il nome, e basta. È il caso per cui il preventivo
// esiste, e nella prima stesura era esattamente quello che l'app rifiutava.
const NUOVO = { denominazione: "Contatto S.r.l." };

const PREVENTIVO = {
  tipo: "preventivo",
  data: "2026-09-04",
  numero: "2026/0001",
  validoFino: "2026-10-04",
  righe: [{ descrizione: "Progettazione", quantita: "10", prezzoUnitario: "80.00", aliquota: "22" }],
};

test("un preventivo passa anche a un cliente di cui si sa il nome e nulla più", () => {
  assert.deepEqual(validate(PREVENTIVO, { company: COMPANY, party: NUOVO }), []);
});

test("la stessa fattura allo stesso cliente elenca quello che manca", () => {
  const campi_ = validate({ ...PREVENTIVO, tipo: "TD01" }, { company: COMPANY, party: NUOVO })
    .map((p) => p.campo);
  // Partita IVA, indirizzo, comune, CAP e provincia: il preventivo li aspetta, la fattura no.
  assert.ok(campi_.includes("cliente.partitaIva"));
  assert.ok(campi_.includes("cliente.sede.indirizzo"));
  assert.ok(campi_.includes("cliente.sede.cap"));
  assert.ok(campi_.includes("cliente.sede.provincia"));
});

test("un preventivo senza validità viene fermato, e il messaggio dice perché", () => {
  const problemi = validate({ ...PREVENTIVO, validoFino: null }, { company: COMPANY, party: NUOVO });
  assert.deepEqual(problemi.map((p) => p.campo), ["validoFino"]);
  assert.match(describe(problemi)[0], /scadenza/);
});

test("una validità prima della data del documento è un errore di battitura", () => {
  const problemi = validate({ ...PREVENTIVO, validoFino: "2026-08-04" },
    { company: COMPANY, party: NUOVO });
  assert.deepEqual(problemi.map((p) => p.campo), ["validoFino"]);
});

test("la validità non riguarda gli altri tipi", () => {
  // Una fattura non ha una data di validità, e chiederla la renderebbe impossibile da emettere.
  assert.deepEqual(validate({ ...DOC, validoFino: null }, context), []);
});

test("un documento di trasporto vuole la causale del trasporto", () => {
  const ddt = { ...PREVENTIVO, tipo: "ddt", validoFino: null };
  const problemi = validate(ddt, { company: COMPANY, party: NUOVO });
  assert.deepEqual(problemi.map((p) => p.campo), ["trasporto.causale"]);
  const pieno = { ...ddt, trasporto: { causale: "Vendita" } };
  assert.deepEqual(validate(pieno, { company: COMPANY, party: NUOVO }), []);
});

test("un preventivo completo non è comunque esportabile", () => {
  // La risposta è no, e non perché abbia dei problemi: non esiste un file che possa diventare.
  assert.deepEqual(validate(PREVENTIVO, { company: COMPANY, party: NUOVO }), []);
  assert.equal(esportabile(PREVENTIVO, { company: COMPANY, party: NUOVO }), false);
});

test("il codice destinatario non si chiede a un preventivo", () => {
  // `destinatario()` scrive 0000000 quando manca, che è di sette caratteri e passerebbe comunque.
  // Ma un cliente estero senza codice riceve XXXXXXX, e la regola non ha senso su un documento che
  // non viene trasmesso a nessuno.
  const estero = { denominazione: "Beispiel GmbH", paese: "DE" };
  assert.deepEqual(validate(PREVENTIVO, { company: COMPANY, party: estero }), []);
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   s e i   d i r e z i o n i
// -----------------------------------------------------------------------------------------------------------------

// Un'azienda sammarinese e due clienti: uno in Repubblica, uno in Germania.
const SM = {
  denominazione: "Titano Meccanica S.A.",
  partitaIva: "24680",
  paese: "SM",
  regimeFiscale: "RF01",
  sede: { indirizzo: "Strada dei Censiti", cap: "47891", comune: "Serravalle", provincia: "SM" },
};
const SM_CLIENTE = {
  denominazione: "Bottega del Titano S.r.l.",
  partitaIva: "13579",
  paese: "SM",
  sede: { indirizzo: "Via Cinque Vie", cap: "47890", comune: "San Marino", provincia: "SM" },
};
const UE_CLIENTE = {
  denominazione: "Beispiel GmbH",
  partitaIva: "DE123456789",
  paese: "DE",
  sede: { indirizzo: "Musterstrasse", cap: "10115", comune: "Berlin" },
};

/** Una fattura interna ben fatta: aliquota zero, natura N4, tipo merce, e il DDT che ne consegue. */
const INTERNA = {
  ...DOC,
  righe: [{ descrizione: "Ricambi", quantita: "2", prezzoUnitario: "100.00", aliquota: "0", natura: "N4", tm: "4" }],
  ddt: [{ numero: "DDT 2026/0001", data: "2026-08-20" }],
};

test("una fattura interna sammarinese fatta bene non ha problemi", () => {
  assert.deepEqual(validate(INTERNA, { company: SM, party: SM_CLIENTE }), []);
});

test("nell'interna l'aliquota è sempre zero e la natura è N4", () => {
  const conIva = {
    ...INTERNA,
    righe: [{ descrizione: "Ricambi", quantita: "2", prezzoUnitario: "100.00", aliquota: "22", tm: "4" }],
  };
  const problemi = validate(conIva, { company: SM, party: SM_CLIENTE }).map((p) => p.campo);
  assert.ok(problemi.includes("righe[1].aliquota"), "ha accettato il 22%");
  // La stessa riga verso l'Italia è invece legittima: l'esportazione può portare IVA prepagata.
  const verso = validate({ ...conIva, ddt: INTERNA.ddt }, { company: SM, party: PARTY })
    .map((p) => p.campo);
  assert.ok(!verso.includes("righe[1].aliquota"), "ha rifiutato l'IVA in esportazione");
});

test("la natura che il canale non ammette viene detta per nome", () => {
  const sbagliata = {
    ...INTERNA,
    righe: [{ ...INTERNA.righe[0], natura: "N3.1" }],
  };
  const frasi = describe(validate(sbagliata, { company: SM, party: SM_CLIENTE }));
  assert.ok(frasi.some((f) => f.includes("N4")), frasi.join(" | "));
});

test("il tipo merce è obbligatorio dove c'è un importo, e non dove non c'è", () => {
  const senza = { ...INTERNA, righe: [{ ...INTERNA.righe[0], tm: undefined }] };
  assert.ok(validate(senza, { company: SM, party: SM_CLIENTE }).map((p) => p.campo)
    .includes("righe[1].tm"));
  // Una riga a importo zero — un titolo di sezione — non ha una merce da classificare.
  const titolo = {
    ...INTERNA,
    righe: [INTERNA.righe[0], { descrizione: "Sezione", quantita: "1", prezzoUnitario: "0", aliquota: "0", natura: "N4" }],
  };
  assert.ok(!validate(titolo, { company: SM, party: SM_CLIENTE }).map((p) => p.campo)
    .includes("righe[2].tm"));
  // E in Italia non si chiede affatto.
  assert.deepEqual(validate(DOC, context), []);
});

test("una fattura non mescola gruppi di tipo merce", () => {
  const mista = {
    ...INTERNA,
    righe: [
      { descrizione: "Ricambi", quantita: "1", prezzoUnitario: "100.00", aliquota: "0", natura: "N4", tm: "4" },
      { descrizione: "Lavorazione", quantita: "1", prezzoUnitario: "100.00", aliquota: "0", natura: "N4", tm: "3" },
    ],
  };
  assert.ok(validate(mista, { company: SM, party: SM_CLIENTE }).map((p) => p.campo)
    .includes("righe.tm"), "ha lasciato passare beni e servizi insieme");
  // Beni con beni invece sta in piedi: 1, 4 e 7 sono lo stesso gruppo.
  const beni = {
    ...INTERNA,
    righe: [
      { descrizione: "Materie prime", quantita: "1", prezzoUnitario: "100.00", aliquota: "0", natura: "N4", tm: "1" },
      { descrizione: "Attrezzatura", quantita: "1", prezzoUnitario: "100.00", aliquota: "0", natura: "N4", tm: "7" },
    ],
  };
  assert.deepEqual(validate(beni, { company: SM, party: SM_CLIENTE }), []);
});

test("il DDT è obbligatorio per i tipi merce che lo prevedono", () => {
  const senzaDdt = { ...INTERNA, ddt: [] };
  assert.ok(validate(senzaDdt, { company: SM, party: SM_CLIENTE }).map((p) => p.campo)
    .includes("ddt"), "ha lasciato passare beni senza documento di trasporto");
  // Il tipo merce 3 — servizi senza materie prime — ne fa a meno.
  const servizi = {
    ...INTERNA,
    ddt: [],
    righe: [{ descrizione: "Consulenza", quantita: "1", prezzoUnitario: "500.00", aliquota: "0", natura: "N4", tm: "3" }],
  };
  assert.deepEqual(validate(servizi, { company: SM, party: SM_CLIENTE }), []);
  // E una nota di credito non ha merce che viaggia: rettifica una fattura che il DDT ce l'aveva.
  const nota = {
    ...INTERNA,
    tipo: "TD04",
    ddt: [],
    fattureCollegate: [{ numero: "2026/000100", data: "2026-08-01" }],
  };
  assert.deepEqual(validate(nota, { company: SM, party: SM_CLIENTE }), []);
});

test("verso un paese diverso dall'Italia la fattura si emette, ma non diventa un file", () => {
  // **Trovato provando sui dati veri.** Il controllo diceva «verso questo paese non esiste la
  // fattura elettronica» come se fosse un difetto del documento, e `issue()` si rifiutava di
  // numerarlo: l'app non riusciva più a fatturare a un cliente tedesco. Ma quella fattura è
  // legittima — si stampa — e il «no» riguarda il file, non il documento. Sta dove sta quello del
  // preventivo: in `esportabile`.
  const doc = { ...INTERNA, ddt: [], righe: [{ ...INTERNA.righe[0], natura: "N3.1", tm: "3" }] };
  assert.deepEqual(validate(doc, { company: SM, party: UE_CLIENTE }), []);
  assert.equal(esportabile(doc, { company: SM, party: UE_CLIENTE }), false);
  // Lo stesso documento verso l'Italia il file ce l'ha.
  assert.equal(esportabile(doc, { company: SM, party: PARTY }), true);
  // Dall'Italia verso lo stesso cliente, invece, il file c'è ed è quello di sempre.
  assert.deepEqual(validate({ ...DOC, righe: [{ descrizione: "X", quantita: "1", prezzoUnitario: "10", aliquota: "0", natura: "N3.2" }] },
    { company: COMPANY, party: UE_CLIENTE }), []);
});

test("un tipo che il canale non accetta viene fermato prima di uscire", () => {
  // `TD29` è l'autofattura dell'interna: verso l'Italia quel codice non passa.
  const auto = {
    ...INTERNA,
    tipo: "TD29",
    serie: "AF",
    righe: [{ descrizione: "Fornitura non fatturata", quantita: "1", prezzoUnitario: "500.00", aliquota: "0", natura: "N3.1", tm: "3" }],
    ddt: [],
    fattureCollegate: [],
  };
  assert.ok(validate(auto, { company: SM, party: PARTY }).map((p) => p.campo).includes("tipo"));
  // All'interno invece è proprio il documento che l'articolo 7 impone al cliente.
  const dentro = { ...auto, righe: [{ ...auto.righe[0], natura: "N4" }] };
  assert.deepEqual(validate(dentro, { company: SM, party: SM_CLIENTE }), []);
});

test("una differita da San Marino esce come TD01, e il controllo guarda quel codice", () => {
  const differita = { ...INTERNA, tipo: "TD24" };
  // `TD24` non è fra i codici ammessi da nessuno dei due canali sammarinesi, ma il documento esce
  // come `TD01`: il controllo legge quello che finisce nel file.
  assert.deepEqual(validate(differita, { company: SM, party: SM_CLIENTE }), []);
  assert.deepEqual(validate({ ...differita, righe: [{ ...INTERNA.righe[0], natura: "N3.1" }] },
    { company: SM, party: PARTY }), []);
});

test("una nota non può essere datata prima della fattura che rettifica", () => {
  const nota = {
    ...INTERNA,
    tipo: "TD04",
    data: "2026-07-01",
    ddt: [],
    fattureCollegate: [{ numero: "2026/000100", data: "2026-08-01" }],
  };
  assert.ok(validate(nota, { company: SM, party: SM_CLIENTE }).map((p) => p.campo)
    .includes("fattureCollegate[1].data"));
});

test("una nota di debito chiede anch'essa che cosa rettifica", () => {
  const nd = { ...DOC, tipo: "TD05", serie: "ND" };
  assert.ok(validate(nd, context).map((p) => p.campo).includes("fattureCollegate"));
});

test("il regime fiscale sammarinese è uno solo", () => {
  const forfettario = { ...SM, regimeFiscale: "RF19" };
  assert.ok(validate(INTERNA, { company: forfettario, party: SM_CLIENTE })
    .map((p) => p.campo).includes("azienda.regimeFiscale"));
  // In Italia il forfettario esiste, e passa.
  assert.deepEqual(validate(DOC, { company: { ...COMPANY, regimeFiscale: "RF19" }, party: PARTY }), []);
});

test("un riepilogo che si annulla da solo non esce verso San Marino", () => {
  const annullato = {
    ...INTERNA,
    righe: [
      { descrizione: "Ricambi", quantita: "1", prezzoUnitario: "100.00", aliquota: "0", natura: "N4", tm: "4" },
      { descrizione: "Sconto", quantita: "1", prezzoUnitario: "-100.00", aliquota: "0", natura: "N4", tm: "4" },
    ],
  };
  assert.ok(validate(annullato, { company: SM, party: SM_CLIENTE }).map((p) => p.campo)
    .includes("riepiloghi[1].imponibile"));
});

test("il tipo cessione vale solo dove un rimborso monofase può esistere", () => {
  // Il manuale dell'Ufficio Tributario lo lega ai tipi merce 1 e 2: «per i rimborsi FE-RSM sono
  // rilevanti solo TM:1 e TM:2». Su una fattura di servizi il codice non produce niente.
  const servizi = {
    ...INTERNA,
    ddt: [],
    righe: [{ ...INTERNA.righe[0], tm: "3" }],
    tipoCessione: "10",
  };
  assert.ok(validate(servizi, { company: SM, party: SM_CLIENTE }).map((p) => p.campo)
    .includes("tipoCessione"));

  // Con materie prime invece è al suo posto.
  const materie = { ...INTERNA, righe: [{ ...INTERNA.righe[0], tm: "1" }], tipoCessione: "10" };
  assert.deepEqual(validate(materie, { company: SM, party: SM_CLIENTE }), []);

  // Un codice fuori elenco viene detto per nome.
  const inventato = { ...materie, tipoCessione: "99" };
  const frasi = describe(validate(inventato, { company: SM, party: SM_CLIENTE }));
  assert.ok(frasi.some((f) => f.includes("99")), frasi.join(" | "));

  // E in esportazione il codice non si scrive: lì i rimborsi si inseriscono a mano su TribWeb.
  const verso = { ...materie, righe: [{ ...materie.righe[0], natura: "N3.1" }] };
  assert.ok(validate(verso, { company: SM, party: PARTY }).map((p) => p.campo)
    .includes("tipoCessione"));
});

test("il codice del tipo cessione esce come una causale sua", () => {
  const materie = { ...INTERNA, righe: [{ ...INTERNA.righe[0], tm: "1" }], tipoCessione: "10",
    causale: "Fornitura di luglio" };
  const { text } = build(materie, { company: SM, party: SM_CLIENTE });
  // Due elementi e non una stringa cucita: lo schema ne ammette quanti se ne vuole, e la
  // descrizione resta leggibile accanto al codice invece di romperlo.
  assert.match(text, /<Causale>TC:10<\/Causale>/);
  assert.match(text, /<Causale>Fornitura di luglio<\/Causale>/);
  assert.ok(text.indexOf("TC:10") < text.indexOf("Fornitura di luglio"), "il codice viene prima");
});

test("una nota per variazioni contrattuali non nomina nessuna fattura, e lo dichiara", () => {
  // I due documenti sammarinesi chiedono la causale e **l'omissione** di DatiFattureCollegate: è
  // l'unica nota che non rettifica un documento, perché dipende da un contratto già in essere.
  // Con il riferimento addosso, che è il caso vero: la nota nasce da una fattura — `creditNote()`
  // lo scrive — e poi qualcuno spunta «variazione contrattuale». Il dato resta, il file no.
  const nota = {
    ...INTERNA,
    tipo: "TD04",
    ddt: [],
    fattureCollegate: [{ numero: "2026/000100", data: "2026-08-01" }],
    variazioniContrattuali: true,
  };
  assert.deepEqual(validate(nota, { company: SM, party: SM_CLIENTE }), []);
  const { text } = build(nota, { company: SM, party: SM_CLIENTE });
  assert.match(text, /<Causale>VariazioniContrattuali<\/Causale>/);
  assert.ok(!text.includes("DatiFattureCollegate"), "il riferimento non deve finire nel file");

  // Il riferimento però resta scritto sul documento: togliendo la spunta torna, e allora il file
  // lo porta di nuovo.
  const conRiferimento = { ...nota, variazioniContrattuali: undefined };
  assert.deepEqual(validate(conRiferimento, { company: SM, party: SM_CLIENTE }), []);
  assert.ok(build(conRiferimento, { company: SM, party: SM_CLIENTE }).text.includes("DatiFattureCollegate"));

  // Su una fattura la spunta non significa niente.
  assert.ok(validate({ ...INTERNA, variazioniContrattuali: true }, { company: SM, party: SM_CLIENTE })
    .map((p) => p.campo).includes("variazioniContrattuali"));
});

test("una riga fuori dal rimborso monofase si marca, e solo dove i rimborsi esistono", () => {
  const dentro = {
    ...INTERNA,
    righe: [{ ...INTERNA.righe[0], tm: "1", nonRimborsabile: true }],
  };
  assert.deepEqual(validate(dentro, { company: SM, party: SM_CLIENTE }), []);
  const { text } = build(dentro, { company: SM, party: SM_CLIENTE });
  // Un blocco a sé, senza valore accanto: è la presenza a dire tutto.
  assert.match(text, /<AltriDatiGestionali>\s*<TipoDato>NONRIMB<\/TipoDato>\s*<\/AltriDatiGestionali>/);
  // E il tipo merce resta nel suo blocco, davanti.
  assert.ok(text.indexOf("<TipoDato>TM</TipoDato>") < text.indexOf("<TipoDato>NONRIMB</TipoDato>"));

  // In esportazione i rimborsi si inseriscono a mano: lì il marcatore non lo legge nessuno.
  const verso = { ...dentro, righe: [{ ...dentro.righe[0], natura: "N3.1" }] };
  assert.ok(validate(verso, { company: SM, party: PARTY }).map((p) => p.campo)
    .includes("righe[1].nonRimborsabile"));
  assert.ok(!build(verso, { company: SM, party: PARTY }).text.includes("NONRIMB"));
});

console.log(`validate: ${passed} prove passate`);
