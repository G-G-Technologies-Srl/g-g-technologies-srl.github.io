// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// I progetti: il piano di un lavoro, e il denaro che ci gira intorno.
//
// **Il modello non è scritto qui.** Progetti, pagine, attività, colonne, cestino e `uid` vengono da
// `gg/plan-model.js`, che è lo stesso file che usa Plan Scope: due app, un modello, nessuna copia da
// tenere allineata. Questo file è la parte che Plan Scope non può avere — il cliente, i documenti e
// i quattro numeri — più la porta che scrive nel deposito di Invoice Scope.
//
// **Tre campi in più, e nient'altro.** Il modello condiviso non sa cosa sia una fattura, e non deve
// saperlo: i campi nostri entrano da `updateProject` e `updateTask`, che fondono quello che ricevono.
// `createTask` invece costruisce un record fisso — quindi una fase con un importo si crea e poi si
// aggiorna, in due passi. È voluto: piegare la firma di `createTask` per un caso solo vorrebbe dire
// che il modello condiviso comincia a nominare le fatture.
//
// | Campo | Su cosa | Perché |
// |---|---|---|
// | `partyId` | progetto | il cliente. Senza, i quattro numeri non esistono |
// | `docIds` | progetto | preventivo, DDT e fatture collegati |
// | `importo` | attività | quanto vale quella fase, se ne vale una |
// | `docId` | attività | la fattura che l'ha già fatturata, per non fatturarla due volte |
//
// **La scrittura è differita e raggruppata**, come nel documento: il modello annuncia ogni modifica
// una per una — spuntare una fase ne tocca due — e una transazione per annuncio sarebbe una raffica
// di scritture per un click. Quello che sta in coda parte a `pagehide` e a ogni navigazione.
//
// Niente DOM qui dentro:
// `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/projects.mjs`.

import { get, list, put, remove } from "gg/store.js";
import * as plan from "gg/plan-model.js";

import { draft, save as saveDoc, documents, signedTotal } from "./model.js";
import { kind } from "./kinds.js";
import { paymentsOf } from "./schedule.js";
import { totals } from "./totals.js";
import { from, add, sub, sum, ZERO, cmp, toString } from "./decimal.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** Quanto aspetta una modifica prima di finire su disco. Come l'autosalvataggio del documento. */
const WRITE_AFTER_MS = 400;

/** Il nome dello store per ogni parola del modello condiviso. */
const STORE = { project: "projects", page: "pages", task: "tasks" };

let database = null;
const pending = new Map();
const removing = new Map();
let timer = null;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _schedule() {
  if (timer !== null) return;
  timer = setTimeout(() => { flush(); }, WRITE_AFTER_MS);
}

/** La colonna che il progetto considera «fatto». È il modello a dirlo, non un nome scritto qui. */
function _doneColumn(project) {
  return (project.columns || []).find((column) => column.done) || null;
}

/** Un importo che una persona ha scritto, come numero scalato. Zero per quello che non c'è. */
function _amount(value) {
  if (value === undefined || value === null || value === "") return ZERO;
  try {
    return from(String(value));
  } catch (ignored) {
    // Un record importato con un importo storto non deve azzerare la schermata: vale zero, e la
    // fase resta lì da correggere.
    return ZERO;
  }
}

/**
 * Le figure rimaste senza progetto: quelle di un progetto svuotato dal cestino.
 *
 * **Con zero progetti non si tocca niente.** È l'unica riga che cancella dei byte da sé, e la
 * cancella per assenza: se il deposito dei progetti tornasse vuoto per un motivo qualunque — una
 * lettura fallita, un aggiornamento a metà — «nessun progetto vivo» diventerebbe «via tutte le
 * figure», e sarebbe una perdita senza ritorno decisa da un errore. Nessun progetto e delle figure
 * è esattamente il caso in cui conviene aspettare.
 */
