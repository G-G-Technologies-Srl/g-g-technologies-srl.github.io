// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The reader for documents somebody else wrote.
//
// Every case here comes from a real file or from a real defect, and the list is short on purpose:
// the parser is small, so the tests are about the four things that actually differ between what we
// emit and what arrives — prefixes, attributes, self-closing tags, and entities.
//
//     node app/invoice-scope/test/xmlread.mjs

import assert from "node:assert/strict";
import * as x from "../run/xmlread.js";

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
//  l a   f o r m a   d i   b a s e
// -----------------------------------------------------------------------------------------------------------------

prova("un albero, con testo e figli", () => {
  const root = x.parse(`<a><b>uno</b><c><d>due</d></c></a>`);
  assert.equal(root.name, "a");
  assert.equal(x.value(root, "b"), "uno");
  assert.equal(x.value(root, "c", "d"), "due");
});

prova("il rientro non entra nei valori", () => {
  const root = x.parse(`<a>\n  <b>uno</b>\n</a>`);
  assert.equal(x.value(root, "b"), "uno");
});

prova("un elemento assente è null, uno vuoto è stringa vuota", () => {
  const root = x.parse(`<a><b></b></a>`);
  assert.equal(x.value(root, "b"), "");
  assert.equal(x.value(root, "z"), null);
  assert.equal(x.child(root, "z", "y"), null);
});

prova("i tag auto-chiusi non aprono niente", () => {
  const root = x.parse(`<a><b/><c attr="1" /><d>giù</d></a>`);
  assert.deepEqual(root.kids.map((k) => k.name), ["b", "c", "d"]);
  assert.equal(x.value(root, "d"), "giù");
});

prova("all() dà tutti i fratelli con quel nome", () => {
  const root = x.parse(`<a><r>1</r><r>2</r><s>x</s><r>3</r></a>`);
  assert.deepEqual(x.all(root, "r").map((n) => n.text), ["1", "2", "3"]);
  assert.deepEqual(x.all(root, "manca"), []);
  assert.deepEqual(x.all(null, "r"), []);
});

// -----------------------------------------------------------------------------------------------------------------
//  q u e l l o   c h e   a r r i v a   d a   f u o r i
// -----------------------------------------------------------------------------------------------------------------

prova("il prefisso di namespace si toglie, comunque sia scritto", () => {
  for (const prefisso of ["", "p:", "ns2:", "ns3:"]) {
    const root = x.parse(
      `<${prefisso}FatturaElettronica versione="FPR12">` +
      `<FatturaElettronicaHeader><DatiTrasmissione><ProgressivoInvio>54</ProgressivoInvio>` +
      `</DatiTrasmissione></FatturaElettronicaHeader></${prefisso}FatturaElettronica>`,
    );
    assert.equal(root.name, "FatturaElettronica", `prefisso «${prefisso}»`);
    assert.equal(root.attrs.versione, "FPR12");
    assert.equal(x.value(root, "FatturaElettronicaHeader", "DatiTrasmissione", "ProgressivoInvio"), "54");
  }
});

prova("gli attributi si leggono con l'una e l'altra virgoletta", () => {
  const root = x.parse(`<c r="B3" t='s' s="12"/>`);
  assert.deepEqual(root.attrs, { r: "B3", t: "s", s: "12" });
});

prova("un attributo con prefisso resta scritto com'era", () => {
  // `xml:space="preserve"` è quello che Excel mette sulle stringhe che finiscono con uno spazio.
  // Togliergli il prefisso lo farebbe diventare `space`, e chi lo cerca non lo troverebbe più.
  const root = x.parse(`<t xml:space="preserve"> Roma </t>`);
  assert.equal(root.attrs["xml:space"], "preserve");
  assert.equal(root.text, " Roma ");
});

