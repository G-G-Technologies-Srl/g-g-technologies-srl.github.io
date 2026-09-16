// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Un `.docx` letto come testo: quello che c'era scritto, dentro una pagina.
//
// Chi arriva qui con il lavoro già fatto ce l'ha in Word, e ribatterlo non è un'opzione. Un
// `.docx` è un ZIP di XML — `zip.js` lo apre già, perché è la stessa cosa di un `.xlsx` e di un
// export di Notion — e dentro `word/document.xml` c'è il documento nella sua forma, non nella sua
// impaginazione: paragrafi, titoli, elenchi, tabelle, link, immagini. Sono le stesse cose che
// questa app sa scrivere, quindi la traduzione è possibile e non è un'approssimazione.
//
// **Quello che non entra resta fuori, invece di essere indovinato.** Caselle di testo, colonne,
// note a piè di pagina, campi, revisioni, stili tipografici: non hanno un posto in una pagina
// Markdown, e provare a fabbricarne uno produrrebbe un documento che somiglia all'originale
// dappertutto tranne dove conta. È la stessa regola degli importatori di Trello e di Notion, e il
// riepilogo dice quanto è passato.
//
// Puro: non tocca né il DOM né il modello. Entra un elenco di file (nome + byte), esce il Markdown
// e gli allegati da salvare. L'XML lo legge un lettore scritto qui sotto invece di `DOMParser`,
// per due ragioni: WordprocessingML è XML fatto da una macchina — niente HTML storto da
// sopravvivere, che è il motivo per cui `clip.js` il parser del browser lo usa eccome — e così
// questo file si prova con `node`, che è dove le sue duecento decisioni vanno provate.

import { shield } from "gg/plan-markdown.js";

// -----------------------------------------------------------------------------------------------------------------
//  l ' X M L
// -----------------------------------------------------------------------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

function _entities(text) {
  return String(text).replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    const known = ENTITIES[body.toLowerCase()];
    return known === undefined ? whole : known;
  });
}

/**
 * L'albero di un XML, come `{ name, attrs, kids }` — i figli di testo sono stringhe.
 *
 * Duecento righe di libreria in meno, e nessuna delle cose che rendono difficile leggere HTML:
 * qui i tag si chiudono tutti, gli attributi hanno le virgolette e non c'è niente di implicito.
 * Prologo, commenti e istruzioni di elaborazione si saltano; il resto è un ciclo.
 */
