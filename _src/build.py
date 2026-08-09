# -*- coding: utf-8 -*-
"""Build the static inner pages of ggtechnologies.sm from content.py.

One URL per language (no CSS language toggle on inner pages), reciprocal hreflang, self canonical,
JSON-LD (Organization reference, BreadcrumbList, Service or SoftwareApplication, FAQPage).

The shared stylesheet is extracted from index.html at build time, so the homepage stays the single
source of truth for the design system: change a token there and the inner pages follow.

Usage:  python3 _src/build.py
"""

import html
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from content import BANNED, CHROME, PAGES, PODZ_SITE, PRICING, SITE  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(__file__).resolve().parent
# The homepage is now generated too: _src/home.html is the bilingual source of both languages
# and of the shared stylesheet.
INDEX = SRC / "home.html"
ASSETS = ROOT / "assets"

LANGS = ("it", "en")
LOCALE = {"it": "it_IT", "en": "en_GB"}

# Brand mark. The full version carries the gradient and mask definitions and appears once per page,
# in the header; the footer reuses those definitions by id, exactly as the homepage does. Emitting
# the full version twice would duplicate the "ggMark" and "ggWire" ids in the same document.
BRAND_SVG = (
    '<svg viewBox="0 0 100 100"><defs><linearGradient id="ggMark" x1="0" y1="0" x2="1" y2="1">'
    '<stop offset="0" stop-color="#5eecab"/><stop offset="1" stop-color="#10b981"/></linearGradient>'
    '<mask id="ggWire"><path d="M50 14 A36 36 0 1 0 86 50 H66" fill="none" stroke="#fff" stroke-width="13"/>'
    '<path d="M50 14 A36 36 0 1 0 86 50 H66" fill="none" stroke="#000" stroke-width="10"/></mask></defs>'
    '<rect class="wire" width="100" height="100" mask="url(#ggWire)"/>'
    '<path class="lit" d="M66 50 H86 A36 36 0 1 1 50 14" fill="none" stroke="url(#ggMark)" stroke-width="13" '
    'stroke-linecap="round"/><circle class="click" cx="50" cy="50" r="9" fill="none" stroke="#34d399" '
    'stroke-width="2"/><circle class="led" cx="50" cy="50" r="9"/></svg>'
)

BRAND_SVG_REF = (
    '<svg viewBox="0 0 100 100"><rect class="wire" width="100" height="100" mask="url(#ggWire)"/>'
    '<path class="lit" d="M66 50 H86 A36 36 0 1 1 50 14" fill="none" stroke="url(#ggMark)" stroke-width="13" '
    'stroke-linecap="round"/><circle class="click" cx="50" cy="50" r="9" fill="none" stroke="#34d399" '
    'stroke-width="2"/><circle class="led" cx="50" cy="50" r="9"/></svg>'
)

ICONS = {
    "chip": '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M4 10h3M4 14h3M17 10h3M17 14h3'
            'M10 4v3M14 4v3M10 17v3M14 17v3"/>',
    "pulse": '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3.4.9-4.5 2.3A5.7 5.7 0 0 0 '
             '7.5 3 5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/><path d="M3.5 12h5l2-3 2 5 2-3h5"/>',
    "data": '<ellipse cx="12" cy="5.5" rx="7.5" ry="3"/><path d="M4.5 5.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>'
            '<path d="M4.5 11.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>',
    "robot": '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4.5M9.5 13h.01M14.5 13h.01'
             'M9 16.5h6M2.5 12v3M21.5 12v3"/><circle cx="12" cy="3.5" r="1.2"/>',
    "gauge": '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4.5-4.5"/><circle cx="12" cy="16" r="1.4"/>'
             '<path d="M4 19.5h16"/>',
    "spark": '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8'
             'M8.4 15.6l-2.8 2.8"/><circle cx="12" cy="12" r="3"/>',
    "shield": '<path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.3-7.5 9.5-4.4-1.2-7.5-5.1-7.5-9.5V6Z"/>'
              '<path d="M9.2 12.2l2 2 3.6-4"/>',
    "mask": '<path d="M3 8.5h7M14 8.5h7M3 15.5h4M11 15.5h10"/><rect x="9.5" y="6" width="3.5" height="5" rx="1"/>'
            '<rect x="6.5" y="13" width="3.5" height="5" rx="1"/>',
    "plug": '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6Z"/><path d="M12 17v4"/>',
}


# -----------------------------------------------------------------------------------------------------------------
#  s h a r e d   a s s e t s
# -----------------------------------------------------------------------------------------------------------------

# Rules the homepage does not need: they only exist on inner pages.
EXTRA_CSS = """
/* ===============================================================================================================
   Inner pages — rules that do not exist on the homepage
   =============================================================================================================== */
/* Inner hero: the homepage hero without the full-viewport height, since here the content
   below the fold is the point of the page. */
.page-hero { min-height: auto; padding: calc(var(--nav-h) + 56px) 0 72px; }
.page-hero h1 { font-size: clamp(1.9rem, 4vw, 2.9rem); margin-bottom: 20px; }
.page-hero .hero-sub { margin-bottom: 30px; }
.page-hero .hero-note { margin-bottom: 0; }
.page-hero .hero-ctas { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }

/* Core and chips are anchors, not buttons: neutralise the link defaults. */
.page-hero .orbit-core, .page-hero .orbit-chip { text-decoration: none; color: var(--text); }
.page-hero .orbit-chip { text-align: center; }

.breadcrumb { font-size: 0.8rem; color: var(--faint); margin-bottom: 18px; }
.breadcrumb ol { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 0; }
.breadcrumb li + li::before { content: "/"; margin-right: 8px; color: var(--border-strong); }
.breadcrumb a { color: var(--faint); text-decoration: none; }
.breadcrumb a:hover { color: var(--accent-text); }

/* Same treatment the homepage gives #why and #about: tint plus a hairline top and bottom. */
section.tinted {
  background: var(--bg-soft);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

/* The facts sit in the narrow column of the about grid, stacked, exactly as on the homepage. */
.page-facts { align-content: start; }

.faq-list { margin-top: 40px; max-width: 820px; }
.faq-item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  padding: 4px 22px;
  margin-bottom: 12px;
}
.faq-item summary {
  cursor: pointer;
  list-style: none;
  padding: 18px 34px 18px 0;
  font-weight: 600;
  position: relative;
}
.faq-item summary::-webkit-details-marker { display: none; }
.faq-item summary::after {
  content: "";
  position: absolute; right: 4px; top: 50%;
  width: 9px; height: 9px;
  border-right: 2px solid var(--accent); border-bottom: 2px solid var(--accent);
  transform: translateY(-70%) rotate(45deg);
  transition: transform 0.2s ease;
}
.faq-item[open] summary::after { transform: translateY(-30%) rotate(-135deg); }
.faq-item p { color: var(--muted); padding: 0 0 20px; margin: 0; max-width: 68ch; }

.photo { margin: 40px 0 0; }
.photo img { width: 100%; height: auto; display: block; border-radius: var(--radius-lg); border: 1px solid var(--border); }
.photo figcaption, .diagram figcaption { color: var(--faint); font-size: 0.82rem; margin-top: 12px; }

.diagram { margin: 40px 0 8px; }
.diagram svg { width: 100%; height: auto; display: block; }

.related-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 40px; }
.related-card {
  display: block;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  padding: 22px 24px;
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease, border-color 0.2s ease;
}
.related-card:hover { transform: translateY(-3px); border-color: var(--border-strong); }
.related-card h3 { font-size: 1.05rem; margin: 0 0 8px; }
.related-card p { color: var(--faint); font-size: 0.9rem; margin: 0; }

/* The closing band sits on the page background, like the homepage contact section, with a hairline
   to separate it from the related pages above. */
.cta-band { border-top: 1px solid var(--border); }
.cta-band h2 { max-width: 20ch; }
.cta-band .hero-ctas { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }

/* Sizing, font and padding come from the widened homepage rules. Only what a <span> and an <a>
   do not inherit from a <button> is restated here. */
.lang-switch { flex: 0 0 auto; }
.lang-switch a, .lang-switch .current {
  display: inline-flex; align-items: center; justify-content: center;
  line-height: 1; white-space: nowrap; text-decoration: none;
}
.lang-switch a:hover { color: var(--text); }

/* Four-capability pages (AI) lay out 2x2 instead of leaving an orphan card. */
.cards-3.cards-4 { grid-template-columns: repeat(2, 1fr); }

@media (max-width: 900px) {
  .related-grid { grid-template-columns: 1fr; }
  .cards-3.cards-4 { grid-template-columns: 1fr; }
  .page-hero h1 { max-width: none; }
}
"""

