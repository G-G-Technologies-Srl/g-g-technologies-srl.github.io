// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Lines in, totals out, in the one order that agrees with the SdI.
//
// The order of the roundings is not a detail and it is not negotiable, so it is written here once
// and nowhere else:
//
//  1. **line** — quantity × unit price, less the line discount, rounded to two;
//  2. **riepilogo** — one per (aliquota, natura, esigibilità) triple: the imponibile is the sum of
//     line totals *already rounded*;
//  3. **imposta** — imponibile × aliquota, rounded to two, **on the riepilogo and never per line**;
//  4. **document** — the riepiloghi, plus the bollo, less the ritenuta.
//
// Step 3 is the one that gets written wrong. Taxing each line and adding the results drifts by a
// cent or two on a long invoice, and it is exactly what the SdI recomputes and rejects. Taxing the
// sum cannot drift, because there is only one rounding.
//
// **What a riepilogo is keyed by.** Not the rate alone: two lines both at 0% are not the same
// riepilogo if one is an export (N3.1) and the other exempt (N4), and the tracciato wants them
// apart with their own RiferimentoNormativo. The key is the triple, and the natura is part of it.
//
// **Discounts.** A line discount lands inside the line total, at step 1. A document discount is a
// different animal: it moves the imponibile of every riepilogo, so it is spread across them in
// proportion, and the last one absorbs the remainder — otherwise the parts do not add back up to
// the whole, which is the classic way a 100,00 € discount becomes 99,99 €.
//
// No DOM in here: `node app/invoice-scope/test/totals.mjs` runs it directly.

import { from, add, sub, mul, mulDiv, percent, round, sum, ZERO, cmp } from "./decimal.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** Money and tax carry two decimals; quantities and unit prices may carry eight. */
export const MONEY = 2;

/** The virtual stamp duty, and the threshold above which it is due. */
export const BOLLO = from("2.00");
export const BOLLO_SOGLIA = from("77.47");

/**
 * The article of law each nature stands on.
 *
 * `RiferimentoNormativo` is what tells the recipient *why* there is no VAT, and a summary that
 * carries a nature without it is a summary that says "not taxed" and refuses to say under what.
 * The app filled the element from a field nothing ever set, so it was dropped from every file.
 *
 * The texts are the ones in ordinary use; they are not a legal opinion, and the person issuing the
 * document remains the one who decides which nature applies.
 *
 * **Sono il testo predefinito, e un profilo può sostituirlo.** L'Ufficio Tributario sammarinese su
 * questo campo vuole una forma precisa, che non è la nostra: la porta `SM_UT` in `fatturapa.js`,
 * dove stanno le cose che dipendono da chi riceve il file. Qui resta la formulazione italiana, più
 * completa, che era giusta e che per un attimo avevo riscritto con quella sammarinese — cioè avevo
 * fatto pagare a tutti una regola di uno.
 */
export const RIFERIMENTI = {
  N1: "Operazione esclusa ex art. 15 DPR 633/72",
  "N2.1": "Operazione non soggetta ex artt. 7 - 7-septies DPR 633/72",
  "N2.2": "Operazione non soggetta a IVA",
  "N3.1": "Operazione non imponibile - esportazione ex artt. 8, 8-bis, 9 DPR 633/72",
  "N3.2": "Operazione non imponibile - cessione intracomunitaria ex art. 41 DL 331/93",
  "N3.3": "Operazione non imponibile - cessione verso San Marino ex art. 71 DPR 633/72",
  "N3.4": "Operazione non imponibile - assimilata alle esportazioni ex art. 8-bis DPR 633/72",
  "N3.5": "Operazione non imponibile - dichiarazione d'intento ex art. 8 c.1 lett. c) DPR 633/72",
  "N3.6": "Operazione non imponibile - altre operazioni che non concorrono al plafond",
  N4: "Operazione esente ex art. 10 DPR 633/72",
  N5: "Regime del margine - IVA non esposta in fattura",
  "N6.1": "Inversione contabile - cessione di rottami ex art. 74 c.7-8 DPR 633/72",
  "N6.2": "Inversione contabile - cessione di oro e argento ex art. 17 c.5 DPR 633/72",
  "N6.3": "Inversione contabile - subappalto nel settore edile ex art. 17 c.6 lett. a) DPR 633/72",
  "N6.4": "Inversione contabile - cessione di fabbricati ex art. 17 c.6 lett. a-bis) DPR 633/72",
  "N6.5": "Inversione contabile - cessione di telefoni cellulari ex art. 17 c.6 lett. b) DPR 633/72",
  "N6.6": "Inversione contabile - cessione di prodotti elettronici ex art. 17 c.6 lett. c) DPR 633/72",
  "N6.7": "Inversione contabile - prestazioni comparto edile ex art. 17 c.6 lett. a-ter) DPR 633/72",
  "N6.8": "Inversione contabile - operazioni settore energetico ex art. 17 c.6 lett. d-bis/ter/quater) DPR 633/72",
  "N6.9": "Inversione contabile - altri casi",
  N7: "IVA assolta in altro Stato UE",
};

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * The key a line is summarised under.
 *
 * A string rather than an object so it can be a Map key directly. The parts cannot contain a
 * vertical bar — they are a rate, a code from a closed list, and a single letter — so no escaping
 * is needed and none is pretended.
 */
