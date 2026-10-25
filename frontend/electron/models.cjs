// Elenco dei modelli di OpenRouter, tra cui si sceglie quello delle funzioni AI.
// L'elenco è pubblico (non serve la chiave). Se ne tiene una copia nella cartella dati: si usa
// finché ha meno di un giorno, oppure quando OpenRouter non è raggiungibile.

const fs = require("node:fs/promises");
const path = require("node:path");
const { writeFileAtomic } = require("./atomic-write.cjs");
const { API_URL, getJson } = require("./openrouter.cjs");

const MODELS_URL = `${API_URL}/models`;
const CACHE_FILE = "modelli-openrouter.json";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Prezzo per milione di token, da quello per token di OpenRouter (un testo, es. "0.0000006").
 *  null se manca o è negativo: OpenRouter usa -1 per i modelli a prezzo variabile. */
function pricePerMillion(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const perToken = Number(value);
  return String(value).trim() !== "" && Number.isFinite(perToken) && perToken >= 0
    ? perToken * 1e6
    : null;
}

/** Dalla risposta di OpenRouter i dati mostrati nella scelta del modello, in ordine di nome.
 *  Restano solo i modelli che rispondono con del testo (non quelli che creano immagini). */
function parseModels(body) {
  if (typeof body !== "object" || body === null || !Array.isArray(body.data)) {
    throw new Error("Risposta di OpenRouter non riconosciuta");
  }
  return body.data
    .filter((m) => typeof m?.id === "string" && m.id !== "")
    .filter((m) => {
      const output = m.architecture?.output_modalities;
      return !Array.isArray(output) || output.includes("text");
    })
    .map((m) => {
      const promptPrice = pricePerMillion(m.pricing?.prompt);
      const completionPrice = pricePerMillion(m.pricing?.completion);
      return {
        id: m.id,
        name: typeof m.name === "string" && m.name.trim() ? m.name.trim() : m.id,
        free: m.id.endsWith(":free") || (promptPrice === 0 && completionPrice === 0),
        context: Number.isInteger(m.context_length) && m.context_length > 0 ? m.context_length : null,
        promptPrice,
        completionPrice,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "it") || a.id.localeCompare(b.id));
}

async function download(fetchImpl, timeoutMs) {
  const { status, ok, body } = await getJson("/models", { fetch: fetchImpl, timeoutMs });
  if (!ok) throw new Error(`OpenRouter ha risposto con un errore (HTTP ${status})`);
  return parseModels(body);
}

async function readCache(file) {
  try {
    const cache = JSON.parse(await fs.readFile(file, "utf-8"));
    if (Array.isArray(cache.models) && !Number.isNaN(Date.parse(cache.fetchedAt))) return cache;
  } catch {
    // copia assente o illeggibile: si scarica l'elenco
  }
  return null;
}

/** Elenco dei modelli: dalla copia se è recente e non si chiede di aggiornarla, altrimenti
 *  da OpenRouter. Se il download non riesce si restituisce la copia (se c'è) con `error`. */
async function listModels(
  dir,
  { refresh = false, fetch: fetchImpl = fetch, now = Date.now, timeoutMs } = {},
) {
  const file = path.join(dir, CACHE_FILE);
  const cached = await readCache(file);
  const age = cached ? now() - Date.parse(cached.fetchedAt) : Number.NaN;
  if (!refresh && age >= 0 && age < CACHE_MAX_AGE_MS) {
    return { models: cached.models, fetchedAt: cached.fetchedAt, error: null };
  }
  let models;
  try {
    models = await download(fetchImpl, timeoutMs);
  } catch (err) {
    return { models: cached?.models ?? [], fetchedAt: cached?.fetchedAt ?? null, error: err.message };
  }
  const fetchedAt = new Date(now()).toISOString();
  try {
    await writeFileAtomic(file, JSON.stringify({ fetchedAt, models }));
  } catch (err) {
    // Senza copia l'elenco si riscarica la prossima volta: non è un motivo per non mostrarlo
    console.error(`Copia dell'elenco dei modelli non salvata: ${err.message}`);
  }
  return { models, fetchedAt, error: null };
}

module.exports = { CACHE_FILE, MODELS_URL, listModels, parseModels };
