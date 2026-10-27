"""Porta per il modello linguistico usato dalle funzioni AI.

I casi d'uso dipendono solo da questa interfaccia: il modello vero (OpenRouter) e quello
finto dei test sono implementazioni intercambiabili.
"""

from dataclasses import dataclass
from typing import Literal, Protocol

Role = Literal["system", "user", "assistant"]


@dataclass(frozen=True)
class Message:
    role: Role
    content: str


# Tipi di errore, per mostrare al docente cosa fare
ModelErrorKind = Literal[
    "key",  # chiave non valida o revocata
    "credit",  # crediti esauriti
    "rate",  # troppe richieste (limite giornaliero dei modelli gratuiti)
    "model",  # modello inesistente o non disponibile
    "unreachable",  # nessuna connessione
    "timeout",  # nessuna risposta in tempo
    "response",  # risposta vuota o non riconosciuta
    "other",
]


class ModelError(Exception):
    """La richiesta al modello non è riuscita; il messaggio è pensato per il docente."""

    def __init__(self, kind: ModelErrorKind, message: str) -> None:
        super().__init__(message)
        self.kind = kind
        self.message = message


class LanguageModel(Protocol):
    def complete(self, messages: list[Message]) -> str:
        """Restituisce il testo della risposta del modello ai messaggi."""
        ...
