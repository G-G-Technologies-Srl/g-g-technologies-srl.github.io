// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// L'azienda che è già lì la prima volta che qualcuno apre `?demo=1`.
//
// **Un'app di fatturazione vuota non si capisce.** Le altre del catalogo mostrano qualcosa da sole
// — un gioco si gioca, un visualizzatore aspetta un file — mentre qui, senza dati, si vedono tre
// schermate bianche e un modulo da compilare: la domanda «che cosa fa» resta senza risposta proprio
// nei dieci secondi in cui viene posta. Da qui escono anche gli screenshot della scheda.
//
// **Costruito con le funzioni vere, non con record scritti a mano.** Le fatture passano da
// `issue()`, quindi prendono i numeri dal contatore, congelano i totali e superano `validate()`
// come quelle di chiunque. Un dimostrativo cucito a mano mostrerebbe uno stato che l'app non sa
// produrre, ed è il tipo di bugia che si scopre il giorno in cui si prova a rifare a mano quello
// che si è visto.
//
// **Nomi inventati, e nessun numero vero.** Le partite IVA hanno la cifra di controllo giusta —
// altrimenti `validate()` le rifiuterebbe e il dimostrativo non partirebbe — e non appartengono a
// nessuno. Vale la stessa regola dei tracciati sintetici di CSV Scope.
//
// **Le date sono relative a oggi**, così «scaduta da dieci giorni» è vero il giorno in cui uno
// arriva e non nel settembre 2026.

import { put } from "gg/store.js";

import { t } from "./i18n.js";
import { draft, save, issue, setState } from "./model.js";
import { recordPayment } from "./schedule.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * I nomi propri restano fuori dal dizionario.
 *
 * Una ragione sociale non si traduce: «Rossi Impianti S.r.l.» si chiama così anche per chi legge in
 * inglese, e metterla fra le chiavi vorrebbe dire due voci con lo stesso valore e due posti in cui
 * dimenticarsi di cambiarne una. Quello che invece è testo — le descrizioni delle righe, la causale
 * del trasporto — passa da `t()` come tutto il resto.
 */
const AZIENDA = {
  id: "company",
  denominazione: "Officine Marecchia S.r.l.",
  partitaIva: "00224466888",
  paese: "IT",
  regimeFiscale: "RF01",
  sede: {
    indirizzo: "Via delle Fonderie", numeroCivico: "12", cap: "47923",
    comune: "Rimini", provincia: "RN",
  },
  conti: [
    { id: "conto-1", etichetta: "Banca Malatestiana", iban: "IT60X0542811101000000123456", predefinito: true },
    { id: "conto-2", etichetta: "Conto secondario", iban: "IT02L1234512345123456789012", predefinito: false },
  ],
};

const CLIENTI = [
  {
    id: "demo-1", name: "rossi impianti s.r.l.", denominazione: "Rossi Impianti S.r.l.",
    partitaIva: "01335577993", codiceDestinatario: "M5UXCR1", paese: "IT",
    sede: { indirizzo: "Via Emilia", numeroCivico: "140", cap: "40068", comune: "Bologna", provincia: "BO" },
  },
  {
    id: "demo-2", name: "brandi e figli s.n.c.", denominazione: "Brandi & Figli S.n.c.",
    partitaIva: "02446688000", codiceDestinatario: "", paese: "IT",
    sede: { indirizzo: "Corso Garibaldi", numeroCivico: "7", cap: "61121", comune: "Pesaro", provincia: "PU" },
  },
  // Il cliente sammarinese senza codice destinatario: l'app scrive `2R4GTO8`, che è il codice
  // dell'Ufficio Tributario, e la fattura vuole natura N3.3 con aliquota zero. È il caso che la
  // scheda promette, quindi il dimostrativo lo mostra invece di dirlo soltanto.
  {
    id: "demo-3", name: "titano meccanica s.a.", denominazione: "Titano Meccanica S.A.",
    // Il COE senza la sigla del paese davanti: nel file `IdPaese` porta già «SM», e scrivere
    // «SM24680» qui produrrebbe `<IdPaese>SM</IdPaese><IdCodice>SM24680</IdCodice>` — il paese due
    // volte. Un dimostrativo insegna anche come si compila, e questa era la lezione sbagliata.
    partitaIva: "24680", codiceDestinatario: "", paese: "SM",
    // CAP vero e provincia SM: San Marino usa i CAP del sistema italiano, e il tracciato li vuole.
    sede: { indirizzo: "Strada dei Censiti", numeroCivico: "21", cap: "47891", comune: "Serravalle", provincia: "SM" },
  },
];

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Una data spostata di `n` giorni da oggi, nella forma che l'app usa dappertutto. */
function _giorno(n) {
  const data = new Date();
  data.setDate(data.getDate() + n);
  return data.toISOString().slice(0, 10);
}