function _riepilogoKey(line) {
  return `${line.aliquota}|${line.natura || ""}|${line.esigibilita || ""}`;
}

/**
 * A line's own total: quantity × price, less its discount, rounded to money.
 *
 * The discount is applied *before* the rounding, so a percentage discount on an eight-decimal
 * price is not rounded twice. `sconto` is either `{ percentuale }` or `{ importo }`; anything else
 * is ignored rather than guessed at, because guessing here changes an amount.
 */
function _lineTotal(line) {
  const quantita = from(line.quantita ?? "1");
  const prezzo = from(line.prezzoUnitario ?? "0");
  // **The discount comes off the unit price, and the quantity multiplies what is left.** Control
  // 00423 states the formula: PrezzoTotale = [PrezzoUnitario − Importo] × Quantita. Taking it off
  // the line total instead — which is the reading that comes to mind first — gives the same answer
  // only when the quantity is one, and a rejected file for every other quantity: ten hours at
  // 80,00 less 50,00 is 300,00 to the SdI and was 750,00 here.
  const netto = sub(prezzo, _discount(prezzo, line.sconto));
  return round(mul(quantita, netto, 8), MONEY);
}

/**
 * The value of a discount against a unit price.
 *
 * **When both an amount and a percentage are given, only the amount counts.** That is the text of
 * control 00423, and the app has to agree with it rather than pick: the alternative is a file
 * whose two fields say one thing and whose total says another. `validate.js` refuses the pair
 * outright, so this branch is the second line of defence and not the policy.
 */
