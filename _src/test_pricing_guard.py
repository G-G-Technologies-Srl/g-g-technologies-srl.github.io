# -*- coding: utf-8 -*-
"""Prove that the pricing guard actually fires.

A guard nobody has seen fail is a guard nobody should trust. This breaks the prices on purpose,
one way at a time, and checks the build refuses to run.

Usage:  PODZ_DOCS=/path/to/digisense-releases/docs python3 _src/test_pricing_guard.py
"""

import shutil
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).parent
CONTENT = SRC / "content.py"
BACKUP = SRC / "content.py.orig"

CASES = [
    ("prezzo scritto a mano nel testo",
     'IVA esclusa. "',
     'IVA esclusa, oppure 1.900 € in promozione. "'),
    ("licenza diversa dal listino pubblicato",
     '"licence": 2400,',
     '"licence": 2600,'),
    ("rinnovo diverso dal listino pubblicato",
     '"renewal": 900,',
     '"renewal": 750,'),
]


# -----------------------------------------------------------------------------------------------------------------
#  p r i v a t e
# -----------------------------------------------------------------------------------------------------------------

def _build():
    """Run the build and return (succeeded, output).

    -B matters here: two versions of content.py can have the same size and be written in the same
    second, and Python would then reuse the cached bytecode of the previous case.
    """
    done = subprocess.run([sys.executable, "-B", str(SRC / "build.py")], capture_output=True, text=True)
    return done.returncode == 0, (done.stdout + done.stderr).strip()


def _run_case(name, old, new):
    original = CONTENT.read_text(encoding="utf-8")
    if old not in original:
        print(f"  ?  {name}: il testo da rompere non esiste più, aggiorna il test")
        return False
    CONTENT.write_text(original.replace(old, new, 1), encoding="utf-8")
    try:
        ok, output = _build()
    finally:
        CONTENT.write_text(original, encoding="utf-8")
    if ok:
        # Without PODZ_DOCS the build skips the comparison with the published listing, so two of
        # the three cases cannot possibly stop it. Saying "the check does not work" there sends
        # somebody hunting a bug that is not there: the check did not run at all.
        if "salto il confronto del listino" in output:
            print(f"  –  {name}: non verificabile senza il listino pubblicato\n"
                  f"       rilancia con PODZ_DOCS=/percorso/di/digisense-releases/docs")
            return None
        print(f"  !  {name}: il build è passato, il controllo NON funziona")
        return False
    reason = next((line.strip() for line in output.splitlines() if line.startswith("  ")), output[:120])
    print(f"  ok {name}\n       {reason}")
    return True


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def main():
    shutil.copy(CONTENT, BACKUP)
    try:
        ok, output = _build()
        if not ok:
            raise SystemExit(f"Il build fallisce già prima del test:\n{output}")
        print("build pulito: ok\n")
        results = [_run_case(*case) for case in CASES]
    finally:
        shutil.copy(BACKUP, CONTENT)
        try:
            BACKUP.unlink()
        except OSError:
            print(f"nota: non sono riuscito a cancellare {BACKUP.name}, toglilo a mano")
        # Putting content.py back is not enough: every case above left the site tree built from
        # a broken price. Without this rebuild the pages keep it, and running the test the day
        # before publishing would ship a renewal price the published listing denies — which is
        # the exact failure this test exists to catch. One rebuild closes the hole.
        rebuilt, rebuild_output = _build()
        print("ripristino: pagine ricostruite dai prezzi veri" if rebuilt else
              f"!  il build non riparte dopo il ripristino, il sito è rimasto rotto:\n{rebuild_output}")
    print()
    # None is a case that could not run, not one that failed: it is reported apart, and it does
    # not turn the run green either.
    skipped = results.count(None)
    if results.count(False):
        raise SystemExit(f"{results.count(False)} controlli non hanno fermato il build.")
    if skipped:
        raise SystemExit(f"{len(results) - skipped}/{len(results)} controlli verificati, "
                         f"{skipped} non verificabili senza il listino pubblicato.")
    print(f"{len(results)}/{len(results)} controlli sui prezzi funzionano.")


if __name__ == "__main__":
    main()
