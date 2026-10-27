"""Richieste al modello linguistico con risposta in JSON, e prova del collegamento.

I modelli non sempre rispettano il formato richiesto: aggiungono testo prima o dopo, o
racchiudono il JSON in un blocco di codice. Qui si estrae l'oggetto JSON dalla risposta; se
non c'è, la richiesta si ripete una volta indicando al modello l'errore.
"""

import json
import time
from dataclasses import dataclass

from tesi.ports import LanguageModel, Message, ModelError

FORMAT_REMINDER = (
    "La risposta precedente non era un oggetto JSON valido. Rispondi di nuovo con il solo "
    "oggetto JSON, senza altro testo e senza blocchi di codice."
)


def extract_json_object(text: str) -> dict:
    """Il primo oggetto JSON contenuto nel testo; ValueError se non ce n'è uno valido."""
    decoder = json.JSONDecoder()
    start = text.find("{")
    while start != -1:
        try:
            value, _ = decoder.raw_decode(text, start)
        except ValueError:
            start = text.find("{", start + 1)
            continue
        if isinstance(value, dict):
            return value
        start = text.find("{", start + 1)
    raise ValueError("nessun oggetto JSON nella risposta")


def ask_json(model: LanguageModel, messages: list[Message]) -> dict:
    """Chiede una risposta in JSON; se il formato è sbagliato riprova una volta."""
    reply = model.complete(messages)
    try:
        return extract_json_object(reply)
    except ValueError:
        pass
    retry = [*messages, Message("assistant", reply), Message("user", FORMAT_REMINDER)]
    try:
        return extract_json_object(model.complete(retry))
    except ValueError as exc:
        raise ModelError(
            "response",
            "Il modello non ha risposto nel formato richiesto: riprova, oppure scegli un altro "
            "modello",
        ) from exc


CHECK_MESSAGES = [
    Message(
        "system",
        "Rispondi sempre e solo con un oggetto JSON, senza altro testo.",
    ),
    Message(
        "user",
        'Prova di collegamento. Rispondi con {"stato": "pronto", "somma": N}, dove N è 2 + 3.',
    ),
]


@dataclass(frozen=True)
class ModelCheck:
    # Il modello ha risposto in JSON con il risultato giusto
    correct: bool
    seconds: float


def check_model(model: LanguageModel) -> ModelCheck:
    """Una richiesta breve per sapere se chiave e modello funzionano e quanto tempo servono."""
    start = time.monotonic()
    reply = ask_json(model, CHECK_MESSAGES)
    seconds = round(time.monotonic() - start, 1)
    return ModelCheck(correct=reply.get("somma") == 5, seconds=seconds)
