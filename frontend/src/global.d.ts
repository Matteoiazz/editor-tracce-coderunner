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
    /** Scelta di più file XML; lista vuota se l'utente annulla. */
    openXmlFiles(): Promise<OpenedFile[]>;
    /** Percorso in cui salvare un backup dell'archivio, o null se l'utente annulla. */
    chooseBackupTarget(defaultName: string): Promise<string | null>;
    /** Backup da cui ripristinare l'archivio, o null se l'utente annulla. */
    chooseBackupSource(): Promise<string | null>;
    /** Apre la finestra "Salva con nome" e scrive il file; restituisce il percorso, o null se l'utente annulla. */
    saveXmlFile(defaultName: string, content: string): Promise<string | null>;
    /** Contenuto del vecchio file di sessione (prima dell'archivio), o null se non c'è. */
    loadSession(): Promise<string | null>;
    /** Rinomina il vecchio file di sessione dopo il trasferimento nell'archivio. */
    markSessionTransferred(): Promise<void>;
    /** Copia da parte un salvataggio illeggibile; restituisce il percorso della copia. */
    backupCorruptSession(): Promise<string>;
    /** Funzione eseguita alla chiusura della finestra, prima che si chiuda davvero. */
    onBeforeClose(callback: () => Promise<void>): void;
  };
}
