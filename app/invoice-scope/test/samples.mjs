// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The sample invoices, written out as files so a real validator can read them.
//
// This is the bridge between the tests that run in Node and the one check Node cannot make: an
// XSD validation against the official schema. The cases here are the ones worth putting in front
// of it — the plain invoice, the two rates, the exempt one with the stamp, the credit note, the
// export to San Marino, the eight-decimal quantity, the ampersand.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/samples.mjs
//     sh app/invoice-scope/test/xsd.sh               # validates them
//
// Il loader serve da quando i messaggi dei controlli sono chiavi tradotte: `problems.js` le rende
// in italiano passando dal dizionario, che sta sotto `gg/`. È il prezzo di avere un messaggio
// leggibile invece di un nome di chiave nel momento in cui un documento di prova smette di valere.
//
// `test/out/` is disposable and rebuilt at every run: nothing is kept in the repository, because
// a generated file that is committed is a file that will disagree with its generator.

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "../run/fatturapa.js";
import { validate } from "../run/validate.js";
import { describe } from "../run/problems.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");

// -----------------------------------------------------------------------------------------------------------------
//  f i x t u r e
// -----------------------------------------------------------------------------------------------------------------

// Invented parties. The VAT numbers are formally valid — check digit and all — and belong to
// nobody: the plan forbids real fiscal data in the examples, and the first draft of a fixture file
// always has somebody's real number in it.
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

// Il cliente sammarinese, con CAP e provincia veri: erano assenti perché l'app trattava San Marino
// come estero e ci scriveva `00000`. Il COE va senza la sigla del paese davanti — quella la porta
// già `IdPaese` — e questo campione la aveva, cioè insegnava la forma sbagliata.
const SAN_MARINO = {
  denominazione: "Titano S.r.l.",
  partitaIva: "12345",
  paese: "SM",
  sede: {
    indirizzo: "Via del Titano", numeroCivico: "4", cap: "47890",
    comune: "Citta di San Marino", provincia: "SM",
  },
};

const BASE = { tipo: "TD01", data: "2026-09-03", progressivo: 1 };

