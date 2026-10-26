// Aggiornatore per macOS. L'aggiornamento standard di Electron (Squirrel.Mac, usato da
// electron-updater) richiede un'app firmata con un certificato Apple Developer, a pagamento:
// questo modulo fa lo stesso lavoro con gli strumenti di macOS e, verso updater.cjs, si
// comporta come l'autoUpdater di electron-updater (stessi eventi e metodi).
//
// 1. Legge dalla release più recente il file della versione per il processore del Mac
//    (latest-mac-arm64.yml o latest-mac-x64.yml, allegati dal workflow di GitHub).
// 2. Se la versione è più recente scarica lo .zip dell'app e ne controlla l'impronta SHA-512.
// 3. Lo estrae con ditto, che conserva i collegamenti interni dell'app, e controlla versione,
//    identificativo e firma dell'app estratta.
// 4. Alla chiusura dell'app, o subito con "Riavvia ora", mac-swap.sh mette la versione nuova al
//    posto di quella installata, tenendo da parte la precedente finché la nuova non è a posto.

const { execFile, spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const yaml = require("js-yaml");

const METADATA_TIMEOUT_MS = 30_000;
// Nella cartella dati: registro dei passi dello scambio ed esito, letto al prossimo avvio
const LOG_FILE = "aggiornamento.log";
const RESULT_FILE = "aggiornamento-esito.txt";

/** Confronta due versioni come "1.2.10": negativo se a viene prima, zero se sono uguali.
 *  Una versione con suffisso (es. 1.2.0-beta.1) viene prima della stessa senza suffisso. */
function compareVersions(a, b) {
  const parse = (version) => {
    const text = String(version).trim().replace(/^v/, "");
    const dash = text.indexOf("-");
    const main = dash < 0 ? text : text.slice(0, dash);
    return {
      parts: main.split(".").map((part) => Number.parseInt(part, 10) || 0),
      suffix: dash < 0 ? null : text.slice(dash + 1),
    };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.parts.length, y.parts.length); i++) {
    const difference = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (difference !== 0) return difference;
  }
  if (x.suffix === y.suffix) return 0;
  if (x.suffix === null) return 1;
  if (y.suffix === null) return -1;
  return x.suffix < y.suffix ? -1 : 1;
}

/** Versione e .zip dal file della versione creato da electron-builder. */
function parseUpdateInfo(text) {
  let data = null;
  try {
    data = yaml.load(text);
  } catch {
    // YAML non valido: segnalato qui sotto
  }
  const files = Array.isArray(data?.files) ? data.files : [];
  const zip = files.find((file) => typeof file?.url === "string" && file.url.endsWith(".zip"));
  const version = typeof data?.version === "string" || typeof data?.version === "number" ? String(data.version) : null;
  // Solo un nome di file: l'indirizzo da cui scaricarlo lo compone l'aggiornatore
  if (!version || !zip || typeof zip.sha512 !== "string" || /[/\\]/.test(zip.url)) {
    throw new Error("File della versione per macOS non riconosciuto");
  }
  return {
    version,
    file: { name: zip.url, sha512: zip.sha512, size: Number.isInteger(zip.size) ? zip.size : null },
  };
}

/** Perché l'app nel pacchetto `bundle` non può aggiornarsi da sola, oppure null.
 *  `canWrite(cartella)` dice se si può scrivere nella cartella. */
function bundleLocationProblem(bundle, canWrite) {
  if (!bundle.endsWith(".app")) return "L'app non è avviata dal suo pacchetto .app.";
  if (bundle.includes("/AppTranslocation/")) {
    return (
      "macOS ha avviato l'app da una posizione temporanea, perché non è stata spostata con il " +
      "Finder: trascinala nella cartella Applicazioni e riaprila da lì."
    );
  }
  if (!canWrite(path.dirname(bundle))) {
    return bundle.startsWith("/Volumes/")
      ? "L'app è aperta dal disco del .dmg: trascinala nella cartella Applicazioni e riaprila da lì."
      : "Non hai i permessi per modificare la cartella dell'app: le versioni nuove si installano " +
          "scaricandole dalla pagina delle release.";
  }
  return null;
}