SITE_JS = """/* Inner pages: theme toggle, mobile menu, reveal on scroll, footer year. */
(function () {
  'use strict';

  var THEME_KEY = 'gg-theme';

  // ---------------------------------------------------------------------------------------------------------------
  //  t h e m e
  // ---------------------------------------------------------------------------------------------------------------

  function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f8fc' : '#0d1220');
    try { localStorage.setItem(THEME_KEY, theme); } catch (ignored) { /* storage may be unavailable */ }
  }

  function _initTheme() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      _applyTheme(current === 'light' ? 'dark' : 'light');
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  //  m e n u
  // ---------------------------------------------------------------------------------------------------------------

  function _initMenu() {
    var toggle = document.getElementById('menuToggle');
    var links = document.getElementById('navLinks');
    if (!toggle || !links) return;
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.addEventListener('click', function (event) {
      if (event.target.closest('a')) {
        links.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  //  r e v e a l
  // ---------------------------------------------------------------------------------------------------------------

  function _initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { observer.observe(el); });
  }

  // ---------------------------------------------------------------------------------------------------------------
  //  o r b i t
  // ---------------------------------------------------------------------------------------------------------------

  // Returns the centre of an element relative to the orbit, in layout coordinates: the visual is
  // scaled down on small screens and getBoundingClientRect values would be scaled twice.
  function _centreOf(el) {
    return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
  }

  // Creates a travelling light pulse between two points of the orbit.
  function _emitSpark(visual, from, to, delay) {
    var spark = document.createElement('span');
    spark.className = 'orbit-spark';
    spark.style.left = from.x + 'px';
    spark.style.top = from.y + 'px';
    spark.style.setProperty('--dx', (to.x - from.x) + 'px');
    spark.style.setProperty('--dy', (to.y - from.y) + 'px');
    if (delay) spark.style.animationDelay = delay + 'ms';
    spark.addEventListener('animationend', function () { spark.remove(); });
    visual.appendChild(spark);
  }

  // Creates the shockwave ring that expands from the core.
  function _emitWave(visual) {
    var wave = document.createElement('span');
    wave.className = 'core-wave';
    wave.addEventListener('animationend', function () { wave.remove(); });
    visual.appendChild(wave);
  }

  // Re-applies a class so its animation restarts even on rapid repeated clicks.
  function _restartAnimation(el, className, duration) {
    el.classList.remove(className);
    void el.offsetWidth; // force reflow
    el.classList.add(className);
    window.setTimeout(function () { el.classList.remove(className); }, duration);
  }

  // A chip lights up, sends a spark to the core, and the core answers.
  function _activateChip(chip, visual, core) {
    _restartAnimation(chip, 'activated', 700);
    _emitSpark(visual, _centreOf(chip), { x: visual.clientWidth / 2, y: visual.clientHeight / 2 }, 0);
    if (core) window.setTimeout(function () { _restartAnimation(core, 'energized', 700); }, 420);
  }

  // The core flares, pushes out a shockwave and feeds the three chips in turn.
  function _activateCore(core, visual) {
    _restartAnimation(core, 'emitting', 900);
    _emitWave(visual);
    var centre = { x: visual.clientWidth / 2, y: visual.clientHeight / 2 };
    visual.querySelectorAll('.orbit-chip').forEach(function (chip, index) {
      var delay = index * 110;
      _emitSpark(visual, centre, _centreOf(chip), delay);
      window.setTimeout(function () { _restartAnimation(chip, 'activated', 700); }, delay + 380);
    });
  }

  // True when the browser should handle the click itself: new tab, new window, download, save.
  function _isModifiedClick(event) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
  }

  // Plays the animation, then follows the link. The link still works with JS off or motion reduced.
  function _animateThenFollow(element, event, play) {
    if (_isModifiedClick(event)) return;
    event.preventDefault();
    play();
    var href = element.getAttribute('href');
    window.setTimeout(function () { window.location.href = href; }, 520);
  }

  function _initOrbit() {
    var visual = document.querySelector('.hero-visual');
    if (!visual) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var core = visual.querySelector('.orbit-core');
    visual.querySelectorAll('.orbit-chip').forEach(function (chip) {
      chip.addEventListener('click', function (event) {
        _animateThenFollow(chip, event, function () { _activateChip(chip, visual, core); });
      });
    });
    if (core) {
      core.addEventListener('click', function (event) {
        _animateThenFollow(core, event, function () { _activateCore(core, visual); });
      });
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  //  i n i t
  // ---------------------------------------------------------------------------------------------------------------

  function _init() {
    _initTheme();
    _initMenu();
    _initReveal();
    _initOrbit();
    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
  else _init();
})();
"""

# Theme is resolved before first paint to avoid a flash. Language is static on inner pages.
BOOTSTRAP_JS = """(function () {
      var theme = '';
      try { theme = localStorage.getItem('gg-theme') || ''; } catch (ignored) { /* unavailable */ }
      if (theme !== 'light' && theme !== 'dark') {
        theme = (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
      }
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.classList.add('js');
    })();"""


