// Impostazioni dell'applicazione, nel file impostazioni.json della cartella dati.
// Le legge e le scrive solo il processo principale: la pagina riceve i valori che mostra e
// può cambiare solo quelli previsti.

const fs = require("node:fs/promises");
const path = require("node:path");
const { writeFileAtomic } = require("./atomic-write.cjs");

const SETTINGS_FILE = "impostazioni.json";
// Copia di un file illeggibile, conservata prima di ripartire dai valori predefiniti
const DAMAGED_COPY = "impostazioni-danneggiate.json";
// Formato del file: serve a convertire i file scritti da versioni precedenti dell'app
const SETTINGS_VERSION = 1;
// Modello delle funzioni AI: Nemotron 3 Ultra nella variante gratuita (identificativo
// dall'elenco di OpenRouter)
const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

function defaultSettings() {
  return { version: SETTINGS_VERSION, ai: { model: DEFAULT_MODEL } };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Identificativo di un modello di OpenRouter: "fornitore/nome", senza spazi.
 *  La stessa regola è in src/settings.ts, per segnalare l'errore già nel campo. */
function isModelId(value) {
  return typeof value === "string" && value.length <= 200 && /^[^\s/]+\/\S+$/.test(value);
}

/** Valori del file, con i predefiniti al posto di quelli mancanti o non validi. Le voci
 *  sconosciute restano: possono essere di una versione più recente dell'app. */
function normalize(data) {
  const ai = isPlainObject(data.ai) ? data.ai : {};
  const version = Number.isInteger(data.version) ? data.version : 0;
  return {
    ...data,
    version: Math.max(version, SETTINGS_VERSION),
    ai: { ...ai, model: isModelId(ai.model) ? ai.model : DEFAULT_MODEL },
  };
}

function serialize(settings) {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** Legge le impostazioni. File assente: valori predefiniti. File illeggibile: se ne conserva
 *  una copia, si riparte dai predefiniti e `damagedCopy` indica dove sta la copia. */
async function readSettings(dir) {
  const file = path.join(dir, SETTINGS_FILE);
  let text;
  try {
    text = await fs.readFile(file, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") return { settings: defaultSettings(), damagedCopy: null };
    throw err;
  }
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // contenuto non JSON: trattato come il file illeggibile qui sotto
  }
  if (isPlainObject(data)) return { settings: normalize(data), damagedCopy: null };
  const damagedCopy = path.join(dir, DAMAGED_COPY);
  await fs.copyFile(file, damagedCopy);
  // Il file viene subito riscritto: la copia si fa una volta sola
  const settings = defaultSettings();
  await writeFileAtomic(file, serialize(settings));
  return { settings, damagedCopy };
}

/** Ciò che la pagina riceve: i valori da mostrare, il modello predefinito e l'eventuale
 *  copia di un file illeggibile. */
function pageView({ settings, damagedCopy }) {
  return { ai: { model: settings.ai.model }, defaultModel: DEFAULT_MODEL, damagedCopy };
}

/** Impostazioni di una cartella dati: lette alla prima richiesta, poi tenute in memoria.
 *  Le modifiche si applicano una alla volta, nell'ordine in cui arrivano. */
function createSettingsStore(dir) {
  const file = path.join(dir, SETTINGS_FILE);
  let state = null;
  let queue = Promise.resolve();

  function enqueue(task) {
    const job = queue.then(task);
    // Un errore riguarda solo la richiesta che lo ha causato, non quelle successive
    queue = job.catch(() => {});
    return job;
  }

  async function load() {
    state ??= await readSettings(dir);
    return state;
  }

  return {
    /** Valori per la pagina. */
    get: () => enqueue(async () => pageView(await load())),

    /** Applica le modifiche consentite alla pagina (per ora il modello) e le salva. */
    update: (change) =>
      enqueue(async () => {
        const model = isPlainObject(change) && isPlainObject(change.ai) ? change.ai.model : undefined;
        if (model !== undefined && !isModelId(model)) {
          throw new Error("Identificativo del modello non valido");
        }
        const current = await load();
        const settings = normalize({
          ...current.settings,
          ai: { ...current.settings.ai, ...(model !== undefined && { model }) },
        });
        await writeFileAtomic(file, serialize(settings));
        state = { ...current, settings };
        return pageView(state);
      }),
  };
}

module.exports = {
  DEFAULT_MODEL,
  DAMAGED_COPY,
  SETTINGS_FILE,
  createSettingsStore,
  isModelId,
  readSettings,
};
