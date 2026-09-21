"""Punto di ingresso: `python -m tesi --port 8000`."""

import argparse

import uvicorn

from tesi.api.app import create_app


def main() -> None:
    parser = argparse.ArgumentParser(prog="tesi")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    # Solo localhost: il backend serve esclusivamente l'app Electron sulla stessa macchina.
    uvicorn.run(create_app(), host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
