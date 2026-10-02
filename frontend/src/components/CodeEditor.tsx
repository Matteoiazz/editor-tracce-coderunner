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
  /** Titolo mostrato nella barra della modalità espansa (es. "Soluzione · Esercizio1-…"). */
  title?: string;
}

// L'altezza segue il contenuto entro questi limiti: così lo scorrimento interno
// serve solo per codici molto lunghi.
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 560;

export function editorHeight(contentHeight: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(contentHeight)));
}

/** Editor di codice Python (Monaco, lo stesso di VS Code). */
export function CodeEditor({ value, onChange, expanded = false, onExpandedChange, title }: Props) {
  const [height, setHeight] = useState(MIN_HEIGHT);
  const editorRef = useRef<MonacoEditor | null>(null);
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
