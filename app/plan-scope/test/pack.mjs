// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A project goes out, gets cut up, and comes back.
//
// The one criterion of the whole export: **export → delete → import gives the project back
// identical, images included.** Everything else here exists because it is the way that criterion
// fails quietly rather than loudly — an archive whose CRC nobody checks, a name that loses its
// accents on somebody else's computer, a manifest that promises an image the archive does not hold.
//
// Runs on Node, with no browser and no dependencies:
//
//     node app/plan-scope/test/pack.mjs
//
// It sits outside run/ because check_apps.py requires every file in there to be in the service
// worker's precache list, and a test is not part of the app.

import assert from "node:assert/strict";

import * as zip from "../run/zip.js";
import * as pack from "../run/pack.js";

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

const bytesOf = (text) => new TextEncoder().encode(text);

// -----------------------------------------------------------------------------------------------------------------
//  z i p
// -----------------------------------------------------------------------------------------------------------------

test("un archivio scritto si rilegge", () => {
  const entries = [
    { name: "project.json", bytes: bytesOf('{"hello":"world"}') },
    { name: "assets/one.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]) },
  ];
  const archive = zip.write(entries);
  const back = zip.read(archive);

  assert.equal(back.length, 2);
  assert.equal(back[0].name, "project.json");
  assert.deepEqual([...back[1].bytes], [...entries[1].bytes]);
});

test("i nomi con gli accenti tornano interi", () => {
  // Bit 11 of the general purpose flag. Without it a reader may decode the name in whatever code
  // page it is running in, and "Scaletta d'autunno" arrives mangled on somebody else's machine.
  const archive = zip.write([{ name: "assets/scaletta-d'autunno-è.png", bytes: bytesOf("x") }]);
  assert.equal(zip.read(archive)[0].name, "assets/scaletta-d'autunno-è.png");
});

test("un archivio vuoto è comunque un archivio", () => {
  assert.deepEqual(zip.read(zip.write([])), []);
});

test("il CRC è vero, e un byte cambiato lo dice", () => {
  const archive = zip.write([{ name: "a.txt", bytes: bytesOf("dodici caratteri") }]);
  // The payload starts after the local header and the name: flipping a byte in there has to be
  // caught. A zero CRC would let this pass, and the archive would open on the machine that wrote it
  // and be called corrupt on the machine that received it.
  const at = 30 + "a.txt".length + 3;
  archive[at] ^= 0xff;
  assert.throws(() => zip.read(archive), /zipBroken/);
});

test("un file che non è un archivio non finge di esserlo", () => {
  assert.throws(() => zip.read(bytesOf("questo è solo del testo")), /zipNotArchive/);
});

test("i dati grandi sopravvivono al giro", () => {
  // Above 64 kB, which is where a length written into sixteen bits instead of thirty-two would
  // start to wrap around — silently, and only for the people with real photographs.
  const big = new Uint8Array(200000);
  for (let i = 0; i < big.length; i += 1) big[i] = (i * 31) % 256;
  const back = zip.read(zip.write([{ name: "assets/big.bin", bytes: big }]));
  assert.equal(back[0].bytes.length, big.length);
  assert.deepEqual([...back[0].bytes.slice(0, 64)], [...big.slice(0, 64)]);
  assert.deepEqual([...back[0].bytes.slice(-64)], [...big.slice(-64)]);
});

// -----------------------------------------------------------------------------------------------------------------
//  p a c k
// -----------------------------------------------------------------------------------------------------------------

const IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x42, 0x43]);

function sample() {
  const asset = {
    id: "asset-1",
    name: "planimetria.png",
    type: "image/png",
    size: IMAGE.length,
    bytes: IMAGE,
  };
  return {
    project: { id: "p1", name: "Fiera di settembre", eventDate: "2026-10-14", columns: [] },
    pages: [{
      id: "g1",
      projectId: "p1",
      parentId: null,
      title: "Scaletta",
      markdown: `# Scaletta\n\nApertura alle 9.\n\n![](${pack.reference(asset)})\n`,
    }],
    tasks: [{ id: "t1", projectId: "p1", title: "Prenotare lo stand", end: "2026-09-20" }],
    assets: [asset],
  };
}

