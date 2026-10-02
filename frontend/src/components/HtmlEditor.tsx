import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { joinList, unsupportedElements } from "../richtext";
import { useExpandedLayer } from "./ExpandedLayer";
import {
  IconBulletList,
  IconCollapse,
  IconExpand,
  IconInlineCode,
  IconNumberedList,
  IconRedo,
  IconTable,
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

  // Testo ricevuto all'apertura: se contiene elementi che l'editor non rappresenta,
  // resta disponibile per essere ripristinato dopo una modifica.
  const [original] = useState(value);
  const lost = unsupportedElements(original);
  const [edited, setEdited] = useState(false);

  // Modalità espansa: le barre restano in alto e scorre solo il testo
  const [expanded, setExpanded] = useState(false);
  const { ref: wrapperRef, layer } = useExpandedLayer(expanded, () => setExpanded(false));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // I link non vengono aperti al click, per non uscire dall'applicazione.
        link: { openOnClick: false },
      }),
      // Le tabelle servono per le matrici di esempio nelle tracce
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      setEdited(true);
      onChangeRef.current(editor.getHTML());
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      code: e?.isActive("code") ?? false,
      bulletList: e?.isActive("bulletList") ?? false,
      orderedList: e?.isActive("orderedList") ?? false,
      inTable: e?.isActive("table") ?? false,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });

  if (!editor || !state) return null;
  const chain = () => editor.chain().focus();

  // Inserisce una tabella 3x3 sotto il blocco corrente. Il comando standard sostituirebbe
  // il testo selezionato, cancellandolo.
  function insertTable() {
    if (!editor) return;
    const { $to } = editor.state.selection;
    const at = $to.depth > 0 ? $to.after(1) : $to.pos;
    const row = `<tr>${"<td><p></p></td>".repeat(3)}</tr>`;
    // +4: dentro tabella, riga, cella e paragrafo, cioè nella prima cella
    chain().insertContentAt(at, `<table><tbody>${row.repeat(3)}</tbody></table>`)
      .setTextSelection(at + 4).run();
  }

  function toggleExpanded() {
    setExpanded(!expanded);
    editor?.commands.focus();
  }

  function restoreOriginal() {
    if (!editor) return;
    editor.commands.setContent(original, { emitUpdate: false });
    onChangeRef.current(original);
    setEdited(false);
  }

  return (
    <>
    {layer}
    <div ref={wrapperRef} className={`html-editor${expanded ? " expanded" : ""}`}>
      {/* Le barre restano visibili mentre si scorre un testo lungo */}
      <div className="html-bars">
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
        <ToolbarButton label={<IconTable />} title="Inserisci tabella" active={state.inTable}
          onClick={insertTable}
          disabled={state.inTable} />
        <span className="separator" />
        <ToolbarButton label={<IconUndo />} title="Annulla (Ctrl+Z)" disabled={!state.canUndo}
          onClick={() => chain().undo().run()} />
        <ToolbarButton label={<IconRedo />} title="Ripeti (Ctrl+Y)" disabled={!state.canRedo}
          onClick={() => chain().redo().run()} />
        <ToolbarButton
          label={expanded ? <><IconCollapse /> Riduci</> : <><IconExpand /> Espandi</>}
          title={expanded ? "Riduci (Esc)" : "Espandi la traccia"}
          active={expanded}
          onClick={toggleExpanded}
          className="expand"
        />
      </div>
      {state.inTable && (
        <div className="html-toolbar table-tools" role="toolbar" aria-label="Tabella">
          <ToolbarButton label="Aggiungi riga" title="Aggiungi una riga sotto"
            onClick={() => chain().addRowAfter().run()} />
          <ToolbarButton label="Togli riga" title="Togli la riga corrente"
            onClick={() => chain().deleteRow().run()} />
          <span className="separator" />
          <ToolbarButton label="Aggiungi colonna" title="Aggiungi una colonna a destra"
            onClick={() => chain().addColumnAfter().run()} />
          <ToolbarButton label="Togli colonna" title="Togli la colonna corrente"
            onClick={() => chain().deleteColumn().run()} />
          <span className="separator" />
          <ToolbarButton label="Intestazione" title="Rendi intestazione la cella corrente (es. indici di riga e colonna)"
            onClick={() => chain().toggleHeaderCell().run()} />
          <ToolbarButton label="Elimina tabella" title="Elimina l'intera tabella" className="danger"
            onClick={() => chain().deleteTable().run()} />
        </div>
      )}
      </div>
      {lost.length > 0 &&
        (edited ? (
          <div className="editor-notice">
            <span>
              Con la modifica si è perso il contenuto che l'editor non può mostrare:{" "}
              {joinList(lost)}.
            </span>
            <button type="button" className="secondary small" onClick={restoreOriginal}>
              Ripristina il testo originale
            </button>
          </div>
        ) : (
          <div className="editor-notice">
            <span>
              Il testo contiene {joinList(lost)}, che l'editor non può mostrare. Finché non
              modifichi il testo, nel file esportato resta l'originale completo; una modifica lo
              sostituirebbe con la versione mostrata qui.
            </span>
          </div>
        ))}
      <EditorContent editor={editor} className="html-content" />
    </div>
    </>
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
