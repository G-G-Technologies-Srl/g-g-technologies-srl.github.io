// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Bringing an account over from another program.
//
// **The rule this whole file exists to keep: nothing is written before somebody has seen what would
// be written.** Reading a file and saving what it contains is four lines; the rest is the report —
// how many records, how many already here, which columns went unread, which rows were refused. An
// import that only says "done" is one nobody can check, and nobody re-reads seventeen customers to
// find out whether the VAT numbers landed in the VAT column.
//
// So it comes in two halves that never meet: `plan` reads and decides and touches no database, and
// `apply` writes what a plan already worked out. `plan` takes plain bytes and plain arrays rather
// than a database handle, which is what lets it be run against the real exports in a test.
//
// **What arrives is recognised by its content, not by its name.** A `.xlsx` is a ZIP, a `.zip` from
// an account backup is a folder of invoices, an `.xls` is the binary container of 1997 — which is
// what Fatture in Cloud still writes for the documents, so `xls.js` reads it. Deciding from the
// extension means telling somebody "unsupported file" about a file that is supported and misnamed —
// so the first bytes decide, and the extension is not consulted at all.
//
// No DOM in the two halves above: `node --import ./app/invoice-scope/test/loader.mjs
// app/invoice-scope/test/importing.mjs` runs them. The panel below the divider needs a page.

import { tx } from "gg/store.js";
import * as fic from "./fic.js";
import * as sheet from "./sheet.js";
import * as xls from "./xls.js";
import { read as readFattura } from "./reading.js";
import { documentKey } from "./db.js";
import { draft } from "./model.js";
import { KINDS } from "./kinds.js";
import { totals } from "./totals.js";
import { from, cmp } from "./decimal.js";
import { partyRecord, itemRecord } from "./parties.js";
import { fiscalCode } from "./parse.js";
import { t, tf } from "./i18n.js";
import { date as shownDate, money } from "./format.js";
import { ask, tell } from "./ask.js";
import { list } from "gg/store.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

// The signatures that tell one container from another, as the first bytes of the file.
const PK = [0x50, 0x4b];                                // a ZIP: an .xlsx, or a folder of invoices
const OLE = [0xd0, 0xcf, 0x11, 0xe0];                   // the binary .xls of 1997: the documents export

// One level of nesting, and only one: a backup holds invoices in folders, and an invoice is not a
// container. A reader that recurses without a limit is a reader that can be handed a ZIP of itself.
const DENTRO = /\.xml$/i;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _starts(bytes, signature) {
  return signature.every((byte, at) => bytes[at] === byte);
}

