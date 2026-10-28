// Processo principale di Electron: gira in Node.js, senza interfaccia.
// Responsabilità: avviare il backend Python, aprire la finestra, fermare il backend alla chiusura;
// dare alla pagina impostazioni e chiave API, gestite nei moduli settings.cjs e api-key.cjs;
// inoltrare al backend le richieste AI con chiave e modello (ai-client.cjs);
// aggiornare l'app (updater.cjs, con mac-updater.cjs su macOS).

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net: chromiumNet,
  safeStorage,
  screen,
  shell,
} = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const { createAiClient } = require("./ai-client.cjs");
const { createApiKeyStore } = require("./api-key.cjs");
const { listModels } = require("./models.cjs");
const { createSettingsStore } = require("./settings.cjs");
const { createUpdateController } = require("./updater.cjs");
const { homepage, name: packageName } = require("../package.json");

const isDev = !app.isPackaged;
const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";

// Nome mostrato nei titoli delle finestre di dialogo. La cartella dei dati (archivio delle
// tracce) porta il nome del pacchetto, "tesi-frontend", che non cambia: senza fissarla,
// cambiando nome all'app Electron ne userebbe una nuova. Una versione di prova costruita con
// un altro nome di pacchetto usa quindi una cartella sua e non tocca l'archivio vero.
const APP_NAME = "Editor tracce CodeRunner";
app.setPath("userData", path.join(app.getPath("appData"), packageName));
app.setName(APP_NAME);
// L'app è in italiano: anche i controlli di Chromium (es. il campo data, gg/mm/aaaa) lo sono,
// qualunque sia la lingua del sistema (su macOS Chromium usa comunque quella del sistema)
app.commandLine.appendSwitch("lang", "it");
const DEV_SERVER_URL = "http://localhost:5173";
// Tempo massimo concesso alla pagina per completare il salvataggio alla chiusura
const CLOSE_TIMEOUT_MS = 3000;

let backendProcess = null;
let backendPort = null;
// Codice segreto generato a ogni avvio: il backend risponde solo a chi lo presenta, cioè
// alla pagina dell'app. Senza, una pagina web aperta nel browser potrebbe chiamarlo.
const backendToken = crypto.randomBytes(32).toString("hex");
// Ultime righe scritte dal backend sugli errori: servono a spiegare un avvio fallito.
let backendErrorTail = "";
let backendExitCode = null;

/** Chiede al sistema operativo una porta libera (porta 0 = "scegli tu"). */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Come avviare il backend. In sviluppo: il Python del venv e i sorgenti del progetto.
 *  Nell'app installata: il Python incluso (risorsa "python"), che contiene già il codice del
 *  backend e le sue dipendenze, preparato da scripts/prepara_python.py. */
function backendCommand() {
  if (isDev) {
    const backendDir = path.join(__dirname, "..", "..", "backend");
    return {
      python: isWindows
        ? path.join(backendDir, ".venv", "Scripts", "python.exe")
        : path.join(backendDir, ".venv", "bin", "python"),
      flags: [],
      cwd: backendDir,
      env: { PYTHONPATH: path.join(backendDir, "src") },
    };
  }
  const runtime = path.join(process.resourcesPath, "python");
  // -I: il backend ignora variabili d'ambiente e pacchetti Python installati sul computer;
  // -u: output non bufferizzato (con -I la variabile PYTHONUNBUFFERED non vale)
  // Stesso percorso dell'interprete usato da scripts/prepara_python.py per ogni sistema
  const python = isWindows
    ? path.join(runtime, "python.exe")
    : path.join(runtime, "bin", "python3");
  return { python, flags: ["-I", "-u"], cwd: runtime, env: {} };
}

