"""Risposte in JSON del modello e prova del collegamento, con un modello finto."""

import pytest

from tesi.application.ai import FORMAT_REMINDER, ask_json, check_model, extract_json_object
from tesi.ports import Message, ModelError


class ScriptedModel:
    """Restituisce le risposte indicate, una per chiamata, e ricorda i messaggi ricevuti."""

    def __init__(self, *replies: str) -> None:
        self.replies = list(replies)
        self.calls: list[list[Message]] = []

    def complete(self, messages: list[Message]) -> str:
        self.calls.append(messages)
        return self.replies.pop(0)


@pytest.mark.parametrize(
    "text",
    [
        '{"a": 1}',
        'Ecco la risposta:\n```json\n{"a": 1}\n```',
        'Testo {non json} poi {"a": 1} e altro',
        '  {"a": 1}  {"b": 2}',
    ],
)
def test_estrae_il_primo_oggetto_json(text: str) -> None:
    assert extract_json_object(text) == {"a": 1}


def test_oggetto_con_graffe_nelle_stringhe() -> None:
    assert extract_json_object('{"codice": "d = {}\\nprint(d)"}') == {"codice": "d = {}\nprint(d)"}


@pytest.mark.parametrize("text", ["", "nessun json", "[1, 2]", '{"a": 1'])
def test_senza_oggetto_json(text: str) -> None:
    with pytest.raises(ValueError):
        extract_json_object(text)


def test_ask_json_al_primo_tentativo() -> None:
    model = ScriptedModel('{"ok": true}')
    assert ask_json(model, [Message("user", "domanda")]) == {"ok": True}
    assert len(model.calls) == 1


def test_ask_json_riprova_indicando_l_errore() -> None:
    model = ScriptedModel("Certo! Ecco:", '{"ok": true}')
    assert ask_json(model, [Message("user", "domanda")]) == {"ok": True}
    retry = model.calls[1]
    assert retry[-2] == Message("assistant", "Certo! Ecco:")
    assert retry[-1] == Message("user", FORMAT_REMINDER)


def test_ask_json_si_ferma_dopo_due_tentativi() -> None:
    model = ScriptedModel("no", "ancora no")
    with pytest.raises(ModelError) as exc:
        ask_json(model, [Message("user", "domanda")])
    assert exc.value.kind == "response"


def test_check_model() -> None:
    result = check_model(ScriptedModel('{"stato": "pronto", "somma": 5}'))
    assert result.correct
    assert result.seconds >= 0


def test_check_model_risposta_sbagliata() -> None:
    assert not check_model(ScriptedModel('{"stato": "pronto", "somma": 6}')).correct


def test_check_model_errore_del_modello() -> None:
    class Failing:
        def complete(self, messages: list[Message]) -> str:
            raise ModelError("key", "chiave non valida")

    with pytest.raises(ModelError):
        check_model(Failing())
