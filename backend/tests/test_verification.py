from dataclasses import replace

import pytest

from samples import all_real_questions
from tesi.adapters.local_runner import LocalPythonRunner
from tesi.application.verification import (
    SolutionFailed,
    fill_expected_outputs,
    outputs_match,
    verify_solution,
)
from tesi.domain import Question

runner = LocalPythonRunner()


@pytest.mark.parametrize("question", all_real_questions(), ids=lambda q: q.name)
def test_la_soluzione_del_docente_passa_tutti_i_test_registrati_su_moodle(
    question: Question,
) -> None:
    # Se questo test passa, l'esecutore locale riproduce fedelmente CodeRunner
    # (tipo python3_w_input) sugli output che Moodle ha effettivamente salvato.
    outcomes = verify_solution(question, runner)

    failed = [o for o in outcomes if not o.passed]
    assert failed == []


def test_calcola_gli_output_attesi_dagli_input(pretest_question: Question) -> None:
    only_inputs = replace(
        pretest_question,
        testcases=[replace(tc, expected="") for tc in pretest_question.testcases],
    )

    filled = fill_expected_outputs(only_inputs, runner)

    for computed, original in zip(filled.testcases, pretest_question.testcases, strict=True):
        assert outputs_match(original.expected, computed.expected)


def test_una_soluzione_sbagliata_non_passa(pretest_question: Question) -> None:
    wrong = replace(
        pretest_question,
        solution=pretest_question.solution.replace("return sum(speciali)", "return 0"),
    )

    outcomes = verify_solution(wrong, runner)

    assert not all(o.passed for o in outcomes)


def test_segnala_la_soluzione_che_va_in_errore(pretest_question: Question) -> None:
    broken = replace(pretest_question, solution="raise ValueError('bug')")

    with pytest.raises(SolutionFailed) as exc:
        fill_expected_outputs(broken, runner)

    assert "ValueError: bug" in exc.value.detail


def test_interrompe_un_ciclo_infinito(pretest_question: Question) -> None:
    looping = replace(pretest_question, solution="while True:\n    pass\n")

    [first, *_] = verify_solution(looping, LocalPythonRunner(timeout_s=1))

    assert not first.passed
    assert first.error == "tempo limite superato"


def test_il_confronto_ignora_spazi_finali_come_coderunner() -> None:
    assert outputs_match("1\n2\n", "1  \n2")
    assert not outputs_match("1\n2", "1\n3")
