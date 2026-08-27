# -*- coding: utf-8 -*-
"""The AI Scope data contract: the questionnaire, the exported file, and the sums between them.

Three things live here, and they live together on purpose.

The *shape* of an exported file is declared once, in `ai-scope/schema.json`, and this module reads
that file instead of restating it — a hand-written copy of the rules next to the machine-readable
one is the "same text in two places" trap the project keeps paying for. What a JSON Schema cannot
express is here as code: that every question sits in exactly one of answers/skipped/not_applicable,
that an incomplete file carries no scores, that `counts` agrees with the arrays, and that the
scores in the file are the scores the answers produce.

The *questionnaire* is checked too, and that check is the point of the whole module. The review of
2026-08-27 found that roughly a thousand strings — questions, options, recommendations — would have
sat outside every guard this repository has, because `_check_i18n` in check_apps.py reads only
`run/i18n.js`. Italian and English drifting apart is the defect the root CLAUDE.md calls the most
frequent one here, and it has already shipped twice. So the guard exists before the strings do.

Nothing in this module runs the app or knows about the DOM: it is a function from data to problems,
which is what makes it testable without a browser — same reasoning as the physics of the games.

Usage:  from ai_scope_data import load, check_questionnaire, check_data
        python3 _src/test_ai_scope_guard.py     # proves the checks actually check
"""

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(__file__).resolve().parent / "ai-scope"
SCHEMA_PATH = DATA_DIR / "schema.json"
FIXTURE_DIR = DATA_DIR / "fixtures"

# The languages every string has to exist in, and the one that may lag while an edition is a draft.
# The order is the order of the site: Italian is written first, English is translated from the
# concept and not from the word — see the root CLAUDE.md.
LANGS = ("it", "en")
DRAFT_LANG = "it"

# Four options per question, worth 0 to 3. Integers, and the reason is in ai-scope-nucleo.md: with
# three questions per dimension a score has ten possible values, so the decimals the first draft
# printed claimed a resolution a hundred times finer than the instrument has.
OPTION_POINTS = [0, 1, 2, 3]

# Anything that looks like a string nobody finished. Cheap to check, and the failure it prevents is
# a placeholder shipped to a reader.
PLACEHOLDER = re.compile(r"\b(TODO|TBD|XXX|FIXME|lorem ipsum)\b|\.\.\.$|…$", re.I)

# An apostrophe standing in for an accent — `piu'` for `più`. It creeps in when a file is written
# defensively, as if JSON could not hold accented characters, and it survives every technical check
# because the string is valid and the meaning is clear. It stops being invisible the moment the
# text is read out loud: the first printed sheet for the live test said "250 o piu'", and that is
# the only place it could have been caught. Elisions — `l'`, `un'`, `dell'` — are correct Italian
# and are not in this list.
FAKE_ACCENT = re.compile(
    r"\b(piu|puo|e|E|si|Si|cosi|perche|gia|meta|cioe|ne|finche|poiche|"
    r"citta|qualita|attivita|novita|liberta|verita|societa|universita|responsabilita)'"
    r"(?=[\s,.:;!?»)]|$)")

# Phrasings that tell the reader they are compliant, or that they are not. The compliance module is
# only defensible because it never does this: it says which obligation exists, from when, and where
# to read it, and leaves the verb to whoever can actually answer. A row that asserts a status is a
# row that becomes false without anyone touching it — and it goes out printed, to a reader we have
# no way of calling back. This is the guard on the rule, because a rule in prose is a reminder.
#
# The first version of this pattern needed the pronoun, so «sei già in regola», «siete a posto»,
# «adempiuto», «nulla da fare qui» and every English phrasing walked straight past it. A guard that
# only catches the phrasing nobody would write is decoration. This one looks for the *predicate* —
# being in order, being covered, having nothing left to do — with the subject optional.
STATUS_CLAIMS = re.compile(
    r"\b(in\s+regola|a\s+norma|a\s+posto|conform[ei]|non\s+conform[ei]|in\s+difetto|"
    r"fuori\s+norma|adempiut[oai]|inadempient[ei]|già\s+copert[oai]|nulla\s+da\s+fare)\b"
    r"|\b(compliant|non-?compliant|in\s+breach|requirement\s+met|no\s+action\s+needed)\b"
    r"|\b(rischi|rischiate|rischia)\s+(una\s+)?sanzion",
    re.I)

# Where a status claim is legitimate, named exactly rather than by substring. The first version
# exempted any path *containing* "disclaimer", which would have turned a future `disclaimer_hub` or
# `notes.disclaimer` into an arbitrarily large free zone — the exemption growing by accident is the
# way a rule stops applying without anyone deciding it should.
STATUS_CLAIM_ALLOWED = {"disclaimer.it", "disclaimer.en",
                        "disclaimer_for_distributors.it", "disclaimer_for_distributors.en",
                        # `note` is the file's own comment, never rendered and already excluded
                        # from the digest. It states the rule — "no row ever says the reader is
                        # compliant" — so it necessarily contains the words the rule forbids.
                        "note"}


