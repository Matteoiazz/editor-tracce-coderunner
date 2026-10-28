"""Adapter OpenRouter contro un server HTTP locale che imita l'API."""

import json
import socket
import threading
import time
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from tesi.adapters.openrouter import OpenRouterModel
from tesi.ports import Message, ModelError


class FakeApi:
    """Risponde con stato e corpo impostati dal test e ricorda l'ultima richiesta."""

    def __init__(self) -> None:
        self.status = 200
        self.body: object = reply("ciao")
        self.delay_s = 0.0
        # "senza risposta": chiude la connessione senza rispondere; "a metà": manda solo parte
        # del corpo annunciato
        self.drop: str | None = None
        self.request: dict | None = None
        self.headers: dict[str, str] = {}


def reply(content: object) -> dict:
    return {"choices": [{"message": {"role": "assistant", "content": content}}]}


@pytest.fixture
def api() -> Iterator[tuple[FakeApi, str]]:
    state = FakeApi()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            length = int(self.headers["Content-Length"])
            state.request = {"path": self.path, "body": json.loads(self.rfile.read(length))}
            state.headers = dict(self.headers)
            time.sleep(state.delay_s)
            if state.drop == "senza risposta":
                self.close_connection = True
                return
            data = state.body if isinstance(state.body, bytes) else json.dumps(state.body).encode()
            announced = len(data) + (100 if state.drop == "a metà" else 0)
            try:
                self.send_response(state.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(announced))
                self.end_headers()
                self.wfile.write(data)
            except OSError:
                pass  # il client ha già chiuso per il tempo scaduto
            if state.drop == "a metà":
                self.close_connection = True

        def log_message(self, *args: object) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield state, f"http://127.0.0.1:{server.server_port}/api/v1"
    server.shutdown()
    server.server_close()


def model(url: str, **kwargs) -> OpenRouterModel:
    return OpenRouterModel("sk-or-prova", "fornitore/modello", base_url=url, **kwargs)


MESSAGES = [Message("system", "Sei un assistente"), Message("user", "Ciao")]


def test_invia_modello_messaggi_e_chiave(api) -> None:
    state, url = api
    assert model(url, temperature=0.2).complete(MESSAGES) == "ciao"
    assert state.request["path"] == "/api/v1/chat/completions"
    assert state.request["body"] == {
        "model": "fornitore/modello",
        "messages": [
            {"role": "system", "content": "Sei un assistente"},
            {"role": "user", "content": "Ciao"},
        ],
        "temperature": 0.2,
    }
    assert state.headers["Authorization"] == "Bearer sk-or-prova"
    assert state.headers["X-Title"]


def test_senza_temperatura_decide_il_modello(api) -> None:
    state, url = api
    model(url).complete(MESSAGES)
    assert "temperature" not in state.request["body"]


@pytest.mark.parametrize(
    ("status", "kind"),
    [(401, "key"), (402, "credit"), (429, "rate"), (404, "model"), (503, "model"), (500, "other")],
)
def test_errori_http(api, status: int, kind: str) -> None:
    state, url = api
    state.status = status
    state.body = {"error": {"code": status, "message": "dettaglio del fornitore"}}
    with pytest.raises(ModelError) as exc:
        model(url).complete(MESSAGES)
    assert exc.value.kind == kind


def test_il_dettaglio_di_openrouter_compare_nel_messaggio(api) -> None:
    state, url = api
    state.status = 400
    state.body = {"error": {"code": 400, "message": "context length exceeded"}}
    with pytest.raises(ModelError, match="context length exceeded"):
        model(url).complete(MESSAGES)


def test_errore_dentro_una_risposta_200(api) -> None:
    state, url = api
    state.body = {"error": {"code": 429, "message": "rate limited"}}
    with pytest.raises(ModelError) as exc:
        model(url).complete(MESSAGES)
    assert exc.value.kind == "rate"


def test_errore_della_singola_risposta(api) -> None:
    state, url = api
    state.body = {"choices": [{"error": {"message": "provider crashed"}}]}
    with pytest.raises(ModelError, match="provider crashed") as exc:
        model(url).complete(MESSAGES)
    assert exc.value.kind == "model"


@pytest.mark.parametrize("content", [None, "", "   "])
def test_risposta_vuota(api, content) -> None:
    state, url = api
    state.body = reply(content)
    with pytest.raises(ModelError) as exc:
        model(url).complete(MESSAGES)
    assert exc.value.kind == "response"


@pytest.mark.parametrize("body", [b"<html>errore</html>", {"choices": []}, [1, 2]])
def test_risposta_non_riconosciuta(api, body) -> None:
    state, url = api
    state.body = body
    with pytest.raises(ModelError) as exc:
        model(url).complete(MESSAGES)
    assert exc.value.kind == "response"


def test_tempo_scaduto(api) -> None:
    state, url = api
    state.delay_s = 1.0
    with pytest.raises(ModelError) as exc:
        model(url, timeout_s=0.2).complete(MESSAGES)
    assert exc.value.kind == "timeout"


@pytest.mark.parametrize("drop", ["senza risposta", "a metà"])
def test_connessione_interrotta_durante_la_risposta(api, drop: str) -> None:
    state, url = api
    state.drop = drop
    with pytest.raises(ModelError) as exc:
        model(url).complete(MESSAGES)
    assert exc.value.kind == "unreachable"
    assert "interrotta" in exc.value.message


def test_server_irraggiungibile() -> None:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    # porta libera e chiusa: connessione rifiutata
    with pytest.raises(ModelError) as exc:
        model(f"http://127.0.0.1:{port}/api/v1").complete(MESSAGES)
    assert exc.value.kind == "unreachable"