/** Dove lo scambio tiene da parte la versione attuale: accanto all'app, nascosta. */
function backupPath(bundle) {
  return path.join(path.dirname(bundle), `.${path.basename(bundle)}-precedente`);
}

/** Esegue un programma e ne restituisce l'output; l'errore riporta ciò che ha scritto. */
function runCommand(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, (err, stdout, stderr) => {
      if (err) reject(new Error(`${path.basename(file)}: ${(stderr || err.message).trim()}`));
      else resolve(stdout);
    });
  });
}

/** Avvia un programma staccato dall'app: continua anche dopo che l'app si è chiusa. */
function spawnDetached(file, args) {
  spawn(file, args, { detached: true, stdio: "ignore" }).unref();
}

/** All'avvio: motivo del fallimento dell'ultimo aggiornamento (null se non ce n'è stato o è
 *  riuscito) e pulizia di ciò che resta: la versione precedente e i file scaricati. */
async function previousUpdateOutcome({ bundle, dataDir, cacheDir }) {
  const resultFile = path.join(dataDir, RESULT_FILE);
  let result = null;
  try {
    result = (await fsp.readFile(resultFile, "utf-8")).trim();
    await fsp.rm(resultFile, { force: true });
  } catch {
    // nessun aggiornamento dall'ultimo avvio
  }
  // L'app installata è partita: la versione precedente tenuta da parte non serve più
  await fsp.rm(backupPath(bundle), { recursive: true, force: true });
  await fsp.rm(cacheDir, { recursive: true, force: true });
  return result?.startsWith("errore:") ? result.slice("errore:".length).trim() : null;
}

