// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

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
import { totals } from "../run/totals.js";
import { from } from "../run/decimal.js";

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
  // The surcharge is added to the price: 100,00 + 10% is a line of 110,00, kept as a discount of
  // minus ten (the one discount a line of ours holds).
  const riga = `<ScontoMaggiorazione><Tipo>MG</Tipo><Percentuale>10.00</Percentuale></ScontoMaggiorazione>`;
  const linea = read(fattura({ riga })).documenti[0].doc.righe[0];
  assert.deepEqual(linea.sconto, { importo: "-10.00" });
  assert.equal(totals({ righe: [linea] }).imponibile, from("110"));
});

prova("gli sconti in catena si applicano tutti, nell'ordine del file", () => {
  // 100 − 10% = 90, − 5% = 85,50: the second element used to be dropped.
  const riga = `<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>10.00</Percentuale></ScontoMaggiorazione>` +
               `<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>5.00</Percentuale></ScontoMaggiorazione>`;
  const linea = read(fattura({ riga })).documenti[0].doc.righe[0];
  assert.equal(totals({ righe: [linea] }).imponibile, from("85.50"));
});

prova("con percentuale e importo vale l'importo, come dice il controllo 00423", () => {
  const riga = `<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>10.00</Percentuale><Importo>5.00</Importo></ScontoMaggiorazione>`;
  assert.deepEqual(read(fattura({ riga })).documenti[0].doc.righe[0].sconto, { importo: "5.00" });
});

prova("il contributo della cassa previdenziale entra come riga, con la sua aliquota", () => {
  // 100 + 4% cassa = 104 di imponibile, 22,88 di IVA: left out, the purchase came in at 100 and 22.
  const cassa = `<DatiCassaPrevidenziale><TipoCassa>TC22</TipoCassa><AlCassa>4.00</AlCassa>` +
    `<ImportoContributoCassa>4.00</ImportoContributoCassa><AliquotaIVA>22.00</AliquotaIVA></DatiCassaPrevidenziale>` +
    `<ImportoTotaleDocumento>126.88</ImportoTotaleDocumento>`;
  const xml = fattura().replace("<ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>", cassa);
  const { doc } = read(xml).documenti[0];
  const conti = totals(doc);
  assert.equal(conti.imponibile, from("104"));
  assert.equal(conti.imposta, from("22.88"));
});

prova("il bollo dichiarato ma non addebitato non entra nel totale", () => {
  // DatiBollo with a stated total of 122,00 on 100 + 22: the issuer kept the duty for itself.
  const generali = "";
  const xml = fattura({ generali }).replace("<ImportoTotaleDocumento>",
    "<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo><ImportoTotaleDocumento>");
  assert.equal(read(xml).documenti[0].doc.bollo, undefined);
  // Charged on, the stated total carries it, and the document does too.
  const addebitato = xml.replace("<ImportoTotaleDocumento>122.00", "<ImportoTotaleDocumento>124.00");
  assert.ok(read(addebitato).documenti[0].doc.bollo);
});

prova("i DDT collegati tornano con i riferimenti di riga", () => {
  const generali = `<DatiDDT><NumeroDDT>DDT/7</NumeroDDT><DataDDT>2026-08-01</DataDDT>` +
                   `<RiferimentoNumeroLinea>1</RiferimentoNumeroLinea></DatiDDT>`;
  const { doc } = read(fattura({ generali })).documenti[0];
  assert.deepEqual(doc.ddt, [{ numero: "DDT/7", data: "2026-08-01", righe: [1] }]);
});

prova("un ramo che non leggiamo viene dichiarato, non taciuto", () => {
  const generali = `<DatiContratto><IdDocumento>CTR-9</IdDocumento></DatiContratto>`;
  const { avvisi } = read(fattura({ generali })).documenti[0];
  assert.deepEqual(avvisi, [{ chiave: "readContract", valore: "1" }]);
});

prova("l'ordine si legge: il primo con CIG e CUP, gli altri dichiarati", () => {
  const uno = `<DatiOrdineAcquisto><IdDocumento>ODA-9</IdDocumento><Data>2026-08-01</Data>`
    + `<CodiceCUP>J11B22000000000</CodiceCUP><CodiceCIG>ZAB1234567</CodiceCIG></DatiOrdineAcquisto>`;
  const { doc, avvisi } = read(fattura({ generali: uno })).documenti[0];
  assert.deepEqual(doc.ordine, { numero: "ODA-9", data: "2026-08-01", cig: "ZAB1234567", cup: "J11B22000000000" });
  assert.deepEqual(avvisi, []);
  const due = uno + `<DatiOrdineAcquisto><IdDocumento>ODA-10</IdDocumento></DatiOrdineAcquisto>`;
  assert.deepEqual(read(fattura({ generali: due })).documenti[0].avvisi, [{ chiave: "readOrder", valore: "1" }]);
});

prova("una fattura alla PA torna come è uscita: FPA12, scissione, cassa, ritenuta per riga", () => {
  const pa = { ...PARTY, partitaIva: "", codiceFiscale: "80012345678", codiceDestinatario: "UFABCD", pa: true, splitPayment: true };
  const uscita = build({
    ...DOC, esigibilita: "S",
    ordine: { numero: "ORD-7", data: "2026-08-01", cig: "ZAB1234567", cup: null },
  }, { company: COMPANY, party: pa });
  const { doc, cliente } = read(uscita.text).documenti[0];
  assert.equal(doc.esigibilita, "S");
  assert.equal(doc.ordine.cig, "ZAB1234567");
  assert.equal(cliente.pa, true);
  assert.equal(cliente.splitPayment, true);
  assert.equal(cliente.codiceDestinatario, "UFABCD");
  // What the customer owes is the taxable amount: the VAT goes to the Treasury.
  const conti = totals(doc);
  assert.equal(conti.totale.toString(), totals({ ...DOC, esigibilita: "S" }).totale.toString());

  // A professional's invoice: the expense line (N1) is outside the withholding, the contribution in.
  const professionista = build({
    ...DOC,
    righe: [DOC.righe[0], { descrizione: "Spese", quantita: "1", prezzoUnitario: "50.00", aliquota: "0", natura: "N1" }],
    cassa: { tipo: "TC04", aliquota: "4", aliquotaIva: "22", ritenuta: true },
    ritenuta: { tipo: "RT01", aliquota: "20", causale: "A" },
  }, { company: COMPANY, party: PARTY });
  const letto = read(professionista.text).documenti[0].doc;
  assert.deepEqual(letto.righe.map((r) => r.soggettaRitenuta), [true, false, true]);
  assert.equal(totals(letto).ritenuta.toString(),
    totals({ ...DOC, righe: [DOC.righe[0], { descrizione: "Spese", quantita: "1", prezzoUnitario: "50.00", aliquota: "0", natura: "N1" }],
      cassa: { tipo: "TC04", aliquota: "4", aliquotaIva: "22", ritenuta: true },
      ritenuta: { tipo: "RT01", aliquota: "20", causale: "A" } }).ritenuta.toString());
  // A private customer's file says nothing of a PA.
  assert.equal(read(emesso.text).documenti[0].cliente.pa, undefined);
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
