// Richieste all'API di OpenRouter dal processo principale, con un tempo massimo e messaggi
// d'errore comprensibili. La chiave, quando serve, va solo nell'intestazione Authorization.

const API_URL = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 15_000;

/** GET di un indirizzo dell'API. Restituisce stato HTTP e corpo JSON (null se non è JSON);
 *  senza risposta lancia un errore che dice se manca la connessione o è scaduto il tempo. */
async function getJson(endpoint, { fetch: fetchImpl, key = null, timeoutMs = TIMEOUT_MS }) {
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = { Accept: "application/json", ...(key && { Authorization: `Bearer ${key}` }) };
  let response;
  let text;
  try {
    response = await fetchImpl(`${API_URL}${endpoint}`, { signal, headers });
    text = await response.text();
  } catch {
    // Il tipo di errore cambia da un sistema all'altro: conta se è scaduto il tempo
    throw new Error(
      signal.aborted
        ? "OpenRouter non ha risposto in tempo"
        : "OpenRouter non è raggiungibile, controlla la connessione",
    );
  }
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // risposta non JSON: chi chiama la tratta come non riconosciuta
  }
  return { status: response.status, ok: response.ok, body };
}

function amount(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Controlla la chiave chiedendo a OpenRouter i suoi dati, senza consumare crediti.
 *  Esito "valid" con spesa, limiti e richieste gratuite rimaste oggi (null se non indicati),
 *  "invalid" se OpenRouter non la riconosce, "error" se non si è potuto controllare. */
async function checkKey(key, options) {
  let response;
  try {
    response = await getJson("/key", { ...options, key });
  } catch (err) {
    return { outcome: "error", message: err.message };
  }
  if (response.status === 401) {
    return {
      outcome: "invalid",
      message: "OpenRouter non riconosce la chiave: controlla di averla copiata per intero, o creane una nuova",
    };
  }
  const data = response.body?.data;
  if (!response.ok || typeof data !== "object" || data === null) {
    return {
      outcome: "error",
      message: response.ok
        ? "Risposta di OpenRouter non riconosciuta"
        : `OpenRouter ha risposto con un errore (HTTP ${response.status})`,
    };
  }
  const free = data.free_model_daily_requests;
  return {
    outcome: "valid",
    usage: amount(data.usage),
    limit: amount(data.limit),
    limitRemaining: amount(data.limit_remaining),
    freeRequestsRemaining: Number.isInteger(free?.remaining) ? free.remaining : null,
    freeRequestsLimit: Number.isInteger(free?.limit) ? free.limit : null,
    expiresAt: typeof data.expires_at === "string" ? data.expires_at : null,
  };
}

module.exports = { API_URL, checkKey, getJson };
