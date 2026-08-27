# -*- coding: utf-8 -*-
"""The questionnaire as a PDF to hand over, for the person who fills it in.

This is the *other* sheet. `make_ai_scope_sheet.py` prints the moderator's copy — consent script,
protocol, the column for what you saw, the hand-worked band at the end. None of that belongs in
front of the person answering, and two things in particular would do damage:

**The scoring aid.** A respondent who sees that the fourth box is worth three learns where the good
answer is, and every question here is written to keep that direction out of sight.

**The observation column.** Being watched is already the weak point of a session with three people;
handing someone a form with a space headed "what you saw" makes it the loudest thing on the page.

What this one has instead, and the moderator's copy does not need, is **routing**: the app decides
on its own which questions to skip, and paper cannot. So the rules in `questionnaire-1.json` are
printed as instructions a person can follow — "if you answered X, skip to question N" — and the
conditional wording of q007 is printed as an alternative in place, not as a variant to look up.

Numbers, not ids: someone filling in a form should read "5", not "q005". The id is in the margin in
grey, small, so whoever types the answers in afterwards can match them without asking.

Depends on reportlab, and on Inter from the brand folder when it is there. Same kind of build-time
dependency as Pillow in make_og_cards.py: it runs on the machine that prepares things, never in the
app, which by its own rules carries no library at all.

Usage:  python3 _src/make_ai_scope_form.py
        python3 _src/make_ai_scope_form.py --brand /percorso/di/ggtechnologies-brand
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ai_scope_data as data                                    # noqa: E402

try:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_JUSTIFY
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate,
                                    Paragraph, Spacer)
except ImportError:                                             # pragma: no cover
    raise SystemExit("serve reportlab:  pip3 install --break-system-packages reportlab")

OUT_DIR = Path(__file__).resolve().parent / "ai-scope"
BRAND_DEFAULT = Path.home() / "Claude" / "Projects" / "ggtechnologies-brand"

INK = colors.HexColor("#0D1220")
EMERALD = colors.HexColor("#059669")
GREY = colors.HexColor("#4A5266")
HAIRLINE = colors.HexColor("#D5D9E2")

BOX = "❑"                                                        # drawn, not a form field: it is paper


# -----------------------------------------------------------------------------------------------------------------
#  s e t u p
# -----------------------------------------------------------------------------------------------------------------

def _fonts(brand):
    """Inter if the brand folder is there, Helvetica otherwise — never a silent half-brand."""
    faces = {"Inter-Regular": "body", "Inter-SemiBold": "semi", "Inter-Bold": "bold"}
    found = {}
    for name in faces:
        path = Path(brand) / "font" / f"{name}.ttf"
        if path.is_file():
            pdfmetrics.registerFont(TTFont(name, str(path)))
            found[faces[name]] = name
    if len(found) == len(faces):
        return found["body"], found["semi"], found["bold"]
    print("  · Inter non trovato nella cartella del brand: uso Helvetica.")
    return "Helvetica", "Helvetica-Bold", "Helvetica-Bold"


def _styles(body, semi, bold):
    base = dict(fontName=body, textColor=INK, leading=13.5, fontSize=10)
    return {
        "title": ParagraphStyle("title", fontName=bold, fontSize=19, leading=23, textColor=INK,
                                spaceAfter=2 * mm),
        "kicker": ParagraphStyle("kicker", fontName=semi, fontSize=8, leading=11,
                                 textColor=EMERALD, spaceAfter=3 * mm),
        "lead": ParagraphStyle("lead", **{**base, "fontSize": 11, "leading": 16,
                                          "spaceAfter": 4 * mm, "alignment": TA_JUSTIFY}),
        "body": ParagraphStyle("body", **{**base, "spaceAfter": 2.5 * mm}),
        "note": ParagraphStyle("note", **{**base, "fontSize": 8.5, "leading": 12,
                                          "textColor": GREY, "spaceAfter": 2 * mm}),
        "section": ParagraphStyle("section", fontName=semi, fontSize=9, leading=12,
                                  textColor=EMERALD, spaceBefore=7 * mm, spaceAfter=3 * mm),
        "question": ParagraphStyle("question", fontName=semi, fontSize=10.5, leading=14.5,
                                   textColor=INK, spaceAfter=1.5 * mm),
        "hint": ParagraphStyle("hint", **{**base, "fontSize": 9, "leading": 12,
                                          "textColor": GREY, "spaceAfter": 2 * mm}),
        "option": ParagraphStyle("option", **{**base, "leftIndent": 6 * mm, "spaceAfter": 1.2 * mm}),
        "route": ParagraphStyle("route", fontName=semi, fontSize=9, leading=12.5,
                                textColor=EMERALD, leftIndent=6 * mm, spaceBefore=2 * mm,
                                spaceAfter=1 * mm),
        "write": ParagraphStyle("write", **{**base, "textColor": HAIRLINE, "spaceAfter": 1 * mm}),
    }


# -----------------------------------------------------------------------------------------------------------------
#  p r i v a t e
# -----------------------------------------------------------------------------------------------------------------

def _text(node, lang):
    return (node or {}).get(lang, "").strip()


def _numbers(questionnaire):
    """Question id to the number the respondent reads. Ids stay in the margin."""
    return {question["id"]: index
            for index, question in enumerate(questionnaire.get("questions", []), start=1)}


def _labels(questionnaire, other, values, lang):
    question = next((q for q in questionnaire["questions"] if q["id"] == other), None)
    if not question:
        return []
    return [_text(question["options"][v].get("text"), lang) for v in values
            if 0 <= v < len(question["options"])]


def _skip_map(questionnaire, lang):
    """What to print, and where, so a person on paper does what the app would do for them.

    Two instructions per rule, because paper has no memory: one under the question that triggers
    the skip, and one on the skipped question itself — a reader who lands there having forgotten
    the first must still know it is not for them.
    """
    triggers, targets = {}, {}
    for rule in questionnaire.get("rules", {}).get("skip", []):
        for other, values in (rule.get("when") or {}).items():
            labels = _labels(questionnaire, other, values, lang)
            for qid in rule.get("questions", []):
                triggers.setdefault(other, []).append((qid, labels))
                targets.setdefault(qid, (other, labels))
    return triggers, targets


def _routing_after(question, questionnaire, triggers, numbers, lang):
    """«Se hai risposto X, salta la N e vai alla M.»"""
    entries = triggers.get(question["id"])
    if not entries:
        return []
    labels = entries[0][1]
    skipped = sorted({numbers[qid] for qid, _ in entries})
    said = " o ".join(f"«{label}»" for label in labels)
    listed = " e ".join(str(n) for n in skipped)
    following = min(skipped) + 1
    plural = "le domande" if len(skipped) > 1 else "la domanda"
    return [f"→ Se hai risposto {said}: salta {plural} {listed} e vai alla "
            f"{following if len(skipped) > 1 else following}."]


def _routing_before(question, questionnaire, targets, numbers, lang):
    """«Rispondi solo se alla N non hai risposto X.»"""
    entry = targets.get(question["id"])
    if not entry:
        return []
    other, labels = entry
    said = " o ".join(f"«{label}»" for label in labels)
    return [f"→ Salta questa domanda se alla {numbers[other]} hai risposto {said}."]


def _question_flow(question, questionnaire, styles, numbers, triggers, targets, lang):
    flow = []
    number = numbers[question["id"]]

    for line in _routing_before(question, questionnaire, targets, numbers, lang):
        flow.append(Paragraph(line, styles["route"]))

    title = _text(question.get("text"), lang)
    flow.append(Paragraph(
        f'<font color="#4A5266">{number}.</font>&nbsp;&nbsp;{title}'
        f'<font size="7" color="#B7BEC9">&nbsp;&nbsp;{question["id"]}</font>', styles["question"]))

    hint = _text(question.get("hint"), lang)
    if hint:
        flow.append(Paragraph(hint, styles["hint"]))

    # The conditional wording is printed in place, as an alternative to read instead of the line
    # above. On the moderator's sheet it is an A/B to choose between; here it has to be something a
    # person can act on without cross-referencing another page.
    variant = question.get("variant")
    if variant:
        for other, values in (variant.get("when") or {}).items():
            said = " o ".join(f"«{label}»"
                              for label in _labels(questionnaire, other, values, lang))
            flow.append(Paragraph(
                f"→ Se alla {numbers[other]} hai risposto {said}, rispondi invece a questa: "
                f"<i>{_text(variant.get('text'), lang)}</i>", styles["route"]))

    for option in question.get("options", []):
        flow.append(Paragraph(f"{BOX}&nbsp;&nbsp;{_text(option.get('text'), lang)}",
                              styles["option"]))
    na = question.get("not_applicable")
    if na:
        label = _text(na.get("text"), lang)
        condition = ""
        when = na.get("when")
        if isinstance(when, dict):
            for other, values in when.items():
                said = " o ".join(f"«{lbl}»"
                                  for lbl in _labels(questionnaire, other, values, lang))
                condition = f' <font color="#4A5266" size="8.5">(solo se alla ' \
                            f'{numbers[other]} hai risposto {said})</font>'
        flow.append(Paragraph(f"{BOX}&nbsp;&nbsp;{label}{condition}", styles["option"]))

    for line in _routing_after(question, questionnaire, triggers, numbers, lang):
        flow.append(Paragraph(line, styles["route"]))

    flow.append(Spacer(1, 3 * mm))
    return KeepTogether(flow)


def _cover(questionnaire, styles, lang):
    flow = [
        Paragraph("QUESTIONARIO — BOZZA IN PROVA", styles["kicker"]),
        Paragraph("Come sta la tua azienda con l'intelligenza artificiale", styles["title"]),
        Paragraph(
            "Sono ventidue domande e si risponde in dieci minuti circa. <b>Non stiamo valutando la "
            "tua azienda: stiamo provando le domande.</b> Se una è scritta male, poco chiara o non "
            "ti somiglia, segnalo in fondo — è esattamente quello che ci serve sapere, e ne "
            "dobbiamo buttare via qualcuna.", styles["lead"]),
        Paragraph(
            "<b>Come si risponde.</b> Una casella per domanda. Se la situazione varia, rispondi "
            "sul caso più frequente. Alcune domande hanno una nota che dice di saltarne un'altra: "
            "seguila, e non è un errore tuo se ne salti qualcuna.", styles["body"]),
        Paragraph(
            "<b>Cosa succede a questo foglio.</b> Non c'è scritto il nome della tua azienda e non "
            "chiediamo di scriverlo. Il foglio resta a chi te lo ha dato, non finisce online e non "
            "va a nessun altro. Se una domanda ti mette a disagio, lasciala in bianco.",
            styles["body"]),
        Spacer(1, 4 * mm),
        Paragraph("Compilato il ____ / ____ / ________ &nbsp;&nbsp;·&nbsp;&nbsp; "
                  "foglio n. ______", styles["note"]),
    ]
    return flow


def _closing(styles):
    flow = [
        Paragraph("PRIMA DI RESTITUIRLO", styles["section"]),
        Paragraph("Sono le tre righe che valgono più delle ventidue domande.", styles["body"]),
    ]
    for prompt in ("Quale domanda non era chiara, o ti ha fatto esitare?",
                   "C'è una risposta che avresti voluto dare e non c'era fra le opzioni?",
                   "Quale domanda toglieresti?"):
        flow.append(Paragraph(prompt, styles["question"]))
        for _ in range(2):
            flow.append(Paragraph("." * 118, styles["write"]))
        flow.append(Spacer(1, 3 * mm))
    return flow


def _build(questionnaire, lang, out, styles, edition_note):
    doc = BaseDocTemplate(str(out), pagesize=A4,
                          leftMargin=22 * mm, rightMargin=22 * mm,
                          topMargin=20 * mm, bottomMargin=20 * mm,
                          title="AI Scope — questionario in prova",
                          author="G&G Technologies S.r.l.")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")

    def decorate(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(HAIRLINE)
        canvas.setLineWidth(0.5)
        canvas.line(doc.leftMargin, 15 * mm, A4[0] - doc.rightMargin, 15 * mm)
        canvas.setFont(styles["note"].fontName, 7.5)
        canvas.setFillColor(GREY)
        canvas.drawString(doc.leftMargin, 11 * mm, edition_note)
        canvas.drawRightString(A4[0] - doc.rightMargin, 11 * mm, f"pagina {document.page}")
        canvas.restoreState()

    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=decorate)])

    numbers = _numbers(questionnaire)
    triggers, targets = _skip_map(questionnaire, lang)
    dimensions = {d["id"]: _text(d.get("text"), lang)
                  for d in questionnaire.get("dimensions", [])}

    story = _cover(questionnaire, styles, lang)
    story.append(PageBreak())
    seen = set()
    for question in questionnaire.get("questions", []):
        dimension = question.get("dimension")
        if dimension and dimension not in seen:
            seen.add(dimension)
            story.append(Paragraph(dimensions.get(dimension, dimension).upper(), styles["section"]))
        story.append(_question_flow(question, questionnaire, styles, numbers, triggers, targets,
                                    lang))
    story.append(PageBreak())
    story.extend(_closing(styles))
    doc.build(story)


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Il questionario in PDF, per chi lo compila.")
    parser.add_argument("--lang", default="it", choices=data.LANGS)
    parser.add_argument("--brand", default=str(BRAND_DEFAULT),
                        help="cartella del brand, per il carattere Inter")
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
        raise SystemExit("il questionario non passa i controlli: il PDF non si genera.")

    missing = data.language_debt(questionnaire).get(args.lang, 0)
    if missing:
        raise SystemExit(f"in «{args.lang}» mancano {missing} stringhe: il PDF uscirebbe con dei "
                         f"buchi, e una domanda mancante su carta non la nota nessuno.")

    body, semi, bold = _fonts(args.brand)
    styles = _styles(body, semi, bold)
    edition = questionnaire["edition"]
    note = (f"AI Scope · questionario in prova, edizione {edition} · "
            f"G&G Technologies S.r.l. · non è una valutazione della tua azienda")
    out = OUT_DIR / f"questionario-edizione-{edition}-{args.lang}.pdf"
    _build(questionnaire, args.lang, out, styles, note)
    print(f"scritto {out.relative_to(Path(__file__).resolve().parent.parent)}\n"
          f"Questo è il foglio da consegnare. Quello del moderatore è un altro:\n"
          f"  python3 _src/make_ai_scope_sheet.py")


if __name__ == "__main__":
    main()
