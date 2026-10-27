"""Endpoint delle funzioni AI, con un modello finto al posto di OpenRouter."""

from pathlib import Path

from fastapi.testclient import TestClient

from tesi.api.app import create_app
from tesi.ports import Message, ModelError

TOKEN = "codice-di-prova"
KEY = "sk-or-prova"


class FakeModel:
    reply = '{"stato": "pronto", "somma": 5}'
    error: ModelError | None = None

    def __init__(self, key: str, model: str) -> None:
        created.append((key, model))

    def complete(self, messages: list[Message]) -> str:
        if FakeModel.error:
            raise FakeModel.error
        return FakeModel.reply


created: list[tuple[str, str]] = []


def client(tmp_path: Path) -> TestClient:
    created.clear()
    FakeModel.error = None
    app = create_app(tmp_path, token=TOKEN)
    app.state.model_factory = FakeModel
    return TestClient(app, headers={"X-App-Token": TOKEN})


def test_check_usa_chiave_e_modello_della_richiesta(tmp_path: Path) -> None:
    response = client(tmp_path).post(
        "/api/ai/check",
        json={"model": " fornitore/modello "},
        headers={"X-OpenRouter-Key": KEY},
    )
    assert response.status_code == 200
    assert response.json()["correct"] is True
    assert created == [(KEY, "fornitore/modello")]


def test_check_senza_chiave(tmp_path: Path) -> None:
    response = client(tmp_path).post("/api/ai/check", json={"model": "fornitore/modello"})
    assert response.status_code == 400
    assert created == []


def test_check_senza_modello(tmp_path: Path) -> None:
    response = client(tmp_path).post(
        "/api/ai/check", json={"model": " "}, headers={"X-OpenRouter-Key": KEY}
    )
    assert response.status_code == 400


def test_errore_del_modello(tmp_path: Path) -> None:
    c = client(tmp_path)
    FakeModel.error = ModelError("rate", "Troppe richieste")
    response = c.post(
        "/api/ai/check", json={"model": "fornitore/modello"}, headers={"X-OpenRouter-Key": KEY}
    )
    assert response.status_code == 502
    assert response.json()["detail"] == {"kind": "rate", "message": "Troppe richieste"}


def test_serve_il_codice_dell_app(tmp_path: Path) -> None:
    app = create_app(tmp_path, token=TOKEN)
    app.state.model_factory = FakeModel
    response = TestClient(app).post(
        "/api/ai/check", json={"model": "fornitore/modello"}, headers={"X-OpenRouter-Key": KEY}
    )
    assert response.status_code == 401


QUESTION = {
    "name": "q",
    "text_html": "<p>Stampa 1</p>",
    "solution": "x = input()\nprint(1)",
    "student_code": "",
    "testcases": [{"stdin": "a", "expected": "a\n1\n"}],
    "tags": [],
}


def test_review(tmp_path: Path) -> None:
    c = client(tmp_path)
    FakeModel.reply = (
        '{"segnalazioni": [{"tipo": "testo", "titolo": "Ambiguo", "spiegazione": "...",'
        ' "riga": 2}], "test_suggeriti": [{"input": "b", "motivo": "altro input"}]}'
    )
    try:
        response = c.post(
            "/api/ai/review",
            json={"model": "fornitore/modello", "question": QUESTION},
            headers={"X-OpenRouter-Key": KEY},
        )
    finally:
        FakeModel.reply = '{"stato": "pronto", "somma": 5}'
    assert response.status_code == 200
    body = response.json()
    assert body["findings"] == [
        {"kind": "testo", "title": "Ambiguo", "explanation": "...", "line": 2}
    ]
    assert body["tests"] == [
        {"stdin": "b", "reason": "altro input", "output": "b\n1\n", "error": ""}
    ]


def test_review_errore_del_modello(tmp_path: Path) -> None:
    c = client(tmp_path)
    FakeModel.error = ModelError("credit", "Crediti esauriti")
    response = c.post(
        "/api/ai/review",
        json={"model": "fornitore/modello", "question": QUESTION},
        headers={"X-OpenRouter-Key": KEY},
    )
    assert response.status_code == 502
    assert response.json()["detail"]["kind"] == "credit"


def test_review_senza_testo(tmp_path: Path) -> None:
    response = client(tmp_path).post(
        "/api/ai/review",
        json={"model": "fornitore/modello", "question": {**QUESTION, "text_html": "<p></p>"}},
        headers={"X-OpenRouter-Key": KEY},
    )
    assert response.status_code == 422
    assert response.json()["detail"].startswith("Scrivi prima la traccia")
