// Chiave API di OpenRouter, nel file chiave-api.json della cartella dati (leggibile solo
// dall'utente su macOS e Linux). Si conserva in uno di due modi:
// - con il portachiavi del sistema (safeStorage di Electron), senza password;
// - cifrata con una master password (secret.cjs), che non viene salvata: la chiave si sblocca
//   una volta per sessione e resta in memoria solo nel processo principale.
// Il file contiene anche la forma mascherata della chiave, da mostrare senza decifrarla.
// La chiave non va mai nei log e arriva alla pagina solo quando si chiede di vederla.

const fs = require("node:fs/promises");
const path = require("node:path");
const { writeFileAtomic } = require("./atomic-write.cjs");
const { checkKey } = require("./openrouter.cjs");
const {
  SCRYPT_PARAMS,
  UnreadableSecretError,
  decryptWithPassword,
  encryptWithPassword,
} = require("./secret.cjs");

const KEY_FILE = "chiave-api.json";
const FILE_VERSION = 1;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 1024;
const UNREADABLE_FILE = "Il file della chiave è illeggibile: rimuovi la chiave e inseriscila di nuovo";
const NO_KEY_FOR_AI = "Per le funzioni AI serve una chiave di OpenRouter: inseriscila nelle Impostazioni";
const LOCKED_FOR_AI = "La chiave è protetta da master password: sbloccala nelle Impostazioni";

/** Forma visibile della chiave: inizio e ultimi quattro caratteri, es. "sk-or-v1-••••3f9a". */
function maskKey(key) {
  const prefix = key.startsWith("sk-or-v1-") ? "sk-or-v1-" : key.slice(0, 3);
  return `${prefix}••••${key.slice(-4)}`;
}

/** La chiave senza spazi agli estremi; errore se non può essere una chiave. */
function normalizeKey(key) {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (trimmed.length < 20 || trimmed.length > 500 || /\s/.test(trimmed)) {
    throw new Error("Non sembra una chiave di OpenRouter: copiala per intero, senza spazi");
  }
  return trimmed;
}

