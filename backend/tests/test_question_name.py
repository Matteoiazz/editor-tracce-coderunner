from datetime import date

from tesi.domain import ExamKind, question_name


def test_nome_secondo_la_convenzione_del_docente() -> None:
    assert question_name(1, date(2026, 7, 3), ExamKind.ESAME) == "Esercizio1-2026-07-03-Esame"
    assert question_name(2, date(2026, 9, 30), ExamKind.PRETEST) == "Esercizio2-2026-09-30-Pretest"
