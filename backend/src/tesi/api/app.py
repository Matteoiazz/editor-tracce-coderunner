"""Costruzione dell'applicazione FastAPI.

Il layer API deve restare sottile: traduce HTTP in chiamate ai casi d'uso
e viceversa, senza contenere logica di dominio.
"""

import os
import secrets
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from tesi.adapters.openrouter import OpenRouterModel
from tesi.adapters.sqlite_archive import SqliteTrackArchive
from tesi.api.ai import router as ai_router
from tesi.api.questions import router as questions_router
from tesi.api.tracks import router as tracks_router

ARCHIVE_FILE = "archivio.db"
# Intestazione con il codice segreto che Electron genera a ogni avvio
TOKEN_HEADER = "X-App-Token"


def default_data_dir() -> Path:
    """Cartella dati dell'applicazione: la stessa che Electron usa su Windows
    (tesi-frontend dentro %APPDATA%)."""
    appdata = os.environ.get("APPDATA")
    return Path(appdata) / "tesi-frontend" if appdata else Path.home() / ".tesi-frontend"


def create_app(data_dir: Path | None = None, token: str | None = None) -> FastAPI:
    """``token``: se indicato, ogni richiesta alle API deve presentarlo nell'intestazione
    ``X-App-Token``. Electron lo genera a ogni avvio e lo comunica solo alla propria pagina."""
    app = FastAPI(title="Tesi backend", version="0.1.0")
    app.state.archive = SqliteTrackArchive((data_dir or default_data_dir()) / ARCHIVE_FILE)
    # Modello linguistico per chiave e identificativo, creato a ogni richiesta AI
    app.state.model_factory = OpenRouterModel

    if token:

        @app.middleware("http")
        async def require_token(request: Request, call_next):
            # Le richieste preliminari CORS (OPTIONS) non portano intestazioni personalizzate
            if request.url.path.startswith("/api") and request.method != "OPTIONS":
                sent = request.headers.get(TOKEN_HEADER, "")
                if not secrets.compare_digest(sent, token):
                    return JSONResponse({"detail": "Richiesta non autorizzata"}, status_code=401)
            return await call_next(request)

    # L'interfaccia gira su un'origine diversa (server Vite in sviluppo, file:// in
    # produzione, che il browser presenta come "null") e parla col backend via fetch():
    # serve CORS. L'origine "null" può averla anche una pagina web qualsiasi, per questo
    # le API richiedono il codice segreto. Il backend ascolta solo su 127.0.0.1.
    # Aggiunto dopo il controllo del codice, così anche le risposte 401 hanno le
    # intestazioni CORS e la pagina può leggerne il messaggio.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "null"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        """Usato da Electron per capire quando il backend è pronto."""
        return {"status": "ok"}

    app.include_router(questions_router)
    app.include_router(tracks_router)
    app.include_router(ai_router)
    return app
