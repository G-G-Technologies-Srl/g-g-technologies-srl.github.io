// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The validator's messages, in both languages, as sentences.
//
// **This is the test the old design could not have.** The messages used to be Italian written inline
// in `validate.js` — so `_check_i18n`, which compares the two dictionaries, had nothing to compare,
// and an English reader who left a field blank was told about it in Italian. Nothing failed. Now the
// messages are keys, and a key that exists in one language and not the other, or a key nobody wired
// up, or a `{placeholder}` nobody filled, all stop here.
//
// The coverage check runs both ways on purpose, and the second direction is the one that catches the
// slow mistake: a message declared in the dictionary and reachable from no branch of `validate.js`
// is a message somebody wrote for a check that was never finished.
//
//     node --import ./test/loader.mjs test/problems.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// `setLang` writes the language onto the document and saves the preference. Two stubs, because the
// alternative is a fake i18n — and a harness that replaces the thing under test proves nothing.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { documentElement: { setAttribute() {} } };

const { setLang, t } = await import("../run/i18n.js");
const { describe, field } = await import("../run/problems.js");
const { validate } = await import("../run/validate.js");
const { SM_EXPORT } = await import("../run/fatturapa.js");

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

const RIGA = { descrizione: "Progettazione", quantita: "10", prezzoUnitario: "80.00", aliquota: "22" };
const DOC = { tipo: "TD01", data: "2026-09-03", numero: "2026/0001", righe: [RIGA] };
const ctx = { company: COMPANY, party: PARTY };

// Un'azienda sammarinese: è l'unico caso in cui il codice TM entra nel file, quindi l'unico in cui
// i controlli che lo riguardano possono scattare.
const AZIENDA_SM = {
  denominazione: "Titano Meccanica S.A.",
  partitaIva: "29141",
  paese: "SM",
  regimeFiscale: "RF01",
  sede: { indirizzo: "Strada dei Censiti", cap: "47891", comune: "Serravalle", provincia: "SM" },
};
const CTX_SM = { company: AZIENDA_SM, party: PARTY };

// La stessa azienda, verso un cliente sammarinese: è la direzione interna, con regole tutte sue.
const CTX_INTERNA = {
  company: AZIENDA_SM,
  party: {
    denominazione: "Bottega del Titano S.r.l.",
    partitaIva: "13579",
    paese: "SM",
    sede: { indirizzo: "Via Cinque Vie", cap: "47890", comune: "San Marino" },
  },
};

/**
 * Un caso per ogni ramo di `validate.js`, messi insieme.
 *
 * Sono documenti rotti di proposito: quello che conta non è quale problema esce da quale, ma che
 * l'unione tocchi ogni messaggio che il file sa produrre.
 */
