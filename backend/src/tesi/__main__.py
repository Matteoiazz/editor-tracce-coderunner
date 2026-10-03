"""Punto di ingresso: `python -m tesi --port 8000 [--data-dir CARTELLA]`."""

import argparse
from pathlib import Path

import uvicorn

from tesi.api.app import create_app


def main() -> None:
    parser = argparse.ArgumentParser(prog="tesi")
    parser.add_argument("--port", type=int, default=8000)
    # Electron passa la propria cartella dati; senza, si usa quella predefinita
    parser.add_argument("--data-dir", type=Path, default=None)
    args = parser.parse_args()

    # Solo localhost: il backend serve esclusivamente l'app Electron sulla stessa macchina.
    uvicorn.run(create_app(args.data_dir), host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
