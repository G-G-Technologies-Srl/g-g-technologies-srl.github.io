# -*- coding: utf-8 -*-
"""Check the generated site: structure, indexing signals, links, images, language parity.

Run it after every build. It prints one line per check and exits non-zero on the first real
problem, so it can go in a pre-commit hook or a CI step.

Usage:  python3 _src/check_site.py
"""

import glob
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from content import BANNED, CHROME  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://ggtechnologies.sm"
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
        "source", "track", "wbr"}


# -----------------------------------------------------------------------------------------------------------------
#  p r i v a t e
# -----------------------------------------------------------------------------------------------------------------

class _Balance(HTMLParser):
    """Reports tags that never close, or close in the wrong order."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors = [], []

    def handle_startendtag(self, tag, attrs):
        pass                                    # <tag/> is complete

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"</{tag}> di troppo a {self.getpos()}")
            return
        top, pos = self.stack.pop()
        if top != tag:
            self.errors.append(f"</{tag}> a {self.getpos()} chiude <{top}> aperto a {pos}")


def _pages():
    """Every generated page, excluding the redirect stubs."""
    for f in sorted(glob.glob("**/index.html", recursive=True, root_dir=ROOT)):
        text = (ROOT / f).read_text(encoding="utf-8")
        if 'http-equiv="refresh"' not in text:
            yield f, text


def _expected_url(path):
    return SITE + "/" if path == "index.html" else SITE + "/" + str(Path(path).parent) + "/"


# -----------------------------------------------------------------------------------------------------------------
#  c h e c k s
# -----------------------------------------------------------------------------------------------------------------

def _check_markup(problems):
    for f, t in _pages():
        parser = _Balance()
        parser.feed(t)
        if parser.errors or parser.stack:
            left = [tag for tag, _ in parser.stack]
            problems.append(f"{f}: HTML sbilanciato {parser.errors[:2] or left[:2]}")
        ids = re.findall(r'\sid="([^"]+)"', t)
        duplicated = {i for i in ids if ids.count(i) > 1}
        if duplicated:
            problems.append(f"{f}: id duplicati {sorted(duplicated)}")
        if len(re.findall(r"<h1", t)) != 1:
            problems.append(f'{f}: {len(re.findall(r"<h1", t))} h1, ne serve esattamente uno')
        body = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
        if re.search(r"&(?!amp;|lt;|gt;|quot;|#|nbsp;|rarr;|reg;)", body):
            problems.append(f"{f}: & non codificato")
        for heading in re.findall(r"<h2>(.*?)</h2>", t, re.S):
            if "<a " in heading:
                problems.append(f"{f}: un h2 contiene un link")


def _check_language(problems):
    """No page may carry nodes of the other language: that was the old homepage's trick."""
    for f, t in _pages():
        lang = re.search(r'<html lang="([a-z-]+)"', t).group(1)
        expected = "en" if f == "en/index.html" or f.startswith("en/") else "it"
        if lang != expected:
            problems.append(f"{f}: lang={lang}, atteso {expected}")
        other = "it" if expected == "en" else "en"
        leftover = re.findall(rf'class="[^"]*\b{other}\b[^"]*"', t)
        if leftover:
            problems.append(f"{f}: {len(leftover)} nodi in lingua «{other}» non rimossi")


def _check_indexing(problems):
    canonical, alternates = {}, {}
    for f, t in _pages():
        found = re.search(r'<link rel="canonical" href="([^"]+)"', t)
        if not found:
            problems.append(f"{f}: canonical mancante")
            continue
        canonical[f] = found.group(1)
        if canonical[f] != _expected_url(f):
            problems.append(f"{f}: canonical {canonical[f]} invece di {_expected_url(f)}")
        alternates[f] = dict(re.findall(
            r'<link rel="alternate" hreflang="([a-z-]+)" href="([^"]+)"', t))
        if "x-default" not in alternates[f]:
            problems.append(f"{f}: manca x-default")
        for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', t, re.S):
            try:
                json.loads(block)
            except json.JSONDecodeError as error:
                problems.append(f"{f}: JSON-LD non valido — {error}")

    by_url = {url: f for f, url in canonical.items()}
    for f, alts in alternates.items():
        for lang, href in alts.items():
            if lang == "x-default":
                continue
            other = by_url.get(href)
            if other is None:
                problems.append(f"{f}: hreflang «{lang}» punta a {href}, che non esiste")
            elif canonical[f] not in alternates[other].values():
                problems.append(f"{f}: hreflang non reciproco con {other}")
    return canonical


