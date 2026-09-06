// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Rileggere un file FatturaPA.
//
// La prova principale è **il giro completo**: un documento nostro passa dall'emettitore, torna dal
// lettore, e i due devono coincidere campo per campo. È l'unica forma di prova che non può accordarsi
// da sola con l'errore — un lettore scritto guardando l'emettitore riproduce anche i suoi sbagli,
// mentre un giro che si chiude dice che i due sono davvero l'inverso l'uno dell'altro.
//
// Sotto, i file che l'emettitore non produce: prefissi, più fatture in un file, rami che non
// leggiamo. Quelli hanno bisogno di XML scritto a mano, e ce n'è il meno possibile.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/reading.mjs

import assert from "node:assert/strict";
import { build } from "../run/fatturapa.js";
import { read } from "../run/reading.js";

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
//  f i x t u r e
// -----------------------------------------------------------------------------------------------------------------

// Dati inventati, con il carattere di controllo giusto: nessun identificativo vero nelle prove.
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
  paese: "IT",
  sede: { indirizzo: "Corso Esempio", numeroCivico: "2", cap: "20100", comune: "Milano", provincia: "MI" },
};

const DOC = {
  tipo: "TD01",
  data: "2026-09-03",
  numero: "2026/000123",
  progressivo: 7,
  causale: "Servizi di settembre",
  righe: [
    { descrizione: "Progettazione", quantita: "10", unitaMisura: "ora", prezzoUnitario: "80.00", aliquota: "22" },
    { descrizione: "Licenza", quantita: "1", prezzoUnitario: "500.00", aliquota: "22",
      sconto: { percentuale: "10" } },
  ],
  pagamento: {
    condizioni: "TP01", modalita: "MP05", iban: "IT60X0542811101000000123456",
    rate: [{ scadenza: "2026-10-03", importo: "500.00" }, { scadenza: "2026-11-03" }],
  },
};

const emesso = build(DOC, { company: COMPANY, party: PARTY });

// -----------------------------------------------------------------------------------------------------------------
//  i l   g i r o   c o m p l e t o
// -----------------------------------------------------------------------------------------------------------------

prova("un documento nostro torna indietro identico", () => {
  const { documenti, progressivo, versione } = read(emesso.text);
  assert.equal(documenti.length, 1);
  assert.equal(versione, "FPR12");
  assert.ok(progressivo, "il progressivo di invio si rilegge");

  const { doc } = documenti[0];
  assert.equal(doc.tipo, "TD01");
  assert.equal(doc.data, "2026-09-03");
  assert.equal(doc.numero, "2026/000123");
  assert.equal(doc.causale, "Servizi di settembre");
  assert.equal(doc.righe.length, 2);
});

prova("le righe tornano con quantità, unità, prezzo e aliquota", () => {
  const [riga, seconda] = read(emesso.text).documenti[0].doc.righe;
  assert.equal(riga.descrizione, "Progettazione");
  assert.equal(riga.unitaMisura, "ora");
  assert.equal(Number(riga.quantita), 10);
  assert.equal(Number(riga.prezzoUnitario), 80);
  assert.equal(Number(riga.aliquota), 22);
  assert.equal(Number(seconda.sconto.percentuale), 10, "lo sconto di riga resta uno sconto");
});

prova("le rate tornano tutte, con la loro scadenza", () => {
  const { doc } = read(emesso.text).documenti[0];
  assert.equal(doc.pagamento.rate.length, 2);
  assert.equal(doc.pagamento.rate[0].scadenza, "2026-10-03");
  assert.equal(doc.pagamento.rate[1].scadenza, "2026-11-03");
  assert.equal(doc.pagamento.condizioni, "TP01");
  assert.equal(doc.pagamento.rate[0].iban, "IT60X0542811101000000123456");
});

