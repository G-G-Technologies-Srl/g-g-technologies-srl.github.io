# -*- coding: utf-8 -*-
"""Build the static inner pages of ggtechnologies.sm from content.py.

One URL per language (no CSS language toggle on inner pages), reciprocal hreflang, self canonical,
JSON-LD (Organization reference, BreadcrumbList, Service or SoftwareApplication, FAQPage).

The shared stylesheet is extracted from index.html at build time, so the homepage stays the single
source of truth for the design system: change a token there and the inner pages follow.

Usage:  python3 _src/build.py
"""

import hashlib
import html
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote as _quote

sys.path.insert(0, str(Path(__file__).parent))
import article_art  # noqa: E402
from apps import APPS, APPS_INDEX, APP_TAGS, KICKER_MAX, REPO_APPS, SUMMARY_MAX  # noqa: E402
from content import (ARTICLES, BANNED, CHROME, INSIGHTS_INDEX, PAGES,  # noqa: E402
                     PODZ_SITE, PRICING, SITE, STUDY, TAGS)

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(__file__).resolve().parent
# The homepage is now generated too: _src/home.html is the bilingual source of both languages
# and of the shared stylesheet.
INDEX = SRC / "home.html"
ASSETS = ROOT / "assets"

# The stylesheet and the script carry a hash of their own content in the filename, and the pages
# link to that name. GitHub Pages serves assets with max-age=600 and the filename never used to
# change, so for ten minutes after a deploy browsers kept the previous CSS while the HTML was
# already new — the layout looked broken to anyone who had visited recently, including us. With
# the hash in the name a changed file is a new URL and cannot be served from cache; an unchanged
# one keeps its name and stays cached. main() fills these in before any page is rendered.
ASSET_CSS = "site.css"
ASSET_JS = "site.js"

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

/* Apps — the pages about them, never the apps themselves (those carry their own stylesheet). */
/* Screenshot and lists live in the same section as the intro. Split across two sections the
   paddings stacked and left a hole the width of the page between a paragraph and a card. */
.app-lists { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin-top: 34px; }
.app-list {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.02);
  padding: 22px 24px;
}
.app-list h3 { font-size: 1.05rem; margin-bottom: 12px; }
/* The square bullet of the homepage cards, not the browser's dot: it is the site's own mark. */
.app-list .ticks { list-style: none; display: grid; gap: 9px; padding: 0; margin: 0; }
.app-list .ticks li { position: relative; padding-left: 20px; color: var(--muted); font-size: 0.93rem; }
.app-list .ticks li::before {
  content: "";
  position: absolute;
  left: 0; top: 8px;
  width: 9px; height: 9px;
  border-radius: 3px;
  background: var(--gradient);
  opacity: 0.85;
}
/* What an app does not do is said as plainly as what it does, and looks the same weight: a
   quieter box would read as a disclaimer, and it is not one. */
.app-list.does-not .ticks li::before { background: var(--border-strong); opacity: 1; }

/* The banner shares its section with the text that follows it, instead of sitting in one of its
   own. Two sections meant two paddings stacked, and the drawing floated a quarter of a screen
   above the heading it belongs to — the hole the root CLAUDE.md warns about, made again. */
.article-body .article-art { margin-bottom: 44px; }

/* In the hero the tag row is not a centred block of prose: `margin: auto` would push it to the
   middle of the column while everything above it starts at the left edge. */
.page-hero .article-tags { max-width: none; margin: 0 0 26px; }

/* The intro reuses the paragraph rhythm of .about-text — same rule, no second one to keep in step —
   and the reading column of the illustration above it, which is .prose's 720px. Without the wrapper
   the paragraphs had neither: no space between them, and a line the full width of the container. */
.article-body .about-text { max-width: 720px; }
/* On an article the banner is centred, because the prose it belongs to is centred too. A scheda is
   not an article: its occhiello, its h2 and the cards below all start at the left edge of the
   container, so a centred banner is the only thing on the page floating in the middle. Same 720px,
   anchored to the same edge as the text. */
.article-body .app-art { margin-left: 0; }
.article-body .about-text p:last-child { margin-bottom: 0; }
.app-shot { margin: 0 0 26px; }
.app-shot img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.app-meta { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 22px; color: var(--faint); font-size: 0.88rem; }
.app-meta b { color: var(--muted); font-weight: 500; }

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

/* The research panel. Built from the card recipe on purpose — same gradient fill, same large
   radius, same top hairline — so it reads as part of this site and not as something pasted in.
   The one difference: the hairline is always on, because the panel is not a hover target. */
.research {
  position: relative;
  overflow: hidden;
  margin: 48px 0 0;
  max-width: 820px;
  background: linear-gradient(170deg, var(--panel-2), var(--panel) 60%);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 32px 30px;
}
.research::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--gradient);
}
.research .kicker { margin-bottom: 12px; }
/* Headings that follow a kicker are serif everywhere else on this site: match them. */
/* 36ch, measured in the browser and not guessed: below it the Italian heading breaks into three
   lines and splits the highlighted phrase across two of them. Both languages fit in two lines here. */
.research h3 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: clamp(1.25rem, 2.4vw, 1.6rem);
  margin: 0 0 18px;
  max-width: 36ch;
}
.research p { color: var(--muted); font-size: 0.94rem; margin: 0 0 14px; max-width: 68ch; }
.research-cite {
  font-size: 0.85rem;
  line-height: 1.7;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}
.research-cite strong { color: var(--text); }
.research-link { margin: 0 0 6px; }
.research-link a { color: var(--accent-text); text-decoration: none; font-weight: 600; }
.research-link a:hover { text-decoration: underline; }
.research-note { color: var(--faint); font-size: 0.8rem; margin: 0; }

/* Il caso cliente riusa il pannello della ricerca — stessa scatola, stesso filo in alto — e
   aggiunge solo la citazione. Un cliente che parla e uno studio citato sono la stessa cosa per
   il lettore: prova che qualcuno di esterno conferma. Vale che si somiglino. */
.case-quote {
  margin: 22px 0 10px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
.case-quote blockquote { margin: 0; }
/* 58ch, misurati: la citazione è in serif e più grande del corpo, quindi 68ch le darebbero una
   riga fisicamente più lunga dei paragrafi sopra e il bordo destro si vedrebbe sfalsato. */
.case-quote blockquote p {
  font-family: var(--font-display);
  font-size: clamp(1rem, 1.9vw, 1.15rem);
  line-height: 1.55;
  color: var(--text);
  max-width: 58ch;
  margin: 0 0 16px;
}
.case-quote figcaption { display: flex; flex-direction: column; gap: 2px; }
.case-author { color: var(--accent-text); font-weight: 600; font-size: 0.9rem; }
.case-role { color: var(--faint); font-size: 0.82rem; }
.case-note { color: var(--faint); font-size: 0.78rem; margin: 16px 0 0; }

@media (max-width: 640px) { .research { padding: 26px 22px; } }

/* ---------------------------------------------------------------------------------------------------------------
   Insights — long-form prose. One measure, one rhythm, nothing decorative: these pages are read
   top to bottom, not scanned like the service pages.
   --------------------------------------------------------------------------------------------------------------- */
.prose { max-width: 720px; margin: 0 auto; }
.prose h2 {
  font-size: clamp(1.3rem, 2.6vw, 1.75rem);
  margin: 56px 0 18px;
  max-width: 26ch;
  scroll-margin-top: calc(var(--nav-h) + 20px);
}
.prose > h2:first-child { margin-top: 0; }
.prose p { color: var(--muted); margin: 0 0 20px; line-height: 1.75; }
.prose strong { color: var(--text); }
.prose a { color: var(--accent-text); }
.prose ul, .prose ol { color: var(--muted); margin: 0 0 22px; padding-left: 22px; line-height: 1.75; }
.prose li { margin-bottom: 10px; }
.prose li::marker { color: var(--accent); }
.prose blockquote.pull {
  position: relative;
  overflow: hidden;
  margin: 0 0 26px;
  padding: 24px 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: linear-gradient(170deg, var(--panel-2), var(--panel) 60%);
}
.prose blockquote.pull::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--gradient);
}
.prose blockquote.pull p:last-child { margin-bottom: 0; }
.prose .table-wrap { overflow-x: auto; margin: 0 0 26px; }
.prose table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
.prose th, .prose td {
  text-align: left;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.prose th { color: var(--text); font-weight: 600; border-bottom-color: var(--border-strong); }
.prose td { color: var(--muted); }

/* Article banner: the illustration is inlined SVG, so it follows the theme like .diagram does.
   The frame is the same hairline-on-soft-fill used everywhere else — no new vocabulary.

   The section's own 96px would stack on top of the hero's 72px and the drawing's internal
   breathing room, leaving the title floating a long way above its illustration. The banner reads
   as part of the hero, so here the gap is closed instead.

   Four numbers stack up between the last line of the lead and the drawn panel, and only counting
   them together explains the hole that was left: the hero's bottom padding, the lead's own
   bottom margin, this padding, and the space inside the drawing — which is real space, because
   the figure has a visible frame. 72 + 30 + 36 was too much before the drawing had even started;
   24 + 30 + 16 is the same rhythm without the gap. The space inside the drawing stays as it is:
   it belongs to the composition, and the three other articles share it. */
.article-hero { padding-bottom: 24px; }
.article-body { padding-top: 16px; }
/* Same width as .prose: the banner belongs to the article, and one wider than the column it
   introduces reads as a separate object sitting above the text. */
.article-art { max-width: 720px; margin: 0 auto 44px; }
.article-art svg {
  display: block; width: 100%; height: auto;
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  background: var(--bg-soft);
}

/* The browser's own [hidden] rule is `display: none`, and any author rule that sets `display`
   beats it. Both of these do, so setting el.hidden from JavaScript would change nothing unless
   they say it themselves: the filter would mark cards as hidden and leave them on screen, and the
   bar would show up for visitors without JavaScript. */
.insight-card[hidden], .filters[hidden] { display: none; }

/* Tags and filter: the same pill again, quieter. A tag is a label, not a call to action. */
.tag, .filter-btn {
  display: inline-flex; align-items: center;
  padding: 6px 14px; border-radius: 999px;
  border: 1px solid var(--border); background: transparent;
  color: var(--muted); font: inherit; font-size: 0.8rem; font-weight: 600;
  text-decoration: none; cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}
.tag:hover, .filter-btn:hover { border-color: var(--border-strong); color: var(--text); }
.filter-btn[aria-pressed="true"] {
  border-color: var(--accent); color: var(--accent-text);
  background: var(--tint-1);
}
.article-tags {
  max-width: 720px; margin: -22px auto 40px;
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
}
.tag-label, .filter-label { color: var(--faint); font-size: 0.85rem; margin-right: 4px; }
/* No top margin: the section already provides the space, and the two would stack into a hole
   between the hero and the first thing the reader can act on. */
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.filter-empty { color: var(--faint); margin-top: 32px; }
.tag-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
/* Inside a card the whole tile is the link, so the tags must not look clickable on their own. */
.insight-card .tag { pointer-events: none; }

/* Share bar: the same pill as .btn-ghost, one size down. Nothing new invented, and no third-party
   widget — the networks' own buttons ship a tracker with them. */
.share {
  max-width: 720px; margin: 44px auto 0; padding-top: 26px;
  border-top: 1px solid var(--border);
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
}
.share-label { color: var(--faint); font-size: 0.85rem; margin-right: 4px; }
.share-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 16px; border-radius: 999px;
  border: 1px solid var(--border-strong); background: transparent;
  color: var(--text); font: inherit; font-size: 0.85rem; font-weight: 600;
  text-decoration: none; cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease;
}
.share-btn:hover { background: rgba(127, 127, 127, 0.12); transform: translateY(-2px); }
.share-btn svg { width: 15px; height: 15px; flex: none; }
.share-btn[data-copied] { color: var(--accent-text); border-color: var(--accent); }

