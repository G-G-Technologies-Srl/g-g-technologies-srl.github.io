# -*- coding: utf-8 -*-
"""Break the AI Scope contract on purpose, one rule at a time, and check that each break is caught.

Same idea as test_pricing_guard.py and test_apps_guard.py, and the same reason: `ai_scope_data.py`
passed on its first run, which is the moment a check is most likely to be checking nothing. A guard
that has never failed is indistinguishable from a guard that cannot fail.

Every case below is a defect that could really happen — most of them already have, in the two
review passes of 2026-08-27. The list is the memory of those passes in executable form: a rule
quietly dropped during a refactor makes one of these go green, and green here means broken.

Usage:  python3 _src/test_ai_scope_guard.py
"""

import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ai_scope_data as data                                    # noqa: E402

QUESTIONNAIRE = Path(__file__).resolve().parent / "ai-scope" / "questionnaire-1.json"
FIXTURES = Path(__file__).resolve().parent / "ai-scope" / "fixtures"


# -----------------------------------------------------------------------------------------------------------------
#  h e l p e r s
# -----------------------------------------------------------------------------------------------------------------

def _questionnaire():
    loaded, error = data.load(QUESTIONNAIRE)
    if error:
        raise SystemExit(f"non riesco a leggere il questionario: {error}")
    return loaded


def _fixture(name):
    loaded, error = data.load(FIXTURES / name)
    if error:
        raise SystemExit(f"non riesco a leggere {name}: {error}")
    return loaded


def _question(questionnaire, qid):
    return next(q for q in questionnaire["questions"] if q["id"] == qid)


def _broken_questionnaire(mutate):
    broken = copy.deepcopy(_questionnaire())
    mutate(broken)
    problems = []
    data.check_questionnaire(broken, problems)
    data.check_against_notes(broken, problems)
    return problems


def _broken_data(mutate, base="valid-complete.json"):
    questionnaire = _questionnaire()
    broken = copy.deepcopy(_fixture(base))
    mutate(broken)
    problems = []
    data.check_data(questionnaire, broken, problems)
    return problems


def _says(problems, expected):
    """Did the *right* check fire, not just some check?

    The first version of this file asked only whether the list was non-empty, and that is not a
    test: breaking one rule usually trips two or three others, so a check could be deleted outright
    and every case would stay green. Found by reading the output of the contradiction case — three
    unrelated messages, and the one that mattered would not have been missed.
    """
    return any(expected in problem for problem in problems)


# -----------------------------------------------------------------------------------------------------------------
#  t h e   b r e a k s
# -----------------------------------------------------------------------------------------------------------------

def _drop_english(questionnaire):
    """An edition declared finished with one string still untranslated.

    The whole module exists for this case: the review found that roughly a thousand strings would
    have lived outside every guard in the repository, and a language falling behind by one line is
    the defect the root CLAUDE.md says has already shipped twice.
    """
    questionnaire["status"] = "published"
    for node in questionnaire["dimensions"] + questionnaire["bands"]:
        node["text"]["en"] = "translated"
    for question in questionnaire["questions"]:
        question["text"]["en"] = "translated"
        if "hint" in question:
            question["hint"]["en"] = "translated"
        if "variant" in question:
            question["variant"]["text"]["en"] = "translated"
        if "not_applicable" in question:
            question["not_applicable"]["text"]["en"] = "translated"
        for option in question["options"]:
            option["text"]["en"] = "translated"
    # Everything is translated except one option of one question, which is exactly how it happens.
    _question(questionnaire, "q012")["options"][2]["text"].pop("en")


def _empty_string(questionnaire):
    _question(questionnaire, "q004")["text"]["it"] = "   "


def _placeholder(questionnaire):
    _question(questionnaire, "q004")["options"][0]["text"]["it"] = "TODO scrivere l'opzione"


def _renumbered_id(questionnaire):
    _question(questionnaire, "q012")["id"] = "q112"


def _duplicate_id(questionnaire):
    _question(questionnaire, "q012")["id"] = "q011"


def _four_questions_in_a_dimension(questionnaire):
    extra = copy.deepcopy(_question(questionnaire, "q012"))
    extra["id"] = "q023"
    questionnaire["questions"].append(extra)


def _reordered_options(questionnaire):
    options = _question(questionnaire, "q004")["options"]
    options[0]["points"], options[3]["points"] = 3, 0


