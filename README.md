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
- **Test comuni** a tutti gli esercizi della traccia, con i 9 test standard del docente o creati
  con «Genera test…»: dimensioni da un valore a un altro con un passo, un numero di test per ogni
  passo o in totale (distribuiti in modo uniforme), seed consecutivi, visibili, nascosti o a caso. Un
  esercizio può escluderne alcuni (colonna «Usa» nei suoi test comuni), per esempio un input che
  per lui non ha senso; i test esclusi non vengono calcolati, verificati né esportati.
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
- **Impostazioni**: la chiave API di OpenRouter, nel portachiavi del sistema oppure protetta da
  una master password, mostrata solo in forma mascherata (`sk-or-v1-••••3f9a`) e controllabile con
  «Prova la chiave»; il modello delle funzioni AI, scelto dall'elenco di OpenRouter (ricerca,
  filtro dei modelli gratuiti, prezzo per milione di token) o scritto a mano; predefinito
  NVIDIA Nemotron 3 Ultra nella variante gratuita (`nvidia/nemotron-3-ultra-550b-a55b:free`). Ogni
  scelta si salva subito.
- **Aggiornamento automatico** su Windows, macOS e con l'AppImage su Linux: l'app controlla le
  release su GitHub poco dopo l'avvio e ogni 6 ore, scarica in silenzio la versione nuova e la
  installa alla chiusura, oppure subito con «Riavvia ora» dopo aver salvato il lavoro. Con il
  pacchetto `.deb`, o con l'app su macOS fuori dalla cartella Applicazioni, la versione nuova viene
  segnalata, con il link per scaricarla. Si può disattivare nelle impostazioni, dove c'è anche
  «Controlla ora».

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
Con gli installer il workflow allega i file per l'aggiornamento automatico: `latest.yml`
(Windows), `latest-linux.yml` (AppImage), `latest-mac-arm64.yml` e `latest-mac-x64.yml` con lo
`.zip` dell'app (macOS; i due Mac creano un file con lo stesso nome, che viene rinominato) e i
`.blockmap`, con cui si scaricano solo le parti cambiate.

### Installazione

- **Windows**: l'installer installa l'app per l'utente corrente, senza permessi di
  amministratore, con collegamenti sul desktop e nel menu Start. Non ha firma digitale: al primo
  avvio Windows può mostrare "Windows ha protetto il PC"; si prosegue con
  **Ulteriori informazioni** → **Esegui comunque**.
- **macOS**: si apre il `.dmg` e si trascina l'app in Applicazioni. L'app non è firmata con un
  certificato Apple: al primo avvio macOS la blocca. Si apre **Impostazioni di Sistema** →
  **Privacy e sicurezza** e, in fondo, **Apri comunque** (serve una volta sola). In alternativa,
  dal Terminale: `xattr -dr com.apple.quarantine "/Applications/Editor tracce CodeRunner.app"`.
  Per aggiornarsi da sola l'app deve stare in Applicazioni (non aperta dal disco del `.dmg`).
- **Linux**: su Ubuntu e Debian `sudo apt install ./Editor-tracce-CodeRunner-<versione>-amd64.deb`;
  sulle altre distribuzioni l'`AppImage` (resa eseguibile con `chmod +x`), che richiede FUSE 2
  (su Ubuntu il pacchetto `libfuse2t64`).

La disinstallazione non cancella l'archivio delle tracce.

### Aggiornamento automatico

L'app legge il file della versione dalla release più recente su GitHub, scarica la versione
nuova controllandone l'impronta SHA-512 e la installa alla chiusura dell'app, oppure subito con
«Riavvia ora». Prima di installare, l'app completa il salvataggio dell'archivio e aspetta che il
backend sia chiuso: su Windows i file del Python incluso, finché è in esecuzione, non si possono
sostituire. Una versione installata a mano prima della 1.2.0 non ha l'aggiornamento: la 1.2.0 va
installata a mano una volta.

