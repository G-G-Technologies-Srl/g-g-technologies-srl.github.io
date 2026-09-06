// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The XML, and the round trip that proves the escaping is reversible.
//
// Two things are checked here that nothing else can check:
//
//  - **the order of the elements.** The tracciato's schema is a sequence: `Numero` before `Data`
//    is a rejected file, and no amount of correct content saves it. So the test reads the emitted
//    names in order and compares the list, rather than asking whether a field is present;
//  - **generate → read → compare.** An ampersand in a company name is the trap the site already
//    has in its sharing bar, and here it costs an invoice instead of a markup check.
//
//     node app/invoice-scope/test/fatturapa.mjs

import assert from "node:assert/strict";

import * as xml from "../run/xml.js";
import {
  build, progressivo, destinatario, fileName, profileFor, IT_SDI, TRACCIATO,
} from "../run/fatturapa.js";

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

// An invented company with an identifier that belongs to nobody: the plan forbids real fiscal data
// in the examples, and the first draft of a fixture file always has somebody's VAT number in it.
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
  progressivo: 1,
  righe: [
    { descrizione: "Progettazione", quantita: "10", unitaMisura: "ora", prezzoUnitario: "80.00", aliquota: "22" },
  ],
  pagamento: { condizioni: "TP02", modalita: "MP05", iban: "IT60X0542811101000000123456", rate: [{ scadenza: "2026-10-03" }] },
};

const built = build(DOC, { company: COMPANY, party: PARTY });
const parsed = xml.parse(built.text);

