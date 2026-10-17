"""Prepara il Python incluso nell'installer, nella cartella frontend/python-runtime.

Si usa la distribuzione "embeddable" ufficiale di Python per Windows: contiene l'interprete e
la libreria standard. Lo stesso python.exe esegue il backend e le soluzioni degli esercizi,
come in sviluppo; per questo non si può trasformare il backend in un unico .exe.

Uso (dalla cartella frontend, con il Python del venv del backend):
    ../backend/.venv/Scripts/python.exe scripts/prepara_python.py
"""

import hashlib
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

PYTHON_VERSION = "3.13.16"
PYTHON_URL = (
    f"https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip"
)
# Impronta dello zip: se il file scaricato è diverso, la preparazione si ferma
PYTHON_SHA256 = "97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297"
# Dipendenze del backend usate in produzione (pyproject.toml, senza quelle di sviluppo)
REQUIREMENTS = ["fastapi", "uvicorn[standard]", "python-multipart"]

FRONTEND = Path(__file__).resolve().parent.parent
BACKEND = FRONTEND.parent / "backend"
TARGET = FRONTEND / "python-runtime"

# Percorsi in cui l'interprete cerca i moduli. Il file ._pth sostituisce le variabili
# d'ambiente: il Python incluso non vede installazioni di Python già presenti sul computer.
PTH_LINES = ["python313.zip", ".", "Lib\\site-packages", "app"]


def download(url: str, destination: Path) -> None:
    print(f"Scarico {url}")
    with urllib.request.urlopen(url) as response, open(destination, "wb") as out:
        shutil.copyfileobj(response, out)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    if digest != PYTHON_SHA256:
        sys.exit(f"Impronta SHA256 diversa da quella attesa: {digest}")


def pinned_versions(folder: Path) -> Path:
    """Vincola le dipendenze alle versioni installate nel venv, quelle provate con i test."""
    freeze = subprocess.run(
        [sys.executable, "-m", "pip", "freeze", "--exclude-editable"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    constraints = folder / "vincoli.txt"
    constraints.write_text(freeze, encoding="utf-8")
    return constraints


def install_dependencies(folder: Path) -> None:
    print("Installo le dipendenze del backend")
    subprocess.run(
        [
            sys.executable, "-m", "pip", "install",
            "--target", str(TARGET / "Lib" / "site-packages"),
            # Pacchetti già compilati per Windows 64 bit e Python 3.13
            "--only-binary=:all:", "--platform", "win_amd64",
            "--python-version", "3.13", "--implementation", "cp",
            "--constraint", str(pinned_versions(folder)),
            "--no-compile", "--disable-pip-version-check", "--quiet",
            *REQUIREMENTS,
        ],
        check=True,
    )


def copy_backend() -> None:
    print("Copio il codice del backend")
    shutil.copytree(
        BACKEND / "src" / "tesi",
        TARGET / "app" / "tesi",
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )


def check() -> None:
    """Il Python preparato deve avviare il backend senza il venv."""
    python = TARGET / "python.exe"
    subprocess.run(
        [str(python), "-I", "-c", "import tesi.api.app, uvicorn; print('Backend importato')"],
        check=True,
    )


def main() -> None:
    if TARGET.exists():
        shutil.rmtree(TARGET)
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        archive = folder / "python.zip"
        download(PYTHON_URL, archive)
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(TARGET)
        install_dependencies(folder)
    (TARGET / "python313._pth").write_text("\n".join(PTH_LINES) + "\n", encoding="utf-8")
    copy_backend()
    check()
    print(f"Pronto: {TARGET}")


if __name__ == "__main__":
    main()