def _band_gap(questionnaire):
    questionnaire["bands"][1]["from"] = 26


def _rule_names_a_ghost(questionnaire):
    questionnaire["rules"]["skip"][0]["when"] = {"q099": [0]}


def _rule_names_a_ghost_option(questionnaire):
    questionnaire["rules"]["skip"][0]["when"] = {"q004": [7]}


def _skip_kind_confused(questionnaire):
    questionnaire["rules"]["skip"][0]["as"] = "saltata"


def _floor_removed(questionnaire):
    questionnaire["rules"]["floor"]["band"] = 2


def _dimension_undeclared(questionnaire):
    _question(questionnaire, "q012")["dimension"] = "d9"


def _context_question_scored(questionnaire):
    _question(questionnaire, "q001")["dimension"] = "d1"


def _text_drifts_from_the_notes(questionnaire):
    """Una domanda riscritta nel questionario e non nel documento che la spiega.

    È il difetto che questo stesso lavoro ha creato: scrivendo il questionario in JSON, il testo
    delle domande ha cominciato a vivere in due posti. La correzione non è stata togliere la prosa
    — il commento accanto a ogni domanda è il motivo per cui qualcuno potrà rivederla — ma tenere i
    due allineati con un controllo, come già si fa per i due footer e per i bullet della home.
    """
    _question(questionnaire, "q004")["text"]["it"] = "Usate l'intelligenza artificiale?"


# Ogni riga: cosa si rompe, come, e **cosa deve dire** il controllo che se ne accorge. La terza
# colonna è la parte che conta: senza, basta che un controllo qualsiasi si lamenti, e un controllo
# cancellato passerebbe inosservato perché ne scattano altri.
QUESTIONNAIRE_BREAKS = [
    ("l'inglese manca in un'edizione pubblicata", _drop_english, "manca «en»"),
    ("una stringa è fatta di soli spazi", _empty_string, "è vuoto"),
    ("un'opzione è rimasta un segnaposto", _placeholder, "sembra un segnaposto"),
    ("un id è stato rinumerato", _renumbered_id, "gli id sono contigui"),
    ("due domande hanno lo stesso id", _duplicate_id, "lo stesso id"),
    ("una dimensione ha quattro domande invece di tre", _four_questions_in_a_dimension,
     "domande a punteggio, attese 3"),
    ("le opzioni non vanno più dalla peggiore alla migliore", _reordered_options,
     "dalla peggiore alla migliore"),
    ("le fasce lasciano un buco", _band_gap, "lascia un buco"),
    ("una regola nomina una domanda che non esiste", _rule_names_a_ghost, "non è una domanda"),
    ("una regola nomina un'opzione che non esiste", _rule_names_a_ghost_option,
     "non è un'opzione di quella domanda"),
    ("skipped e not_applicable confusi in una regola", _skip_kind_confused, "sono due cose diverse"),
    ("la regola a soglia non porta più alla prima fascia", _floor_removed, "fascia minima"),
    ("una domanda dichiara una dimensione inesistente", _dimension_undeclared, "non dichiarata"),
    ("una domanda di contesto entra nel punteggio", _context_question_scored,
     "non fa punteggio ma dichiara"),
    ("il testo di una domanda diverge dal documento che la spiega",
     _text_drifts_from_the_notes, "dicono due cose diverse"),
]


def _checklist():
    loaded, error = data.load(Path(__file__).resolve().parent / "ai-scope" / "compliance-1.json")
    if error:
        raise SystemExit(f"non riesco a leggere la checklist: {error}")
    return loaded


def _item(checklist, cid):
    return next(item for item in checklist["items"] if item["id"] == cid)


def _broken_checklist(mutate):
    broken = copy.deepcopy(_checklist())
    mutate(broken)
    problems = []
    data.check_compliance(broken, _questionnaire(), problems)
    return problems


def _claims_compliance(checklist):
    """Il difetto che questo modulo esiste per non avere.

    Una frase che dice a chi legge di essere in regola diventa falsa da sola, su un foglio già
    stampato e consegnato a un acceleratore, senza nessun modo di richiamare nessuno. Una frase che
    dice quale obbligo esiste e da quando invecchia come un articolo.
    """
    _item(checklist, "c002")["obligation"]["it"] = (
        "Se hai fatto formazione al personale sei in regola con l'art. 4."
    )


