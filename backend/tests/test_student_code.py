import pytest

from samples import all_real_questions
from tesi.application.student_code import StudentCodeError, generate_student_code
from tesi.domain import Question


def _significant_lines(code: str) -> list[str]:
    """Ignora righe vuote, spazi finali e maiuscole (il docente scrive
    "inserisci" o "Inserisci" a seconda dell'esercizio)."""
    return [line.rstrip().lower() for line in code.splitlines() if line.strip()]


@pytest.mark.parametrize("question", all_real_questions(), ids=lambda q: q.name)
def test_coincide_con_il_codice_scritto_a_mano_dal_docente(question: Question) -> None:
    generated = generate_student_code(question.solution)

    assert _significant_lines(generated) == _significant_lines(question.student_code)


def test_toglie_le_funzioni_di_supporto_e_svuota_quella_chiamata_dal_main() -> None:
    solution = (
        "import math\n\n"
        "def aiuto(x):\n    return x * 2\n\n"
        "def calcola(lst: list) -> int:\n    return sum(aiuto(v) for v in lst)\n\n"
        "if __name__ == '__main__':\n    print(calcola([1, 2]))\n"
    )

    assert generate_student_code(solution) == (
        "import math\n\n"
        "def calcola(lst: list) -> int:\n"
        "    # Inserisci qui la tua implementazione\n"
        "    return None\n\n"
        "if __name__ == '__main__':\n    print(calcola([1, 2]))\n"
    )


def test_senza_main_svuota_tutte_le_funzioni() -> None:
    generated = generate_student_code("def f(a):\n    return a\n\ndef g():\n    return 1\n")

    assert "def f(a):" in generated
    assert "def g():" in generated
    assert "return a" not in generated


def test_segnala_un_errore_di_sintassi() -> None:
    with pytest.raises(StudentCodeError, match="riga 2"):
        generate_student_code("x = 1\ndef f(:\n    pass\n")
