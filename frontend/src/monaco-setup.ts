// Configura Monaco per usare la copia installata in node_modules invece del CDN,
// così l'editor funziona anche senza connessione.
// Si importano solo il nucleo dell'editor e l'evidenziazione di Python, per tenere
// l'applicazione leggera (il pacchetto completo include linguaggi non necessari).

import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/python/register";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });
