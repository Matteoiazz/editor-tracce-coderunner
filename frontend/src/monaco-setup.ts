// Configura Monaco per usare la copia installata in node_modules invece del CDN,
// così l'editor funziona anche senza connessione.
// Si importano solo il nucleo dell'editor e l'evidenziazione di Python, per tenere
// l'applicazione leggera (il pacchetto completo include linguaggi non necessari).

import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/python/register";
// Funzioni dell'editor che il nucleo non include: ricerca e sostituzione (Ctrl+F, Ctrl+H),
// commento delle righe (Ctrl+/), evidenziazione delle parentesi, menu del tasto destro,
// operazioni sulle righe e cursori multipli, come in VS Code.
// Carattere delle icone dell'editor (es. nella casella di ricerca)
import "monaco-editor/features/codicon/register";
import "monaco-editor/editor/contrib/find/browser/findController";
import "monaco-editor/editor/contrib/comment/browser/comment";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu";
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor";
import "monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter";
import "monaco-editor/editor/contrib/folding/browser/folding";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });
