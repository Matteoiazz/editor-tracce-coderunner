import Editor from "@monaco-editor/react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: number;
}

/** Editor di codice Python (Monaco, lo stesso di VS Code). */
export function CodeEditor({ value, onChange, height = 280 }: Props) {
  return (
    <div className="code-editor">
      <Editor
        height={height}
        language="python"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          tabSize: 4,
          insertSpaces: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