def _check_links_and_images(problems):
    for f, t in _pages():
        for href in re.findall(r'href="(/[^"#]*)"', t):
            # A querystring is not part of the path: /insights/?tag=ia is the index, filtered by
            # JavaScript, not a page of its own that has to exist on disk.
            target = href.split("?", 1)[0].strip("/")
            if href.startswith("/assets/"):
                if not (ROOT / target).exists():
                    problems.append(f"{f}: asset mancante {href}")
            elif target and not (ROOT / target / "index.html").exists():
                problems.append(f"{f}: link rotto {href}")
        for attr in re.findall(r'(?:src|srcset)="([^"]+)"', t):
            for candidate in re.split(r",\s*", attr):
                url = candidate.split()[0]
                if url.startswith("/assets/") and not (ROOT / url.lstrip("/")).exists():
                    problems.append(f"{f}: immagine mancante {url}")
        for card in re.findall(r'og:image" content="[^"]*/assets/([^"]+)"', t):
            if not (ROOT / "assets" / card).exists():
                problems.append(f"{f}: og:image mancante {card}")
        if re.search(r'<img (?![^>]*\balt=)', t):
            problems.append(f"{f}: un img senza alt")


def _check_redirects(problems):
    for f in sorted(glob.glob("**/index.html", recursive=True, root_dir=ROOT)):
        t = (ROOT / f).read_text(encoding="utf-8")
        if 'http-equiv="refresh"' not in t:
            continue
        target = re.search(r'<link rel="canonical" href="([^"]+)"', t)
        refresh = re.search(r'content="0; url=([^"]+)"', t)
        if not target or not refresh:
            problems.append(f"{f}: stub senza canonical o senza refresh")
        elif target.group(1) != refresh.group(1):
            problems.append(f"{f}: canonical e refresh puntano a URL diversi")
        elif "noindex" in t:
            problems.append(f"{f}: noindex nasconde il canonical, togli il noindex")


def _check_banned(problems):
    """The phrasings the copy reviews rejected, checked on the finished pages.

    build.py already checks them in content.py, but the homepage comes from _src/home.html and was
    invisible to that check — which is exactly how «biovital», «neural networks» and «vertical
    specialists» survived on the most read page of the site. Checking the output catches both.
    """
    for f, t in _pages():
        lang = "en" if f == "en/index.html" or f.startswith("en/") else "it"
        body = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
        body = re.sub(r"<[^>]+>", " ", body).lower()
        for phrase, reason in BANNED[lang]:
            if phrase.lower() in body:
                problems.append(f"{f}: «{phrase}» — {reason}")


def _check_lang_switch_styled(problems):
    """Lo switch di lingua deve risultare stilizzato su ogni pagina, home compresa.

    La home porta il suo <style> inline, le pagine interne caricano assets/site.css: una regola
    scritta per un selettore che non esiste — è successo con `.lang-switch button` dopo che i
    <button> erano diventati uno <span> più un <a> — lascia il controllo nudo sulla sola home.
    Non basta cercare il selettore: compare anche dentro regole combinate. Qui si controlla che
    esista davvero una dichiarazione di padding applicabile ai due elementi dello switch.
    """
    shared = (ROOT / "assets" / "site.css")
    shared_css = shared.read_text(encoding="utf-8") if shared.exists() else ""

    for f, t in _pages():
        found = re.search(r'<div class="lang-switch"[^>]*>(.*?)</div>', t, re.S)
        if not found:
            problems.append(f"{f}: switch di lingua assente")
            continue
        inline = "".join(re.findall(r"<style[^>]*>(.*?)</style>", t, re.S))
        css = (inline or shared_css)

        for element, needle in (("<span class=\"current\">", ".lang-switch .current"),
                                ("<a>", ".lang-switch a")):
            padded = False
            for selector, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
                parts = [s.strip() for s in selector.split(",")]
                if needle in parts and "padding" in body:
                    padded = True
                    break
            if not padded:
                problems.append(f"{f}: nessuna regola con padding per «{needle}» — lo switch di "
                                f"lingua è senza stile su questa pagina")