# -----------------------------------------------------------------------------------------------------------------
#  h e l p e r s
# -----------------------------------------------------------------------------------------------------------------

def _extract_homepage_css():
    """Return the homepage <style> block, so inner pages share one design system.

    The homepage language switch is two <button> elements toggled by JS. Inner pages have one URL
    per language, so the switch is a <span> for the current language plus an <a> to the other one.
    Rather than restating the button rules, widen the homepage selectors to cover all three
    elements: padding, font and the responsive override then stay identical by construction.
    """
    html = INDEX.read_text(encoding="utf-8")
    match = re.search(r"<style>(.*?)</style>", html, re.S)
    if not match:
        raise SystemExit("index.html: <style> block not found — the shared stylesheet cannot be built.")
    css = match.group(1)

    active = ".lang-switch button.active"
    if active not in css:
        raise SystemExit("index.html: '.lang-switch button.active' not found — check the language switch.")
    css = css.replace(active, active + ", .lang-switch .current")

    css, count = re.subn(
        r"\.lang-switch button(?=\s*\{)",
        ".lang-switch button, .lang-switch a, .lang-switch .current",
        css,
    )
    if count == 0:
        raise SystemExit("index.html: '.lang-switch button' rules not found — check the language switch.")
    return css


def _url(slug):
    return f"{SITE}/{slug}/"


def _page_by_key(key):
    for page in PAGES:
        if page["key"] == key:
            return page
    raise KeyError(key)


def _icon(name):
    body = ICONS.get(name, ICONS["spark"])
    return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="url(#icoGrad)" stroke-width="1.8" '
        f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{body}</svg>'
    )


def _icon_gradient():
    """A single gradient definition per page, referenced by every card icon."""
    return (
        '<svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs>'
        '<linearGradient id="icoGrad" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#10b981"/>'
        '</linearGradient></defs></svg>'
    )


def _strip_tags(text):
    """Plain text for JSON-LD, where JSON escaping applies and HTML entities must not."""
    clean = re.sub(r"<[^>]+>", "", text)
    return clean.replace("&amp;", "&").replace("&nbsp;", " ").strip()


def _esc(text):
    """Plain text for HTML attributes and text nodes: a bare & is invalid there.

    Apostrophes are left alone on purpose. Every attribute here is double-quoted, so ' needs no
    escaping, and html.escape would turn every Italian apostrophe into &#x27; for nothing.
    """
    clean = _strip_tags(text)
    return clean.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# -----------------------------------------------------------------------------------------------------------------
#  m a r k u p
# -----------------------------------------------------------------------------------------------------------------

def _header(lang, other_url):
    chrome = CHROME[lang]
    home = "/" if lang == "it" else "/en/"
    links = "\n        ".join(
        f'<a href="{href}">{html.escape(label)}</a>' for label, href in chrome["nav"]
    )
    other_lang = "en" if lang == "it" else "it"
    return f"""  <a class="skip-link" href="#main">{chrome['skip']}</a>

  <header class="site-header">
    <nav class="nav" aria-label="{'Navigazione principale' if lang == 'it' else 'Main navigation'}">
      <a href="{home}" class="brand">
        <span class="brand-mark" aria-hidden="true">{BRAND_SVG}</span>
        <span class="brand-text">
          <span class="brand-name">G&amp;G Technologies</span>
          <span class="brand-payoff">{chrome['payoff']}</span>
        </span>
      </a>

      <div class="nav-links" id="navLinks">
        {links}
      </div>

      <div class="nav-actions">
        <button class="theme-toggle" id="themeToggle" type="button" aria-label="Tema chiaro/scuro · Light/dark theme">
          <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4.2"/>
            <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/>
          </svg>
          <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.2 14.5A8.3 8.3 0 0 1 9.5 3.8a8.3 8.3 0 1 0 10.7 10.7Z"/>
          </svg>
        </button>
        <div class="lang-switch" role="group" aria-label="Language">
          <span class="current">{lang.upper()}</span>
          <a href="{other_url}" hreflang="{other_lang}" lang="{other_lang}">{chrome['other_lang_label']}</a>
        </div>
        <a class="btn btn-primary nav-cta" href="{chrome['mailto']}">{chrome['nav_cta']}</a>
        <button class="menu-toggle" id="menuToggle" aria-label="Menu" aria-expanded="false" aria-controls="navLinks"><span></span></button>
      </div>
    </nav>
  </header>"""


def _footer(lang):
    chrome = CHROME[lang]
    home = "/" if lang == "it" else "/en/"
    cols = []
    for title, items in chrome["footer_cols"]:
        entries = "\n            ".join(
            f'<li><a href="{href}"'
            + (' target="_blank" rel="noopener"' if href.startswith("http") else "")
            + f">{html.escape(label)}</a></li>"
            for label, href in items
        )
        cols.append(f"""        <div class="footer-col">
          <h4>{html.escape(title)}</h4>
          <ul>
            {entries}
          </ul>
        </div>""")
    return f"""  <footer class="site-footer">
    <div class="container">
      <div class="footer-inner">
        <div class="footer-brand">
          <a href="{home}" class="brand">
            <span class="brand-mark" aria-hidden="true">{BRAND_SVG_REF}</span>
            G&amp;G Technologies
          </a>
          <p>{chrome['footer_blurb']}</p>
        </div>

{chr(10).join(cols)}
      </div>

      <div class="footer-legal">
        <span>© <span id="year">2026</span> {chrome['footer_legal']}</span>
        <span>{chrome['footer_note']}</span>
      </div>
    </div>
  </footer>"""


def _breadcrumb_html(lang, page, data):
    chrome = CHROME[lang]
    home = "/" if lang == "it" else "/en/"
    crumbs = [(chrome["breadcrumb_home"], home)]
    if page.get("in_services"):
        crumbs.append((chrome["breadcrumb_services"], home + "#services"))
    items = "".join(f'<li><a href="{href}">{label}</a></li>' for label, href in crumbs)
    items += f"<li aria-current=\"page\">{_esc(data['short'])}</li>"
    label = "Percorso" if lang == "it" else "Breadcrumb"
    return f'<nav class="breadcrumb" aria-label="{label}"><ol>{items}</ol></nav>'