def _claims_a_fine(checklist):
    _item(checklist, "c001")["obligation"]["it"] = "Senza questa verifica rischiate una sanzione."


def _source_missing(checklist):
    _item(checklist, "c009")["source"] = {"label": "GDPR, art. 35"}


def _date_malformed(checklist):
    _item(checklist, "c003")["applies_from"] = "agosto 2026"


def _expiry_missing(checklist):
    checklist.pop("valid_until")


def _expiry_before_verification(checklist):
    checklist["valid_until"] = "2026-01-01"


def _disclaimer_removed(checklist):
    checklist["disclaimer"]["it"] = ""


def _checklist_id_renumbered(checklist):
    _item(checklist, "c007")["id"] = "c107"


def _condition_names_a_ghost(checklist):
    _item(checklist, "c003")["when"] = {"q099": [1]}


def _checklist_english_missing(checklist):
    checklist["status"] = "published"


def _claims_without_a_pronoun(checklist):
    """La formula che la prima versione della regex lasciava passare.

    Cercava il pronome — «sei in regola» — quindi «a posto», «adempiuto», «nulla da fare» e ogni
    formulazione inglese passavano. Un controllo che coglie solo la frase che nessuno scriverebbe
    è un ornamento.
    """
    _item(checklist, "c008")["obligation"]["it"] = "Se hai una base giuridica, su questo sei a posto."


def _claims_in_english(checklist):
    _item(checklist, "c010")["obligation"]["en"] = "If the contract is signed, no action needed."


def _exemption_widened(checklist):
    """Una chiave nuova che contiene la parola «disclaimer» non è una zona franca."""
    checklist["disclaimer_hub"] = {"it": "Le imprese che segui risultano conformi."}


def _date_missing_entirely(checklist):
    _item(checklist, "c009").pop("applies_from")


def _expiry_outlives_a_known_change(checklist):
    checklist["valid_until"] = "2026-12-20"


def _warn_days_removed(checklist):
    checklist.pop("warn_days")


def _scope_removed(checklist):
    checklist["scope"]["it"] = ""


def _distributor_disclaimer_removed(checklist):
    checklist["disclaimer_for_distributors"]["it"] = "  "


CHECKLIST_BREAKS = [
    ("una voce dice a chi legge che è in regola", _claims_compliance, "afferma uno stato"),
    ("una voce minaccia una sanzione", _claims_a_fine, "afferma uno stato"),
    ("una voce afferma uno stato senza usare il pronome", _claims_without_a_pronoun,
     "afferma uno stato"),
    ("una voce afferma uno stato in inglese", _claims_in_english, "afferma uno stato"),
    ("una chiave nuova col nome «disclaimer» diventa zona franca", _exemption_widened,
     "afferma uno stato"),
    ("una voce non ha la fonte", _source_missing, "manca la fonte"),
    ("una voce non ha nessuna data", _date_missing_entirely, "manca «applies_from»"),
    ("una data non è una data", _date_malformed, "attesa una data"),
    ("manca la scadenza della verifica", _expiry_missing, "valid_until"),
    ("la scadenza precede la verifica", _expiry_before_verification, "non è dopo"),
    ("la scadenza sopravvive a una modifica già nota", _expiry_outlives_a_known_change,
     "non può superare la prima modifica"),
    ("non c'è preavviso prima della scadenza", _warn_days_removed, "warn_days"),
    ("il disclaimer è stato svuotato", _disclaimer_removed, "manca «disclaimer»"),
    ("manca il disclaimer per chi ridistribuisce", _distributor_disclaimer_removed,
     "disclaimer_for_distributors"),
    ("manca l'ambito territoriale", _scope_removed, "scope"),
    ("un id della checklist è stato rinumerato", _checklist_id_renumbered, "gli id sono contigui"),
    ("una condizione nomina una domanda che non esiste", _condition_names_a_ghost,
     "non è una domanda"),
    ("la checklist è pubblicata senza l'inglese", _checklist_english_missing, "manca «en»"),
]


def _wrong_overall(payload):
    payload["scores"]["overall"] = 80


def _wrong_level(payload):
    payload["scores"]["level"] = 3


def _wrong_dimension(payload):
    payload["scores"]["dimensions"]["d3"] = 90


def _counts_missing(payload):
    payload["scores"]["counts"].pop("d4")


def _counts_wrong(payload):
    payload["scores"]["counts"]["d2"]["scored"] = 2


