"""Soluzione generata con un modello finto e l'esecutore Python vero."""

import json

import pytest

from tesi.adapters.local_runner import LocalPythonRunner
from tesi.application.generate import (
    MAX_ATTEMPTS,
    check_solution,
    generate_request,
    generate_solution,
)
from tesi.application.review import NothingToReview
from tesi.domain import Question, TestCase
from tesi.ports import Message

STUDENT = """\
def somma_pari(lst):
    # Inserisci qui la tua implementazione
    pass


if __name__ == "__main__":
    n = int(input())
    lst = list(range(n))
    print(somma_pari(lst))
"""

GOOD = """\
import math


def somma_pari(lst):
    return sum(x for x in lst if x % 2 == 0)


if __name__ == "__main__":
    n = int(input())
    lst = list(range(n))
    print(somma_pari(lst))
"""

WRONG = GOOD.replace("x % 2 == 0", "x % 2 == 1")
CRASHES = GOOD.replace("return sum(x for x in lst if x % 2 == 0)", "return lst[0]")
OTHER_MAIN = GOOD.replace("print(somma_pari(lst))", "print('risultato', somma_pari(lst))")


def question(**changes) -> Question:
    base = Question(
        name="pari",
        text_html="<p>Restituire la somma dei numeri pari della lista.</p>",
        student_code=STUDENT,
        testcases=[TestCase(stdin="5", expected="5\n6\n"), TestCase(stdin="0")],
    )
    for key, value in changes.items():
        setattr(base, key, value)
    return base


class ScriptedModel:
    def __init__(self, *solutions: str) -> None:
        self.replies = [json.dumps({"soluzione": s, "spiegazione": "Idea."}) for s in solutions]
        self.calls: list[list[Message]] = []

    def complete(self, messages: list[Message]) -> str:
        self.calls.append(messages)
        return self.replies.pop(0)


runner = LocalPythonRunner()


def test_la_richiesta_contiene_testo_codice_di_partenza_e_test() -> None:
    system, user = generate_request(question(), "usa un ciclo for")
    assert "main" in system.content
    assert "Restituire la somma dei numeri pari" in user.content
    assert "CODICE DI PARTENZA DELLO STUDENTE" in user.content
    assert "- test 1: input 5 → output 6" in user.content
    assert "- test 2: input 0\n" in user.content
    assert user.content.endswith("usa un ciclo for")


def test_senza_codice_di_partenza_ne_test() -> None:
    _, user = generate_request(question(student_code="", testcases=[]))
    assert "CODICE DI PARTENZA" not in user.content
    assert "TEST (righe" not in user.content


def test_senza_testo_non_chiede_al_modello() -> None:
    model = ScriptedModel()
    with pytest.raises(NothingToReview):
        generate_solution(question(text_html="<p> </p>"), model, runner)
    assert model.calls == []


def test_al_primo_tentativo() -> None:
    result = generate_solution(question(), ScriptedModel(GOOD), runner)
    assert result.solution == GOOD
    assert result.explanation == "Idea."
    assert result.attempts == 1
    assert result.problems == []
    assert [(t.stdin, t.output, t.passed) for t in result.tests] == [
        ("5", "5\n6\n", True),
        ("0", "0\n0\n", True),
    ]


def test_output_diverso_poi_corretto() -> None:
    model = ScriptedModel(WRONG, GOOD)
    result = generate_solution(question(), model, runner)
    assert result.attempts == 2
    assert result.problems == []
    feedback = model.calls[1][-1].content
    assert "Sul test 1 (input 5) l'output è diverso" in feedback
    assert "Atteso:\n5\n6" in feedback


def test_errore_poi_corretto() -> None:
    model = ScriptedModel(CRASHES, GOOD)
    result = generate_solution(question(), model, runner)
    assert result.attempts == 2
    assert "Sul test 2 (input 0) va in errore" in model.calls[1][-1].content


def test_dopo_tre_tentativi_restano_i_problemi() -> None:
    model = ScriptedModel(*[WRONG] * MAX_ATTEMPTS)
    result = generate_solution(question(), model, runner)
    assert result.attempts == MAX_ATTEMPTS
    assert result.solution == WRONG
    assert any("output è diverso" in p for p in result.problems)
    assert len(model.calls) == MAX_ATTEMPTS
    assert [t.passed for t in result.tests] == [False, True]


def test_main_diverso_dal_codice_di_partenza() -> None:
    problems, _ = check_solution(OTHER_MAIN, question(testcases=[]), runner)
    assert problems == ["Il main è diverso da quello del codice di partenza: deve essere identico."]


def test_import_e_commenti_in_piu_non_contano_come_main_diverso() -> None:
    commented = GOOD.replace("    n = int(input())", "    # dimensione\n    n = int(input())")
    problems, _ = check_solution(commented, question(testcases=[]), runner)
    assert problems == []


def test_manca_la_funzione() -> None:
    renamed = GOOD.replace("def somma_pari", "def somma").replace(
        "    return sum", "    return sum"
    )
    problems, _ = check_solution(renamed, question(testcases=[]), runner)
    assert "Manca la funzione del codice di partenza: somma_pari." in problems


def test_codice_non_valido() -> None:
    problems, runs = check_solution("def f(:\n", question(), runner)
    assert problems[0].startswith("Il codice non è Python valido")
    assert runs == []
