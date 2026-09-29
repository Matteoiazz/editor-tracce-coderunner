// Processo principale di Electron: gira in Node.js, senza interfaccia.
// Responsabilità: avviare il backend Python, aprire la finestra, fermare il backend alla chiusura.

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");

const isDev = !app.isPackaged;
const DEV_SERVER_URL = "http://localhost:5173";

let backendProcess = null;
let backendPort = null;
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

/** In sviluppo usa il Python del venv del progetto. */
function pythonExecutable() {
  return path.join(__dirname, "..", "..", "backend", ".venv", "Scripts", "python.exe");
}

function startBackend(port) {
  const backendDir = path.join(__dirname, "..", "..", "backend");
  backendProcess = spawn(pythonExecutable(), ["-m", "tesi", "--port", String(port)], {
    cwd: backendDir,
    env: { ...process.env, PYTHONPATH: path.join(backendDir, "src"), PYTHONUNBUFFERED: "1" },
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      // Sicurezza: la pagina non ha accesso a Node.js, solo a ciò che espone il preload.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  protectWork(win);
  if (isDev) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

/** Evita di perdere il lavoro per una chiusura, una ricarica o una navigazione involontaria. */
function protectWork(win) {
  // La pagina segnala lavoro non esportato bloccando la chiusura (evento beforeunload);
  // Electron non mostra una conferma da solo, quindi la mostra il processo principale.
  win.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Chiudi comunque", "Annulla"],
      defaultId: 1,
      cancelId: 1,
      title: "Lavoro non salvato",
      message: "Gli esercizi presenti andranno persi.",
      detail: "Esporta l'XML prima di chiudere o ricaricare, se vuoi conservarli.",
    });
    if (choice === 0) event.preventDefault(); // procede con la chiusura
  });

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

function openInBrowser(url) {
  if (/^https?:\/\//i.test(url) && !url.startsWith(DEV_SERVER_URL)) {
    shell.openExternal(url);
  }
}

// Il renderer chiede al main process su quale porta gira il backend.
ipcMain.handle("backend:get-url", () => `http://127.0.0.1:${backendPort}`);

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

app.whenReady().then(async () => {
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
app.on("before-quit", stopBackend);
