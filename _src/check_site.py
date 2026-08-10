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
from content import BANNED  # noqa: E402

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
            target = href.strip("/")
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
    _check_banned(problems)
    _check_redirects(problems)
    urls = _check_sitemap(problems, canonical)

    if problems:
        print("\n".join("  " + p for p in problems))
        raise SystemExit(f"\n{len(problems)} problemi.")
    print(f"OK — {len(canonical)} pagine, {urls} URL nella sitemap.\n"
          "     HTML, id, h1, & codificati, lingue separate, canonical, hreflang, JSON-LD,\n"
          "     link, immagini con alt, frasi vietate, card social, stub, sitemap.")


if __name__ == "__main__":
    main()
