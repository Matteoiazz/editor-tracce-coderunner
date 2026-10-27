"""Lettura e scrittura del formato "XML Moodle" per domande di tipo CodeRunner.

Moodle legge i campi per nome, non per posizione, quindi l'ordine degli elementi
in uscita non conta. Testo e codice vengono scritti in sezioni CDATA, come negli export
di Moodle; gli altri campi con l'escape XML, equivalente per un parser.
"""

import re
import uuid
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import dataclass, field

from tesi.domain import EmbeddedFile, Question, TestCase


class MoodleXmlError(ValueError):
    """Il file non è un XML Moodle valido."""


# Campi mappati esplicitamente sul dominio; tutti gli altri finiscono in Question.settings.
_MAPPED = {
    "name",
    "questiontext",
    "generalfeedback",
    "defaultgrade",
    "coderunnertype",
    "answer",
    "answerpreload",
    "testcases",
    "tags",
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

_EXPORT_HINT = "Controlla di averlo esportato dalla banca delle domande in formato XML Moodle."


@dataclass(frozen=True)
class QuizImport:
    questions: list[Question]
    # Domande di altro tipo presenti nel file e non importate, per tipo Moodle
    # (es. {"multichoice": 2}). Le categorie non sono domande e non compaiono.
    ignored: dict[str, int] = field(default_factory=dict)


def read_quiz(data: str | bytes) -> QuizImport:
    """Legge un file XML Moodle: domande CodeRunner e conteggio di quelle ignorate."""
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        line, _column = exc.position
        raise MoodleXmlError(
            f"Il file non è un XML valido (errore alla riga {line}). {_EXPORT_HINT}"
        ) from exc
    if root.tag != "quiz":
        raise MoodleXmlError(f"Il file non è un export di domande Moodle. {_EXPORT_HINT}")
    elements = root.findall("question")
    ignored = Counter(
        el.get("type") or "sconosciuto"
        for el in elements
        if el.get("type") not in ("coderunner", "category")
    )
    return QuizImport(
        questions=[_parse_question(el) for el in elements if el.get("type") == "coderunner"],
        ignored=dict(ignored),
    )


def parse_quiz(data: str | bytes) -> list[Question]:
    """Legge un file XML Moodle e restituisce solo le domande CodeRunner."""
    return read_quiz(data).questions


def _parse_question(el: ET.Element) -> Question:
    settings = {
        child.tag: child.text or "" for child in el if child.tag not in _MAPPED and len(child) == 0
    }
    return Question(
        name=_text(el, "name/text"),
        text_html=_text(el, "questiontext/text"),
        solution=_text(el, "answer"),
        student_code=_text(el, "answerpreload"),
        testcases=[_parse_testcase(tc) for tc in el.findall("testcases/testcase")],
        coderunner_type=_text(el, "coderunnertype"),
        default_grade=_number_field(_text(el, "defaultgrade"), "i punti dell'esercizio"),
        general_feedback_html=_text(el, "generalfeedback/text"),
        tags=[_text(tag, "text").strip() for tag in el.findall("tags/tag")],
        text_files=[_parse_file(f) for f in el.findall("questiontext/file")],
        settings=settings,
    )


def _parse_file(el: ET.Element) -> EmbeddedFile:
    return EmbeddedFile(
        name=el.get("name") or "",
        path=el.get("path") or "/",
        encoding=el.get("encoding") or "base64",
        content=(el.text or "").strip(),
    )


def _number_field(value: str | None, what: str) -> float:
    """Valore numerico del file; se manca vale 1, se non è un numero il file non è valido."""
    if not value or not value.strip():
        return 1.0
    try:
        return float(value)
    except ValueError:
        raise MoodleXmlError(
            f"Il file contiene un valore non valido per {what}: «{value.strip()}». {_EXPORT_HINT}"
        ) from None


def _parse_testcase(el: ET.Element) -> TestCase:
    return TestCase(
        stdin=_text(el, "stdin/text"),
        expected=_text(el, "expected/text"),
        use_as_example=el.get("useasexample") == "1",
        hide_rest_if_fail=el.get("hiderestiffail") == "1",
        mark=_number_field(el.get("mark"), "il peso di un test"),
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
    cdata = _CdataSections()
    quiz = ET.Element("quiz")
    for question in questions:
        quiz.append(_question_element(question, cdata))
    ET.indent(quiz)
    # short_empty_elements=False: campi vuoti come <text></text>, come nell'export di Moodle
    body = ET.tostring(quiz, encoding="unicode", short_empty_elements=False)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + cdata.expand(body) + "\n"


class _CdataSections:
    """Sezioni CDATA, che ElementTree non sa scrivere: in un primo momento il testo viene
    sostituito da un segnaposto, poi il segnaposto viene rimpiazzato nel file finale.
    Moodle usa CDATA per testo e codice: il file risulta leggibile come i suoi export."""

    def __init__(self) -> None:
        self._marker = f"cdata{uuid.uuid4().hex}"
        self._values: list[str] = []

    def placeholder(self, text: str) -> str:
        self._values.append(text)
        return f"{self._marker}_{len(self._values) - 1}_"

    def expand(self, xml: str) -> str:
        def section(match: re.Match[str]) -> str:
            value = self._values[int(match.group(1))]
            # "]]>" chiuderebbe la sezione: va spezzato in due sezioni consecutive
            return "<![CDATA[" + value.replace("]]>", "]]]]><![CDATA[>") + "]]>"

        return re.sub(rf"{self._marker}_(\d+)_", section, xml)


# Campi scritti in CDATA, come negli export di Moodle
_CDATA_SETTINGS = {"uiparameters"}


def _question_element(q: Question, cdata: _CdataSections) -> ET.Element:
    el = ET.Element("question", type="coderunner")
    _sub_text(el, "name", q.name)
    questiontext = _sub_text(el, "questiontext", q.text_html, cdata=cdata, format="html")
    for file in q.text_files:
        attrs = {"name": file.name, "path": file.path, "encoding": file.encoding}
        ET.SubElement(questiontext, "file", attrs).text = file.content
    _sub_text(el, "generalfeedback", q.general_feedback_html, format="html")
    _sub(el, "defaultgrade", _number(q.default_grade))
    _sub(el, "coderunnertype", q.coderunner_type)
    _sub(el, "answerpreload", q.student_code, cdata=cdata)
    _sub(el, "answer", q.solution, cdata=cdata)
    for tag, value in {**DEFAULT_SETTINGS, **q.settings}.items():
        _sub(el, tag, value, cdata=cdata if tag in _CDATA_SETTINGS else None)

    testcases = ET.SubElement(el, "testcases")
    for tc in q.testcases:
        tc_el = ET.SubElement(
            testcases,
            "testcase",
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


def _sub(
    parent: ET.Element,
    tag: str,
    text: str,
    cdata: _CdataSections | None = None,
    **attrs: str,
) -> ET.Element:
    child = ET.SubElement(parent, tag, attrs)
    safe = _xml_safe(text)
    child.text = cdata.placeholder(safe) if cdata is not None and safe else safe
    return child


# Caratteri che XML 1.0 non ammette (es. controlli invisibili incollati da un PDF):
# lasciarli renderebbe il file non importabile in Moodle. Tab e a capo sono ammessi.
_INVALID_XML_CHARS = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]")


def _xml_safe(text: str) -> str:
    return _INVALID_XML_CHARS.sub("", text)


def _sub_text(
    parent: ET.Element,
    tag: str,
    text: str,
    cdata: _CdataSections | None = None,
    **attrs: str,
) -> ET.Element:
    """Campo nella forma Moodle ``<tag><text>...</text></tag>``; restituisce ``<tag>``."""
    field_el = ET.SubElement(parent, tag, attrs)
    _sub(field_el, "text", text, cdata=cdata)
    return field_el


def _number(value: float) -> str:
    return f"{value:.7f}"


def _flag(value: bool) -> str:
    return "1" if value else "0"