def _check_footers_agree(problems):
    """I due footer devono elencare le stesse pagine interne.

    Questo sito ha **due** footer: quello delle pagine interne viene da `footer_cols` in
    content.py, quello delle due home è scritto a mano in _src/home.html. Aggiungere una voce a
    uno solo dei due è invisibile a ogni altro controllo — sitemap, canonical e hreflang restano
    perfetti — e la pagina nuova sparisce dalla home. È già successo con /insights.

    Confronta solo i link che risolvono a una pagina generata: ancore e link esterni fra i due
    footer differiscono per scelta, e non sono il problema.
    """
    for lang, home in (("it", "index.html"), ("en", "en/index.html")):
        path = ROOT / home
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        if "<footer" not in text:
            problems.append(f"{home}: footer assente")
            continue
        footer = text[text.index("<footer"):]

        def _internal(hrefs):
            out = set()
            for href in hrefs:
                target = href.strip("/")
                candidate = (target + "/index.html") if target else "index.html"
                if (ROOT / candidate).exists():
                    out.add(href)
            return out

        in_home = _internal(re.findall(r'href="(/[^"#]*)"', footer))
        in_pages = _internal(href for _, items in CHROME[lang]["footer_cols"]
                             for _, href in items if href.startswith("/") and "#" not in href)

        for href in sorted(in_pages - in_home):
            problems.append(f"{home}: {href} è nel footer delle pagine interne ma non in quello "
                            f"della home — aggiungilo a _src/home.html")
        for href in sorted(in_home - in_pages):
            problems.append(f"{home}: {href} è nel footer della home ma non in quello delle pagine "
                            f"interne — aggiungilo a footer_cols in content.py")


def _check_reachable(problems):
    """Ogni pagina deve essere raggiungibile dalla home della sua lingua, seguendo i link.

    Rete di sicurezza contro la pagina orfana: generata, in sitemap, e senza un solo link che ci
    porti. Nota che è un controllo debole — trova un percorso qualsiasi, anche lungo tre salti —
    quindi non sostituisce `_check_footers_agree`, che è quello che coglie i due footer divergenti.
    """
    graph = {}
    for f, t in _pages():
        body = re.sub(r"<script.*?</script>", "", t, flags=re.S)
        targets = set()
        for href in re.findall(r'href="(/[^"#]*)"', body):
            path = href.strip("/")
            candidate = (path + "/index.html") if path else "index.html"
            if (ROOT / candidate).exists():
                targets.add(candidate)
        graph[f] = targets

    for start in ("index.html", "en/index.html"):
        if start not in graph:
            continue
        seen, queue = {start}, [start]
        while queue:
            for target in graph.get(queue.pop(), ()):
                if target not in seen:
                    seen.add(target)
                    queue.append(target)
        lang = "en" if start.startswith("en/") else "it"
        for f in graph:
            same_language = f.startswith("en/") if lang == "en" else not f.startswith("en/")
            if same_language and f not in seen:
                problems.append(f"{f}: nessun percorso di link dalla home {lang} — la pagina esiste "
                                f"ma non ci si arriva navigando")


def _check_sitemap(problems, canonical):
    """Every indexable page must be listed, and every noindex page must not be.

    Drafts under /insights/ carry noindex on purpose: listing them would ask Google to index a
    page that tells it not to. The two signals have to agree, so this checks both directions.
    """
    sitemap = ROOT / "sitemap.xml"
    listed = set(re.findall(r"<loc>([^<]+)</loc>", sitemap.read_text(encoding="utf-8")))

    noindex = set()
    for f, t in _pages():
        if re.search(r'<meta name="robots" content="[^"]*noindex', t):
            noindex.add(canonical.get(f))

    expected = set(canonical.values()) - noindex
    for url in expected - listed:
        problems.append(f"sitemap.xml: manca {url}")
    for url in listed - expected:
        if url in noindex:
            problems.append(f"sitemap.xml: {url} è noindex ma è elencato — i due segnali si "
                            f"contraddicono")
        else:
            problems.append(f"sitemap.xml: {url} è elencato ma non è una pagina canonica")
    return len(listed)


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def main():
    problems = []
    _check_markup(problems)
    _check_language(problems)
    canonical = _check_indexing(problems)
    _check_links_and_images(problems)
    _check_lang_switch_styled(problems)
    _check_footers_agree(problems)
    _check_reachable(problems)
    _check_banned(problems)
    _check_redirects(problems)
    urls = _check_sitemap(problems, canonical)

    if problems:
        print("\n".join("  " + p for p in problems))
        raise SystemExit(f"\n{len(problems)} problemi.")
    print(f"OK — {len(canonical)} pagine, {urls} URL nella sitemap.\n"
          "     HTML, id, h1, & codificati, lingue separate, canonical, hreflang, JSON-LD,\n"
          "     link, immagini con alt, switch di lingua stilizzato, footer allineati,\n"
          "     raggiungibilità dalla home, frasi vietate, card social, stub, sitemap.")


if __name__ == "__main__":
    main()