prova("il cliente torna nella forma che l'anagrafica accetta", () => {
  const { cliente } = read(emesso.text).documenti[0];
  assert.equal(cliente.denominazione, "Cliente S.p.A.");
  assert.equal(cliente.partitaIva, "09876543217");
  assert.equal(cliente.paese, "IT");
  assert.equal(cliente.comune, "Milano");
  assert.equal(cliente.provincia, "MI");
  assert.equal(cliente.cap, "20100");
  assert.equal(cliente.numeroCivico, "2");
});

prova("il totale dichiarato si tiene da parte, non si prende per buono", () => {
  // 800 + 450 = 1250, più 22% = 1525. Il numero viene dal file, e il documento riletto ha le righe:
  // chi importa può confrontarli. Fonderli qui vorrebbe dire perdere la differenza fra i due.
  const { dichiarato } = read(emesso.text).documenti[0];
  assert.equal(Number(dichiarato), 1525);
});

prova("una fattura riletta non è una bozza", () => {
  const { doc } = read(emesso.text).documenti[0];
  assert.equal(doc.stato, "inviato");
  assert.equal(doc.esportato, true);
});

// -----------------------------------------------------------------------------------------------------------------
//  q u e l l o   c h e   n o i   n o n   s c r i v i a m o
// -----------------------------------------------------------------------------------------------------------------

/** Un file minimo, con i pezzi che servono alla prova. */
function fattura({ prefisso = "p:", corpi = 1, riga = "", generali = "", tipo = "TD01" } = {}) {
  const body = `<FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento>
      <TipoDocumento>${tipo}</TipoDocumento><Divisa>EUR</Divisa>
      <Data>2026-09-04</Data><Numero>1</Numero>
      <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
    </DatiGeneraliDocumento>${generali}</DatiGenerali>
    <DatiBeniServizi><DettaglioLinee>
      <NumeroLinea>1</NumeroLinea><Descrizione>Consulenza</Descrizione>
      <PrezzoUnitario>100.00</PrezzoUnitario><PrezzoTotale>100.00</PrezzoTotale>
      <AliquotaIVA>22.00</AliquotaIVA>${riga}
    </DettaglioLinee></DatiBeniServizi>
  </FatturaElettronicaBody>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<${prefisso}FatturaElettronica versione="FPR12">
  <FatturaElettronicaHeader>
    <DatiTrasmissione><ProgressivoInvio>54</ProgressivoInvio><CodiceDestinatario>2R4GTO8</CodiceDestinatario></DatiTrasmissione>
    <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Chi emette</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici><IdFiscaleIVA><IdPaese>SM</IdPaese><IdCodice>29141</IdCodice></IdFiscaleIVA>
        <Anagrafica><Nome>Mario</Nome><Cognome>Rossi</Cognome></Anagrafica></DatiAnagrafici>
      <Sede><Indirizzo>Via Marino Moretti</Indirizzo><NumeroCivico>23</NumeroCivico>
        <CAP>47899</CAP><Comune>Serravalle</Comune><Provincia>SM</Provincia><Nazione>SM</Nazione></Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  ${body.repeat(corpi)}
</${prefisso}FatturaElettronica>`;
}

prova("il prefisso del namespace non cambia niente", () => {
  for (const prefisso of ["", "p:", "ns2:"]) {
    const letto = read(fattura({ prefisso }));
    assert.equal(letto.documenti.length, 1, `prefisso «${prefisso}»`);
    assert.equal(letto.progressivo, "54");
  }
});

prova("un file con più fatture le restituisce tutte", () => {
  // Un lotto: un'intestazione e più corpi. Chi legge `[0]` e si ferma perde le altre in silenzio, ed
  // è il motivo per cui `read` restituisce una lista invece di un documento.
  assert.equal(read(fattura({ corpi: 3 })).documenti.length, 3);
});

prova("una persona fisica diventa un nome solo", () => {
  const { cliente } = read(fattura()).documenti[0];
  assert.equal(cliente.denominazione, "Mario Rossi");
  assert.equal(cliente.paese, "SM");
  assert.equal(cliente.provincia, "SM");
});