.article-meta {
  max-width: 720px; margin: 0 auto 40px;
  padding-bottom: 22px; border-bottom: 1px solid var(--border);
  color: var(--faint); font-size: 0.88rem;
}
.article-meta strong { color: var(--text); font-weight: 600; }
/* Both notices borrow the .fact treatment: hairline, soft fill, small text. Nothing new invented. */
.article-disclaimer, .article-draft {
  max-width: 720px;
  padding: 18px 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.02);
  color: var(--faint);
  font-size: 0.85rem;
}
.article-disclaimer { margin: 48px auto 0; }
.article-draft { margin: 0 auto 32px; border-color: var(--border-strong); color: var(--muted); }

/* Same recipe as .card, minus the icon: the index has to look like the rest of the site. */
/* Two columns, dropping to one when there is no room for two. No breakpoint is written here: the
   column count comes from the card's own minimum width, so it stays right the day the card grows.
   The cap at two is the container: it is --maxw minus its 48px of padding, 1.072px, and a third
   360px track would need 1.120px. There is no max-width of its own here — one used to be, set to
   1.000px, and since a grid does not centre itself it left 72px of dead space on the right while
   the filter bar above spanned the full width. The two right edges did not line up.
   If --maxw ever passes 1.168px a third column appears: that is the line to watch.

   auto-fill, not auto-fit: auto-fit would collapse the empty track, so a single card — the last
   article left after filtering, or the first one ever published — would suddenly stretch to
   double width. Keeping the track reserved makes the grid stable while the filter runs. */
.insight-list {
  display: grid; gap: 20px; margin-top: 48px;
  grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
}
.insight-card {
  display: block;
  position: relative;
  overflow: hidden;
  background: linear-gradient(170deg, var(--panel-2), var(--panel) 60%);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 30px 28px;
  text-decoration: none;
  color: inherit;
  transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
}
.insight-card::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--gradient);
  opacity: 0;
  transition: opacity 0.22s ease;
}
.insight-card:hover {
  transform: translateY(-5px);
  border-color: var(--border-strong);
  box-shadow: var(--shadow);
}
.insight-card:hover::before { opacity: 1; }
/* The thumbnail bleeds to the card's edges: the card padding would otherwise frame it twice,
   once with its own border and once with the drawing's enclosure. */
.insight-thumb {
  display: block; margin: -30px -28px 22px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
}
.insight-thumb svg { display: block; width: 100%; height: auto; }
.insight-card .kicker { margin-bottom: 10px; }
.insight-card h3 { font-size: 1.18rem; font-weight: 700; margin: 0 0 10px; }
.insight-card p { color: var(--muted); font-size: 0.94rem; margin: 0; }

@media (max-width: 640px) {
  .prose h2 { margin-top: 42px; }
  .article-disclaimer, .article-draft { padding: 16px 18px; }
}

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

