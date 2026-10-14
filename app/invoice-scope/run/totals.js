// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

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

import { from, add, sub, mul, mulDiv, percent, round, sum, toString, ZERO, cmp } from "./decimal.js";

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
function _riepilogoKey(line, conTm) {
  // The rate as a number and not as it was written: `22`, `22.0` and `22.00` are one rate, and a
  // price-list item saved as `22.0` next to a typed `22` made two summaries both at 22,00 — which the
  // SdI rejects (00422) and the screen showed as two rows.
  const base = `${_rateKey(line.aliquota)}|${line.natura || ""}|${line.esigibilita || ""}`;
  return conTm ? `${base}|${line.tm || ""}` : base;
}

/** A rate in one spelling, for grouping. Unreadable text stays as it is, for validate.js to name. */
function _rateKey(aliquota) {
  try {
    return toString(from(aliquota ?? "0"), MONEY);
  } catch (ignored) {
    return String(aliquota);
  }
}

/**
 * Whether a line carries the withholding.
 *
 * **Every line but an excluded one (N1).** N1 is where a professional's invoice puts the expenses
 * paid in the customer's name (art. 15): they are not a fee, and the withholding is not taken on
 * them. Everything else on the invoice is the fee. The flag is also what the file needs: with
 * `DatiRitenuta` present the SdI wants at least one line marked `<Ritenuta>SI</Ritenuta>` (00411),
 * and the base the tax is taken on is the sum of those lines and nothing else.
 */
export function soggettaRitenuta(line) {
  // Said on the line when the person decided it (the «R» column of the document): an expense
  // that is not N1, a fee booked at zero rate. Otherwise the rule above.
  if (typeof line.soggettaRitenuta === "boolean") return line.soggettaRitenuta;
  return line.natura !== "N1";
}

/**
 * The natures on which the stamp duty is not due even above the threshold.
 *
 * Exports (N3.1), intra-EU supplies (N3.2) and reverse charge (N6.x) are exempt from the duty; a
 * declaration of intent (N3.5), an out-of-scope service (N2.x) or an exempt one (N4) are not.
 */