/** Names compared the way a person would: case, accents and spacing set aside. */
function _key(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * How an existing customer is recognised in an incoming one.
 *
 * The fiscal identifier first, because it is the thing that is meant to be unique, and the name only
 * when there is no identifier to compare. Not the name first: two companies of the same group share a
 * name and differ by VAT number, and merging them would move invoices onto the wrong customer.
 *
 * **Both sides go through `fiscalCode` before the comparison.** The stored record has already been
 * through it — `partyRecord` strips the country prefix, so a San Marino customer is kept as `29077`
 * — while the sheet still says `SM29077`. Compared raw, the two never matched, and every San Marino
 * customer came in again at every import: six duplicates out of seventeen, found by importing the
 * same file twice. Two records that disagree on an identifier are different; a record with no
 * identifier at all is matched by name, which is all there is.
 */
function _sameParty(a, b) {
  const iva = (p) => _key(fiscalCode(p.partitaIva, p.paese)) || "";
  const cf = (p) => _key(fiscalCode(p.codiceFiscale, p.paese)) || "";
  if (iva(a) && iva(b)) return iva(a) === iva(b);
  if (cf(a) && cf(b)) return cf(a) === cf(b);
  if (iva(a) && cf(b) && iva(a) === cf(b)) return true;     // a sole trader's number written in either column
  if (cf(a) && iva(b) && cf(a) === iva(b)) return true;
  return _key(a.denominazione) === _key(b.denominazione) && !!_key(a.denominazione);
}

/** The VAT rate a register entry implies, from the two totals it states. */
function _aliquota(imponibile, iva) {
  const base = Number(imponibile);
  const tax = Number(iva);
  if (!Number.isFinite(base) || !Number.isFinite(tax) || base <= 0 || tax <= 0) return "0";
  return (Math.round((tax / base) * 10000) / 100).toFixed(2);
}

/**
 * A register entry as a document, with the one line that makes its total add up.
 *
 * **That line is a reconstruction, and the panel says so.** The register holds no lines — only a
 * taxable amount per document — and a document with no lines has no total, so every check downstream
 * would fail on a document that is not actually wrong. One line carrying the whole amount, described
 * by the document's own subject, is the smallest thing that keeps the arithmetic honest.
 */
function _fromRegister(entry) {
  const aliquota = _aliquota(entry.imponibile, entry.iva);
  // The line's words, when the register has none: the document's own name and date, and that
  // the detail is missing. «Importo da registro» printed on a courtesy copy meant nothing to the
  // customer who got it; this at least says which invoice it is, and why it looks like this.
  const kind = KINDS[entry.tipo] || KINDS.TD01;
  const ripiego = tf("impRegisterLineOf", {
    tipo: t(kind.label), numero: entry.numero, data: shownDate(entry.data),
  });
  const doc = draft({
    tipo: entry.tipo,
    // The first state the kind allows, and not a constant: «inviato» is right for an invoice and
    // wrong for a delivery note, whose states are «consegnato» and «annullato». A state outside its
    // kind's list is not refused anywhere — it just makes a document the schedule cannot classify.
    stato: (KINDS[entry.tipo] || KINDS.TD01).stati[0],
    data: entry.data,
    numero: entry.numero,
    serie: entry.serie || undefined,
    esportato: true,
    righe: [{
      descrizione: entry.oggetto || ripiego,
      quantita: "1",
      prezzoUnitario: entry.imponibile,
      aliquota,
      // **No `Natura` is invented for a zero rate.** The register does not say which one it was, and
      // the two candidates are a world apart: `N3.1` is a non-taxable export, `N2.2` is out of scope
      // altogether. Guessing would put a defensible-looking code on a document nobody checked. Left
      // empty, and the panel says the document needs it before it can go out as XML again.
    }],
  });
  if (entry.scadenza) {
    doc.pagamento = { rate: [{ scadenza: entry.scadenza, importo: entry.lordo || entry.imponibile }] };
  }
  // **A reconstruction says so on the record.** It is what lets the XML of the same invoice, when
  // it arrives, replace this one instead of being turned away as «already here».
  doc.ricostruito = true;
  return doc;
}

/**
 * The totals a document carries, computed once and stored on it.
 *
 * **Not a nicety: without them an imported document has no amount anywhere.** `issue()` is what
 * normally works them out, and an import goes nowhere near it — these documents arrive already
 * numbered and already sent. So the list showed a dash in the total column of all twelve, and the
 * schedule had nothing to add up. Found by looking at the screen after the import, which is the only
 * place it could have been found: every test was green.
 */
function _withTotals(doc) {
  const computed = totals(doc);
  return {
    ...doc,
    totali: {
      imponibile: computed.imponibile.toString(),
      imposta: computed.imposta.toString(),
      totale: computed.totale.toString(),
    },
  };
}

/**
 * The declared total of a file against the recomputed one, as two formatted amounts, or `null`.
 *
 * A file with no `ImportoTotaleDocumento` — the element is optional — has nothing to compare, and
 * a difference of zero is not a difference. Anything else is reported with both figures, so the
 * person can see the size of it: a cent is a rounding, a thousand euro is a file to look at.
 */
function _scarto(dichiarato, ricalcolato) {
  if (dichiarato === undefined || dichiarato === null || dichiarato === "") return null;
  let atteso;
  try {
    atteso = from(dichiarato);
  } catch (ignored) {
    return null;
  }
  const nostro = BigInt(ricalcolato);
  if (cmp(atteso, nostro) === 0) return null;
  return { dichiarato: money(atteso), calcolato: money(nostro) };
}

/** Every file inside a ZIP that could be an invoice, one level down. */
async function _dentro(bytes) {
  const zip = await import("gg/zip.js");
  const entries = await zip.readAny(bytes);
  return entries
    .filter((entry) => DENTRO.test(entry.name) && !entry.name.startsWith("__MACOSX"))
    .map((entry) => ({ name: entry.name, bytes: entry.bytes }));
}

/** One spreadsheet: which of the three exports it is, and what it holds. */
function _foglio(name, sheets, contesto) {
  for (const foglio of sheets) {
    const { head, body } = sheet.table(foglio.rows);
    const quale = fic.guess(head);
    if (!quale) continue;
    if (quale === "clienti") return { ...fic.parties(head, body), name, tipo: "clienti" };
    if (quale === "listino") {
      const aliquota = String((contesto.company || {}).aliquotaPredefinita || "22");
      return { ...fic.items(head, body, { aliquota }), name, tipo: "listino" };
    }
    return { ...fic.register(head, body), name, tipo: "registro" };
  }
  return { name, tipo: "ignoto", records: [], scartate: [], problems: [] };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * The counter key of a document's series: the same string `issue()` and `reopen()` use.
 *
 * Copied from `model.js` rather than imported because it is not exported there, and exporting a
 * one-line template for the sake of one caller would make it look like an API. If the shape ever
 * changes there, `test/importing.mjs` catches it: it issues a document after an import and reads the
 * number it got.
 */
function _serieKey(doc) {
  return `doc|${doc.serie || ""}|${doc.tipo || "TD01"}|${String(doc.data || "").slice(0, 4)}`;
}

/** The digits a document's number ends with, as a number — `2026/0012`, `0012`, `PR-12` all give 12. */
function _ordinale(numero) {
  const found = /(\d+)\s*$/.exec(String(numero || ""));
  return found ? Number(found[1]) : null;
}

/** A short line naming a document, for the panel: number, date, customer. */
function _titolo(doc, nomeCliente) {
  return [doc.numero, doc.data, nomeCliente].filter(Boolean).join(" · ");
}

/**
 * What importing these files would do, without doing any of it.
 *
 * `sorgenti` is `[{ name, bytes }]` — plain data, so a test can hand it the real exports. `contesto`
 * carries what is already in the database: `{ company, parties, items, docs }`.
 *
 * Returns `{ fonti, clienti, listino, documenti, incassi }`: a report per file, and the records that
 * would be written. `apply` takes the same object back. Every report carries `nomi`, the names it
 * read, split into new and already-here — counts alone do not let anybody check that the seventeen
 * customers are the right seventeen, and a number that does not match with no way to see why is a
 * number nobody trusts.
 */
export async function plan(sorgenti, contesto = {}) {
  const esistenti = { parties: contesto.parties || [], items: contesto.items || [], docs: contesto.docs || [] };
  // Every document already there, by key — and whether it is a register reconstruction, because
  // for those the XML of the same invoice is a completion, not a duplicate.
  const chiavi = new Map();
  for (const doc of esistenti.docs) {
    const chiave = documentKey(doc);
    if (chiave) chiavi.set(chiave, { id: doc.id, ricostruito: !!doc.ricostruito, inPiano: false });
  }
  const descrizioni = new Set(esistenti.items.map((item) => _key(item.descrizione)));

  const fonti = [];
  const clienti = [];                                   // new customers, in the order they arrive
  const listino = [];
  const documenti = [];
  const incassi = [];

  /** A customer already here, already queued, or new: always the same one for the same identifier. */
  const cliente = (incoming, fonte) => {
    const trovato = esistenti.parties.find((p) => _sameParty(p, incoming));
    if (trovato) return { id: trovato.id, nuovo: false, nome: trovato.denominazione };
    const inCoda = clienti.find((p) => _sameParty(p, incoming));
    if (inCoda) return { id: inCoda._id, nuovo: false, nome: inCoda.denominazione };
    // The id is decided here rather than by `saveParty`, because a document written in the same
    // batch has to point at it and there is nothing to point at yet.
    const _id = globalThis.crypto?.randomUUID?.() || `imp-${clienti.length}-${Date.now()}`;
    clienti.push({ ...incoming, _id, _fonte: fonte });
    return { id: _id, nuovo: true, nome: incoming.denominazione };
  };

  const espandi = async (sorgente) => {
    const { name, bytes } = sorgente;

    if (_starts(bytes, OLE)) {
      // Excel 95 and earlier is the one thing in this container we do not read; it is also a file
      // nobody has exported this century, and it gets its own line rather than "unreadable".
      try {
        return [_foglio(name, xls.read(bytes), contesto)];
      } catch (error) {
        if (error.message === "xlsOld") return [{ name, tipo: "vecchio", records: [], scartate: [], problems: [] }];
        throw error;
      }
    }

    if (_starts(bytes, PK)) {
      // A ZIP is either a workbook or a folder. Tried as a workbook first: `sheet.read` refuses
      // anything without `xl/workbook.xml`, which is exactly the question being asked.
      let sheets = null;
      try {
        sheets = await sheet.read(bytes);
      } catch (error) {
        if (error.message !== "sheetNotXlsx" && error.message !== "sheetEmpty") throw error;
      }
      if (sheets) return [_foglio(name, sheets, contesto)];
      const dentro = await _dentro(bytes).catch(() => []);
      if (!dentro.length) return [{ name, tipo: "ignoto", records: [], scartate: [], problems: [] }];
      const fuori = [];
      for (const file of dentro) fuori.push(..._fatture(file));
      return fuori;
    }

    return _fatture(sorgente);
  };

  /** One XML file: the documents in it, or the reason it is not one. */
  function _fatture({ name, bytes }) {
    let letto;
    try {
      letto = readFattura(new TextDecoder().decode(bytes));
    } catch (error) {
      const chiave = error instanceof SyntaxError ? "impBrokenXml" : `imp${error.message}`;
      return [{ name, tipo: "ignoto", records: [], scartate: [], problems: [{ chiave }] }];
    }
    return [{ name, tipo: "fattura", letto, records: [], scartate: [], problems: [] }];
  }

  for (const sorgente of sorgenti) {
    // **Each file fails on its own.** A workbook with a malformed sheet used to throw out of here
    // and take the two good files beside it down with it, under one message that named none of
    // them. Now the broken one is a row in the report, and the others go through.
    let espanse;
    try {
      espanse = await espandi(sorgente);
    } catch (ignored) {
      espanse = [{ name: sorgente.name, tipo: "ignoto", records: [], scartate: [],
                   problems: [{ chiave: "impUnreadable" }] }];
    }

    for (const fonte of espanse) {
      const report = {
        name: fonte.name,
        tipo: fonte.tipo,
        nuovi: 0,
        esistenti: 0,
        nomi: { nuovi: [], esistenti: [] },
        scartate: fonte.scartate || [],
        problemi: fonte.problems || [],
        avvisi: [],
      };
      const conta = (nuovo, nome) => {
        if (nuovo) report.nuovi += 1;
        else report.esistenti += 1;
        report.nomi[nuovo ? "nuovi" : "esistenti"].push(nome);
      };

      if (fonte.tipo === "clienti") {
        for (const record of fonte.records) {
          const { nuovo, nome } = cliente(record, fonte.name);
          conta(nuovo, nome);
        }
      } else if (fonte.tipo === "listino") {
        for (const record of fonte.records) {
          const nuovo = !descrizioni.has(_key(record.descrizione));
          if (nuovo) {
            descrizioni.add(_key(record.descrizione));
            listino.push({ ...record, _fonte: fonte.name });
          }
          conta(nuovo, record.descrizione);
        }
      } else if (fonte.tipo === "registro") {
        if (fonte.records.length) report.avvisi.push({ chiave: "impRegisterRebuilt" });
        for (const entry of fonte.records) {
          const doc = _fromRegister(entry);
          const chi = cliente(entry.cliente, fonte.name);
          doc.partyId = chi.id;
          doc._fonte = fonte.name;
          const chiave = documentKey(doc);
          const nuovo = !(chiave && chiavi.has(chiave));
          conta(nuovo, _titolo(doc, chi.nome));
          if (!nuovo) continue;
          if (chiave) chiavi.set(chiave, { id: doc.id, ricostruito: true, inPiano: true });
          documenti.push(_withTotals(doc));
          // **«Saldato: SI» is a payment, not a word.** Read and dropped, it left every paid invoice
          // of the register open in the schedule — the first screen after an import, showing a sum
          // the company was not owed. The date is the one the register gives, the due date, because
          // it does not say when the money actually came; the note says where the record came from.
          if (entry.saldato) {
            incassi.push({
              docId: doc.id,
              importo: entry.lordo || entry.imponibile,
              data: entry.scadenza || entry.data,
              _fonte: fonte.name,
            });
          }
        }
      } else if (fonte.tipo === "fattura") {
        for (const { doc, cliente: incoming, avvisi, dichiarato } of fonte.letto.documenti) {
          const chi = cliente(incoming, fonte.name);
          doc.partyId = chi.id;
          doc._fonte = fonte.name;
          const chiave = documentKey(doc);
          const prima = chiave ? chiavi.get(chiave) : null;
          // **The XML of an invoice the register only sketched completes it.** The reconstruction
          // had one line carrying the total; this has the real lines, and takes its place — same
          // id, so the payments recorded against it stay attached. Counted apart, and named apart,
          // because «already here, untouched» would be exactly the wrong thing to say.
          if (prima && prima.ricostruito) {
            doc.id = prima.id;
            doc._completa = true;
            report.completati = (report.completati || 0) + 1;
            (report.nomi.completati ||= []).push(_titolo(doc, chi.nome));
            chiavi.set(chiave, { id: prima.id, ricostruito: false, inPiano: true });
            const conTotali = _withTotals(doc);
            if (prima.inPiano) {
              const at = documenti.findIndex((d) => d.id === prima.id);
              if (at >= 0) documenti.splice(at, 1, conTotali); else documenti.push(conTotali);
            } else {
              documenti.push(conTotali);
            }
            report.avvisi.push(...avvisi);
            continue;
          }
          const nuovo = !prima;
          conta(nuovo, _titolo(doc, chi.nome));
          if (!nuovo) continue;
          if (chiave) chiavi.set(chiave, { id: doc.id, ricostruito: false, inPiano: true });
          const conTotali = _withTotals(doc);
          documenti.push(conTotali);
          report.avvisi.push(...avvisi);
          // **The total the file states against the total its lines make.** The reader keeps the
          // two apart on purpose; this is where they meet. A difference is either a rounding the
          // other program made differently, or a file somebody edited by hand — and in both cases
          // the person importing should hear it from the panel, not from the accountant.
          const scarto = _scarto(dichiarato, conTotali.totali.totale);
          if (scarto) report.avvisi.push({ chiave: "impTotalDiffers", numero: doc.numero, ...scarto });
        }
      }

      fonti.push(report);
    }
  }

  return { fonti, clienti, listino, documenti, incassi };
}

/**
 * Write a plan.
 *
 * One transaction for everything, because the parts point at one another: a document at its
 * customer, a payment at its document, a counter at the numbers written. Written apart, a failure
 * between any two would leave a state no screen of this app knows how to draw.
 *
 * **The counters move.** An import of invoices 1 to 12 used to leave the series counter at zero, so
 * the next invoice issued was number 1 — and the unique index refused it, which meant that after the
 * import nothing could be issued at all. Now each series counter is raised to the highest number
 * imported into it, and never lowered: numbering carries on from where the other program left off,
 * which is the whole reason the register is worth importing.
 *
 * Every record written carries `importato: { lotto, fonte, quando }`, so that `undoLast` can find
 * them again and a document can say where it came from.
 */
export async function apply(db, piano) {
  const scritti = { clienti: 0, listino: 0, documenti: 0, incassi: 0 };
  const quando = new Date().toISOString();
  const lotto = globalThis.crypto?.randomUUID?.() || `lotto-${Date.now()}`;
  const marca = (fonte) => ({ lotto, fonte: fonte || "", quando });
  const nota = t("impPaidNote");

  await tx(db, ["parties", "items", "docs", "payments", "counters"], async (scope) => {
    for (const record of piano.clienti) {
      const { _id, _riga, _fonte, ...fields } = record;
      await scope.put("parties", { ...partyRecord({ ...fields, id: _id }), importato: marca(_fonte) });
      scritti.clienti += 1;
    }
    for (const record of piano.listino) {
      const { _fonte, ...fields } = record;
      await scope.put("items", { ...itemRecord(fields), importato: marca(_fonte) });
      scritti.listino += 1;
    }

    const massimi = new Map();                          // series key → highest number imported
    for (const doc of piano.documenti) {
      const { _fonte, _completa, ...fields } = doc;
      // A completion overwrites the reconstruction under the same id, and keeps it on the record:
      // «Annulla l'ultima importazione» puts it back instead of deleting an invoice that was there.
      const precedente = _completa ? await scope.get("docs", fields.id) : null;
      const record = {
        ...fields, chiave: documentKey(fields), updated: quando, importato: marca(_fonte),
      };
      if (precedente && precedente.ricostruito) {
        const { precedente: ignored, ...stub } = precedente;
        record.precedente = stub;
      }
      await scope.put("docs", record);
      scritti.documenti += 1;
      const n = _ordinale(doc.numero);
      if (n !== null) {
        const key = _serieKey(doc);
        massimi.set(key, Math.max(massimi.get(key) || 0, n));
      }
    }
    for (const [key, value] of massimi) {
      const counter = (await scope.get("counters", key)) || { key, value: 0 };
      if (value > counter.value) await scope.put("counters", { key, value });
    }

    for (const incasso of piano.incassi || []) {
      const { _fonte, ...fields } = incasso;
      await scope.put("payments", {
        id: globalThis.crypto?.randomUUID?.() || `pay-${Date.now()}-${scritti.incassi}`,
        docId: fields.docId,
        importo: String(fields.importo),
        data: fields.data,
        scadenza: fields.data,
        conto: null,
        nota,
        importato: marca(_fonte),
      });
      scritti.incassi += 1;
    }
  });

  return { ...scritti, lotto };
}

/**
 * The most recent import still in the database, or `null`: its batch id, when, and what it holds.
 *
 * Derived from the records rather than kept in `meta`, so that it cannot say an import exists
 * after its records are gone — which is exactly the state a half-undone import would leave.
 */
export async function lastImport(db) {
  const tutti = [
    ...(await list(db, "docs")).map((r) => ({ store: "docs", r })),
    ...(await list(db, "parties")).map((r) => ({ store: "parties", r })),
    ...(await list(db, "items")).map((r) => ({ store: "items", r })),
    ...(await list(db, "payments")).map((r) => ({ store: "payments", r })),
  ].filter(({ r }) => r.importato && r.importato.lotto);
  if (!tutti.length) return null;

  const ultimo = tutti.reduce((best, uno) => (
    !best || uno.r.importato.quando > best.r.importato.quando ? uno : best
  ), null).r.importato;
  const suoi = tutti.filter(({ r }) => r.importato.lotto === ultimo.lotto);
  const conta = (store) => suoi.filter((uno) => uno.store === store).length;
  return {
    lotto: ultimo.lotto,
    quando: ultimo.quando,
    clienti: conta("parties"),
    listino: conta("items"),
    documenti: conta("docs"),
    incassi: conta("payments"),
  };
}

/**
 * Take the last import out again.
 *
 * Everything of that batch goes — with one exception, and one repair:
 *
 *  - **a customer the import created stays if a document the import did not create points at it.**
 *    The person made an invoice to that customer in the meantime; deleting the customer would leave
 *    an invoice addressed to nobody, which is worse than a customer that arrived by import.
 *  - **the counters are recomputed, not lowered.** Lowering by what the import raised would be wrong
 *    the moment somebody issued a document after importing: the next number would collide with
 *    theirs. So each affected series is set to the highest number still in the database, which is
 *    right in every case, including the one where nothing else happened.
 */
export async function undoLast(db) {
  const ultimo = await lastImport(db);
  if (!ultimo) return null;
  const { lotto } = ultimo;
  const mio = (r) => r.importato && r.importato.lotto === lotto;

  // Read before the transaction, write inside it: the same discipline as `issue()`, because
  // IndexedDB commits as soon as control returns to the event loop with nothing outstanding, and
  // a `list` in the middle would be exactly that.
  const docs = await list(db, "docs");
  const altri = docs.filter((d) => !mio(d));
  const usati = new Set(altri.map((d) => d.partyId).filter(Boolean));
  const clienti = await list(db, "parties");
  const daTogliere = {
    payments: (await list(db, "payments")).filter(mio),
    docs: docs.filter(mio),
    parties: clienti.filter((c) => mio(c) && !usati.has(c.id)),
    items: (await list(db, "items")).filter(mio),
  };
  // The customers that stay lose the mark: from here on they are the company's own. Left marked,
  // `lastImport` would keep finding a batch of one customer, and the undo button would offer to
  // remove something it then refuses to remove.
  const daTenere = clienti.filter((c) => mio(c) && usati.has(c.id));
  const serie = new Set(daTogliere.docs.map(_serieKey));

  await tx(db, ["parties", "items", "docs", "payments", "counters"], async (scope) => {
    for (const [store, records] of Object.entries(daTogliere)) {
      for (const r of records) {
        // A completion is undone by putting the reconstruction back, not by removing the invoice.
        if (store === "docs" && r.precedente) await scope.put("docs", r.precedente);
        else await scope.remove(store, r.id);
      }
    }
    for (const c of daTenere) {
      const { importato, ...resto } = c;
      await scope.put("parties", resto);
    }
    for (const key of serie) {
      const rimasti = altri.filter((d) => _serieKey(d) === key && d.stato !== "bozza");
      const value = rimasti.reduce((max, d) => Math.max(max, _ordinale(d.numero) || 0), 0);
      await scope.put("counters", { key, value });
    }
  });

  return {
    clienti: daTogliere.parties.length,
    listino: daTogliere.items.length,
    documenti: daTogliere.docs.length,
    incassi: daTogliere.payments.length,
  };
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   s c h e r m a t a
// -----------------------------------------------------------------------------------------------------------------

// Da qui in giù serve una pagina. Sopra no, ed è la ragione per cui la divisione sta dove sta: il
// piano si prova con `node`, il pannello si guarda con gli occhi.

const ETICHETTE = {
  clienti: "impKindClienti",
  listino: "impKindListino",
  registro: "impKindRegistro",
  fattura: "impKindFattura",
  vecchio: "impKindVecchio",
  ignoto: "impKindIgnoto",
};

// Quanti nomi mostrare per elenco prima di dire «e altri N». Un backup ha centinaia di fatture, e
// un elenco di centinaia di righe non lo legge nessuno: si legge fino a dove serve per fidarsi.
const NOMI_MOSTRATI = 60;

let database = null;
let dopo = null;
let corrente = null;                                    // il piano mostrato, in attesa di conferma

function el(id) {
  return document.getElementById(id);
}

/** Una data ISO come la legge una persona: giorno e ora, senza secondi. */
function _quando(iso) {
  const testo = String(iso || "");
  return `${shownDate(testo.slice(0, 10))} ${testo.slice(11, 16)}`.trim();
}

/** Una riga della tabella del pannello. */
function _riga(fonte) {
  const tr = document.createElement("tr");
  const nome = document.createElement("td");
  // `textContent` e non `innerHTML`: il nome del file viene da fuori, e un nome può contenere
  // qualsiasi cosa. Vale per ogni cella qui sotto, per la stessa ragione.
  nome.textContent = fonte.name;
  const cosa = document.createElement("td");
  cosa.textContent = t(ETICHETTE[fonte.tipo] || "impKindIgnoto");
  const muto = fonte.tipo === "vecchio" || fonte.tipo === "ignoto";
  const nuovi = document.createElement("td");
  nuovi.className = "right";
  // Completions — invoices the register had sketched, now with their real lines — are counted
  // with the new, and the list under the table names them apart.
  nuovi.textContent = muto ? "—" : String(fonte.nuovi + (fonte.completati || 0));
  const gia = document.createElement("td");
  gia.className = "right";
  gia.textContent = muto ? "—" : String(fonte.esistenti);
  tr.append(nome, cosa, nuovi, gia);
  return tr;
}

/** Un elenco di nomi, chiuso, con il conteggio nel titolo. */
function _elenco(titolo, nomi) {
  if (!nomi.length) return null;
  const details = document.createElement("details");
  details.className = "imp-names";
  const summary = document.createElement("summary");
  summary.textContent = `${titolo} (${nomi.length})`;
  const ul = document.createElement("ul");
  for (const nome of nomi.slice(0, NOMI_MOSTRATI)) {
    const li = document.createElement("li");
    li.textContent = nome;
    ul.append(li);
  }
  if (nomi.length > NOMI_MOSTRATI) {
    const li = document.createElement("li");
    li.textContent = `… +${nomi.length - NOMI_MOSTRATI}`;
    ul.append(li);
  }
  details.append(summary, ul);
  return details;
}

/**
 * Tutto quello che il piano ha da dire, in righe di testo.
 *
 * Gli avvisi si contano invece di ripetersi: una fattura su duecento che porta un allegato è una
 * nota, duecento note identiche sono un muro in cui la nota diversa non si vede più.
 */
function _note(piano) {
  const righe = [];
  for (const fonte of piano.fonti) {
    if (fonte.tipo === "vecchio") righe.push(`${fonte.name}: ${t("impOld")}`);
    if (fonte.scartate.length) {
      righe.push(`${fonte.name}: ${tf("impSkipped", { elenco: fonte.scartate.join(", ") })}`);
    }
    for (const problema of fonte.problemi) {
      righe.push(`${fonte.name}: ${tf(problema.chiave, problema)}`);
    }
    const contati = new Map();
    for (const avviso of fonte.avvisi) {
      const testo = tf(avviso.chiave, avviso);
      contati.set(testo, (contati.get(testo) || 0) + 1);
    }
    for (const [testo, quante] of contati) {
      righe.push(quante > 1 ? `${fonte.name}: ${testo} (×${quante})` : `${fonte.name}: ${testo}`);
    }
  }
  return righe;
}

function _draw(piano) {
  corrente = piano;
  const nuovi = piano.clienti.length + piano.listino.length + piano.documenti.length;
  const leggibili = piano.fonti.some((f) => f.tipo !== "ignoto" && f.tipo !== "vecchio");

  el("impPanel").hidden = false;
  el("impEmpty").hidden = leggibili;
  el("impTable").hidden = !piano.fonti.length;
  el("impGo").hidden = nuovi === 0;

  const body = el("impBody");
  body.textContent = "";
  for (const fonte of piano.fonti) body.append(_riga(fonte));

  const nomi = el("impNames");
  nomi.textContent = "";
  for (const fonte of piano.fonti) {
    if (!fonte.nomi) continue;
    const blocco = document.createElement("div");
    blocco.className = "imp-source";
    const titolo = document.createElement("p");
    titolo.className = "note";
    titolo.textContent = fonte.name;
    blocco.append(titolo);
    for (const dettaglio of [
      _elenco(t("impNamesNew"), fonte.nomi.nuovi),
      _elenco(t("impNamesExisting"), fonte.nomi.esistenti),
      _elenco(t("impNamesCompleted"), fonte.nomi.completati || []),
    ]) {
      if (dettaglio) blocco.append(dettaglio);
    }
    if (blocco.children.length > 1) nomi.append(blocco);
  }

  const note = el("impNotes");
  note.textContent = "";
  for (const testo of _note(piano)) {
    const li = document.createElement("li");
    li.textContent = testo;
    note.append(li);
  }

  // Il fuoco va sul pannello: chi usa la tastiera o un lettore di schermo deve arrivare su quello
  // che è appena comparso, non restare sul pulsante che l'ha fatto comparire.
  el("impPanel").focus();
}

function _close() {
  corrente = null;
  el("impPanel").hidden = true;
  el("impFiles").value = "";
}

/** I file scelti, letti in memoria e passati a `plan`. */
async function _chosen(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  el("impReading").hidden = false;
  try {
    const sorgenti = [];
    for (const file of files) {
      sorgenti.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
    _draw(await plan(sorgenti, {
      company: (await list(database, "company"))[0] || null,
      parties: await list(database, "parties"),
      items: await list(database, "items"),
      docs: await list(database, "docs"),
    }));
  } catch (ignored) {
    await tell(t("impFailed"));
    _close();
  } finally {
    el("impReading").hidden = true;
    // Il campo si svuota comunque: senza, riscegliere lo stesso file non emette `change` e sembra
    // che il pulsante non funzioni.
    event.target.value = "";
  }
}

async function _go() {
  if (!corrente) return;
  const piano = corrente;
  try {
    const scritti = await apply(database, piano);
    _close();
    await tell(tf("impDone", scritti));
    if (dopo) await dopo();
    // Si arriva dove sono finite le cose, non si resta sulle Impostazioni: ai documenti se ne
    // sono entrati, altrimenti alle anagrafiche. Restare qui lasciava la domanda «e adesso?».
    location.hash = scritti.documenti ? "#/documenti" : "#/anagrafiche";
  } catch (ignored) {
    await tell(t("impFailed"));
  }
}

async function _undo() {
  const ultimo = await lastImport(database);
  if (!ultimo) return;
  if (!(await ask(t("impUndoAsk"), { okLabel: t("impUndo") }))) return;
  try {
    const tolti = await undoLast(database);
    await tell(tf("impUndoDone", tolti));
    await refresh();
    if (dopo) await dopo();
  } catch (ignored) {
    await tell(t("impFailed"));
  }
}

/** Il riquadro dell'annullamento: c'è se c'è un lotto, e dice quale. */
export async function refresh() {
  if (!database) return;
  const ultimo = await lastImport(database);
  el("impUndoBox").hidden = !ultimo;
  if (ultimo) {
    el("impUndoWhen").textContent = tf("impUndoWhen", { ...ultimo, quando: _quando(ultimo.quando) });
  }
}

/** Collega i comandi. Chiamata una volta, all'avvio. */
export function wire(db, { afterChange = null } = {}) {
  database = db;
  dopo = afterChange;
  el("impPick").addEventListener("click", () => el("impFiles").click());
  el("impFiles").addEventListener("change", _chosen);
  el("impGo").addEventListener("click", _go);
  el("impCancel").addEventListener("click", _close);
  el("impUndo").addEventListener("click", _undo);
}
