from pathlib import Path

import pytest

from samples import FIXTURE_FILES, FIXTURES, load_questions
from tesi.adapters.moodle_xml import DEFAULT_SETTINGS, MoodleXmlError, parse_quiz, to_quiz_xml
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


def test_ignora_le_voci_che_non_sono_coderunner() -> None:
    xml = """<quiz>
      <question type="category"><category><text>$course$/Esami</text></category></question>
    </quiz>"""

    assert parse_quiz(xml) == []


def test_errore_leggibile_se_il_file_non_e_xml() -> None:
    with pytest.raises(MoodleXmlError, match=r"non è un XML valido \(errore alla riga 2\)"):
        parse_quiz("<quiz>\n<question></quiz>")


def test_errore_leggibile_se_non_e_un_export_moodle() -> None:
    with pytest.raises(MoodleXmlError, match="non è un export di domande Moodle"):
        parse_quiz("<altro/>")
