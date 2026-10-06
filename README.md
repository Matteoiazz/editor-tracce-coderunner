# Tesi: editor di tracce d'esame CodeRunner

App desktop (Electron + React) con backend Python (FastAPI) per preparare tracce d'esame
da importare su Moodle/CodeRunner, con una seconda parte di RAG/AI.

## Funzioni

- **Tracce d'esame e pretest** con i nomi della convenzione del docente
  (`Esame-AAAA-MM-GG-Traccia1-Esercizio1`, `Pretest-AAAA-MM-GG-Traccia1`).
- **Esercizi** con testo in HTML (anche tabelle), soluzione nascosta, codice per gli studenti
  generato dalla soluzione e test case; editor espandibili a tutta finestra.
- **Test comuni** a tutti gli esercizi della traccia, con i 9 test standard del docente.
- **Calcola output**: gli output attesi si ottengono eseguendo la soluzione, come CodeRunner
  (`python3_w_input`).
- **Verifica**: la soluzione viene eseguita su ogni test e confrontata con l'output atteso;
  l'esportazione è possibile solo quando tutto è superato.
- **Import ed export XML Moodle**, nello stesso formato degli export di Moodle (CDATA).
- **Archivio delle tracce** (SQLite) con salvataggio automatico, duplicazione, cestino, riuso di
  un esercizio da un'altra traccia, importazione di più XML, backup e ripristino.

## Struttura

```
backend/    API Python (FastAPI). Sorgenti in src/tesi, test in tests/
frontend/   App Electron + React + TypeScript (Vite)
```

Gli XML Moodle in `backend/tests/fixtures/moodle/` sono esercizi d'esame reali, pubblicati con il
consenso del docente.

## Licenza

[MIT](LICENSE).

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
L'app non ha menu; durante lo sviluppo F12 apre gli strumenti per sviluppatori e Ctrl+R ricarica
la pagina dopo aver completato il salvataggio.

## Test e controlli

```bash
cd backend
.venv/Scripts/python.exe -m pytest
.venv/Scripts/python.exe -m ruff check src tests

cd ../frontend
npm test           # test automatici (Vitest)
npm run build      # controllo dei tipi (TypeScript) e build
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
| `GET /api/tracks` | elenco delle tracce in archivio (`?trash=true` per il cestino) |
| `GET`, `PUT /api/tracks/{id}` | apre o salva una traccia |
| `POST /api/tracks/{id}/duplicate` | copia una traccia per un nuovo appello |
| `POST /api/tracks/{id}/exported` | registra l'esportazione della traccia |
| `POST /api/tracks/{id}/trash`, `/restore` | sposta nel cestino o ripristina |
| `DELETE /api/tracks/{id}` | elimina definitivamente una traccia del cestino |
| `DELETE /api/trash` | svuota il cestino |
| `GET /api/exercises?q=parole` | cerca gli esercizi dell'archivio per riusarli (`exclude_track` esclude una traccia) |
| `POST /api/archive/backup` | salva una copia dell'archivio nel file indicato (`{"path": ...}`) |
| `POST /api/archive/restore` | sostituisce l'archivio con un backup, conservando quello attuale |

L'archivio è il file `archivio.db` (SQLite) nella cartella dati dell'applicazione
(`%APPDATA%\tesi-frontend`); con `--data-dir CARTELLA` se ne usa un'altra, utile per le prove.

Gli XML reali del docente usati nei test sono in `backend/tests/fixtures/moodle/`.