DIAGRAM_WORDS = {
    "it": {
        "title": "Dove passano i dati del robot",
        "desc": "Telecamera, microfono, temperatura e umidità entrano nel robot. Il modello gira a "
                "bordo e risponde a voce. Audio e video non escono di casa.",
        "house": "In casa",
        "sensors": ["Telecamera", "Microfono", "Temperatura", "Umidità"],
        "robot": "Reachy Mini",
        "robot_sub": "LLM a bordo",
        "out": "Risposta a voce",
        "cloud": "Cloud",
        "never": "audio e video non escono",
    },
    "en": {
        "title": "Where the robot's data goes",
        "desc": "Camera, microphone, temperature and humidity feed the robot. The model runs on board "
                "and answers by voice. Audio and video never leave the house.",
        "house": "In the house",
        "sensors": ["Camera", "Microphone", "Temperature", "Humidity"],
        "robot": "Reachy Mini",
        "robot_sub": "LLM on board",
        "out": "Spoken answer",
        "cloud": "Cloud",
        "never": "audio and video never leave",
    },
}


def _diagram_html(lang):
    """The page's argument, drawn: everything the robot senses is processed on board.

    Inlined rather than linked so it inherits the page's CSS variables and follows the light and
    dark theme, which an <img> to an external SVG could not do.

    Boxes are sized for the longest label of both languages, and every text node sits on one line:
    a newline inside <text> becomes leading whitespace and shifts centred labels off centre.
    """
    w = DIAGRAM_WORDS[lang]
    chips = "".join(
        f'<rect x="44" y="{104 + i * 44}" width="150" height="34" rx="8" fill="var(--panel-2)" '
        f'stroke="var(--border)"/>'
        f'<text x="119" y="{126 + i * 44}" text-anchor="middle" font-size="13" fill="var(--muted)">{label}</text>'
        for i, label in enumerate(w["sensors"])
    )
    return f"""        <figure class="diagram reveal">
          <svg viewBox="0 0 800 330" role="img" aria-labelledby="dgT dgD">
            <title id="dgT">{w['title']}</title>
            <desc id="dgD">{w['desc']}</desc>
            <defs>
              <marker id="dgArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"
                      orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)"/>
              </marker>
            </defs>

            <rect x="20" y="70" width="520" height="240" rx="18" fill="none" stroke="var(--border-strong)"
                  stroke-dasharray="7 6"/>
            <text x="40" y="94" font-size="11.5" letter-spacing="1.6" fill="var(--faint)">{w['house'].upper()}</text>

            {chips}

            <path d="M204 187 H250" stroke="var(--accent)" stroke-width="2" fill="none"
                  marker-end="url(#dgArrow)"/>

            <rect x="262" y="150" width="240" height="74" rx="14" fill="var(--panel)"
                  stroke="var(--border-strong)"/>
            <text x="382" y="181" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text)">{w['robot']}</text>
            <text x="382" y="203" text-anchor="middle" font-size="12.5" fill="var(--accent-text)">{w['robot_sub']}</text>

            <path d="M382 228 V248" stroke="var(--accent)" stroke-width="2" fill="none"
                  marker-end="url(#dgArrow)"/>
            <rect x="302" y="252" width="160" height="44" rx="12" fill="var(--panel-2)" stroke="var(--border)"/>
            <text x="382" y="279" text-anchor="middle" font-size="12.5" fill="var(--muted)">{w['out']}</text>

            <rect x="600" y="122" width="150" height="54" rx="12" fill="none" stroke="var(--border)"
                  stroke-dasharray="4 5"/>
            <text x="675" y="154" text-anchor="middle" font-size="13" fill="var(--faint)">{w['cloud']}</text>

            <path d="M506 178 L592 156" stroke="var(--faint)" stroke-width="2" fill="none"
                  stroke-dasharray="5 5" opacity="0.65"/>
            <g stroke="var(--faint)" stroke-width="2.4" stroke-linecap="round">
              <path d="M540 156 L558 178"/><path d="M558 156 L540 178"/>
            </g>
            <text x="675" y="200" text-anchor="middle" font-size="11.5" fill="var(--faint)">{w['never']}</text>
          </svg>
        </figure>"""


def _photo_html(data):
    """An illustrative image, always captioned as such.

    The product site already labels its mock-ups ("Esempio illustrativo — dati di fantasia"). The
    same rule applies harder here: this page is about frail people and a prototype that does not
    exist in anyone's home yet, so a photorealistic scene must say what it is.
    """
    photo = data.get("photo")
    if not photo:
        return ""
    return f"""        <figure class="photo reveal">
          <img src="/assets/{photo['file']}-1800.jpg"
               srcset="/assets/{photo['file']}-900.jpg 900w, /assets/{photo['file']}-1800.jpg 1800w"
               sizes="(max-width: 900px) 100vw, 1080px"
               width="1800" height="1012" loading="lazy" decoding="async"
               alt="{_esc(photo['alt'])}">
          <figcaption>{photo['caption']}</figcaption>
        </figure>"""


def _note_html(data, key):
    """An optional paragraph under a section heading, for pages that need a pointer elsewhere."""
    return f'\n          <p class="section-intro">{data[key]}</p>' if data.get(key) else ""


def _cards_html(data):
    cards = []
    for icon, title, text, bullets in data["cards"]:
        items = "".join(f"<li>{b}</li>" for b in bullets)
        cards.append(f"""          <article class="card reveal">
            <div class="card-icon" aria-hidden="true">{_icon(icon)}</div>
            <h3>{title}</h3>
            <p>{text}</p>
            <ul>{items}</ul>
          </article>""")
    grid = "cards-3" if len(cards) <= 3 else "cards-3 cards-4"
    return f'        <div class="{grid}">\n' + "\n".join(cards) + "\n        </div>"


def _steps_html(page, data):
    """Numbered like the homepage pillars, unless the items are a list rather than a sequence:
    numbering an audience list would imply an order that is not there."""
    numbered = page.get("steps_numbered", True)
    steps = []
    for index, (title, text) in enumerate(data["steps"], start=1):
        number = f'\n            <div class="n">{index:02d}</div>' if numbered else ""
        steps.append(f"""          <div class="pillar reveal">{number}
            <h3>{title}</h3>
            <p>{text}</p>
          </div>""")
    return '        <div class="pillars">\n' + "\n".join(steps) + "\n        </div>"


def _facts_html(data):
    facts = []
    for title, text in data["facts"]:
        facts.append(f"""          <div class="fact">
            <span class="f-dot" aria-hidden="true"></span>
            <div>
              <h4>{title}</h4>
              <p>{text}</p>
            </div>
          </div>""")
    return '        <div class="about-facts page-facts reveal">\n' + "\n".join(facts) + "\n        </div>"


def _faq_html(data):
    items = []
    for question, answer in data["faq"]:
        items.append(f"""          <details class="faq-item reveal">
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>""")
    return '        <div class="faq-list">\n' + "\n".join(items) + "\n        </div>"