/* Lo switch di lingua non compare qui: le sue regole stanno in _src/home.html e valgono per
   tutte le pagine, home compresa. Restare in un posto solo è il punto. */

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
      // threshold must stay 0. A ratio threshold is a share of the *target*, so an element taller
      // than the viewport can never reach it: a 6.000px article body in an 800px window tops out
      // around 12%, and a longer one in a shorter window never crosses 8% at all — the block would
      // stay invisible for good. The negative bottom margin is what delays the reveal instead, and
      // it works the same whatever the element's height.
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
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

  // ---------------------------------------------------------------------------------------------------------------
  //  i n s i g h t s   f i l t e r
  // ---------------------------------------------------------------------------------------------------------------

  function _initFilters() {
    var bar = document.querySelector('[data-filters]');
    if (!bar) return;
    var buttons = [].slice.call(bar.querySelectorAll('[data-tag]'));
    var cards = [].slice.call(document.querySelectorAll('.insight-card[data-tags]'));
    var empty = document.querySelector('[data-filter-empty]');

    // The bar ships hidden and is revealed here: without JavaScript it would be a row of buttons
    // that do nothing, and every article is visible anyway.
    bar.hidden = false;

    function _apply(tag) {
      var shown = 0;
      cards.forEach(function (card) {
        var match = !tag || card.getAttribute('data-tags').split(' ').indexOf(tag) !== -1;
        card.hidden = !match;
        if (match) shown++;
      });
      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', button.getAttribute('data-tag') === tag ? 'true' : 'false');
      });
      if (empty) empty.hidden = shown > 0;
      // Keep the address bar in step, so a filtered view can be sent to somebody.
      var url = location.pathname + (tag ? '?tag=' + encodeURIComponent(tag) : '');
      history.replaceState(null, '', url);
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () { _apply(button.getAttribute('data-tag')); });
    });

    var wanted = new URLSearchParams(location.search).get('tag');
    if (wanted && buttons.some(function (b) { return b.getAttribute('data-tag') === wanted; })) {
      _apply(wanted);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  //  s h a r e
  // ---------------------------------------------------------------------------------------------------------------

  function _copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    // Older browsers and pages served over plain http: fall back to a throwaway field.
    return new Promise(function (resolve, reject) {
      var field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(field);
      ok ? resolve() : reject();
    });
  }

  function _initShare() {
    var button = document.querySelector('[data-share-copy]');
    if (!button) return;
    var label = button.querySelector('span');
    var original = label.textContent;
    button.addEventListener('click', function () {
      _copyText(button.getAttribute('data-share-copy')).then(function () {
        label.textContent = button.getAttribute('data-share-done');
        button.setAttribute('data-copied', '');
        setTimeout(function () {
          label.textContent = original;
          button.removeAttribute('data-copied');
        }, 2200);
      }).catch(function () { /* nothing to say: the address bar still has the URL */ });
    });
  }

  function _init() {
    _initTheme();
    _initMenu();
    _initReveal();
    _initOrbit();
    _initFilters();
    _initShare();
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
    """Return the homepage <style> block verbatim, so inner pages share one design system.

    This used to rewrite the language-switch selectors on the way out, because the homepage styled
    <button> elements while the inner pages use a <span> plus an <a>. The rewrite only touched
    assets/site.css — and the homepage keeps its own inline <style> — so the two drifted the moment
    the homepage lost its buttons: the switch went unstyled on the home page and nowhere else, and
    no check could see it.

    Now home.html styles the elements that actually exist, and this function copies the block
    untouched. Nothing to keep in sync means nothing that can drift.
    """
    html = INDEX.read_text(encoding="utf-8")
    match = re.search(r"<style>(.*?)</style>", html, re.S)
    if not match:
        raise SystemExit("_src/home.html: blocco <style> non trovato — il CSS condiviso non si può costruire.")
    css = match.group(1)

    if ".lang-switch button" in css:
        raise SystemExit("_src/home.html: il CSS stilizza ancora '.lang-switch button', ma lo switch di "
                         "lingua non ha più <button>: la regola non si applica a niente e sulla home il "
                         "pulsante resta nudo. Usa '.lang-switch a, .lang-switch .current'.")
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


# -----------------------------------------------------------------------------------------------------------------
#  s h a r e   b a r
# -----------------------------------------------------------------------------------------------------------------

# Filled glyphs, unlike the outlined card icons: a network mark drawn in hairlines is unreadable at
# 16px. Simplified on purpose — these stand in for the marks, they are not the marks.
SHARE_ICONS = {
    "linkedin": '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-.95'
                ' 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.75V21h-4v-5.6c0-1.34-.03-3.06-1.9-3.06-1.9 0-2.2'
                ' 1.46-2.2 2.96V21h-4z"/>',
    "x": '<path d="M17.3 3h3.1l-6.8 7.75L21.6 21h-6.3l-4.9-6.4L4.8 21H1.7l7.25-8.3L1.9 3h6.45l4.45 5.9Zm-1.1'
         ' 16.1h1.7L7.9 4.8H6.05Z"/>',
    "mail": '<path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 8.1L20 7.2V6.6'
            'L12 12 4 6.6v.6Z"/>',
    "link": '<path d="M10.6 13.4a1 1 0 0 1 0-1.4l1.4-1.4a1 1 0 0 1 1.4 1.4l-1.4 1.4a1 1 0 0 1-1.4 0Zm-3.3 5.4'
            'a4.5 4.5 0 0 1 0-6.4l2.6-2.6 1.4 1.4-2.6 2.6a2.5 2.5 0 0 0 3.5 3.5l2.6-2.6 1.4 1.4-2.6 2.6a4.5 4.5'
            ' 0 0 1-6.3 0Zm4-11.2 2.6-2.6a4.5 4.5 0 0 1 6.4 6.4l-2.6 2.6-1.4-1.4 2.6-2.6a2.5 2.5 0 0 0-3.5-3.5'
            'l-2.6 2.6Z"/>',
}


def _share_icon(name):
    return (f'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
            f'{SHARE_ICONS[name]}</svg>')


# -----------------------------------------------------------------------------------------------------------------
#  t a g s   a n d   f i l t e r
# -----------------------------------------------------------------------------------------------------------------

def _article_tags(article):
    """The article's tags, checked. An untagged article vanishes the moment somebody filters."""
    tags = article.get("tags") or []
    unknown = [t for t in tags if t not in TAGS]
    if unknown:
        raise SystemExit(
            f"l'articolo «{article['key']}» ha tag sconosciuti: {', '.join(unknown)}\n"
            f"  quelli ammessi sono: {', '.join(TAGS)}"
        )
    if not tags:
        raise SystemExit(
            f"l'articolo «{article['key']}» non ha tag. Scegline almeno uno fra: {', '.join(TAGS)}\n"
            "  senza tag l'articolo sparisce appena qualcuno usa il filtro su /insights"
        )
    return tags


def _tags_html(lang, article):
    """The tags under an article, each linking to the index already filtered on it."""
    index = "/" + INSIGHTS_INDEX[lang]["slug"] + "/"
    chips = "".join(
        f'<a class="tag" href="{index}?tag={tag}">{TAGS[tag][lang]}</a>'
        for tag in _article_tags(article)
    )
    return (f'<p class="article-tags"><span class="tag-label">{CHROME[lang]["tags_label"]}</span>'
            f'{chips}</p>')


def _filter_html(lang):
    """The filter bar on the index.

    Buttons, not links to one page per tag: four extra URLs holding the same articles would split
    the ranking and need their own place in the sitemap for no gain. The querystring is written
    back with replaceState, so a filtered view is still something you can send to somebody.

    Without JavaScript the bar simply is not there and every article stays visible.
    """
    chrome = CHROME[lang]
    used = sorted({tag for article in ARTICLES for tag in _article_tags(article)},
                  key=lambda t: list(TAGS).index(t))
    if not used:
        return ""
    buttons = "".join(f'<button class="filter-btn" type="button" data-tag="{tag}">'
                      f'{TAGS[tag][lang]}</button>' for tag in used)
    return f"""        <div class="filters" data-filters hidden>
          <span class="filter-label">{chrome['filter_label']}</span>
          <button class="filter-btn" type="button" data-tag="" aria-pressed="true">{chrome['filter_all']}</button>
          {buttons}
        </div>
        <p class="filter-empty" data-filter-empty hidden>{chrome['filter_empty']}</p>
"""


def _article_og_image(article, lang):
    """The card make_og_cards.py drew for this article, by convention rather than by hand.

    Wiring the filename into content.py would be one more thing to forget, and forgetting it is
    silent: the article would ship with the generic card and look like every other page in a feed.
    An article with an illustration therefore must have its card, and the build says so if it does
    not — run `python3 _src/make_og_cards.py`.
    """
    if article["key"] not in article_art.ARTICLE_ART:
        return "og-card.png"
    name = f"og-{article['key']}-{lang}.jpg"
    if not (ROOT / "assets" / name).exists():
        raise SystemExit(
            f"manca la card social dell'articolo «{article['key']}» ({lang}): assets/{name}\n"
            "  generala con: python3 _src/make_og_cards.py"
        )
    return name


def _share_html(lang, data, title):
    """The same four buttons under every article, in both languages.

    Built from `url` and `title` at build time, so nothing has to run in the browser except the
    copy button. No network SDK is loaded: an article that argues against sending client data to
    other people's servers cannot ship a tracker from LinkedIn to render its own share button.
    """
    chrome = CHROME[lang]
    url = _url(data["slug"])
    # The <title> carries the company suffix for the browser tab and for search. In a shared post
    # it is noise: the card underneath already says who wrote this.
    subject = _strip_tags(title)
    for suffix in (" — G&G Technologies", " — G&amp;G Technologies"):
        if subject.endswith(suffix):
            subject = subject[: -len(suffix)]
    quoted_url = _quote(url, safe="")
    quoted_title = _quote(subject, safe="")
    targets = [
        ("linkedin", "LinkedIn", f"https://www.linkedin.com/sharing/share-offsite/?url={quoted_url}",
         f"{chrome['share_on']} LinkedIn"),
        ("x", "X", f"https://x.com/intent/post?url={quoted_url}&text={quoted_title}",
         f"{chrome['share_on']} X"),
        ("mail", "Email", f"mailto:?subject={quoted_title}&body={quoted_url}", chrome["share_mail"]),
    ]
    # The query separators go through _esc: this is an HTML attribute, not a URL typed into a
    # browser, and check_site.py fails the page for a bare ampersand.
    links = []
    for icon, name, href, label in targets:
        window = ' target="_blank" rel="noopener"' if href.startswith("https") else ""
        links.append(
            f'<a class="share-btn" href="{_esc(href)}" title="{_esc(label)}" '
            f'aria-label="{_esc(label)}"{window}>{_share_icon(icon)}<span>{name}</span></a>'
        )
    return f"""        <div class="share">
          <span class="share-label">{chrome['share_label']}</span>
          {''.join(links)}
          <button class="share-btn" type="button" data-share-copy="{url}"
                  data-share-done="{_esc(chrome['share_copied'])}"
                  title="{_esc(chrome['share_copy'])}" aria-label="{_esc(chrome['share_copy'])}">
            {_share_icon('link')}<span>{chrome['share_copy']}</span></button>
        </div>
"""


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


# -----------------------------------------------------------------------------------------------------------------
#  a r t i c l e   i l l u s t r a t i o n
# -----------------------------------------------------------------------------------------------------------------

# The banner uses CSS variables for every colour, so it inverts with the theme switch. An <img> to
# an external SVG could not: the file would carry the dark palette into the light theme.
ART_PAINT = {
    article_art.EDGE: "url(#artEdge)",
    article_art.PANEL: "url(#artPanel)",
    article_art.GLOW: "url(#artGlow)",
    article_art.ROW: "var(--muted)",
    article_art.PACKET: "url(#artEdge)",
    article_art.MARK: "url(#artEdge)",
}


def _art_shape_svg(shape):
    """One primitive from article_art, as SVG."""
    role, paint = shape["role"], ART_PAINT[shape["role"]]
    if role == article_art.GLOW:
        return (f'<ellipse cx="{shape["cx"]:.0f}" cy="{shape["cy"]:.0f}" rx="{shape["rx"]:.0f}" '
                f'ry="{shape["ry"]:.0f}" fill="{paint}"/>')
    if role == article_art.PANEL:
        return (f'<rect x="{shape["x"]:.0f}" y="{shape["y"]:.0f}" width="{shape["w"]:.0f}" '
                f'height="{shape["h"]:.0f}" rx="{shape["r"]:.0f}" fill="{paint}" '
                f'stroke="var(--border)"/>')
    if role == article_art.EDGE:
        # A rectangle, not a stroked line, and the reason is a rule of SVG that costs an hour to
        # find: a gradient in objectBoundingBox units is not painted at all when the box has zero
        # width or height. A horizontal or vertical line has exactly that, so every 2px filament
        # and every boundary came out invisible — on the published articles too. A rect has both
        # dimensions, so the same line keeps the accent gradient it is supposed to have.
        x1, y1, x2, y2 = shape["x1"], shape["y1"], shape["x2"], shape["y2"]
        thin = 2.0
        w, h = abs(x2 - x1), abs(y2 - y1)
        # The stroke used to be centred on the path; the rect has to be shifted by half its
        # thickness to sit where the line sat.
        x = min(x1, x2) - (thin / 2 if w < thin else 0)
        y = min(y1, y2) - (thin / 2 if h < thin else 0)
        return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{max(w, thin):.1f}" '
                f'height="{max(h, thin):.1f}" rx="1" fill="{paint}"/>')
    if role in (article_art.ROW, article_art.MARK):
        return (f'<rect x="{shape["x"]:.0f}" y="{shape["y"]:.0f}" width="{shape["w"]:.0f}" '
                f'height="{shape["h"]:.0f}" rx="4" fill="{paint}" '
                f'opacity="{shape["opacity"]:.2f}"/>')
    return (f'<rect x="{shape["x"]:.0f}" y="{shape["y"]:.0f}" width="{shape["size"]:.1f}" '
            f'height="{shape["size"]:.1f}" rx="2" fill="{paint}" '
            f'opacity="{shape["opacity"]:.2f}"/>')


def _art_gradients():
    """The illustration palette, defined once per page and referenced by every drawing on it.

    The index shows one thumbnail per card: three gradients repeated per card would mean duplicate
    ids, which is invalid and which check_site.py refuses. Same trick as _icon_gradient().
    """
    return (
        '<svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs>'
        '<linearGradient id="artEdge" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0" stop-color="var(--accent)"/>'
        '<stop offset="1" stop-color="var(--accent-strong)"/></linearGradient>'
        '<linearGradient id="artPanel" x1="0" y1="0" x2="0.4" y2="1">'
        '<stop offset="0" stop-color="var(--panel-2)"/>'
        '<stop offset="0.6" stop-color="var(--panel)"/></linearGradient>'
        '<radialGradient id="artGlow" cx="0.5" cy="0.5" r="0.5">'
        '<stop offset="0" stop-color="var(--glow-a)"/>'
        '<stop offset="1" stop-color="var(--glow-a)" stop-opacity="0"/></radialGradient>'
        '</defs></svg>'
    )