class MacUpdater extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.bundle app installata (cartella .app)
   * @param {string} options.currentVersion versione in esecuzione
   * @param {{ metadataUrl: string, fileUrl: (version: string, name: string) => string }} options.feed
   * @param {string} options.cacheDir cartella per lo .zip e l'app estratta
   * @param {string} options.dataDir cartella dati, per il registro e l'esito dello scambio
   * @param {typeof fetch} options.fetch
   * @param {() => void} options.quit chiude l'app
   * @param {(listener: () => void) => void} options.onQuit esegue `listener` alla chiusura
   */
  constructor({
    bundle,
    currentVersion,
    feed,
    cacheDir,
    dataDir,
    fetch,
    quit,
    onQuit,
    run = runCommand,
    launch = spawnDetached,
    pid = process.pid,
    swapScript = path.join(__dirname, "mac-swap.sh"),
  }) {
    super();
    Object.assign(this, { bundle, currentVersion, feed, cacheDir, dataDir, fetch, quit, onQuit, run, launch, pid, swapScript });
    // Come in electron-updater: updater.cjs li imposta secondo il modo di aggiornamento
    this.autoDownload = true;
    this.autoInstallOnAppQuit = true;
    // Versione scaricata e controllata, pronta per lo scambio
    this.ready = null;
    this.installing = false;
    this.quitListener = false;
  }

  async checkForUpdates() {
    this.emit("checking-for-update");
    try {
      const info = parseUpdateInfo(await this.getText(this.feed.metadataUrl));
      if (compareVersions(info.version, this.currentVersion) <= 0) {
        this.emit("update-not-available", info);
        return { updateInfo: info };
      }
      this.emit("update-available", info);
      if (this.autoDownload) {
        if (this.ready?.version !== info.version) this.ready = await this.prepare(info);
        this.emit("update-downloaded", info);
        if (this.autoInstallOnAppQuit) this.installOnQuit();
      }
      return { updateInfo: info };
    } catch (err) {
      this.emit("error", err);
      throw err;
    }
  }

  async getText(url) {
    const response = await this.fetch(url, {
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HttpError: ${response.status} ${url}`);
    return response.text();
  }

  /** Scarica, controlla ed estrae la versione nuova; restituisce dove sta l'app estratta. */
  async prepare(info) {
    await fsp.rm(this.cacheDir, { recursive: true, force: true });
    await fsp.mkdir(this.cacheDir, { recursive: true });
    const zip = path.join(this.cacheDir, info.file.name);
    await this.download(this.feed.fileUrl(info.version, info.file.name), zip, info.file);
    const target = path.join(this.cacheDir, "nuova");
    await this.run("/usr/bin/ditto", ["-x", "-k", zip, target]);
    await fsp.rm(zip, { force: true });
    const apps = (await fsp.readdir(target)).filter((name) => name.endsWith(".app"));
    if (apps.length !== 1) throw new Error("Lo .zip scaricato non contiene l'app");
    const app = path.join(target, apps[0]);
    await this.verify(app, info.version);
    return { version: info.version, app };
  }

  async download(url, destination, { sha512, size }) {
    const response = await this.fetch(url);
    if (!response.ok || !response.body) throw new Error(`HttpError: ${response.status} ${url}`);
    const total = size ?? (Number(response.headers.get("content-length")) || null);
    const hash = crypto.createHash("sha512");
    let received = 0;
    let lastPercent = -1;
    const meter = new Transform({
      transform: (chunk, _encoding, done) => {
        hash.update(chunk);
        received += chunk.length;
        const percent = total ? Math.min(100, (received / total) * 100) : 0;
        if (total && Math.floor(percent) !== lastPercent) {
          lastPercent = Math.floor(percent);
          this.emit("download-progress", { percent, transferred: received, total });
        }
        done(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(destination));
    // Stesso testo di electron-updater, così updater.cjs lo riconosce
    if (hash.digest("base64") !== sha512) throw new Error("sha512 checksum mismatch");
  }

  /** L'app estratta deve essere la versione attesa di questa stessa app, con la firma intatta. */
  async verify(app, version) {
    const read = async (bundle, key) =>
      (await this.run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, path.join(bundle, "Contents", "Info.plist")])).trim();
    const found = await read(app, "CFBundleShortVersionString");
    if (found !== version) throw new Error(`L'app scaricata è la versione ${found} invece della ${version}`);
    if ((await read(app, "CFBundleIdentifier")) !== (await read(this.bundle, "CFBundleIdentifier"))) {
      throw new Error("L'app scaricata non è questa applicazione");
    }
    try {
      await this.run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
    } catch {
      throw new Error("La firma dell'app scaricata non è valida");
    }
  }

  /** Alla chiusura dell'app installa la versione pronta, senza riaprire l'app. */
  installOnQuit() {
    if (this.quitListener) return;
    this.quitListener = true;
    this.onQuit(() => {
      if (this.ready && !this.installing) this.startSwap(false);
    });
  }

  /** Come in electron-updater: chiude l'app e installa la versione pronta, poi la riapre. */
  quitAndInstall(_isSilent = true, isForceRunAfter = true) {
    if (!this.ready || this.installing) return;
    this.startSwap(isForceRunAfter);
    this.quit();
  }

  startSwap(relaunch) {
    this.installing = true;
    // Lo script è dentro l'archivio dell'app, che bash non sa leggere: se ne scrive una copia
    const script = path.join(this.cacheDir, "mac-swap.sh");
    fs.writeFileSync(script, fs.readFileSync(this.swapScript, "utf-8").replace(/\r\n/g, "\n"), { mode: 0o755 });
    this.launch("/bin/bash", [
      script,
      String(this.pid),
      this.bundle,
      this.ready.app,
      backupPath(this.bundle),
      relaunch ? "1" : "0",
      path.join(this.dataDir, LOG_FILE),
      path.join(this.dataDir, RESULT_FILE),
      "/usr/bin/open",
    ]);
  }
}

module.exports = {
  LOG_FILE,
  MacUpdater,
  RESULT_FILE,
  backupPath,
  bundleLocationProblem,
  compareVersions,
  parseUpdateInfo,
  previousUpdateOutcome,
};