function _xml(text) {
  const clean = String(text || "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const root = { name: "", attrs: {}, kids: [] };
  const stack = [root];
  const tags = /<([^>]*)>/g;
  let at = 0;
  let found = tags.exec(clean);
  while (found) {
    const between = clean.slice(at, found.index);
    if (between) stack[stack.length - 1].kids.push(_entities(between));
    at = tags.lastIndex;
    const body = found[1].trim();
    if (body.startsWith("/")) {
      // Una chiusura che non combacia si ignora: un file storto non deve far perdere il resto.
      if (stack.length > 1) stack.pop();
    } else if (!body.startsWith("!")) {
      const selfClosed = body.endsWith("/");
      const inner = selfClosed ? body.slice(0, -1) : body;
      const name = (inner.match(/^[^\s/]+/) || [""])[0];
      const attrs = {};
      for (const one of inner.slice(name.length).matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
        attrs[one[1]] = _entities(one[2]);
      }
      const node = { name, attrs, kids: [] };
      stack[stack.length - 1].kids.push(node);
      if (!selfClosed) stack.push(node);
    }
    found = tags.exec(clean);
  }
  return root;
}

/** I figli diretti con quel nome. */
function _kids(node, name) {
  return (node.kids || []).filter((one) => one && one.name === name);
}

/** Il primo discendente con quel nome, a qualunque profondità. */
function _find(node, name) {
  for (const one of node.kids || []) {
    if (!one || typeof one === "string") continue;
    if (one.name === name) return one;
    const deeper = _find(one, name);
    if (deeper) return deeper;
  }
  return null;
}

/** Tutti i discendenti con quel nome. */
function _all(node, name, out = []) {
  for (const one of node.kids || []) {
    if (!one || typeof one === "string") continue;
    if (one.name === name) out.push(one);
    _all(one, name, out);
  }
  return out;
}

function _val(node) {
  return node ? String(node.attrs["w:val"] ?? "") : "";
}

/** Un interruttore di Word: `<w:b/>` è acceso, `<w:b w:val="0"/>` è spento. */
function _on(node) {
  if (!node) return false;
  const value = node.attrs["w:val"];
  return value === undefined || !/^(0|false|off)$/i.test(value);
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   d o c u m e n t o
// -----------------------------------------------------------------------------------------------------------------

// I titoli, negli id di stile che Word scrive nelle lingue in cui lo si compra. L'id **non** è
// tradotto quasi mai — resta `Heading1` anche in italiano — ma «quasi mai» non è «mai», e un
// documento nato da un modello di qualcun altro porta `Titolo1`. Costa una riga.
const HEADING = /^(heading|titolo|t[íi]tulo|titre|berschrift|kop|rubrik)\s*-?\s*([1-9])$/i;
// La citazione, negli stili con cui la scrivono i tre programmi con cui l'ho provata: Word la
// chiama «Quote», pandoc «Block Text», LibreOffice «BlockQuotation». Cercata dentro il nome e
// dentro l'id, perché chi scrive l'uno non sempre scrive l'altro.
const QUOTES = /(quotation|quote|citazion|block\s*text)/i;

/** Il testo di un `w:t`, con gli spazi che Word ha deciso di tenere. */
function _plain(node) {
  return (node.kids || []).filter((one) => typeof one === "string").join("");
}

/** Le marcature di un tratto: grassetto, corsivo, barrato. */
function _marks(run) {
  const props = _kids(run, "w:rPr")[0];
  if (!props) return { b: false, i: false, s: false };
  return {
    b: _on(_kids(props, "w:b")[0]) || _on(_kids(props, "w:bCs")[0]),
    i: _on(_kids(props, "w:i")[0]) || _on(_kids(props, "w:iCs")[0]),
    s: _on(_kids(props, "w:strike")[0]) || _on(_kids(props, "w:dstrike")[0]),
  };
}

/** Il carattere che apre e chiude una marcatura, nell'ordine in cui vanno annidate. */
function _wrap(text, { b, i, s }) {
  let out = text;
  if (s) out = `~~${out}~~`;
  if (i) out = `*${out}*`;
  if (b) out = `**${out}**`;
  return out;
}

/**
 * I pezzi di un paragrafo, uniti quando dicono la stessa cosa.
 *
 * Word spezza un tratto a ogni occasione — un controllo ortografico, una lingua, un id di
 * revisione — e «questo» si trova scritto in tre `w:r` consecutivi con lo stesso grassetto. Senza
 * unirli il Markdown esce `**que****st****o**`, che è sbagliato anche da leggere. Si uniscono qui,
 * prima di mettere gli asterischi, che è l'unico punto in cui l'informazione serve intera.
 */
function _fragments(parent, ctx, inherited = null) {
  const out = [];
  const push = (text, marks, link) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.link === link && last.b === marks.b && last.i === marks.i && last.s === marks.s) {
      last.text += text;
      return;
    }
    out.push({ text, link, ...marks });
  };

  for (const node of parent.kids || []) {
    if (!node || typeof node === "string") continue;
    if (node.name === "w:hyperlink") {
      const rel = ctx.rels.get(node.attrs["r:id"]) || null;
      const href = rel && rel.external ? rel.target : "";
      for (const piece of _fragments(node, ctx, href)) out.push(piece);
      continue;
    }
    if (node.name !== "w:r") continue;
    const marks = _marks(node);
    for (const inside of node.kids || []) {
      if (!inside || typeof inside === "string") continue;
      if (inside.name === "w:t") push(_plain(inside), marks, inherited);
      else if (inside.name === "w:tab") push(" ", marks, inherited);
      else if (inside.name === "w:br" || inside.name === "w:cr") push("\n", marks, inherited);
      else if (inside.name === "w:drawing" || inside.name === "w:pict") {
        const picture = _image(inside, ctx);
        if (picture) push(picture, { b: false, i: false, s: false }, null);
      }
    }
  }
  return out;
}