/** Regole della master password, controllate anche nella pagina. */
function checkNewPassword(password) {
  const length = typeof password === "string" ? [...password].length : 0;
  if (length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La master password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri`);
  }
  if (length > MAX_PASSWORD_LENGTH) throw new Error("La master password è troppo lunga");
}

function isValidRecord(record) {
  if (record?.version !== FILE_VERSION || typeof record.mask !== "string") return false;
  if (record.protection === "system") return typeof record.data === "string";
  return record.protection === "password" && typeof record.secret === "object" && record.secret !== null;
}

/** Chiave API di una cartella dati. `keychain`: { weak, encrypt(testo) → Buffer,
 *  decrypt(Buffer) → testo }, il portachiavi del sistema. Le operazioni sul file si
 *  eseguono una alla volta, nell'ordine in cui arrivano. */
function createApiKeyStore(dir, { keychain, fetch, scryptParams = SCRYPT_PARAMS, timeoutMs }) {
  const file = path.join(dir, KEY_FILE);
  // Chiave protetta sbloccata con la master password in questa sessione
  let unlockedKey = null;
  let queue = Promise.resolve();

  function enqueue(task) {
    const job = queue.then(task);
    // Un errore riguarda solo l'operazione che lo ha causato, non quelle successive
    queue = job.catch(() => {});
    return job;
  }

  async function readRecord() {
    let text;
    try {
      text = await fs.readFile(file, "utf-8");
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
    let record = null;
    try {
      record = JSON.parse(text);
    } catch {
      // contenuto non JSON: illeggibile come un record non valido
    }
    if (!isValidRecord(record)) throw new Error(UNREADABLE_FILE);
    return record;
  }

  async function savedRecord() {
    const record = await readRecord();
    if (!record) throw new Error("Nessuna chiave salvata");
    return record;
  }

  async function savedProtectedRecord() {
    const record = await savedRecord();
    if (record.protection !== "password") throw new Error("La chiave non è protetta da master password");
    return record;
  }

  function write(record) {
    return writeFileAtomic(file, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  }

  function systemRecord(key) {
    const data = keychain.encrypt(key).toString("base64");
    return { version: FILE_VERSION, mask: maskKey(key), protection: "system", data };
  }

  async function passwordRecord(key, password) {
    const secret = await encryptWithPassword(key, password, scryptParams);
    return { version: FILE_VERSION, mask: maskKey(key), protection: "password", secret };
  }

  /** La chiave in chiaro: dal portachiavi; se è protetta, dalla memoria (se sbloccata e
   *  `askPassword` è falso) oppure decifrandola con la master password, che la sblocca. */
  async function readKey(record, password, { askPassword = false } = {}) {
    if (record.protection === "system") {
      try {
        return keychain.decrypt(Buffer.from(record.data, "base64"));
      } catch {
        throw new Error(
          "Il portachiavi del sistema non ha restituito la chiave (accesso negato o portachiavi " +
            "cambiato): riprova, oppure rimuovi la chiave e inseriscila di nuovo",
        );
      }
    }
    if (unlockedKey !== null && !askPassword) return unlockedKey;
    if (typeof password !== "string" || password === "") throw new Error("Serve la master password");
    try {
      unlockedKey = await decryptWithPassword(record.secret, password);
    } catch (err) {
      throw err instanceof UnreadableSecretError ? new Error(UNREADABLE_FILE) : err;
    }
    return unlockedKey;
  }

  async function status() {
    let record = null;
    let problem = null;
    try {
      record = await readRecord();
    } catch (err) {
      problem = err.message;
    }
    const isProtected = record?.protection === "password";
    return {
      saved: record !== null || problem !== null,
      mask: record?.mask ?? null,
      protected: isProtected,
      unlocked: isProtected && unlockedKey !== null,
      weakKeychain: keychain.weak,
      problem,
    };
  }

  /** Esegue un'operazione sul file e restituisce lo stato aggiornato. */
  const change = (operation) =>
    enqueue(async () => {
      await operation();
      return status();
    });

  return {
    status: () => enqueue(status),

    /** Salva una chiave nuova (al posto di quella che c'era): con `password` la protegge con
     *  la master password e resta sbloccata, altrimenti la affida al portachiavi. */
    save: (key, password = null) =>
      change(async () => {
        const normalized = normalizeKey(key);
        if (password === null) {
          await write(systemRecord(normalized));
          unlockedKey = null;
        } else {
          checkNewPassword(password);
          await write(await passwordRecord(normalized, password));
          unlockedKey = normalized;
        }
      }),

    remove: () =>
      change(async () => {
        await fs.rm(file, { force: true });
        unlockedKey = null;
      }),

    /** La chiave in chiaro, da mostrare: se è protetta serve sempre la master password. */
    reveal: (password = null) =>
      enqueue(async () => readKey(await savedRecord(), password, { askPassword: true })),

    unlock: (password) =>
      change(async () => {
        await readKey(await savedProtectedRecord(), password, { askPassword: true });
      }),

    lock: () =>
      change(async () => {
        unlockedKey = null;
      }),

    /** Dal portachiavi alla master password. */
    protect: (password) =>
      change(async () => {
        const record = await savedRecord();
        if (record.protection !== "system") throw new Error("La chiave è già protetta da master password");
        checkNewPassword(password);
        const key = await readKey(record, null);
        await write(await passwordRecord(key, password));
        unlockedKey = key;
      }),

    /** Dalla master password al portachiavi. */
    unprotect: (password) =>
      change(async () => {
        const key = await readKey(await savedProtectedRecord(), password, { askPassword: true });
        await write(systemRecord(key));
        unlockedKey = null;
      }),

    changePassword: (current, next) =>
      change(async () => {
        const record = await savedProtectedRecord();
        checkNewPassword(next);
        const key = await readKey(record, current, { askPassword: true });
        await write(await passwordRecord(key, next));
        unlockedKey = key;
      }),

    /** La chiave in chiaro per una richiesta AI, senza chiedere la master password: se manca
     *  o è bloccata, un errore che dice cosa fare. */
    use: () =>
      enqueue(async () => {
        const record = await readRecord();
        if (!record) throw new Error(NO_KEY_FOR_AI);
        if (record.protection === "password" && unlockedKey === null) throw new Error(LOCKED_FOR_AI);
        return readKey(record, null);
      }),

    /** Controlla la chiave con OpenRouter. La richiesta si fa fuori dalla coda: mentre si
     *  aspetta la risposta le altre operazioni non restano bloccate. */
    test: async (password = null) => {
      const key = await enqueue(async () => readKey(await savedRecord(), password));
      return checkKey(key, { fetch, timeoutMs });
    },
  };
}

module.exports = { KEY_FILE, MIN_PASSWORD_LENGTH, createApiKeyStore, maskKey };
