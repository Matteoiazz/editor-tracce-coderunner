// Richieste AI della pagina al backend, attraverso il processo principale: qui si aggiungono
// la chiave di OpenRouter (nell'intestazione X-OpenRouter-Key) e il modello scelto nelle
// Impostazioni. La pagina non riceve mai la chiave e può chiedere solo le operazioni elencate.

// Il backend aspetta il modello fino a 120 secondi per richiesta e smette da solo; la
// generazione può farne fino a sei (tre tentativi, ciascuno con un secondo invio se il formato
// è sbagliato) e dopo ogni tentativo esegue i test. Questo limite serve solo se il backend
// non risponde più: deve restare più lungo del lavoro che fa
const TIMEOUT_MS = 900_000;

/** `connection` restituisce indirizzo e codice del backend, `key` la chiave in chiaro (o un
 *  errore che dice di inserirla o sbloccarla), `model` l'identificativo del modello. */
function createAiClient({ connection, key, model, fetch, timeoutMs = TIMEOUT_MS }) {
  async function post(endpoint, payload) {
    const apiKey = await key();
    const modelId = await model();
    const { url, token } = connection();
    const signal = AbortSignal.timeout(timeoutMs);
    let response;
    let text;
    try {
      response = await fetch(`${url}/api/ai/${endpoint}`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          "X-App-Token": token,
          "X-OpenRouter-Key": apiKey,
        },
        body: JSON.stringify({ ...payload, model: modelId }),
      });
      text = await response.text();
    } catch {
      throw new Error(
        signal.aborted
          ? "La richiesta all'AI è durata troppo ed è stata interrotta: riprova, oppure scegli un modello più veloce"
          : "Il backend dell'app non risponde",
      );
    }
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      // gestita sotto come risposta non riconosciuta
    }
    if (!response.ok) {
      // Errori del modello: { detail: { kind, message } }; errori della richiesta: { detail: "..." }
      const detail = body?.detail;
      const message = typeof detail === "string" ? detail : detail?.message;
      throw new Error(typeof message === "string" ? message : `Errore del backend (HTTP ${response.status})`);
    }
    if (body === null) throw new Error("Risposta del backend non riconosciuta");
    return body;
  }

  const notesOf = (notes) => (typeof notes === "string" ? notes : "");

  return {
    /** Prova chiave e modello: { correct, seconds }. */
    check: () => post("check", {}),
    /** Revisione della soluzione dell'esercizio: { findings, tests }. */
    review: (question, notes) => post("review", { question, notes: notesOf(notes) }),
    /** Correzione di una segnalazione: { solution, explanation, tests }. */
    fix: (question, finding, extraInputs, notes) =>
      post("fix", {
        question,
        finding,
        extra_inputs: Array.isArray(extraInputs) ? extraInputs : [],
        notes: notesOf(notes),
      }),
    /** Soluzione generata e controllata sui test: { solution, explanation, attempts, tests, problems }. */
    generate: (question, notes) => post("generate", { question, notes: notesOf(notes) }),
    /** Esercizi simili controllati sugli input dei test comuni: { proposals, discarded }. */
    similar: (question, context, notes) =>
      post("similar", {
        question,
        kind: context?.kind ?? null,
        exclude_track: typeof context?.excludeTrack === "string" ? context.excludeTrack : "",
        test_inputs: Array.isArray(context?.testInputs) ? context.testInputs : [],
        notes: notesOf(notes),
      }),
  };
}

module.exports = { TIMEOUT_MS, createAiClient };
