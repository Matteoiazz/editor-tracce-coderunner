// Modalità espansa condivisa dagli editor (traccia e codice): l'editor occupa quasi tutta
// la finestra sopra un fondo scuro, finché non viene chiuso con Esc o con un clic fuori.

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * `ref` va sull'elemento dell'editor; `layer` va reso subito prima di esso.
 * Lo spazio occupato nella pagina viene mantenuto da un segnaposto, così alla chiusura
 * la pagina resta nella stessa posizione.
 */
export function useExpandedLayer(expanded: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  // Altezza nella pagina, aggiornata solo finché l'editor non è espanso
  useEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const observer = new ResizeObserver(() => {
      if (!element.classList.contains("expanded")) setHeight(element.offsetHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      // Esc già usato dall'editor (es. per chiudere la ricerca) non chiude la modalità espansa
      if (e.key === "Escape" && !e.defaultPrevented) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    // La pagina sotto non deve scorrere mentre l'editor è espanso
    document.body.classList.add("editor-expanded");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("editor-expanded");
    };
  }, [expanded]);

  const layer: ReactNode = expanded ? (
    <>
      <div className="editor-placeholder" style={{ height }} />
      <div className="editor-backdrop" onClick={() => closeRef.current()} />
    </>
  ) : null;

  return { ref, layer };
}
