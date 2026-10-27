"""Revisione della soluzione con un modello finto e l'esecutore Python vero."""

import json

from tesi.adapters.local_runner import LocalPythonRunner
from tesi.application.review import (
    MAX_FINDINGS,
    MAX_TESTS,
    plain_text,
    review_messages,
    review_solution,
)
from tesi.domain import Question, TestCase
from tesi.ports import Message

SOLUTION = """\
import random

def media(lst):
    return sum(lst) / len(lst)

seed = int(input())
n = int(input())
random.seed(seed)
lst = [random.randint(0, 9) for _ in range(n)]
print(media(lst))
"""


def question(**changes) -> Question:
    base = Question(
        name="media",
        text_html="<p>Scrivere la funzione <b>media</b>.</p><ul><li>lst: lista di interi</li></ul>",
        solution=SOLUTION,
        testcases=[TestCase(stdin="1\n10"), TestCase(stdin="2\n5")],
    )
    for key, value in changes.items():
        setattr(base, key, value)
    return base


class ScriptedModel:
    def __init__(self, reply: dict | str) -> None:
        self.reply = reply if isinstance(reply, str) else json.dumps(reply)
        self.calls: list[list[Message]] = []

    def complete(self, messages: list[Message]) -> str:
        self.calls.append(messages)
        return self.reply


runner = LocalPythonRunner()


def test_la_richiesta_contiene_testo_soluzione_numerata_e_input_dei_test() -> None:
    system, user = review_messages(question())
    assert system.role == "system"
    assert "JSON" in system.content
    assert "Scrivere la funzione media." in user.content
    assert "- lst: lista di interi" in user.content
    assert "  4 |     return sum(lst) / len(lst)" in user.content
    assert "- test 1: 1 | 10" in user.content
    assert "<p>" not in user.content


def test_segnalazioni_e_test_eseguiti_davvero() -> None:
    model = ScriptedModel(
        {
            "segnalazioni": [
                {
                    "tipo": "errore",
                    "titolo": "Divisione per zero",
                    "spiegazione": "Con n = 0 la lista è vuota.",
                    "riga": 4,
                },
                {
                    "tipo": "testo",
                    "titolo": "Arrotondamento",
                    "spiegazione": "Non è detto.",
                    "riga": None,
                },
            ],
            "test_suggeriti": [
                {"input": "3\n0", "motivo": "lista vuota"},
                {"input": "4\n1", "motivo": "un solo elemento"},
            ],
        }
    )
    review = review_solution(question(), model, runner)

    assert [f.kind for f in review.findings] == ["errore", "testo"]
    assert review.findings[0].line == 4
    assert review.findings[1].line is None
    empty, single = review.tests
    assert empty.stdin == "3\n0"
    assert "ZeroDivisionError" in empty.error
    assert empty.output == ""
    assert single.error == ""
    # python3_w_input: l'output riporta l'input letto
    assert single.output.startswith("4\n1\n")


def test_nessun_problema() -> None:
    review = review_solution(
        question(), ScriptedModel({"segnalazioni": [], "test_suggeriti": []}), runner
    )
    assert review.findings == []
    assert review.tests == []


def test_scarta_segnalazioni_non_valide() -> None:
    model = ScriptedModel(
        {
            "segnalazioni": [
                {"tipo": "stile", "titolo": "Nomi poco chiari"},
                {"tipo": "errore"},
                "testo libero",
                {"tipo": "caso_limite", "spiegazione": "Valori tutti uguali", "riga": 999},
                {"tipo": "caso_limite", "titolo": "n = 1", "riga": "7"},
            ],
        }
    )
    review = review_solution(question(), model, runner)
    assert [(f.title, f.line) for f in review.findings] == [
        ("Valori tutti uguali", None),
        ("n = 1", 7),
    ]


def test_al_massimo_le_segnalazioni_e_i_test_previsti() -> None:
    model = ScriptedModel(
        {
            "segnalazioni": [{"tipo": "testo", "titolo": f"s{i}"} for i in range(20)],
            "test_suggeriti": [{"input": f"{i + 10}\n3"} for i in range(20)],
        }
    )
    review = review_solution(question(), model, runner)
    assert len(review.findings) == MAX_FINDINGS
    assert len(review.tests) == MAX_TESTS


def test_input_in_altri_formati_e_duplicati() -> None:
    model = ScriptedModel(
        {
            "test_suggeriti": [
                {"input": ["5", 2]},
                {"input": "5\n2\n"},  # uguale al precedente
                {"input": " 1 \n10 "},  # uguale a un test esistente
                {"input": 7},  # una riga sola: il main ne legge due
                {"input": None},
                {"input": "6\r\n3"},
            ],
        }
    )
    review = review_solution(question(), model, runner)
    assert [t.stdin for t in review.tests] == ["5\n2", "6\n3"]


def test_risposta_senza_le_liste() -> None:
    review = review_solution(question(), ScriptedModel({"altro": 1}), runner)
    assert review.findings == []
    assert review.tests == []


def test_testo_semplice_dall_html() -> None:
    html = "<p>Primo&nbsp;paragrafo</p><p>Secondo <img src='x.png'> e   spazi</p><br>"
    assert plain_text(html) == "Primo paragrafo\n\nSecondo [immagine] e spazi"