def _answer_out_of_range(payload):
    payload["answers"]["q009"] = 9


def _unknown_question(payload):
    payload["answers"]["q099"] = 1


def _question_in_two_places(payload):
    payload["skipped"].append("q009")


def _question_nowhere(payload):
    payload["answers"].pop("q009")


def _incomplete_but_scored(payload):
    payload["complete"] = False


def _digest_stale(payload):
    payload["questionnaire_digest"] = "sha256:" + "0" * 64


def _wrong_edition(payload):
    payload["questionnaire_edition"] = 99


def _extra_field(payload):
    payload["email"] = "chi@esempio.sm"


def _bad_schema_version(payload):
    payload["schema"] = "2.0"


def _missing_required(payload):
    payload.pop("complete")


def _contradiction_exported(payload):
    """La coppia di coerenza: q004 dice «nessuno strumento», q006 dice «l'ultima prova è in uso».

    Si parte da valid-no-ai.json, che ha già le due domande derivate al posto giusto, così l'unica
    cosa che resta rotta è la contraddizione. Partendo dal file normale scattavano prima le regole
    di salto, e il caso sarebbe passato anche senza il controllo di coerenza.
    """
    payload["answers"]["q006"] = 3
    payload["scores"] = {
        "overall": 63, "level": 0,
        "dimensions": {"d1": 33, "d2": 100, "d3": 89, "d4": 0, "d5": 83, "d6": 78},
        "counts": {
            "d1": {"asked": 3, "scored": 3, "not_applicable": 0},
            "d2": {"asked": 3, "scored": 3, "not_applicable": 0},
            "d3": {"asked": 3, "scored": 3, "not_applicable": 0},
            "d4": {"asked": 3, "scored": 3, "not_applicable": 0},
            "d5": {"asked": 3, "scored": 2, "not_applicable": 1},
            "d6": {"asked": 3, "scored": 3, "not_applicable": 0},
        },
    }


def _floor_ignored(payload):
    payload["scores"]["level"] = 2


DATA_BREAKS = [
    ("il punteggio complessivo non torna", _wrong_overall, "valid-complete.json",
     "ricalcolato fa"),
    ("la fascia non corrisponde al punteggio", _wrong_level, "valid-complete.json", "level è"),
    ("una dimensione ha un punteggio inventato", _wrong_dimension, "valid-complete.json", "d3 è"),
    ("counts non copre tutte le dimensioni", _counts_missing, "valid-complete.json",
     "counts di d4"),
    ("counts dice un denominatore che non è quello", _counts_wrong, "valid-complete.json",
     "counts di d2"),
    ("una risposta è fuori dalle opzioni", _answer_out_of_range, "valid-complete.json",
     "non è un'opzione"),
    ("c'è una domanda che l'edizione non ha", _unknown_question, "valid-complete.json",
     "non è una domanda di questa edizione"),
    ("una domanda compare in due liste", _question_in_two_places, "valid-complete.json",
     "uno e un solo posto"),
    ("una domanda non compare da nessuna parte", _question_nowhere, "valid-complete.json",
     "non compare da nessuna parte"),
    ("un file incompleto porta i punteggi", _incomplete_but_scored, "valid-complete.json",
     "non deve avere «scores»"),
    ("l'impronta del questionario non corrisponde", _digest_stale, "valid-complete.json",
     "domande diverse da queste"),
    ("l'edizione dichiarata non è quella", _wrong_edition, "valid-complete.json",
     "dichiara l'edizione"),
    ("il file porta un dato personale in più", _extra_field, "valid-complete.json",
     "non è un campo previsto"),
    ("il formato è di una major che non sappiamo leggere", _bad_schema_version,
     "valid-complete.json", "non ha la forma richiesta"),
    ("manca un campo obbligatorio", _missing_required, "valid-complete.json",
     "campo obbligatorio"),
    ("due risposte che si contraddicono sono state esportate", _contradiction_exported,
     "valid-no-ai.json", "si contraddicono"),
    ("la regola a soglia è stata ignorata nel file", _floor_ignored, "valid-no-ai.json",
     "level è 2"),
]


# -----------------------------------------------------------------------------------------------------------------
#  m a i n
# -----------------------------------------------------------------------------------------------------------------

