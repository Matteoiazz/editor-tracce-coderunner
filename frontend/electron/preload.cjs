// Preload: unico ponte tra la pagina (renderer) e Electron.
// Espone solo ciò che serve, non l'intero Node.js.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getBackendUrl: () => ipcRenderer.invoke("backend:get-url"),
  openXmlFile: () => ipcRenderer.invoke("dialog:open-xml"),
  saveXmlFile: (defaultName, content) =>
    ipcRenderer.invoke("dialog:save-xml", { defaultName, content }),
  loadSession: () => ipcRenderer.invoke("session:load"),
  markSessionTransferred: () => ipcRenderer.invoke("session:mark-transferred"),
  backupCorruptSession: () => ipcRenderer.invoke("session:backup-corrupt"),
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
