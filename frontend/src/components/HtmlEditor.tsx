import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type ReactNode, useEffect, useRef } from "react";
import {
  IconBulletList,
  IconInlineCode,
  IconNumberedList,
  IconRedo,
  IconUndo,
} from "./icons";

interface Props {
  value: string;
  onChange: (html: string) => void;
}

/** Editor visuale del testo della traccia; produce HTML.
 *  `value` è usato come contenuto iniziale: finché il testo non viene modificato,
 *  l'HTML originale resta invariato. */
export function HtmlEditor({ value, onChange }: Props) {
  // L'editor viene creato una sola volta: il riferimento garantisce che usi
  // sempre la versione più recente di onChange.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // I link non vengono aperti al click, per non uscire dall'applicazione.
        link: { openOnClick: false },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      code: e?.isActive("code") ?? false,
      bulletList: e?.isActive("bulletList") ?? false,
      orderedList: e?.isActive("orderedList") ?? false,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });

  if (!editor || !state) return null;
  const chain = () => editor.chain().focus();

  return (
    <div className="html-editor">
      <div className="html-toolbar">
        <ToolbarButton label="G" title="Grassetto (Ctrl+B)" active={state.bold}
          onClick={() => chain().toggleBold().run()} className="bold" />
        <ToolbarButton label="C" title="Corsivo (Ctrl+I)" active={state.italic}
          onClick={() => chain().toggleItalic().run()} className="italic" />
        <ToolbarButton label={<IconInlineCode />} title="Testo in stile codice (Ctrl+E)" active={state.code}
          onClick={() => chain().toggleCode().run()} />
        <span className="separator" />
        <ToolbarButton label={<IconBulletList />} title="Elenco puntato" active={state.bulletList}
          onClick={() => chain().toggleBulletList().run()} />
        <ToolbarButton label={<IconNumberedList />} title="Elenco numerato" active={state.orderedList}
          onClick={() => chain().toggleOrderedList().run()} />
        <span className="separator" />
        <ToolbarButton label={<IconUndo />} title="Annulla (Ctrl+Z)" disabled={!state.canUndo}
          onClick={() => chain().undo().run()} />
        <ToolbarButton label={<IconRedo />} title="Ripeti (Ctrl+Y)" disabled={!state.canRedo}
          onClick={() => chain().redo().run()} />
      </div>
      <EditorContent editor={editor} className="html-content" />
    </div>
  );
}

interface ToolbarButtonProps {
  label: ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

function ToolbarButton({ label, title, onClick, active, disabled, className }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[className, active ? "active" : ""].filter(Boolean).join(" ")}
    >
      {label}
    </button>
  );
}
