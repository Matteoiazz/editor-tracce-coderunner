// Tipi di ciò che il preload espone in window.desktop.
interface OpenedFile {
  path: string;
  content: string;
}

/** Indirizzo del backend e codice segreto da presentare a ogni richiesta. */
interface BackendConnection {
  url: string;
  token: string;
}

/** Impostazioni come le riceve la pagina dal processo principale. */
interface SettingsView {
  ai: { model: string };
  updates: { auto: boolean };
  defaultModel: string;
  /** Copia del file delle impostazioni, se era illeggibile e si è ripartiti dai predefiniti. */
  damagedCopy: string | null;
}

/** Modifiche che la pagina può chiedere. */
interface SettingsChange {
  ai?: { model?: string };
  updates?: { auto?: boolean };
}

/** Stato dell'aggiornamento dell'app. "none": non si aggiorna da qui (es. in sviluppo), con il
 *  motivo; "auto": scarica e installa; "manual" (pacchetto .deb): segnala la versione nuova. */
type UpdateStatus =
  | { mode: "none"; reason: string; downloadUrl: string }
  | {
      mode: "auto" | "manual";
      /** Perché la versione nuova viene solo segnalata (modo "manual"). */
      note: string | null;
      /** Controlli automatici attivi. */
      automatic: boolean;
      /** Pagina della release più recente, per scaricarla a mano. */
      downloadUrl: string;
      phase: "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error";
      /** Versione nuova trovata, scaricata o in download. */
      version: string | null;
      /** Avanzamento del download, in percentuale. */
      progress: number | null;
      /** Ultimo controllo (ISO). */
      checkedAt: string | null;
      error: string | null;
    };

/** Un modello di OpenRouter. Prezzi in dollari per milione di token, null se variabili. */
interface ModelInfo {
  id: string;
  name: string;
  free: boolean;
  context: number | null;
  promptPrice: number | null;
  completionPrice: number | null;
}

interface ModelList {
  models: ModelInfo[];
  /** Quando l'elenco è stato scaricato (ISO), null se non è mai stato scaricato. */
  fetchedAt: string | null;
  /** Perché non si è potuto aggiornare l'elenco; i modelli sono quelli della copia salvata. */
  error: string | null;
}

/** Stato della chiave API, senza la chiave: al massimo la sua forma mascherata. */
interface ApiKeyStatus {
  saved: boolean;
  /** Es. "sk-or-v1-••••3f9a"; null se non c'è chiave o il file è illeggibile. */
  mask: string | null;
  /** Cifrata con la master password (altrimenti è nel portachiavi del sistema). */
  protected: boolean;
  /** Protetta e già sbloccata con la master password in questa sessione. */
  unlocked: boolean;
  /** Su Linux senza portachiavi: senza master password la chiave è protetta poco. */
  weakKeychain: boolean;
  /** Perché il file della chiave non si può leggere; resta solo da rimuoverla. */
  problem: string | null;
}

/** Esito di "Prova la chiave". Importi in dollari; null se OpenRouter non li indica. */
type KeyCheck =
  | {
      outcome: "valid";
      usage: number | null;
      limit: number | null;
      limitRemaining: number | null;
      freeRequestsRemaining: number | null;
      freeRequestsLimit: number | null;
      expiresAt: string | null;
    }
  | { outcome: "invalid" | "error"; message: string };

interface Window {
  desktop: {
    getBackendConnection(): Promise<BackendConnection>;
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
    /** Versione dell'applicazione installata. */
    getAppVersion(): Promise<string>;
    settings: {
      get(): Promise<SettingsView>;
      /** Salva le modifiche e restituisce le impostazioni aggiornate. */
      update(change: SettingsChange): Promise<SettingsView>;
      /** Elenco dei modelli: dalla copia salvata se è recente, a meno di chiederne uno aggiornato. */
      listModels(refresh?: boolean): Promise<ModelList>;
    };
    /** Chiave API di OpenRouter. Gli errori (es. master password errata) hanno solo il messaggio. */
    apiKey: {
      status(): Promise<ApiKeyStatus>;
      /** Salva una chiave nuova; con `password` la protegge con la master password. */
      save(key: string, password?: string | null): Promise<ApiKeyStatus>;
      remove(): Promise<ApiKeyStatus>;
      /** La chiave in chiaro; se è protetta serve sempre la master password. */
      reveal(password?: string | null): Promise<string>;
      unlock(password: string): Promise<ApiKeyStatus>;
      lock(): Promise<ApiKeyStatus>;
      protect(password: string): Promise<ApiKeyStatus>;
      unprotect(password: string): Promise<ApiKeyStatus>;
      changePassword(current: string, next: string): Promise<ApiKeyStatus>;
      /** Controlla la chiave con OpenRouter; se è protetta e bloccata serve la master password. */
      test(password?: string | null): Promise<KeyCheck>;
    };
    updates: {
      status(): Promise<UpdateStatus>;
      check(): Promise<UpdateStatus>;
      /** Completa il salvataggio, chiude l'app, installa la versione pronta e riapre l'app. */
      install(): Promise<boolean>;
      onChange(callback: (status: UpdateStatus) => void): void;
    };
    /** Funzione eseguita alla chiusura della finestra, prima che si chiuda davvero. */
    onBeforeClose(callback: () => Promise<void>): void;
  };
}
