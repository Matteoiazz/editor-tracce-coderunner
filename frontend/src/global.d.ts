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
  };
}