def _stats_html(lang, data):
    """The three figures under the call to action.

    Default to the company ones the homepage carries; a page may override them when its reader is
    a different person.
    """
    items = []
    for number, label in data.get("stats") or CHROME[lang]["stats"]:
        items.append(f"""            <div class="stat">
              <div class="num">{number}</div>
              <div class="label">{label}</div>
            </div>""")
    return '          <div class="hero-stats">\n' + "\n".join(items) + "\n          </div>"


def _closing_ctas(lang, data):
    """The closing band leads with the page's own action, then the fallbacks."""
    buttons = []
    if data.get("cta_primary"):
        label, href = data["cta_primary"]
        buttons.append(f'<a class="btn btn-primary" href="{href}">{label}</a>')
        buttons.append(f'<a class="btn btn-ghost" href="{CHROME[lang]["mailto"]}">'
                       f'{"Scrivici" if lang == "it" else "Email us"}</a>')
    else:
        buttons.append(f'<a class="btn btn-primary" href="{CHROME[lang]["mailto"]}">'
                       f'{"Scrivici" if lang == "it" else "Email us"}</a>')
        buttons.append(f'<a class="btn btn-ghost" href="tel:+3780549900824">'
                       f'{"Chiamaci" if lang == "it" else "Call us"}</a>')
    return "\n".join("          " + b for b in buttons)


def _orbit_html(lang, data):
    """The homepage orbit visual, reused on inner pages. Core and chips are links: the click plays
    the spark sequence and then follows the link, so the visual is also real internal navigation."""
    chips = []
    for index, key in enumerate(data["related"][:3], start=1):
        target = _page_by_key(key)[lang]
        chips.append(
            f'<a class="orbit-chip chip-{index}" href="/{target["slug"]}/">'
            f'<span class="dot" aria-hidden="true"></span>{_esc(target["short"])}</a>'
        )
    home_label = "Vai alla home" if lang == "it" else "Go to the home page"
    return f"""      <div class="hero-visual">
        <div class="orbit-ring ring-1" aria-hidden="true"></div>
        <div class="orbit-ring ring-2" aria-hidden="true"></div>
        <a class="orbit-core" href="/" aria-label="{home_label}">
          <span><strong>G&amp;G</strong><br><small>Technologies</small></span>
        </a>
{chr(10).join('        ' + c for c in chips)}
      </div>"""


def _related_html(lang, data):
    cards = []
    for key in data["related"]:
        target = _page_by_key(key)[lang]
        cards.append(f"""          <a class="related-card reveal" href="/{target['slug']}/">
            <h3>{_esc(target['short'])}</h3>
            <p>{target['blurb']}</p>
          </a>""")
    return '        <div class="related-grid">\n' + "\n".join(cards) + "\n        </div>"


# -----------------------------------------------------------------------------------------------------------------
#  s t r u c t u r e d   d a t a
# -----------------------------------------------------------------------------------------------------------------

def _json_ld(lang, page, data, url):
    chrome = CHROME[lang]
    home = SITE + ("/" if lang == "it" else "/en/")
    org_id = f"{SITE}/#organization"

    crumbs = [{"@type": "ListItem", "position": 1, "name": chrome["breadcrumb_home"], "item": home}]
    if page.get("in_services"):
        crumbs.append({"@type": "ListItem", "position": 2, "name": chrome["breadcrumb_services"],
                       "item": home + "#services"})
    crumbs.append({"@type": "ListItem", "position": len(crumbs) + 1,
                   "name": _strip_tags(data["short"]), "item": url})

    blocks = [
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": crumbs,
        }
    ]

    if page["schema"] == "ResearchProject":
        # Not a Service and not a Product: nothing here is for sale, and saying otherwise in the
        # structured data would be the same overclaim the page text is careful to avoid.
        blocks.append({
            "@context": "https://schema.org",
            "@type": "ResearchProject",
            "name": _strip_tags(data["short"]),
            "url": url,
            "description": data["description"],
            "inLanguage": lang,
            "parentOrganization": {"@id": org_id},
        })
    elif page["schema"] == "SoftwareApplication":
        blocks.append({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Podz.AI",
            "url": url,
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "Windows, macOS, Linux",
            "description": data["description"],
            "inLanguage": lang,
            "publisher": {"@id": org_id},
            "author": {"@id": org_id},
            # Perpetual licence, list price for a single seat. Values come from PRICING so the
            # structured data can never disagree with the page text.
            "offers": {
                "@type": "Offer",
                "price": str(PRICING["licence"]),
                "priceCurrency": PRICING["currency"],
                "url": PRICING["source"],
                "availability": "https://schema.org/InStock",
                "priceValidUntil": PRICING["valid_until"],
            },
        })
    else:
        blocks.append({
            "@context": "https://schema.org",
            "@type": "Service",
            "name": _strip_tags(data["short"]),
            "serviceType": page["service_type"],
            "url": url,
            "description": data["description"],
            "inLanguage": lang,
            "provider": {"@id": org_id},
            "areaServed": [
                {"@type": "Country", "name": "San Marino"},
                {"@type": "Country", "name": "Italy"},
                {"@type": "Place", "name": "Europe"},
            ],
        })

    blocks.append({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "inLanguage": lang,
        "mainEntity": [
            {
                "@type": "Question",
                "name": _strip_tags(question),
                "acceptedAnswer": {"@type": "Answer", "text": _strip_tags(answer)},
            }
            for question, answer in data["faq"]
        ],
    })

    return json.dumps(blocks, ensure_ascii=False, indent=2)


# -----------------------------------------------------------------------------------------------------------------
#  p a g e
# -----------------------------------------------------------------------------------------------------------------

