"""Verifica della soluzione del docente contro i test case.

È la parte deterministica della richiesta "verificare la correttezza del codice del
prof": si esegue la soluzione su ogni test e si confronta l'output con quello atteso.
"""

from dataclasses import dataclass, replace

from tesi.domain import Question
from tesi.ports import CodeRunner, RunResult


@dataclass(frozen=True)
class TestOutcome:
    __test__ = False  # evita che pytest la scambi per una classe di test

    index: int
    passed: bool
    expected: str
    got: str
    error: str = ""


class SolutionFailed(Exception):
    """La soluzione del docente è andata in errore o in timeout su un test."""

    def __init__(self, index: int, detail: str) -> None:
        super().__init__(f"Test {index + 1}: {detail}")
        self.index = index
        self.detail = detail


def verify_solution(question: Question, runner: CodeRunner) -> list[TestOutcome]:
    """Esegue la soluzione su ogni test e dice quali passano."""
    outcomes = []
    for i, tc in enumerate(question.testcases):
        result = runner.run(question.solution, tc.stdin)
        error = _error_of(result)
        outcomes.append(TestOutcome(
            index=i,
            passed=not error and outputs_match(tc.expected, result.stdout),
            expected=tc.expected,
            got=result.stdout,
            error=error,
        ))
    return outcomes


def fill_expected_outputs(question: Question, runner: CodeRunner) -> Question:
    """Calcola l'output atteso di ogni test eseguendo la soluzione del docente.

    Il docente scrive solo gli input (es. seed e dimensione); gli output li produce l'app.
    Restituisce una copia dell'esercizio; solleva SolutionFailed se un'esecuzione fallisce.
    """
    testcases = []
    for i, tc in enumerate(question.testcases):
        result = runner.run(question.solution, tc.stdin)
        if error := _error_of(result):
            raise SolutionFailed(i, error)
        testcases.append(replace(tc, expected=result.stdout))
    return replace(question, testcases=testcases)


def outputs_match(expected: str, got: str) -> bool:
    """Confronto come il valutatore predefinito di CodeRunner: ignora gli spazi a fine
    riga e le righe vuote finali."""
    return _normalize(expected) == _normalize(got)


def _normalize(text: str) -> str:
    lines = [line.rstrip() for line in text.splitlines()]
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def _error_of(result: RunResult) -> str:
    if result.timed_out:
        return "tempo limite superato"
    if result.exit_code != 0:
        return result.stderr.strip() or f"terminato con codice {result.exit_code}"
    return ""