test("il giro completo restituisce lo stesso progetto", () => {
  const data = sample();
  const archive = pack.toZip(data, { schema: 1 });

  const read = pack.parse(archive);
  assert.equal(read.ok, true, "l'archivio appena scritto non si rilegge");
  assert.equal(read.payload.app, "plan-scope");
  assert.deepEqual(read.payload.project, data.project);
  assert.deepEqual(read.payload.tasks, data.tasks);

  const described = pack.describe(read.payload);
  assert.deepEqual(
    [described.name, described.pages, described.tasks, described.assets],
    ["Fiera di settembre", 1, 1, 1],
  );
});

test("le immagini escono e rientrano byte per byte", () => {
  const data = sample();
  const read = pack.parse(pack.toZip(data, { schema: 1 }));
  const stored = read.files.get(read.payload.assets[0].path);
  assert.deepEqual([...stored], [...IMAGE]);
});

test("all'importazione l'immagine cambia identità e il testo la segue", () => {
  // New ids on the way in, always: importing the same file twice is an ordinary thing to do — a
  // colleague sends their copy while you still have yours — and reusing the ids would overwrite the
  // first import with the second, quietly.
  const data = sample();
  const read = pack.parse(pack.toZip(data, { schema: 1 }));

  let n = 0;
  const { assets, pages } = pack.rehome(read.payload, read.files, () => `nuovo-${n += 1}`);

  assert.equal(assets[0].id, "nuovo-1");
  assert.equal(pages[0].markdown.includes("assets/nuovo-1"), true,
    "il riferimento dentro il testo punta ancora al vecchio id");
  assert.equal(pages[0].markdown.includes("asset-1"), false);
  assert.deepEqual([...assets[0].bytes], [...IMAGE]);
});

test("l'export dei soli dati è lo stesso manifesto, senza i byte", () => {
  const json = pack.manifest(sample(), { schema: 1 });
  assert.equal(json.assets.length, 1);
  assert.equal(json.assets[0].bytes, undefined);
  assert.equal(json.assets[0].path, "assets/asset-1.png");
  // And it must survive being written and read as text, which is what the .json export is.
  const back = pack.parse(bytesOf(JSON.stringify(json)));
  assert.equal(back.ok, true);
  assert.equal(back.payload.pages[0].title, "Scaletta");
});

test("un file di qualcun altro viene rifiutato con la ragione giusta", () => {
  const cases = [
    [bytesOf("non sono JSON"), "importNotJson"],
    [bytesOf(JSON.stringify({ app: "csv-scope", project: {} })), "importOtherApp"],
    [bytesOf(JSON.stringify({ app: "plan-scope", format: 99, project: {} })), "importNewer"],
    [bytesOf(JSON.stringify({ app: "plan-scope", format: 1 })), "importNotExport"],
    [bytesOf(JSON.stringify({ app: "plan-scope", format: 1, project: { name: "x" } })),
      "importNotExport"],
  ];
  for (const [bytes, reason] of cases) {
    const read = pack.parse(bytes);
    assert.equal(read.ok, false, `avrebbe dovuto rifiutare: ${reason}`);
    assert.equal(read.reason, reason);
  }
});

test("un archivio che promette un'immagine che non c'è viene fermato prima di scrivere", () => {
  // The whole point of validating before writing: half an import is the one outcome with no way
  // back, and a page pointing at an image nobody has is exactly the hole nobody would notice until
  // they opened that page.
  const data = sample();
  const json = pack.manifest(data, { schema: 1 });
  const archive = zip.write([
    { name: "project.json", bytes: bytesOf(JSON.stringify(json)) },
  ]);
  const read = pack.parse(archive);
  assert.equal(read.ok, false);
  assert.equal(read.reason, "importMissingAsset");
});

