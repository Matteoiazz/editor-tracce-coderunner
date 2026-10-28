"""Modello linguistico tramite l'API di OpenRouter, con la sola libreria standard.

La chiave arriva con ogni richiesta e non viene mai salvata dal backend. I certificati per
HTTPS sono quelli di certifi: il Python incluso nell'app su macOS e Linux non trova quelli
del sistema.
"""

import http.client
import json
import ssl
import urllib.error
import urllib.request

import certifi

from tesi.ports import Message, ModelError

API_URL = "https://openrouter.ai/api/v1"
# I modelli grandi, soprattutto quelli gratuiti, possono impiegare più di un minuto
DEFAULT_TIMEOUT_S = 120.0
# Identificano l'app nelle statistiche di OpenRouter, facoltativi
APP_TITLE = "Editor tracce CodeRunner"
APP_URL = "https://github.com/Matteoiazz/editor-tracce-coderunner"


class OpenRouterModel:
    def __init__(
        self,
        key: str,
        model: str,
        *,
        base_url: str = API_URL,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        temperature: float | None = None,
    ) -> None:
        self.key = key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self.temperature = temperature
        self._ssl = ssl.create_default_context(cafile=certifi.where())

    def complete(self, messages: list[Message]) -> str:
        body: dict = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
        }
        if self.temperature is not None:
            body["temperature"] = self.temperature
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "HTTP-Referer": APP_URL,
                "X-Title": APP_TITLE,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_s, context=self._ssl) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            raise _http_error(exc.code, _error_message(_body_of(exc))) from exc
        except TimeoutError as exc:
            raise _timeout() from exc
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, TimeoutError):
                raise _timeout() from exc
            raise ModelError(
                "unreachable", "OpenRouter non è raggiungibile, controlla la connessione"
            ) from exc
        except (http.client.HTTPException, OSError) as exc:
            # Connessione chiusa o interrotta mentre arriva la risposta: urllib non la converte
            # in URLError (es. RemoteDisconnected, IncompleteRead, ConnectionResetError)
            raise ModelError(
                "unreachable", "La connessione con OpenRouter si è interrotta: riprova"
            ) from exc
        return _content_of(raw)


def _timeout() -> ModelError:
    return ModelError(
        "timeout",
        "Il modello non ha risposto in tempo: riprova, oppure scegli un modello più veloce",
    )


def _body_of(exc: urllib.error.HTTPError) -> bytes:
    """Il corpo della risposta d'errore; vuoto se la connessione si interrompe mentre si legge."""
    try:
        return exc.read()
    except (http.client.HTTPException, OSError):
        return b""


def _error_message(raw: bytes) -> str:
    """Il messaggio d'errore di OpenRouter ({"error": {"message": ...}}), se c'è."""
    try:
        error = json.loads(raw).get("error")
    except (ValueError, AttributeError):
        return ""
    message = error.get("message") if isinstance(error, dict) else None
    return message.strip() if isinstance(message, str) else ""


def _http_error(status: int, detail: str) -> ModelError:
    suffix = f" ({detail})" if detail else ""
    if status == 401:
        return ModelError(
            "key", "OpenRouter non riconosce la chiave: controllala nelle Impostazioni"
        )
    if status == 402:
        return ModelError(
            "credit",
            "Crediti di OpenRouter esauriti per questo modello: scegli un modello gratuito "
            "o aggiungi crediti",
        )
    if status == 429:
        return ModelError(
            "rate",
            "Troppe richieste: i modelli gratuiti hanno un limite al giorno e al minuto. "
            "Riprova più tardi o scegli un altro modello",
        )
    if status in (400, 404):
        return ModelError("model", f"Il modello scelto non accetta la richiesta{suffix}")
    if status in (502, 503):
        return ModelError(
            "model", f"Il modello scelto al momento non è disponibile, riprova più tardi{suffix}"
        )
    if status == 408:
        return _timeout()
    if status == 0:
        # errore nel corpo di una risposta HTTP 200, senza codice
        return ModelError("other", f"OpenRouter ha segnalato un errore{suffix}")
    return ModelError("other", f"OpenRouter ha risposto con un errore (HTTP {status}){suffix}")


def _content_of(raw: bytes) -> str:
    """Il testo della prima risposta. OpenRouter può segnalare un errore anche con HTTP 200,
    nel corpo o nella singola risposta."""
    try:
        data = json.loads(raw)
    except ValueError as exc:
        raise ModelError("response", "Risposta di OpenRouter non riconosciuta") from exc
    if not isinstance(data, dict):
        raise ModelError("response", "Risposta di OpenRouter non riconosciuta")
    if "error" in data:
        code = data["error"].get("code") if isinstance(data["error"], dict) else None
        raise _http_error(code if isinstance(code, int) else 0, _error_message(raw))
    choices = data.get("choices")
    choice = choices[0] if isinstance(choices, list) and choices else None
    if not isinstance(choice, dict):
        raise ModelError("response", "Il modello non ha dato una risposta")
    if isinstance(choice.get("error"), dict):
        message = choice["error"].get("message")
        raise ModelError("model", f"Il modello si è interrotto: {message or 'errore'}")
    message = choice.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise ModelError("response", "Il modello ha dato una risposta vuota: riprova")
    return content
