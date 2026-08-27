# -*- coding: utf-8 -*-
"""Print the questionnaire on paper, so phase two actually happens — and produces something true.

Phase two is putting the questions in front of two or three real people. Every document in this
project says it is the step that decides whether the instrument works, and every document also says
it is the one that gets skipped. Part of the reason is dull: the questions live in a JSON file and
a technical note, and neither is something you hand to a business owner.

The first version of this script made a sheet to read aloud. An adversarial review took it apart,
and the conclusion was worth more than the fixes: **the session would have gone well, and that
would have been the failure.** Reading questions aloud to someone who knows you wrote them collects
evidence of comprehension — which three rounds of desk revision had already fixed — while the
things still unknown (are the answers true, does anyone finish twenty-two questions alone, does the
result look like the company) come back systematically better than they are. A skipped phase stays
on the list. A passed phase gets crossed off.

So the protocol here is two passes, and the order matters:

**First the person fills it in alone** while you watch and say nothing. No voice channel, no
approving noises, no face to please. You collect hesitation, re-reading, the pen that stops.
**Then you go back over it and probe** — "you picked 'in the last six months', tell me about the
last time" — because that is the only thing in a session of three people that can tell a true
answer from a comfortable one.

Two things the sheet still refuses to show: the points next to the options, which would teach the
respondent where the good answer is, and any judgement of the company. What it does show, at the
end, is the band — because the app shows it, and a test that hides it is testing a different
instrument.

Usage:  python3 _src/make_ai_scope_sheet.py            # italiano, l'edizione più recente
        python3 _src/make_ai_scope_sheet.py --lang en  # quando l'inglese esisterà
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ai_scope_data as data                                    # noqa: E402

OUT_DIR = Path(__file__).resolve().parent / "ai-scope"
WIDTH = 94
PAGE_LINES = 58

# Printed at the foot of every page. Four words, because the six-line list in the first version was
# read once and never again: while you are following options with a finger and turning pages, a
# paragraph at the front of the document does not exist.
FOOTER = "guarda:  esita · rilegge · «dipende» · faccia · penna che si ferma"

CONSENT = (
    "Da leggere prima di cominciare, e non a memoria.\n\n"
    "«Sto provando delle domande, non la tua azienda: quello che cerco è quali domande sono "
    "scritte male. Se una non funziona mi fai un favore a dirlo — ne devo buttare via qualcuna. "
    "Non scrivo da nessuna parte il nome dell'azienda, il foglio resta mio e non finisce online, e "
    "puoi fermarti quando vuoi. Una domanda parla di dati dei clienti finiti in servizi online: "
    "rispondi come stanno le cose, non mi interessa e non lo riferisco a nessuno.»"
)

PROTOCOL = (
    "PRIMO GIRO — compila lui, tu stai zitto.\n"
    "Dai il foglio e la penna, di' che può chiedere se una parola non è chiara, e poi taci. Non "
    "spiegare, non annuire, non commentare, non ripetere la risposta ad alta voce. Se ti chiede "
    "«è giusta?», rispondi: non c'è una risposta giusta, sto provando le domande. Tu segna solo "
    "quello che vedi, nella colonna a destra.\n\n"
    "SECONDO GIRO — riprendi il foglio e chiedi.\n"
    "Domanda per domanda, solo dove è successo qualcosa. Le tre sonde che servono, in quest'ordine:\n"
    "  1. «Qui hai scelto questa. Me la racconti, l'ultima volta che è successo?»\n"
    "     Se non riesce a raccontarla, la risposta era comoda, non vera. È l'unica cosa che\n"
    "     distingue le due, e non si può ottenere in nessun altro modo con tre persone.\n"
    "  2. «C'era un'opzione che ti somigliava di più e non c'era?»\n"
    "  3. «Perché non questa?» — indicando quella accanto a quella scelta.\n\n"
    "ALLA FINE — tre domande a lui, prima delle tue conclusioni.\n"
    "  · Quale domanda toglieresti?\n"
    "  · C'è qualcosa che ti aspettavi e non c'era?\n"
    "  · [calcola la fascia in fondo, leggila] Ti riconosci in questa frase?"
)

LIMITS = (
    "COSA QUESTA PROVA NON PUÒ DIRTI, e va scritto nel resoconto invece che dimenticato.\n\n"
    "L'abbandono no: seduto davanti a te nessuno si alza alla domanda quattordici, quindi sulla "
    "lunghezza questa prova non dice niente. La copertura delle opzioni nemmeno: con tre persone "
    "quasi tutte le opzioni non le sceglierà nessuno, e sarebbe un fatto del campione, non delle "
    "opzioni — l'unico segnale che vale è a voce, «nessuna di queste mi somiglia». E le risposte "
    "saranno migliori del vero comunque, perché le stai guardando: le domande che ne soffrono di "
    "più sono q005, q015, q016 e q019."
)


# -----------------------------------------------------------------------------------------------------------------
#  p r i v a t e
# -----------------------------------------------------------------------------------------------------------------

def _text(node, lang):
    return (node or {}).get(lang, "").strip()


def _wrap(text, width, indent=""):
    """Fold a paragraph by hand: no dependency, and the sheet has to stay readable in a terminal."""
    lines, line = [], indent
    for word in text.split():
        if len(line) + len(word) + 1 > width and line.strip():
            lines.append(line.rstrip())
            line = indent
        line += word + " "
    if line.strip():
        lines.append(line.rstrip())
    return lines or [indent.rstrip()]


def _condition(when, questionnaire, lang):
    """Render a `when` as something a person holding a sheet can act on, without turning pages."""
    if when is True or not isinstance(when, dict):
        return ""
    parts = []
    for other, values in when.items():
        question = next((q for q in questionnaire["questions"] if q["id"] == other), None)
        if not question:
            continue
        labels = [_text(question["options"][v].get("text"), lang) for v in values
                  if 0 <= v < len(question["options"])]
        parts.append(f"{other} è «" + "» o «".join(labels) + "»")
    return " e ".join(parts)


def _skips(questionnaire, lang):
    """The skip rules, as an instruction printed under the question that triggers them.

    The first version of this script never read `rules`, so the sheet asked someone who had just
    said "we use none" when they last measured the return on an AI tool. In the app that moment
    cannot happen; on paper it did, and it would have been written down as a defect of the
    question rather than of the sheet.
    """
    by_trigger = {}
    for rule in questionnaire.get("rules", {}).get("skip", []):
        for other, values in (rule.get("when") or {}).items():
            question = next((q for q in questionnaire["questions"] if q["id"] == other), None)
            if not question:
                continue
            labels = [_text(question["options"][v].get("text"), lang) for v in values
                      if 0 <= v < len(question["options"])]
            key = (other, " o ".join(f"«{label}»" for label in labels))
            by_trigger.setdefault(key, []).extend(rule.get("questions", []))
    return by_trigger


def _question_block(question, questionnaire, lang, skips):
    """One question, self-contained, in the order a moderator needs it."""
    out = [question["id"]]

    # The condition comes *before* the text, and this is not cosmetic: printed after, the moderator
    # has already read the wrong version aloud.
    variant = question.get("variant")
    if variant:
        condition = _condition(variant.get("when"), questionnaire, lang)
        out.extend(_wrap(f"[se {condition} → leggi la versione B]", WIDTH, "  "))
        out.append("")
        out.extend(_wrap("A. " + _text(question.get("text"), lang), WIDTH))
        out.append("")
        out.extend(_wrap("B. " + _text(variant.get("text"), lang), WIDTH))
    else:
        out.extend(_wrap(_text(question.get("text"), lang), WIDTH))

    hint = _text(question.get("hint"), lang)
    if hint:
        out.extend(_wrap(hint, WIDTH, "  "))
    out.append("")

    # No numbers and no letters next to the boxes: a respondent who sees "d" learns there is an
    # order, and the order is what these questions keep out of sight.
    for option in question.get("options", []):
        folded = _wrap(_text(option.get("text"), lang), WIDTH - 6)
        for index, line in enumerate(folded):
            out.append(("   [ ] " if index == 0 else "       ") + line)
    na = question.get("not_applicable")
    if na:
        condition = _condition(na.get("when"), questionnaire, lang)
        label = _text(na.get("text"), lang) + (f"   (solo se {condition})" if condition else "")
        folded = _wrap(label, WIDTH - 10)
        for index, line in enumerate(folded):
            # Marked, because on paper it is a fifth box among four and it does not belong to the
            # worst-to-best scale: it leaves the denominator instead of scoring zero.
            out.append(("   [ ] (n/a) " if index == 0 else "             ") + line)

    for (trigger, labels), targets in skips.items():
        if trigger == question["id"]:
            out.append("")
            out.extend(_wrap(f"→ se ha risposto {labels}: salta {', '.join(sorted(set(targets)))} "
                             f"e passa oltre. Nell'app quelle domande non gliele fa.", WIDTH, "   "))
    out.append("")
    out.append("   sec ___    cosa hai visto: " + "." * (WIDTH - 30))
    out.append("   " + "." * (WIDTH - 6))
    out.append("   " + "." * (WIDTH - 6))
    return out


def _paginate(blocks, header):
    """Pack blocks into pages so a question is never split across a fold."""
    pages, page = [], list(header)
    for block in blocks:
        if len(page) + len(block) + 2 > PAGE_LINES and page != header:
            pages.append(page)
            page = []
        page.extend(block)
        page.append("")
    pages.append(page)

    out = []
    for number, page in enumerate(pages, start=1):
        out.extend(page)
        out.append("")
        out.append("-" * WIDTH)
        out.append(f"{FOOTER}{' ' * max(1, WIDTH - len(FOOTER) - 8)}p. {number}/{len(pages)}")
        if number < len(pages):
            out.append("\f")
    return out


def _tally(questionnaire, lang):
    """A hand-worked scoring aid, so the closing question can actually be asked.

    Excluding the score from the test would mean testing a different instrument from the one that
    ships: in the app the band is the first thing on the report. It stays out of sight until the
    end, and it is computed by hand rather than guessed.
    """
    out = ["", "=" * WIDTH, "", "DOPO, IN PRIVATO — la fascia, per l'ultima domanda", "-" * WIDTH, ""]
    out.extend(_wrap("Ogni casella vale, da sinistra a destra: 0, 1, 2, 3. Le domande n/a non si "
                     "contano né sopra né sotto; una domanda saltata vale 0 ma si conta sotto.",
                     WIDTH))
    out.append("")
    dimensions = {d["id"]: _text(d.get("text"), lang) for d in questionnaire.get("dimensions", [])}
    for dimension, label in dimensions.items():
        ids = [q["id"] for q in questionnaire["questions"]
               if q.get("scored") and q.get("dimension") == dimension]
        out.append(f"   {label:<28} {' + '.join(ids)}  =  ____ / ____  →  ____ %")
    out.append("")
    out.extend(_wrap("Media delle sei percentuali = ____ %.  Poi la fascia:", WIDTH))
    for band in questionnaire.get("bands", []):
        out.append(f"      {band['from']:>3}–{band['to']:<3}  {_text(band.get('text'), lang)}")
    out.append("")
    out.extend(_wrap("Se ha risposto «Non ne usiamo nessuno» alla q004, la fascia è la prima "
                     "qualunque sia la media. Leggigliela e chiedi se ci si riconosce.", WIDTH))
    return out


def _sheet(questionnaire, lang):
    header = [
        "AI SCOPE — le domande del nucleo",
        f"edizione {questionnaire.get('edition')} · lingua {lang} · foglio per la prova dal vivo",
        "=" * WIDTH,
        "",
        "   data ____/____/______     partecipante n. ____     inizio ____:____   fine ____:____",
        "",
        "   q002 (da quanto esiste) = _______________   ← serve alla variante di q007, segnala subito",
        "",
        "=" * WIDTH,
        "",
    ]

    front = []
    for title, body in (("COSA DIRE PRIMA", CONSENT), ("COME SI CONDUCE", PROTOCOL),
                        ("I LIMITI DI QUESTA PROVA", LIMITS)):
        front.append(title)
        front.append("-" * WIDTH)
        for paragraph in body.split("\n\n"):
            for line in paragraph.split("\n"):
                front.extend(_wrap(line, WIDTH) if not line.startswith(("  ", "     "))
                             else [line])
            front.append("")

    dimensions = {d["id"]: _text(d.get("text"), lang) for d in questionnaire.get("dimensions", [])}
    skips = _skips(questionnaire, lang)
    blocks, seen = [front], set()
    for question in questionnaire.get("questions", []):
        dimension = question.get("dimension")
        block = []
        if dimension and dimension not in seen:
            seen.add(dimension)
            block.extend(["", f"— {dimensions.get(dimension, dimension).upper()} —", ""])
        block.extend(_question_block(question, questionnaire, lang, skips))
        blocks.append(block)

    closing = ["", "=" * WIDTH, "", "SUBITO DOPO, A CALDO — prima di dimenticare", "-" * WIDTH, ""]
    for prompt in ("Quale domanda ha funzionato peggio, e cosa ha detto esattamente?",
                   "Su quale sonda non è riuscito a raccontare l'ultima volta?",
                   "Quale opzione ha detto che gli mancava?",
                   "Quanto è durata: ____ minuti. Dove si è fermato più a lungo?"):
        closing.extend(_wrap(prompt, WIDTH))
        closing.append("   " + "." * (WIDTH - 6))
        closing.append("")
    blocks.append(closing)
    blocks.append(_tally(questionnaire, lang))

    return "\n".join(_paginate(blocks, header))


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Il foglio delle domande, per la prova dal vivo.")
    parser.add_argument("--lang", default="it", choices=data.LANGS)
    parser.add_argument("--stdout", action="store_true", help="stampa invece di scrivere il file")
    args = parser.parse_args()

    editions = data.editions()
    if not editions:
        raise SystemExit("nessun questionnaire-N.json in _src/ai-scope/")
    questionnaire, error = data.load(editions[-1])
    if error:
        raise SystemExit(error)

    problems = []
    data.check_questionnaire(questionnaire, problems)
    if problems:
        print("\n".join("  " + p for p in problems))
        raise SystemExit("il questionario non passa i controlli: il foglio non si stampa.")

    missing = data.language_debt(questionnaire).get(args.lang, 0)
    if missing:
        raise SystemExit(f"in «{args.lang}» mancano {missing} stringhe: il foglio uscirebbe con "
                         f"dei buchi, e una domanda mancante in una prova dal vivo non si nota.")

    sheet = _sheet(questionnaire, args.lang)
    if args.stdout:
        print(sheet)
        return
    out = OUT_DIR / f"domande-edizione-{questionnaire['edition']}-{args.lang}.txt"
    out.write_text(sheet + "\n", encoding="utf-8")
    pages = sheet.count("\f") + 1
    print(f"scritto {out.relative_to(Path(__file__).resolve().parent.parent)} "
          f"({len(sheet.splitlines())} righe, {pages} pagine)\n"
          f"Stampalo. Primo giro: compila lui e tu stai zitto. Secondo giro: chiedi.")


if __name__ == "__main__":
    main()