function startBackend(port) {
  const { python, flags, cwd, env } = backendCommand();
  // L'archivio delle tracce sta nella cartella dati dell'applicazione
  const args = [
    ...flags,
    ...["-m", "tesi", "--port", String(port), "--data-dir", app.getPath("userData")],
  ];
  backendProcess = spawn(python, args, {
    cwd,
    env: { ...process.env, ...env, PYTHONUNBUFFERED: "1", TESI_TOKEN: backendToken },
    // Senza, Windows aprirebbe una finestra del prompt dei comandi accanto all'app
    windowsHide: true,
  });
  backendProcess.stdout.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  backendProcess.stderr.on("data", (d) => {
    process.stderr.write(`[backend] ${d}`);
    backendErrorTail = (backendErrorTail + d).slice(-1500);
  });
  // Es. Python non trovato: senza questo gestore Electron andrebbe in errore non gestito
  backendProcess.on("error", (err) => {
    backendErrorTail += `\n${err.message}`;
    backendExitCode = -1;
    backendProcess = null;
  });
  backendProcess.on("exit", (code) => {
    console.log(`[backend] terminato (codice ${code})`);
    backendExitCode = code;
    backendProcess = null;
  });
}

/** Ferma il backend e aspetta che sia chiuso (al massimo qualche secondo). */
function stopBackendAndWait(timeoutMs = 5000) {
  const running = backendProcess;
  if (!running) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    running.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    stopBackend();
  });
}

function stopBackend() {
  if (!backendProcess) return;
  // Su Windows kill() da solo può lasciare processi figli: taskkill /T li chiude tutti.
  if (isWindows) {
    spawn("taskkill", ["/pid", String(backendProcess.pid), "/T", "/F"]);
  } else {
    backendProcess.kill();
  }
  backendProcess = null;
}

/** Aspetta che il backend risponda su /health, riprovando ogni 200 ms. */
async function waitForBackend(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (backendExitCode !== null) {
      throw new Error(`Il backend si è chiuso durante l'avvio (codice ${backendExitCode}).`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // non ancora pronto
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Il backend non ha risposto entro il tempo limite");
}

// ---------------------------------------------------------------- dimensione della finestra
// Sotto queste misure la colonna laterale e l'esercizio non stanno più affiancati
const MIN_WIDTH = 960;
const MIN_HEIGHT = 600;

function windowStateFile() {
  return path.join(app.getPath("userData"), "finestra.json");
}

/** Dimensione e posizione dell'ultima chiusura, se la finestra cade ancora su uno schermo
 *  (un monitor esterno potrebbe essere stato scollegato); altrimenti null. */
function savedWindowState() {
  try {
    const state = JSON.parse(fsSync.readFileSync(windowStateFile(), "utf-8"));
    const { x, y, width, height } = state;
    if (![x, y, width, height].every(Number.isFinite)) return null;
    const area = screen.getDisplayMatching({ x, y, width, height }).workArea;
    const visible =
      x < area.x + area.width && x + width > area.x && y < area.y + area.height && y + height > area.y;
    return visible ? { x, y, width, height, maximized: state.maximized === true } : null;
  } catch {
    return null; // primo avvio o file illeggibile
  }
}

/** Al primo avvio: finestra ampia ma contenuta nello schermo, al centro. */
function defaultWindowState() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  return { width: Math.min(1280, area.width), height: Math.min(820, area.height), maximized: false };
}

/** Alla chiusura si ricordano dimensione, posizione e finestra massimizzata. Le misure si
 *  aggiornano solo quando la finestra viene spostata o ridimensionata senza essere
 *  massimizzata: rileggerle a ogni chiusura le farebbe crescere di qualche pixel a ogni avvio,
 *  per gli arrotondamenti di Windows con il ridimensionamento dello schermo non intero. */
function rememberWindowState(win, initial) {
  let bounds = initial.x === undefined ? win.getBounds() : initial;
  const track = () => {
    if (!win.isMaximized() && !win.isMinimized()) bounds = win.getBounds();
  };
  win.on("resized", track);
  win.on("moved", track);
  win.once("close", () => {
    try {
      const { x, y, width, height } = bounds;
      const state = { x, y, width, height, maximized: win.isMaximized() };
      fsSync.writeFileSync(windowStateFile(), JSON.stringify(state));
    } catch (err) {
      console.error(`Dimensione della finestra non salvata: ${err.message}`);
    }
  });
}

function createWindow() {
  const state = savedWindowState() ?? defaultWindowState();
  const area = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    // Su uno schermo più piccolo delle misure minime vale lo schermo
    minWidth: Math.min(MIN_WIDTH, area.width),
    minHeight: Math.min(MIN_HEIGHT, area.height),
    // Nell'app installata l'icona viene dall'eseguibile; in sviluppo va indicata
    ...(isDev && { icon: path.join(__dirname, "..", "build", "icon.png") }),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      // Sicurezza: la pagina non ha accesso a Node.js, solo a ciò che espone il preload.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (state.maximized) win.maximize();
  rememberWindowState(win, state);
  protectWork(win);
  completeSaveOnClose(win);
  if (isDev) developerShortcuts(win);
  if (isDev) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

/** Evita di perdere la pagina per una navigazione involontaria. Chiusura e ricarica non
 *  richiedono conferma: il lavoro viene salvato automaticamente nell'archivio. */
function protectWork(win) {
  // Trascinare un file nella finestra la farebbe navigare verso quel file, perdendo la pagina.
  // Si blocca ogni navigazione; i link web si aprono nel browser di sistema.
  win.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    openInBrowser(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: "deny" };
  });
}

