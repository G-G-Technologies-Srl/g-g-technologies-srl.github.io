// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The totals of a document, on cases built to break them.
//
// The rule this file exists to defend: **the imposta is worked out on the riepilogo, never per
// line.** Taxing each line and adding the results drifts by a cent or two on a long invoice, the
// SdI recomputes it the other way, and the invoice comes back. Several cases below are exactly
// the shape where the two methods disagree, with the difference written out by hand.
//
// Every expected number here was worked out on paper first. Where it is not obvious, the working
// is in the comment above it.
//
//     node app/invoice-scope/test/totals.mjs

import assert from "node:assert/strict";

import { from, toString, sum, add } from "../run/decimal.js";
import { totals, rate, bolloDovuto, BOLLO } from "../run/totals.js";

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

const money = (value) => toString(value, 2);

/** A line, with the fields a document actually carries. */
function line(quantita, prezzoUnitario, aliquota, extra = {}) {
  return { descrizione: "voce", quantita, prezzoUnitario, aliquota, ...extra };
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   r i g a
// -----------------------------------------------------------------------------------------------------------------

test("una riga sola, il caso più semplice che esista", () => {
  const t = totals({ righe: [line("2", "100.00", "22")] });
  assert.equal(money(t.righe[0].prezzoTotale), "200.00");
  assert.equal(money(t.imponibile), "200.00");
  assert.equal(money(t.imposta), "44.00");
  assert.equal(money(t.totale), "244.00");
});

test("le righe sono numerate da uno, nell'ordine in cui arrivano", () => {
  const t = totals({ righe: [line("1", "10", "22"), line("1", "20", "22"), line("1", "30", "22")] });
  assert.deepEqual(t.righe.map((r) => r.numero), [1, 2, 3]);
});

test("una quantità con otto decimali non si perde per strada", () => {
  // 1234.56789 × 0.08745 = 107.9629619805 → 107.96
  const t = totals({ righe: [line("1234.56789", "0.08745", "22")] });
  assert.equal(money(t.righe[0].prezzoTotale), "107.96");
});

test("uno sconto di riga entra prima dell'arrotondamento", () => {
  // 250.00 meno il 15% = 212.50
  const t = totals({ righe: [line("1", "250.00", "22", { sconto: { percentuale: "15" } })] });
  assert.equal(money(t.righe[0].prezzoTotale), "212.50");
  assert.equal(money(t.imposta), "46.75");
});

test("uno sconto di riga a importo fisso", () => {
  const t = totals({ righe: [line("1", "250.00", "22", { sconto: { importo: "50.00" } })] });
  assert.equal(money(t.righe[0].prezzoTotale), "200.00");
});

test("una riga senza quantità e senza prezzo vale zero, non NaN", () => {
  const t = totals({ righe: [{ descrizione: "voce", aliquota: "22" }] });
  assert.equal(money(t.righe[0].prezzoTotale), "0.00");
  assert.equal(money(t.totale), "0.00");
});

test("un documento senza righe non è un errore", () => {
  const t = totals({});
  assert.equal(t.riepiloghi.length, 0);
  assert.equal(money(t.totale), "0.00");
});

// -----------------------------------------------------------------------------------------------------------------
//  l ' i m p o s t a   s t a   s u l   r i e p i l o g o
// -----------------------------------------------------------------------------------------------------------------

test("tre righe che per riga darebbero un centesimo in più", () => {
  // 0.10 al 22% è 0.022 → per riga arrotonda a 0.02, tre volte fa 0.06.
  // Sul riepilogo: 0.30 al 22% è 0.066 → 0.07. La differenza è il centesimo che lo SdI contesta.
  const t = totals({ righe: [line("1", "0.10", "22"), line("1", "0.10", "22"), line("1", "0.10", "22")] });
  assert.equal(money(t.imponibile), "0.30");
  assert.equal(money(t.imposta), "0.07");
  const perLine = sum(t.righe.map(() => from("0.02")));
  assert.equal(money(perLine), "0.06");
  assert.notEqual(money(t.imposta), money(perLine));
});

test("dieci righe da 81.30, dove la deriva si vede", () => {
  // Per riga: 81.30 × 22% = 17.886 → 17.89, dieci volte = 178.90.
  // Sul riepilogo: 813.00 × 22% = 178.86. Quattro centesimi di differenza.
  const righe = Array.from({ length: 10 }, () => line("1", "81.30", "22"));
  const t = totals({ righe });
  assert.equal(money(t.imponibile), "813.00");
  assert.equal(money(t.imposta), "178.86");
  assert.equal(money(t.totale), "991.86");
});

test("un riepilogo per aliquota, e i totali sommano i riepiloghi", () => {
  const t = totals({ righe: [line("1", "100", "22"), line("1", "100", "10"), line("1", "100", "4")] });
  assert.equal(t.riepiloghi.length, 3);
  assert.equal(money(t.imponibile), "300.00");
  // 22.00 + 10.00 + 4.00
  assert.equal(money(t.imposta), "36.00");
  assert.equal(money(t.totale), "336.00");
});

test("righe con la stessa aliquota finiscono in un riepilogo solo", () => {
  const t = totals({ righe: [line("1", "100", "22"), line("1", "50", "22")] });
  assert.equal(t.riepiloghi.length, 1);
  assert.equal(money(t.riepiloghi[0].imponibile), "150.00");
});

test("due nature diverse a zero non sono lo stesso riepilogo", () => {
  // È la ragione per cui la chiave è la terna e non la sola aliquota: un'esportazione e
  // un'operazione esente hanno RiferimentoNormativo diversi e vanno separate.
  const t = totals({
    righe: [line("1", "100", "0", { natura: "N3.1" }), line("1", "100", "0", { natura: "N4" })],
  });
  assert.equal(t.riepiloghi.length, 2);
  assert.deepEqual(t.riepiloghi.map((r) => r.natura).sort(), ["N3.1", "N4"]);
  assert.equal(money(t.imposta), "0.00");
});

test("l'esigibilità separa i riepiloghi come la natura", () => {
  const t = totals({
    righe: [line("1", "100", "22", { esigibilita: "I" }), line("1", "100", "22", { esigibilita: "D" })],
  });
  assert.equal(t.riepiloghi.length, 2);
});

// -----------------------------------------------------------------------------------------------------------------
//  s c o n t o   s u l   d o c u m e n t o
// -----------------------------------------------------------------------------------------------------------------

test("uno sconto sul documento si spartisce e le parti tornano al totale", () => {
  // Tre riepiloghi da 100.00 e uno sconto di 100.00: 33.33 + 33.33 + 33.34.
  const t = totals({
    righe: [line("1", "100", "22"), line("1", "100", "10"), line("1", "100", "4")],
    scontoDocumento: { importo: "100.00" },
  });
  assert.equal(money(t.scontoDocumento), "100.00");
  assert.equal(money(t.imponibile), "200.00");
  const parts = t.riepiloghi.map((r) => money(r.imponibile));
  assert.deepEqual(parts, ["66.67", "66.67", "66.66"]);
});

test("lo sconto sul documento agisce prima dell'imposta, non dopo", () => {
  // 1000.00 meno il 10% = 900.00, e il 22% si calcola su 900.00: 198.00, non 220.00 meno qualcosa.
  const t = totals({
    righe: [line("1", "1000.00", "22")],
    scontoDocumento: { percentuale: "10" },
  });
  assert.equal(money(t.imponibile), "900.00");
  assert.equal(money(t.imposta), "198.00");
  assert.equal(money(t.totale), "1098.00");
});

test("lo sconto in proporzione, su riepiloghi disuguali", () => {
  // 900.00 e 100.00, sconto 100.00 → 90.00 e 10.00.
  const t = totals({
    righe: [line("1", "900.00", "22"), line("1", "100.00", "10")],
    scontoDocumento: { importo: "100.00" },
  });
  assert.deepEqual(t.riepiloghi.map((r) => money(r.imponibile)), ["810.00", "90.00"]);
});


test("lo sconto a importo si toglie dal prezzo unitario, non dal totale riga", () => {
  // Il controllo 00423 dello SdI: PrezzoTotale = [PrezzoUnitario − Importo] × Quantita.
  // 10 ore a 80,00 con sconto 50,00 valgono 300,00, non 750,00 — e la vecchia formula dava 750,00
  // per ogni quantità diversa da uno, cioè quasi sempre.
  const t = totals({ righe: [line("10", "80.00", "22", { sconto: { importo: "50.00" } })] });
  assert.equal(money(t.righe[0].prezzoTotale), "300.00");
});

test("con quantità uno le due formule coincidono, ed è la trappola", () => {
  // Il test originale usava proprio questo caso, e per questo non ha visto niente.
  const t = totals({ righe: [line("1", "250.00", "22", { sconto: { importo: "50.00" } })] });
  assert.equal(money(t.righe[0].prezzoTotale), "200.00");
});

test("con importo e percentuale insieme conta l'importo", () => {
  // Anche questo è testo del controllo 00423: «in caso di presenza contemporanea di Importo e
  // Percentuale si considera solo il primo». validate.js rifiuta la coppia; qui si prova che se
  // arriva comunque, il calcolo va nella stessa direzione del file.
  const t = totals({ righe: [line("2", "100.00", "22", { sconto: { importo: "5.00", percentuale: "10" } })] });
  assert.equal(money(t.righe[0].prezzoTotale), "190.00");
});

test("lo sconto sul documento resta dentro le righe, e i riepiloghi tornano", () => {
  // L'invariante del controllo 00422: ImponibileImporto è la somma dei PrezzoTotale delle sue
  // righe. Scontando i riepiloghi e lasciando stare le righe — come faceva la prima versione —
  // un documento da 1600,00 di righe dichiarava 1440,00 di imponibile, e veniva scartato.
  const t = totals({
    righe: [line("1", "1000.00", "22"), line("12", "50.00", "22")],
    scontoDocumento: { percentuale: "10" },
  });
  assert.equal(t.riepiloghi.length, 1);
  const sommaRighe = sum(t.righe.map((r) => r.prezzoTotale));
  assert.equal(money(sommaRighe), money(t.riepiloghi[0].imponibile));
  assert.equal(money(t.imponibile), "1440.00");
});

test("l'invariante dello sconto vale anche su più aliquote e con il resto", () => {
  const casi = [
    { righe: [line("1", "100", "22"), line("1", "100", "10"), line("1", "100", "4")],
      scontoDocumento: { importo: "100.00" } },
    { righe: [line("3", "33.33", "22"), line("7", "1.11", "10")],
      scontoDocumento: { percentuale: "7" } },
    { righe: [line("1", "0.03", "22"), line("1", "0.03", "22"), line("1", "0.03", "22")],
      scontoDocumento: { importo: "0.05" } },
  ];
  for (const doc of casi) {
    const t = totals(doc);
    const perRiepilogo = new Map();
    for (const riga of t.righe) {
      const key = `${riga.aliquota}|${riga.natura || ""}`;
      perRiepilogo.set(key, add(perRiepilogo.get(key) || from("0"), riga.prezzoTotale));
    }
    for (const r of t.riepiloghi) {
      const key = `${r.aliquota}|${r.natura || ""}`;
      assert.equal(money(r.imponibile), money(perRiepilogo.get(key)),
        "un riepilogo non è la somma delle sue righe: lo SdI lo scarta");
    }
    // E lo sconto speso è esattamente quello annunciato, non un centesimo di meno.
    assert.equal(money(sum(t.righe.map((r) => r.scontoRipartito || from("0")))),
      money(t.scontoDocumento));
  }
});

// -----------------------------------------------------------------------------------------------------------------
//  b o l l o
// -----------------------------------------------------------------------------------------------------------------

test("la soglia del bollo guarda tutto quello che non ha IVA", () => {
  assert.equal(bolloDovuto(from("77.47")), false);
  assert.equal(bolloDovuto(from("77.48")), true);
  assert.equal(bolloDovuto(from("0")), false);
});

test("il bollo è dovuto anche su un'esente, non solo su una non soggetta", () => {
  // L'errore che il piano segnala: leggere «non soggetto» come la sola N2.
  const t = totals({ righe: [line("1", "100.00", "0", { natura: "N4" })] });
  assert.equal(money(t.senzaImposta), "100.00");
  assert.equal(t.bolloDovuto, true);
});

test("un'imponibile con IVA non conta per la soglia", () => {
  const t = totals({ righe: [line("1", "1000.00", "22")] });
  assert.equal(money(t.senzaImposta), "0.00");
  assert.equal(t.bolloDovuto, false);
});

test("il bollo entra nel totale quando lo si addebita", () => {
  const t = totals({ righe: [line("1", "100.00", "0", { natura: "N4" })], bollo: true });
  assert.equal(money(t.bollo), "2.00");
  assert.equal(money(t.totale), "102.00");
  assert.equal(money(BOLLO), "2.00");
});

test("il bollo si propone ma non si impone", () => {
  // Dovuto per legge, non addebitato al cliente: il totale non lo contiene.
  const t = totals({ righe: [line("1", "100.00", "0", { natura: "N4" })] });
  assert.equal(t.bolloDovuto, true);
  assert.equal(money(t.bollo), "0.00");
  assert.equal(money(t.totale), "100.00");
});

// -----------------------------------------------------------------------------------------------------------------
//  r i t e n u t a
// -----------------------------------------------------------------------------------------------------------------

test("la ritenuta scende dal totale e non tocca l'IVA", () => {
  // 1000.00 + 220.00 di IVA = 1220.00; ritenuta del 20% su 1000.00 = 200.00; da pagare 1020.00.
  const t = totals({ righe: [line("1", "1000.00", "22")], ritenuta: { aliquota: "20" } });
  assert.equal(money(t.imposta), "220.00");
  assert.equal(money(t.ritenuta), "200.00");
  assert.equal(money(t.totale), "1020.00");
});

test("la ritenuta su una base propria, quando è diversa dall'imponibile", () => {
  const t = totals({
    righe: [line("1", "1000.00", "22")],
    ritenuta: { aliquota: "20", imponibile: "800.00" },
  });
  assert.equal(money(t.ritenuta), "160.00");
  assert.equal(money(t.totale), "1060.00");
});

// -----------------------------------------------------------------------------------------------------------------
//  i n s i e m e
// -----------------------------------------------------------------------------------------------------------------

test("una fattura con due aliquote, sconto, bollo e ritenuta", () => {
  // Righe: 3 × 81.30 al 22% = 243.90; 1 × 200.00 esente N4.
  // Sconto documento 10%: 44.39 di 443.90 → 24.39 sul primo, 20.00 sul secondo.
  //   443.90 × 10% = 44.39. Quota primo: 44.39 × 243.90 / 443.90 = 24.390... → 24.39.
  //   Resto sul secondo: 44.39 − 24.39 = 20.00.
  // Imponibili: 219.51 e 180.00. Imposta: 219.51 × 22% = 48.2922 → 48.29.
  // Senza imposta: 180.00 → sopra 77.47, bollo dovuto e addebitato: 2.00.
  // Ritenuta 20% su 399.51 = 79.902 → 79.90.
  // Totale: 399.51 + 48.29 + 2.00 − 79.90 = 369.90.
  const t = totals({
    righe: [
      line("3", "81.30", "22"),
      line("1", "200.00", "0", { natura: "N4" }),
    ],
    scontoDocumento: { percentuale: "10" },
    bollo: true,
    ritenuta: { aliquota: "20" },
  });
  assert.deepEqual(t.riepiloghi.map((r) => money(r.imponibile)), ["219.51", "180.00"]);
  assert.equal(money(t.imponibile), "399.51");
  assert.equal(money(t.imposta), "48.29");
  assert.equal(t.bolloDovuto, true);
  assert.equal(money(t.bollo), "2.00");
  assert.equal(money(t.ritenuta), "79.90");
  assert.equal(money(t.totale), "369.90");
});

test("i riepiloghi sommano sempre all'imponibile e all'imposta dichiarati", () => {
  // L'invariante che lo SdI verifica per primo, su un insieme di documenti diversi.
  const casi = [
    [line("1", "0.01", "22")],
    [line("7", "3.33", "10"), line("2", "1.11", "22")],
    [line("100", "0.07", "4"), line("1", "1000000.00", "22")],
    [line("1", "50", "0", { natura: "N3.1" }), line("1", "50", "0", { natura: "N1" })],
  ];
  for (const righe of casi) {
    const t = totals({ righe });
    assert.equal(money(sum(t.riepiloghi.map((r) => r.imponibile))), money(t.imponibile));
    assert.equal(money(sum(t.riepiloghi.map((r) => r.imposta))), money(t.imposta));
    const atteso = add(add(t.imponibile, t.imposta), t.bollo);
    assert.equal(money(t.totale), money(atteso), `il totale non torna su ${righe.length} righe`);
  }
});

// -----------------------------------------------------------------------------------------------------------------
//  r a t e
// -----------------------------------------------------------------------------------------------------------------

test("le rate sommano al totale, con il resto sull'ultima", () => {
  assert.deepEqual(rate(from("100.00"), 3).map(money), ["33.33", "33.33", "33.34"]);
  assert.deepEqual(rate(from("100.00"), 1).map(money), ["100.00"]);
  assert.deepEqual(rate(from("0.01"), 2).map(money), ["0.01", "0.00"]);
  for (const count of [2, 3, 4, 7, 12]) {
    assert.equal(money(sum(rate(from("1234.56"), count))), "1234.56");
  }
});

test("un numero di rate senza senso è un errore", () => {
  assert.throws(() => rate(from("100"), 0), RangeError);
  assert.throws(() => rate(from("100"), -1), RangeError);
  assert.throws(() => rate(from("100"), 2.5), RangeError);
});

console.log(`totals: ${passed} prove passate`);