def _article_art_html(article, lang):
    """The banner above the article, or nothing when the article has no illustration yet."""
    draw = article_art.ARTICLE_ART.get(article["key"])
    words = article[lang].get("art")
    if not draw:
        return ""
    if not words:
        raise SystemExit(
            f"l'articolo \u00ab{article['key']}\u00bb ha un'illustrazione ma manca \u00abart\u00bb in {lang}: "
            "servono \u00abtitle\u00bb e \u00abdesc\u00bb, altrimenti il banner \u00e8 muto per chi usa uno screen reader"
        )
    ident = re.sub(r"[^a-z0-9]", "", article["key"])
    body = "".join(_art_shape_svg(s) for s in draw())
    return f"""        <figure class="article-art reveal">
          <svg viewBox="0 0 {article_art.BANNER_W} {article_art.BANNER_H}" role="img"
               aria-labelledby="{ident}T {ident}D">
            <title id="{ident}T">{_esc(words['title'])}</title>
            <desc id="{ident}D">{_esc(words['desc'])}</desc>
            {body}
          </svg>
        </figure>
"""


def _insight_thumb_html(article):
    """The same drawing at card size, on the index.

    Decorative here, so aria-hidden: the card already carries the title and the summary as text,
    and a screen reader reading the illustration again would only add noise.

    The geometry is asked for the card's own proportions rather than scaled down: a squashed
    version would turn the fragments into lozenges and read as a different picture.
    """
    draw = article_art.ARTICLE_ART.get(article["key"])
    if not draw:
        return ""
    w, h = article_art.THUMB_W, article_art.THUMB_H
    body = "".join(_art_shape_svg(s) for s in draw(w, h))
    return (f'<span class="insight-thumb"><svg viewBox="0 0 {w} {h}" aria-hidden="true" '
            f'focusable="false">{body}</svg></span>')


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


def _research_html(data):
    """The one thing on this site an outsider can verify: a peer-reviewed paper with a DOI.

    Sixteen pages describe a method and none of them used to carry a measured result. This panel
    exists to close part of that gap, so it is deliberately plain: the citation, the identifier and
    the link. Identifiers come from STUDY, never from the copy, so the text and the structured data
    cannot drift apart.
    """
    research = data.get("research")
    if not research:
        return ""
    paragraphs = "".join(f"<p>{p}</p>" for p in research["body"])
    return f"""        <aside class="research reveal">
          <div class="kicker">{research['kicker']}</div>
          <h3>{research['heading']}</h3>
          {paragraphs}
          <p class="research-cite">{research['citation']}</p>
          <p class="research-link">
            <a href="{STUDY['url']}" rel="noopener">{research['link']} — DOI {STUDY['doi']} &rarr;</a>
          </p>
          <p class="research-note">{research['note']}</p>
        </aside>"""


def _case_html(data):
    """Checkable proof of what the page has just described, named so a reader can go and verify.

    Two kinds qualify. A named client, what was built, and — when there is one — a quote from the
    person who signed it off. Or something of ours a stranger can inspect on their own: the product,
    with its trial and its public release history.

    The rule this component exists to serve: the site describes a method on sixteen pages and for
    a long time named nobody. A case says who, so a reader can check. It follows that nothing here
    may be softened into an anonymous "a leading manufacturer": either the subject is named, or the
    case does not go up. Most of our work sits under confidentiality agreements, which is why the
    second kind matters — it is the proof those agreements cannot take away.
    """
    case = data.get("case")
    if not case:
        return ""
    paragraphs = "".join(f"<p>{p}</p>" for p in case["body"])
    quote = ""
    if case.get("quote"):
        quote = f"""
          <figure class="case-quote">
            <blockquote><p>{case['quote']}</p></blockquote>
            <figcaption>
              <span class="case-author">{_esc(case['author'])}</span>
              <span class="case-role">{_esc(case['role'])}</span>
            </figcaption>
          </figure>
          <p class="case-note">{case['note']}</p>"""
    return f"""        <aside class="research case reveal">
          <div class="kicker">{case['kicker']}</div>
          <h3>{case['heading']}</h3>
          {paragraphs}{quote}
        </aside>"""


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


def _mailto(lang, data):
    """The page's own subject line when it declares one, otherwise the generic address.

    A reader who writes from the foot of the on-premise page has already told us what they want to
    talk about; carrying that into the subject means the request arrives qualified instead of as
    another "Richiesta informazioni". Only the closing call to action uses this — the navigation
    button is clicked from anywhere, so a page-specific subject there would be a guess.
    """
    subject = data.get("mail_subject")
    if not subject:
        return CHROME[lang]["mailto"]
    return f'mailto:info@ggtechnologies.sm?subject={_quote(subject, safe="")}'


