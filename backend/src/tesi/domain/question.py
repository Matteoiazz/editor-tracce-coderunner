"""Esercizio d'esame e test case.

Il modello non sa nulla di XML, HTTP o Moodle: descrive solo cosa è un esercizio.
"""

from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum


class ExamKind(StrEnum):
    PRETEST = "Pretest"
    ESAME = "Esame"


@dataclass
class TestCase:
    """Un test: input dato al programma e output atteso."""

    __test__ = False  # evita che pytest la scambi per una classe di test

    stdin: str = ""
    expected: str = ""
    use_as_example: bool = False
    hide_rest_if_fail: bool = False
    mark: float = 1.0
    display: str = "SHOW"
    testcode: str = ""
    extra: str = ""


@dataclass
class Question:
    """Un esercizio completo, come lo prepara il docente."""

    name: str
    text_html: str
    # Codice completo del docente (funzione risolta + main): nascosto agli studenti,
    # serve a Moodle per validare i test e all'app per calcolare gli output attesi.
    solution: str = ""
    # Codice che vedono gli studenti: la funzione da completare + lo stesso main.
    student_code: str = ""
    testcases: list[TestCase] = field(default_factory=list)
    coderunner_type: str = "python3_w_input"
    default_grade: float = 1.0
    general_feedback_html: str = ""
    tags: list[str] = field(default_factory=list)
    # Impostazioni della piattaforma che l'app non modifica: conservate così come sono,
    # per non perderle quando un esercizio viene importato e poi riesportato.
    settings: dict[str, str] = field(default_factory=dict)


def question_name(day: date, kind: ExamKind, track: int, number: int | None = None) -> str:
    """Nome secondo la convenzione del docente.

    Esame: ``Esame-2026-07-03-Traccia1-Esercizio1``; pretest, che ha un solo esercizio:
    ``Pretest-2026-07-03-Traccia1``.
    """
    base = f"{kind}-{day.isoformat()}-Traccia{track}"
    if kind is ExamKind.PRETEST:
        return base
    if number is None:
        raise ValueError("Negli esami il nome contiene il numero dell'esercizio")
    return f"{base}-Esercizio{number}"