/** L'unità di ogni voce del listino, per nome: ore per il lavoro, pezzi per le cose. */
const UNITA = () => ({
  [t("demoItemProgettazione")]: t("demoUnitHour"),
  [t("demoItemOfficina")]: t("demoUnitHour"),
  [t("demoItemTelaio")]: t("demoUnitPiece"),
  [t("demoItemCollaudo")]: t("demoUnitPiece"),
});

function _riga(descrizione, quantita, prezzo, extra = {}) {
  // Con l'unità della voce di listino: senza, le righe del dimostrativo uscivano con un trattino
  // dove il listino accanto diceva «ora» e «pz».
  return { descrizione, quantita, unitaMisura: UNITA()[descrizione] || "", prezzoUnitario: prezzo, aliquota: "22", ...extra };
}

/** Una bozza salvata ed emessa in un colpo: è quello che fa lo schermo, due chiamate più in là. */
async function _emetti(db, fields, context) {
  return issue(db, await save(db, draft(fields)), context);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Riempi il deposito del dimostrativo.
 *
 * Awaited prima della prima schermata: sotto lo screenshot non c'è tempo per un secondo giro di
 * disegno, e una schermata che si popola dopo lo scatto è una schermata vuota nella scheda.
 */
export async function seed(db) {
  await put(db, "company", AZIENDA);
  for (const cliente of CLIENTI) await put(db, "parties", cliente);

  const listino = [
    ["demo-v1", t("demoItemProgettazione"), "80.00", t("demoUnitHour")],
    ["demo-v2", t("demoItemOfficina"), "45.00", t("demoUnitHour")],
    ["demo-v3", t("demoItemTelaio"), "250.00", t("demoUnitPiece")],
    ["demo-v4", t("demoItemCollaudo"), "320.00", t("demoUnitPiece")],
  ];
  for (const [id, descrizione, prezzoUnitario, unitaMisura] of listino) {
    await put(db, "items", {
      id, name: descrizione.toLowerCase(), descrizione, prezzoUnitario, unitaMisura, aliquota: "22",
    });
  }

  const contesto = (cliente) => ({ company: AZIENDA, party: cliente });
  const iban = AZIENDA.conti[0].iban;

  // Una fattura scaduta da dieci giorni: è quello che fa comparire il numero rosso in Situazione e
  // la parte accesa nella prima colonna del grafico.
  await _emetti(db, {
    tipo: "TD01",
    data: _giorno(-40),
    partyId: "demo-1",
    righe: [_riga(t("demoItemProgettazione"), "24", "80.00"), _riga(t("demoItemCollaudo"), "1", "320.00")],
    pagamento: { condizioni: "TP02", modalita: "MP05", iban, rate: [{ scadenza: _giorno(-10) }] },
  }, contesto(CLIENTI[0]));

  // Una incassata a metà: la riga dello scadenzario resta, per il resto.
  const parziale = await _emetti(db, {
    tipo: "TD01",
    data: _giorno(-20),
    partyId: "demo-2",
    righe: [_riga(t("demoItemTelaio"), "6", "250.00")],
    pagamento: { condizioni: "TP02", modalita: "MP05", iban, rate: [{ scadenza: _giorno(12) }] },
  }, contesto(CLIENTI[1]));
  // Un acconto, sul conto principale, con la nota che spiega perché non è tutto: è il caso più
  // comune di tutti, e quello che la prima versione dell'app non sapeva registrare.
  await recordPayment(db, parziale, {
    importo: "1000.00",
    data: _giorno(-3),
    conto: AZIENDA.conti[0],
    nota: t("demoPaymentNote"),
  });

  // A rate, perché due scadenze sullo stesso documento sono il caso che il tracciato scrive in un
  // modo solo e che si sbaglia più spesso.
  await _emetti(db, {
    tipo: "TD01",
    data: _giorno(-5),
    partyId: "demo-1",
    righe: [_riga(t("demoItemProgettazione"), "40", "80.00")],
    pagamento: {
      condizioni: "TP01",
      modalita: "MP05",
      iban,
      rate: [{ scadenza: _giorno(25) }, { scadenza: _giorno(55) }],
    },
  }, contesto(CLIENTI[0]));

  // San Marino: aliquota zero e natura N3.3, che è la cessione verso San Marino.
  await _emetti(db, {
    tipo: "TD01",
    data: _giorno(-12),
    partyId: "demo-3",
    righe: [_riga(t("demoItemTelaio"), "4", "250.00", { aliquota: "0", natura: "N3.3" })],
    pagamento: { condizioni: "TP02", modalita: "MP05", iban, rate: [{ scadenza: _giorno(18) }] },
  }, contesto(CLIENTI[2]));

  // Un preventivo accettato, pronto da trasformare in fattura: è il comando che il visitatore trova
  // sulla riga dell'elenco, ed è la cosa che la scheda promette per prima.
  const preventivo = await _emetti(db, {
    tipo: "preventivo",
    data: _giorno(-8),
    partyId: "demo-2",
    validoFino: _giorno(22),
    causale: t("demoQuoteCausale"),
    righe: [_riga(t("demoItemProgettazione"), "60", "80.00"), _riga(t("demoItemOfficina"), "40", "45.00")],
    scontoDocumento: { percentuale: "5" },
    pagamento: { condizioni: "TP02", modalita: "MP05", iban, rate: [{ scadenza: _giorno(52) }] },
  }, contesto(CLIENTI[1]));
  await setState(db, preventivo, "accettato");

  // Due consegne allo stesso cliente: insieme fanno una fattura differita sola, ed è la domanda che
  // l'app pone da sé quando si preme «crea la fattura differita» sulla prima.
  for (const [giorno, quanti] of [[-12, "3"], [-6, "2"]]) {
    const consegna = await _emetti(db, {
      tipo: "ddt",
      data: _giorno(giorno),
      partyId: "demo-1",
      trasporto: {
        causale: t("demoTransportReason"), aspetto: t("demoTransportLook"),
        colli: quanti, porto: "franco", vettore: "",
      },
      righe: [_riga(t("demoItemTelaio"), quanti, "250.00")],
    }, contesto(CLIENTI[0]));
    await setState(db, consegna, "consegnato");
  }

  // E una bozza lasciata a metà, perché è lo stato in cui un documento passa la maggior parte del
  // suo tempo e l'unico in cui si può ancora provare qualcosa senza rompere niente.
  //
  // **Una bozza qualunque, non la fattura del preventivo.** La prima stesura convertiva il
  // preventivo, e così facendo lo marcava come già fatturato: sull'elenco spariva «Crea la
  // fattura», cioè proprio il comando che il dimostrativo esiste per far vedere. Il difetto era il
  // guardiano che funziona, applicato al posto sbagliato.
  await save(db, draft({
    tipo: "TD01",
    data: _giorno(0),
    partyId: "demo-2",
    righe: [_riga(t("demoItemOfficina"), "8", "45.00")],
    pagamento: { condizioni: "TP02", modalita: "MP05", iban, rate: [{ scadenza: _giorno(30) }] },
  }));
}
