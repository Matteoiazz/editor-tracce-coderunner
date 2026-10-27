"""Prepara il Python incluso nell'installer, nella cartella frontend/python-runtime.

Si prepara il Python del sistema su cui si esegue lo script (Windows, macOS o Linux): l'installer
di ogni sistema va creato su quel sistema. Lo stesso interprete esegue il backend e le soluzioni
degli esercizi, come in sviluppo; per questo non si può trasformare il backend in un unico
eseguibile.

- Windows: la distribuzione "embeddable" ufficiale di python.org (interprete e libreria standard).
- macOS e Linux: le build "install_only" di python-build-standalone, un Python completo che
  funziona da qualunque cartella (python.org non pubblica una versione equivalente).

Uso (dalla cartella frontend, con il Python del venv del backend):
    ../backend/.venv/Scripts/python.exe scripts/prepara_python.py   (Windows)
    ../backend/.venv/bin/python scripts/prepara_python.py           (macOS e Linux)
"""

import hashlib
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

PYTHON_VERSION = "3.13.16"
STANDALONE_RELEASE = "20261013"
STANDALONE_URL = (
    "https://github.com/astral-sh/python-build-standalone/releases/download/"
    f"{STANDALONE_RELEASE}/cpython-{PYTHON_VERSION}+{STANDALONE_RELEASE}-{{triple}}"
    "-install_only_stripped.tar.gz"
)
# Dipendenze del backend usate in produzione (pyproject.toml, senza quelle di sviluppo)
REQUIREMENTS = ["fastapi", "uvicorn[standard]", "python-multipart", "certifi"]

FRONTEND = Path(__file__).resolve().parent.parent
BACKEND = FRONTEND.parent / "backend"
TARGET = FRONTEND / "python-runtime"

# Percorsi in cui il Python di Windows cerca i moduli. Il file ._pth sostituisce le variabili
# d'ambiente: il Python incluso non vede installazioni di Python già presenti sul computer.
# "import site" carica il modulo site, che definisce exit() e quit() come nel Python normale
# (le soluzioni possono usarle); Electron avvia il backend con -I, quindi site non aggiunge
# i pacchetti installati dall'utente.
PTH_LINES = ["python313.zip", ".", "Lib\\site-packages", "app", "import site"]


@dataclass(frozen=True)
class Runtime:
    """Il Python da scaricare per un sistema e dove si trovano i suoi file."""

    url: str
    # Impronta dell'archivio: se il file scaricato è diverso, la preparazione si ferma
    sha256: str
    # Percorso dell'interprete dentro python-runtime (lo stesso usato da electron/main.cjs)
    python: str
    # Cartella in cui copiare il codice del backend
    app_folder: str


RUNTIMES = {
    ("win32", "amd64"): Runtime(
        url=f"https://www.python.org/ftp/python/{PYTHON_VERSION}/"
        f"python-{PYTHON_VERSION}-embed-amd64.zip",
        sha256="97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297",
        python="python.exe",
        app_folder="app",
    ),
    ("darwin", "arm64"): Runtime(
        url=STANDALONE_URL.format(triple="aarch64-apple-darwin"),
        sha256="16a5332fb0dcb77f163fc8f8cbccd95be1644cc53e68e5d2a79f50afd6680a0e",
        python="bin/python3",
        app_folder="lib/python3.13/site-packages",
    ),
    ("darwin", "x86_64"): Runtime(
        url=STANDALONE_URL.format(triple="x86_64-apple-darwin"),
        sha256="f507ae04eb7747cd97cb484e8c5d83936cbfc52d9b08a1f35c00b47c707b1ae1",
        python="bin/python3",
        app_folder="lib/python3.13/site-packages",
    ),
    ("linux", "x86_64"): Runtime(
        url=STANDALONE_URL.format(triple="x86_64-unknown-linux-gnu"),
        sha256="d0080766b6b74aeb81e1949ef0d9a20e6c17f7b160fb295a69b936ccb17660be",
        python="bin/python3",
        app_folder="lib/python3.13/site-packages",
    ),
}


def current_runtime() -> Runtime:
    key = (sys.platform, platform.machine().lower())
    if key not in RUNTIMES:
        sys.exit(f"Sistema non supportato: {key[0]} {key[1]}")
    return RUNTIMES[key]


