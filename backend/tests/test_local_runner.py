from tesi.adapters.local_runner import LocalPythonRunner

runner = LocalPythonRunner()


def test_errore_a_runtime_indica_la_riga_della_soluzione() -> None:
    result = runner.run("x = 1\ny = 2\nraise ValueError('bug')\n", "")

    assert 'File "soluzione", line 3, in <module>' in result.stderr
    assert "ValueError: bug" in result.stderr


def test_non_compaiono_il_percorso_temporaneo_ne_il_preambolo() -> None:
    result = runner.run("a = input()\nb = input()\n", "1")

    assert 'File "soluzione", line 2, in <module>' in result.stderr
    assert "EOFError" in result.stderr
    assert "program.py" not in result.stderr
    assert "__saved_input__" not in result.stderr
    assert "in input" not in result.stderr


def test_errore_in_una_funzione_chiamata() -> None:
    result = runner.run("def f():\n    return 1 / 0\n\nf()\n", "")

    assert 'File "soluzione", line 4, in <module>' in result.stderr
    assert 'File "soluzione", line 2, in f' in result.stderr
    assert "ZeroDivisionError" in result.stderr


def test_errore_di_sintassi() -> None:
    result = runner.run("x = 1\ndef f(:\n    pass\n", "")

    assert 'File "soluzione", line 2' in result.stderr
    assert "SyntaxError" in result.stderr
    assert "program.py" not in result.stderr


def test_esecuzione_corretta_invariata() -> None:
    result = runner.run("n = int(input())\nprint(n * 2)\n", "21")

    assert result.exit_code == 0
    assert result.stdout == "21\n42\n"
    assert result.stderr == ""
