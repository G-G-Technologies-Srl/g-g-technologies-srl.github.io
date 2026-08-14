# -*- coding: utf-8 -*-
"""Prove that the app checks actually fire.

Same reasoning as test_pricing_guard.py: a guard nobody has seen fail is a guard nobody should
trust, and check_apps.py passed on its first run — which is exactly when a check is most likely to
be checking nothing.

Each case breaks one rule on purpose, in one file, and expects check_apps.py to refuse. Every file
is put back afterwards, whatever happens.

Usage:  python3 _src/test_apps_guard.py
"""

import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent
ROOT = SRC.parent
RUN = ROOT / "app" / "csv-scope" / "run"
LIB = ROOT / "app" / "_lib"

sys.path.insert(0, str(SRC))
from apps import APPS                                         # noqa: E402

VERSION = next(a["version"] for a in APPS if a["key"] == "csv-scope")

# (name, file, text to find, replacement)
CASES = [
    ("una richiesta di rete nell'app",
     RUN / "app.js",
     "function _export() {",
     "function _export() {\n  fetch('/telemetria', { method: 'POST' });"),

    ("una libreria caricata da un CDN",
     RUN / "index.html",
     '<link rel="stylesheet" href="./styles.css',
     '<script src="https://cdn.example.com/chart.js"></script>\n'
     '<link rel="stylesheet" href="./styles.css'),

    ("una stringa che esiste solo in italiano",
     RUN / "i18n.js",
     '  tagline: "CSV file viewer",',
     '  taglinePerso: "CSV file viewer",'),

    # Written against whatever _src/apps.py says today, so bumping the app does not quietly turn
    # this case into a no-op — the runner reports a case whose text no longer exists.
    ("la versione del service worker fuori passo",
     RUN / "sw.js",
     f"const VERSION = '{VERSION}';",
     "const VERSION = '9.9.9';"),

    ("un file dell'app fuori dall'elenco di precache",
     RUN / "sw.js",
     "  './chart.js',\n",
     ""),

    ("una versione appiccicata a un URL, che nasconde i moduli non versionati",
     RUN / "index.html",
     '<link rel="stylesheet" href="./styles.css">',
     '<link rel="stylesheet" href="./styles.css?v=0.2.0">'),

    ("il manifest che punta a un'icona inesistente",
     RUN / "manifest.webmanifest",
     '"src": "/app/csv-scope/run/icon-512.png"',
     '"src": "/app/csv-scope/run/icon-1024.png"'),

    ("lo scope del service worker allargato al sito",
     RUN / "manifest.webmanifest",
     '"scope": "/app/csv-scope/run/"',
     '"scope": "/"'),

    ("un nome che non è quello dell'anagrafica",
     RUN / "manifest.webmanifest",
     '"name": "CSV Scope"',
     '"name": "CSVScope"'),

    ("un import relativo verso la libreria condivisa",
     RUN / "app.js",
     'import { parse, serialise } from "./csv.js";',
     'import { parse, serialise } from "../../_lib/csv.js";'),

    # The four below arrived with the library, and the first is the one that mattered: a shared
    # module left out of the precache list works in every test and is missing only with the
    # network off — the one condition nobody tries by accident.
    ("un modulo condiviso fuori dall'elenco di precache",
     RUN / "sw.js",
     "  '../../_lib/store.js',\n",
     ""),

    ("la import map che punta da un'altra parte",
     RUN / "index.html",
     '{ "imports": { "gg/": "../../_lib/" } }',
     '{ "imports": { "gg/": "/app/_lib/v2/" } }'),

    ("una richiesta di rete dentro la libreria condivisa",
     LIB / "store.js",
     "export async function persist() {",
     "export async function persist() {\n  fetch('/telemetria', { method: 'POST' });"),

    ("un modulo elencato che nella libreria non esiste",
     RUN / "sw.js",
     "  '../../_lib/io.js',",
     "  '../../_lib/io.js',\n  '../../_lib/compressione.js',"),

    # The last two are silent failures, which is why they are checked at all: one puts the name of
    # a key on the page as if it were a label, the other stops the app at the first listener with
    # a message that names no file the reader would recognise.
    ("una chiave di traduzione che non esiste",
     RUN / "index.html",
     '<span class="meta" id="tagline">',
     '<span class="meta" id="tagline" data-t="taglineInventata">'),

    # La condivisione appena aggiunta al gioco: il link deve andare alla scheda, non all'app.
    ("un link di condivisione che punta all'app invece che alla scheda",
     ROOT / "app" / "astrodroid" / "run" / "app.js",
     'const SCHEDA = "https://ggtechnologies.sm/app/astrodroid/";',
     'const SCHEDA = "https://ggtechnologies.sm/app/astrodroid/run/";'),

    ("un elemento cercato dal codice e assente dal markup",
     RUN / "index.html",
     'id="fileName"',
     'id="fileNameRinominato"'),
]


