import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { useExpandedLayer } from "./ExpandedLayer";
import { IconCollapse } from "./icons";

type MonacoEditor = Parameters<OnMount>[0];

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Modalità espansa, comandata dal pulsante nell'intestazione della sezione. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Titolo mostrato nella barra della modalità espansa (es. "Soluzione · Esame-…-Esercizio1"). */
  title?: string;
  /** Righe da evidenziare, per esempio quelle di una segnalazione da correggere. */
  highlightLines?: number[];
}

// L'altezza segue il contenuto entro questi limiti: così lo scorrimento interno
// serve solo per codici molto lunghi.
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 560;

export function editorHeight(contentHeight: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(contentHeight)));
}

/** Editor di codice Python (Monaco, lo stesso di VS Code). */
export function CodeEditor({ value, onChange, expanded = false, onExpandedChange, title, highlightLines }: Props) {
  const [height, setHeight] = useState(MIN_HEIGHT);
  const editorRef = useRef<MonacoEditor | null>(null);
  const [mounted, setMounted] = useState(false);
  const decorations = useRef<ReturnType<MonacoEditor["createDecorationsCollection"]> | null>(null);
  const lines = (highlightLines ?? []).join(",");

  // Le righe evidenziate restano attaccate al codice anche se si scrive sopra
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    decorations.current ??= editor.createDecorationsCollection();
    const numbers = lines ? lines.split(",").map(Number) : [];
    decorations.current.set(
      numbers.map((line) => ({
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        options: { isWholeLine: true, className: "code-line-flagged", linesDecorationsClassName: "code-line-flagged-mark" },
      })),
    );
    if (numbers.length > 0) editor.revealLineInCenterIfOutsideViewport(numbers[numbers.length - 1]);
  }, [lines, mounted]);
  const close = () => onExpandedChange?.(false);
  const { ref, layer } = useExpandedLayer(expanded, close);

  // All'apertura e alla chiusura il cursore resta nell'editor
  useEffect(() => {
    editorRef.current?.focus();
  }, [expanded]);

  return (
    <>
      {layer}
      <div ref={ref} className={`code-editor${expanded ? " expanded" : ""}`}>
        {expanded && (
          <div className="expanded-bar">
            <span className="expanded-title">{title}</span>
            <button type="button" className="ghost small" onClick={close} title="Riduci (Esc)">
              <IconCollapse /> Riduci
            </button>
          </div>
        )}
        <div className="code-area">
          <Editor
            height={expanded ? "100%" : height}
            language="python"
            value={value}
            onChange={(v) => onChange(v ?? "")}
            onMount={(editor) => {
              editorRef.current = editor;
              setMounted(true);
              const update = () => setHeight(editorHeight(editor.getContentHeight()));
              editor.onDidContentSizeChange(update);
              update();
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              tabSize: 4,
              insertSpaces: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              // Senza questa opzione Monaco trattiene la rotella del mouse anche quando
              // non ha nulla da scorrere, e la pagina smette di scorrere sopra l'editor.
              scrollbar: { alwaysConsumeMouseWheel: false },
            }}
          />
        </div>
      </div>
    </>
  );
}
