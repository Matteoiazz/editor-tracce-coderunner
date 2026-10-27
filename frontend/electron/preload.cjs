// Preload: unico ponte tra la pagina (renderer) e Electron.
// Espone solo ciò che serve, non l'intero Node.js.

const { contextBridge, ipcRenderer } = require("electron");

// Le operazioni sulla chiave API rispondono { ok, value } o { ok: false, error }: qui
// diventano il valore oppure un errore con il solo messaggio
const invokeResult = (channel, ...args) =>
  ipcRenderer
    .invoke(channel, ...args)
    .then((result) => (result.ok ? result.value : Promise.reject(new Error(result.error))));

contextBridge.exposeInMainWorld("desktop", {
  getBackendConnection: () => ipcRenderer.invoke("backend:get-connection"),
  openXmlFile: () => ipcRenderer.invoke("dialog:open-xml"),
  openXmlFiles: () => ipcRenderer.invoke("dialog:open-xml-multiple"),
  chooseBackupTarget: (defaultName) => ipcRenderer.invoke("dialog:backup-target", defaultName),
  chooseBackupSource: () => ipcRenderer.invoke("dialog:backup-source"),
  saveXmlFile: (defaultName, content) =>
    ipcRenderer.invoke("dialog:save-xml", { defaultName, content }),
  loadSession: () => ipcRenderer.invoke("session:load"),
  markSessionTransferred: () => ipcRenderer.invoke("session:mark-transferred"),
  backupCorruptSession: () => ipcRenderer.invoke("session:backup-corrupt"),
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (change) => ipcRenderer.invoke("settings:update", change),
    listModels: (refresh) => ipcRenderer.invoke("settings:models", refresh === true),
  },
  apiKey: {
    status: () => invokeResult("apikey:status"),
    save: (key, password) => invokeResult("apikey:save", key, password ?? null),
    remove: () => invokeResult("apikey:remove"),
    reveal: (password) => invokeResult("apikey:reveal", password ?? null),
    unlock: (password) => invokeResult("apikey:unlock", password),
    lock: () => invokeResult("apikey:lock"),
    protect: (password) => invokeResult("apikey:protect", password),
    unprotect: (password) => invokeResult("apikey:unprotect", password),
    changePassword: (current, next) => invokeResult("apikey:change-password", current, next),
    test: (password) => invokeResult("apikey:test", password ?? null),
  },
  ai: {
    check: () => invokeResult("ai:check"),
    review: (question) => invokeResult("ai:review", question),
  },
  updates: {
    status: () => ipcRenderer.invoke("update:status"),
    check: () => ipcRenderer.invoke("update:check"),
    install: () => ipcRenderer.invoke("update:install"),
    // Lo stato arriva a ogni cambiamento: controllo, avanzamento del download, versione pronta
    onChange: (callback) => {
      ipcRenderer.removeAllListeners("update:changed");
      ipcRenderer.on("update:changed", (_event, status) => callback(status));
    },
  },
  // Alla chiusura della finestra la pagina completa il salvataggio, poi conferma
  onBeforeClose: (callback) => {
    ipcRenderer.removeAllListeners("app:before-close");
    ipcRenderer.on("app:before-close", async () => {
      try {
        await callback();
      } finally {
        ipcRenderer.send("app:close-ready");
      }
    });
  },
});