/** Un'immagine dentro un tratto: l'allegato nasce qui, e nel testo resta il suo riferimento. */
function _image(node, ctx) {
  const blip = _find(node, "a:blip");
  const old = _find(node, "v:imagedata");
  const rid = (blip && (blip.attrs["r:embed"] || blip.attrs["r:link"]))
    || (old && (old.attrs["r:id"] || old.attrs["o:relid"]));
  const rel = rid ? ctx.rels.get(rid) : null;
  if (!rel || rel.external) return "";
  const path = rel.target.startsWith("word/") ? rel.target : `word/${rel.target}`;
  const bytes = ctx.files.get(path);
  if (!bytes) return "";
  // La stessa immagine usata due volte è un allegato solo: un logo ripetuto a ogni pagina
  // peserebbe quanto le pagine.
  if (!ctx.pictures.has(path)) {
    const name = path.split("/").pop() || "immagine";
    const ext = (name.split(".").pop() || "png").toLowerCase();
    const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
      webp: "image/webp", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff",
      emf: "image/emf", wmf: "image/wmf", svg: "image/svg+xml" }[ext] || "application/octet-stream";
    const id = ctx.newId();
    ctx.assets.push({ id, name, type, size: bytes.length, bytes });
    ctx.pictures.set(path, { id, ext: ext === "jpeg" ? "jpg" : ext });
  }
  const asset = ctx.pictures.get(path);
  const doc = _find(node, "wp:docPr");
  const alt = doc ? String(doc.attrs.descr || doc.attrs.name || "").trim() : "";
  return `![${alt.replace(/[[\]]/g, " ")}](assets/${asset.id}.${asset.ext})`;
}

/** Il testo di un paragrafo, con le sue marcature e i suoi link. */
function _inline(parent, ctx) {
  return _fragments(parent, ctx).map((piece) => {
    // Gli spazi non stanno dentro gli asterischi: `** testo**` non è grassetto in nessun dialetto
    // di Markdown, e Word il grassetto lo mette volentieri anche sullo spazio che segue.
    const before = (piece.text.match(/^\s*/) || [""])[0];
    const after = piece.text.length > before.length ? (piece.text.match(/\s*$/) || [""])[0] : "";
    const core = piece.text.slice(before.length, piece.text.length - after.length);
    if (!core) return piece.text;
    const marked = _wrap(core, piece);
    return `${before}${piece.link ? `[${marked}](${piece.link})` : marked}${after}`;
  }).join("");
}

/** Il livello di un titolo, dallo stile o dal livello di struttura; zero se non è un titolo. */
function _headingLevel(props, ctx) {
  const styleId = _val(_kids(props, "w:pStyle")[0]).trim();
  for (const style of _chain(ctx, styleId)) {
    if (/^(title|titolo)$/i.test(style.name)) return 1;
    const named = HEADING.exec(String(style.name).replace(/\s+/g, ""));
    if (named) return Math.min(6, Number(named[2]));
  }
  if (/^(title|titolo|t[íi]tulo|titre)$/i.test(styleId)) return 1;
  const named = HEADING.exec(styleId.replace(/\s+/g, ""));
  if (named) return Math.min(6, Number(named[2]));
  // Il livello di struttura, che è quello che fa muovere il riquadro di spostamento di Word: se un
  // paragrafo sta al primo livello lì, è un titolo anche se il suo stile si chiama in un altro modo.
  const outline = _kids(props, "w:outlineLvl")[0]
    ? _val(_kids(props, "w:outlineLvl")[0])
    : (_chain(ctx, styleId).find((style) => style.outline !== "") || {}).outline;
  const level = Number(outline);
  if (outline !== undefined && outline !== "" && Number.isFinite(level) && level >= 0 && level <= 8) {
    return Math.min(6, level + 1);
  }
  return 0;
}

/** Il segno di un elenco: `-` per i punti, `1.` per i numeri, e di quanto è rientrato. */
function _listMark(props, ctx) {
  const styleId = _val(_kids(props, "w:pStyle")[0]).trim();
  const inherited = _chain(ctx, styleId).find((style) => style.numId);
  const numbering = _kids(props, "w:numPr")[0];
  // `w:numId` con valore zero vuol dire «niente elenco», ed è così che un paragrafo si toglie da
  // un elenco senza cambiare stile.
  const direct = numbering ? _val(_kids(numbering, "w:numId")[0]) : "";
  const numId = direct || (inherited ? inherited.numId : "");
  const named = _chain(ctx, styleId).some((style) => /^list\s*(bullet|number|paragraph)/i.test(style.name));
  if ((!numId || numId === "0") && !(named && numbering)) return null;
  const level = Number(
    (numbering ? _val(_kids(numbering, "w:ilvl")[0]) : "") || (inherited ? inherited.ilvl : "") || 0,
  ) || 0;
  // Senza `numbering.xml` — o senza quel numero dentro — il punto elenco è la scelta che sbaglia
  // meno: un elenco numerato letto come puntato resta un elenco, il contrario inventa un ordine.
  const kind = ctx.numbering.get(`${numId}|${level}`)
    || (_chain(ctx, styleId).some((style) => /number/i.test(style.name)) ? "decimal" : "bullet");
  return { mark: kind === "bullet" ? "-" : "1.", indent: "  ".repeat(Math.min(6, level)) };
}

