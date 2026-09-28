"""Esecuzione del codice Python in un processo locale, con timeout.

Adatto allo sviluppo e ai test: il codice gira con i permessi dell'utente, quindi
non va usato per codice non fidato (es. codice degli studenti) né su un server.
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

from tesi.ports import RunResult

# Riproduce il tipo CodeRunner "python3_w_input": ogni riga letta con input() viene
# ristampata sull'output. Per questo negli XML l'output atteso inizia con lo stdin.
_W_INPUT_PRELUDE = """\
__saved_input__ = input
def input(prompt=""):
    s = __saved_input__(prompt)
    print(s)
    return s
"""
_PRELUDE_LINES = _W_INPUT_PRELUDE.count("\n")

# Nome con cui il file della soluzione compare nei messaggi d'errore
SOLUTION_FILE_NAME = "soluzione"


class LocalPythonRunner:
    def __init__(self, timeout_s: float = 5.0, python: str = sys.executable) -> None:
        self.timeout_s = timeout_s
        self.python = python

    def run(self, code: str, stdin: str) -> RunResult:
        with tempfile.TemporaryDirectory() as workdir:
            program = Path(workdir) / "program.py"
            program.write_text(_W_INPUT_PRELUDE + code, encoding="utf-8")
            try:
                completed = subprocess.run(
                    # -I: ignora variabili d'ambiente e site utente; -X utf8: I/O in UTF-8
                    [self.python, "-I", "-X", "utf8", str(program)],
                    input=stdin,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=self.timeout_s,
                    cwd=workdir,
                    check=False,  # un codice d'uscita diverso da 0 è un risultato, non un errore
                )
            except subprocess.TimeoutExpired as exc:
                return RunResult(
                    stdout=_as_text(exc.stdout),
                    stderr=clean_traceback(_as_text(exc.stderr), str(program)),
                    exit_code=None,
                    timed_out=True,
                )
        return RunResult(
            completed.stdout,
            clean_traceback(completed.stderr, str(program)),
            completed.returncode,
        )


def clean_traceback(stderr: str, program_path: str) -> str:
    """Rende leggibile il messaggio d'errore di Python per il docente:
    - il percorso del file temporaneo diventa "soluzione";
    - i numeri di riga sono quelli della soluzione (senza le righe del preambolo);
    - le voci che riguardano il preambolo vengono rimosse.
    """
    frame = re.compile(r'^(\s*)File "' + re.escape(program_path) + r'", line (\d+)(.*)$')
    lines = stderr.splitlines()
    cleaned: list[str] = []
    i = 0
    while i < len(lines):
        match = frame.match(lines[i])
        if not match:
            cleaned.append(lines[i])
            i += 1
            continue
        indent, number, rest = match.group(1), int(match.group(2)), match.group(3)
        i += 1
        # Righe che appartengono alla stessa voce: più rientrate e non una nuova voce "File"
        body = []
        while (
            i < len(lines)
            and lines[i].startswith(indent + " ")
            and not lines[i].lstrip().startswith("File ")
        ):
            body.append(lines[i])
            i += 1
        if number <= _PRELUDE_LINES:
            continue
        cleaned.append(f'{indent}File "{SOLUTION_FILE_NAME}", line {number - _PRELUDE_LINES}{rest}')
        cleaned.extend(body)
    return "\n".join(cleaned) + ("\n" if stderr.endswith("\n") else "")


def _as_text(data: str | bytes | None) -> str:
    if data is None:
        return ""
    return data if isinstance(data, str) else data.decode("utf-8", errors="replace")