function _discount(base, sconto) {
  if (!sconto) return ZERO;
  if (sconto.importo !== undefined) return from(sconto.importo);
  if (sconto.percentuale !== undefined) return percent(base, from(sconto.percentuale), 8);
  return ZERO;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Every total of a document, from its lines.
 *
 * Returns plain scaled values — no formatting, no strings — because the caller that writes XML and
 * the caller that draws a screen want different text from the same numbers.
 *
 * `doc` is `{ righe, scontoDocumento, bollo, ritenuta }`, and only `righe` is required.
 */
export function totals(doc) {
  const righe = (doc.righe || []).map((line, index) => ({
    ...line,
    numero: index + 1,
    prezzoTotale: _lineTotal(line),
  }));

  // **A document discount is shared across the lines, not across the summaries.** Control 00422
  // requires ImponibileImporto to equal the sum of the PrezzoTotale of its lines, within a euro:
  // reducing the summaries while leaving the lines untouched — which is what this did first —
  // produced a file where 1600,00 of lines carried a taxable amount of 1440,00, and the SdI
  // rejects it. Taking it off the lines keeps the two in step and needs no 2.1.1.8 element.
  //
  // The last line absorbs the remainder, for the same reason the summaries did: three lines
  // sharing 100,00 € each get 33,33 € and a cent has to live somewhere.
  const documentDiscount = _discount(sum(righe.map((line) => line.prezzoTotale)), doc.scontoDocumento);
  if (documentDiscount !== ZERO) {
    const base = sum(righe.map((line) => line.prezzoTotale));
    const amount = round(documentDiscount, MONEY);
    let assigned = ZERO;
    righe.forEach((line, index) => {
      const share = index === righe.length - 1
        ? sub(amount, assigned)
        : mulDiv(amount, line.prezzoTotale, base, MONEY);
      assigned = add(assigned, share);
      line.prezzoTotale = sub(line.prezzoTotale, share);
      line.scontoRipartito = share;
    });
  }

  const grouped = new Map();
  for (const line of righe) {
    const key = _riepilogoKey(line);
    const found = grouped.get(key);
    if (found) {
      found.imponibile = add(found.imponibile, line.prezzoTotale);
      // **Il codice TM sta sulla riga, ma il riepilogo ne porta uno solo**, perché finisce dentro
      // `RiferimentoNormativo` e di quello ce n'è uno per riepilogo. E il riepilogo non si può
      // spezzare per separarli: il tracciato lo indicizza su aliquota e natura, e due blocchi con
      // la stessa coppia vengono scartati. Quindi righe dello stesso gruppo con codici diversi
      // lasciano il riepilogo senza codice, e `validate.js` lo dice invece di sceglierne uno.
      if ((line.tm || null) !== found.tm) {
        found.tm = null;
        found.tmMisto = true;
      }
    } else {
      grouped.set(key, {
        aliquota: line.aliquota,
        natura: line.natura || null,
        esigibilita: line.esigibilita || null,
        imponibile: line.prezzoTotale,
        tm: line.tm || null,
        tmMisto: false,
      });
    }
  }

  const riepiloghi = [...grouped.values()];

  for (const r of riepiloghi) {
    r.imposta = percent(r.imponibile, from(r.aliquota), MONEY);
    // Only where there is a nature: on a taxed summary the element is not allowed at all.
    //
    // Qui esce la norma e basta. Il codice TM davanti — `TM:3,…` — lo mette `fatturapa.js`, perché
    // dipende dal profilo di chi riceve il file e non dai conti.
    if (r.natura) r.riferimentoNormativo = RIFERIMENTI[r.natura] || null;
  }

  const imponibile = sum(riepiloghi.map((r) => r.imponibile));
  const imposta = sum(riepiloghi.map((r) => r.imposta));

  const senzaImposta = sum(riepiloghi.filter((r) => r.natura).map((r) => r.imponibile));
  const bollo = doc.bollo ? BOLLO : ZERO;
  const ritenuta = _ritenuta(doc, imponibile);

  return {
    righe,
    riepiloghi,
    imponibile,
    imposta,
    senzaImposta,
    bollo,
    ritenuta: ritenuta.importo,
    scontoDocumento: documentDiscount,
    // What the tracciato calls ImportoTotaleDocumento: what the customer owes, stamp included and
    // withholding excluded, because the withholding is paid to the revenue and not to us.
    totale: sub(add(add(imponibile, imposta), bollo), ritenuta.importo),
    bolloDovuto: bolloDovuto(senzaImposta),
  };
}

/**
 * The withholding, worked out on the imponibile and never on the total.
 *
 * It does not touch the IVA: it comes off the amount to be paid at the very end. Getting this
 * backwards inflates or deflates the tax on every professional invoice.
 */
function _ritenuta(doc, imponibile) {
  if (!doc.ritenuta) return { importo: ZERO };
  const base = doc.ritenuta.imponibile !== undefined ? from(doc.ritenuta.imponibile) : imponibile;
  return { importo: percent(base, from(doc.ritenuta.aliquota), MONEY) };
}

/**
 * Whether the stamp duty is due: more than 77,47 € carrying no IVA.
 *
 * **Every kind of untaxed amount counts** — esenti, non imponibili, escluse, fuori campo — not
 * just the "non soggette". Reading the threshold as applying to N2 alone is a real mistake with a
 * real cost, and the app proposes rather than imposes: the threshold is a rule, charging it on to
 * the customer is a commercial choice.
 */
export function bolloDovuto(senzaImposta) {
  return cmp(senzaImposta, BOLLO_SOGLIA) > 0;
}

/**
 * The instalments of a payment plan, with the remainder on the last one.
 *
 * Same reasoning as the spread discount: three equal parts of 100,00 € are 33,33 € and a cent has
 * to live somewhere. It lives at the end, where the customer expects the balance.
 */
export function rate(totale, count) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`rate non valide: ${count}`);
  const each = mulDiv(totale, from(1), from(count), MONEY);
  const parts = Array.from({ length: count - 1 }, () => each);
  return [...parts, sub(totale, sum(parts))];
}