const CASES = [
  {
    name: "01-semplice",
    doc: {
      ...BASE, numero: "2026/000001",
      righe: [{ descrizione: "Progettazione", quantita: "10", unitaMisura: "ora", prezzoUnitario: "80.00", aliquota: "22" }],
      pagamento: { condizioni: "TP02", modalita: "MP05", iban: "IT60X0542811101000000123456", rate: [{ scadenza: "2026-10-03" }] },
    },
  },
  {
    name: "02-due-aliquote",
    doc: {
      ...BASE, numero: "2026/000002", progressivo: 2,
      righe: [
        { descrizione: "Consulenza", quantita: "3", unitaMisura: "gg", prezzoUnitario: "81.30", aliquota: "22" },
        { descrizione: "Manuale", quantita: "2", unitaMisura: "pz", prezzoUnitario: "25.00", aliquota: "4" },
      ],
    },
  },
  {
    name: "03-esente-con-bollo",
    doc: {
      ...BASE, numero: "2026/000003", progressivo: 3, bollo: true,
      righe: [{ descrizione: "Prestazione esente", quantita: "1", prezzoUnitario: "500.00", aliquota: "0", natura: "N4" }],
    },
  },
  {
    name: "04-nota-di-credito",
    doc: {
      ...BASE, tipo: "TD04", numero: "2026/NC0001", progressivo: 4,
      fattureCollegate: [{ numero: "2026/000001", data: "2026-09-03" }],
      righe: [{ descrizione: "Storno progettazione", quantita: "2", unitaMisura: "ora", prezzoUnitario: "80.00", aliquota: "22" }],
    },
  },
  {
    name: "05-san-marino",
    party: SAN_MARINO,
    doc: {
      ...BASE, numero: "2026/000005", progressivo: 5,
      righe: [{ descrizione: "Fornitura apparati", quantita: "1", prezzoUnitario: "1500.00", aliquota: "0", natura: "N3.3" }],
    },
  },
  {
    name: "06-otto-decimali",
    doc: {
      ...BASE, numero: "2026/000006", progressivo: 6,
      righe: [{ descrizione: "Energia", quantita: "1234.56789", unitaMisura: "kWh", prezzoUnitario: "0.08745", aliquota: "22" }],
    },
  },
  {
    name: "07-ampersand-e-ritenuta",
    company: { ...COMPANY, denominazione: "Rossi & Bianchi S.r.l." },
    doc: {
      ...BASE, numero: "2026/000007", progressivo: 7,
      causale: "Saldo lavori < commessa 12 & seguenti",
      ritenuta: { tipo: "RT01", aliquota: "20", causale: "A" },
      righe: [{ descrizione: "Prestazione professionale", quantita: "1", prezzoUnitario: "2000.00", aliquota: "22" }],
    },
  },
  {
    name: "08-sconto-e-rate",
    doc: {
      ...BASE, numero: "2026/000008", progressivo: 8,
      scontoDocumento: { percentuale: "10" },
      righe: [
        { descrizione: "Licenza", quantita: "1", prezzoUnitario: "1000.00", aliquota: "22" },
        { descrizione: "Assistenza", quantita: "12", unitaMisura: "mese", prezzoUnitario: "50.00", aliquota: "22" },
      ],
      pagamento: {
        condizioni: "TP01", modalita: "MP05",
        rate: [
          // 1756,80 in tutto: 800,00 subito e il resto a saldo. L'app rifiuta rate che non
          // sommano al totale, e questo campione ci era passato sotto per ottanta centesimi.
          { scadenza: "2026-10-03", importo: "800.00" },
          { scadenza: "2026-11-03", importo: "956.80" },
        ],
      },
    },
  },
  {
    // **La fattura differita, che è il caso nuovo e il più esposto.** `DatiDDT` sta dentro
    // `DatiGenerali`, dopo `DatiGeneraliDocumento` e prima di `DatiBeniServizi`: l'ordine degli
    // elementi è la cosa che uno schema XSD coglie e che una lettura attenta della specifica non
    // garantisce. Due consegne, perché una sola non proverebbe che il blocco si ripete.
    name: "09-fattura-differita-da-ddt",
    doc: {
      ...BASE,
      tipo: "TD24",
      numero: "2026/000009",
      progressivo: 9,
      ddt: [
        { numero: "DDT 2026/0001", data: "2026-08-20" },
        { numero: "DDT 2026/0002", data: "2026-08-27" },
      ],
      righe: [
        { descrizione: "Telaio saldato", quantita: "3", unitaMisura: "pz", prezzoUnitario: "250.00", aliquota: "22" },
        { descrizione: "Telaio saldato", quantita: "2", unitaMisura: "pz", prezzoUnitario: "250.00", aliquota: "22" },
      ],
      pagamento: { condizioni: "TP02", modalita: "MP05", rate: [{ scadenza: "2026-10-31" }] },
    },
  },
  {
    // **Un'azienda sammarinese che fattura in Italia.** Ricalca la forma di una fattura registrata
    // davvero: `IdTrasmittente` fisso dell'HUB, COE nudo nell'`IdFiscaleIVA`, CAP e provincia veri
    // — San Marino non è «estero» per il CAP — natura N3.1 con il codice TM sulla riga, e lo stesso
    // codice in testa al riferimento normativo. I dati sono inventati; la forma no.
    name: "10-emittente-sammarinese",
    company: {
      denominazione: "Titano Meccanica S.A.",
      partitaIva: "24680",
      paese: "SM",
      regimeFiscale: "RF01",
      sede: {
        indirizzo: "Strada dei Censiti", numeroCivico: "21", cap: "47891",
        comune: "Serravalle", provincia: "SM",
      },
    },
    doc: {
      ...BASE, numero: "2026/000010", progressivo: 10,
      righe: [{
        descrizione: "Consulenza specialistica", quantita: "1.00", prezzoUnitario: "5000.00",
        aliquota: "0", natura: "N3.1", tm: "3",
      }],
      pagamento: { condizioni: "TP02", modalita: "MP01", rate: [{ scadenza: "2026-10-27" }] },
    },
  },
];

// -----------------------------------------------------------------------------------------------------------------
//  s c r i t t u r a
// -----------------------------------------------------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let failed = 0;

for (const sample of CASES) {
  const company = sample.company || COMPANY;
  const party = sample.party || PARTY;
  const problems = validate(sample.doc, { company, party });
  if (problems.length) {
    failed += 1;
    console.error(`FALLITO — ${sample.name}: la validazione trova dei problemi`);
    for (const line of describe(problems)) console.error(`  · ${line}`);
    continue;
  }
  const { name, text } = build(sample.doc, { company, party });
  writeFileSync(join(OUT, `${sample.name}_${name}`), text, "utf8");
}

if (failed) process.exit(1);
console.log(`samples: ${CASES.length} documenti scritti in test/out/`);
