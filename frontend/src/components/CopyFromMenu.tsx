import { useEffect, useRef, useState } from "react";
import type { CopySource } from "../exam";
import { IconCopy } from "./icons";

interface Props {
  /** Gli altri esercizi della traccia. */
  sources: CopySource[];
  onCopy: (source: CopySource) => void;
}

/** Pulsante «Copia da…»: elenco degli altri esercizi della traccia, da cui copiare tutto il
 *  contenuto nell'esercizio aperto. */
export function CopyFromMenu({ sources, onCopy }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // L'elenco si chiude con un clic fuori o con Esc
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="copy-menu" ref={wrapperRef}>
      <button
        type="button"
        className="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Copia qui testo, soluzione, codice per gli studenti e test di un altro esercizio"
        onClick={() => setOpen(!open)}
      >
        <IconCopy /> Copia da…
      </button>
      {open && (
        <ul className="copy-menu-list" role="menu" aria-label="Esercizi da cui copiare">
          {sources.map((source) => (
            <li key={source.id}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onCopy(source);
                }}
              >
                <span className="copy-menu-label">{source.label}</span>
                <span className="copy-menu-preview">{source.preview}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
