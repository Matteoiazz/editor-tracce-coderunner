from datetime import date

import pytest

from tesi.domain import ExamKind, question_name


def test_nome_esame_con_traccia_ed_esercizio() -> None:
    assert (
        question_name(date(2026, 7, 3), ExamKind.ESAME, 1, 1)
        == "Esame-2026-07-03-Traccia1-Esercizio1"
    )
    assert (
        question_name(date(2026, 7, 3), ExamKind.ESAME, 2, 3)
        == "Esame-2026-07-03-Traccia2-Esercizio3"
    )


def test_nome_pretest_senza_numero_di_esercizio() -> None:
    assert question_name(date(2026, 9, 30), ExamKind.PRETEST, 1) == "Pretest-2026-09-30-Traccia1"


def test_esame_senza_numero_non_ammesso() -> None:
    with pytest.raises(ValueError):
        question_name(date(2026, 7, 3), ExamKind.ESAME, 1)