async function _sweepAssets() {
  const vivi = new Set([...plan.liveProjects(), ...plan.trashedProjects()].map((one) => one.id));
  if (!vivi.size) return;
  for (const asset of await list(database, "assets")) {
    if (!vivi.has(asset.projectId)) await remove(database, "assets", asset.id);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   l a   p o r t a
// -----------------------------------------------------------------------------------------------------------------

/**
 * Aggancia il modello condiviso al deposito di questa app, e riempilo con quello che c'è.
 *
 * Chiamata una volta all'avvio. Da qui in poi ogni modifica passa dal modello e arriva qui come
 * `save`/`drop`, nelle sue parole — `project | page | task` — che questo file traduce in store.
 */
export async function setup(db) {
  database = db;
  plan.connect({
    save: (kind_, record) => {
      pending.set(`${kind_}/${record.id}`, { store: STORE[kind_], record });
      removing.delete(`${kind_}/${record.id}`);
      _schedule();
    },
    drop: (kind_, id) => {
      removing.set(`${kind_}/${id}`, { store: STORE[kind_], id });
      pending.delete(`${kind_}/${id}`);
      _schedule();
    },
  });
  plan.hydrate({
    projects: await list(db, "projects"),
    pages: await list(db, "pages"),
    tasks: await list(db, "tasks"),
  });
  // Trenta giorni dopo, e non prima: il cestino del modello è la sola rete che ha chi cancella un
  // progetto per sbaglio. `purge` è l'unico posto in cui qualcosa sparisce davvero.
  plan.purge();
  await flush();
  // E quello che `purge` non sa togliere: le figure di un progetto che non c'è più. Il modello non
  // conosce gli allegati — sono di questa app — quindi senza questa riga i byte resterebbero nel
  // deposito per sempre, invisibili e pesanti.
  await _sweepAssets();
}

/**
 * Manda in fondo quello che è in coda.
 *
 * Le scritture partono **insieme** e si aspettano insieme: chiamata da `pagehide`, cioè mentre un
 * telefono sta chiudendo la pagina, aspettarne una prima di aprire la successiva vorrebbe dire che
 * solo la prima transazione è stata consegnata al browser.
 */
export async function flush() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!database) return;
  const writes = [...pending.values()];
  const deletes = [...removing.values()];
  pending.clear();
  removing.clear();
  try {
    await Promise.all([
      ...writes.map(({ store, record }) => put(database, store, record)),
      ...deletes.map(({ store, id }) => remove(database, store, id)),
    ]);
  } catch (ignored) {
    // Quello che non è passato torna in coda, a meno che nel frattempo non sia arrivata una
    // versione più nuova dello stesso record: sovrascriverla con quella vecchia sarebbe peggio
    // dell'errore che si sta gestendo.
    for (const entry of writes) {
      const key = `${entry.store}/${entry.record.id}`;
      if (!pending.has(key) && !removing.has(key)) pending.set(key, entry);
    }
    for (const entry of deletes) {
      const key = `${entry.store}/${entry.id}`;
      if (!pending.has(key)) removing.set(key, entry);
    }
    _schedule();
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i l   p r o g e t t o
// -----------------------------------------------------------------------------------------------------------------

/** I progetti vivi, dal più toccato di recente. */
export function projects() {
  return plan.liveProjects();
}

export function project(id) {
  return plan.project(id);
}

export function tasksOf(id) {
  return plan.tasksOf(id);
}

/** Un progetto nuovo, con il suo cliente. */
export function create({ name, partyId = "", eventDate = null } = {}) {
  const record = plan.createProject({ name, eventDate });
  // `updateProject` restituisce il passo per «annulla», non il progetto: è il modello che offre
  // l'annullamento accanto a ogni modifica. Il record aggiornato si richiede.
  plan.updateProject(record.id, { partyId, docIds: [] });
  return plan.project(record.id);
}

/** Collega un documento al progetto, una volta sola: un elenco con due volte la stessa fattura
 * conterebbe due volte anche nel fatturato. */
export function linkDoc(projectId, docId) {
  const record = plan.project(projectId);
  if (!record) return null;
  const before = record.docIds || [];
  if (before.includes(docId)) return record;
  plan.updateProject(projectId, { docIds: [...before, docId] });
  return plan.project(projectId);
}

export function unlinkDoc(projectId, docId) {
  const record = plan.project(projectId);
  if (!record) return null;
  plan.updateProject(projectId, { docIds: (record.docIds || []).filter((one) => one !== docId) });
  return plan.project(projectId);
}

/**
 * Un documento che non esiste più: via dai progetti che lo elencavano, e libere le fasi che lo
 * portavano.
 *
 * La chiama chi cancella una bozza. Senza, una fase fatturata su una bozza poi cancellata restava
 * «fatturata» per sempre — con un `docId` che non apriva niente — e non si poteva rifatturare: il
 * denaro spariva dal conto senza che nessuno l'avesse deciso. Solo la cancellazione libera le fasi,
 * non lo scollegamento: una fattura scollegata dal progetto esiste ancora, e rifatturarla sarebbe
 * fatturare due volte.
 */
export function forgetDoc(docId) {
  for (const record of plan.liveProjects()) {
    if ((record.docIds || []).includes(docId)) unlinkDoc(record.id, docId);
    for (const one of plan.tasksOf(record.id)) {
      if (one.docId === docId) plan.updateTask(one.id, { docId: null });
    }
  }
}

/** Il progetto a cui un documento è collegato, se c'è: serve alla schermata del documento. */
export function projectOfDoc(docId) {
  return plan.liveProjects().find((one) => (one.docIds || []).includes(docId)) || null;
}

/** Una fase con il suo importo: si crea e si completa, per la ragione scritta in testa al file. */
export function addTask(projectId, { title, importo = "", end = null, status = null } = {}) {
  const record = plan.createTask(projectId, { title, end, status });
  if (!record) return null;
  if (importo !== "" && importo !== null) plan.updateTask(record.id, { importo: String(importo) });
  return plan.task(record.id);
}

/** Se una fase è già stata fatturata. Il campo lo scrive `invoiceDone`, e nessun altro. */
export function billed(taskRecord) {
  return Boolean(taskRecord.docId);
}

/**
 * Le fasi che si possono fatturare adesso: fatte, con un importo, e non ancora su una fattura.
 *
 * «Fatte» lo decide la colonna che il progetto dichiara come finale, non un nome scritto qui: chi
 * rinomina le colonne non deve perdere il conto.
 */
export function billable(projectId) {
  const record = plan.project(projectId);
  if (!record) return [];
  const done = _doneColumn(record);
  if (!done) return [];
  return plan.tasksOf(projectId)
    .filter((one) => one.status === done.id && !one.docId && cmp(_amount(one.importo), ZERO) > 0);
}

/** Quanto vale, in tutto, quello che si può fatturare adesso. Lo chiede l'elenco dei progetti. */
export function billableTotal(projectId) {
  return sum(billable(projectId).map((one) => _amount(one.importo)));
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   l e   i m m a g i n i   e   i   f i l e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Un'immagine o un file dentro una pagina.
 *
 * **I byte restano dove sono: nel browser.** Il record tiene il `blob` che il selettore di file ha
 * consegnato, e la pagina lo nomina con un indirizzo interno — `assets/<id>` — che nessuna rete
 * risolve. È la stessa promessa del resto dell'app, applicata alla foto di un cantiere.
 *
 * Passa da qui e non dal modello condiviso perché il modello non sa cosa sia un byte: tiene testo,
 * e il testo nomina l'immagine.
 */
export async function putAsset(record) {
  await put(database, "assets", record);
  return record;
}

export async function getAsset(id) {
  return get(database, "assets", id);
}

export async function assetsOf(projectId) {
  return (await list(database, "assets")).filter((one) => one.projectId === projectId);
}

export async function dropAsset(id) {
  await remove(database, "assets", id);
}

/**
 * Gli allegati di un progetto pronti per il pacchetto: i byte al posto del blob.
 *
 * Lo zip vuole `bytes`, il deposito tiene un `Blob`: la conversione sta qui, una volta, invece che
 * in ogni chiamante.
 */
export async function assetsForPack(projectId) {
  const out = [];
  for (const asset of await assetsOf(projectId)) {
    if (!asset.blob) continue;
    out.push({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      bytes: new Uint8Array(await asset.blob.arrayBuffer()),
    });
  }
  return out;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i   q u a t t r o   n u m e r i
// -----------------------------------------------------------------------------------------------------------------

/**
 * Quotato, fatturato, incassato, da fatturare.
 *
 * Sono la ragione per cui un progetto sta in un programma di fatturazione invece che in un planner:
 * nessuna app separata potrebbe calcolarli, perché tre dei quattro numeri vivono nei documenti.
 *
 *  - **quotato**: i preventivi collegati. Più di uno vale la somma — un lavoro può essere stato
 *    preventivato in due volte;
 *  - **fatturato**: i documenti fiscali collegati, con la nota di credito in meno. `signedTotal`
 *    porta il segno, che è la parte che si sbaglia in silenzio;
 *  - **incassato**: gli incassi registrati su quei documenti;
 *  - **da fatturare**: le fasi fatte che non sono ancora finite su una fattura. È l'unico dei
 *    quattro che guarda il piano invece dei documenti, ed è quello che dice cosa fare adesso.
 */
export async function figures(db, projectId) {
  const record = plan.project(projectId);
  const vuoto = { quotato: ZERO, fatturato: ZERO, incassato: ZERO, daFatturare: ZERO };
  if (!record) return vuoto;

  const ids = new Set(record.docIds || []);
  const suoi = (await documents(db)).filter((doc) => ids.has(doc.id));

  const quotato = sum(suoi
    .filter((doc) => doc.tipo === "preventivo" && doc.stato !== "rifiutato")
    .map((doc) => signedTotal(doc) || ZERO));
  const fatturato = sum(suoi
    .filter((doc) => kind(doc).fiscale && doc.totali)
    .map((doc) => signedTotal(doc) || ZERO));

  let incassato = ZERO;
  for (const doc of suoi.filter((one) => kind(one).fiscale)) {
    for (const pagamento of await paymentsOf(db, doc.id)) {
      incassato = add(incassato, _amount(pagamento.importo));
    }
  }

  const daFatturare = sum(billable(projectId).map((one) => _amount(one.importo)));
  return { quotato, fatturato, incassato, daFatturare };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i l   g i r o   c o m p l e t o
// -----------------------------------------------------------------------------------------------------------------

/**
 * Un progetto da un preventivo: il cliente, il documento collegato, e una fase per riga.
 *
 * È il punto in cui il piano e il denaro si incontrano senza ridigitare niente. L'importo della fase
 * è il totale della riga — quantità per prezzo, sconti di riga compresi — che è quello che si
 * rifattura quando quella fase è fatta.
 */
export function fromQuote(doc, { name = "" } = {}) {
  const record = create({ name: name || doc.causale || "", partyId: doc.partyId || "" });
  linkDoc(record.id, doc.id);
  // `totals` restituisce le righe con dentro `prezzoTotale`, cioè quantità per prezzo con lo sconto
  // di riga già tolto e la quota di sconto del documento già distribuita: è quello che quella fase
  // vale davvero, e quindi quello che si rifattura.
  for (const riga of totals(doc).righe) {
    addTask(record.id, {
      title: riga.descrizione || "",
      importo: toString(riga.prezzoTotale, 2),
    });
  }
  return plan.project(record.id);
}

/**
 * Una bozza di fattura con dentro le fasi fatte, e le fasi marcate come fatturate.
 *
 * L'aliquota è quella del cliente se la sua scheda ne ha una, altrimenti quella dell'azienda —
 * come per una riga nuova scritta a mano: le fasi portano un importo, non un'IVA, e chiedere
 * l'aliquota a ogni fase vorrebbe dire chiederla due volte a chi ne usa una sola.
 *
 * Il collegamento si scrive **dopo** che la bozza è stata salvata, e in tutti e due i versi: la
 * fattura entra in `docIds` del progetto, e ogni fase si segna la fattura che l'ha portata. Senza
 * il secondo, la stessa fase finirebbe sulla fattura successiva.
 */
export async function invoiceDone(db, projectId, { company = null, tipo = "TD01" } = {}) {
  const record = plan.project(projectId);
  const fasi = billable(projectId);
  if (!record || !fasi.length) return null;

  const cliente = record.partyId ? await get(db, "parties", record.partyId) : null;
  const sua = cliente && cliente.aliquotaPredefinita;
  const aliquota = (sua !== undefined && sua !== null && sua !== "")
    ? String(sua)
    : ((company && company.aliquotaPredefinita) || "22");
  const zero = String(aliquota) === "0";
  const natura = (cliente && cliente.naturaPredefinita) || (company && company.naturaPredefinita) || "";
  const righe = fasi.map((fase) => ({
    descrizione: fase.title,
    quantita: "1",
    prezzoUnitario: toString(_amount(fase.importo), 2),
    aliquota: String(aliquota),
    natura: zero ? natura : "",
    tm: zero ? ((company && company.tmPredefinito) || "") : "",
  }));

  const doc = await saveDoc(db, draft({
    tipo,
    data: new Date().toISOString().slice(0, 10),
    partyId: record.partyId || "",
    causale: record.name || "",
    righe,
  }));

  linkDoc(projectId, doc.id);
  for (const fase of fasi) plan.updateTask(fase.id, { docId: doc.id });
  await flush();
  return doc;
}