# -----------------------------------------------------------------------------------------------------------------
#  l o a d i n g
# -----------------------------------------------------------------------------------------------------------------

def load(path):
    """Read a JSON file, returning (value, error). Never raises: callers collect problems."""
    path = Path(path)
    if not path.is_file():
        return None, f"{path.name}: il file non esiste"
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except json.JSONDecodeError as err:
        return None, f"{path.name}: JSON non valido alla riga {err.lineno} ({err.msg})"


def editions():
    """Every questionnaire edition on disk, oldest first."""
    if not DATA_DIR.is_dir():
        return []
    found = []
    for path in DATA_DIR.glob("questionnaire-*.json"):
        match = re.fullmatch(r"questionnaire-(\d+)", path.stem)
        if match:
            found.append((int(match.group(1)), path))
    return [path for _, path in sorted(found)]


def digest(questionnaire):
    """The fingerprint an exported file carries, so a fork that changed the questions is visible.

    Canonical form: sorted keys, no whitespace, UTF-8. The `note` field is excluded because it is
    prose for whoever opens the file — changing a comma in it must not invalidate every archived
    result. Everything that affects an answer's meaning is in.
    """
    body = {key: value for key, value in questionnaire.items() if key != "note"}
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# -----------------------------------------------------------------------------------------------------------------
#  s c h e m a
# -----------------------------------------------------------------------------------------------------------------

def _type_ok(value, wanted):
    if wanted == "object":
        return isinstance(value, dict)
    if wanted == "array":
        return isinstance(value, list)
    if wanted == "string":
        return isinstance(value, str)
    if wanted == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if wanted == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if wanted == "boolean":
        return isinstance(value, bool)
    return True


def _matches(schema, value):
    """Does `value` satisfy `schema`? Used only for the `if` of an if/then, so it stays quiet."""
    scratch = []
    _validate(schema, value, "", scratch)
    return not scratch