function _paragraph(node, ctx) {
  const props = _kids(node, "w:pPr")[0] || { kids: [], attrs: {} };
  const text = _inline(node, ctx).replace(/[ \t]+$/g, "");
  const list = _listMark(props, ctx);
  const level = _headingLevel(props, ctx);

  if (!text.trim()) {
    // Un paragrafo vuoto in Word è spazio bianco, e in Markdown lo spazio fra i blocchi c'è già.
    // Una riga di un elenco però resta, se no l'elenco si spezza in due.
    return list ? `${list.indent}${list.mark} ` : "";
  }
  if (level) { ctx.counts.headings += 1; return `${"#".repeat(level)} ${text}`; }
  if (list) { ctx.counts.list += 1; return `${list.indent}${list.mark} ${text}`; }
  const styleId = _val(_kids(props, "w:pStyle")[0]);
  if (QUOTES.test(styleId) || _chain(ctx, styleId).some((one) => QUOTES.test(one.name))) {
    ctx.counts.quotes += 1;
    return text.split("\n").map((line) => `> ${line}`).join("\n");
  }
  // Un'immagine da sola è un blocco, e schermarla la trasformerebbe nella scritta `\![…](…)`:
  // la protezione qui sotto serve a quello che **in Word era testo**, non a quello che scrivo io.
  if (/^!\[[^\]]*\]\([^)\s]+\)$/.test(text.trim())) return text.trim();
  ctx.counts.paragraphs += 1;
  // Una riga che in Word è testo e qui aprirebbe un blocco — «- 5 % di sconto», «# 3 della lista»
  // — si protegge con la stessa regola che l'app usa per quello che si scrive a mano.
  return text.split("\n").map(shield).join("\n");
}

