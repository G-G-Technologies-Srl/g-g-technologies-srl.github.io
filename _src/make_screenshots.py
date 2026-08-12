# -*- coding: utf-8 -*-
"""The screenshots on the app schede, taken by a script and never by hand.

A capture made by hand ages in silence: rename a button and the PNG on the scheda keeps showing the
old one, and nobody notices until somebody reads the page and the app side by side. Taking it from
the running app means a rebuild is all it takes to make it true again.

One per language, because the apps are bilingual and the scheda is too.

**No dependency.** It drives the Chrome that is already on the machine, in headless mode, through
its own `--screenshot` flag. An earlier version used Playwright and worked, and it meant installing
a package plus a second browser of 130 MB to photograph an app of 60 KB — on a project whose whole
point is not having a toolchain.

What that costs: headless Chrome cannot click. So the app opens its example straight from the URL,
with `?demo=1`, and paints before the load event. See `_demo()` in run/app.js.

Usage:  python3 _src/make_screenshots.py [--app csv-scope] [--chrome /path/to/chrome]
"""

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from apps import APPS                                         # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# The frame the scheda shows it in. Wide enough for the desktop layout, and an 8:5 ratio so the
# image does not tower over the column of text it sits in.
WIDTH, HEIGHT = 1600, 1000

# How long to wait for the picture, and how small a PNG has to be before it counts as no picture at
# all. A blank page still produces a valid file of a few kilobytes, which is the one failure that
# would otherwise pass unnoticed and end up on the scheda.
LIMIT = 40
MIN_BYTES = 5000

# Where a browser that can do this lives, in the order worth trying. Any Chromium will do: the flag
# is the same one in all of them.
CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]


# -----------------------------------------------------------------------------------------------------------------
#  p r i v a t e
# -----------------------------------------------------------------------------------------------------------------

def _find_chrome(given):
    for candidate in ([given] if given else []) + [os.environ.get("CHROME")] + CANDIDATES:
        if candidate and Path(candidate).is_file():
            return candidate
    raise SystemExit(
        "non trovo un browser con cui scattare.\n"
        "  Passa il percorso con --chrome, o mettilo in CHROME. Va bene qualunque Chromium:\n"
        "  " + "\n  ".join(CANDIDATES[:4])
    )


def _serve(port):
    """A local server: a service worker and ES modules do not run from file://."""
    process = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    return process


def _shoot(chrome, url, target, profile):
    """One capture. Returns the browser's last words when no usable file lands on disk.

    **The picture is what we wait for, not the browser.** Headless Chrome takes the screenshot and
    then, on this page, does not quit: a registered service worker keeps it alive, and it sat there
    until the timeout every single time. Waiting for the process meant the first language was
    written and the second was never even attempted, because the timeout ended the run — which read
    as "the English one fails" when nothing about English was involved.

    So the file is polled instead, and the browser is closed the moment the file is finished. Two
    consecutive polls of the same size mean the write is complete: killing on first sight would
    catch a half-written PNG, and the difference is invisible until somebody opens it.

    A fresh profile every time. A service worker left by the previous capture would otherwise serve
    an old copy of the app, and the photograph would show a version nobody is publishing.
    """
    target.unlink(missing_ok=True)
    subprocess.run(["rm", "-rf", str(profile)], check=False)
    profile.mkdir(parents=True, exist_ok=True)

    # The browser's own output goes to a file rather than a pipe: a pipe nobody reads fills up and
    # blocks the process being waited on, which is the failure this function exists to avoid.
    log = profile / "browser.log"
    with log.open("w", encoding="utf-8") as sink:
        browser = subprocess.Popen([
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-color-profile=srgb",
            f"--user-data-dir={profile}",
            f"--window-size={WIDTH},{HEIGHT}",
            "--virtual-time-budget=8000",
            f"--screenshot={target}",
            url,
        ], stdout=sink, stderr=subprocess.STDOUT)

        try:
            previous, deadline = -1, time.time() + LIMIT
            while time.time() < deadline:
                size = target.stat().st_size if target.is_file() else 0
                if size > MIN_BYTES and size == previous:
                    return None
                previous = size
                if browser.poll() is not None:
                    break                   # it left on its own: the check below has the verdict
                time.sleep(0.25)
            if target.is_file() and target.stat().st_size > MIN_BYTES:
                return None
        finally:
            if browser.poll() is None:
                browser.terminate()
                try:
                    browser.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    browser.kill()

    size = target.stat().st_size if target.is_file() else None
    note = [f"dopo {LIMIT} secondi: "
            + ("nessun file scritto" if size is None else f"file di soli {size} byte")
            + f", browser uscito con codice {browser.returncode}"]
    return note + (log.read_text(encoding="utf-8", errors="replace").strip().splitlines()[-5:]
                   or ["e non ha detto niente"])


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", help="una sola app, invece di tutte")
    parser.add_argument("--chrome", help="percorso del browser, se non è dove me lo aspetto")
    parser.add_argument("--port", type=int, default=8123)
    args = parser.parse_args()

    chrome = _find_chrome(args.chrome)
    chosen = [a for a in APPS if not args.app or a["key"] == args.app]
    if not chosen:
        raise SystemExit(f"nessuna app con chiave «{args.app}» in _src/apps.py")

    ASSETS.mkdir(exist_ok=True)
    profiles = ROOT / "_src" / ".chrome-profile"
    server = _serve(args.port)
    made, failed = [], []
    try:
        for app in chosen:
            for lang in ("it", "en"):
                name = f"shot-{app['key']}-{lang}.png"
                url = (f"http://127.0.0.1:{args.port}/app/{app['key']}/run/"
                       f"?lang={lang}&demo=1")
                problem = _shoot(chrome, url, ASSETS / name, profiles / f"{app['key']}-{lang}")
                (failed if problem else made).append((name, url, problem))
    finally:
        server.terminate()
        subprocess.run(["rm", "-rf", str(profiles)], check=False)

    for name, _, _ in made:
        print(f"  assets/{name:<32} {(ASSETS / name).stat().st_size / 1024:5.0f} KB")
    if failed:
        print()
        for name, url, problem in failed:
            print(f"  !  {name}")
            for line in problem:
                print(f"       {line}")
        # The server dies with this process, so the failing URL alone would not be reproducible.
        # This prints the whole thing: serve the folder, then run the browser by hand and watch.
        name, url, _ = failed[0]
        print("\n  Per vederlo succedere, in due terminali:\n"
              f"    python3 -m http.server {args.port}\n"
              f"    \"{chrome}\" --headless=new --disable-gpu "
              f"--window-size={WIDTH},{HEIGHT} \\\n"
              f"      --screenshot=/tmp/{name} \"{url}\"")
        raise SystemExit(f"\n{len(failed)} screenshot non riusciti. Browser usato: {chrome}")
    print(f"\n{len(made)} screenshot con {Path(chrome).name}. "
          f"Rilancia il build: la scheda li cerca per nome.")


if __name__ == "__main__":
    main()