def download(runtime: Runtime, destination: Path) -> None:
    print(f"Scarico {runtime.url}")
    with urllib.request.urlopen(runtime.url) as response, open(destination, "wb") as out:
        shutil.copyfileobj(response, out)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    if digest != runtime.sha256:
        sys.exit(f"Impronta SHA256 diversa da quella attesa: {digest}")


def extract(archive: Path) -> None:
    if archive.suffix == ".zip":
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(TARGET)
        return
    # L'archivio di python-build-standalone contiene una cartella "python" con tutto il resto
    with tarfile.open(archive) as tf:
        tf.extractall(archive.parent, filter="data")
    shutil.move(archive.parent / "python", TARGET)


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


def install_dependencies(runtime: Runtime, folder: Path) -> None:
    print("Installo le dipendenze del backend")
    common = [
        "--constraint", str(pinned_versions(folder)),
        "--only-binary=:all:", "--no-compile", "--disable-pip-version-check", "--quiet",
        *REQUIREMENTS,
    ]
    if sys.platform == "win32":
        # Il Python embeddable non ha pip: si usa quello del venv, chiedendo i pacchetti già
        # compilati per Windows 64 bit e Python 3.13
        command = [
            sys.executable, "-m", "pip", "install",
            "--target", str(TARGET / "Lib" / "site-packages"),
            "--platform", "win_amd64", "--python-version", "3.13", "--implementation", "cp",
        ]
    else:
        # Il Python standalone ha pip: installa nella propria cartella site-packages i
        # pacchetti adatti al suo sistema e processore
        command = [str(TARGET / runtime.python), "-I", "-m", "pip", "install"]
    subprocess.run([*command, *common], check=True)


# Parti del Python standalone che l'app non usa (pip serve solo durante la preparazione).
# Il Python embeddable di Windows non le contiene già.
UNUSED_STANDALONE_PARTS = [
    "include", "share", "bin/pip*", "bin/idle*",
    "lib/tcl*", "lib/tk*", "lib/itcl*", "lib/libtcl*",
    "lib/python3.13/site-packages/pip", "lib/python3.13/site-packages/pip-*",
    "lib/python3.13/ensurepip", "lib/python3.13/idlelib",
    "lib/python3.13/tkinter", "lib/python3.13/turtledemo",
    "lib/python3.13/lib-dynload/_tkinter*",
]


def remove_unused_parts() -> None:
    for pattern in UNUSED_STANDALONE_PARTS:
        for path in TARGET.glob(pattern):
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
            else:
                path.unlink()


def copy_backend(runtime: Runtime) -> None:
    print("Copio il codice del backend")
    shutil.copytree(
        BACKEND / "src" / "tesi",
        TARGET / runtime.app_folder / "tesi",
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )


# Una soluzione con input() eseguita come fa l'app: l'output deve contenere la riga letta
_RUN_CHECK = """\
from tesi.adapters.local_runner import LocalPythonRunner
result = LocalPythonRunner().run("print(input().upper())", "ciao\\n")
assert result.stdout == "ciao\\nCIAO\\n", result
print("Soluzione eseguita")
"""


def check(runtime: Runtime) -> None:
    """Il Python preparato deve avviare il backend senza il venv ed eseguire le soluzioni
    come il Python normale."""
    python = str(TARGET / runtime.python)
    subprocess.run(
        [python, "-I", "-c", "import tesi.api.app, uvicorn; print('Backend importato')"],
        check=True,
    )
    subprocess.run([python, "-I", "-c", _RUN_CHECK], check=True)
    # exit() e quit() devono esistere come nel Python installato normalmente
    subprocess.run([python, "-I", "-c", "exit()"], check=True)


def main() -> None:
    runtime = current_runtime()
    if TARGET.exists():
        shutil.rmtree(TARGET)
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        archive = folder / Path(runtime.url).name
        download(runtime, archive)
        extract(archive)
        install_dependencies(runtime, folder)
    if sys.platform == "win32":
        (TARGET / "python313._pth").write_text("\n".join(PTH_LINES) + "\n", encoding="utf-8")
    else:
        remove_unused_parts()
    copy_backend(runtime)
    check(runtime)
    print(f"Pronto: {TARGET}")


if __name__ == "__main__":
    main()
