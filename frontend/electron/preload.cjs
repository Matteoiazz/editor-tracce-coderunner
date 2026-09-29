// Preload: unico ponte tra la pagina (renderer) e Electron.
// Espone solo ciò che serve, non l'intero Node.js.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getBackendUrl: () => ipcRenderer.invoke("backend:get-url"),
  openXmlFile: () => ipcRenderer.invoke("dialog:open-xml"),
  saveXmlFile: (defaultName, content) =>
    ipcRenderer.invoke("dialog:save-xml", { defaultName, content }),
  loadSession: () => ipcRenderer.invoke("session:load"),
  saveSession: (content) => ipcRenderer.invoke("session:save", content),
  saveSessionNow: (content) => ipcRenderer.sendSync("session:save-sync", content),
  backupCorruptSession: () => ipcRenderer.invoke("session:backup-corrupt"),
});