def _render_page(lang, page):
    data = page[lang]
    other_lang = "en" if lang == "it" else "it"
    url = _url(data["slug"])
    other_url = _url(page[other_lang]["slug"])
    it_url = _url(page["it"]["slug"])
    chrome = CHROME[lang]

    # Assets are referenced relatively so a page also renders when opened straight from disk
    # (file://), where an absolute "/assets/..." would resolve to the filesystem root.
    prefix = "../" * (data["slug"].count("/") + 1)
    title = data["title"]
    description = data["description"]

    if data.get("product_cta"):
        label, href = data["product_cta"]
        ctas = [f'<a class="btn btn-primary" href="{href}">{label}</a>',
                f'<a class="btn btn-ghost" href="{chrome["mailto"]}">{chrome["nav_cta"]}</a>']
    else:
        ctas = [f'<a class="btn btn-primary" href="{chrome["mailto"]}">{chrome["nav_cta"]}</a>']

    sections = [
        # hero — same structure and classes as the homepage, so layout and motion match
        f"""    <section class="hero page-hero">
      <div class="hero-bg" aria-hidden="true">
        <div class="glow glow-1"></div>
        <div class="glow glow-2"></div>
        <div class="glow glow-3"></div>
      </div>

      <div class="container hero-inner">
        <div>
          {_breadcrumb_html(lang, page, data)}
          <div class="kicker">{data['kicker']}</div>
          <h1>{data['h1']}</h1>
          <p class="hero-sub">{data['lead']}</p>
          <div class="hero-ctas">{''.join(ctas)}</div>
          <p class="hero-note">{'Oppure scrivici: ' if lang == 'it' else 'Or write to us: '}<a href="mailto:info@ggtechnologies.sm">info@ggtechnologies.sm</a></p>
{_stats_html(lang, data)}
        </div>

{_orbit_html(lang, data)}
      </div>
    </section>""",
        # intro — same shape as the homepage "about" section: kicker, headline, then text next
        # to the summary facts
        f"""    <section>
      <div class="container">
        <div class="reveal">
          <div class="kicker">{data['intro_title']}</div>
          <h2>{data['intro_h2']}</h2>
        </div>
        <div class="about-grid">
          <div class="about-text reveal">
            {''.join(f'<p>{p}</p>' for p in data['intro'])}
          </div>
{_facts_html(data)}
        </div>
{_photo_html(data)}
      </div>
    </section>""",
        # capabilities
        f"""    <section class="tinted">
      <div class="container">
        <div class="reveal">
          <div class="kicker">{data['cards_title']}</div>
          <h2>{data['cards_intro']}</h2>{_note_html(data, 'cards_note')}
        </div>
{_diagram_html(lang) if data.get('figure') else ''}
{_cards_html(data)}
      </div>
    </section>""",
        # process
        f"""    <section>
      <div class="container">
        <div class="reveal">
          <div class="kicker">{data['steps_title']}</div>
          <h2>{data['steps_intro']}</h2>
        </div>
{_steps_html(page, data)}
      </div>
    </section>""",
        # faq
        f"""    <section class="tinted">
      <div class="container">
        <div class="reveal">
          <div class="kicker">FAQ</div>
          <h2>{data['faq_title']}</h2>
        </div>
{_faq_html(data)}
      </div>
    </section>""",
        # related
        f"""    <section>
      <div class="container">
        <div class="reveal">
          <h2>{chrome['related_title']}</h2>
        </div>
{_related_html(lang, data)}
      </div>
    </section>""",
        # closing cta
        f"""    <section class="cta-band">
      <div class="container reveal">
        <h2>{data['cta_title']}</h2>
        <p class="section-intro">{data['cta_text']}</p>
        <div class="hero-ctas">
{_closing_ctas(lang, data)}
        </div>
      </div>
    </section>""",
    ]

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{_esc(title)}</title>
  <meta name="description" content="{_esc(description)}">
  <meta name="author" content="G&amp;G Technologies Srl">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#0d1220">
  <link rel="canonical" href="{url}">
  <link rel="alternate" hreflang="it" href="{it_url}">
  <link rel="alternate" hreflang="en" href="{_url(page['en']['slug'])}">
  <link rel="alternate" hreflang="x-default" href="{it_url}">
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="G&amp;G Technologies">
  <meta property="og:title" content="{_esc(title)}">
  <meta property="og:description" content="{_esc(description)}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{SITE}/assets/{data.get('og_image', 'og-card.png')}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="{LOCALE[lang]}">
  <meta property="og:locale:alternate" content="{LOCALE[other_lang]}">
  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{_esc(title)}">
  <meta name="twitter:description" content="{_esc(description)}">
  <meta name="twitter:image" content="{SITE}/assets/{data.get('og_image', 'og-card.png')}">
  <!-- Favicon -->
  <link rel="apple-touch-icon" sizes="180x180" href="{prefix}assets/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="{prefix}assets/favicon-32.png">
  <!-- Pre-paint bootstrap: resolve the theme before first render -->
  <script>
    {BOOTSTRAP_JS}
  </script>
  <link rel="stylesheet" href="{prefix}assets/site.css">
  <script type="application/ld+json">
{_json_ld(lang, page, data, url)}
  </script>
</head>
<body>
{_icon_gradient()}
{_header(lang, other_url)}

  <main id="main">
{chr(10).join(sections)}
  </main>

{_footer(lang)}

  <script src="{prefix}assets/site.js" defer></script>
