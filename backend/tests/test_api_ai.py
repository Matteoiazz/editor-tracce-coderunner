"""Endpoint delle funzioni AI, con un modello finto al posto di OpenRouter."""

import json
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


def test_anteprima_della_revisione_senza_chiave(tmp_path: Path) -> None:
    response = client(tmp_path).post(
        "/api/ai/review/preview", json={"question": QUESTION, "notes": "controlla gli spazi"}
    )
    assert response.status_code == 200
    body = response.json()
    assert "JSON" in body["system"]
    assert "Stampa 1" in body["user"]
    assert body["user"].endswith("controlla gli spazi")
    # Nessun modello creato: l'anteprima non contatta OpenRouter
    assert created == []


def test_anteprima_senza_soluzione(tmp_path: Path) -> None:
    response = client(tmp_path).post(
        "/api/ai/review/preview", json={"question": {**QUESTION, "solution": ""}}
    )
    assert response.status_code == 422


def test_review_con_indicazioni(tmp_path: Path) -> None:
    c = client(tmp_path)
    received: list[list[Message]] = []
    original = FakeModel.complete

    def spy(self, messages: list[Message]) -> str:
        received.append(messages)
        return '{"segnalazioni": [], "test_suggeriti": []}'

    FakeModel.complete = spy
    try:
        response = c.post(
            "/api/ai/review",
            json={"model": "fornitore/modello", "question": QUESTION, "notes": "solo errori"},
            headers={"X-OpenRouter-Key": KEY},
        )
    finally:
        FakeModel.complete = original
    assert response.status_code == 200
    assert received[0][-1].content.endswith("solo errori")


FINDING = {
    "kind": "errore",
    "title": "Stampa sbagliata",
    "explanation": "Deve stampare 2.",
    "line": 2,
}


def test_anteprima_della_correzione(tmp_path: Path) -> None:
    response = client(tmp_path).post(
        "/api/ai/fix/preview", json={"question": QUESTION, "finding": FINDING}
    )
    assert response.status_code == 200
    assert "Stampa sbagliata" in response.json()["user"]


def test_fix(tmp_path: Path) -> None:
    c = client(tmp_path)
    FakeModel.reply = json.dumps({"soluzione": "x = input()\nprint(2)\n", "spiegazione": "ok"})
    try:
        response = c.post(
            "/api/ai/fix",
            json={
                "model": "fornitore/modello",
                "question": QUESTION,
                "finding": FINDING,
                "extra_inputs": ["b"],
            },
            headers={"X-OpenRouter-Key": KEY},
        )
    finally:
        FakeModel.reply = '{"stato": "pronto", "somma": 5}'
    assert response.status_code == 200
    body = response.json()
    assert body["solution"] == "x = input()\nprint(2)\n"
    assert [(t["stdin"], t["before"], t["after"], t["same"]) for t in body["tests"]] == [
        ("a", "a\n1\n", "a\n2\n", False),
        ("b", "b\n1\n", "b\n2\n", False),
    ]


def test_anteprima_della_generazione(tmp_path: Path) -> None:
    response = client(tmp_path).post("/api/ai/generate/preview", json={"question": QUESTION})
    assert response.status_code == 200
    assert "Stampa 1" in response.json()["user"]


def test_generate(tmp_path: Path) -> None:
    c = client(tmp_path)
    FakeModel.reply = json.dumps({"soluzione": "x = input()\nprint(1)\n", "spiegazione": "ok"})
    try:
        response = c.post(
            "/api/ai/generate",
            json={"model": "fornitore/modello", "question": QUESTION},
            headers={"X-OpenRouter-Key": KEY},
        )
    finally:
        FakeModel.reply = '{"stato": "pronto", "somma": 5}'
    assert response.status_code == 200
    body = response.json()
    assert body["attempts"] == 1
    assert body["problems"] == []
    assert body["tests"][0]["passed"] is True
