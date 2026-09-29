"""Porta per l'esecuzione del codice.

È un'interfaccia perché le implementazioni reali sono più d'una: un processo locale
(sviluppo e test), e in futuro un ambiente isolato (es. un container).
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class RunResult:
    stdout: str
    stderr: str
    exit_code: int | None
    timed_out: bool = False
    # Il programma ha prodotto troppo output ed è stato interrotto
    output_limit_exceeded: bool = False


class CodeRunner(Protocol):
    def run(self, code: str, stdin: str) -> RunResult:
        """Esegue ``code`` passando ``stdin`` come input da tastiera."""
        ...