# -----------------------------------------------------------------------------------------------------------------
#  p r i v a t e
# -----------------------------------------------------------------------------------------------------------------

def _check():
    """Run check_apps.py and return (passed, output).

    The output is deliberately not stripped: check_apps.py indents every problem by two spaces, and
    stripping the whole string eats the indent of the first line — which is the one worth showing.
    """
    done = subprocess.run([sys.executable, "-B", str(SRC / "check_apps.py")],
                          capture_output=True, text=True, cwd=ROOT)
    return done.returncode == 0, done.stdout + done.stderr


def _reason(output):
    """The first problem reported, or a complaint if the checker crashed instead of reporting.

    A non-zero exit means "the check refused", and an exception also exits non-zero — so without
    this distinction a checker that crashes on a broken file would read as a checker that works.
    """
    if "Traceback" in output:
        return None
    for line in output.splitlines():
        text = line.strip()
        if text and not text[0].isdigit():
            return text
    return None


def _run_case(name, path, old, new):
    original = path.read_text(encoding="utf-8")
    if old not in original:
        print(f"  ?  {name}: il testo da rompere non esiste più in {path.name}, aggiorna il test")
        return False
    path.write_text(original.replace(old, new, 1), encoding="utf-8")
    try:
        passed, output = _check()
    finally:
        path.write_text(original, encoding="utf-8")
    if passed:
        print(f"  !  {name}: il controllo è passato lo stesso, NON funziona")
        return False
    reason = _reason(output)
    if reason is None:
        print(f"  !  {name}: check_apps.py è andato in errore invece di segnalare il problema")
        return False
    print(f"  ok {name}\n       {reason}")
    return True


def _extra_root_licence():
    """The one rule that cannot be broken by editing a file: a LICENSE at the top level."""
    stray = ROOT / "LICENSE"
    if stray.exists():
        print("  ?  licenza alla radice: ce n'è già una, il test non può crearla")
        return False
    stray.write_text("Apache License 2.0 (finta, scritta dal test)\n", encoding="utf-8")
    try:
        passed, output = _check()
    finally:
        try:
            stray.unlink()
        except OSError as err:
            # Leaving a LICENSE at the top level is the very thing this case exists to forbid, so
            # failing to remove it has to be shouted, not swallowed.
            raise SystemExit(f"!  non riesco a togliere {stray} ({err.strerror}).\n"
                             f"   TOGLILA A MANO: una licenza alla radice si applica anche ai "
                             f"testi delle pagine, agli articoli e al marchio.") from err
    if passed:
        print("  !  licenza alla radice: il controllo è passato lo stesso, NON funziona")
        return False
    reason = _reason(output)
    if reason is None:
        print("  !  licenza alla radice: check_apps.py è andato in errore invece di segnalare")
        return False
    print(f"  ok licenza alla radice\n       {reason}")
    return True


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def main():
    passed, output = _check()
    if not passed:
        raise SystemExit(f"I controlli falliscono già prima del test:\n{output}")
    print("controlli puliti: ok\n")

    results = [_run_case(*case) for case in CASES]
    results.append(_extra_root_licence())

    print()
    passed_again, output = _check()
    if not passed_again:
        raise SystemExit(f"!  dopo il ripristino i controlli non passano più, l'app è "
                         f"rimasta rotta:\n{output}")
    print("ripristino: i file sono tornati come prima\n")

    broken = results.count(False)
    if broken:
        raise SystemExit(f"{broken} controlli su {len(results)} non hanno fermato niente.")
    print(f"{len(results)}/{len(results)} controlli sulle app funzionano.")


if __name__ == "__main__":
    main()
