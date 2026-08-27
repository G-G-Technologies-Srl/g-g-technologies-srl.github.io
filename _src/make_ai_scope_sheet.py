# -*- coding: utf-8 -*-
"""Print the questionnaire on paper, so phase two actually happens.

Phase two is reading the questions to two or three real people and watching them answer. Every
document in this project says it is the step that decides whether the instrument works, and every
document also says it is the one that gets skipped. It gets skipped partly for a dull reason: the
questions live inside a JSON file and a technical note, and neither is something you put in front
of a business owner.

So this makes the sheet. Two deliberate choices in what it leaves out:

**No points, anywhere.** A sheet showing that the fourth option is worth three teaches the
respondent to look for the good answer, and the whole design of these questions is to keep the
socially desirable direction from being obvious. The scoring is real and it belongs to the app.

**A place to write what happened, not what they answered.** The value of phase two is not the
answers — it is the hesitation before an answer, the question that had to be read twice, the option
that made someone say "well, both". Those have a column; the answers do not.

It reads the same `questionnaire-1.json` the app will read, so the sheet cannot drift from the
questions. Nothing is written by hand here except the instructions to whoever runs the session.

Usage:  python3 _src/make_ai_scope_sheet.py            # italiano, l'edizione più recente
        python3 _src/make_ai_scope_sheet.py --lang en  # quando l'inglese esisterà
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ai_scope_data as data                                    # noqa: E402

OUT_DIR = Path(__file__).resolve().parent / "ai-scope"

# What to watch for while someone answers. Not a script to read out: a reminder for whoever is
# holding the sheet, printed once at the top because it is the part that is easy to forget while
# concentrating on getting through the questions.
WATCH = [
    "Quanto ci mette a rispondere. Oltre una decina di secondi la domanda non è ancorata a un "
    "fatto che ha in mente: è la prova che l'ancoraggio non funziona.",
    "Se rilegge la domanda. Una rilettura è ambiguità, e va segnata anche se poi risponde bene.",
    "Se dice «dipende» o «un po' tutte». Vuol dire che le opzioni si sovrappongono, o che non ha "
    "capito se rispondere sul caso tipico o sul peggiore.",
    "Se chiede cosa significa una parola. Ogni termine da spiegare è gergo rimasto lì.",
    "Se una domanda sembra un giudizio. Si vede in faccia prima che nella risposta.",
    "Se nessuno sceglie mai un'opzione. Un'opzione che non sceglie nessuno o è scritta male o "
    "descrive una situazione che non esiste.",
]

INTRO = (
    "Leggi la domanda ad alta voce, poi le opzioni, e taci. Non spiegare, non aiutare, non "
    "riformulare: se la domanda ha bisogno di essere spiegata, quello È il risultato della prova. "
    "Non dire che c'è un punteggio. Se ti chiede quanto manca, dillo — la stima onesta del tempo "
    "fa parte dello strumento.\n\n"
    "Se la situazione varia, la regola è rispondere sul caso più frequente. Dilla una volta "
    "all'inizio, non a ogni domanda."
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
    return lines


def _condition(when, questionnaire, lang):
    """Render a `when` as something a person holding a sheet can act on."""
    if when is True or not isinstance(when, dict):
        return ""
    parts = []
    for other, values in when.items():
        question = next((q for q in questionnaire["questions"] if q["id"] == other), None)
        if not question:
            continue
        labels = [_text(question["options"][v].get("text"), lang) for v in values
                  if 0 <= v < len(question["options"])]
        parts.append(f"{other} = " + " oppure ".join(f"«{label}»" for label in labels))
    return "; ".join(parts)


def _sheet(questionnaire, lang, width=94):
    out = []
    edition = questionnaire.get("edition")
    out.append("AI SCOPE — le domande del nucleo")
    out.append(f"edizione {edition} · lingua {lang} · foglio per la prova su persone vere")
    out.append("=" * width)
    out.append("")
    out.append("CHI CONDUCE, PRIMA DI COMINCIARE")
    out.append("-" * width)
    for paragraph in INTRO.split("\n\n"):
        out.extend(_wrap(paragraph, width))
        out.append("")
    out.append("COSA GUARDARE MENTRE RISPONDE")
    out.append("-" * width)
    for item in WATCH:
        folded = _wrap(item, width - 4, "")
        out.append("  · " + folded[0])
        out.extend("    " + line for line in folded[1:])
    out.append("")
    out.append("=" * width)
    out.append("")

    dimensions = {d["id"]: _text(d.get("text"), lang) for d in questionnaire.get("dimensions", [])}
    seen = set()

    for question in questionnaire.get("questions", []):
        dimension = question.get("dimension")
        if dimension and dimension not in seen:
            seen.add(dimension)
            out.append("")
            out.append(f"— {dimensions.get(dimension, dimension).upper()} —")
            out.append("")
        if not dimension and question["id"] == "q001":
            out.append("— PER COMINCIARE —")
            out.append("")
        if not dimension and question["id"] == "q022":
            out.append("")
            out.append("— UN'ULTIMA COSA —")
            out.append("")

        out.append(f"{question['id']}")
        out.extend(_wrap(_text(question.get("text"), lang), width))
        hint = _text(question.get("hint"), lang)
        if hint:
            out.extend(_wrap(hint, width, "  "))
        variant = question.get("variant")
        if variant:
            condition = _condition(variant.get("when"), questionnaire, lang)
            out.append("")
            out.extend(_wrap(f"[se {condition}, leggi invece:]", width, "  "))
            out.extend(_wrap(_text(variant.get("text"), lang), width, "  "))
        out.append("")
        # No numbers next to the options, and no letters either: a respondent who sees "d" learns
        # there is an order, and an order is exactly what these questions hide.
        for option in question.get("options", []):
            for index, line in enumerate(_wrap(_text(option.get("text"), lang), width - 6, "")):
                out.append(("   [ ] " if index == 0 else "       ") + line)
        na = question.get("not_applicable")
        if na:
            condition = _condition(na.get("when"), questionnaire, lang)
            suffix = f"   (solo se {condition})" if condition else ""
            out.append("   [ ] " + _text(na.get("text"), lang) + suffix)
        out.append("")
        out.append("   cosa è successo: " + "." * (width - 21))
        out.append("   " + "." * (width - 6))
        out.append("")

    out.append("=" * width)
    out.append("")
    out.append("DOPO, A CALDO — tre righe, prima di dimenticare")
    out.append("-" * width)
    for question in ("Quale domanda ha funzionato peggio, e cosa ha detto esattamente?",
                     "Quale opzione non ha scelto nessuno?",
                     "Quanto è durata davvero la compilazione?"):
        out.extend(_wrap(question, width))
        out.append("   " + "." * (width - 6))
        out.append("")
    return "\n".join(out)


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
    print(f"scritto {out.relative_to(Path(__file__).resolve().parent.parent)} "
          f"({len(sheet.splitlines())} righe)\n"
          f"Stampalo, e portalo davanti a due o tre persone vere.")


if __name__ == "__main__":
    main()