function _senzaBollo(natura) {
  return natura === "N3.1" || natura === "N3.2" || String(natura || "").startsWith("N6");
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
export function totals(doc, { tm: conTm = false } = {}) {
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

  // **L'esigibilità del documento scende sulle righe tassate.** Split payment (S) and deferred VAT
  // (D) are said once, on the document; the summary key carries them, and only where there is a tax
  // to make exigible — a line with a nature has none.
  const esigibilitaDoc = ["I", "D", "S"].includes(doc.esigibilita) ? doc.esigibilita : null;
  if (esigibilitaDoc) {
    for (const line of righe) if (!line.natura && !line.esigibilita) line.esigibilita = esigibilitaDoc;
  }

  // **The pension contribution (cassa previdenziale)** is a percentage of the fees, and it is taxed:
  // it joins the summary of its own rate, which is how control 00422 recomputes the taxable amount.
  // The fees are the lines that are not excluded expenses (N1), after the document discount.
  const cassa = _cassa(doc, righe);
  if (cassa) {
    righe.push({
      _cassa: true, aliquota: cassa.aliquotaIva, natura: cassa.natura || undefined,
      esigibilita: cassa.natura ? undefined : (esigibilitaDoc || undefined),
      prezzoTotale: cassa.importo, tm: undefined,
    });
  }

  const grouped = new Map();
  for (const line of righe) {
    const key = _riepilogoKey(line, conTm);
    const found = grouped.get(key);
    if (found) {
      found.imponibile = add(found.imponibile, line.prezzoTotale);
      // **Il codice TM sta sulla riga, e il riepilogo ne porta uno solo**, perché finisce dentro
      // `RiferimentoNormativo` e di quello ce n'è uno per riepilogo.
      //
      // Sui canali che il codice lo usano, `conTm` lo mette nella chiave e questo ramo raccoglie
      // solo righe che quel codice ce l'hanno uguale. Dove il codice non si scrive — lo SdI
      // italiano — il riepilogo non lo porta comunque, quindi non c'è niente da conciliare.
      if (!conTm) found.tm = null;
    } else {
      grouped.set(key, {
        aliquota: line.aliquota,
        natura: line.natura || null,
        esigibilita: line.esigibilita || null,
        imponibile: line.prezzoTotale,
        tm: conTm ? (line.tm || null) : null,
      });
    }
  }

  const riepiloghi = [...grouped.values()];
  // The contribution was a pseudo-line for the summary only: the document's lines are the real ones.
  if (cassa) righe.pop();

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
  // What counts towards the stamp-duty threshold: the untaxed amounts, less the exempt natures.
  const soggettoBollo = sum(riepiloghi.filter((r) => r.natura && !_senzaBollo(r.natura)).map((r) => r.imponibile));
  const bollo = doc.bollo ? BOLLO : ZERO;
  if (doc.ritenuta) for (const line of righe) line.ritenuta = soggettaRitenuta(line);
  // A contribution declared subject to the withholding (the INPS 4%, for instance) adds to its base.
  const baseRitenuta = add(sum(righe.filter((line) => line.ritenuta).map((line) => line.prezzoTotale)),
    cassa && cassa.ritenuta && doc.ritenuta ? cassa.importo : ZERO);
  const ritenuta = _ritenuta(doc, baseRitenuta);
  // **Split payment: the customer pays the VAT to the revenue, not to us.** What is owed — and the
  // amount of the payment — leaves out the tax of the summaries in S; the document total does not.
  const impostaScissa = sum(riepiloghi.filter((r) => r.esigibilita === "S").map((r) => r.imposta));

  return {
    righe,
    riepiloghi,
    imponibile,
    imposta,
    senzaImposta,
    bollo,
    ritenuta: ritenuta.importo,
    scontoDocumento: documentDiscount,
    // What the customer owes: stamp included and withholding excluded, because the withholding is
    // paid to the revenue and not to us. It is the amount of the payment (ImportoPagamento).
    totale: sub(sub(add(add(imponibile, imposta), bollo), ritenuta.importo), impostaScissa),
    impostaScissa,
    cassa,
    // What the tracciato calls ImportoTotaleDocumento: the document with its tax and its stamp,
    // **before** the withholding. The withholding has its own block (DatiRitenuta) and comes off
    // only the payment; a total already net of it is a figure the recipient's software then sees
    // as different from the sum of the summaries.
    totaleDocumento: add(add(imponibile, imposta), bollo),
    baseRitenuta,
    bolloDovuto: bolloDovuto(soggettoBollo),
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
  // A rate left blank is no withholding rather than a crash: validate.js names it before issuing.
  let aliquota;
  try {
    aliquota = from(doc.ritenuta.aliquota ?? "0");
  } catch (ignored) {
    aliquota = ZERO;
  }
  return { importo: percent(base, aliquota, MONEY) };
}

/** The pension contribution of a document, or `null`: its base, its amount, its rate and nature. */
function _cassa(doc, righe) {
  const c = doc.cassa;
  if (!c || !c.tipo) return null;
  let aliquota;
  try {
    aliquota = from(c.aliquota ?? "0");
  } catch (ignored) {
    return null;
  }
  const imponibileCassa = sum(righe.filter((line) => line.natura !== "N1").map((line) => line.prezzoTotale));
  return {
    tipo: c.tipo,
    aliquota: toString(aliquota, MONEY),
    imponibile: imponibileCassa,
    importo: percent(imponibileCassa, aliquota, MONEY),
    aliquotaIva: String(c.aliquotaIva ?? "22"),
    natura: c.natura || null,
    ritenuta: Boolean(c.ritenuta),
  };
}

/**
 * Whether the stamp duty is due: more than 77,47 € carrying no IVA.
 *
 * The amount passed in is already without the exempt natures (`_senzaBollo`).
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
/**
 * Se il riepilogo di questo canale è indicizzato anche sul codice TM.
 *
 * Una funzione e non un campo letto a mano, perché la domanda la fanno in tre — l'emettitore, i
 * controlli e la maschera — e la risposta deve essere la stessa in tutti e tre: due riepiloghi
 * diversi fra quello che si vede e quello che si scrive sarebbero un difetto invisibile.
 */
export function chiaveConTm(profile) {
  return Boolean(profile && profile.datiGestionali);
}

export function rate(totale, count) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`rate non valide: ${count}`);
  const each = mulDiv(totale, from(1), from(count), MONEY);
  const parts = Array.from({ length: count - 1 }, () => each);
  return [...parts, sub(totale, sum(parts))];
}
