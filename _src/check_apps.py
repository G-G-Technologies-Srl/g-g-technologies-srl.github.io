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
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import article_art                                            # noqa: E402
from apps import APPS                                         # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"

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

    listed = {entry.split("?")[0].lstrip("./")
              for entry in re.findall(r"'([^']+)'", block.group(1))}
    listed.discard("")                                        # './' is the directory itself

    on_disk = set(_run_files(key)) - {"sw.js"}
    for missing in sorted(on_disk - listed):
        problems.append(f"{key}/run/sw.js: {missing} esiste ma non è in ASSETS — offline "
                        f"mancherebbe")
    for extra in sorted(listed - on_disk):
        problems.append(f"{key}/run/sw.js: ASSETS elenca {extra}, che non esiste")
    if "sw.js" in {e.lstrip("./") for e in re.findall(r"'([^']+)'", block.group(1))}:
        problems.append(f"{key}/run/sw.js: si mette in cache da sé, e così non si aggiorna più")


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

    by_key = {app["key"]: app for app in APPS}
    checked = [key for key in _apps_on_disk() if key in by_key]
    for key in checked:
        _check_no_network(problems, key)
        _check_i18n(problems, key)
        _check_manifest(problems, key, by_key[key])
        _check_version(problems, key, by_key[key])
        _check_precache(problems, key)
        _check_licence(problems, key)
        _check_lib_imports(problems, key)

    if problems:
        print("\n".join("  " + p for p in problems))
        raise SystemExit(f"\n{len(problems)} problemi.")
    print(f"OK — {len(checked)} app: {', '.join(checked) or 'nessuna'}.\n"
          "     nessuna richiesta di rete, chiavi IT/EN allineate, manifest e icone,\n"
          "     versione in un posto solo, elenco di precache pari alla cartella,\n"
          "     licenza nella cartella e non alla radice, import verso _lib/.")


if __name__ == "__main__":
    main()
