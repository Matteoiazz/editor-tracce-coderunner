from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tesi.api.app import create_app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(tmp_path))


def track_json(track_id: str = "t1") -> dict:
    return {
        "id": track_id,
        "kind": "Esame",
        "day": "2026-07-03",
        "number": 2,
        "common_tests": [{"stdin": "0\n1", "expected": ""}],
        "exercises": [
            {
                "number": 1,
                "use_common": True,
                "common_expected": ["0 1 Input: []"],
                "question": {
                    "name": "Esame-2026-07-03-Traccia2-Esercizio1",
                    "text_html": "<p>Testo</p>",
                    "solution": "print(1)",
                    "student_code": "",
                    "testcases": [{"stdin": "5\n10", "expected": "1\n"}],
                    "tags": ["Python - easy"],
                },
            }
        ],
    }


def test_salva_elenca_e_riapre(client: TestClient, tmp_path: Path) -> None:
    saved = client.put("/api/tracks/t1", json=track_json())
    assert saved.status_code == 200
    assert (tmp_path / "archivio.db").exists()

    [summary] = client.get("/api/tracks").json()
    assert summary["id"] == "t1"
    assert summary["kind"] == "Esame"
    assert summary["number"] == 2
    assert summary["exercise_count"] == 1

    track = client.get("/api/tracks/t1").json()
    assert track["exercises"][0]["question"]["tags"] == ["Python - easy"]
    assert track["exercises"][0]["common_expected"] == ["0 1 Input: []"]
    assert track["created_at"] is not None


def test_identificativo_diverso_dal_percorso(client: TestClient) -> None:
    response = client.put("/api/tracks/altro", json=track_json("t1"))
    assert response.status_code == 422


def test_traccia_inesistente(client: TestClient) -> None:
    response = client.get("/api/tracks/manca")
    assert response.status_code == 404
    assert response.json()["detail"] == "Traccia non trovata nell'archivio"


def test_cestino_ripristino_ed_eliminazione(client: TestClient) -> None:
    client.put("/api/tracks/t1", json=track_json())

    assert client.delete("/api/tracks/t1").status_code == 409

    assert client.post("/api/tracks/t1/trash").status_code == 204
    assert client.get("/api/tracks").json() == []
    assert [t["id"] for t in client.get("/api/tracks?trash=true").json()] == ["t1"]

    assert client.post("/api/tracks/t1/restore").status_code == 204
    assert [t["id"] for t in client.get("/api/tracks").json()] == ["t1"]

    client.post("/api/tracks/t1/trash")
    assert client.delete("/api/tracks/t1").status_code == 204
    assert client.get("/api/tracks/t1").status_code == 404


def test_svuota_cestino(client: TestClient) -> None:
    for track_id in ("a", "b"):
        client.put(f"/api/tracks/{track_id}", json=track_json(track_id))
        client.post(f"/api/tracks/{track_id}/trash")

    assert client.delete("/api/trash").json() == {"deleted": 2}


def test_duplica_ed_esportazione(client: TestClient) -> None:
    client.put("/api/tracks/t1", json=track_json())

    exported = client.post("/api/tracks/t1/exported").json()
    assert exported["exported_at"] is not None

    copy = client.post("/api/tracks/t1/duplicate").json()
    assert copy["id"] != "t1"
    assert copy["exported_at"] is None
    assert len(client.get("/api/tracks").json()) == 2


def test_ricerca_degli_esercizi(client: TestClient) -> None:
    client.put("/api/tracks/t1", json=track_json())

    [match] = client.get("/api/exercises", params={"q": "testo"}).json()
    assert match["track_id"] == "t1"
    assert match["position"] == 0
    assert match["text"] == "Testo"
    assert match["tags"] == ["Python - easy"]
    assert client.get("/api/exercises", params={"q": "assente"}).json() == []
    assert client.get("/api/exercises", params={"exclude_track": "t1"}).json() == []


def test_backup_e_ripristino_via_api(client: TestClient, tmp_path: Path) -> None:
    client.put("/api/tracks/t1", json=track_json())
    target = tmp_path / "backup.db"

    assert client.post("/api/archive/backup", json={"path": str(target)}).json() == {"tracks": 1}

    client.post("/api/tracks/t1/trash")
    client.delete("/api/trash")
    assert client.get("/api/tracks").json() == []

    assert client.post("/api/archive/restore", json={"path": str(target)}).json() == {"tracks": 1}
    assert [t["id"] for t in client.get("/api/tracks").json()] == ["t1"]

    response = client.post("/api/archive/restore", json={"path": str(tmp_path / "manca.db")})
    assert response.status_code == 422


def test_errori_di_backup_con_messaggio(client: TestClient, tmp_path: Path) -> None:
    client.put("/api/tracks/t1", json=track_json())

    same = client.post("/api/archive/backup", json={"path": str(tmp_path / "archivio.db")})
    assert same.status_code == 422
    assert "archivio stesso" in same.json()["detail"]

    folder = tmp_path / "cartella"
    folder.mkdir()
    locked = client.post("/api/archive/backup", json={"path": str(folder)})
    assert locked.status_code == 422
    assert locked.json()["detail"].startswith("Backup non riuscito")
