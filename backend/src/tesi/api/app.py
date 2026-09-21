"""Costruzione dell'applicazione FastAPI.

Il layer API deve restare sottile: traduce HTTP in chiamate ai casi d'uso
e viceversa, senza contenere logica di dominio.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def create_app() -> FastAPI:
    app = FastAPI(title="Tesi backend", version="0.1.0")

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

    return app
