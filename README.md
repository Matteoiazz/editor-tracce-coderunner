# Tesi: editor di tracce d'esame CodeRunner

App desktop (Electron + React) con backend Python (FastAPI) per preparare tracce d'esame
da importare su Moodle/CodeRunner, con una seconda parte di RAG/AI.

## Funzioni

- **Tracce d'esame e pretest** con i nomi della convenzione del docente
  (`Esame-AAAA-MM-GG-Traccia1-Esercizio1`, `Pretest-AAAA-MM-GG-Traccia1`).
- **Esercizi** con testo in HTML (anche tabelle), soluzione nascosta, codice per gli studenti
  generato dalla soluzione e test case; editor espandibili a tutta finestra. Con «Copia da…»
  si copia in un esercizio tutto il contenuto di un altro della stessa traccia (testo, soluzione,
  codice per gli studenti, test); la copia si può annullare finché l'esercizio non viene modificato.
- **Test comuni** a tutti gli esercizi della traccia, con i 9 test standard del docente.
- **Calcola output**: gli output attesi si ottengono eseguendo la soluzione, come CodeRunner
  (`python3_w_input`), e vengono subito verificati: così si scopre anche una soluzione che dà
  risultati diversi a ogni esecuzione.
- **Verifica**: la soluzione viene eseguita su ogni test e confrontata con l'output atteso (utile
  per gli esercizi importati e dopo una modifica della soluzione); l'esportazione è possibile solo
  quando tutto è superato.
- **Prima di esportare**: la colonna elenca cosa manca, una riga per esercizio, e segnala
  un'altra traccia dell'archivio con lo stesso tipo, data e numero (su Moodle le domande
  avrebbero gli stessi nomi, come capita con una traccia duplicata e non modificata).
- **Import ed export XML Moodle**, nello stesso formato degli export di Moodle (CDATA); le
  immagini incorporate nel testo vengono riportate nel file esportato.
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
.venv/Scripts/python.exe -m pip install -e ".[dev]"   # su macOS e Linux: .venv/bin/python

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
Dimensione, posizione e finestra massimizzata vengono ricordate tra un avvio e l'altro
(`finestra.json` nella cartella dati).
L'app non ha menu (su macOS solo quello essenziale, per Cmd+Q e copia/incolla); durante lo
sviluppo F12 apre gli strumenti per sviluppatori e Ctrl+R ricarica la pagina dopo aver completato
il salvataggio.

## Creare gli installer (Windows, macOS, Linux)

Ogni installer si crea sul proprio sistema, perché contiene il Python di quel sistema. Dentro
`frontend/` (con il server Vite spento, che altrimenti blocca la cartella di uscita):

```bash
npm run prepara-python   # una volta, o dopo aver cambiato il backend o le sue dipendenze
npm run installer        # build dell'interfaccia e installer del sistema in uso, in release/
```

`prepara-python` scarica Python 3.13 (controllandone l'impronta SHA256), vi installa le
dipendenze del backend con le stesse versioni del venv e copia il codice del backend in
`python-runtime/`. Su Windows usa la distribuzione "embeddable" di python.org, su macOS e Linux
le build di [python-build-standalone](https://github.com/astral-sh/python-build-standalone).
Lo stesso interprete avvia il backend ed esegue le soluzioni degli esercizi, come in sviluppo;
per questo il backend non è trasformato in un unico eseguibile.

| Sistema | File in `release/` |
|---|---|
| Windows | `Editor-tracce-CodeRunner-Setup-<versione>.exe` |
| macOS | `Editor-tracce-CodeRunner-<versione>-arm64.dmg` (Apple Silicon) o `-x64.dmg` (Intel) |
| Linux | `Editor-tracce-CodeRunner-<versione>-amd64.deb` e `-x86_64.AppImage` |

### Con GitHub Actions

Il workflow `.github/workflows/installer.yml` crea tutti gli installer sulle macchine di GitHub
(Windows, Mac Apple Silicon, Mac Intel, Linux), dopo aver eseguito i test. Per una nuova versione:
aggiornare `version` in `frontend/package.json`, fare commit e creare il tag corrispondente:

```bash
git tag v1.1.0
git push origin v1.1.0
```

Alla fine gli installer sono allegati alla release `v1.1.0` (creata se non esiste). Dalla scheda
**Actions** il workflow si può anche avviare a mano: gli installer restano tra gli "artifacts".

### Installazione

- **Windows**: l'installer installa l'app per l'utente corrente, senza permessi di
  amministratore, con collegamenti sul desktop e nel menu Start. Non ha firma digitale: al primo
  avvio Windows può mostrare "Windows ha protetto il PC"; si prosegue con
  **Ulteriori informazioni** → **Esegui comunque**.
- **macOS**: si apre il `.dmg` e si trascina l'app in Applicazioni. L'app non è firmata con un
  certificato Apple: al primo avvio macOS la blocca. Si apre **Impostazioni di Sistema** →
  **Privacy e sicurezza** e, in fondo, **Apri comunque** (serve una volta sola). In alternativa,
  dal Terminale: `xattr -dr com.apple.quarantine "/Applications/Editor tracce CodeRunner.app"`.
- **Linux**: su Ubuntu e Debian `sudo apt install ./Editor-tracce-CodeRunner-<versione>-amd64.deb`;
  sulle altre distribuzioni l'`AppImage` (resa eseguibile con `chmod +x`), che richiede FUSE 2
  (su Ubuntu il pacchetto `libfuse2t64`).

La disinstallazione non cancella l'archivio delle tracce.

## Sicurezza

- Il backend ascolta solo su `127.0.0.1` e a ogni avvio Electron genera un codice segreto che
  passa al backend (variabile d'ambiente) e alla pagina (preload): le API rispondono solo alle
  richieste con l'intestazione `X-App-Token` corretta. Così una pagina web aperta nel browser
  non può usare il backend, che esegue codice Python.
- Nell'app installata la pagina ha una Content Security Policy: script solo dai file dell'app e
  connessioni solo verso il backend locale. Un eventuale script dentro il testo HTML di un
  esercizio importato non viene eseguito.
- La pagina non ha accesso a Node.js (`contextIsolation`), solo alle funzioni del preload.
- Nell'app installata il backend gira con `python -I`: non legge variabili d'ambiente né pacchetti
  Python installati sul computer, quindi si comporta allo stesso modo su ogni PC.

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

Poi apri http://127.0.0.1:8000/docs per la documentazione interattiva delle API. Avviato a mano
il backend non richiede il codice segreto (lo richiede solo se c'è la variabile `TESI_TOKEN`).

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
| `POST /api/archive/check` | controlla un file di backup e dice quante tracce contiene |
| `POST /api/archive/restore` | sostituisce l'archivio con un backup, conservando quello attuale |

L'archivio è il file `archivio.db` (SQLite) nella cartella dati dell'applicazione
(`%APPDATA%\tesi-frontend` su Windows, `~/Library/Application Support/tesi-frontend` su macOS,
`~/.config/tesi-frontend` su Linux); con `--data-dir CARTELLA` se ne usa un'altra, utile per le prove.

Gli XML reali del docente usati nei test sono in `backend/tests/fixtures/moodle/`.
