// Processo principale di Electron: gira in Node.js, senza interfaccia.
// Responsabilità: avviare il backend Python, aprire la finestra, fermare il backend alla chiusura.

const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");

const isDev = !app.isPackaged;

// Nome mostrato nei titoli delle finestre di dialogo. La cartella dei dati (archivio delle
// tracce) resta quella di sempre: senza fissarla, cambiando nome Electron ne userebbe una nuova.
const APP_NAME = "Editor tracce CodeRunner";
app.setPath("userData", path.join(app.getPath("appData"), "tesi-frontend"));
app.setName(APP_NAME);
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
      python: path.join(backendDir, ".venv", "Scripts", "python.exe"),
      flags: [],
      cwd: backendDir,
      env: { PYTHONPATH: path.join(backendDir, "src") },
    };
  }
  const runtime = path.join(process.resourcesPath, "python");
  // -I: il backend ignora variabili d'ambiente e pacchetti Python installati sul computer;
  // -u: output non bufferizzato (con -I la variabile PYTHONUNBUFFERED non vale)
  return { python: path.join(runtime, "python.exe"), flags: ["-I", "-u"], cwd: runtime, env: {} };
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

function stopBackend() {
  if (!backendProcess) return;
  // Su Windows kill() da solo può lasciare processi figli: taskkill /T li chiude tutti.
  if (process.platform === "win32") {
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

/** Alla chiusura la pagina completa il salvataggio prima che la finestra si chiuda. */
function completeSaveOnClose(win) {
  let closing = false;
  win.on("close", (event) => {
    if (closing) return;
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
  // Il menu predefinito di Electron (in inglese, con strumenti per sviluppatori) non serve
  Menu.setApplicationMenu(null);
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
});

app.on("window-all-closed", () => app.quit());
// Il backend si ferma solo dopo la chiusura delle finestre, che completano il salvataggio
app.on("will-quit", stopBackend);