def _validate(schema, value, where, problems):
    """A deliberately small JSON Schema subset — enough for schema.json, and no dependency.

    The alternative was a library, and the app rules forbid a toolchain that rots: a check that
    stops working after `pip install` fails is a check nobody runs. The subset covers what
    schema.json actually uses, and `check_schema_features` below refuses any keyword this does not
    implement — so the file can never quietly outgrow its own validator.
    """
    label = where or "il file"

    if "enum" in schema and value not in schema["enum"]:
        problems.append(f"{label}: {value!r} non è fra i valori ammessi {schema['enum']}")
        return
    if "const" in schema and value != schema["const"]:
        problems.append(f"{label}: {value!r} non è {schema['const']!r}")
        return
    if "type" in schema and not _type_ok(value, schema["type"]):
        problems.append(f"{label}: doveva essere {schema['type']}, è {type(value).__name__}")
        return

    if isinstance(value, str):
        if "pattern" in schema and not re.search(schema["pattern"], value):
            problems.append(f"{label}: {value!r} non ha la forma richiesta")
        if "minLength" in schema and len(value) < schema["minLength"]:
            problems.append(f"{label}: più corto di {schema['minLength']} caratteri")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            problems.append(f"{label}: più lungo di {schema['maxLength']} caratteri")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            problems.append(f"{label}: {value} è sotto il minimo {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            problems.append(f"{label}: {value} è sopra il massimo {schema['maximum']}")

    if isinstance(value, list):
        if schema.get("uniqueItems") and len(value) != len({json.dumps(v) for v in value}):
            problems.append(f"{label}: contiene doppioni")
        for index, item in enumerate(value):
            if "items" in schema:
                _validate(schema["items"], item, f"{label}[{index}]", problems)

    if isinstance(value, dict):
        for name in schema.get("required", []):
            if name not in value:
                problems.append(f"{label}: manca il campo obbligatorio «{name}»")
        properties = schema.get("properties", {})
        for name, item in value.items():
            spot = f"{label}.{name}" if where else name
            if "propertyNames" in schema:
                _validate(schema["propertyNames"], name, f"{label}: la chiave {name!r}", problems)
            if name in properties:
                _validate(properties[name], item, spot, problems)
            elif "additionalProperties" in schema:
                extra = schema["additionalProperties"]
                if extra is False:
                    problems.append(f"{label}: «{name}» non è un campo previsto")
                elif isinstance(extra, dict):
                    _validate(extra, item, spot, problems)

    for branch in schema.get("allOf", []):
        if "if" in branch:
            if _matches(branch["if"], value):
                _validate(branch.get("then", {}), value, where, problems)
            elif "else" in branch:
                _validate(branch["else"], value, where, problems)
        else:
            _validate(branch, value, where, problems)

    if "not" in schema and _matches(schema["not"], value):
        if "required" in schema["not"]:
            missing = ", ".join(schema["not"]["required"])
            problems.append(f"{label}: non deve avere «{missing}»")
        else:
            problems.append(f"{label}: soddisfa una condizione vietata")


# Every keyword `_validate` implements. The point is the refusal: if someone adds `oneOf` or
# `dependentRequired` to schema.json, this list makes the omission loud instead of letting the
# keyword be silently ignored — which is how a schema stops checking what it says it checks.
KNOWN_KEYWORDS = {
    "$schema", "$id", "title", "description", "type", "required", "properties",
    "additionalProperties", "propertyNames", "items", "uniqueItems", "enum", "const",
    "pattern", "minLength", "maxLength", "minimum", "maximum", "allOf", "if", "then",
    "else", "not", "format",
}


def check_schema_features(schema, problems, where="schema.json"):
    """The validator above and schema.json have to stay in step. Nothing else would notice."""
    if isinstance(schema, dict):
        for key, value in schema.items():
            if key in ("properties", "patternProperties"):
                for name, sub in value.items():
                    check_schema_features(sub, problems, f"{where}.{name}")
                continue
            if key not in KNOWN_KEYWORDS:
                problems.append(f"{where}: la parola chiave «{key}» non è implementata in "
                                f"_validate — verrebbe ignorata in silenzio")
            if isinstance(value, (dict, list)):
                check_schema_features(value, problems, f"{where}.{key}")
    elif isinstance(schema, list):
        for index, item in enumerate(schema):
            check_schema_features(item, problems, f"{where}[{index}]")


# -----------------------------------------------------------------------------------------------------------------
#  q u e s t i o n n a i r e
# -----------------------------------------------------------------------------------------------------------------

def _texts(node, where, found):
    """Collect every translatable node, depth first, as (where, dict)."""
    if isinstance(node, dict):
        if "it" in node or "en" in node:
            found.append((where, node))
            return
        for key, value in node.items():
            _texts(value, f"{where}.{key}" if where else key, found)
    elif isinstance(node, list):
        for index, item in enumerate(node):
            _texts(item, f"{where}[{index}]", found)


def language_debt(questionnaire):
    """How many strings each language is still missing. Visible debt, not silent debt."""
    found = []
    _texts(questionnaire, "", found)
    return {lang: sum(1 for _, node in found if not node.get(lang, "").strip())
            for lang in LANGS}


def check_questionnaire(questionnaire, problems, name="questionnaire"):
    """The guard that had to exist before the strings did.

    Two families of check, and the second is the reason for the module. The first is structure —
    six dimensions, three scored questions each, four options worth 0 to 3 — because a questionnaire
    whose shape drifts produces scores that cannot be compared with last year's. The second is
    parity: every translatable node carries every language, so a correction applied to one language
    alone cannot ship. That is the defect the root CLAUDE.md says has already reached production
    twice, and until now nothing here was watching the file that will hold most of the text.
    """
    status = questionnaire.get("status")
    if status not in ("draft", "published"):
        problems.append(f"{name}: status è {status!r}, atteso «draft» o «published»")
    edition = questionnaire.get("edition")
    if not isinstance(edition, int) or isinstance(edition, bool) or edition < 1:
        problems.append(f"{name}: edition dev'essere un intero positivo, è {edition!r}")

    dimensions = questionnaire.get("dimensions", [])
    dim_ids = [d.get("id") for d in dimensions]
    if len(dimensions) != 6:
        problems.append(f"{name}: le dimensioni sono {len(dimensions)}, attese 6")
    if len(set(dim_ids)) != len(dim_ids):
        problems.append(f"{name}: due dimensioni hanno lo stesso id")

    questions = questionnaire.get("questions", [])
    ids = [q.get("id") for q in questions]
    if len(set(ids)) != len(ids):
        problems.append(f"{name}: due domande hanno lo stesso id")
    for index, qid in enumerate(ids, start=1):
        if not isinstance(qid, str) or not re.fullmatch(r"q\d{3}", qid or ""):
            problems.append(f"{name}: «{qid}» non è un id nella forma qNNN")
        elif qid != f"q{index:03d}":
            problems.append(f"{name}: {qid} è in posizione {index} — gli id sono contigui, e non "
                            f"si rinumerano: un id è una promessa verso i file già archiviati")

    by_dimension = {}
    for question in questions:
        qid = question.get("id")
        scored = question.get("scored")
        dimension = question.get("dimension")
        if scored:
            if dimension not in dim_ids:
                problems.append(f"{name}/{qid}: dimensione {dimension!r} non dichiarata")
            by_dimension.setdefault(dimension, []).append(qid)
        elif dimension is not None:
            problems.append(f"{name}/{qid}: non fa punteggio ma dichiara la dimensione {dimension!r}")

        options = question.get("options", [])
        if [o.get("points") for o in options] != OPTION_POINTS:
            problems.append(f"{name}/{qid}: i punti delle opzioni sono "
                            f"{[o.get('points') for o in options]}, attesi {OPTION_POINTS} in "
                            f"quest'ordine — dalla peggiore alla migliore")

        for field in ("not_applicable", "variant"):
            block = question.get(field)
            if block is None:
                continue
            when = block.get("when")
            if when is True:
                continue
            if not isinstance(when, dict) or not when:
                problems.append(f"{name}/{qid}: «{field}.when» dev'essere true o una condizione")
                continue
            for other, values in when.items():
                _check_condition(questions, other, values, f"{name}/{qid}/{field}", problems)

    for dimension in dim_ids:
        count = len(by_dimension.get(dimension, []))
        if count != 3:
            problems.append(f"{name}: la dimensione {dimension} ha {count} domande a punteggio, "
                            f"attese 3 — le dimensioni pesano uguale, quindi devono contare uguale")

    _check_bands(questionnaire, problems, name)
    _check_rules(questionnaire, problems, name)
    _check_parity(questionnaire, problems, name, status)


def _check_condition(questions, other, values, where, problems):
    """A rule that names a question or an option index that does not exist is a rule that never fires."""
    target = next((q for q in questions if q.get("id") == other), None)
    if target is None:
        problems.append(f"{where}: nomina «{other}», che non è una domanda")
        return
    top = len(target.get("options", [])) - 1
    for value in (values if isinstance(values, list) else [values]):
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= top:
            problems.append(f"{where}: {other}={value!r} non è un'opzione di quella domanda")


def _check_bands(questionnaire, problems, name):
    bands = questionnaire.get("bands", [])
    if len(bands) != 4:
        problems.append(f"{name}: le fasce sono {len(bands)}, attese 4")
        return
    edge = 0
    for band in bands:
        if band.get("from") != edge:
            problems.append(f"{name}: la fascia che parte da {band.get('from')} lascia un buco o "
                            f"si sovrappone alla precedente, che finisce a {edge - 1}")
        edge = band.get("to", edge) + 1
    if edge != 101:
        problems.append(f"{name}: le fasce arrivano a {edge - 1}, non a 100")


def _check_rules(questionnaire, problems, name):
    rules = questionnaire.get("rules", {})
    questions = questionnaire.get("questions", [])
    for rule in rules.get("skip", []):
        for other, values in (rule.get("when") or {}).items():
            _check_condition(questions, other, values, f"{name}/rules.skip", problems)
        if rule.get("as") not in ("skipped", "not_applicable"):
            problems.append(f"{name}/rules.skip: «as» è {rule.get('as')!r}, atteso «skipped» o "
                            f"«not_applicable» — sono due cose diverse: la prima vale zero e resta "
                            f"nel denominatore, la seconda ne esce")
        for qid in rule.get("questions", []):
            if qid not in [q.get("id") for q in questions]:
                problems.append(f"{name}/rules.skip: nomina «{qid}», che non è una domanda")
    floor = rules.get("floor")
    if floor:
        for other, values in (floor.get("when") or {}).items():
            _check_condition(questions, other, values, f"{name}/rules.floor", problems)
        if floor.get("band") != 0:
            problems.append(f"{name}/rules.floor: la fascia minima è {floor.get('band')!r}, attesa 0")
    for rule in rules.get("coherence", []):
        for other, value in (rule.get("forbid") or {}).items():
            _check_condition(questions, other, value, f"{name}/rules.coherence", problems)
    branch = rules.get("branch")
    if branch:
        for other, values in (branch.get("when") or {}).items():
            _check_condition(questions, other, values, f"{name}/rules.branch", problems)


def _check_parity(questionnaire, problems, name, status):
    """Same keys in both languages, and no half-finished string in either.

    Written as its own function because it is the reason the module exists, and because the rule it
    enforces is older than this app: a correction applied to one language alone is the most frequent
    mistake in this repository, and it has been online twice.
    """
    found = []
    _texts(questionnaire, "", found)
    if not found:
        problems.append(f"{name}: non contiene nessuna stringa traducibile — la forma è cambiata "
                        f"e questo controllo non sta più controllando niente")
        return

    for where, node in found:
        unknown = set(node) - set(LANGS)
        if unknown:
            problems.append(f"{name}/{where}: lingua sconosciuta {sorted(unknown)}")
        for lang in LANGS:
            text = node.get(lang)
            if text is None:
                if status == "published":
                    problems.append(f"{name}/{where}: manca «{lang}» — un'edizione pubblicata ha "
                                    f"tutte le lingue")
                elif lang == DRAFT_LANG:
                    problems.append(f"{name}/{where}: manca «{lang}», che è la lingua di partenza")
                continue
            if not isinstance(text, str) or not text.strip():
                problems.append(f"{name}/{where}: «{lang}» è vuoto — una stringa vuota è peggio di "
                                f"una mancante: sembra tradotta")
            elif PLACEHOLDER.search(text.strip()):
                problems.append(f"{name}/{where}: «{lang}» sembra un segnaposto: {text.strip()!r}")
            elif lang == "it":
                fake = FAKE_ACCENT.search(text)
                if fake:
                    problems.append(f"{name}/{where}: «{fake.group(0)}» usa l'apostrofo al posto "
                                    f"dell'accento. Questo testo viene letto ad alta voce e "
                                    f"stampato: si scrive con l'accento")


# -----------------------------------------------------------------------------------------------------------------
#  s c o r i n g
# -----------------------------------------------------------------------------------------------------------------

def _round_half_up(value):
    """Deliberately not `round()`, which rounds half to even: 55.5 would become 56 here and 56
    there depending on the neighbour, and two implementations of the same rule would disagree on
    exactly the values a reader is most likely to check by hand."""
    return int(value + 0.5) if value >= 0 else -int(-value + 0.5)


def derive(questionnaire, answers):
    """What the rules decide on their own: which questions are skipped, which do not apply.

    Kept apart from `score` so a caller can see *why* a question left the denominator, and so the
    app and this checker cannot disagree about it.
    """
    skipped, not_applicable = [], []
    for rule in questionnaire.get("rules", {}).get("skip", []):
        fires = all(answers.get(other) in values
                    for other, values in (rule.get("when") or {}).items())
        if not fires:
            continue
        for qid in rule.get("questions", []):
            (skipped if rule.get("as") == "skipped" else not_applicable).append(qid)
    return sorted(skipped), sorted(not_applicable)


def incoherent(questionnaire, answers):
    """Answer pairs that contradict each other. Today there is one, and it is deliberate."""
    clashes = []
    for rule in questionnaire.get("rules", {}).get("coherence", []):
        forbid = rule.get("forbid") or {}
        if all(answers.get(qid) == value for qid, value in forbid.items()):
            clashes.append(forbid)
    return clashes


def score(questionnaire, answers, skipped, not_applicable):
    """Points to percentages, by the rules written in ai-scope-nucleo.md under «Il conto».

    Skipped questions count as zero and stay in the denominator; not-applicable ones leave it. That
    distinction is the whole reason both lists exist: a company using no AI must not score well by
    having its weak dimensions quietly excluded.
    """
    skipped, not_applicable = set(skipped), set(not_applicable)
    dimensions, counts = {}, {}

    for dimension in [d["id"] for d in questionnaire.get("dimensions", [])]:
        earned = possible = scored = na = asked = 0
        for question in questionnaire.get("questions", []):
            if not question.get("scored") or question.get("dimension") != dimension:
                continue
            asked += 1
            qid = question["id"]
            if qid in not_applicable:
                na += 1
                continue
            top = max(o["points"] for o in question["options"])
            possible += top
            scored += 1
            if qid not in skipped:
                chosen = answers.get(qid)
                # An index outside the options counts as zero rather than raising. `check_data`
                # rejects such a file before ever asking for a score, so this is the belt to that
                # brace — and a library function that crashes on bad input turns a reported problem
                # into a stack trace, which is a worse failure than a wrong number.
                if chosen is not None and 0 <= chosen < len(question["options"]):
                    earned += question["options"][chosen]["points"]
        counts[dimension] = {"asked": asked, "scored": scored, "not_applicable": na}
        dimensions[dimension] = _round_half_up(earned / possible * 100) if possible else 0

    overall = (_round_half_up(sum(dimensions.values()) / len(dimensions))
               if dimensions else 0)

    level = 0
    for index, band in enumerate(questionnaire.get("bands", [])):
        if band["from"] <= overall <= band["to"]:
            level = index
    floor = questionnaire.get("rules", {}).get("floor")
    if floor and all(answers.get(other) in values
                     for other, values in (floor.get("when") or {}).items()):
        # The threshold rule, and the worst defect the review found: without it a company that uses
        # no AI at all could reach the third band of four by inflating the three cheapest
        # dimensions. An instrument that tells someone who has not started that they are nearly in
        # production does the exact harm the plan exists to avoid.
        level = min(level, floor.get("band", 0))

    return {"overall": overall, "level": level, "dimensions": dimensions, "counts": counts}


# -----------------------------------------------------------------------------------------------------------------
#  d a t a   f i l e
# -----------------------------------------------------------------------------------------------------------------

def check_data(questionnaire, data, problems, name="file"):
    """An exported file against the contract: shape from schema.json, invariants from here."""
    schema, error = load(SCHEMA_PATH)
    if error:
        problems.append(error)
        return
    _validate(schema, data, "", problems)
    if problems:
        return                                        # the shape is wrong; the sums would lie

    if data.get("questionnaire_edition") != questionnaire.get("edition"):
        problems.append(f"{name}: dichiara l'edizione {data.get('questionnaire_edition')}, "
                        f"il questionario è la {questionnaire.get('edition')}")
        return
    expected = digest(questionnaire)
    if data.get("questionnaire_digest") != expected:
        problems.append(f"{name}: l'impronta del questionario non corrisponde — il file viene da "
                        f"domande diverse da queste, pur dichiarando la stessa edizione")

    ids = [q["id"] for q in questionnaire.get("questions", [])]
    answers = data.get("answers", {})
    skipped = data.get("skipped", [])
    not_applicable = data.get("not_applicable", [])

    for qid in list(answers) + list(skipped) + list(not_applicable):
        if qid not in ids:
            problems.append(f"{name}: «{qid}» non è una domanda di questa edizione")

    for qid in ids:
        places = [where for where, group in (("answers", answers), ("skipped", skipped),
                                             ("not_applicable", not_applicable)) if qid in group]
        if len(places) > 1:
            problems.append(f"{name}: {qid} compare in {' e '.join(places)} — ogni domanda sta in "
                            f"uno e un solo posto")
        elif not places and data.get("complete"):
            problems.append(f"{name}: {qid} non compare da nessuna parte, ma il file si dichiara "
                            f"completo — un id assente significa «non raggiunta»")

    # How many options a question has is the questionnaire's business, not the schema's: schema.json
    # deliberately sets no upper bound on an answer, so this is the only place that knows. The
    # alternative was the same number written twice, and the copy in the schema would be the one
    # left behind the day a question gains an option.
    for qid, chosen in answers.items():
        question = next((q for q in questionnaire["questions"] if q["id"] == qid), None)
        if question and not 0 <= chosen < len(question.get("options", [])):
            problems.append(f"{name}: {qid}={chosen} non è un'opzione di quella domanda")
    if problems:
        return                                        # the answers are unreadable; sums would lie

    _check_derived(questionnaire, data, problems, name)

    if not data.get("complete"):
        return                                        # an unfinished file carries no sums to check
    _check_scores(questionnaire, data, problems, name)


def _check_derived(questionnaire, data, problems, name):
    """What the rules decide cannot be decided differently by whoever wrote the file."""
    answers = data.get("answers", {})
    want_skipped, want_na = derive(questionnaire, answers)
    for qid in want_skipped:
        if qid not in data.get("skipped", []):
            problems.append(f"{name}: {qid} doveva essere saltata per le risposte date")
    for qid in want_na:
        if qid not in data.get("not_applicable", []):
            problems.append(f"{name}: {qid} doveva risultare non applicabile per le risposte date")
    for clash in incoherent(questionnaire, answers):
        pair = ", ".join(f"{qid}={value}" for qid, value in clash.items())
        problems.append(f"{name}: risposte che si contraddicono ({pair}) — l'app doveva farlo "
                        f"notare invece di esportarle")


def _check_scores(questionnaire, data, problems, name):
    computed = score(questionnaire, data.get("answers", {}), data.get("skipped", []),
                     data.get("not_applicable", []))
    written = data.get("scores", {})
    if written.get("overall") != computed["overall"]:
        problems.append(f"{name}: overall è {written.get('overall')}, ricalcolato fa "
                        f"{computed['overall']}")
    if written.get("level") != computed["level"]:
        problems.append(f"{name}: level è {written.get('level')}, ricalcolato fa {computed['level']}")
    for dimension, value in computed["dimensions"].items():
        if written.get("dimensions", {}).get(dimension) != value:
            problems.append(f"{name}: {dimension} è {written.get('dimensions', {}).get(dimension)}, "
                            f"ricalcolato fa {value}")
    for dimension, value in computed["counts"].items():
        if written.get("counts", {}).get(dimension) != value:
            problems.append(f"{name}: counts di {dimension} è "
                            f"{written.get('counts', {}).get(dimension)}, atteso {value}")
    extra = set(written.get("dimensions", {})) - set(computed["dimensions"])
    if extra:
        problems.append(f"{name}: dimensioni che non esistono nel questionario: {sorted(extra)}")


# -----------------------------------------------------------------------------------------------------------------
#  a l l   o f   i t
# -----------------------------------------------------------------------------------------------------------------

def check_compliance(checklist, questionnaire, problems, name="compliance"):
    """The checklist, against the three rules that let it into the first release.

    The review of 2026-08-27 called putting this module in the app the decision most likely to turn
    out wrong: it carries the hardest prose to keep in two languages, the only real exposure, and
    the fastest decay — the line about FISA 702 is false from March 2027 — welded to a tool that by
    construction cannot call its users back. The answer was not to drop it but to make it age like
    an article instead of like a claim, and these are the three rules that do it, checked rather
    than remembered:

    every row names the source it can be verified against; every row that has a starting date says
    it; and no row anywhere tells the reader they are compliant. The last one is the load-bearing
    rule. A sentence saying which obligation exists stays true until the law changes and then reads
    as dated; a sentence saying somebody is in order becomes false on its own, on a sheet of paper
    somebody printed.
    """
    verified = checklist.get("verified_on")
    expires = checklist.get("valid_until")
    for field, value in (("verified_on", verified), ("valid_until", expires)):
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value or ""):
            problems.append(f"{name}: «{field}» è {value!r}, attesa una data AAAA-MM-GG — la "
                            f"scadenza sta nei dati apposta, perché è l'unico richiamo che uno "
                            f"strumento senza server può avere")
    if verified and expires and expires <= verified:
        problems.append(f"{name}: valid_until ({expires}) non è dopo verified_on ({verified})")

    items = checklist.get("items", [])
    if not items:
        problems.append(f"{name}: nessuna voce")
        return
    ids = [item.get("id") for item in items]
    if len(set(ids)) != len(ids):
        problems.append(f"{name}: due voci hanno lo stesso id")
    for index, cid in enumerate(ids, start=1):
        if not isinstance(cid, str) or not re.fullmatch(r"c\d{3}", cid or ""):
            problems.append(f"{name}: «{cid}» non è un id nella forma cNNN")
        elif cid != f"c{index:03d}":
            problems.append(f"{name}: {cid} è in posizione {index} — gli id sono contigui e non si "
                            f"riusano, come quelli delle domande")

    question_ids = [q.get("id") for q in questionnaire.get("questions", [])]
    for item in items:
        cid = item.get("id")
        source = item.get("source") or {}
        if not source.get("url") or not source.get("label"):
            problems.append(f"{name}/{cid}: manca la fonte — una voce che non si può controllare "
                            f"da fuori chiede di fidarsi, ed è esattamente quello che questo "
                            f"modulo non deve chiedere")
        # `applies_from` is required, not optional. The review found seven rows without any date at
        # all, while the module's own rule says every row carries one — and the check only
        # validated the format *if the field existed*, so it was watching everything except the
        # rule it was there to defend.
        if not item.get("applies_from"):
            problems.append(f"{name}/{cid}: manca «applies_from» — ogni voce dice da quando "
                            f"l'obbligo esiste, altrimenti chi ritrova il foglio stampato non può "
                            f"sapere se sia ancora la stessa cosa")
        for field in ("applies_from", "enforced_from", "changes_on"):
            value = item.get(field)
            if value is not None and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(value)):
                problems.append(f"{name}/{cid}: «{field}» è {value!r}, attesa una data AAAA-MM-GG")
        # A row that already knows when it will change cannot outlive that date inside a checklist
        # that declares itself current. This is what turns `valid_until` from a guess into a
        # derived value: the file expires no later than the first change it already knows about.
        changes = item.get("changes_on")
        if changes and expires and changes <= expires:
            problems.append(f"{name}/{cid}: cambia il {changes}, ma la checklist si dichiara "
                            f"valida fino al {expires} — la scadenza del file non può superare la "
                            f"prima modifica che già conosce")
        when = item.get("when")
        if when is not None:
            if not isinstance(when, dict) or not when:
                problems.append(f"{name}/{cid}: «when» dev'essere una condizione")
            else:
                for other, values in when.items():
                    _check_condition(questionnaire.get("questions", []), other, values,
                                     f"{name}/{cid}/when", problems)
        if not item.get("obligation", {}).get(DRAFT_LANG, "").strip():
            problems.append(f"{name}/{cid}: manca il testo dell'obbligo")
        _ = question_ids                                # kept for the condition check above

    warn = checklist.get("warn_days")
    if not isinstance(warn, int) or isinstance(warn, bool) or warn < 1:
        problems.append(f"{name}: «warn_days» è {warn!r}, atteso un intero di giorni. Senza "
                        f"preavviso la scadenza è un interruttore: un report stampato il giorno "
                        f"prima esce pulito e diventa vecchio il giorno dopo, in mano a chi non "
                        f"sa che era al limite")

    _check_no_status_claims(checklist, problems, name)
    _check_parity(checklist, problems, name, checklist.get("status"))
    for field in ("disclaimer", "disclaimer_for_distributors", "scope"):
        if not checklist.get(field, {}).get(DRAFT_LANG, "").strip():
            problems.append(f"{name}: manca «{field}». Il disclaimer, quello per chi ridistribuisce "
                            f"e l'ambito territoriale vanno dentro il modulo, non lasciati "
                            f"all'interfaccia che lo mostra: sono il modulo, non la sua cornice")


