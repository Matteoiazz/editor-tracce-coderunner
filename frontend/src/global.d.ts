// Tipi di ciò che il preload espone in window.desktop.
interface OpenedFile {
  path: string;
  content: string;
}

interface Window {
  desktop: {
    getBackendUrl(): Promise<string>;
    /** Apre la finestra "Apri file"; null se l'utente annulla. */
    openXmlFile(): Promise<OpenedFile | null>;
    /** Apre la finestra "Salva con nome" e scrive il file; restituisce il percorso, o null se l'utente annulla. */
    saveXmlFile(defaultName: string, content: string): Promise<string | null>;
  };
}