</body>
</html>
"""


# -----------------------------------------------------------------------------------------------------------------
#  s i t e m a p
# -----------------------------------------------------------------------------------------------------------------

def _drop_other_language(markup, other):
    """Remove every element whose class marks it as the other language.

    A regex cannot do this: the elements wrap content and nest, so the closing tag has to be found
    by counting depth. Anything left behind would show both languages at once.
    """
    pattern = re.compile(r'<(\w+)([^>]*\bclass="[^"]*\b' + other + r'\b[^"]*"[^>]*)>')
    while True:
        match = pattern.search(markup)
        if not match:
            return markup
        tag = match.group(1)
        depth, index = 1, match.end()
        opening = re.compile(rf"<{tag}\b", re.I)
        closing = re.compile(rf"</{tag}\s*>", re.I)
        while depth and index < len(markup):
            nxt_open = opening.search(markup, index)
            nxt_close = closing.search(markup, index)
            if not nxt_close:
                raise SystemExit(f"_src/home.html: <{tag}> con class «{other}» non è chiuso")
            if nxt_open and nxt_open.start() < nxt_close.start():
                depth += 1
                index = nxt_open.end()
            else:
                depth -= 1
                index = nxt_close.end()
        markup = markup[:match.start()] + markup[index:]


def _render_home(lang):
    """The two single-language homepages, derived from the one bilingual source."""
    source = SRC / "home.html"
    if not source.exists():
        raise SystemExit(f"{source} non trovato: è la sorgente bilingue della homepage.")
    s = source.read_text(encoding="utf-8")

    other = "en" if lang == "it" else "it"
    s = _drop_other_language(s, other)

    titles = dict(re.findall(r"(it|en): '([^']*—[^']*)'", s))
    descriptions = dict(re.findall(r"(it|en): '(Progettiamo[^']*|We design[^']*)'", s))
    if len(titles) != 2 or len(descriptions) != 2:
        raise SystemExit("_src/home.html: TITLES o DESCRIPTIONS non leggibili, controlla il blocco JS.")
    title, description = titles[lang], descriptions[lang]

    it_url, en_url = SITE + "/", SITE + "/en/"
    url = it_url if lang == "it" else en_url

    s = s.replace('<html lang="it">', f'<html lang="{lang}">', 1)
    s = re.sub(r"<title>.*?</title>", f"<title>{_esc(title)}</title>", s, count=1, flags=re.S)
    s = re.sub(r'<meta name="description" content="[^"]*">',
               f'<meta name="description" content="{_esc(description)}">', s, count=1)
    for prop, value in (("og:title", title), ("og:description", description),
                        ("twitter:title", title), ("twitter:description", description)):
        attr = "property" if prop.startswith("og:") else "name"
        s = re.sub(rf'<meta {attr}="{prop}" content="[^"]*">',
                   f'<meta {attr}="{prop}" content="{_esc(value)}">', s, count=1)
    s = s.replace('<meta property="og:url" content="https://ggtechnologies.sm/">',
                  f'<meta property="og:url" content="{url}">', 1)
    s = s.replace('<meta property="og:locale" content="it_IT">',
                  f'<meta property="og:locale" content="{LOCALE[lang]}">', 1)
    s = s.replace('<meta property="og:locale:alternate" content="en_US">',
                  f'<meta property="og:locale:alternate" content="{LOCALE[other]}">', 1)

    s = re.sub(r'<link rel="canonical" href="[^"]*">\s*'
               r'(?:<link rel="alternate" hreflang="[^"]*" href="[^"]*">\s*)*',
               f'<link rel="canonical" href="{url}">\n'
               f'  <link rel="alternate" hreflang="it" href="{it_url}">\n'
               f'  <link rel="alternate" hreflang="en" href="{en_url}">\n'
               f'  <link rel="alternate" hreflang="x-default" href="{it_url}">\n  ',
               s, count=1)

    s = s.replace("og-home-LANG.jpg", f"og-home-{lang}.jpg")

    # Nodes that exist once and carry text: image alt, structured data, mail subjects. They are not
    # duplicated with .it/.en classes, so the English page would otherwise ship Italian — which is
    # what a screen reader reads out and what Google feeds into the Knowledge Panel.
    if lang == "en":
        for italian, english in (
            ("subject=Richiesta%20informazioni", "subject=Information%20request"),
            ("Una donna anziana seduta in salotto guarda un piccolo robot bianco con due antenne, "
             "appoggiato al tavolino davanti a lei.",
             "An elderly woman sitting in a living room looks at a small white robot with two "
             "antennas, resting on the table in front of her."),
            ("Progettiamo e realizziamo tecnologia a San Marino: wearable medicali, robotica, "
             "automazione e intelligenza artificiale. Nostri il framework DigiSense® e Podz.AI.",
             "We design and build technology in San Marino: medical wearables, robotics, automation "
             "and artificial intelligence. DigiSense® and Podz.AI are ours."),
            ('"Wearable medicali"', '"Medical wearables"'),
            ('"Monitoraggio biovitale"', '"Vital-signs monitoring"'),
            ('"Robotica e automazione industriale"', '"Industrial robotics and automation"'),
            ('"Intelligenza artificiale"', '"Artificial intelligence"'),
            ('"Sviluppo software"', '"Software development"'),
            ('"DigiSense, framework proprietario per sensori, AI e automazione"',
             '"DigiSense, our own framework for sensors, AI and automation"'),
        ):
            s = s.replace(italian, english)
        s = re.sub(r'(og:image:alt|twitter:image:alt)" content="[^"]*"',
                   r'\1" content="G&amp;G Technologies — medical wearables, robotics and '
                   r'artificial intelligence, designed and built in San Marino."', s)
    else:
        s = re.sub(r'(og:image:alt|twitter:image:alt)" content="[^"]*"',
                   r'\1" content="G&amp;G Technologies — wearable medicali, robotica e '
                   r'intelligenza artificiale, progettati e realizzati a San Marino."', s)

    switch = (f'<span class="current">{lang.upper()}</span>\n'
              f'          <a href="{en_url if lang == "it" else it_url}" '
              f'hreflang="{other}" lang="{other}">{other.upper()}</a>')
    s = s.replace("<!--LANG-SWITCH-->", switch, 1)

    # the toggle no longer exists, so neither do the functions that drove it
    for block in ("_detectLanguage", "_setLanguage", "_initLanguage"):
        s = re.sub(rf"\n      // [^\n]*\n      function {block}\(\)[^\n]*\n(?:.*?\n)*?      \}}\n",
                   "\n", s, count=1)
    s = re.sub(r"\n      const TITLES = \{(?:.*?\n)*?      \};\n", "\n", s, count=1)
    s = re.sub(r"\n      const DESCRIPTIONS = \{(?:.*?\n)*?      \};\n", "\n", s, count=1)
    s = re.sub(r"\n      const STORAGE_KEY = '[^']*';", "", s, count=1)
    return s


def _redirect_page(lang, old_slug, new_url, label):
    """A stub at a retired URL.

    GitHub Pages serves static files only: there is no 301. The canonical link is what search
    engines actually act on; the meta refresh and the visible link are for people who arrive from
    an old bookmark. noindex would hide the canonical, so it is deliberately absent.
    """
    wording = {
        "it": ("Pagina spostata", "Questa pagina si trova ora a un nuovo indirizzo.", "Vai a"),
        "en": ("Page moved", "This page now lives at a new address.", "Go to"),
    }[lang]
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{wording[0]} — G&amp;G Technologies</title>
  <link rel="canonical" href="{new_url}">
  <meta http-equiv="refresh" content="0; url={new_url}">
  <meta name="robots" content="noarchive">
  <link rel="stylesheet" href="/assets/site.css">
</head>
<body>
  <main id="main" style="min-height:60vh;display:grid;place-items:center;text-align:center;padding:40px">
    <div>
      <h1 style="font-size:1.4rem;margin-bottom:12px">{wording[0]}</h1>
      <p style="color:var(--muted);margin-bottom:20px">{wording[1]}</p>
      <p><a class="btn btn-primary" href="{new_url}">{wording[2]} {_esc(label)}</a></p>
    </div>
  </main>
</body>
</html>
"""


