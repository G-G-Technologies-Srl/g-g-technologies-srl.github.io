# -*- coding: utf-8 -*-
"""Check the apps under app/<key>/run/: the promises they make and the values they repeat.

The apps sit outside the site build on purpose, so nothing regenerates them and nothing would
notice them drifting. This is the counterweight: it reads and changes nothing, and it fails loudly.

It exists because of a sentence in the root CLAUDE.md — a reminder gets forgotten, a check that
stops the build does not. Two of the defects found on the first run in a browser would have been
caught here instead.

Usage:  python3 _src/check_apps.py
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import article_art                                            # noqa: E402
from apps import APPS                                         # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"

# The shared library, and the specifier the apps reach it by. Both apps import through the import
# map — `gg/store.js`, never `../../_lib/store.js` — so the day the library takes a version number
# is one line per app instead of every import in every file.
LIB_DIR = APP_DIR / "_lib"
LIB_SPECIFIER = "gg/"

# What the manifest and the palette have to agree on. Same values as styles.css and the site.
DARK_BAR = "#0d1220"

# Anything that would reach the network. `fetch` is allowed in sw.js alone, and only there because a
# service worker without a fetch handler is not installable — that one is checked separately.
NETWORK = [
    (r"\bfetch\s*\(", "fetch()"),
    (r"\bXMLHttpRequest\b", "XMLHttpRequest"),
    (r"\bnavigator\.sendBeacon\b", "sendBeacon"),
    (r"\bnew\s+WebSocket\b", "WebSocket"),
    (r"\bnew\s+EventSource\b", "EventSource"),
    (r"\bimport\s*\(\s*[\"']https?://", "import() da un URL"),
]


# -----------------------------------------------------------------------------------------------------------------
#  p r i v a t e
# -----------------------------------------------------------------------------------------------------------------

def _apps_on_disk():
    if not APP_DIR.is_dir():
        return []
    return sorted(p.name for p in APP_DIR.iterdir() if p.is_dir() and (p / "run").is_dir())


def _run_files(key):
    """Every file the browser can load, relative to run/."""
    run = APP_DIR / key / "run"
    return sorted(str(p.relative_to(run)) for p in run.rglob("*") if p.is_file())


def _lib_files():
    """Every file in the shared library, as the apps name it in their precache list."""
    if not LIB_DIR.is_dir():
        return set()
    return {f"../../_lib/{p.relative_to(LIB_DIR)}" for p in LIB_DIR.rglob("*") if p.is_file()
            and p.name not in ("LICENSE", "NOTICE")}


def _lib_specifiers(key):
    """Which library modules an app actually imports, as `gg/…` specifiers."""
    used = set()
    run = APP_DIR / key / "run"
    for path in sorted(run.rglob("*.js")):
        for match in re.findall(r'from\s+["\'](gg/[^"\']+)["\']', path.read_text(encoding="utf-8")):
            used.add(match)
    for path in sorted(run.rglob("*.html")):
        for match in re.findall(r'href="\.\./\.\./_lib/([^"]+)"', path.read_text(encoding="utf-8")):
            used.add(LIB_SPECIFIER + match)
    return used


def _js_keys(source, name):
    """The keys of a `const NAME = { ... };` object, read without running the file.

    A regex and not an interpreter, so this stays dependency-free like the rest of the build. It
    only has to see the keys, and the dictionaries are written one key per line for exactly this
    reason — if that ever stops being true, this check says so instead of passing quietly.
    """
    block = re.search(rf"const {name} = \{{(.*?)\n\}};", source, re.S)
    if not block:
        return None
    return re.findall(r"^\s{2}([A-Za-z_]\w*):", block.group(1), re.M)


# -----------------------------------------------------------------------------------------------------------------
#  c h e c k s
# -----------------------------------------------------------------------------------------------------------------

def _check_registry(problems):
    """Every app declared has a folder, and every folder is declared."""
    declared = {app["key"] for app in APPS}
    on_disk = set(_apps_on_disk())
    for key in sorted(declared - on_disk):
        problems.append(f"«{key}» è in _src/apps.py ma non esiste app/{key}/run/")
    for key in sorted(on_disk - declared):
        problems.append(f"app/{key}/ esiste ma non è in APPS: la scheda non verrà generata")
    for app in APPS:
        shape = app.get("art", {}).get("shape")
        if app["key"] in on_disk and article_art.APP_ART.get(app["key"]) is None:
            problems.append(f"«{app['key']}»: manca il disegno «{shape}» in APP_ART "
                            f"dentro _src/article_art.py")


def _check_lib(problems):
    """The shared library, once, instead of once per app.

    It exists at all because the rule in app/CLAUDE.md was met: a module enters `_lib/` on its
    second real use, not on the first, and the second app is what put it there. From that point on
    the library is a thing that can be got wrong on its own — hence its own licence, and its own
    version of the promise every app makes.
    """
    if not LIB_DIR.is_dir():
        return
    for name in ("LICENSE", "NOTICE"):
        if not (LIB_DIR / name).is_file():
            problems.append(f"manca app/_lib/{name}: quando un modulo si sposta qui, la sua "
                            f"licenza viene con lui")
    _check_lib_no_network(problems)


def _check_lib_no_network(problems):
    """The library makes the same promise the apps do, and nothing else was checking it.

    Worth its own function rather than a wider glob: `_check_no_network` walks `run/`, and the day
    the first module moved out of an app it left the only check that covered it behind. A shared
    module that reached the network would break the promise of every app at once.
    """
    for path in sorted(LIB_DIR.rglob("*.js")):
        code = re.sub(r"/\*.*?\*/|//[^\n]*", "", path.read_text(encoding="utf-8"), flags=re.S)
        for pattern, label in NETWORK:
            if re.search(pattern, code):
                problems.append(f"_lib/{path.name}: contiene {label} — le app promettono di non "
                                f"fare richieste di rete")
    for path in sorted(LIB_DIR.rglob("*.css")):
        if re.search(r"url\(\s*['\"]?https?://|@import[^;]*http", path.read_text(encoding="utf-8")):
            problems.append(f"_lib/{path.name}: carica una risorsa da un altro dominio")


def _check_no_network(problems, key):
    """The promise the app makes, verified instead of repeated."""
    run = APP_DIR / key / "run"
    for path in sorted(run.rglob("*.js")):
        source = path.read_text(encoding="utf-8")
        # Comments would otherwise trip every pattern: this file's own prose says "fetch()" too.
        code = re.sub(r"/\*.*?\*/|//[^\n]*", "", source, flags=re.S)
        for pattern, label in NETWORK:
            if re.search(pattern, code) and not (path.name == "sw.js" and label == "fetch()"):
                problems.append(f"{key}/run/{path.name}: contiene {label} — l'app promette di non "
                                f"fare richieste di rete")

    for path in sorted(list(run.rglob("*.html")) + list(run.rglob("*.css"))):
        text = path.read_text(encoding="utf-8")
        # A link the reader may follow is fine; a resource the page loads by itself is not.
        for match in re.findall(r'(?:src|href)="(https?://[^"]+)"', text):
            tag = re.search(rf'<(\w+)[^>]*"{re.escape(match)}"', text)
            element = tag.group(1) if tag else "?"
            if element not in ("a",) and 'rel="canonical"' not in (tag.group(0) if tag else ""):
                problems.append(f"{key}/run/{path.name}: carica {match} da un altro dominio")
        for match in re.findall(r"url\(\s*['\"]?https?://", text):
            problems.append(f"{key}/run/{path.name}: il CSS carica una risorsa esterna")
        if "@import" in text and "http" in text:
            problems.append(f"{key}/run/{path.name}: @import da un altro dominio")


def _check_i18n(problems, key):
    path = APP_DIR / key / "run" / "i18n.js"
    if not path.is_file():
        problems.append(f"{key}: manca run/i18n.js — le stringhe devono stare in un file solo")
        return
    source = path.read_text(encoding="utf-8")
    it, en = _js_keys(source, "IT"), _js_keys(source, "EN")
    if it is None or en is None:
        problems.append(f"{key}/run/i18n.js: non trovo i due dizionari IT ed EN")
        return
    for missing in sorted(set(it) - set(en)):
        problems.append(f"{key}/run/i18n.js: «{missing}» manca in EN")
    for missing in sorted(set(en) - set(it)):
        problems.append(f"{key}/run/i18n.js: «{missing}» manca in IT")


def _check_wiring(problems, key):
    """Every key asked for exists, and every element asked for exists.

    Two failures with the same shape: they are silent. A `data-t` naming a key that is not in the
    dictionary renders as the key itself — a label reading "howHyper" in the middle of the page,
    which nobody sees until it is on somebody else's screen. An `el("…")` naming an id that is not
    in the markup returns null, and the app dies at the first `addEventListener` with a message
    that names no file the reader recognises.

    Both are caught by reading the two files side by side, which is cheap, and neither is caught by
    anything else in this project.
    """
    run = APP_DIR / key / "run"
    html_path = run / "index.html"
    i18n_path = run / "i18n.js"
    if not html_path.is_file() or not i18n_path.is_file():
        return

    html = html_path.read_text(encoding="utf-8")
    known = set(_js_keys(i18n_path.read_text(encoding="utf-8"), "IT") or [])
    if not known:
        return                                        # _check_i18n has already said so

    for used in sorted(set(re.findall(r'data-t(?:-label)?="([^"]+)"', html))):
        if used not in known:
            problems.append(f"{key}/run/index.html: «data-t={used}» non è una chiave di i18n.js — "
                            f"in pagina comparirebbe il nome della chiave")

    ids = set(re.findall(r'\bid="([^"]+)"', html))
    for path in sorted(run.rglob("*.js")):
        for wanted in sorted(set(re.findall(r'\bel\("([^"]+)"\)', path.read_text(encoding="utf-8")))):
            if wanted not in ids:
                problems.append(f"{key}/run/{path.name}: cerca l'elemento «{wanted}», che nel "
                                f"markup non c'è — l'app si fermerebbe all'avvio")


def _check_share(problems, key):
    """Un'app non scrive mai il proprio indirizzo `run/` come link assoluto.

    La regola è quella della barra di condivisione in app/CLAUDE.md, applicata al posto in cui si
    rompe: l'app è `noindex` e il suo canonical nomina già la scheda, quindi un link verso `run/`
    passato in giro non accumula niente e scarica chi arriva dentro un attrezzo senza il testo che
    spiega cos'è e a che condizioni.

    Il controllo guarda le stringhe intere e non le righe, perché la prima versione cercava il
    dominio di un social e «/run/» sulla stessa riga — e l'indirizzo stava tre righe più su, in una
    costante. Un controllo che dipende da come è formattato il codice non controlla niente.

    E gli script di terze parti: `_check_no_network` prende gli `src` esterni ovunque, qui resta la
    metà che riguarda i widget, cioè che non ne compaia uno nemmeno per condividere.
    """
    run = APP_DIR / key / "run"
    proprio = f"ggtechnologies.sm/app/{key}/run"
    for path in sorted(run.rglob("*.js")):
        for stringa in re.findall(r'["\'`]([^"\'`]*)["\'`]', path.read_text(encoding="utf-8")):
            if proprio in stringa:
                problems.append(f"{key}/run/{path.name}: «{stringa}» è un link assoluto verso "
                                f"run/. Quello che si passa in giro è la scheda")

    # Solo gli script che vengono da fuori: `./app.js` è l'app, e va benissimo.
    for path in sorted(run.rglob("*.html")):
        html = path.read_text(encoding="utf-8")
        for match in re.findall(r'<script[^>]*src="((?:https?:)?//[^"]+)"', html):
            problems.append(f"{key}/run/{path.name}: carica lo script {match} — la condivisione "
                            f"si fa con href normali, i widget dei social portano un tracker")


def _check_manifest(problems, key, app):
    path = APP_DIR / key / "run" / "manifest.webmanifest"
    if not path.is_file():
        problems.append(f"{key}: manca il manifest — senza, l'app non si installa")
        return
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        problems.append(f"{key}/run/manifest.webmanifest: JSON non valido ({err.msg})")
        return

    base = f"/app/{key}/run/"
    expected = {"id": base, "start_url": base, "scope": base, "display": "standalone",
                "name": app["name"], "theme_color": DARK_BAR, "background_color": DARK_BAR}
    for field, value in expected.items():
        if manifest.get(field) != value:
            problems.append(f"{key}/manifest: {field} è {manifest.get(field)!r}, atteso {value!r}")

    short = manifest.get("short_name", "")
    if len(short) > 12:
        problems.append(f"{key}/manifest: short_name «{short}» supera i 12 caratteri, il sistema "
                        f"lo tronca sotto l'icona")

    icons = manifest.get("icons", [])
    sizes = {icon.get("sizes") for icon in icons}
    for needed in ("192x192", "512x512"):
        if needed not in sizes:
            problems.append(f"{key}/manifest: manca l'icona {needed}, richiesta per installare")
    if not any(icon.get("purpose") == "maskable" for icon in icons):
        problems.append(f"{key}/manifest: manca un'icona «maskable»: su Android verrebbe "
                        f"ritagliata senza controllo")
    for icon in icons:
        src = icon.get("src", "")
        if not (ROOT / src.lstrip("/")).is_file():
            problems.append(f"{key}/manifest: l'icona {src} non esiste su disco")


def _check_version(problems, key, app):
    """The version lives in apps.py. Everywhere else it is a copy, and copies drift."""
    version = app["version"]
    sw = (APP_DIR / key / "run" / "sw.js").read_text(encoding="utf-8")
    found = re.search(r"const VERSION = '([^']+)'", sw)
    if not found:
        problems.append(f"{key}/run/sw.js: non trovo «const VERSION»")
    elif found.group(1) != version:
        problems.append(f"{key}/run/sw.js: VERSION è {found.group(1)}, "
                        f"in _src/apps.py è {version}")

    # No `?v=` anywhere, and the check exists because the half-done version of this scheme shipped:
    # only styles.css and app.js carried a query, six ES modules carried none, and a renamed export
    # in chart.js was served stale from the browser cache while the page looked freshly versioned.
    # A partial cache-busting scheme is worse than none — it hides the problem it pretends to fix.
    # The version lives in the service worker's cache name, which is replaced whole on activate.
    for path in sorted((APP_DIR / key / "run").rglob("*")):
        if not path.is_file() or path.suffix not in (".html", ".js", ".css"):
            continue
        for match in re.findall(r'[\w.-]+\?v=[\w.-]+', path.read_text(encoding="utf-8")):
            problems.append(f"{key}/run/{path.name}: «{match}» — niente ?v= negli URL dell'app. "
                            f"La versione sta nel nome della cache, che viene sostituita intera")


def _check_precache(problems, key):
    """The service worker's list and the directory have to hold the same files.

    Generating the list would be easier and would break the one rule that matters here: the file
    served is the source. Checking it costs the same and keeps that true.
    """
    run = APP_DIR / key / "run"
    sw = (run / "sw.js").read_text(encoding="utf-8")
    block = re.search(r"const ASSETS = \[(.*?)\];", sw, re.S)
    if not block:
        problems.append(f"{key}/run/sw.js: non trovo l'elenco ASSETS")
        return

    # Comments come out first. The list is commented, and an apostrophe in ordinary prose — "the
    # page's import map" — opens a string as far as this regex is concerned, which turned two
    # paragraphs of English into two entries that did not exist.
    body = re.sub(r"//[^\n]*", "", block.group(1))
    entries = [entry.split("?")[0] for entry in re.findall(r"'([^']+)'", body)]

    # Two kinds of entry, and they are checked against two different directories: what the app is
    # made of, and what it borrows from the shared library one level up.
    listed = {entry.lstrip("./") for entry in entries if not entry.startswith("../")}
    listed.discard("")                                        # './' is the directory itself
    listed_lib = {entry for entry in entries if entry.startswith("../")}

    on_disk = set(_run_files(key)) - {"sw.js"}
    for missing in sorted(on_disk - listed):
        problems.append(f"{key}/run/sw.js: {missing} esiste ma non è in ASSETS — offline "
                        f"mancherebbe")
    for extra in sorted(listed - on_disk):
        problems.append(f"{key}/run/sw.js: ASSETS elenca {extra}, che non esiste")
    if "sw.js" in {e.lstrip("./") for e in entries}:
        problems.append(f"{key}/run/sw.js: si mette in cache da sé, e così non si aggiorna più")

    # The library is the one place where a path is written twice: once as `gg/…` through the import
    # map, and once in full here, because a service worker does not see the import map. Nothing but
    # this check keeps the two saying the same thing.
    #
    # Only what the app imports has to be listed — an app that uses three modules should not carry
    # six — but everything listed must exist, and everything imported must be listed. The second
    # half is the one that bites: a module missing from ASSETS works in every test and is missing
    # only with the network off, which is the one condition nobody tries.
    on_disk_lib = _lib_files()
    for extra in sorted(listed_lib - on_disk_lib):
        problems.append(f"{key}/run/sw.js: ASSETS elenca {extra}, che non esiste in app/_lib/")
    for used in sorted(_lib_specifiers(key)):
        wanted = used.replace(LIB_SPECIFIER, "../../_lib/", 1)
        if wanted not in listed_lib:
            problems.append(f"{key}: importa «{used}» ma sw.js non lo elenca — senza rete "
                            f"l'app non partirebbe")


def _check_parses(problems, key):
    """Ogni file JS dell'app **si legge davvero**, cioè è JavaScript valido.

    Sembra il controllo più inutile della lista, ed è quello che è servito per primo: una virgola
    dimenticata in fondo a una stringa del dizionario ha fatto passare tutti gli altri controlli —
    chiavi italiane e inglesi allineate, id che esistono, precache pari alla cartella — e ha
    lasciato l'app con **il pannello vuoto e il campo nero**. Nessuno di quei controlli legge il
    file come codice: lo leggono come testo, con delle espressioni regolari.

    Si copia in un `.mjs` temporaneo perché `node --check` decide se un file è un modulo
    dall'estensione, e questi sono `.js` dentro una pagina che li carica come moduli. Costa una
    decina di millisecondi a file e chiude una famiglia intera di difetti.

    Se `node` non c'è, il controllo si salta invece di fallire: gira anche sulle macchine che
    servono solo a pubblicare il sito.
    """
    if not shutil.which("node"):
        return
    for path in sorted((ROOT / "app" / key).rglob("*.js")):
        with tempfile.TemporaryDirectory() as tmp:
            copia = Path(tmp) / (path.stem + ".mjs")
            copia.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
            done = subprocess.run(["node", "--check", str(copia)],
                                  capture_output=True, text=True)
        if done.returncode != 0:
            prima = (done.stderr.strip().splitlines() or ["errore di sintassi"])
            dettaglio = next((r for r in prima if "SyntaxError" in r), prima[-1])
            problems.append(f"{key}: {path.relative_to(ROOT)} non è JavaScript valido — "
                            f"{dettaglio.strip()}")


def _check_lib_map(problems, key):
    """The import map exists, points at the library, and is the only way in."""
    path = APP_DIR / key / "run" / "index.html"
    if not path.is_file():
        return
    html = path.read_text(encoding="utf-8")
    used = _lib_specifiers(key)
    found = re.search(r'"imports"\s*:\s*\{[^}]*"gg/"\s*:\s*"([^"]+)"', html)
    if not found:
        if used:
            problems.append(f"{key}/run/index.html: importa «gg/…» ma non c'è la import map che "
                            f"dice dove sia")
        return
    if found.group(1) != "../../_lib/":
        problems.append(f"{key}/run/index.html: la import map manda «gg/» a {found.group(1)!r}, "
                        f"atteso '../../_lib/'")


def _check_licence(problems, key):
    for name in ("LICENSE", "NOTICE"):
        if not (APP_DIR / key / name).is_file():
            problems.append(f"{key}: manca app/{key}/{name}")
    for stray in ROOT.glob("LICENSE*"):
        problems.append(f"{stray.name} alla radice: si applicherebbe anche ai testi delle pagine, "
                        f"agli articoli e al marchio. La licenza sta in app/<key>/LICENSE")


def _check_lib_imports(problems, key):
    """Imports into the shared library go through the import map, never up the tree.

    Both forms work identically today. The difference arrives the day `_lib/` gets a version
    number: one line per app to change, or every import in every file.
    """
    for path in sorted((APP_DIR / key / "run").rglob("*.js")):
        source = path.read_text(encoding="utf-8")
        for match in re.findall(r'from\s+["\']([^"\']*_lib/[^"\']+)["\']', source):
            problems.append(f"{key}/run/{path.name}: import relativo «{match}» — usa la import map "
                            f"(«gg/…»), o versionare _lib/ diventerà una riscrittura")


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def main():
    problems = []
    _check_registry(problems)
    _check_lib(problems)

    by_key = {app["key"]: app for app in APPS}
    checked = [key for key in _apps_on_disk() if key in by_key]
    for key in checked:
        _check_no_network(problems, key)
        _check_i18n(problems, key)
        _check_wiring(problems, key)
        _check_share(problems, key)
        _check_manifest(problems, key, by_key[key])
        _check_version(problems, key, by_key[key])
        _check_precache(problems, key)
        _check_licence(problems, key)
        _check_lib_imports(problems, key)
        _check_lib_map(problems, key)
        _check_parses(problems, key)

    if problems:
        print("\n".join("  " + p for p in problems))
        raise SystemExit(f"\n{len(problems)} problemi.")
    print(f"OK — {len(checked)} app: {', '.join(checked) or 'nessuna'}.\n"
          "     nessuna richiesta di rete, chiavi IT/EN allineate, manifest e icone,\n"
          "     versione in un posto solo, elenco di precache pari alla cartella,\n"
          "     licenza nella cartella e non alla radice, import map verso _lib/,\n"
          "     ogni modulo condiviso davvero in cache, chiavi e id che esistono,\n"
          "     e ogni file JS si legge davvero come JavaScript.")


if __name__ == "__main__":
    main()
