# Tesi: editor di tracce d'esame CodeRunner

App desktop (Electron + React) con backend Python (FastAPI) per preparare tracce d'esame
da importare su Moodle/CodeRunner, con una seconda parte di RAG/AI.

## Struttura

```
backend/    API Python (FastAPI). Sorgenti in src/tesi, test in tests/
frontend/   App Electron + React + TypeScript (Vite)
```

## Setup (una volta)

```bash
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -e ".[dev]"

cd ../frontend
npm install
```

Se `npm install` non scarica il binario di Electron (compare l'errore
"Electron failed to install correctly"), esegui: `node node_modules/electron/install.js`.

## Sviluppo

Due terminali dentro `frontend/`:

```bash
npm run dev        # server Vite (interfaccia) su http://localhost:5173
npm run electron   # apre l'app: avvia da sola il backend Python
```

Il backend non va avviato a mano: lo lancia Electron su una porta libera e lo ferma alla chiusura.

## Test e controlli del backend

```bash
cd backend
.venv/Scripts/python.exe -m pytest
.venv/Scripts/python.exe -m ruff check src tests
```

## Provare il backend da solo

```bash
cd backend
.venv/Scripts/python.exe -m tesi --port 8000
```

Poi apri http://127.0.0.1:8000/docs per la documentazione interattiva delle API:

| Endpoint | Cosa fa |
|---|---|
| `POST /api/questions/import` | carica un XML esportato da Moodle e restituisce gli esercizi in JSON |
| `POST /api/questions/verify` | esegue la soluzione del docente su ogni test e dice quali passano |
| `POST /api/questions/fill-expected` | calcola gli output attesi dei test dalla soluzione del docente |
| `POST /api/questions/export` | produce l'XML da importare nella banca delle domande di Moodle |

Gli XML reali del docente usati nei test sono in `backend/tests/fixtures/moodle/`.