const CASI = [
  [{}, { company: null, party: null }],
  [{ ...DOC, tipo: "TD06" }, ctx],
  [{ ...DOC, data: "ieri" }, ctx],
  [{ ...DOC, numero: null }, ctx],
  [{ ...DOC, numero: "X".repeat(21) }, ctx],
  [{ ...DOC, causale: "C".repeat(201) }, ctx],
  [{ ...DOC, righe: [] }, ctx],
  [{ ...DOC, righe: [{ ...RIGA, descrizione: "", unitaMisura: "U".repeat(11) }] }, ctx],
  [{ ...DOC, righe: [{ ...RIGA, aliquota: undefined }] }, ctx],
  [{ ...DOC, righe: [{ ...RIGA, aliquota: "0" }] }, ctx],
  [{ ...DOC, righe: [{ ...RIGA, natura: "N4" }] }, ctx],
  // L'inversione contabile ora è una natura ammessa: il caso «fuori elenco» è un codice inventato.
  [{ ...DOC, righe: [{ ...RIGA, aliquota: "0", natura: "N9" }] }, ctx],
  // Un'azienda sammarinese con la provincia sbagliata: il consiglio dice «SM», non «RN».
  [DOC, { ...ctx, company: { ...COMPANY, paese: "SM", sede: { ...COMPANY.sede, provincia: "RSM" } } }],
  [{ ...DOC, righe: [{ ...RIGA, prezzoUnitario: "" }] }, ctx],
  [{ ...DOC, righe: [{ ...RIGA, sconto: { importo: "5", percentuale: "10" } }] }, ctx],
  [DOC, { ...ctx, party: { ...PARTY, denominazione: "A".repeat(81) } }],
  [DOC, { ...ctx, party: { ...PARTY, partitaIva: "09876543271" } }],
  [DOC, { ...ctx, party: { ...PARTY, codiceFiscale: "NONVALIDO" } }],
  [DOC, { ...ctx, party: { ...PARTY, partitaIva: null, codiceFiscale: null } }],
  [DOC, { ...ctx, party: { ...PARTY, sede: { ...PARTY.sede, cap: "201", provincia: "MIL" } } }],
  [DOC, { ...ctx, party: { denominazione: "", partitaIva: "09876543217", sede: {} } }],
  // L'unico caso in cui il numero c'è già: è l'export che lo chiede, non l'emissione.
  [{ ...DOC, numero: "X".repeat(21) }, { ...ctx, richiedeNumero: false }],
  [DOC, { ...ctx, party: { ...PARTY, codiceDestinatario: "ABC" } }],
  [DOC, { ...ctx, company: { ...COMPANY, regimeFiscale: "RF02" } }],
  [{ ...DOC, tipo: "TD04" }, ctx],
  [{ ...DOC, tipo: "preventivo", validoFino: null }, ctx],
  [{ ...DOC, tipo: "preventivo", validoFino: "2026-01-01" }, ctx],
  [{ ...DOC, tipo: "ddt" }, ctx],
  [{ ...DOC, ritenuta: { tipo: "RT99", aliquota: "20" } }, ctx],
  // The withholding with a blank rate, a reason outside the list, and only excluded lines under it.
  [{ ...DOC, ritenuta: { tipo: "RT01", aliquota: "", causale: "Q9" } }, ctx],
  [{ ...DOC, righe: [{ ...RIGA, aliquota: "0", natura: "N1" }], ritenuta: { tipo: "RT01", aliquota: "20" } }, ctx],
  // A deferred invoice with no delivery note, on the Italian channel.
  [{ ...DOC, tipo: "TD24" }, ctx],
  // A document discount above 100%.
  [{ ...DOC, scontoDocumento: { percentuale: "150" } }, ctx],
  // A self-billed invoice to a supplier known only by its tax code.
  [{ ...DOC, tipo: "TD29" }, { ...ctx, party: { ...PARTY, partitaIva: null, codiceFiscale: "RSSMRA85T10A562S" } }],
  // The integrations: a TD16 to a foreign supplier, a TD17 to an Italian one, a TD18 from outside
  // the EU, N6 left on a line, a TD16 naming nothing, and one dated before the invoice it integrates.
  [{ ...DOC, tipo: "TD16", fattureCollegate: [{ numero: "F1", data: "2026-09-01" }] },
    { ...ctx, party: { ...PARTY, paese: "DE", sede: { ...PARTY.sede, provincia: "" } } }],
  [{ ...DOC, tipo: "TD17" }, ctx],
  [{ ...DOC, tipo: "TD18" }, { ...ctx, party: { ...PARTY, paese: "US", sede: { ...PARTY.sede, provincia: "" } } }],
  [{ ...DOC, tipo: "TD16", righe: [{ ...RIGA, aliquota: "0", natura: "N6.7" }] }, ctx],
  [{ ...DOC, tipo: "TD16", fattureCollegate: [{ numero: "F1", data: "2026-09-10" }] }, ctx],
  // A REA with the office and no number.
  [DOC, { ...ctx, company: { ...COMPANY, rea: { ufficio: "RN", numero: "" } } }],
  // A date after today, when issuing.
  [{ ...DOC, data: "2099-01-01" }, { ...ctx, richiedeNumero: false, oggi: "2026-10-14" }],
  // A public administration with a seven-character code.
  [DOC, { ...ctx, party: { ...PARTY, pa: true } }],
  // CIG and CUP without an order number, and both malformed.
  [{ ...DOC, ordine: { cig: "123", cup: "ABC" } }, ctx],
  // A pension contribution of an unknown fund, with a blank rate, and one without VAT and nature.
  [{ ...DOC, cassa: { tipo: "TC99", aliquota: "" } }, ctx],
  [{ ...DOC, cassa: { tipo: "TC22", aliquota: "4", aliquotaIva: "0" } }, ctx],
  // Split payment with a withholding, and on a flat-rate issuer.
  [{ ...DOC, esigibilita: "S", ritenuta: { tipo: "RT01", aliquota: "20", causale: "A" } }, ctx],
  [{ ...DOC, esigibilita: "S", righe: [{ ...RIGA, aliquota: "0", natura: "N2.2" }] },
    { ...ctx, company: { ...COMPANY, regimeFiscale: "RF19" } }],
  // A flat-rate issuer with VAT on a line, and with the wrong nature.
  [DOC, { ...ctx, company: { ...COMPANY, regimeFiscale: "RF19" } }],
  [{ ...DOC, righe: [{ ...RIGA, aliquota: "0", natura: "N4" }] }, { ...ctx, company: { ...COMPANY, regimeFiscale: "RF19" } }],
  // Split payment and the pension contribution off the Italian channel.
  [{ ...DOC, esigibilita: "S", righe: [{ ...RIGA, aliquota: "0", natura: "N3.1", tm: "3" }] }, CTX_SM],
  [{ ...DOC, pagamento: { condizioni: "TP09", modalita: "MP99", iban: "non-un-iban" } }, ctx],
  [{ ...DOC, pagamento: { rate: [{ scadenza: "domani" }] } }, ctx],
  [{ ...DOC, pagamento: { rate: [{ importo: "1.00" }, { importo: "2.00" }] } }, ctx],
  [{ ...DOC, totaleDichiarato: "999.00" }, ctx],
  // I tre casi del codice dell'Ufficio Tributario, che valgono solo per un emittente sammarinese.
  [{ ...DOC, righe: [{ ...RIGA, tm: "T".repeat(61) }] }, ctx],
  [{
    ...DOC,
    righe: [
      { ...RIGA, aliquota: "0", natura: "N3.1", tm: "3" },
      { ...RIGA, aliquota: "0", natura: "N3.1", tm: "4" },
    ],
  }, CTX_SM],
  [{ ...DOC, righe: [{ ...RIGA, aliquota: "0", natura: "N3.3", tm: "X".repeat(60) }] }, CTX_SM],
  // Il codice fuori elenco: inerte finché l'Ufficio Tributario non pubblica i valori, quindi la
  // prova passa un profilo che ne dichiara alcuni. È il modo di provare adesso un controllo che
  // comincerà a esistere quando arriverà l'elenco vero.
  [{ ...DOC, righe: [{ ...RIGA, aliquota: "0", natura: "N3.1", tm: "9" }] }, {
    ...CTX_SM,
    profile: { ...SM_EXPORT, codiciTm: ["1", "2", "3"] },
  }],
  // La spunta della variazione contrattuale su una fattura, e il marcatore «non rimborsabile» su un
  // canale dove i rimborsi non esistono.
  [{ ...DOC, variazioniContrattuali: true }, ctx],
  [{ ...DOC, righe: [{ ...RIGA, nonRimborsabile: true }] }, ctx],
  // Il tipo cessione dove un rimborso non può esistere, e un codice fuori elenco dove può.
  [{ ...DOC, righe: [{ ...RIGA, aliquota: "0", natura: "N4", tm: "3" }], tipoCessione: "10",
    ddt: [{ numero: "D1", data: "2026-08-01" }] }, CTX_INTERNA],
  [{ ...DOC, righe: [{ ...RIGA, aliquota: "0", natura: "N4", tm: "1" }], tipoCessione: "99",
    ddt: [{ numero: "D1", data: "2026-08-01" }] }, CTX_INTERNA],
  // I casi delle direzioni: l'interna con l'IVA esposta, il conto lavoro con imposta, un tipo che
  // il canale non accetta, una nota datata prima della fattura, un riepilogo che si annulla.
  [{ ...DOC, righe: [{ ...RIGA, tm: "4" }], ddt: [{ numero: "D1", data: "2026-08-01" }] }, CTX_INTERNA],
  [{ ...DOC, righe: [{ ...RIGA, tm: "3" }] }, CTX_SM],
  // Un DDT scritto a mano e lasciato a metà, e due DDT che non dicono quali righe hanno portato.
  [{ ...DOC, righe: [{ ...RIGA, aliquota: "0", natura: "N4", tm: "4" }],
    ddt: [{ numero: "", data: "20/08/2026" }] }, CTX_INTERNA],
  [{ ...DOC, righe: [{ ...RIGA, aliquota: "0", natura: "N4", tm: "4" }],
    ddt: [{ numero: "D1", data: "2026-08-01" }, { numero: "D2", data: "2026-08-02" }] }, CTX_INTERNA],
  [{ ...DOC, tipo: "TD29", righe: [{ ...RIGA, aliquota: "0", natura: "N3.1", tm: "3" }] }, CTX_SM],
  // An intermediary's COE that is not a COE, on the internal channel where it is used.
  [{ ...DOC, righe: [{ ...RIGA, aliquota: "0", natura: "N4", tm: "3" }] },
    { ...CTX_INTERNA, company: { ...AZIENDA_SM, coeIntermediario: "studio rossi" } }],
  [{
    ...DOC,
    tipo: "TD04",
    data: "2026-07-01",
    fattureCollegate: [{ numero: "2026/0002", data: "2026-08-01" }],
  }, ctx],
  [{
    ...DOC,
    righe: [
      { ...RIGA, aliquota: "0", natura: "N3.1", tm: "3", prezzoUnitario: "80.00" },
      { ...RIGA, aliquota: "0", natura: "N3.1", tm: "3", prezzoUnitario: "-80.00" },
    ],
  }, CTX_SM],
];