test("un archivio troncato dà una ragione nostra, non il messaggio del motore", () => {
  // Cutting an archive in half makes the DataView throw a RangeError, whose message is an English
  // sentence from the engine. Passed through as a reason it would be handed to `t()` and painted on
  // screen verbatim, in one language, looking like a label somebody forgot to translate.
  const whole = pack.toZip(sample(), { schema: 1 });
  const half = whole.slice(0, Math.floor(whole.length / 2));
  const read = pack.parse(half);
  assert.equal(read.ok, false);
  assert.equal(["zipNotArchive", "zipBroken", "zipCompressed"].includes(read.reason), true,
    `ragione inattesa: ${read.reason}`);
});

test("un manifesto con «assets» storto viene rifiutato invece di far esplodere il lettore", () => {
  const base = { app: "plan-scope", format: 1, project: { name: "x" }, pages: [], tasks: [] };
  for (const assets of [42, { uno: 1 }, ["non un oggetto"], [{ senza: "path" }]]) {
    const read = pack.parse(bytesOf(JSON.stringify({ ...base, assets })));
    assert.equal(read.ok, false, `avrebbe dovuto rifiutare: ${JSON.stringify(assets)}`);
    assert.equal(read.reason, "importNotExport");
  }
  // E l'assenza resta legittima: un progetto senza immagini, o un export più vecchio.
  assert.equal(pack.parse(bytesOf(JSON.stringify(base))).ok, true);
});

test("il nome del file non contiene niente che un filesystem rifiuti", () => {
  assert.equal(pack.safeName("Fiera / autunno: 2026?"), "Fiera autunno 2026");
  assert.equal(pack.safeName("   "), "progetto");
  // Gli accenti restano: sono legali ovunque l'app giri, e un progetto chiamato «Fiera d'autunno»
  // non deve uscire come «fiera-d-autunno».
  assert.equal(pack.safeName("Fiera d'autunno è"), "Fiera d'autunno è");
});

test("un archivio con i campi sbagliati viene rifiutato, non importato a metà", () => {
  // Each of these is a well-formed ZIP with a well-formed manifest and one thing wrong inside:
  // what a hand-edited or a corrupted file looks like.
  const broken = [
    (data) => { data.tasks[0].end = "20/09/2026"; },
    (data) => { data.tasks[0].title = 42; },
    (data) => { data.pages[0].markdown = null; },
    (data) => { data.project.columns = [{ name: "senza id" }]; },
    (data) => { data.tasks[0].blockedBy = "t0"; },
    (data) => { data.pages = "no"; },
  ];
  for (const wreck of broken) {
    const data = sample();
    wreck(data);
    const read = pack.parse(pack.toZip(data, { schema: 1 }));
    assert.equal(read.ok, false, `doveva rifiutare: ${wreck.toString()}`);
    assert.equal(read.reason, "importNotExport");
  }
});

test("un byte cambiato dentro l'immagine di un progetto vero ferma l'importazione", () => {
  // The CRC test above works on a one-file archive built by hand. This is the real thing: a
  // project with a page and an image, exported the way the app exports it, with one byte of the
  // image turned over — what a bad disk or a bad transfer does. It has to be refused whole, not
  // imported with a broken picture inside a page that looks fine.
  const data = sample();
  const archive = pack.toZip(data, { schema: 1 });
  const text = new TextDecoder("latin1").decode(archive);
  const wanted = `assets/${data.assets[0].id}`;
  // The path appears twice: inside project.json, and as the name of its own entry. The entry is the
  // one a local header — "PK\3\4", thirty bytes — sits in front of; the header says how long the
  // name and the extra field are, and the bytes of the image start right after both.
  let header = -1;
  for (let at = text.indexOf(wanted); at >= 0; at = text.indexOf(wanted, at + 1)) {
    if (text.startsWith("PK\u0003\u0004", at - 30)) { header = at - 30; break; }
  }
  assert.ok(header >= 0, "l'immagine deve stare nell'archivio come voce propria");
  const view = new DataView(archive.buffer, archive.byteOffset);
  const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  archive[start + 5] ^= 0xff;

  const read = pack.parse(archive);
  assert.equal(read.ok, false);
  assert.equal(read.reason, "zipBroken");
});

console.log(`pack: ${passed} prove passate`);