def _check_fixtures_agree(failures):
    """The published example and the code have to say the same thing.

    `ai-scope-nucleo.md` prints an example with its scores worked out by hand; `valid-complete.json`
    is that example. If the scoring changes and the fixture is regenerated but the document is not,
    the two diverge — so the fixture's own numbers are recomputed here rather than trusted.
    """
    questionnaire = _questionnaire()
    payload = _fixture("valid-complete.json")
    computed = data.score(questionnaire, payload["answers"], payload["skipped"],
                          payload["not_applicable"])
    if computed != payload["scores"]:
        failures.append("valid-complete.json: i punteggi scritti non sono quelli che il codice "
                        f"calcola\n      scritti:     {json.dumps(payload['scores'], sort_keys=True)}"
                        f"\n      ricalcolati: {json.dumps(computed, sort_keys=True)}")

    expected = data.digest(questionnaire)
    for name in sorted(p.name for p in FIXTURES.glob("*.json")):
        found = _fixture(name).get("questionnaire_digest")
        if found != expected:
            failures.append(f"{name}: l'impronta è {found}, il questionario ne ha un'altra.\n"
                            f"      Il valore giusto è {expected}")


def _check_invalid_fixture_fails(failures):
    """The fixture kept on disk precisely to be refused has to keep being refused."""
    questionnaire = _questionnaire()
    for path in sorted(FIXTURES.glob("invalid-*.json")):
        payload, error = data.load(path)
        if error:
            failures.append(f"{path.name}: {error}")
            continue
        problems = []
        data.check_data(questionnaire, payload, problems)
        if not problems:
            failures.append(f"{path.name}: è rotta apposta e nessun controllo l'ha bocciata")


def main():
    failures = []

    baseline = []
    data.check_questionnaire(_questionnaire(), baseline)
    if baseline:
        failures.append("il questionario intatto non passa i controlli: "
                        + "; ".join(baseline))
    baseline = []
    data.check_compliance(_checklist(), _questionnaire(), baseline)
    if baseline:
        failures.append("la checklist intatta non passa i controlli: " + "; ".join(baseline))

    for description, mutate, expected in QUESTIONNAIRE_BREAKS:
        problems = _broken_questionnaire(mutate)
        if not problems:
            failures.append(f"questionario — nessun controllo si accorge che {description}")
        elif not _says(problems, expected):
            failures.append(f"questionario — {description}: qualcosa si è lamentato, ma non il "
                            f"controllo giusto (cercavo «{expected}»).\n      "
                            + "\n      ".join(problems[:3]))

    for description, mutate, expected in CHECKLIST_BREAKS:
        problems = _broken_checklist(mutate)
        if not problems:
            failures.append(f"conformità — nessun controllo si accorge che {description}")
        elif not _says(problems, expected):
            failures.append(f"conformità — {description}: qualcosa si è lamentato, ma non il "
                            f"controllo giusto (cercavo «{expected}»).\n      "
                            + "\n      ".join(problems[:3]))

    for description, mutate, base, expected in DATA_BREAKS:
        problems = _broken_data(mutate, base)
        if not problems:
            failures.append(f"file dei risultati — nessun controllo si accorge che {description}")
        elif not _says(problems, expected):
            failures.append(f"file dei risultati — {description}: qualcosa si è lamentato, ma non "
                            f"il controllo giusto (cercavo «{expected}»).\n      "
                            + "\n      ".join(problems[:3]))

    _check_fixtures_agree(failures)
    _check_invalid_fixture_fails(failures)

    total = len(QUESTIONNAIRE_BREAKS) + len(CHECKLIST_BREAKS) + len(DATA_BREAKS)
    if failures:
        print("\n".join("  " + f for f in failures))
        raise SystemExit(f"\n{len(failures)} controlli non controllano.")
    print(f"OK — {total} regole rotte di proposito, {total} volte il controllo se n'è accorto.\n"
          f"     {len(QUESTIONNAIRE_BREAKS)} sul questionario (parità delle lingue, id, opzioni,\n"
          f"     dimensioni, fasce, regole), {len(CHECKLIST_BREAKS)} sulla conformità (nessuna\n"
          f"     affermazione di stato, fonte e data in ogni voce, scadenza nei dati),\n"
          f"     {len(DATA_BREAKS)} sul file dei risultati (punteggi ricalcolati, partizione\n"
          f"     delle domande, impronta, campi in più).\n"
          f"     E le fixture dicono quello che dice il codice.")


if __name__ == "__main__":
    main()
