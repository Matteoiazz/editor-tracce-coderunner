import Editor from "@monaco-editor/react";
import { useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

// L'altezza segue il contenuto entro questi limiti: così lo scorrimento interno
// serve solo per codici molto lunghi.
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 560;

export function editorHeight(contentHeight: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(contentHeight)));
}

/** Editor di codice Python (Monaco, lo stesso di VS Code). */
export function CodeEditor({ value, onChange }: Props) {
  const [height, setHeight] = useState(MIN_HEIGHT);

  return (
    <div className="code-editor">
      <Editor
        height={height}
        language="python"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={(editor) => {
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
  );
}
