from fastapi.testclient import TestClient

from tesi.api.app import create_app


def test_health_risponde_ok() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
