"""Costruzione dell'applicazione FastAPI.

Il layer API deve restare sottile: traduce HTTP in chiamate ai casi d'uso
e viceversa, senza contenere logica di dominio.
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tesi.adapters.sqlite_archive import SqliteTrackArchive
from tesi.api.questions import router as questions_router
from tesi.api.tracks import router as tracks_router

ARCHIVE_FILE = "archivio.db"


def default_data_dir() -> Path:
    """Cartella dati dell'applicazione: la stessa che Electron usa su Windows
    (tesi-frontend dentro %APPDATA%)."""
    appdata = os.environ.get("APPDATA")
    return Path(appdata) / "tesi-frontend" if appdata else Path.home() / ".tesi-frontend"


def create_app(data_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="Tesi backend", version="0.1.0")
    app.state.archive = SqliteTrackArchive((data_dir or default_data_dir()) / ARCHIVE_FILE)

    # L'interfaccia gira su un'origine diversa (server Vite in sviluppo,
    # file:// in produzione) e parla col backend via fetch(): serve CORS.
    # Il backend ascolta solo su 127.0.0.1, quindi non è raggiungibile dalla rete.
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
    return app
