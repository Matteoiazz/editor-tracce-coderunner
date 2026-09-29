"""Esecuzione del codice Python in un processo locale, con timeout.

Adatto allo sviluppo e ai test: il codice gira con i permessi dell'utente, quindi
non va usato per codice non fidato (es. codice degli studenti) né su un server.
"""

import re
import subprocess
import sys
import tempfile
import time
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


# Limiti di esecuzione: le soluzioni reali terminano in pochi millisecondi, quindi
# superarli indica quasi sempre un ciclo infinito.
DEFAULT_TIMEOUT_S = 3.0
MAX_OUTPUT_BYTES = 1_000_000
_POLL_INTERVAL_S = 0.01
WINDOWS_NEWLINE = "\r\n"


class LocalPythonRunner:
    def __init__(
        self,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        python: str = sys.executable,
        max_output_bytes: int = MAX_OUTPUT_BYTES,
    ) -> None:
        self.timeout_s = timeout_s
        self.python = python
        self.max_output_bytes = max_output_bytes

    def run(self, code: str, stdin: str) -> RunResult:
        with tempfile.TemporaryDirectory() as workdir:
            folder = Path(workdir)
            program = folder / "program.py"
            program.write_text(_W_INPUT_PRELUDE + code, encoding="utf-8")
            (folder / "stdin.txt").write_text(stdin, encoding="utf-8")
            stdout_path, stderr_path = folder / "stdout.txt", folder / "stderr.txt"

            # L'output va su file e non in memoria: così se ne può controllare la
            # dimensione durante l'esecuzione e fermare un programma che stampa all'infinito.
            with (
                open(folder / "stdin.txt", "rb") as stdin_file,
                open(stdout_path, "wb") as stdout_file,
                open(stderr_path, "wb") as stderr_file,
            ):
                process = subprocess.Popen(
                    # -I: ignora variabili d'ambiente e site utente; -X utf8: I/O in UTF-8
                    [self.python, "-I", "-X", "utf8", str(program)],
                    stdin=stdin_file,
                    stdout=stdout_file,
                    stderr=stderr_file,
                    cwd=workdir,
                )
                timed_out, too_much_output = self._wait(process, stdout_path, stderr_path)

            stdout = _read_output(stdout_path, self.max_output_bytes)
            stderr = clean_traceback(_read_output(stderr_path, self.max_output_bytes), str(program))
        return RunResult(
            stdout=stdout,
            stderr=stderr,
            exit_code=None if (timed_out or too_much_output) else process.returncode,
            timed_out=timed_out,
            output_limit_exceeded=too_much_output,
        )

    def _wait(
        self, process: subprocess.Popen, stdout_path: Path, stderr_path: Path
    ) -> tuple[bool, bool]:
        """Attende la fine del programma; lo interrompe se supera il tempo o l'output massimo."""
        deadline = time.monotonic() + self.timeout_s
        while process.poll() is None:
            output_size = stdout_path.stat().st_size + stderr_path.stat().st_size
            if output_size > self.max_output_bytes:
                _stop(process)
                return False, True
            if time.monotonic() > deadline:
                _stop(process)
                return True, False
            time.sleep(_POLL_INTERVAL_S)
        return False, False


def _stop(process: subprocess.Popen) -> None:
    process.kill()
    process.wait()


def _read_output(path: Path, limit: int) -> str:
    """Legge al massimo `limit` byte; gli a capo di Windows diventano a capo semplici."""
    with open(path, "rb") as file:
        data = file.read(limit)
    return data.decode("utf-8", errors="replace").replace(WINDOWS_NEWLINE, "\n")


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
