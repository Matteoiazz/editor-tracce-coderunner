import { describe, expect, it } from "vitest";
import { API_URL, checkKey } from "./openrouter.cjs";

const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab";

function respond(body: unknown, status = 200) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return { fetch, requests };
}

describe("prova della chiave con OpenRouter", () => {
  it("chiede i dati della chiave presentandola solo nell'intestazione", async () => {
    const { fetch, requests } = respond({ data: {} });

    await checkKey(KEY, { fetch });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${API_URL}/key`);
    expect(requests[0].url).not.toContain(KEY);
    expect((requests[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it("chiave valida: spesa, limite e richieste gratuite rimaste oggi", async () => {
    const { fetch } = respond({
      data: {
        usage: 1.25,
        limit: 10,
        limit_remaining: 8.75,
        expires_at: null,
        free_model_daily_requests: { used: 3, limit: 50, remaining: 47 },
      },
    });

    expect(await checkKey(KEY, { fetch })).toEqual({
      outcome: "valid",
      usage: 1.25,
      limit: 10,
      limitRemaining: 8.75,
      freeRequestsRemaining: 47,
      freeRequestsLimit: 50,
      expiresAt: null,
    });
  });

  it("chiave valida senza dettagli: i dati mancanti restano vuoti", async () => {
    const result = await checkKey(KEY, { fetch: respond({ data: { usage: "x" } }).fetch });

    expect(result).toMatchObject({ outcome: "valid", usage: null, limitRemaining: null, freeRequestsRemaining: null });
  });

  it("chiave non riconosciuta", async () => {
    const { fetch } = respond({ error: { message: "User not found.", code: 401 } }, 401);

    expect(await checkKey(KEY, { fetch })).toMatchObject({ outcome: "invalid" });
  });

  it("errore di OpenRouter o risposta non riconosciuta", async () => {
    expect(await checkKey(KEY, { fetch: respond("errore", 500).fetch })).toEqual({
      outcome: "error",
      message: "OpenRouter ha risposto con un errore (HTTP 500)",
    });
    expect(await checkKey(KEY, { fetch: respond("<html>").fetch })).toEqual({
      outcome: "error",
      message: "Risposta di OpenRouter non riconosciuta",
    });
  });

  it("nessuna connessione o tempo scaduto", async () => {
    const offline = async () => {
      throw new TypeError("fetch failed");
    };
    const silent = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("interrotta")));
      });

    expect(await checkKey(KEY, { fetch: offline })).toEqual({
      outcome: "error",
      message: "OpenRouter non è raggiungibile, controlla la connessione",
    });
    expect(await checkKey(KEY, { fetch: silent, timeoutMs: 20 })).toEqual({
      outcome: "error",
      message: "OpenRouter non ha risposto in tempo",
    });
  });
});
