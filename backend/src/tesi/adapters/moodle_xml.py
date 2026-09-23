"""Lettura e scrittura del formato "XML Moodle" per domande di tipo CodeRunner.

Moodle legge i campi per nome, non per posizione, quindi l'ordine degli elementi
in uscita non conta. I testi vengono scritti con l'escape XML invece che in CDATA:
per un parser XML le due forme sono equivalenti.
"""

import xml.etree.ElementTree as ET

from tesi.domain import Question, TestCase


class MoodleXmlError(ValueError):
    """Il file non è un XML Moodle valido."""


# Campi mappati esplicitamente sul dominio; tutti gli altri finiscono in Question.settings.
_MAPPED = {
    "name", "questiontext", "generalfeedback", "defaultgrade", "coderunnertype",
    "answer", "answerpreload", "testcases", "tags",
}

# Valori usati dal docente negli XML reali: applicati agli esercizi creati da zero.
DEFAULT_SETTINGS: dict[str, str] = {
    "penalty": "0.0000000",
    "hidden": "0",
    "idnumber": "",
    "prototypetype": "0",
    "allornothing": "1",
    "penaltyregime": "0",
    "precheck": "0",
    "hidecheck": "0",
    "showsource": "0",
    "answerboxlines": "20",
    "answerboxcolumns": "100",
    "globalextra": "",
    "useace": "",
    "resultcolumns": "",
    "template": "",
    "iscombinatortemplate": "",
    "allowmultiplestdins": "",
    "validateonsave": "1",
    "testsplitterre": "",
    "language": "",
    "acelang": "",
    "sandbox": "",
    "grader": "",
    "cputimelimitsecs": "",
    "memlimitmb": "",
    "sandboxparams": "",
    "templateparams": "",
    "hoisttemplateparams": "1",
    "extractcodefromjson": "1",
    "templateparamslang": "python3",
    "templateparamsevalpertry": "0",
    "templateparamsevald": "{}",
    "twigall": "0",
    "uiplugin": "",
    "uiparameters": '{\n    "live_autocompletion": true\n}',
    "attachments": "0",
    "attachmentsrequired": "0",
    "maxfilesize": "10240",
    "filenamesregex": "",
    "filenamesexplain": "",
    "displayfeedback": "1",
    "giveupallowed": "0",
    "prototypeextra": "",
}


# ---------------------------------------------------------------- lettura

def parse_quiz(data: str | bytes) -> list[Question]:
    """Legge un file XML Moodle e restituisce le domande CodeRunner che contiene.

    Le voci di altro tipo (es. le categorie che Moodle aggiunge all'export) sono ignorate.
    """
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise MoodleXmlError(f"XML non valido: {exc}") from exc
    if root.tag != "quiz":
        raise MoodleXmlError(f"Elemento radice atteso <quiz>, trovato <{root.tag}>")
    return [
        _parse_question(el) for el in root.findall("question")
        if el.get("type") == "coderunner"
    ]


def _parse_question(el: ET.Element) -> Question:
    settings = {
        child.tag: child.text or ""
        for child in el
        if child.tag not in _MAPPED and len(child) == 0
    }
    return Question(
        name=_text(el, "name/text"),
        text_html=_text(el, "questiontext/text"),
        solution=_text(el, "answer"),
        student_code=_text(el, "answerpreload"),
        testcases=[_parse_testcase(tc) for tc in el.findall("testcases/testcase")],
        coderunner_type=_text(el, "coderunnertype"),
        default_grade=float(_text(el, "defaultgrade") or 1),
        general_feedback_html=_text(el, "generalfeedback/text"),
        tags=[_text(tag, "text").strip() for tag in el.findall("tags/tag")],
        settings=settings,
    )


def _parse_testcase(el: ET.Element) -> TestCase:
    return TestCase(
        stdin=_text(el, "stdin/text"),
        expected=_text(el, "expected/text"),
        use_as_example=el.get("useasexample") == "1",
        hide_rest_if_fail=el.get("hiderestiffail") == "1",
        mark=float(el.get("mark") or 1),
        display=_text(el, "display/text") or "SHOW",
        testcode=_text(el, "testcode/text"),
        extra=_text(el, "extra/text"),
    )


def _text(el: ET.Element, path: str) -> str:
    found = el.find(path)
    return "" if found is None or found.text is None else found.text


# ---------------------------------------------------------------- scrittura

def to_quiz_xml(questions: list[Question]) -> str:
    """Produce un file XML Moodle importabile dalla banca delle domande."""
    quiz = ET.Element("quiz")
    for question in questions:
        quiz.append(_question_element(question))
    ET.indent(quiz)
    # short_empty_elements=False: campi vuoti come <text></text>, come nell'export di Moodle
    body = ET.tostring(quiz, encoding="unicode", short_empty_elements=False)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + body + "\n"


def _question_element(q: Question) -> ET.Element:
    el = ET.Element("question", type="coderunner")
    _sub_text(el, "name", q.name)
    _sub_text(el, "questiontext", q.text_html, format="html")
    _sub_text(el, "generalfeedback", q.general_feedback_html, format="html")
    _sub(el, "defaultgrade", _number(q.default_grade))
    _sub(el, "coderunnertype", q.coderunner_type)
    _sub(el, "answerpreload", q.student_code)
    _sub(el, "answer", q.solution)
    for tag, value in {**DEFAULT_SETTINGS, **q.settings}.items():
        _sub(el, tag, value)

    testcases = ET.SubElement(el, "testcases")
    for tc in q.testcases:
        tc_el = ET.SubElement(
            testcases, "testcase",
            testtype="0",
            useasexample=_flag(tc.use_as_example),
            hiderestiffail=_flag(tc.hide_rest_if_fail),
            mark=_number(tc.mark),
        )
        _sub_text(tc_el, "testcode", tc.testcode)
        _sub_text(tc_el, "stdin", tc.stdin)
        _sub_text(tc_el, "expected", tc.expected)
        _sub_text(tc_el, "extra", tc.extra)
        _sub_text(tc_el, "display", tc.display)

    tags = ET.SubElement(el, "tags")
    for tag in q.tags:
        _sub_text(tags, "tag", tag)
    return el


def _sub(parent: ET.Element, tag: str, text: str, **attrs: str) -> ET.Element:
    child = ET.SubElement(parent, tag, attrs)
    child.text = text
    return child


def _sub_text(parent: ET.Element, tag: str, text: str, **attrs: str) -> None:
    """Campo nella forma Moodle ``<tag><text>...</text></tag>``."""
    _sub(ET.SubElement(parent, tag, attrs), "text", text)


def _number(value: float) -> str:
    return f"{value:.7f}"


def _flag(value: bool) -> str:
    return "1" if value else "0"