const TUTTI = CASI.flatMap(([doc, context]) => validate(doc, context));

// -----------------------------------------------------------------------------------------------------------------
//  o g n i   c h i a v e   e s i s t e ,   i n   t u t t ' e   d u e   l e   l i n g u e
// -----------------------------------------------------------------------------------------------------------------

test("i casi coprono almeno una trentina di problemi diversi", () => {
  // Se questo numero cala, è perché un ramo ha smesso di scattare e i controlli sotto non se ne
  // accorgerebbero: verificherebbero benissimo un insieme più piccolo.
  const chiavi = new Set(TUTTI.map((p) => `${p.regola}|${p.cosaFare}`));
  assert.ok(chiavi.size >= 30, `solo ${chiavi.size} messaggi distinti`);
});

for (const lingua of ["it", "en"]) {
  test(`in ${lingua} nessun messaggio resta una chiave`, () => {
    setLang(lingua);
    for (const p of TUTTI) {
      // `t` restituisce la chiave quando non la conosce: è il modo in cui una chiave assente si
      // vede, e qui è il modo in cui fallisce.
      assert.notEqual(t(p.regola), p.regola, `${lingua}: manca «${p.regola}»`);
      assert.notEqual(t(p.cosaFare), p.cosaFare, `${lingua}: manca «${p.cosaFare}»`);
    }
  });

  test(`in ${lingua} ogni riga è una frase, e nessun segnaposto resta vuoto`, () => {
    setLang(lingua);
    for (const riga of describe(TUTTI)) {
      assert.match(riga, /[.!]$/, `${lingua}: non finisce come una frase — ${riga}`);
      assert.ok(!riga.includes("{"), `${lingua}: segnaposto non riempito — ${riga}`);
      assert.ok(!riga.includes("undefined"), `${lingua}: valore mancante — ${riga}`);
    }
  });

  test(`in ${lingua} ogni segmento del campo ha una parola`, () => {
    setLang(lingua);
    for (const p of TUTTI) {
      const reso = field(p.campo);
      // Un segmento senza etichetta ricadrebbe sul nome interno, che è sempre in italiano e senza
      // spazi: `codiceDestinatario` invece di «recipient code».
      for (const parola of reso.split(" · ")) {
        assert.ok(!/^[a-z]+[A-Z]/.test(parola),
          `${lingua}: «${parola}» è il nome interno del campo, non una parola — da ${p.campo}`);
      }
    }
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  n i e n t e   c h i a v i   s c r i t t e   e   m a i   u s a t e
// -----------------------------------------------------------------------------------------------------------------

test("ogni messaggio del dizionario è raggiungibile da un controllo", () => {
  const sorgente = readFileSync(new URL("../run/i18n.js", import.meta.url), "utf8");
  const dichiarate = new Set(sorgente.split("const EN =")[0].match(/^ {2}(v[A-Z]\w*):/gm)
    .map((riga) => riga.trim().replace(":", "")));
  const usate = new Set(TUTTI.flatMap((p) => [p.regola, p.cosaFare]));
  const orfane = [...dichiarate].filter((chiave) => !usate.has(chiave));
  assert.deepEqual(orfane, [], `messaggi che nessun controllo produce: ${orfane.join(", ")}`);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   c a m m i n o   d e l   c a m p o
// -----------------------------------------------------------------------------------------------------------------

test("un cammino diventa parole, con l'indice accanto al nome", () => {
  setLang("it");
  assert.equal(field("cliente.sede.cap"), "il cliente · sede · CAP");
  assert.equal(field("righe[2].descrizione"), "righe 2 · descrizione");
  assert.equal(field("pagamento.rate[1].scadenza"), "pagamento · rate 1 · scadenza");
});

test("in inglese il cammino cambia parole, non forma", () => {
  setLang("en");
  assert.equal(field("cliente.sede.cap"), "the customer · address · postcode");
  assert.equal(field("righe[2].descrizione"), "lines 2 · description");
});

test("un segmento che l'app non conosce passa com'è scritto", () => {
  // Un archivio importato può portare un campo che questa versione non ha mai visto: mostrarne il
  // nome interno è più utile che nascondere l'unico indizio su dove sia il problema.
  setLang("it");
  assert.equal(field("inventato"), "inventato");
});

setLang("it");
console.log(`problems: ${passed} prove passate`);