/** Il testo di una cella: i suoi paragrafi su una riga sola, perché una cella non tiene blocchi. */
function _cell(node, ctx) {
  return _kids(node, "w:p").map((one) => _inline(one, ctx).trim()).filter(Boolean)
    .join(" ").replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function _table(node, ctx) {
  const rows = _kids(node, "w:tr").map((tr) => _kids(tr, "w:tc").map((tc) => _cell(tc, ctx)));
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const square = rows.map((row) => [...row, ...Array(width - row.length).fill("")]);
  ctx.counts.tables += 1;
  // Markdown vuole una riga di intestazione, e in una tabella di Word la prima riga lo è quasi
  // sempre. Quando non lo è si perde poco: resta la prima riga, in grassetto.
  const head = square[0];
  const rule = Array(width).fill("---");
  return [head, rule, ...square.slice(1)].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

// -----------------------------------------------------------------------------------------------------------------
//  i   f i l e   d i   c o n t o r n o
// -----------------------------------------------------------------------------------------------------------------

/** `rId7` → dove punta. Le relazioni dicono dove stanno le immagini e dove vanno i link. */
function _rels(text) {
  const out = new Map();
  if (!text) return out;
  for (const one of _all(_xml(text), "Relationship")) {
    const id = one.attrs.Id;
    if (!id) continue;
    out.set(id, {
      target: String(one.attrs.Target || "").replace(/^\.\//, ""),
      external: String(one.attrs.TargetMode || "").toLowerCase() === "external",
    });
  }
  return out;
}

/**
 * Gli stili: `styleId` → quello che il paragrafo eredita senza dirlo.
 *
 * Un elenco non è sempre scritto sul paragrafo. Word ci mette `w:numPr` quando lo fai con il
 * pulsante, ma un documento nato da un modello — o scritto da un programma, o da LibreOffice —
 * dice solo «questo paragrafo ha lo stile *List Bullet*», e il numero sta nello stile. Letto solo
 * dal paragrafo, un elenco di dodici punti diventava dodici paragrafi: provato su un file vero.
 *
 * `w:name` è il nome canonico in inglese e lo scrivono tutti uguale — «heading 1», «List Bullet» —
 * mentre il `styleId` lo traduce chi vuole. Per riconoscere un titolo vale più il primo.
 */
function _styles(text) {
  const out = new Map();
  if (!text) return out;
  const root = _xml(text);
  for (const one of _all(root, "w:style")) {
    const id = one.attrs["w:styleId"];
    if (!id) continue;
    const props = _kids(one, "w:pPr")[0] || { kids: [], attrs: {} };
    const numbering = _kids(props, "w:numPr")[0];
    out.set(String(id), {
      name: _val(_kids(one, "w:name")[0]),
      basedOn: _val(_kids(one, "w:basedOn")[0]),
      numId: numbering ? _val(_kids(numbering, "w:numId")[0]) : "",
      ilvl: numbering ? _val(_kids(numbering, "w:ilvl")[0]) : "",
      outline: _kids(props, "w:outlineLvl")[0] ? _val(_kids(props, "w:outlineLvl")[0]) : "",
    });
  }
  return out;
}

/** Uno stile e quelli da cui discende, dal più vicino al più lontano. Con il freno per i cicli. */
function _chain(ctx, styleId) {
  const out = [];
  const seen = new Set();
  let id = String(styleId || "");
  while (id && ctx.styles.has(id) && !seen.has(id)) {
    seen.add(id);
    const style = ctx.styles.get(id);
    out.push(style);
    id = style.basedOn;
  }
  return out;
}

/** `numId|livello` → `bullet` o il formato dei numeri, letto da `numbering.xml`. */
function _numbering(text) {
  const out = new Map();
  if (!text) return out;
  const root = _xml(text);
  const abstract = new Map();
  for (const one of _all(root, "w:abstractNum")) {
    const id = one.attrs["w:abstractNumId"];
    if (id === undefined) continue;
    const levels = new Map();
    for (const lvl of _kids(one, "w:lvl")) {
      levels.set(String(lvl.attrs["w:ilvl"] ?? "0"), _val(_kids(lvl, "w:numFmt")[0]) || "bullet");
    }
    abstract.set(String(id), levels);
  }
  for (const one of _all(root, "w:num")) {
    const numId = one.attrs["w:numId"];
    const points = _val(_kids(one, "w:abstractNumId")[0]);
    const levels = abstract.get(String(points));
    if (numId === undefined || !levels) continue;
    for (const [level, format] of levels) out.set(`${numId}|${Number(level)}`, format);
  }
  return out;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Un `.docx` si riconosce dai due file che ci sono sempre, non dal nome. */
export function isDocx(entries) {
  const names = new Set((entries || []).map((one) => String(one.name).replace(/\\/g, "/")));
  return names.has("word/document.xml") && names.has("[Content_Types].xml");
}

/**
 * Il documento, come Markdown e allegati.
 *
 * `entries` sono i file dell'archivio già aperti da `zip.readAny`; `decode` legge dei byte come
 * testo (in UTF-8, che è quello in cui Word scrive il suo XML); `newId` conia gli id degli
 * allegati — passato da fuori, così le prove possono renderli prevedibili.
 *
 * Torna `{ markdown, assets, counts }`, o `null` se quel file non è un `.docx`.
 */
export function fromDocx(entries, { newId, decode }) {
  if (!isDocx(entries)) return null;
  const files = new Map((entries || []).map((one) => [String(one.name).replace(/\\/g, "/"), one.bytes]));
  const ctx = {
    files,
    newId,
    assets: [],
    pictures: new Map(),
    rels: _rels(files.has("word/_rels/document.xml.rels")
      ? decode(files.get("word/_rels/document.xml.rels")) : ""),
    numbering: _numbering(files.has("word/numbering.xml")
      ? decode(files.get("word/numbering.xml")) : ""),
    styles: _styles(files.has("word/styles.xml") ? decode(files.get("word/styles.xml")) : ""),
    counts: { headings: 0, paragraphs: 0, list: 0, tables: 0, quotes: 0 },
  };

  const body = _find(_xml(decode(files.get("word/document.xml"))), "w:body");
  if (!body) return null;

  const blocks = [];
  for (const node of body.kids || []) {
    if (!node || typeof node === "string") continue;
    if (node.name === "w:p") {
      const line = _paragraph(node, ctx);
      // Le righe di un elenco vanno attaccate: una riga vuota in mezzo spezza l'elenco in due.
      const last = blocks[blocks.length - 1];
      if (line && last !== undefined && /^\s*(-|\d+\.)\s/.test(line) && /^\s*(-|\d+\.)\s/.test(last)) {
        blocks[blocks.length - 1] = `${last}\n${line}`;
      } else if (line) {
        blocks.push(line);
      }
    } else if (node.name === "w:tbl") {
      const table = _table(node, ctx);
      if (table) blocks.push(table);
    }
  }

  ctx.counts.images = ctx.assets.length;
  return { markdown: `${blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()}\n`,
    assets: ctx.assets, counts: ctx.counts };
}