prova("il codice TM si legge per TipoDato, non per posizione", () => {
  // `AltriDatiGestionali` si ripete, e il TM non è sempre il primo. Leggerlo per posizione funziona
  // sul file che si ha davanti e sbaglia sul prossimo.
  const riga = `<AltriDatiGestionali><TipoDato>ALTRO</TipoDato><RiferimentoTesto>x</RiferimentoTesto></AltriDatiGestionali>` +
               `<AltriDatiGestionali><TipoDato>TM</TipoDato><RiferimentoTesto>3</RiferimentoTesto></AltriDatiGestionali>`;
  assert.equal(read(fattura({ riga })).documenti[0].doc.righe[0].tm, "3");
});

prova("la natura della riga si rilegge", () => {
  const letto = read(fattura({ riga: "<Natura>N3.1</Natura>" }));
  assert.equal(letto.documenti[0].doc.righe[0].natura, "N3.1");
});

prova("una maggiorazione non diventa uno sconto", () => {
  // Lo stesso elemento porta sconto e maggiorazione, distinti da `Tipo`. Leggere `MG` come `SC`
  // trasformerebbe un aumento in una riduzione della stessa misura: il massimo errore possibile
  // dalla minima confusione possibile.
  const riga = `<ScontoMaggiorazione><Tipo>MG</Tipo><Percentuale>10.00</Percentuale></ScontoMaggiorazione>`;
  assert.equal(read(fattura({ riga })).documenti[0].doc.righe[0].sconto, undefined);
});

prova("i DDT collegati tornano con i riferimenti di riga", () => {
  const generali = `<DatiDDT><NumeroDDT>DDT/7</NumeroDDT><DataDDT>2026-08-01</DataDDT>` +
                   `<RiferimentoNumeroLinea>1</RiferimentoNumeroLinea></DatiDDT>`;
  const { doc } = read(fattura({ generali })).documenti[0];
  assert.deepEqual(doc.ddt, [{ numero: "DDT/7", data: "2026-08-01", righe: [1] }]);
});

prova("un ramo che non leggiamo viene dichiarato, non taciuto", () => {
  const generali = `<DatiOrdineAcquisto><IdDocumento>ODA-9</IdDocumento></DatiOrdineAcquisto>`;
  const { avvisi } = read(fattura({ generali })).documenti[0];
  assert.deepEqual(avvisi, [{ chiave: "readOrder", valore: "1" }]);
});

prova("un tipo che non gestiamo diventa fattura e lo dice", () => {
  const { doc, avvisi } = read(fattura({ tipo: "TD06" })).documenti[0];
  assert.equal(doc.tipo, "TD01");
  assert.deepEqual(avvisi, [{ chiave: "readKind", valore: "TD06" }]);
});

// -----------------------------------------------------------------------------------------------------------------
//  q u a n d o   i l   f i l e   n o n   è   q u e l l o
// -----------------------------------------------------------------------------------------------------------------

prova("un XML che non è una fattura, e uno rotto, sono due eventi diversi", () => {
  // Per chi importa una cartella la differenza conta: il primo è un file che non c'entra, il secondo
  // è una fattura da guardare. Un messaggio solo per i due manderebbe a cercare la cosa sbagliata.
  assert.throws(() => read("<qualcosa><altro/></qualcosa>"), /readNotFattura/);
  assert.throws(() => read("<FatturaElettronica><non chiuso>"), SyntaxError);
});

prova("una fattura senza corpo si ferma", () => {
  assert.throws(() => read(`<p:FatturaElettronica versione="FPR12"><FatturaElettronicaHeader/></p:FatturaElettronica>`),
                /readNoBody/);
});

prova("un corpo senza righe entra, ma con un avviso", () => {
  const senzaRighe = fattura().replace(/<DatiBeniServizi>[\s\S]*?<\/DatiBeniServizi>/, "<DatiBeniServizi/>");
  const { doc, avvisi } = read(senzaRighe).documenti[0];
  assert.deepEqual(doc.righe, []);
  assert.ok(avvisi.some((a) => a.chiave === "readNoLines"));
});

console.log(`reading: ${passed} prove passate`);
