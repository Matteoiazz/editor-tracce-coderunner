from pathlib import Path

from fastapi.testclient import TestClient

from tesi.api.app import create_app

TOKEN = "codice-di-prova"


def client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(tmp_path, token=TOKEN))


def test_senza_codice_le_api_rifiutano(tmp_path: Path) -> None:
    response = client(tmp_path).get("/api/tracks")
    assert response.status_code == 401
    assert response.json()["detail"] == "Richiesta non autorizzata"


def test_codice_sbagliato(tmp_path: Path) -> None:
    response = client(tmp_path).get("/api/tracks", headers={"X-App-Token": "altro"})
    assert response.status_code == 401


def test_con_il_codice_le_api_rispondono(tmp_path: Path) -> None:
    response = client(tmp_path).get("/api/tracks", headers={"X-App-Token": TOKEN})
    assert response.status_code == 200


def test_esecuzione_del_codice_protetta(tmp_path: Path) -> None:
    question = {
        "name": "q",
        "text_html": "",
        "solution": "print(1)",
        "student_code": "",
        "testcases": [{"stdin": "", "expected": "1\n"}],
        "tags": [],
    }
    response = client(tmp_path).post(
        "/api/questions/verify", json=question, headers={"Origin": "null"}
    )
    assert response.status_code == 401
    # La risposta di rifiuto resta leggibile dalla pagina dell'app
    assert response.headers["access-control-allow-origin"] == "null"


def test_controllo_di_avvio_senza_codice(tmp_path: Path) -> None:
    assert client(tmp_path).get("/health").status_code == 200


def test_richiesta_preliminare_cors(tmp_path: Path) -> None:
    response = client(tmp_path).options(
        "/api/tracks",
        headers={
            "Origin": "null",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-app-token",
        },
    )
    assert response.status_code == 200
