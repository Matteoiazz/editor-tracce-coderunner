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


def test_svuota_anche_le_funzioni_async() -> None:
    solution = (
        "async def risolvi(lst):\n    return sorted(lst)\n\n"
        "if __name__ == '__main__':\n    print(risolvi([3, 1]))\n"
    )

    assert generate_student_code(solution) == (
        "async def risolvi(lst):\n"
        "    # Inserisci qui la tua implementazione\n"
        "    return None\n\n"
        "if __name__ == '__main__':\n    print(risolvi([3, 1]))\n"
    )


def test_le_classi_usate_dal_main_restano_con_i_metodi_svuotati() -> None:
    solution = (
        "class Aiuto:\n    pass\n\n"
        "class Pila(list):\n"
        "    \"\"\"Pila di numeri.\"\"\"\n"
        "    LIMITE = 10\n\n"
        "    def __init__(self):\n        super().__init__()\n\n"
        "    @staticmethod\n    def vuota() -> 'Pila':\n        return Pila()\n\n"
        "if __name__ == '__main__':\n    print(Pila.vuota())\n"
    )

    assert generate_student_code(solution) == (
        "class Pila(list):\n"
        "    \"\"\"Pila di numeri.\"\"\"\n\n"
        "    LIMITE = 10\n\n"
        "    def __init__(self):\n"
        "        # Inserisci qui la tua implementazione\n"
        "        return None\n\n"
        "    @staticmethod\n"
        "    def vuota() -> 'Pila':\n"
        "        # Inserisci qui la tua implementazione\n"
        "        return None\n\n"
        "if __name__ == '__main__':\n    print(Pila.vuota())\n"
    )


def test_senza_main_svuota_tutte_le_funzioni() -> None:
    generated = generate_student_code("def f(a):\n    return a\n\ndef g():\n    return 1\n")

    assert "def f(a):" in generated
    assert "def g():" in generated
    assert "return a" not in generated


def test_segnala_un_errore_di_sintassi() -> None:
    with pytest.raises(StudentCodeError, match="riga 2"):
        generate_student_code("x = 1\ndef f(:\n    pass\n")


def test_una_funzione_passata_come_valore_resta_da_completare() -> None:
    solution = (
        "def doppio(x):\n    return 2 * x\n\n"
        "if __name__ == '__main__':\n    print(list(map(doppio, [1, 2])))\n"
    )

    generated = generate_student_code(solution)

    assert "def doppio(x):" in generated
    assert "return 2 * x" not in generated


def test_nome_sbagliato_nel_main_con_suggerimento() -> None:
    solution = (
        "def coppie_dieci(lst):\n    return 0\n\n"
        "if __name__ == '__main__':\n"
        "    import random\n"
        "    lst = [random.randint(1, 9)]\n"
        "    print(coppie_die(lst))\n"
    )

    with pytest.raises(StudentCodeError, match=r"chiama coppie_die.*forse coppie_dieci\?"):
        generate_student_code(solution)


def test_main_che_non_usa_nessuna_funzione() -> None:
    solution = "def calcola(lst):\n    return 0\n\nif __name__ == '__main__':\n    print(1)\n"

    with pytest.raises(StudentCodeError, match=r"non usa nessuna funzione della soluzione \(calcola\)"):
        generate_student_code(solution)
