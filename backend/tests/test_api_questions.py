import pytest
from fastapi.testclient import TestClient

from samples import FIXTURES
from tesi.api.app import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def test_import_restituisce_gli_esercizi_in_json(client: TestClient) -> None:
    xml = (FIXTURES / "esame_2026-07-03_es3-4.xml").read_bytes()

    response = client.post("/api/questions/import", files={"file": ("es.xml", xml)})

    assert response.status_code == 200
    names = [q["name"] for q in response.json()]
    assert names == [
        "Esame-2026-07-03 - Traccia 1 - Esercizio 3",
        "Esame-2026-07-03 - Traccia 1 - Esercizio 4",
    ]


def test_import_di_un_file_non_valido_da_errore_leggibile(client: TestClient) -> None:
    response = client.post("/api/questions/import", files={"file": ("x.xml", b"non xml")})

    assert response.status_code == 422
    assert "non è un XML valido (errore alla riga 1)" in response.json()["detail"]


def test_import_verifica_ed_export_in_sequenza(client: TestClient) -> None:
    xml = (FIXTURES / "pretest_2026-07_es1.xml").read_bytes()
    [question] = client.post("/api/questions/import", files={"file": ("p.xml", xml)}).json()

    outcomes = client.post("/api/questions/verify", json=question).json()
    exported = client.post("/api/questions/export", json=[question])

    assert all(o["passed"] for o in outcomes)
    assert exported.headers["content-type"].startswith("application/xml")
    assert "<name>" in exported.text


def test_genera_il_codice_per_gli_studenti(client: TestClient) -> None:
    solution = "def f(x):\n    return x\n\nif __name__ == '__main__':\n    print(f(1))\n"

    response = client.post("/api/questions/student-code", json={"solution": solution})

    assert response.status_code == 200
    assert "return None" in response.json()["student_code"]


def test_codice_studenti_con_errore_di_sintassi(client: TestClient) -> None:
    response = client.post("/api/questions/student-code", json={"solution": "def f(:"})

    assert response.status_code == 422
    assert "errore di sintassi" in response.json()["detail"]