/** Chiede alla pagina di completare il salvataggio nell'archivio, poi esegue `action`;
 *  se la pagina non risponde entro qualche secondo, la esegue comunque. */
function afterSave(win, action) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    if (!win.isDestroyed()) action();
  };
  ipcMain.once("app:close-ready", run);
  setTimeout(run, CLOSE_TIMEOUT_MS);
  win.webContents.send("app:before-close");
}

/** Alla chiusura la pagina completa il salvataggio prima che la finestra si chiuda.
 *  Per installare un aggiornamento il salvataggio è già stato completato. */
function completeSaveOnClose(win) {
  let closing = false;
  win.on("close", (event) => {
    if (closing || installingUpdate) return;
    event.preventDefault();
    afterSave(win, () => {
      closing = true;
      win.close();
    });
  });
}

/** Senza menu servono scorciatoie per lo sviluppo: F12 apre gli strumenti per sviluppatori,
 *  Ctrl+R ricarica la pagina dopo aver completato il salvataggio. */
function developerShortcuts(win) {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F12") {
      event.preventDefault();
      win.webContents.toggleDevTools();
    } else if (input.control && input.key.toLowerCase() === "r") {
      event.preventDefault();
      afterSave(win, () => win.webContents.reload());
    }
  });
}

function openInBrowser(url) {
  if (/^https?:\/\//i.test(url) && !url.startsWith(DEV_SERVER_URL)) {
    shell.openExternal(url);
  }
}

// Il renderer chiede al main process su quale porta gira il backend e con quale codice.
ipcMain.handle("backend:get-connection", () => ({
  url: `http://127.0.0.1:${backendPort}`,
  token: backendToken,
}));

// Più file XML insieme, per importarli nell'archivio
ipcMain.handle("dialog:open-xml-multiple", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "Importa XML Moodle nell'archivio",
    filters: [{ name: "XML Moodle", extensions: ["xml"] }],
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled) return [];
  return Promise.all(
    result.filePaths.map(async (filePath) => ({
      path: filePath,
      content: await fs.readFile(filePath, "utf-8"),
    })),
  );
});

// Backup dell'archivio: la copia la scrive il backend, qui si sceglie solo il file
const BACKUP_FILTERS = [{ name: "Backup dell'archivio", extensions: ["db"] }];

ipcMain.handle("dialog:backup-target", async (event, defaultName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: "Salva un backup dell'archivio",
    defaultPath: defaultName,
    filters: BACKUP_FILTERS,
  });
  return result.canceled || !result.filePath ? null : result.filePath;
});

ipcMain.handle("dialog:backup-source", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "Ripristina l'archivio da un backup",
    filters: BACKUP_FILTERS,
    properties: ["openFile"],
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});

