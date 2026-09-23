// Preload: unico ponte tra la pagina (renderer) e Electron.
// Espone solo ciò che serve, non l'intero Node.js.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getBackendUrl: () => ipcRenderer.invoke("backend:get-url"),
  openXmlFile: () => ipcRenderer.invoke("dialog:open-xml"),
});
