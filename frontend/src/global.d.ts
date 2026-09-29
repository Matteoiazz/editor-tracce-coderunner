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
    /** Contenuto del salvataggio automatico, o null al primo avvio. */
    loadSession(): Promise<string | null>;
    saveSession(content: string): Promise<void>;
    /** Salvataggio sincrono, per la chiusura della finestra; false se non riuscito. */
    saveSessionNow(content: string): boolean;
    /** Copia da parte un salvataggio illeggibile; restituisce il percorso della copia. */
    backupCorruptSession(): Promise<string>;
  };
}
