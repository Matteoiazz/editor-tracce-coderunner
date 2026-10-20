import { useEffect, useRef, useState } from "react";
import type { TextSource } from "../exam";
import { IconCopy } from "./icons";

interface Props {
  /** Altri esercizi della traccia con un testo da copiare. */
  sources: TextSource[];
  onCopy: (source: TextSource) => void;
}

/** Pulsante «Copia da…»: elenco degli altri esercizi della traccia, di cui copiare il testo. */
export function CopyTextMenu({ sources, onCopy }: Props) {
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
        className="ghost small"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Copia qui il testo della traccia di un altro esercizio"
        onClick={() => setOpen(!open)}
      >
        <IconCopy /> Copia da…
      </button>
      {open && (
        <ul className="copy-menu-list" role="menu" aria-label="Esercizi da cui copiare il testo">
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