def _sitemap(lastmod):
    entries = [(SITE + "/", SITE + "/", SITE + "/en/"), (SITE + "/en/", SITE + "/", SITE + "/en/")]
    for page in PAGES:
        for lang in LANGS:
            entries.append((_url(page[lang]["slug"]), _url(page["it"]["slug"]), _url(page["en"]["slug"])))

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
             '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for url, it_url, en_url in entries:
        lines.append("  <url>")
        lines.append(f"    <loc>{url}</loc>")
        if it_url:
            lines.append(f'    <xhtml:link rel="alternate" hreflang="it" href="{it_url}"/>')
            lines.append(f'    <xhtml:link rel="alternate" hreflang="en" href="{en_url}"/>')
            lines.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{it_url}"/>')
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append("    <changefreq>monthly</changefreq>")
        lines.append(f"    <priority>{'1.0' if url in (SITE + '/', SITE + '/en/') else '0.8'}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------



def _walk_text(value, path=""):
    """Every string in a page, wherever it is nested."""
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from _walk_text(item, f"{path}.{key}")
    elif isinstance(value, (list, tuple)):
        for index, item in enumerate(value):
            yield from _walk_text(item, f"{path}[{index}]")


def _check_pricing():
    """Prices live in three places: this site's copy, its JSON-LD, and the product site. Keep them
    equal or say so loudly — a price the structured data contradicts is worse than no price at all.

    Two checks. First, every euro amount written anywhere in the content must be a value declared in
    PRICING: a hard-coded figure that drifted is caught here. Second, if the product-site repository
    is checked out next to this one, its pricing page must quote the same figures.
    """
    problems = []
    known = {PRICING["licence"], PRICING["renewal"]}

    amounts = re.compile(r"(?:€\s?([\d.,]+)|([\d.,]+)\s?€)")
    for page in PAGES:
        for lang in LANGS:
            for path, text in _walk_text(page[lang]):
                for before, after in amounts.findall(text):
                    raw = (before or after).rstrip(".,")
                    value = int(raw.replace(".", "").replace(",", ""))
                    if value not in known:
                        problems.append(f'{page["key"]}.{lang}{path}: {raw} non è un prezzo di PRICING '
                                        f'— aggiorna PRICING invece di scriverlo a mano')

    product_page = _find_product_pricing()
    if product_page:
        # Compare against the headline prices only. Matching a bare number anywhere in the page
        # would pass on any figure that happens to appear in the volume-discount table.
        published = product_page.read_text(encoding="utf-8")
        quoted = {
            int(raw.replace(".", "").replace(",", ""))
            for raw in re.findall(r'class="amount">\s*([\d.,]+)\s*€', published)
        }
        if not quoted:
            problems.append(f'{product_page}: nessun prezzo con class="amount", il confronto del '
                            f'listino non è più affidabile — controlla il markup')
        else:
            for label in ("licence", "renewal"):
                if PRICING[label] not in quoted:
                    listed = ", ".join(f"{v:,.0f}".replace(",", ".") + " €" for v in sorted(quoted))
                    problems.append(f'PRICING["{label}"] = {PRICING[label]} non è fra i prezzi del '
                                    f'listino pubblicato ({listed}) in {product_page}')
    else:
        print("nota: pricing.html del sito di prodotto non trovato, salto il confronto del listino.\n"
              "      Indica il percorso con PODZ_DOCS=/percorso/di/digisense-releases/docs")

    return problems


def _find_product_pricing():
    """The product site is a separate repository, so its location is a guess plus an override."""
    override = os.environ.get("PODZ_DOCS")
    candidates = [Path(override) / "pricing.html"] if override else []
    candidates += [
        ROOT.parent / "digisense-releases" / "docs" / "pricing.html",
        ROOT.parent / "docs" / "pricing.html",
        ROOT.parent.parent / "digisense-releases" / "docs" / "pricing.html",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _check_parity():
    """Fail loudly when the two languages drift apart.

    Structural parity is checkable: same fields, same number of items. A leftover English string
    is not, so also flag any text field where one language is left holding a sentence the other
    no longer has anything like — a length gap that wide is always a forgotten edit.
    """
    problems = []
    for page in PAGES:
        it, en = page["it"], page["en"]
        if set(it) != set(en):
            problems.append(f'{page["key"]}: campi diversi fra IT ed EN: {set(it) ^ set(en)}')
        for field in ("intro", "cards", "steps", "facts", "faq", "related"):
            if len(it[field]) != len(en[field]):
                problems.append(f'{page["key"]}.{field}: {len(it[field])} voci IT, {len(en[field])} EN')
        for card_it, card_en in zip(it["cards"], en["cards"]):
            if len(card_it[3]) != len(card_en[3]):
                problems.append(f'{page["key"]}: elenchi di lunghezza diversa nella card "{card_it[1]}"')
        # Compare every string, not just the headlines: a fix applied to one language only is the
        # mistake this project keeps making.
        it_text, en_text = dict(_walk_text(it)), dict(_walk_text(en))
        for path, italian in it_text.items():
            english = en_text.get(path)
            if not english or not italian:
                continue
            # Short labels swing wildly between the two languages by nature: only compare sentences.
            if len(italian) < 40 and len(english) < 40:
                continue
            ratio = len(italian) / len(english)
            if ratio < 0.6 or ratio > 1.65:
                problems.append(f'{page["key"]}{path}: IT e EN divergono troppo, probabile modifica '
                                f'applicata a una lingua sola')
        for lang in LANGS:
            for path, text in _walk_text(page[lang]):
                for phrase, reason in BANNED[lang]:
                    if phrase.lower() in text.lower():
                        problems.append(f'{page["key"]}.{lang}{path}: «{phrase}» — {reason}')
        for lang in LANGS:
            if len(page[lang]["title"]) > 65:
                problems.append(f'{page["key"]}.{lang}: title di {len(page[lang]["title"])} caratteri')
            if not 110 <= len(page[lang]["description"]) <= 165:
                problems.append(f'{page["key"]}.{lang}: description di {len(page[lang]["description"])} caratteri')
    problems += _check_pricing()
    if problems:
        raise SystemExit("content.py:\n  " + "\n  ".join(problems))


def main():
    from datetime import date

    _check_parity()

    ASSETS.mkdir(exist_ok=True)
    (ASSETS / "site.css").write_text(_extract_homepage_css() + EXTRA_CSS, encoding="utf-8")

    (ROOT / "index.html").write_text(_render_home("it"), encoding="utf-8")
    (ROOT / "en").mkdir(exist_ok=True)
    (ROOT / "en" / "index.html").write_text(_render_home("en"), encoding="utf-8")
    (ASSETS / "site.js").write_text(SITE_JS, encoding="utf-8")

    written = []
    for page in PAGES:
        for lang in LANGS:
            slug = page[lang]["slug"]
            target = ROOT / slug
            target.mkdir(parents=True, exist_ok=True)
            (target / "index.html").write_text(_render_page(lang, page), encoding="utf-8")
            written.append(slug + "/")

            # a retired URL keeps a stub pointing at the new one
            old_slug = page.get("moved_from", {}).get(lang)
            if old_slug:
                stub = ROOT / old_slug
                stub.mkdir(parents=True, exist_ok=True)
                (stub / "index.html").write_text(
                    _redirect_page(lang, old_slug, _url(slug), page[lang]["short"]), encoding="utf-8")
                written.append(f"{old_slug}/  ->  {slug}/")

    (ROOT / "sitemap.xml").write_text(_sitemap(date.today().isoformat()), encoding="utf-8")

    print("index.html       (it)")
    print("en/index.html    (en)")
    print(f"assets/site.css  ({(ASSETS / 'site.css').stat().st_size // 1024} KB)")
    print("assets/site.js")
    for slug in written:
        print(slug)
    urls = len(LANGS) + sum(len(LANGS) for _ in PAGES)   # two homepages plus one URL per page per language
    print(f"sitemap.xml      ({urls} URL, gli stub di reindirizzamento restano fuori)")


if __name__ == "__main__":
    main()
