from pathlib import Path

import pytest

from samples import FIXTURE_FILES, FIXTURES, load_questions
from tesi.adapters.moodle_xml import (
    DEFAULT_SETTINGS,
    MoodleXmlError,
    QuizImport,
    parse_quiz,
    read_quiz,
    to_quiz_xml,
)
from tesi.domain import Question, TestCase


def test_legge_i_campi_di_un_esercizio_reale() -> None:
    [q] = load_questions(FIXTURES / "pretest_2026-07_es1.xml")

    assert q.name == "2026-07 - Esercizio pretest 1"
    assert q.coderunner_type == "python3_w_input"
    assert q.default_grade == 1.0
    assert q.tags == ["Pretest"]
    assert "<strong>somma(lst)</strong>" in q.text_html
    assert q.student_code.startswith("def somma(lst):\n    # Inserisci qui")
    assert "def dominante(n, lst):" in q.solution
    assert len(q.testcases) == 16


def test_legge_i_test_case() -> None:
    [q] = load_questions(FIXTURES / "pretest_2026-07_es1.xml")
    first, example = q.testcases[0], q.testcases[1]

    assert first.stdin == "0\n1"
    assert first.expected == "0\n1\nInput: [8] - Risultato: 0\n"
    assert not first.use_as_example
    assert example.use_as_example
    assert q.testcases[6].hide_rest_if_fail


def test_legge_piu_esercizi_nello_stesso_file() -> None:
    questions = load_questions(FIXTURES / "esame_2026-07-03_es3-4.xml")

    assert [q.name for q in questions] == [
        "Esame-2026-07-03 - Traccia 1 - Esercizio 3",
        "Esame-2026-07-03 - Traccia 1 - Esercizio 4",
    ]


@pytest.mark.parametrize("path", FIXTURE_FILES, ids=lambda p: p.name)
def test_round_trip_non_perde_informazioni(path: Path) -> None:
    original = load_questions(path)

    reimported = parse_quiz(to_quiz_xml(original))

    assert reimported == original


def test_un_esercizio_nuovo_riceve_le_impostazioni_del_docente() -> None:
    new = Question(
        name="Esercizio1-2026-09-30-Pretest",
        text_html="<p>Testo</p>",
        solution="print(1)",
        testcases=[TestCase(stdin="1", expected="1\n")],
    )

    [reimported] = parse_quiz(to_quiz_xml([new]))

    assert reimported.settings == DEFAULT_SETTINGS
    assert reimported.testcases == new.testcases


def test_le_categorie_non_contano_come_domande_ignorate() -> None:
    xml = """<quiz>
      <question type="category"><category><text>$course$/Esami</text></category></question>
    </quiz>"""

    assert read_quiz(xml) == QuizImport(questions=[], ignored={})


def test_conta_le_domande_di_altro_tipo_ignorate() -> None:
    xml = (FIXTURES / "pretest_2026-07_es1.xml").read_text(encoding="utf-8").replace(
        "</quiz>",
        '<question type="multichoice"><name><text>A</text></name></question>'
        '<question type="multichoice"><name><text>B</text></name></question>'
        '<question type="truefalse"><name><text>C</text></name></question></quiz>',
    )

    result = read_quiz(xml)

    assert [q.name for q in result.questions] == ["2026-07 - Esercizio pretest 1"]
    assert result.ignored == {"multichoice": 2, "truefalse": 1}


def test_errore_leggibile_se_il_file_non_e_xml() -> None:
    with pytest.raises(MoodleXmlError, match=r"non è un XML valido \(errore alla riga 2\)"):
        parse_quiz("<quiz>\n<question></quiz>")


def test_errore_leggibile_se_non_e_un_export_moodle() -> None:
    with pytest.raises(MoodleXmlError, match="non è un export di domande Moodle"):
        parse_quiz("<altro/>")


def test_export_toglie_i_caratteri_non_ammessi_da_xml() -> None:
    q = Question(
        name="Esercizio1-2026-10-15-Esame",
        text_html="<p>Testo\x0b con\x01 controlli</p>",
        solution="def f():\n\treturn 1\n",
        testcases=[TestCase(stdin="1\n2", expected="ok\x0c\n")],
    )

    [reimported] = parse_quiz(to_quiz_xml([q]))

    assert reimported.text_html == "<p>Testo con controlli</p>"
    assert reimported.solution == "def f():\n\treturn 1\n"  # tab e a capo restano
    assert reimported.testcases[0].expected == "ok\n"


def test_testo_e_codice_esportati_in_cdata_come_negli_export_di_moodle() -> None:
    [q] = load_questions(FIXTURES / "pretest_2026-07_es1.xml")

    xml = to_quiz_xml([q])

    assert '<questiontext format="html">' in xml
    assert "<text><![CDATA[<p dir=\"ltr\">" in xml
    assert "<answerpreload><![CDATA[def somma(lst):" in xml
    assert "<answer><![CDATA[def dominante(n, lst):" in xml
    assert "<uiparameters><![CDATA[{" in xml
    assert "&lt;p" not in xml  # il testo HTML non è più scritto con l'escape
    assert parse_quiz(xml) == [q]


def test_cdata_con_la_sequenza_di_chiusura_nel_testo() -> None:
    q = Question(
        name="Esercizio1-2026-10-15-Esame",
        text_html="<p>lista[a[0]]>1</p>",
        solution="print(']]>')\n",
    )

    [reimported] = parse_quiz(to_quiz_xml([q]))

    assert reimported.text_html == q.text_html
    assert reimported.solution == q.solution


_WITH_IMAGE = """<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="coderunner">
    <name><text>Esame-2026-01-10-Traccia1-Esercizio1</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>Guarda lo schema: <img src="@@PLUGINFILE@@/schema.png"></p>]]></text>
      <file name="schema.png" path="/" encoding="base64">iVBORw0KGgo=</file>
    </questiontext>
    <coderunnertype>python3_w_input</coderunnertype>
    <answer>print(1)</answer>
    <testcases></testcases>
  </question>
</quiz>
"""


def test_le_immagini_incorporate_restano_nel_file_esportato() -> None:
    [q] = parse_quiz(_WITH_IMAGE)
    assert [f.name for f in q.text_files] == ["schema.png"]

    [again] = parse_quiz(to_quiz_xml([q]))

    assert again.text_files == q.text_files
    assert again.text_files[0].content == "iVBORw0KGgo="
    assert '@@PLUGINFILE@@/schema.png' in again.text_html


def test_errore_leggibile_se_i_punti_non_sono_un_numero() -> None:
    xml = _WITH_IMAGE.replace("<answer>", "<defaultgrade>cinque</defaultgrade><answer>")

    with pytest.raises(MoodleXmlError, match="«cinque»"):
        read_quiz(xml)
