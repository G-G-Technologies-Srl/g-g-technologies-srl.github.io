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
import * as plan from "gg/plan-model.js";

import { t } from "./i18n.js";
import { draft, save, issue, setState } from "./model.js";
import { recordPayment } from "./schedule.js";
import { saveActivity } from "./crm.js";
import { saveCost, recordOutlay } from "./costs.js";
import { saveRecurring } from "./recurring.js";
import * as progetti from "./projects.js";
import { toString } from "./decimal.js";

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
    // Le persone di riferimento: nomi inventati come la ragione sociale, e recapiti che non
    // appartengono a nessuno — `example.com` è riservato per questo, e il prefisso 0522 con quel
    // numero non è assegnato. Un recapito vero in un dimostrativo è il telefono di qualcuno.
    contatti: [
      { id: "demo-c1", nome: "Chiara Rossi", ruolo: "Acquisti", email: "chiara@example.com",
        telefono: "0522 000111", note: "" },
      { id: "demo-c2", nome: "Ivan Baldi", ruolo: "Officina", email: "", telefono: "0522 000112",
        note: "" },
    ],
  },
  {
    id: "demo-2", name: "brandi e figli s.n.c.", denominazione: "Brandi & Figli S.n.c.",
    partitaIva: "02446688000", codiceDestinatario: "", paese: "IT",
    sede: { indirizzo: "Corso Garibaldi", numeroCivico: "7", cap: "61121", comune: "Pesaro", provincia: "PU" },
    contatti: [
      { id: "demo-c3", nome: "Marta Brandi", ruolo: "Titolare", email: "marta@example.com",
        telefono: "0721 000222", note: "" },
    ],
  },
  // Due fornitori, con il ruolo: compaiono nel menù degli acquisti e non in quello dei documenti.
  // Il secondo è anche cliente — «entrambi» — perché è il caso che il ruolo esiste per coprire.
  {
    id: "demo-f1", name: "hosting nuvola s.p.a.", denominazione: "Hosting Nuvola S.p.A.",
    partitaIva: "03557799008", codiceDestinatario: "", paese: "IT", ruolo: "fornitore",
    sede: { indirizzo: "Via dei Server", numeroCivico: "1", cap: "20124", comune: "Milano", provincia: "MI" },
  },
  {
    id: "demo-f2", name: "ferramenta zani", denominazione: "Ferramenta Zani",
    partitaIva: "04668800016", codiceDestinatario: "", paese: "IT", ruolo: "entrambi",
    sede: { indirizzo: "Via Roma", numeroCivico: "88", cap: "47921", comune: "Rimini", provincia: "RN" },
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

/** Il quindici di `n` mesi fa: le fatture del passato, per il grafico dei mesi. */
function _mese(n) {
  const data = new Date();
  data.setDate(15);
  data.setMonth(data.getMonth() - n);
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

  // Il passato, perché il grafico dei mesi abbia una forma: una fattura al mese per gli ultimi
  // undici mesi, e le stesse un anno prima un po' più basse — così il confronto dice qualcosa.
  // Tutte incassate, così non intasano lo scadenzario. Emesse per prime, perché la numerazione
  // segue l'ordine di emissione e una fattura di marzo con un numero più alto di una di settembre
  // sarebbe una cosa che nel dimostrativo salta all'occhio.
  const ORE = [30, 24, 0, 42, 36, 18, 48, 0, 28, 40, 22];
  for (let indietro = 22; indietro >= 2; indietro -= 1) {
    const ore = ORE[(indietro - 2) % ORE.length];
    if (!ore) continue;
    const quante = indietro > 12 ? Math.round(ore * 0.8) : ore;
    const cliente = indietro % 2 ? CLIENTI[0] : CLIENTI[1];
    const passata = await _emetti(db, {
      tipo: "TD01",
      data: _mese(indietro),
      partyId: cliente.id,
      righe: [_riga(t("demoItemProgettazione"), String(quante), "80.00")],
      pagamento: { condizioni: "TP02", modalita: "MP05", iban, rate: [{ scadenza: _mese(indietro - 1) }] },
    }, contesto(cliente));
    await recordPayment(db, passata, {
      importo: toString(BigInt(passata.totali.totale), 2),
      data: _mese(indietro - 1),
      conto: AZIENDA.conti[0],
    });
  }

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

  // E uno che aspetta ancora una risposta, e scade fra cinque giorni: è la riga che la Situazione
  // mette in evidenza fra i preventivi in attesa.
  await _emetti(db, {
    tipo: "preventivo",
    data: _giorno(-25),
    partyId: "demo-3",
    validoFino: _giorno(5),
    causale: t("demoQuoteCausaleOpen"),
    righe: [_riga(t("demoItemTelaio"), "2", "250.00", { aliquota: "0", natura: "N3.3" })],
    pagamento: { condizioni: "TP02", modalita: "MP05", iban, rate: [{ scadenza: _giorno(35) }] },
  }, contesto(CLIENTI[2]));

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

  // Il diario dei due clienti che ne hanno uno. Poche voci, e ognuna dice una cosa che l'app da
  // sola non saprebbe: perché il preventivo è quello che è, quando risentirli, chi decide. È il
  // punto del diario — quello che sta intorno ai documenti e che altrimenti resta in una mail.
  const diario = [
    ["demo-1", "chiamata", -3, t("demoActCall")],
    ["demo-1", "incontro", -18, t("demoActMeeting")],
    ["demo-2", "email", -8, t("demoActEmail")],
    ["demo-2", "nota", -9, t("demoActNote")],
  ];
  for (const [partyId, tipo, giorno, testo] of diario) {
    await saveActivity(db, { partyId, tipo, data: _giorno(giorno), testo });
  }

  // Il progetto nato dal preventivo accettato: una fase per riga, la prima già fatta e con il suo
  // importo. È il giro che la scheda promette — preventivo, fasi, «fattura le fasi fatte» — e nel
  // dimostrativo si vede senza doverlo costruire.
  const lavoro = progetti.fromQuote(preventivo, { name: t("demoProjectName") });
  const fasi = progetti.tasksOf(lavoro.id);
  const finale = lavoro.columns.find((colonna) => colonna.done);
  if (fasi[0] && finale) plan.moveTask(fasi[0].id, finale.id);
  // La seconda fase doveva finire quattro giorni fa: il ritardo che la Situazione segnala.
  if (fasi[1]) plan.updateTask(fasi[1].id, { end: _giorno(-4) });
  progetti.addTask(lavoro.id, {
    title: t("demoProjectPhase"), importo: "1200.00", end: _giorno(20),
  });
  // Una pagina, perché si veda dove stanno i documenti del progetto: il verbale del sopralluogo,
  // con dentro la misura che ha fatto salire il preventivo.
  plan.createPage(lavoro.id, { title: t("demoProjectPage"), markdown: t("demoProjectPageText") });
  await progetti.flush();

  // Gli acquisti: il canone mensile dell'hosting per gli ultimi mesi, tutti pagati, così le barre
  // dei costi hanno una forma; una fattura scaduta da dieci giorni e una spesa che scade fra tre,
  // perché lo scadenzario abbia una metà bassa e la Situazione un «da pagare» con un ritardo.
  // Il canone è una ricorrenza: i mesi passati sono confermati, quelli che restano fino a
  // dicembre sono attesi — è il previsionale che la Situazione mostra.
  const ricorrenza = await saveRecurring(db, {
    id: "demo-r1", partyId: "demo-f1", descrizione: t("demoCostHosting"), categoria: t("demoCatSoftware"),
    imponibile: "390.00", aliquota: "22", cadenza: "mensile", giorno: 15, da: _mese(14).slice(0, 7),
  });
  const acquisto = (fields) => saveCost(db, fields, { company: AZIENDA });
  for (let indietro = 1; indietro <= 8; indietro += 1) {
    const canone = await acquisto({
      tipo: "fattura", partyId: "demo-f1", data: _mese(indietro), numero: `HN-${2026}-${String(120 - indietro).padStart(3, "0")}`,
      categoria: t("demoCatSoftware"), descrizione: t("demoCostHosting"),
      imponibile: "390.00", aliquota: "22", scadenza: _mese(indietro - 1),
      ricorrenzaId: ricorrenza.id, periodo: _mese(indietro).slice(0, 7),
    });
    await recordOutlay(db, canone, { importo: canone.totale, data: _mese(indietro - 1), conto: AZIENDA.conti[0] });
  }
  const scaduta = await acquisto({
    tipo: "fattura", partyId: "demo-f1", data: _giorno(-40), numero: "HN-2026-121",
    categoria: t("demoCatSoftware"), descrizione: t("demoCostServer"),
    imponibile: "1250.00", aliquota: "22", scadenza: _giorno(-10),
  });
  await recordOutlay(db, scaduta, { importo: "500.00", data: _giorno(-12), conto: AZIENDA.conti[0] });
  await acquisto({
    tipo: "spesa", partyId: "demo-f2", data: _giorno(-2),
    categoria: t("demoCatMateriali"), descrizione: t("demoCostBolts"),
    imponibile: "140.00", aliquota: "22", scadenza: _giorno(3),
  });

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