// Finestra di Windows "Apri file": il renderer non può leggere file da solo (non ha Node.js),
// quindi lo fa il main process e gli restituisce il contenuto.
ipcMain.handle("dialog:open-xml", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "Importa XML Moodle",
    filters: [{ name: "XML Moodle", extensions: ["xml"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, content: await fs.readFile(filePath, "utf-8") };
});

// ---------------------------------------------------------------- impostazioni

const settings = createSettingsStore(app.getPath("userData"));

ipcMain.handle("settings:get", () => settings.get());
ipcMain.handle("settings:update", async (_event, change) => {
  const view = await settings.update(change);
  if (updates && view.updates.auto !== updates.status().automatic) {
    updates.setAutomatic(view.updates.auto);
  }
  return view;
});

// Le richieste a Internet (OpenRouter, aggiornamenti su macOS) le fa il processo principale: la
// pagina può collegarsi solo al backend locale. Con la rete di Chromium vale anche il proxy
// configurato nel sistema.
const networkFetch = (url, init) => chromiumNet.fetch(url, init);

ipcMain.handle("settings:models", (_event, refresh) =>
  listModels(app.getPath("userData"), { refresh: refresh === true, fetch: networkFetch }),
);

// ---------------------------------------------------------------- chiave API

// Su Linux senza portachiavi (es. senza GNOME o KDE) Electron cifra con una chiave fissa:
// la chiave API resta leggibile da chi ha accesso ai file, e la vista lo segnala
let plainTextKeychain = false;

function ensureKeychain() {
  if (safeStorage.isEncryptionAvailable()) return;
  if (process.platform !== "linux") {
    throw new Error(
      "Il portachiavi del sistema non è disponibile: proteggi la chiave con una master password",
    );
  }
  safeStorage.setUsePlainTextEncryption(true);
  plainTextKeychain = true;
}

const systemKeychain = {
  // Si capisce senza accedere al portachiavi, che su macOS chiederebbe il permesso
  get weak() {
    return (
      process.platform === "linux" &&
      (plainTextKeychain || safeStorage.getSelectedStorageBackend() === "basic_text")
    );
  },
  encrypt(text) {
    ensureKeychain();
    return safeStorage.encryptString(text);
  },
  decrypt(data) {
    ensureKeychain();
    return safeStorage.decryptString(data);
  },
};

const apiKey = createApiKeyStore(app.getPath("userData"), {
  keychain: systemKeychain,
  fetch: networkFetch,
});

/** Gestore che restituisce { ok, value } oppure { ok: false, error }: gli errori previsti,
 *  come una master password errata, arrivano alla pagina come messaggi senza finire nel log. */
function handleWithResult(channel, handler) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, value: await handler(...args) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

handleWithResult("apikey:status", () => apiKey.status());
handleWithResult("apikey:save", (key, password) => apiKey.save(key, password ?? null));
handleWithResult("apikey:remove", () => apiKey.remove());
handleWithResult("apikey:reveal", (password) => apiKey.reveal(password ?? null));
handleWithResult("apikey:unlock", (password) => apiKey.unlock(password));
handleWithResult("apikey:lock", () => apiKey.lock());
handleWithResult("apikey:protect", (password) => apiKey.protect(password));
handleWithResult("apikey:unprotect", (password) => apiKey.unprotect(password));
handleWithResult("apikey:change-password", (current, next) => apiKey.changePassword(current, next));
handleWithResult("apikey:test", (password) => apiKey.test(password ?? null));

const ai = createAiClient({
  connection: () => ({ url: `http://127.0.0.1:${backendPort}`, token: backendToken }),
  key: () => apiKey.use(),
  model: async () => (await settings.get()).ai.model,
  fetch: (url, init) => fetch(url, init),
});

handleWithResult("ai:check", () => ai.check());
handleWithResult("ai:review", (question, notes) => ai.review(question, notes));
handleWithResult("ai:fix", (question, finding, extraInputs, notes) => ai.fix(question, finding, extraInputs, notes));
handleWithResult("ai:generate", (question, notes) => ai.generate(question, notes));
handleWithResult("ai:similar", (question, context, notes) => ai.similar(question, context, notes));

ipcMain.handle("app:version", () => app.getVersion());

// ---------------------------------------------------------------- aggiornamenti

const RELEASES_URL = `${homepage}/releases/latest`;
// Stato dell'aggiornamento, se su questo sistema si può aggiornare (vedi updateSupport)
let updates = null;
// Vero mentre l'app si chiude per installare un aggiornamento
let installingUpdate = false;

/** Pacchetto .app in esecuzione su macOS, es. "/Applications/Editor tracce CodeRunner.app". */
function macBundle() {
  return path.resolve(process.execPath, "..", "..", "..");
}

function canWrite(dir) {
  try {
    fsSync.accessSync(dir, fsSync.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Come si aggiorna questa installazione: "auto" (Windows, AppImage, macOS), "manual" (la
 *  versione nuova viene solo segnalata, `note` spiega perché) o "none", con il motivo. */
function updateSupport() {
  if (!app.isPackaged) {
    return { mode: "none", reason: "Gli aggiornamenti funzionano solo nell'app installata." };
  }
  if (isMac) {
    const { bundleLocationProblem } = require("./mac-updater.cjs");
    const problem = bundleLocationProblem(macBundle(), canWrite);
    return problem ? { mode: "manual", note: problem } : { mode: "auto" };
  }
  if (process.platform === "linux" && !process.env.APPIMAGE) {
    return {
      mode: "manual",
      note: "Con il pacchetto .deb le versioni nuove si installano scaricandole dalla pagina delle release.",
    };
  }
  return { mode: "auto" };
}

/** Da dove l'aggiornatore per macOS legge le versioni: il file per il processore di questo Mac
 *  nella release più recente, lo .zip in quella della sua versione (o un server di prova). */
function macFeed() {
  const metadata = `latest-mac-${process.arch === "arm64" ? "arm64" : "x64"}.yml`;
  const testServer = process.env.TESI_UPDATE_URL;
  if (testServer) {
    return {
      metadataUrl: `${testServer}/${metadata}`,
      fileUrl: (_version, name) => `${testServer}/${encodeURIComponent(name)}`,
    };
  }
  return {
    metadataUrl: `${homepage}/releases/latest/download/${metadata}`,
    fileUrl: (version, name) => `${homepage}/releases/download/v${version}/${encodeURIComponent(name)}`,
  };
}

/** L'aggiornatore per macOS e l'esito dell'ultimo aggiornamento, se non è riuscito. */
async function createMacUpdater() {
  const { MacUpdater, previousUpdateOutcome } = require("./mac-updater.cjs");
  const bundle = macBundle();
  const dataDir = app.getPath("userData");
  const cacheDir = path.join(app.getPath("home"), "Library", "Caches", `${packageName}-updater`);
  const failure = await previousUpdateOutcome({ bundle, dataDir, cacheDir });
  const updater = new MacUpdater({
    bundle,
    currentVersion: app.getVersion(),
    feed: macFeed(),
    cacheDir,
    dataDir,
    fetch: networkFetch,
    quit: () => app.quit(),
    onQuit: (listener) => app.once("quit", listener),
  });
  const initialError = failure
    ? `L'ultimo aggiornamento non è riuscito: ${failure}. La versione nuova si può scaricare ` +
      "dalla pagina delle release"
    : null;
  return { updater, initialError };
}

function updateStatus() {
  return updates ? updates.status() : { ...updateSupport(), downloadUrl: RELEASES_URL };
}

function sendUpdateStatus(status) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send("update:changed", status);
}

async function startUpdates() {
  const support = updateSupport();
  if (support.mode === "none") return;
  let updater;
  let initialError = null;
  if (isMac) {
    ({ updater, initialError } = await createMacUpdater());
  } else {
    // Caricato solo qui: in sviluppo e su macOS electron-updater non serve
    updater = require("electron-updater").autoUpdater;
    // Per le prove: le versioni da un server locale al posto delle release su GitHub
    if (process.env.TESI_UPDATE_URL) {
      updater.setFeedURL({ provider: "generic", url: process.env.TESI_UPDATE_URL });
    }
  }
  updates = createUpdateController({
    updater,
    mode: support.mode,
    note: support.note ?? null,
    initialError,
    downloadUrl: RELEASES_URL,
    onChange: sendUpdateStatus,
  });
  updates.setAutomatic((await settings.get()).updates.auto);
}

ipcMain.handle("update:status", () => updateStatus());
ipcMain.handle("update:check", () => (updates ? updates.check() : updateStatus()));

// "Riavvia ora": prima la pagina completa il salvataggio, come alla chiusura, poi l'app si
// chiude e si installa la versione nuova
ipcMain.handle("update:install", (event) => {
  if (updates?.status().phase !== "ready") return false;
  afterSave(BrowserWindow.fromWebContents(event.sender), () => {
    installingUpdate = true;
    // Su Linux la versione nuova parte prima che questa sia chiusa: senza liberare il blocco
    // dell'istanza unica si chiuderebbe subito, credendo che l'app sia già aperta
    app.releaseSingleInstanceLock();
    updates.install();
  });
  return true;
});

// ---------------------------------------------------------------- vecchio file di sessione
// Prima dell'archivio il lavoro in corso era salvato in sessione.json nella cartella dati.
// Al primo avvio con l'archivio il suo contenuto viene trasferito e il file rinominato.

function sessionFile() {
  return path.join(app.getPath("userData"), "sessione.json");
}

ipcMain.handle("session:load", async () => {
  try {
    return await fs.readFile(sessionFile(), "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") return null; // nessun lavoro da trasferire
    throw err;
  }
});

// Il file resta come copia di sicurezza con un altro nome
ipcMain.handle("session:mark-transferred", async () => {
  await fs.rename(sessionFile(), path.join(app.getPath("userData"), "sessione-trasferita.json"));
});

// Un salvataggio illeggibile viene messo da parte invece di essere sovrascritto.
ipcMain.handle("session:backup-corrupt", async () => {
  const backup = path.join(app.getPath("userData"), "sessione-danneggiata.json");
  await fs.copyFile(sessionFile(), backup);
  return backup;
});

// Finestra di Windows "Salva con nome": restituisce il percorso scelto, oppure null se annullata.
ipcMain.handle("dialog:save-xml", async (event, { defaultName, content }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: "Esporta XML Moodle",
    defaultPath: defaultName,
    filters: [{ name: "XML Moodle", extensions: ["xml"] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, content, "utf-8");
  return result.filePath;
});

// Una sola istanza: due finestre sullo stesso archivio si sovrascriverebbero il lavoro.
// Un secondo avvio porta in primo piano la finestra già aperta.
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) app.quit();

app.on("second-instance", () => {
  const [win] = BrowserWindow.getAllWindows();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(async () => {
  if (!isFirstInstance) return;
  // Il menu predefinito di Electron (in inglese, con strumenti per sviluppatori) non serve.
  // Su macOS resta il menu essenziale: senza il menu Modifica non funzionano Cmd+C, Cmd+V,
  // Cmd+Z e gli altri comandi da tastiera, e senza il menu dell'app non c'è Cmd+Q.
  Menu.setApplicationMenu(
    isMac ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }]) : null,
  );
  try {
    backendPort = await getFreePort();
    startBackend(backendPort);
    await waitForBackend(backendPort);
  } catch (err) {
    console.error(err);
    stopBackend();
    // Senza questa finestra l'applicazione si chiuderebbe senza spiegare nulla
    dialog.showErrorBox(
      "Impossibile avviare l'applicazione",
      `Il componente Python (backend) non si è avviato.\n\n${err.message}` +
        (backendErrorTail ? `\n\nDettagli:\n${backendErrorTail.trim()}` : ""),
    );
    app.quit();
    return;
  }
  createWindow();
  startUpdates().catch((err) => console.error(`Aggiornamenti non avviati: ${err.message}`));
});

app.on("window-all-closed", () => app.quit());

// Il backend si ferma solo dopo la chiusura delle finestre, che completano il salvataggio.
// L'app esce quando il backend è davvero chiuso: su Windows un aggiornamento da installare
// deve poter sostituire anche i file del Python incluso, bloccati finché è in esecuzione.
let backendStopped = false;
app.on("will-quit", (event) => {
  if (backendStopped || !backendProcess) return;
  event.preventDefault();
  stopBackendAndWait().then(() => {
    backendStopped = true;
    app.quit();
  });
});