/** Every element name in document order, which is what the schema constrains. */
function names(node, out = []) {
  for (const [name, value] of node) {
    out.push(name);
    if (Array.isArray(value)) names(value, out);
  }
  return out;
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   f o r m a
// -----------------------------------------------------------------------------------------------------------------

test("la radice, il namespace e la versione", () => {
  assert.equal(parsed.root, "p:FatturaElettronica");
  assert.equal(parsed.attributes.versione, "FPR12");
  assert.ok(parsed.attributes["xmlns:p"].includes("ivaservizi.agenziaentrate.gov.it"));
  assert.ok(built.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
});

test("la versione del tracciato sta in un posto solo", () => {
  assert.equal(IT_SDI.versione, TRACCIATO.versione);
  assert.equal(IT_SDI.schema, TRACCIATO.schema);
});

test("i due blocchi di primo livello, nell'ordine", () => {
  assert.deepEqual(parsed.children.map(([name]) => name), [
    "FatturaElettronicaHeader",
    "FatturaElettronicaBody",
  ]);
});

test("l'ordine dei dati generali è quello dello schema", () => {
  const generali = xml.find(parsed.children, "FatturaElettronicaBody", "DatiGenerali", "DatiGeneraliDocumento");
  assert.deepEqual(generali.map(([name]) => name), [
    "TipoDocumento", "Divisa", "Data", "Numero", "ImportoTotaleDocumento",
  ]);
});

test("l'ordine dentro una riga di dettaglio", () => {
  const linea = xml.find(parsed.children, "FatturaElettronicaBody", "DatiBeniServizi", "DettaglioLinee");
  assert.deepEqual(linea.map(([name]) => name), [
    "NumeroLinea", "Descrizione", "Quantita", "UnitaMisura", "PrezzoUnitario", "PrezzoTotale", "AliquotaIVA",
  ]);
});

test("la sede viene dopo i dati anagrafici, in entrambe le parti", () => {
  const ordine = names(parsed.children);
  assert.ok(ordine.indexOf("CedentePrestatore") < ordine.indexOf("CessionarioCommittente"));
  const cedente = xml.find(parsed.children, "FatturaElettronicaHeader", "CedentePrestatore");
  assert.deepEqual(cedente.map(([name]) => name), ["DatiAnagrafici", "Sede"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  i   v a l o r i
// -----------------------------------------------------------------------------------------------------------------

test("gli importi hanno due decimali e il punto", () => {
  const linea = xml.find(parsed.children, "FatturaElettronicaBody", "DatiBeniServizi", "DettaglioLinee");
  const value = (n) => linea.find(([name]) => name === n)[1];
  assert.equal(value("PrezzoUnitario"), "80.00");
  assert.equal(value("PrezzoTotale"), "800.00");
  assert.equal(value("AliquotaIVA"), "22.00");
  assert.equal(value("Quantita"), "10.00");
});

test("il riepilogo porta imponibile e imposta calcolati sul gruppo", () => {
  const r = xml.find(parsed.children, "FatturaElettronicaBody", "DatiBeniServizi", "DatiRiepilogo");
  const value = (n) => r.find(([name]) => name === n)[1];
  assert.equal(value("ImponibileImporto"), "800.00");
  assert.equal(value("Imposta"), "176.00");
});

test("il totale del documento è quello dei totali calcolati", () => {
  const totale = xml.find(parsed.children, "FatturaElettronicaBody", "DatiGenerali", "DatiGeneraliDocumento", "ImportoTotaleDocumento");
  assert.equal(totale, "976.00");
});

test("una quantità con otto decimali non viene troncata a due", () => {
  const b = build({ ...DOC, righe: [{ descrizione: "Energia", quantita: "1234.56789", prezzoUnitario: "0.08745", aliquota: "22" }] },
    { company: COMPANY, party: PARTY });
  const linea = xml.find(xml.parse(b.text).children, "FatturaElettronicaBody", "DatiBeniServizi", "DettaglioLinee");
  assert.equal(linea.find(([n]) => n === "Quantita")[1], "1234.56789");
  assert.equal(linea.find(([n]) => n === "PrezzoTotale")[1], "107.96");
});

test("un campo assente non diventa un elemento vuoto", () => {
  // Un elemento facoltativo scritto vuoto viene scartato: assente e vuoto non sono la stessa cosa.
  assert.ok(!built.text.includes("<Causale></Causale>"));
  assert.ok(!built.text.includes("<Natura></Natura>"));
  assert.ok(!built.text.includes("<CodiceFiscale></CodiceFiscale>"));
});

test("un blocco i cui figli sono tutti assenti non compare", () => {
  const b = build({ ...DOC, pagamento: null }, { company: COMPANY, party: PARTY });
  assert.ok(!b.text.includes("DatiPagamento"));
});

// -----------------------------------------------------------------------------------------------------------------
//  e s t e r o   e   S a n   M a r i n o
// -----------------------------------------------------------------------------------------------------------------

test("un cliente estero ha CAP 00000 e nessuna provincia", () => {
  const estero = { ...PARTY, paese: "DE", codiceDestinatario: null,
    sede: { indirizzo: "Musterstrasse", numeroCivico: "3", cap: "10115", comune: "Berlin", provincia: "BE" } };
  const b = build(DOC, { company: COMPANY, party: estero });
  const sede = xml.find(xml.parse(b.text).children, "FatturaElettronicaHeader", "CessionarioCommittente", "Sede");
  assert.equal(sede.find(([n]) => n === "CAP")[1], "00000");
  assert.equal(sede.find(([n]) => n === "Nazione")[1], "DE");
  assert.equal(sede.find(([n]) => n === "Provincia"), undefined);
});

test("i quattro codici destinatario, e non ce n'è un quinto", () => {
  assert.equal(destinatario({ codiceDestinatario: "ABCDEFG" }), "ABCDEFG");
  assert.equal(destinatario({}), "0000000");
  assert.equal(destinatario({ paese: "IT" }), "0000000");
  assert.equal(destinatario({ paese: "SM" }), "2R4GTO8");
  assert.equal(destinatario({ paese: "DE" }), "XXXXXXX");
  for (const party of [{}, { paese: "SM" }, { paese: "DE" }]) {
    assert.equal(destinatario(party).length, 7, "il codice non è di sette caratteri");
  }
});

test("una cessione verso San Marino porta natura N3.3", () => {
  const sm = { ...PARTY, paese: "SM", codiceDestinatario: null };
  const b = build({ ...DOC, righe: [{ descrizione: "Merce", quantita: "1", prezzoUnitario: "100.00", aliquota: "0", natura: "N3.3" }] },
    { company: COMPANY, party: sm });
  const tree = xml.parse(b.text);
  assert.equal(xml.find(tree.children, "FatturaElettronicaHeader", "DatiTrasmissione", "CodiceDestinatario"), "2R4GTO8");
  const r = xml.find(tree.children, "FatturaElettronicaBody", "DatiBeniServizi", "DatiRiepilogo");
  assert.equal(r.find(([n]) => n === "Natura")[1], "N3.3");
  assert.equal(r.find(([n]) => n === "Imposta")[1], "0.00");
});

test("una natura porta con sé il riferimento normativo", () => {
  // Senza, il riepilogo dice «non tassata» e non dice in base a cosa. Il campo veniva riempito da
  // una proprietà che nessuno impostava, quindi cadeva da ogni file.
  const b = build({ ...DOC, righe: [{ descrizione: "Merce", quantita: "1", prezzoUnitario: "100.00", aliquota: "0", natura: "N3.1" }] },
    { company: COMPANY, party: PARTY });
  const r = xml.find(xml.parse(b.text).children, "FatturaElettronicaBody", "DatiBeniServizi", "DatiRiepilogo");
  const riferimento = r.find(([n]) => n === "RiferimentoNormativo");
  assert.ok(riferimento, "manca RiferimentoNormativo");
  assert.match(riferimento[1], /art/i);
});

test("un riepilogo con IVA non ha nessun riferimento normativo", () => {
  // È l'altra metà: su un'operazione tassata l'elemento non è ammesso.
  const r = xml.find(parsed.children, "FatturaElettronicaBody", "DatiBeniServizi", "DatiRiepilogo");
  assert.equal(r.find(([n]) => n === "RiferimentoNormativo"), undefined);
});

test("due rate valgono il totale, non il totale ciascuna", () => {
  // Il difetto: due rate senza importo uscivano da 1220,00 l'una su un totale di 1220,00, e le
  // condizioni restavano «in un'unica soluzione» con due DettaglioPagamento nel file.
  const b = build({
    ...DOC,
    pagamento: { modalita: "MP05", rate: [{ scadenza: "2026-10-03" }, { scadenza: "2026-11-03" }] },
  }, { company: COMPANY, party: PARTY });
  const pagamento = xml.find(xml.parse(b.text).children, "FatturaElettronicaBody", "DatiPagamento");
  const importi = pagamento
    .filter(([n]) => n === "DettaglioPagamento")
    .map((d) => d[1].find(([n]) => n === "ImportoPagamento")[1]);
  assert.deepEqual(importi, ["488.00", "488.00"]);
  assert.equal(pagamento.find(([n]) => n === "CondizioniPagamento")[1], "TP01");
});

test("una rata con importo proprio è rispettata, e il resto si spartisce", () => {
  const b = build({
    ...DOC,
    pagamento: { modalita: "MP05", rate: [
      { scadenza: "2026-10-03", importo: "500.00" },
      { scadenza: "2026-11-03" },
    ] },
  }, { company: COMPANY, party: PARTY });
  const pagamento = xml.find(xml.parse(b.text).children, "FatturaElettronicaBody", "DatiPagamento");
  const importi = pagamento
    .filter(([n]) => n === "DettaglioPagamento")
    .map((d) => d[1].find(([n]) => n === "ImportoPagamento")[1]);
  // 976.00 di totale: 500.00 dichiarati, 476.00 alla seconda.
  assert.deepEqual(importi, ["500.00", "476.00"]);
});

test("una rata sola tiene le condizioni che le hai dato", () => {
  const b = build(DOC, { company: COMPANY, party: PARTY });
  const pagamento = xml.find(xml.parse(b.text).children, "FatturaElettronicaBody", "DatiPagamento");
  assert.equal(pagamento.find(([n]) => n === "CondizioniPagamento")[1], "TP02");
  assert.equal(pagamento.find(([n]) => n === "DettaglioPagamento")[1]
    .find(([n]) => n === "ImportoPagamento")[1], "976.00");
});

test("il prezzo unitario tiene i suoi decimali", () => {
  // Passava dal formattatore a due decimali: 0,08745 diventava 0,09, e lo SdI ricalcolava
  // 1234,56789 × 0,09 = 111,11 contro un totale dichiarato di 107,96.
  const b = build({ ...DOC, righe: [{ descrizione: "Energia", quantita: "1234.56789", prezzoUnitario: "0.08745", aliquota: "22" }] },
    { company: COMPANY, party: PARTY });
  const linea = xml.find(xml.parse(b.text).children, "FatturaElettronicaBody", "DatiBeniServizi", "DettaglioLinee");
  assert.equal(linea.find(([n]) => n === "PrezzoUnitario")[1], "0.08745");
});

// -----------------------------------------------------------------------------------------------------------------
//  n o m e   d e l   f i l e
// -----------------------------------------------------------------------------------------------------------------

test("il nome è paese, codice, underscore, progressivo", () => {
  // **Decimale, e senza zeri davanti.** È la forma dei file che l'Ufficio Tributario sammarinese
  // ha già accettato — `SM29141_54.xml` — ed è quello che oggi legge: il campo interno lo segue.
  assert.equal(built.name, "IT01234567897_1.xml");
  assert.equal(fileName(COMPANY, 54), "IT01234567897_54.xml");
  assert.equal(fileName(COMPANY, 1000), "IT01234567897_1000.xml");
});

test("il progressivo sta in cinque cifre e si legge", () => {
  // Era in base 36, che ne conteneva sessanta milioni: dopo il 54 veniva `0001J`, un numero che
  // nessuno può confrontare a occhio con l'elenco di quello che ha mandato.
  for (const [value, atteso] of [[1, "1"], [54, "54"], [1000, "1000"], [99999, "99999"]]) {
    assert.equal(progressivo(value), atteso);
  }
});

test("oltre il massimo è un errore, non un nome più lungo", () => {
  assert.throws(() => progressivo(100000), RangeError);
  assert.throws(() => progressivo(0), RangeError);
  assert.throws(() => progressivo(-1), RangeError);
  assert.throws(() => progressivo(1.5), RangeError);
});

test("l'estensione è .xml, perché l'app non firma", () => {
  assert.ok(built.name.endsWith(".xml"));
  assert.ok(!built.name.includes(".p7m"));
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   g i r o   c o m p l e t o
// -----------------------------------------------------------------------------------------------------------------

test("l'ampersand in una ragione sociale sopravvive al giro", () => {
  const company = { ...COMPANY, denominazione: "Rossi & Bianchi S.r.l." };
  const b = build(DOC, { company, party: PARTY });
  assert.ok(b.text.includes("Rossi &amp; Bianchi S.r.l."), "l'ampersand non è stato convertito");
  assert.ok(!b.text.includes("Rossi & Bianchi"), "un ampersand nudo è rimasto nel file");
  const back = xml.find(xml.parse(b.text).children,
    "FatturaElettronicaHeader", "CedentePrestatore", "DatiAnagrafici", "Anagrafica", "Denominazione");
  assert.equal(back, "Rossi & Bianchi S.r.l.");
});

test("i caratteri che romperebbero il file tornano indietro interi", () => {
  for (const nome of ['Rossi & <Figli>', 'Virgolette "doppie"', "Apostrofo d'Este", "A & B < C > D & E"]) {
    const b = build({ ...DOC, causale: nome }, { company: COMPANY, party: PARTY });
    const back = xml.find(xml.parse(b.text).children,
      "FatturaElettronicaBody", "DatiGenerali", "DatiGeneraliDocumento", "Causale");
    assert.equal(back, nome, `non torna: ${nome}`);
  }
});

test("un carattere di controllo viene tolto invece di rompere il file", () => {
  // Arriva incollando da un PDF, è invisibile, e non esiste un escape che lo renda legale.
  const b = build({ ...DOC, causale: "Fattura\u0000 di\u0007 prova" }, { company: COMPANY, party: PARTY });
  const back = xml.find(xml.parse(b.text).children,
    "FatturaElettronicaBody", "DatiGenerali", "DatiGeneraliDocumento", "Causale");
  assert.equal(back, "Fattura di prova");
});

test("generare due volte lo stesso documento dà lo stesso file", () => {
  // Nessun caso, nessuna data di oggi, nessun identificatore casuale dentro il tracciato: due
  // build dello stesso documento sono confrontabili, e un difetto raccontato è riproducibile.
  const a = build(DOC, { company: COMPANY, party: PARTY });
  const b = build(DOC, { company: COMPANY, party: PARTY });
  assert.equal(a.text, b.text);
  assert.equal(a.name, b.name);
});

test("i totali tornano indietro insieme al file", () => {
  assert.equal(built.totals.righe.length, 1);
  assert.equal(built.totals.riepiloghi.length, 1);
});

// -----------------------------------------------------------------------------------------------------------------
//  q u e l l o   c h e   n o n   d i v e n t a   u n   f i l e
// -----------------------------------------------------------------------------------------------------------------

// -----------------------------------------------------------------------------------------------------------------
//  i l   p r o f i l o   s a m m a r i n e s e
// -----------------------------------------------------------------------------------------------------------------

// Un'azienda sammarinese. Le prove qui sotto ricalcano una fattura registrata davvero, con dati
// inventati: quello che si copia è la forma, mai i numeri di qualcuno.
const SM = {
  denominazione: "Titano Meccanica S.A.",
  partitaIva: "24680",
  paese: "SM",
  regimeFiscale: "RF01",
  sede: { indirizzo: "Strada dei Censiti", cap: "47891", comune: "Serravalle", provincia: "SM" },
};

const SERVIZIO = {
  ...DOC,
  righe: [{
    descrizione: "Consulenza", quantita: "1", prezzoUnitario: "5000.00",
    aliquota: "0", natura: "N3.1", tm: "3",
  }],
};

test("il profilo si sceglie da chi emette, senza chiederlo due volte", () => {
  assert.equal(profileFor(SM).id, "sm-ut");
  assert.equal(profileFor(COMPANY).id, "it-sdi");
  // Un'anagrafica senza paese, o vuota, ricade sull'Italia invece di non avere profilo.
  assert.equal(profileFor({}).id, "it-sdi");
  assert.equal(profileFor(null).id, "it-sdi");
});

test("l'IdTrasmittente sammarinese è fisso, e non è il COE dell'azienda", () => {
  // **Con un codice diverso il documento non passa la validazione dell'Ufficio Tributario**, prima
  // ancora di arrivare allo SdI: le fatture partono dall'HUB, che è il trasmittente per tutti.
  const { text } = build(SERVIZIO, { company: SM, party: PARTY });
  const trasmissione = text.split("</DatiTrasmissione>")[0];
  assert.match(trasmissione, /<IdCodice>96428100588<\/IdCodice>/);
  assert.ok(!trasmissione.includes("<IdCodice>24680</IdCodice>"), "ha usato il COE come trasmittente");
  // Il COE resta dov'è suo: nell'anagrafica di chi emette.
  assert.match(text.split("</CedentePrestatore>")[0], /<IdCodice>24680<\/IdCodice>/);
});

test("il codice TM sta sulla riga e in testa alla nota di esenzione", () => {
  const { text } = build(SERVIZIO, { company: SM, party: PARTY });
  assert.match(text, /<AltriDatiGestionali>\s*<TipoDato>TM<\/TipoDato>\s*<RiferimentoTesto>3<\/RiferimentoTesto>/);
  assert.match(text, /<RiferimentoNormativo>TM:3,Non imp\. art\.8 DPR 633\/72<\/RiferimentoNormativo>/);
});

test("un'azienda italiana non scrive né il TM né il testo sammarinese", () => {
  // Lo stesso documento, cambiando solo chi emette: il codice sulla riga sparisce e la norma torna
  // quella italiana, più completa. È la ragione per cui la differenza sta in un profilo.
  const { text } = build(SERVIZIO, { company: COMPANY, party: PARTY });
  assert.ok(!text.includes("AltriDatiGestionali"));
  assert.match(text, /<RiferimentoNormativo>Operazione non imponibile - esportazione/);
});

test("il codice TM torna nel riepilogo solo se le righe sono d'accordo", () => {
  const misto = {
    ...DOC,
    righe: [
      { descrizione: "A", quantita: "1", prezzoUnitario: "100", aliquota: "0", natura: "N3.1", tm: "3" },
      { descrizione: "B", quantita: "1", prezzoUnitario: "100", aliquota: "0", natura: "N3.1", tm: "4" },
    ],
  };
  const { text } = build(misto, { company: SM, party: PARTY });
  // Un riepilogo porta un riferimento solo, e non si può spezzare: il tracciato lo indicizza su
  // aliquota e natura, e due blocchi con la stessa coppia vengono scartati. Quindi niente prefisso,
  // e `validate.js` lo segnala invece di sceglierne uno di nascosto.
  assert.ok(!text.includes("<RiferimentoNormativo>TM:"));
  // Le righe però tengono ciascuna il proprio: quella parte del file è per riga.
  assert.match(text, /<RiferimentoTesto>3<\/RiferimentoTesto>/);
  assert.match(text, /<RiferimentoTesto>4<\/RiferimentoTesto>/);
});

test("un indirizzo sammarinese tiene il suo CAP e la sua provincia", () => {
  // Verificato su una fattura registrata davvero: un emittente sammarinese scrive `47899` e
  // `Provincia SM`. Il codice trattava «non Italia» come «estero» e ci metteva `00000`, che è la
  // regola per un paese che i CAP italiani non li usa — e San Marino li usa.
  const sm = {
    ...COMPANY,
    paese: "SM",
    partitaIva: "29141",
    sede: { indirizzo: "Via Prova", cap: "47899", comune: "Serravalle", provincia: "SM" },
  };
  const { text } = build(DOC, { company: sm, party: PARTY });
  assert.match(text, /<CAP>47899<\/CAP>/);
  assert.match(text, /<Provincia>SM<\/Provincia>/);
  assert.ok(!text.includes("<CAP>00000</CAP>"), "ha cancellato il CAP sammarinese");
});

test("un indirizzo davvero estero resta senza CAP e senza provincia", () => {
  const de = {
    denominazione: "Beispiel GmbH",
    paese: "DE",
    partitaIva: "DE123456789",
    sede: { indirizzo: "Musterstrasse", cap: "10115", comune: "Berlin", provincia: "BE" },
  };
  const { text } = build(DOC, { company: COMPANY, party: de });
  // Il CAP tedesco non entra: il tracciato conosce solo i CAP italiani, e uno vero lì è un file
  // scartato. La provincia sparisce del tutto.
  assert.match(text, /<CAP>00000<\/CAP>/);
  assert.ok(!text.includes("<Provincia>BE</Provincia>"));
});

test("un preventivo e un documento di trasporto vengono rifiutati, non tradotti", () => {
  // Senza questo controllo il file uscirebbe con la parola «preventivo» dentro `TipoDocumento`, e
  // sarebbe scartato in ricezione — dopo che l'app ha già segnato il documento come esportato e
  // mosso il contatore di trasmissione, che non tornano indietro né l'uno né l'altro.
  for (const tipo of ["preventivo", "ddt"]) {
    assert.throws(
      () => build({ ...DOC, tipo }, { company: COMPANY, party: PARTY }),
      /non diventa un file FatturaPA/,
      tipo,
    );
  }
});

test("una fattura differita porta i DDT da cui nasce", () => {
  const differita = {
    ...DOC,
    tipo: "TD24",
    ddt: [{ numero: "DDT 2026/0001", data: "2026-08-20" }],
  };
  const { text } = build(differita, { company: COMPANY, party: PARTY });
  assert.match(text, /<NumeroDDT>DDT 2026\/0001<\/NumeroDDT>/);
  assert.match(text, /<DataDDT>2026-08-20<\/DataDDT>/);
  // È il blocco che lega la fattura alla merce già partita: senza, una TD24 è una TD01 con un nome
  // diverso, e la data di consegna non è dimostrabile da nessuna parte.
  assert.ok(text.indexOf("<DatiDDT>") < text.indexOf("<DatiBeniServizi>"));
});

console.log(`fatturapa: ${passed} prove passate`);