def _closing_ctas(lang, data):
    """The closing band leads with the page's own action, then the fallbacks."""
    buttons = []
    if data.get("cta_primary"):
        label, href = data["cta_primary"]
        buttons.append(f'<a class="btn btn-primary" href="{href}">{label}</a>')
        buttons.append(f'<a class="btn btn-ghost" href="{_mailto(lang, data)}">'
                       f'{"Scrivici" if lang == "it" else "Email us"}</a>')
    else:
        buttons.append(f'<a class="btn btn-primary" href="{_mailto(lang, data)}">'
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
#  m a r k d o w n
# -----------------------------------------------------------------------------------------------------------------

# Articles are written in Markdown under _src/insights/, one file per language, because prose that
# long is unreadable as Python strings. Only the subset the articles actually use is supported: a
# general Markdown library would be a dependency this project does not have and does not want.
# Anything unsupported should fail loudly rather than silently render as literal characters.

_ORDERED = re.compile(r"^\d+\. ")

_MD_INLINE = (
    (re.compile(r"\*\*(.+?)\*\*"), r"<strong>\1</strong>"),
    (re.compile(r"(?<![\w*])\*([^*\n]+?)\*(?![\w*])"), r"<em>\1</em>"),
    (re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)"), r'<a href="\2" rel="noopener">\1</a>'),
)


def _md_inline(text):
    """Bold, italic and links. Ampersands are encoded first, so the copy can write "G&G" plainly."""
    out = text.strip()
    out = re.sub(r"&(?!amp;|lt;|gt;|quot;|#|nbsp;|rarr;|reg;)", "&amp;", out)
    for pattern, replacement in _MD_INLINE:
        out = pattern.sub(replacement, out)
    return out


def _md_table(rows):
    """A pipe table. The second row is the alignment separator and carries no content."""
    header = [_md_inline(c) for c in rows[0].strip("|").split("|")]
    body = []
    for row in rows[2:]:
        body.append([_md_inline(c) for c in row.strip("|").split("|")])
    head = "".join(f"<th>{c}</th>" for c in header)
    cells = "\n".join("            <tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in body)
    return ('          <div class="table-wrap">\n            <table>\n'
            f"            <thead><tr>{head}</tr></thead>\n"
            f"            <tbody>\n{cells}\n            </tbody>\n"
            "            </table>\n          </div>")


def _markdown_html(source, path):
    """Render an article body. Supported: ## headings, paragraphs, - and 1. lists, > quotes,
    | tables |. Everything else raises, so a new construct cannot slip through half-rendered."""
    blocks, out = [], []
    for raw in source.split("\n\n"):
        if raw.strip():
            blocks.append(raw.strip("\n"))

    for block in blocks:
        lines = [ln for ln in block.split("\n") if ln.strip()]
        first = lines[0]

        if first.startswith("## "):
            if len(lines) > 1:
                raise SystemExit(f"{path}: un titolo deve stare da solo nel suo blocco — «{first}»")
            out.append(f"          <h2>{_md_inline(first[3:])}</h2>")
        elif first.startswith("#"):
            raise SystemExit(f"{path}: usa solo «##». L'h1 della pagina viene da content.py — «{first}»")
        elif first.startswith("|"):
            if len(lines) < 3:
                raise SystemExit(f"{path}: tabella senza intestazione o senza righe — «{first}»")
            out.append(_md_table(lines))
        elif first.startswith("> "):
            quoted = "".join(f"<p>{_md_inline(ln[2:])}</p>" for ln in lines if ln.startswith("> "))
            out.append(f'          <blockquote class="pull">{quoted}</blockquote>')
        elif first.startswith("- "):
            items = "".join(f"<li>{_md_inline(ln[2:])}</li>" for ln in lines)
            out.append(f"          <ul>{items}</ul>")
        elif _ORDERED.match(first):
            items = "".join(f"<li>{_md_inline(_ORDERED.sub('', ln))}</li>" for ln in lines)
            out.append(f"          <ol>{items}</ol>")
        else:
            out.append(f"          <p>{_md_inline(' '.join(lines))}</p>")

    return "\n".join(out)


def _article_body(key, lang):
    path = SRC / "insights" / f"{key}.{lang}.md"
    if not path.exists():
        raise SystemExit(f"manca il testo dell'articolo: {path}")
    return _markdown_html(path.read_text(encoding="utf-8"), path.name)


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
    elif page["schema"] == "AboutPage":
        # Not a Service: this page sells nothing, it describes who is behind the rest. The main
        # entity is the company itself, declared once in the Organization block and referenced here
        # by id so the two can never drift.
        blocks.append({
            "@context": "https://schema.org",
            "@type": "AboutPage",
            "name": _strip_tags(data["short"]),
            "url": url,
            "description": data["description"],
            "inLanguage": lang,
            "mainEntity": {"@id": org_id},
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

    if data.get("research"):
        # The paper is the one claim on this site with an external identifier, so it gets its own
        # node keyed on the DOI rather than on our URL. Values come from STUDY: if the citation in
        # the copy and this block ever disagree, the reader who checks the DOI catches us.
        blocks.append({
            "@context": "https://schema.org",
            "@type": "ScholarlyArticle",
            "@id": STUDY["url"],
            "headline": STUDY["headline"],
            "name": STUDY["headline"],
            "url": STUDY["url"],
            "inLanguage": "en",
            "datePublished": STUDY["published"],
            "author": [{"@type": "Person", "name": name} for name in STUDY["authors"]],
            "identifier": [
                {"@type": "PropertyValue", "propertyID": "DOI", "value": STUDY["doi"]},
            ],
            "isPartOf": {
                "@type": "PublicationIssue",
                "issueNumber": STUDY["issue"],
                "isPartOf": {
                    "@type": "PublicationVolume",
                    "volumeNumber": STUDY["volume"],
                    "isPartOf": {
                        "@type": "Periodical",
                        "name": STUDY["journal"],
                        "publisher": {"@type": "Organization", "name": STUDY["publisher"]},
                    },
                },
            },
            "pagination": STUDY["pages"],
            "isAccessibleForFree": True,
            "sourceOrganization": {"@id": org_id},
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
{_photo_html(data)}{_research_html(data)}{_case_html(data)}
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
  <link rel="stylesheet" href="{prefix}assets/{ASSET_CSS}">
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

  <script src="{prefix}assets/{ASSET_JS}" defer></script>
</body>
</html>
"""


# -----------------------------------------------------------------------------------------------------------------
#  i n s i g h t s
# -----------------------------------------------------------------------------------------------------------------

DRAFT_NOTE = {
    "it": "Bozza. Questo articolo non è ancora stato licenziato per la pubblicazione: non è indicizzato "
          "e non compare nella sitemap.",
    "en": "Draft. This article has not been signed off for publication: it is not indexed and does not "
          "appear in the sitemap.",
}

MONTHS = {
    "it": ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
           "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
    "en": ["January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December"],
}


def _long_date(lang, iso):
    year, month, day = (int(part) for part in iso.split("-"))
    name = MONTHS[lang][month - 1]
    return f"{day} {name} {year}" if lang == "it" else f"{day} {name} {year}"


def _reading_minutes(key, lang):
    """Rounded up, at 200 words a minute. Approximate by nature, so it is never presented as a
    measurement — the index says "minuti di lettura", not a promise."""
    words = len((SRC / "insights" / f"{key}.{lang}.md").read_text(encoding="utf-8").split())
    return max(1, round(words / 200))


def _article_crumbs(lang, data):
    chrome = CHROME[lang]
    home = "/" if lang == "it" else "/en/"
    index = "/" + INSIGHTS_INDEX[lang]["slug"] + "/"
    items = (f'<li><a href="{home}">{chrome["breadcrumb_home"]}</a></li>'
             f'<li><a href="{index}">{INSIGHTS_INDEX[lang]["short"]}</a></li>'
             f'<li aria-current="page">{_esc(data["short"])}</li>')
    label = "Percorso" if lang == "it" else "Breadcrumb"
    return f'<nav class="breadcrumb" aria-label="{label}"><ol>{items}</ol></nav>'


def _article_json_ld(lang, article, data, url):
    chrome = CHROME[lang]
    home = SITE + ("/" if lang == "it" else "/en/")
    org_id = f"{SITE}/#organization"
    index_url = _url(INSIGHTS_INDEX[lang]["slug"])

    return json.dumps([
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": chrome["breadcrumb_home"], "item": home},
                {"@type": "ListItem", "position": 2, "name": INSIGHTS_INDEX[lang]["short"],
                 "item": index_url},
                {"@type": "ListItem", "position": 3, "name": _strip_tags(data["short"]), "item": url},
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": _strip_tags(data["h1"]),
            "name": _strip_tags(data["short"]),
            "url": url,
            "description": data["description"],
            "inLanguage": lang,
            "datePublished": article["date"],
            "author": {"@type": "Person", "name": article["author"]},
            "publisher": {"@id": org_id},
            "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        },
    ], ensure_ascii=False, indent=2)


def _render_article(lang, article):
    data = article[lang]
    other_lang = "en" if lang == "it" else "it"
    url = _url(data["slug"])
    other_url = _url(article[other_lang]["slug"])
    it_url = _url(article["it"]["slug"])
    chrome = CHROME[lang]
    prefix = "../" * (data["slug"].count("/") + 1)
    draft = article["stato"] != "pronto"

    banner = (f'      <p class="article-draft">{DRAFT_NOTE[lang]}</p>\n' if draft else "")
    minutes = _reading_minutes(article["key"], lang)
    og_image = data.get("og_image") or _article_og_image(article, lang)

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{_esc(data['title'])}</title>
  <meta name="description" content="{_esc(data['description'])}">
  <meta name="author" content="{_esc(article['author'])}">
  <meta name="robots" content="{'noindex, nofollow' if draft else 'index, follow, max-image-preview:large'}">
  <meta name="theme-color" content="#0d1220">
  <link rel="canonical" href="{url}">
  <link rel="alternate" hreflang="it" href="{it_url}">
  <link rel="alternate" hreflang="en" href="{_url(article['en']['slug'])}">
  <link rel="alternate" hreflang="x-default" href="{it_url}">
  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="G&amp;G Technologies">
  <meta property="og:title" content="{_esc(data['title'])}">
  <meta property="og:description" content="{_esc(data['description'])}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{SITE}/assets/{og_image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="{LOCALE[lang]}">
  <meta property="og:locale:alternate" content="{LOCALE[other_lang]}">
  <meta property="article:published_time" content="{article['date']}">
  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{_esc(data['title'])}">
  <meta name="twitter:description" content="{_esc(data['description'])}">
  <meta name="twitter:image" content="{SITE}/assets/{og_image}">
  <!-- Favicon -->
  <link rel="apple-touch-icon" sizes="180x180" href="{prefix}assets/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="{prefix}assets/favicon-32.png">
  <script>
    {BOOTSTRAP_JS}
  </script>
  <link rel="stylesheet" href="{prefix}assets/{ASSET_CSS}">
  <script type="application/ld+json">
{_article_json_ld(lang, article, data, url)}
  </script>
</head>
<body>
{_icon_gradient()}
{_art_gradients()}
{_header(lang, other_url)}

  <main id="main">
    <!-- article-hero on top of the shared page-hero: on every other page the hero ends the
         screen, here it is followed by the banner, and the two blocks have to read as one. -->
    <section class="hero page-hero article-hero">
      <div class="hero-bg" aria-hidden="true">
        <div class="glow glow-1"></div>
        <div class="glow glow-2"></div>
      </div>

      <div class="container">
        <div class="prose">
          {_article_crumbs(lang, data)}
          <div class="kicker">{data['kicker']}</div>
          <h1>{data['h1']}</h1>
          <p class="hero-sub">{data['lead']}</p>
        </div>
      </div>
    </section>

    <section class="article-body">
      <div class="container">
{_article_art_html(article, lang)}{banner}        <p class="article-meta">
          <strong>{_esc(article['author'])}</strong> · {_long_date(lang, article['date'])} ·
          {minutes} {INSIGHTS_INDEX[lang]['reading']}<br>
          {data['role']}
        </p>
        {_tags_html(lang, article)}
        <!-- No .reveal here on purpose: this is the text the reader came for, and fading in a
             whole article as one block means the page looks empty until it fills the screen.
             The animation belongs to cards and to the banner, not to the body copy. -->
        <div class="prose">
{_article_body(article['key'], lang)}
        </div>
{_share_html(lang, data, data['title'])}        <p class="article-disclaimer">{data['disclaimer']}</p>
      </div>
    </section>

    <section class="tinted">
      <div class="container">
        <div class="reveal">
          <h2>{chrome['related_title']}</h2>
        </div>
{_related_html(lang, data)}
      </div>
    </section>

    <section class="cta-band">
      <div class="container reveal">
        <h2>{data['cta_title']}</h2>
        <p class="section-intro">{data['cta_text']}</p>
        <div class="hero-ctas">
          <a class="btn btn-primary" href="{chrome['mailto']}">{chrome['nav_cta']}</a>
        </div>
      </div>
    </section>
  </main>

{_footer(lang)}

  <script src="{prefix}assets/{ASSET_JS}" defer></script>
</body>
</html>
"""


def _render_insights_index(lang):
    data = INSIGHTS_INDEX[lang]
    other_lang = "en" if lang == "it" else "it"
    url = _url(data["slug"])
    other_url = _url(INSIGHTS_INDEX[other_lang]["slug"])
    it_url = _url(INSIGHTS_INDEX["it"]["slug"])
    chrome = CHROME[lang]
    prefix = "../" * (data["slug"].count("/") + 1)
    home = "/" if lang == "it" else "/en/"

    # Drafts are listed too, so the index is useful while working locally, but they say so.
    cards = []
    for article in ARTICLES:
        entry = article[lang]
        mark = "" if article["stato"] == "pronto" else (
            " · bozza" if lang == "it" else " · draft")
        tags = _article_tags(article)
        chips = "".join(f'<span class="tag">{TAGS[t][lang]}</span>' for t in tags)
        cards.append(f"""          <a class="insight-card reveal" href="/{entry['slug']}/"
             data-tags="{' '.join(tags)}">
            {_insight_thumb_html(article)}
            <div class="kicker">{entry['kicker']}{mark}</div>
            <h3>{_esc(entry['short'])}</h3>
            <p>{entry['description']}</p>
            <span class="tag-row">{chips}</span>
          </a>""")
    listing = (_filter_html(lang) + '        <div class="insight-list">\n' + "\n".join(cards)
               + "\n        </div>"
               if cards else f'        <p class="section-intro">{data["empty"]}</p>')

    crumbs = (f'<li><a href="{home}">{chrome["breadcrumb_home"]}</a></li>'
              f'<li aria-current="page">{_esc(data["short"])}</li>')
    label = "Percorso" if lang == "it" else "Breadcrumb"

    json_ld = json.dumps([{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": _strip_tags(data["short"]),
        "url": url,
        "description": data["description"],
        "inLanguage": lang,
        "isPartOf": {"@id": f"{SITE}/#organization"},
    }], ensure_ascii=False, indent=2)

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{_esc(data['title'])}</title>
  <meta name="description" content="{_esc(data['description'])}">
  <meta name="author" content="G&amp;G Technologies Srl">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#0d1220">
  <link rel="canonical" href="{url}">
  <link rel="alternate" hreflang="it" href="{it_url}">
  <link rel="alternate" hreflang="en" href="{_url(INSIGHTS_INDEX['en']['slug'])}">
  <link rel="alternate" hreflang="x-default" href="{it_url}">
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="G&amp;G Technologies">
  <meta property="og:title" content="{_esc(data['title'])}">
  <meta property="og:description" content="{_esc(data['description'])}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{SITE}/assets/og-card.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="{LOCALE[lang]}">
  <meta property="og:locale:alternate" content="{LOCALE[other_lang]}">
  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{_esc(data['title'])}">
  <meta name="twitter:description" content="{_esc(data['description'])}">
  <meta name="twitter:image" content="{SITE}/assets/og-card.png">
  <!-- Favicon -->
  <link rel="apple-touch-icon" sizes="180x180" href="{prefix}assets/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="{prefix}assets/favicon-32.png">
  <script>
    {BOOTSTRAP_JS}
  </script>
  <link rel="stylesheet" href="{prefix}assets/{ASSET_CSS}">
  <script type="application/ld+json">
{json_ld}
  </script>
</head>
<body>
{_icon_gradient()}
{_art_gradients()}
{_header(lang, other_url)}

  <main id="main">
    <section class="hero page-hero">
      <div class="hero-bg" aria-hidden="true">
        <div class="glow glow-1"></div>
        <div class="glow glow-2"></div>
      </div>

      <div class="container">
        <div>
          <nav class="breadcrumb" aria-label="{label}"><ol>{crumbs}</ol></nav>
          <div class="kicker">{data['kicker']}</div>
          <h1>{data['h1']}</h1>
          <p class="hero-sub">{data['lead']}</p>
          <p class="hero-note">{data['sources_note']}</p>
        </div>
      </div>
    </section>

    <section>
      <div class="container">
{listing}
      </div>
    </section>
  </main>

{_footer(lang)}

  <script src="{prefix}assets/{ASSET_JS}" defer></script>
</body>
</html>
"""


# -----------------------------------------------------------------------------------------------------------------
#  a p p s
# -----------------------------------------------------------------------------------------------------------------

# The pages *about* the apps. The apps themselves live in app/<key>/run/, are written by hand and
# never pass through here: see app/CLAUDE.md for why the two are kept apart.

def _app_url(app, lang):
    return _url(app[lang]["slug"])


def _app_run_url(app):
    return f"/app/{app['key']}/run/"


def _app_draw(app):
    draw = article_art.APP_ART.get(app["key"])
    if draw is None:
        raise SystemExit(
            f"l'app «{app['key']}» dichiara il disegno «{app.get('art', {}).get('shape')}» ma non "
            f"c'è in APP_ART dentro _src/article_art.py"
        )
    return draw


def _app_art_html(app, lang):
    """The banner over the scheda. Same rules as the article banners: inline SVG, no text inside."""
    words = app[lang].get("art")
    if not words:
        raise SystemExit(f"l'app «{app['key']}» non ha «art» in {lang}: servono «title» e «desc», "
                         f"altrimenti il banner è muto per chi usa uno screen reader")
    ident = "app" + re.sub(r"[^a-z0-9]", "", app["key"])
    body = "".join(_art_shape_svg(s) for s in _app_draw(app)())
    return f"""        <figure class="article-art app-art reveal">
          <svg viewBox="0 0 {article_art.BANNER_W} {article_art.BANNER_H}" role="img"
               aria-labelledby="{ident}T {ident}D">
            <title id="{ident}T">{_esc(words['title'])}</title>
            <desc id="{ident}D">{_esc(words['desc'])}</desc>
            {body}
          </svg>
        </figure>
"""


def _app_thumb_html(app):
    w, h = article_art.THUMB_W, article_art.THUMB_H
    body = "".join(_art_shape_svg(s) for s in _app_draw(app)(w, h))
    return (f'<span class="insight-thumb"><svg viewBox="0 0 {w} {h}" aria-hidden="true" '
            f'focusable="false">{body}</svg></span>')


def _app_shot(app, lang):
    """The screenshot file name. Generated by make_screenshots.py, never captured by hand."""
    return f"shot-{app['key']}-{lang}.png"


def _app_shot_html(app, lang):
    """The screenshot, or nothing at all.

    Optional on purpose, and not the same call as for an article. An article has to show its
    subject because the reader cannot reach it; an app is one free click away, at the top of the
    same page, so the picture saves a click rather than making the case. Requiring it would mean
    holding back a finished tool over an image of it.

    Drop the two files in assets/ and they appear here: nothing else has to change.
    """
    name = _app_shot(app, lang)
    if not (ASSETS / name).is_file():
        return ""
    caption = ("L'interfaccia dell'app, in esecuzione nel browser."
               if lang == "it" else "The app running in the browser.")
    return f"""      <figure class="app-shot reveal">
        <img src="/assets/{name}" width="1600" height="1000" loading="lazy" decoding="async"
             alt="{_esc(caption)}">
      </figure>
"""


def _app_og_image(app, lang):
    return f"og-app-{app['key']}-{lang}.jpg"


def _app_lists_html(lang, data):
    """What it does and what it does not, side by side. The second half is the honest one."""
    def block(title, items, extra):
        rows = "".join(f"              <li>{item}</li>\n" for item in items)
        return (f'          <div class="app-list {extra}">\n'
                f'            <h3>{_esc(title)}</h3>\n'
                f'            <ul class="ticks">\n{rows}            </ul>\n'
                f'          </div>')
    return ('        <div class="app-lists">\n'
            + block(data["does_title"], data["does"], "does") + "\n"
            + block(data["does_not_title"], data["does_not"], "does-not") + "\n"
            + '        </div>')


def _app_meta_html(lang, app):
    """Version, date and licence, in plain sight.

    An open source app with no visible date reads as abandoned, and somebody weighing it up has no
    way to learn otherwise without opening the repository.
    """
    chrome = APPS_INDEX[lang]
    parts = [
        (chrome["version_label"], _esc(app["version"])),
        (chrome["updated_label"], _long_date(lang, app["updated"])),
        (chrome["licence_label"], _esc(app["licence"])),
    ]
    items = "".join(f'<span><b>{label}</b> {value}</span>' for label, value in parts)
    source = f'{REPO_APPS}/{app["key"]}'
    return (f'        <p class="app-meta">{items}'
            f'<a href="{source}" rel="noopener">{chrome["source_label"]}</a></p>')


def _app_cards_html(lang):
    """The cards on /app/, in the order the anagrafica gives — never by date.

    By date, releasing a game would put it first for everybody arriving on the section, and a game
    is the least representative thing the company makes.
    """
    cards = []
    for app in sorted(APPS, key=lambda a: (a.get("order", 99), a["key"])):
        entry = app[lang]
        mark = "" if app["stato"] == "pronto" else (" · bozza" if lang == "it" else " · draft")
        chips = "".join(f'<span class="tag">{APP_TAGS[t][lang]}</span>' for t in _app_tags(app))
        cards.append(f"""          <a class="insight-card reveal" href="/{entry['slug']}/"
             data-tags="{' '.join(_app_tags(app))}">
            {_app_thumb_html(app)}
            <div class="kicker">{entry['kicker']}{mark}</div>
            <h3>{_esc(app['name'])}</h3>
            <p>{entry['summary']}</p>
            <span class="tag-row">{chips}</span>
          </a>""")
    if not cards:
        return f'        <p class="section-intro">{APPS_INDEX[lang]["empty"]}</p>'
    return '        <div class="insight-list">\n' + "\n".join(cards) + "\n        </div>"


def _app_tags(app):
    tags = app.get("tags") or []
    unknown = [t for t in tags if t not in APP_TAGS]
    if unknown:
        raise SystemExit(f"l'app «{app['key']}» ha tag sconosciuti: {', '.join(unknown)}\n"
                         f"  quelli ammessi sono: {', '.join(APP_TAGS)}")
    if not tags:
        raise SystemExit(f"l'app «{app['key']}» non ha tag. Scegline almeno uno fra: "
                         f"{', '.join(APP_TAGS)}")
    return tags


def _check_app_lengths():
    """The measures that keep the cards even and the kicker on one line."""
    problems = []
    for app in APPS:
        for lang in LANGS:
            data = app[lang]
            if len(_strip_tags(data["kicker"])) > KICKER_MAX:
                problems.append(f"{app['key']}/{lang}: l'occhiello supera i {KICKER_MAX} caratteri, "
                                f"va a capo e il trattino resta indietro")
            if len(_strip_tags(data["summary"])) > SUMMARY_MAX:
                problems.append(f"{app['key']}/{lang}: il sommario supera i {SUMMARY_MAX} "
                                f"caratteri, le card della griglia crescono di altezze diverse")
            if data["slug"] != (f"app/{app['key']}" if lang == "it" else f"en/app/{app['key']}"):
                problems.append(f"{app['key']}/{lang}: lo slug non corrisponde alla chiave")
    if problems:
        raise SystemExit("_src/apps.py:\n  " + "\n  ".join(problems))


def _check_app_assets():
    """A published app needs its social card. The screenshot is welcome but not required.

    The card is not negotiable: without it a link shared anywhere shows the generic image, and that
    happens outside the site, where nobody notices. The screenshot only ever shows up on the scheda
    itself, above a button that opens the real thing.
    """
    problems = []
    for app in APPS:
        if app["stato"] != "pronto":
            continue
        for lang in LANGS:
            name = _app_og_image(app, lang)
            if not (ASSETS / name).is_file():
                problems.append(f"{app['key']}: manca assets/{name}")
        if not (ROOT / "app" / app["key"] / "run" / "index.html").is_file():
            problems.append(f"{app['key']}: la scheda punta a run/ ma l'app non esiste")
    if problems:
        raise SystemExit("app in stato «pronto» senza la card social:\n  " + "\n  ".join(problems)
                         + "\n  rilancia make_og_cards.py, oppure rimettila in «bozza»")


def _app_head(lang, data, url, other_url, og_image, prefix, json_ld, robots):
    """The head shared by the index and the schede. Same signals as every other page."""
    other_lang = "en" if lang == "it" else "it"
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{_esc(data['title'])}</title>
  <meta name="description" content="{_esc(data['description'])}">
  <meta name="author" content="G&amp;G Technologies Srl">
  <meta name="robots" content="{robots}">
  <meta name="theme-color" content="#0d1220">
  <link rel="canonical" href="{url}">
  <link rel="alternate" hreflang="it" href="{url if lang == 'it' else other_url}">
  <link rel="alternate" hreflang="en" href="{other_url if lang == 'it' else url}">
  <link rel="alternate" hreflang="x-default" href="{url if lang == 'it' else other_url}">
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="G&amp;G Technologies">
  <meta property="og:title" content="{_esc(data['title'])}">
  <meta property="og:description" content="{_esc(data['description'])}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{SITE}/assets/{og_image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="{LOCALE[lang]}">
  <meta property="og:locale:alternate" content="{LOCALE[other_lang]}">
  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{_esc(data['title'])}">
  <meta name="twitter:description" content="{_esc(data['description'])}">
  <meta name="twitter:image" content="{SITE}/assets/{og_image}">
  <!-- Favicon -->
  <link rel="apple-touch-icon" sizes="180x180" href="{prefix}assets/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="{prefix}assets/favicon-32.png">
  <script>
    {BOOTSTRAP_JS}
  </script>
  <link rel="stylesheet" href="{prefix}assets/{ASSET_CSS}">
  <script type="application/ld+json">
{json_ld}
  </script>
</head>"""


def _render_apps_index(lang):
    data = APPS_INDEX[lang]
    other_lang = "en" if lang == "it" else "it"
    url, other_url = _url(data["slug"]), _url(APPS_INDEX[other_lang]["slug"])
    prefix = "../" * (data["slug"].count("/") + 1)
    home = "/" if lang == "it" else "/en/"
    chrome = CHROME[lang]

    crumbs = (f'<li><a href="{home}">{chrome["breadcrumb_home"]}</a></li>'
              f'<li aria-current="page">{_esc(data["short"])}</li>')
    label = "Percorso" if lang == "it" else "Breadcrumb"

    json_ld = json.dumps([{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": _strip_tags(data["short"]),
        "url": url,
        "description": data["description"],
        "inLanguage": lang,
        "isPartOf": {"@id": f"{SITE}/#organization"},
    }], ensure_ascii=False, indent=2)

    return f"""{_app_head(lang, data, url, other_url, "og-card.png", prefix, json_ld,
                          "index, follow, max-image-preview:large")}
<body>
{_icon_gradient()}
{_art_gradients()}
{_header(lang, other_url)}

  <main id="main">
    <section class="hero page-hero">
      <div class="hero-bg" aria-hidden="true">
        <div class="glow glow-1"></div>
        <div class="glow glow-2"></div>
      </div>

      <div class="container">
        <div>
          <nav class="breadcrumb" aria-label="{label}"><ol>{crumbs}</ol></nav>
          <div class="kicker">{data['kicker']}</div>
          <h1>{data['h1']}</h1>
          <p class="hero-sub">{data['lead']}</p>
          <p class="hero-note">{data['privacy_note']}</p>
        </div>
      </div>
    </section>

    <section>
      <div class="container">
{_app_cards_html(lang)}
      </div>
    </section>
  </main>

{_footer(lang)}

  <script src="{prefix}assets/{ASSET_JS}" defer></script>
</body>
</html>
"""


def _render_app_page(lang, app):
    data = app[lang]
    other_lang = "en" if lang == "it" else "it"
    url, other_url = _app_url(app, lang), _app_url(app, other_lang)
    prefix = "../" * (data["slug"].count("/") + 1)
    home = "/" if lang == "it" else "/en/"
    chrome = CHROME[lang]
    index = APPS_INDEX[lang]
    draft = app["stato"] != "pronto"

    crumbs = (f'<li><a href="{home}">{chrome["breadcrumb_home"]}</a></li>'
              f'<li><a href="/{index["slug"]}/">{_esc(index["short"])}</a></li>'
              f'<li aria-current="page">{_esc(app["name"])}</li>')
    label = "Percorso" if lang == "it" else "Breadcrumb"
    chips = "".join(f'<a class="tag" href="/{index["slug"]}/?tag={t}">{APP_TAGS[t][lang]}</a>'
                    for t in _app_tags(app))

    json_ld = json.dumps([{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": app["name"],
        "url": url,
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": "Any (web browser)",
        "softwareVersion": app["version"],
        "datePublished": app["released"],
        "dateModified": app["updated"],
        "license": "https://www.apache.org/licenses/LICENSE-2.0",
        "description": data["description"],
        "inLanguage": lang,
        "isAccessibleForFree": True,
        # Free is a price, and stating it is what keeps the listing honest in a rich result.
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"},
        "publisher": {"@id": f"{SITE}/#organization"},
    }], ensure_ascii=False, indent=2)

    # Wrapped, not bare. A <p> straight in the container inherits no rhythm and no reading width:
    # the three paragraphs closed up into one block running the full width of the page.
    intro = ('        <div class="about-text reveal">\n'
             + "\n".join(f"          <p>{p}</p>" for p in data["intro"])
             + "\n        </div>")
    open_label = index["open"]

    return f"""{_app_head(lang, data, url, other_url, _app_og_image(app, lang), prefix, json_ld,
                          "noindex, follow" if draft else "index, follow, max-image-preview:large")}
<body>
{_icon_gradient()}
{_art_gradients()}
{_header(lang, other_url)}

  <main id="main">
    <section class="hero page-hero">
      <div class="hero-bg" aria-hidden="true">
        <div class="glow glow-1"></div>
        <div class="glow glow-2"></div>
      </div>

      <div class="container">
        <div>
          <nav class="breadcrumb" aria-label="{label}"><ol>{crumbs}</ol></nav>
          <div class="kicker">{data['kicker']}</div>
          <h1>{data['h1']}</h1>
          <p class="hero-sub">{data['lead']}</p>
          <p class="article-tags"><span class="tag-label">{index['tags_label']}</span>{chips}</p>
          <div class="hero-ctas">
            <a class="btn btn-primary" href="{_app_run_url(app)}">{open_label}</a>
            <a class="btn btn-ghost" href="{REPO_APPS}/{app['key']}" rel="noopener">
              {index['source_label']}</a>
          </div>
        </div>
      </div>
    </section>

    <section class="article-body">
      <div class="container">
{_app_art_html(app, lang)}
        <div class="kicker">{data['intro_title']}</div>
        <h2>{data['intro_h2']}</h2>
{intro}
{_app_shot_html(app, lang)}{_app_lists_html(lang, data)}
      </div>
    </section>

    <section>
      <div class="container">
        <div class="kicker">{data['facts_title']}</div>
{_facts_html(data)}
{_app_meta_html(lang, app)}
      </div>
    </section>

    <section>
      <div class="container">
        <div class="kicker">FAQ</div>
        <h2>{data['faq_title']}</h2>
{_faq_html(data)}
        <!-- Same four buttons as an article, and they point at *this* page and not at run/. The
             running app is noindex and its canonical already names the scheda: a link passed
             around to a page that asks not to be indexed collects nothing. -->
{_share_html(lang, data, data['title'])}
      </div>
    </section>

    <section class="cta-band">
      <div class="container">
        <h2>{data['cta_title']}</h2>
        <p class="section-intro">{data['cta_text']}</p>
        <div class="cta-buttons">
{_closing_ctas(lang, data)}
        </div>
      </div>
    </section>

    <section>
      <div class="container">
{_related_html(lang, data)}
      </div>
    </section>
  </main>

{_footer(lang)}

  <script src="{prefix}assets/{ASSET_JS}" defer></script>
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


def _home_meta(s, name):
    """Read TITLES or DESCRIPTIONS out of the JavaScript block in home.html.

    Parsed from the object literal instead of matched on the sentence itself. The previous version
    keyed on the first word — `'(Progettiamo[^']*|We design[^']*)'` — so rewording a description to
    open differently did not produce a different description: it made the build stop with
    "DESCRIPTIONS non leggibili", which says nothing about the real cause.
    """
    block = re.search(rf"const {name} = \{{(.*?)\}};", s, re.S)
    if not block:
        raise SystemExit(f"_src/home.html: blocco {name} non trovato nel JS.")
    found = dict((lang, value.replace("\\'", "'"))
                 for lang, value in re.findall(r"(it|en):\s*'((?:[^'\\]|\\.)*)'", block.group(1)))
    if set(found) != {"it", "en"}:
        raise SystemExit(f"_src/home.html: {name} deve avere una voce 'it' e una 'en'.")
    return found


def _render_home(lang):
    """The two single-language homepages, derived from the one bilingual source.

    Title and description come from the TITLES and DESCRIPTIONS objects in the page's own JavaScript
    — the language switch needs them at runtime — and this function overwrites the static <meta>
    tags in the head with them. So **editing those meta tags by hand does nothing**: the value that
    ships is the one in the JS block. Fifth cousin of the two-footers trap, and the quiet kind: no
    error, no wrong output, just an edit that evaporates.
    """
    source = SRC / "home.html"
    if not source.exists():
        raise SystemExit(f"{source} non trovato: è la sorgente bilingue della homepage.")
    s = source.read_text(encoding="utf-8")

    other = "en" if lang == "it" else "it"
    s = _drop_other_language(s, other)

    titles, descriptions = _home_meta(s, "TITLES"), _home_meta(s, "DESCRIPTIONS")
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
  <link rel="stylesheet" href="/assets/{ASSET_CSS}">
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
    for lang in LANGS:
        entries.append((_url(INSIGHTS_INDEX[lang]["slug"]),
                        _url(INSIGHTS_INDEX["it"]["slug"]), _url(INSIGHTS_INDEX["en"]["slug"])))
    for lang in LANGS:
        entries.append((_url(APPS_INDEX[lang]["slug"]),
                        _url(APPS_INDEX["it"]["slug"]), _url(APPS_INDEX["en"]["slug"])))
    # A draft app carries noindex, so listing it would tell Google two opposite things.
    for app in APPS:
        if app["stato"] != "pronto":
            continue
        for lang in LANGS:
            entries.append((_app_url(app, lang), _app_url(app, "it"), _app_url(app, "en")))
    # Drafts carry noindex, so listing them here would tell Google two opposite things.
    for article in ARTICLES:
        if article["stato"] != "pronto":
            continue
        for lang in LANGS:
            entries.append((_url(article[lang]["slug"]),
                            _url(article["it"]["slug"]), _url(article["en"]["slug"])))

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
    problems += _check_insights()
    if problems:
        raise SystemExit("content.py:\n  " + "\n  ".join(problems))


def _check_insights():
    """The same parity rule as the pages, applied to the articles — plus the markdown bodies.

    An article is three thousand words in two files: a correction applied to one language only is
    even easier to miss here than on the pages. Comparing the structure (headings, lists, tables,
    links) catches a whole paragraph added on one side, which the word count alone would not.
    """
    problems = []

    for lang in LANGS:
        index = INSIGHTS_INDEX[lang]
        if not 110 <= len(index["description"]) <= 165:
            problems.append(f'INSIGHTS_INDEX.{lang}: description di {len(index["description"])} caratteri')
    if set(INSIGHTS_INDEX["it"]) != set(INSIGHTS_INDEX["en"]):
        problems.append("INSIGHTS_INDEX: campi diversi fra IT ed EN: "
                        f'{set(INSIGHTS_INDEX["it"]) ^ set(INSIGHTS_INDEX["en"])}')

    slugs = set()
    for article in ARTICLES:
        key = article["key"]
        if article["stato"] not in ("bozza", "pronto"):
            problems.append(f'{key}: stato «{article["stato"]}» sconosciuto, usa bozza o pronto')
        if set(article["it"]) != set(article["en"]):
            problems.append(f'{key}: campi diversi fra IT ed EN: {set(article["it"]) ^ set(article["en"])}')

        for lang in LANGS:
            data = article[lang]
            if data["slug"] in slugs:
                problems.append(f'{key}.{lang}: slug duplicato «{data["slug"]}»')
            slugs.add(data["slug"])
            if len(data["title"]) > 65:
                problems.append(f'{key}.{lang}: title di {len(data["title"])} caratteri')
            if not 110 <= len(data["description"]) <= 165:
                problems.append(f'{key}.{lang}: description di {len(data["description"])} caratteri')
            for path, text in _walk_text(data):
                for phrase, reason in BANNED[lang]:
                    if phrase.lower() in text.lower():
                        problems.append(f"{key}.{lang}{path}: «{phrase}» — {reason}")

        bodies = {}
        for lang in LANGS:
            path = SRC / "insights" / f"{key}.{lang}.md"
            if not path.exists():
                problems.append(f"{key}: manca {path.name}")
                continue
            bodies[lang] = path.read_text(encoding="utf-8")
            for phrase, reason in BANNED[lang]:
                if phrase.lower() in bodies[lang].lower():
                    problems.append(f"{path.name}: «{phrase}» — {reason}")

        if len(bodies) == 2:
            shapes = {}
            for lang, body in bodies.items():
                lines = body.split("\n")
                shapes[lang] = {
                    "titoli": len([ln for ln in lines if ln.startswith("## ")]),
                    "voci di elenco": len([ln for ln in lines if ln.startswith("- ")]),
                    "voci numerate": len([ln for ln in lines if _ORDERED.match(ln)]),
                    "righe di tabella": len([ln for ln in lines if ln.startswith("|")]),
                    "citazioni": len([ln for ln in lines if ln.startswith("> ")]),
                    "link": len(re.findall(r"\]\(https?://", body)),
                }
            for field, italian in shapes["it"].items():
                english = shapes["en"][field]
                if italian != english:
                    problems.append(f"{key}: {italian} {field} in italiano, {english} in inglese — "
                                    f"probabile modifica applicata a una lingua sola")
            ratio = len(bodies["it"].split()) / len(bodies["en"].split())
            if ratio < 0.85 or ratio > 1.25:
                problems.append(f"{key}: i due testi divergono troppo in lunghezza "
                                f"({len(bodies['it'].split())} parole IT, {len(bodies['en'].split())} EN)")

    return problems


ASSET_SEQ = SRC / "asset-seq.json"


def _asset_seq(key, digest):
    """The build number to put in an asset's name, so the newest is obvious at a glance.

    A content hash alone cannot be ordered: ?v=21343c1a and ?v=ef394514 say nothing about which
    came first. A counter can, but it must move *only when the content moves*, or the caching this
    whole scheme exists for stops working — a rebuild with identical CSS would change the URL and
    force every reader to download the same bytes again.

    So the counter is keyed to the digest: same content, same number, same URL, still cached. New
    content, next number. The state lives in _src/asset-seq.json and is committed, otherwise a
    fresh clone would restart from one and hand out versions lower than what is already online.
    """
    try:
        state = json.loads(ASSET_SEQ.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        state = {}
    entry = state.get(key) or {}
    if entry.get("digest") == digest:
        return entry["seq"]                     # unchanged: keep the name the browser has cached

    # One counter per asset, so ?v=007 on the stylesheet means "the seventh stylesheet", not "the
    # seventh time any asset changed" — a shared counter made the CSS 001 and the JS 002 in the same
    # build, which reads like one is newer than the other. Never reuse a lower number, not even when
    # reverting: the counter answers "how recent is this", not "which revision of the content".
    seq = entry.get("seq", 0) + 1
    state[key] = {"seq": seq, "digest": digest}
    try:
        ASSET_SEQ.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    except OSError as err:
        print(f"nota: non riesco a scrivere _src/{ASSET_SEQ.name} ({err.strerror}); il progressivo "
              f"di questo giro non è stato memorizzato")
    return seq


def _write_asset(base, extension, content):
    """Write the asset under one fixed name and return the href, versioned with a query string.

    The name on disk never changes — assets/site.css, assets/site.js — and the version travels in
    the URL: `site.css?v=012.ef394514`. The browser's cache key is the whole URL, query string
    included, so a changed digest is a different resource and gets refetched; an unchanged digest
    keeps the same URL and stays cached.

    This replaced putting the hash in the filename, which worked but accumulated: every CSS change
    wrote a new file and left the previous one to be deleted, and any build that could not delete —
    a read-only checkout, a stricter sandbox — silently orphaned it. Worse, in git each change
    arrived as a delete plus an add, so committing half of it published a site with no stylesheet.
    One file that changes in place has none of that: a normal diff, nothing to sweep, nothing to
    forget.

    The trade-off, stated plainly: filename fingerprinting is immune to intermediaries that strip or
    ignore query strings, and this is not. Browsers do not, and neither does the CDN in front of
    GitHub Pages, so in this setup the exchange is worth it.
    """
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()[:8]
    name = f"{base}{extension}"
    (ASSETS / name).write_text(content, encoding="utf-8")

    # One-time tidying, left in place: earlier builds wrote site.<hash>.css alongside this one.
    # It must not be able to stop a build — on a read-only checkout the delete fails, and failing
    # there would block a publication for no reason.
    for old in ASSETS.glob(f"{base}.*{extension}"):
        try:
            old.unlink()
        except OSError as err:
            print(f"nota: non riesco a togliere assets/{old.name} ({err.strerror}), toglilo a mano")

    return f"{name}?v={_asset_seq(name, digest):03d}.{digest}"


def main():
    from datetime import date

    global ASSET_CSS, ASSET_JS

    _check_parity()
    _check_app_lengths()
    _check_app_assets()

    # Both assets are named before any page is rendered: the templates read these globals.
    ASSETS.mkdir(exist_ok=True)
    ASSET_CSS = _write_asset("site", ".css", _extract_homepage_css() + EXTRA_CSS)
    ASSET_JS = _write_asset("site", ".js", SITE_JS)

    (ROOT / "index.html").write_text(_render_home("it"), encoding="utf-8")
    (ROOT / "en").mkdir(exist_ok=True)
    (ROOT / "en" / "index.html").write_text(_render_home("en"), encoding="utf-8")

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

    for lang in LANGS:
        target = ROOT / INSIGHTS_INDEX[lang]["slug"]
        target.mkdir(parents=True, exist_ok=True)
        (target / "index.html").write_text(_render_insights_index(lang), encoding="utf-8")
        written.append(INSIGHTS_INDEX[lang]["slug"] + "/")

    for lang in LANGS:
        target = ROOT / APPS_INDEX[lang]["slug"]
        target.mkdir(parents=True, exist_ok=True)
        (target / "index.html").write_text(_render_apps_index(lang), encoding="utf-8")
        written.append(APPS_INDEX[lang]["slug"] + "/")

    for app in APPS:
        for lang in LANGS:
            slug = app[lang]["slug"]
            target = ROOT / slug
            target.mkdir(parents=True, exist_ok=True)
            (target / "index.html").write_text(_render_app_page(lang, app), encoding="utf-8")
            state = "" if app["stato"] == "pronto" else f"  ({app['stato']}, noindex)"
            written.append(f"{slug}/{state}")

    for article in ARTICLES:
        for lang in LANGS:
            slug = article[lang]["slug"]
            target = ROOT / slug
            target.mkdir(parents=True, exist_ok=True)
            (target / "index.html").write_text(_render_article(lang, article), encoding="utf-8")
            state = "" if article["stato"] == "pronto" else f"  ({article['stato']}, noindex)"
            written.append(f"{slug}/{state}")

    (ROOT / "sitemap.xml").write_text(_sitemap(date.today().isoformat()), encoding="utf-8")

    print("index.html       (it)")
    print("en/index.html    (en)")
    css_file = ASSET_CSS.split("?", 1)[0]
    print(f"assets/{ASSET_CSS}  ({(ASSETS / css_file).stat().st_size // 1024} KB)")
    print(f"assets/{ASSET_JS}")
    for slug in written:
        print(slug)
    urls = len(re.findall(r"<loc>", (ROOT / "sitemap.xml").read_text(encoding="utf-8")))
    print(f"sitemap.xml      ({urls} URL, gli stub di reindirizzamento restano fuori)")


if __name__ == "__main__":
    main()
