// Aggiornamento automatico con electron-updater, su Windows (installer NSIS) e Linux (AppImage).
// Si controllano le release su GitHub poco dopo l'avvio e poi ogni 6 ore; la versione nuova si
// scarica in silenzio e si installa alla chiusura dell'app, oppure subito con "Riavvia ora".
// Con il pacchetto .deb (che per installarsi chiederebbe i permessi di amministratore) la
// versione nuova viene solo segnalata, con il link per scaricarla.

const FIRST_CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Messaggio comprensibile per un errore di electron-updater, che riporta indirizzi e
 *  risposte HTTP complete. */
function updateErrorMessage(err) {
  const text = String(err?.message ?? err);
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_NETWORK|ERR_PROXY|ERR_TIMED_OUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(text)) {
    return "Nessuna connessione con il server degli aggiornamenti";
  }
  if (/\b404\b/.test(text)) return "La release non contiene i file dell'aggiornamento";
  if (/sha512 checksum mismatch/i.test(text)) {
    return "Il file scaricato non corrisponde a quello della release: verrà scaricato di nuovo";
  }
  return `Aggiornamento non riuscito: ${text.split("\n")[0].slice(0, 160)}`;
}

/** Stato dell'aggiornamento e operazioni, attorno a `updater` (l'autoUpdater di
 *  electron-updater, o un sostituto nei test). `mode`: "auto" scarica e installa, "manual"
 *  segnala soltanto. `onChange` riceve lo stato a ogni cambiamento. */
function createUpdateController({
  updater,
  mode,
  downloadUrl,
  onChange,
  timers = globalThis,
  now = () => new Date(),
}) {
  let automatic = false;
  let firstCheck = null;
  let periodicCheck = null;
  let state = { phase: "idle", version: null, progress: null, checkedAt: null, error: null };

  updater.autoDownload = mode === "auto";
  updater.autoInstallOnAppQuit = mode === "auto";

  const snapshot = () => ({ mode, automatic, downloadUrl, ...state });

  function set(change) {
    state = { ...state, ...change };
    onChange(snapshot());
  }

  const checkedNow = () => ({ checkedAt: now().toISOString() });

  updater.on("checking-for-update", () => set({ phase: "checking", error: null }));
  updater.on("update-not-available", () => set({ phase: "current", ...checkedNow() }));
  updater.on("update-available", (info) =>
    set({
      phase: mode === "auto" ? "downloading" : "available",
      version: info.version,
      progress: mode === "auto" ? 0 : null,
      ...checkedNow(),
    }),
  );
  updater.on("download-progress", (progress) => set({ progress: Math.floor(progress.percent) }));
  updater.on("update-downloaded", (info) => set({ phase: "ready", version: info.version, progress: 100 }));
  updater.on("error", (err) =>
    // Una versione già scaricata resta pronta anche se un controllo successivo non riesce
    set({ phase: state.phase === "ready" ? "ready" : "error", error: updateErrorMessage(err), ...checkedNow() }),
  );

  /** Controlla se c'è una versione nuova (e in modo "auto" la scarica). Durante un controllo o
   *  un download, o con una versione già pronta, non fa nulla. */
  async function check() {
    if (["checking", "downloading", "ready"].includes(state.phase)) return snapshot();
    try {
      await updater.checkForUpdates();
    } catch (err) {
      set({ phase: "error", error: updateErrorMessage(err), ...checkedNow() });
    }
    return snapshot();
  }

  /** Controlli automatici: il primo poco dopo l'attivazione, poi a intervalli regolari. */
  function setAutomatic(on) {
    automatic = on;
    timers.clearTimeout(firstCheck);
    timers.clearInterval(periodicCheck);
    firstCheck = periodicCheck = null;
    if (on) {
      firstCheck = timers.setTimeout(check, FIRST_CHECK_DELAY_MS);
      periodicCheck = timers.setInterval(check, CHECK_INTERVAL_MS);
    }
    onChange(snapshot());
  }

  /** Chiude l'app, installa la versione scaricata e riapre l'app. Falso se non è pronta. */
  function install() {
    if (state.phase !== "ready") return false;
    updater.quitAndInstall(true, true);
    return true;
  }

  return { status: snapshot, check, setAutomatic, install };
}

module.exports = { CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, createUpdateController, updateErrorMessage };
