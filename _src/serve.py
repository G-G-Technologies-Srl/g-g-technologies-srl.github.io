# -*- coding: utf-8 -*-
"""Il server di sviluppo, che non fa cache.

`python3 -m http.server` sembra la scelta ovvia e ha un difetto che costa mezz'ora ogni volta:
manda `Last-Modified` e **non manda `Cache-Control`**, quindi il browser applica la sua euristica e
tiene i file per conto suo. Sulle pagine non si nota, perché l'HTML lo si ricarica con `?v=`
diverso ogni volta. Sui **moduli** sì: il loro URL non cambia mai — `./render.js` resta
`./render.js` — quindi la query sull'HTML non li tocca e continui a ricevere quelli di prima.

Il sintomo è «ho modificato il file e non vedo niente», e la prima reazione è sempre sbagliata: si
ricontrolla il codice, che è giusto.

    python3 _src/serve.py            # porta 8000
    python3 _src/serve.py 8080

---

**Questo risolve metà del problema.** L'altra metà è il service worker, che è una cache a sé e non
obbedisce né a queste intestazioni né a `fetch(..., {cache: 'no-store'})` — quell'opzione governa la
cache HTTP del browser, non il worker, e sbagliarlo porta a misurare la cache credendo di
interrogare il server.

Il worker non si può disattivare in sviluppo: `app/CLAUDE.md` lo vieta, e ha ragione — registrarlo
solo in produzione toglierebbe l'unico modo di provarlo. Quindi resta un gesto da fare a mano, e i
modi sono due:

- Negli strumenti per sviluppatori: **Application → Service Workers → «Update on reload»**. Si
  spunta una volta per sessione ed è la strada comoda.
- Oppure, dalla console:

      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
      location.reload();

Come si riconosce quale delle due cache ti sta ingannando: se `caches.keys()` elenca più di una
versione — `spronia-v0.9.0`, `spronia-v0.9.1`, `spronia-v0.10.0` — è il worker.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCache(SimpleHTTPRequestHandler):
    """Come SimpleHTTPRequestHandler, ma dice al browser di non tenere niente."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Una riga per richiesta va bene; le 304 non arrivano più, quindi il rumore è quello vero.
        sys.stderr.write(f"  {self.address_string()}  {fmt % args}\n")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCache, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"  {ROOT}")
        print(f"  http://localhost:{port}/            — il sito")
        print(f"  http://localhost:{port}/app/spronia/run/   — il gioco")
        print("  niente cache HTTP. Il service worker è un'altra cosa: vedi in cima a questo file.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n  fermato.")


if __name__ == "__main__":
    main()