def _check_no_status_claims(node, problems, name, where=""):
    """No sentence anywhere in the checklist tells the reader whether they are compliant."""
    if isinstance(node, dict):
        for key, value in node.items():
            _check_no_status_claims(value, problems, name, f"{where}.{key}" if where else key)
    elif isinstance(node, list):
        for index, item in enumerate(node):
            _check_no_status_claims(item, problems, name, f"{where}[{index}]")
    elif isinstance(node, str):
        found = STATUS_CLAIMS.search(node)
        if found and where not in STATUS_CLAIM_ALLOWED:
            problems.append(f"{name}/{where}: «{found.group(0)}» afferma uno stato. La checklist "
                            f"dice quale obbligo esiste e da quando, non se chi legge sia in "
                            f"regola: quella frase invecchia diventando falsa, su un foglio già "
                            f"stampato e senza modo di richiamare nessuno")


def check_against_notes(questionnaire, problems):
    """The questionnaire and the document that explains it have to quote the same questions.

    Writing `questionnaire-1.json` created exactly the defect the review had just found in the
    plan: the wording of every question now lives twice — as prose in `fonti/ai-scope-nucleo.md`,
    where the reasoning is, and as data here, where the app reads it. Two copies of the same
    sentence diverge; this repository has the scars to prove it.

    Removing the prose was the wrong fix, because the commentary next to each question is the
    reason anyone can revise it later. So the text stays in both, and a check keeps them equal —
    the same trade the project already makes for the two footers and the home bullets.

    The document is in `_src/fonti/`, which is gitignored, so on a fresh clone there is nothing to
    compare and the check steps aside instead of failing.
    """
    notes = ROOT / "_src" / "fonti" / "ai-scope-nucleo.md"
    if not notes.is_file():
        return
    text = notes.read_text(encoding="utf-8")

    quoted = dict(re.findall(r"^### (q\d{3}) · (.+?)\s*$", text, re.M))
    if not quoted:
        problems.append("ai-scope-nucleo.md: non trovo nessuna intestazione «### qNNN · …» — il "
                        "documento ha cambiato forma e questo confronto non confronta più niente")
        return

    for question in questionnaire.get("questions", []):
        qid = question["id"]
        written = question.get("text", {}).get("it", "")
        if qid not in quoted:
            problems.append(f"ai-scope-nucleo.md: {qid} è nel questionario ma non nel documento")
            continue
        # The JSON has no accented characters on purpose — it is read by machines and by whoever
        # forks it — so the two are compared with accents folded rather than kept apart by them.
        if _fold(quoted[qid]) != _fold(written):
            problems.append(f"{qid}: il documento e il questionario dicono due cose diverse.\n"
                            f"      documento:    {quoted[qid]}\n"
                            f"      questionario: {written}")
    for qid in sorted(set(quoted) - {q["id"] for q in questionnaire.get("questions", [])}):
        problems.append(f"ai-scope-nucleo.md: {qid} è nel documento ma non nel questionario")


