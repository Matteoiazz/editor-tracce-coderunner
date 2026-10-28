"""Correzione della soluzione con un modello finto e l'esecutore Python vero."""

import json

import pytest

from tesi.adapters.local_runner import LocalPythonRunner
from tesi.application.fix import fix_request, fix_solution
from tesi.application.review import Finding, NothingToReview
from tesi.domain import Question, TestCase
from tesi.ports import Message, ModelError

BUGGY = """\
def media(lst):
    return sum(lst) / len(lst)

n = int(input())
lst = list(range(n))
print(media(lst))
"""

FIXED = """\
def media(lst):
    if not lst:
        return 0
    return sum(lst) / len(lst)

n = int(input())
lst = list(range(n))
print(media(lst))
"""

FINDING = Finding(
    kind="errore",
    title="Divisione per zero",
    explanation="Con n = 0 la lista è vuota e len(lst) è 0.",
    line=2,
)


def question() -> Question:
    return Question(
        name="media",
        text_html="<p>Calcolare la media; 0 se la lista è vuota.</p>",
        solution=BUGGY,
        testcases=[TestCase(stdin="3"), TestCase(stdin="5")],
    )


class ScriptedModel:
    def __init__(self, *replies: dict | str) -> None:
        self.replies = [r if isinstance(r, str) else json.dumps(r) for r in replies]
        self.calls: list[list[Message]] = []

    def complete(self, messages: list[Message]) -> str:
        self.calls.append(messages)
        return self.replies.pop(0)


runner = LocalPythonRunner()


def test_la_richiesta_contiene_soluzione_numerata_e_problema() -> None:
    system, user = fix_request(question(), FINDING, "non toccare il main")
    assert "JSON" in system.content
    assert "  2 |     return sum(lst) / len(lst)" in user.content
    assert "PROBLEMA DA CORREGGERE (riga 2)\nDivisione per zero" in user.content
    assert user.content.endswith("non toccare il main")


def test_correzione_confrontata_sui_test() -> None:
    model = ScriptedModel({"soluzione": FIXED, "spiegazione": "Gestita la lista vuota."})
    fix = fix_solution(question(), FINDING, model, runner, extra_inputs=["0", "3"])

    assert fix.solution == FIXED
    assert fix.explanation == "Gestita la lista vuota."
    # I test esistenti, poi gli input in più senza ripetizioni
    assert [t.stdin for t in fix.tests] == ["3", "5", "0"]
    three, five, zero = fix.tests
    assert three.same and five.same
    assert three.before == three.after == "3\n1.0\n"
    assert not zero.same
    assert "ZeroDivisionError" in zero.before_error
    assert zero.after == "0\n0\n"
    assert zero.after_error == ""


def test_toglie_il_blocco_di_codice_e_aggiunge_l_a_capo_finale() -> None:
    code = "```python\n" + FIXED.rstrip("\n") + "\n```"
    fix = fix_solution(question(), FINDING, ScriptedModel({"soluzione": code}), runner)
    assert fix.solution == FIXED


def test_codice_non_valido_riprova_una_volta() -> None:
    model = ScriptedModel({"soluzione": "def media(lst)\n    return 0\n"}, {"soluzione": FIXED})
    fix = fix_solution(question(), FINDING, model, runner)
    assert fix.solution == FIXED
    assert "non è Python valido (riga 1" in model.calls[1][-1].content


def test_codice_non_valido_due_volte() -> None:
    bad = {"soluzione": "def media(lst)\n"}
    with pytest.raises(ModelError, match="non valido"):
        fix_solution(question(), FINDING, ScriptedModel(bad, bad), runner)


def test_soluzione_invariata() -> None:
    model = ScriptedModel({"soluzione": BUGGY + "\n\n", "spiegazione": "Non è un problema."})
    with pytest.raises(ModelError, match="non ha cambiato la soluzione: Non è un problema"):
        fix_solution(question(), FINDING, model, runner)


@pytest.mark.parametrize("reply", [{}, {"soluzione": "  "}, {"soluzione": 42}])
def test_risposta_senza_soluzione(reply: dict) -> None:
    with pytest.raises(ModelError) as exc:
        fix_solution(question(), FINDING, ScriptedModel(reply), runner)
    assert exc.value.kind == "response"


def test_senza_soluzione_non_chiede_al_modello() -> None:
    q = question()
    q.solution = ""
    model = ScriptedModel()
    with pytest.raises(NothingToReview):
        fix_solution(q, FINDING, model, runner)
    assert model.calls == []