prova("dichiarazione, DOCTYPE, commenti e istruzioni si saltano", () => {
  const root = x.parse(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE a>\n<!-- un commento con <tag> dentro -->\n` +
    `<a><?istruzione qui?><b>uno</b><!-- e un altro --></a>`,
  );
  assert.equal(x.value(root, "b"), "uno");
  assert.deepEqual(root.kids.map((k) => k.name), ["b"]);
});

prova("CDATA arriva alla lettera, senza sconti sulle entità", () => {
  const root = x.parse(`<a><![CDATA[C & D <non un tag> &amp;]]></a>`);
  assert.equal(root.text, "C & D <non un tag> &amp;");
});

// -----------------------------------------------------------------------------------------------------------------
//  e n t i t à
// -----------------------------------------------------------------------------------------------------------------

prova("le cinque entità nominate, nel testo e negli attributi", () => {
  const root = x.parse(`<a k="&lt;&amp;&gt;&quot;&apos;">&lt;&amp;&gt;&quot;&apos;</a>`);
  assert.equal(root.text, `<&>"'`);
  assert.equal(root.attrs.k, `<&>"'`);
});

prova("i riferimenti numerici, decimali ed esadecimali", () => {
  const root = x.parse(`<a>&#233;&#xE0;&#x1F600;</a>`);
  assert.equal(root.text, "éà\u{1F600}");
});

prova("un'entità sconosciuta resta com'è invece di sparire", () => {
  // Un'entità dichiarata in un DOCTYPE che non leggiamo. Mangiarla in silenzio cambierebbe il testo
  // di una fattura senza dirlo a nessuno; lasciarla visibile fa vedere che c'è.
  const root = x.parse(`<a>&nbsp;&sconosciuta;</a>`);
  assert.equal(root.text, "&nbsp;&sconosciuta;");
});

prova("l'ampersand si disfa una volta sola", () => {
  // Il rovescio della regola dell'emettitore: se `&amp;lt;` diventasse `<`, un testo che conteneva
  // davvero «&lt;» tornerebbe indietro come un tag.
  const root = x.parse(`<a>&amp;lt;</a>`);
  assert.equal(root.text, "&lt;");
});

// -----------------------------------------------------------------------------------------------------------------
//  d e e p T e x t
// -----------------------------------------------------------------------------------------------------------------

prova("deepText rimette insieme una stringa spezzata in run", () => {
  // La forma vera di una cella in `sharedStrings.xml`: Excel apre un `<r>` a ogni cambio di
  // formato, quindi «Via Roma» in grassetto solo sul numero arriva in tre pezzi.
  const si = x.parse(`<si><r><t>Via </t></r><r><t>Roma</t></r><r><t xml:space="preserve"> 1</t></r></si>`);
  assert.equal(x.deepText(si), "Via Roma 1");
  assert.equal(si.text, "", "il testo diretto di <si> è vuoto: sta tutto nei figli");
});

prova("deepText su un nodo assente dà stringa vuota", () => {
  assert.equal(x.deepText(null), "");
});

// -----------------------------------------------------------------------------------------------------------------
//  q u a n d o   i l   f i l e   è   r o t t o
// -----------------------------------------------------------------------------------------------------------------

for (const [nome, sorgente] of [
  ["un tag non chiuso", "<a><b>uno</a>"],
  ["una chiusura senza apertura", "<a></b></a>"],
  ["niente radice", "   \n  "],
  ["due radici", "<a/><b/>"],
  ["commento non chiuso", "<a><!-- qui"],
  ["CDATA non chiuso", "<a><![CDATA[qui"],
  ["attributo senza virgolette", "<a k=1/>"],
  ["attributo senza valore", "<a k/>"],
]) {
  prova(`si ferma: ${nome}`, () => {
    assert.throws(() => x.parse(sorgente), SyntaxError, `«${sorgente}» doveva fermarsi`);
  });
}

prova("l'errore dice cosa e dove", () => {
  // Un messaggio senza posizione manda a rileggere il file intero: qui il difetto vero è che `</a>`
  // chiude un `<b>` ancora aperto, e il messaggio deve nominarli tutti e due.
  let messaggio = "";
  try {
    x.parse("<a><b>uno</a>");
  } catch (error) {
    messaggio = error.message;
  }
  assert.match(messaggio, /<\/a> chiude <b>/);
  assert.match(messaggio, /posizione \d+/);
});

console.log(`xmlread: ${passed} prove passate`);