- **Windows** ([electron-updater](https://www.electron.build/auto-update)): l'installer nuovo
  viene eseguito senza finestre e, con «Riavvia ora», riapre l'app.
- **Linux** (electron-updater): l'AppImage viene sostituita dalla nuova. Il pacchetto `.deb` per
  installarsi chiederebbe i permessi di amministratore: la versione nuova viene solo segnalata.
- **macOS**: l'aggiornamento standard di Electron richiede una firma Apple a pagamento, quindi
  l'app ha un aggiornatore suo (`electron/mac-updater.cjs`). Legge `latest-mac-arm64.yml` o
  `latest-mac-x64.yml` dalla release, scarica lo `.zip` dell'app controllandone l'impronta, lo
  estrae con `ditto` e controlla versione, identificativo e firma dell'app estratta. Alla
  chiusura, o con «Riavvia ora», lo script `electron/mac-swap.sh` aspetta che l'app sia chiusa,
  sposta da parte la versione attuale (`.Editor tracce CodeRunner.app-precedente`, nascosta
  accanto all'app), mette al suo posto la nuova e, con «Riavvia ora», la riapre: se non parte
  entro 20 secondi rimette la precedente. I passi sono annotati in `aggiornamento.log` nella
  cartella dati, e un aggiornamento non riuscito viene segnalato al successivo avvio. L'app deve
  stare in una cartella in cui l'utente può scrivere (di solito Applicazioni) e non essere aperta
  dal `.dmg`, altrimenti la versione nuova viene solo segnalata. macOS potrebbe chiedere il
  permesso «Gestione app» (Impostazioni di Sistema → Privacy e sicurezza) per lasciare che l'app
  si sostituisca.

Per provarlo senza pubblicare una release si costruiscono due versioni di prova con un altro nome
di pacchetto, di app e di eseguibile, così hanno una cartella di installazione e una cartella dati
loro e non toccano l'app vera, per esempio su Windows:

```bash
npx electron-builder --win --publish never -c.extraMetadata.version=1.1.90 -c.extraMetadata.name=prova-aggiornamento -c.appId=it.unical.prova-aggiornamento -c.productName=ProvaAggiornamento -c.executableName=prova-aggiornamento '-c.nsis.artifactName=Prova-aggiornamento-Setup-${version}.${ext}'
```

Si installa la versione meno recente, si mettono installer, `.blockmap` e `latest.yml` della più
recente in una cartella servita in locale (es. `python -m http.server 8766`) e si avvia l'app con
la variabile d'ambiente `TESI_UPDATE_URL=http://127.0.0.1:8766`, che sostituisce le release di
GitHub solo se è impostata. Su macOS si servono lo `.zip` e `latest-mac-<processore>.yml`.

Lo scambio di `mac-swap.sh` è provato con app finte dai test automatici, che girano su Linux e
sui due Mac di GitHub Actions; sui Mac i test usano anche `ditto`, `PlistBuddy` e `codesign` veri
su una copia della Calcolatrice di sistema.

## Sicurezza

- Il backend ascolta solo su `127.0.0.1` e a ogni avvio Electron genera un codice segreto che
  passa al backend (variabile d'ambiente) e alla pagina (preload): le API rispondono solo alle
  richieste con l'intestazione `X-App-Token` corretta. Così una pagina web aperta nel browser
  non può usare il backend, che esegue codice Python.
- Nell'app installata la pagina ha una Content Security Policy: script solo dai file dell'app e
  connessioni solo verso il backend locale. Un eventuale script dentro il testo HTML di un
  esercizio importato non viene eseguito.
- La pagina non ha accesso a Node.js (`contextIsolation`), solo alle funzioni del preload.
- L'elenco dei modelli di OpenRouter (pubblico, senza chiave) lo scarica il processo principale
  di Electron: la pagina resta limitata al backend locale. Le impostazioni le scrive solo il
  processo principale, e la pagina può cambiare solo i valori previsti.
- La chiave API sta nel file `chiave-api.json`, separato dall'archivio (non finisce nei backup),
  leggibile solo dall'utente su macOS e Linux. Senza master password è cifrata con il portachiavi
  del sistema (`safeStorage` di Electron: DPAPI su Windows, Portachiavi su macOS, libsecret o
  KWallet su Linux). Con la master password è cifrata con AES-256-GCM, con una chiave ricavata
  dalla password con scrypt (N = 2^17, r = 8, p = 1); sale e vettore iniziale sono casuali a ogni
  salvataggio e la password non viene salvata: se si dimentica, si rimuove la chiave e se ne
  inserisce una nuova. La chiave protetta si sblocca una volta per sessione e resta solo in
  memoria nel processo principale; la pagina riceve la chiave solo con «Mostra», e la chiave non
  compare nei log. «Prova la chiave» chiede a OpenRouter i dati della chiave, senza consumare
  crediti.
- Su Linux senza portachiavi (per esempio senza GNOME o KDE) Electron cifra con una chiave fissa:
  la vista lo segnala e consiglia la master password. Su macOS, dopo un aggiornamento dell'app,
  il sistema può chiedere di nuovo il permesso di usare il Portachiavi, perché l'app non ha una
  firma Apple stabile.
- Nell'app installata il backend gira con `python -I`: non legge variabili d'ambiente né pacchetti
  Python installati sul computer, quindi si comporta allo stesso modo su ogni PC.

## Test e controlli

```bash
cd backend
.venv/Scripts/python.exe -m pytest
.venv/Scripts/python.exe -m ruff check src tests

cd ../frontend
npm test           # test automatici (Vitest), anche dei moduli del processo principale di Electron
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
La cartella prende il nome del pacchetto (`name` in `frontend/package.json`), che quindi non va
cambiato; le versioni di prova costruite con un altro nome usano una cartella loro.
Nella stessa cartella ci sono `impostazioni.json` (scritto in modo sicuro: prima un file temporaneo,
poi la sostituzione; se è illeggibile se ne conserva una copia e si riparte dai valori predefiniti),
`modelli-openrouter.json`, la copia dell'elenco dei modelli, usata per un giorno o quando manca
la connessione, e `chiave-api.json` con la chiave API cifrata.

Gli XML reali del docente usati nei test sono in `backend/tests/fixtures/moodle/`.