def _fold(text):
    """Compare wording, not typography: accents, apostrophes and dashes vary between the two files."""
    swaps = {"à": "a'", "è": "e'", "é": "e'", "ì": "i'", "ò": "o'", "ù": "u'",
             "’": "'", "—": "-", "–": "-", " ": " "}
    for old, new in swaps.items():
        text = text.replace(old, new)
    return " ".join(text.lower().split())


def check_all(problems):
    """Everything AI Scope has on disk. Called by check_apps.py so it runs with what already runs."""
    if not DATA_DIR.is_dir():
        return []

    schema, error = load(SCHEMA_PATH)
    if error:
        problems.append(error)
        return []
    check_schema_features(schema, problems)

    found = editions()
    if not found:
        problems.append("ai-scope: nessun questionnaire-N.json — il contratto non ha domande")
        return []

    notes = []
    for path in found:
        questionnaire, error = load(path)
        if error:
            problems.append(error)
            continue
        check_questionnaire(questionnaire, problems, path.name)
        check_against_notes(questionnaire, problems)
        debt = language_debt(questionnaire)
        missing = {lang: count for lang, count in debt.items() if count}
        if missing and questionnaire.get("status") == "draft":
            detail = ", ".join(f"{count} in {lang}" for lang, count in sorted(missing.items()))
            notes.append(f"{path.name} è in bozza: mancano {detail}. "
                         f"Con status «published» il controllo si ferma.")

        checklist_path = DATA_DIR / f"compliance-{questionnaire.get('edition')}.json"
        if checklist_path.is_file():
            checklist, error = load(checklist_path)
            if error:
                problems.append(error)
            else:
                check_compliance(checklist, questionnaire, problems, checklist_path.name)
                debt = language_debt(checklist)
                missing = {lang: count for lang, count in debt.items() if count}
                if missing and checklist.get("status") == "draft":
                    detail = ", ".join(f"{count} in {lang}" for lang, count in sorted(missing.items()))
                    notes.append(f"{checklist_path.name} è in bozza: mancano {detail}.")
                notes.append(f"{checklist_path.name}: norme verificate il "
                             f"{checklist.get('verified_on')}, da rileggere entro il "
                             f"{checklist.get('valid_until')}.")

        for fixture in sorted(FIXTURE_DIR.glob("*.json")) if FIXTURE_DIR.is_dir() else []:
            data, error = load(fixture)
            if error:
                problems.append(error)
                continue
            if data.get("questionnaire_edition") != questionnaire.get("edition"):
                continue
            expected_bad = fixture.stem.startswith("invalid-")
            scratch = []
            check_data(questionnaire, data, scratch, fixture.name)
            if expected_bad and not scratch:
                problems.append(f"{fixture.name}: è una fixture rotta apposta e nessun controllo "
                                f"l'ha bocciata — il contratto non sta controllando")
            elif not expected_bad and scratch:
                problems.extend(scratch)
    return notes
