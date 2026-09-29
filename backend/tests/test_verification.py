import time
from dataclasses import replace

import pytest

from samples import all_real_questions
from tesi.adapters.local_runner import LocalPythonRunner
from tesi.application.verification import (
    NOT_RUN,
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


def test_ciclo_infinito_interrotto_e_test_successivi_non_eseguiti(
    pretest_question: Question,
) -> None:
    looping = replace(pretest_question, solution="while True:\n    pass\n")

    start = time.perf_counter()
    [first, *rest] = verify_solution(looping, LocalPythonRunner(timeout_s=1))
    elapsed = time.perf_counter() - start

    assert not first.passed
    assert first.error.startswith("tempo limite superato")
    assert rest and all(not o.passed and o.error == NOT_RUN for o in rest)
    assert elapsed < 5  # senza l'interruzione: tempo limite × 16 test


def test_output_infinito_interrotto(pretest_question: Question) -> None:
    spamming = replace(pretest_question, solution="while True:\n    print('x' * 1000)\n")

    start = time.perf_counter()
    [first, second, *_] = verify_solution(spamming, runner)
    elapsed = time.perf_counter() - start

    assert first.error.startswith("output troppo lungo")
    assert len(first.got) <= 1_000_000
    assert second.error == NOT_RUN
    assert elapsed < 3


def test_il_confronto_ignora_spazi_finali_come_coderunner() -> None:
    assert outputs_match("1\n2\n", "1  \n2")
    assert not outputs_match("1\n2", "1\n3")
