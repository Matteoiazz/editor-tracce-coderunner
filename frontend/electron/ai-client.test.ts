import { describe, expect, it } from "vitest";
import { createAiClient } from "./ai-client.cjs";

const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab";

function client(respond: (init: RequestInit) => Response | Promise<Response>, overrides: Record<string, unknown> = {}) {
  const requests: { url: string; init: RequestInit }[] = [];
  const ai = createAiClient({
    connection: () => ({ url: "http://127.0.0.1:8123", token: "codice" }),
    key: async () => KEY,
    model: async () => "fornitore/modello",
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return respond(init);
    },
    ...overrides,
  });
  return { ai, requests };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("richieste AI al backend", () => {
  it("aggiunge chiave, codice dell'app e modello scelto", async () => {
    const { ai, requests } = client(() => json({ correct: true, seconds: 2 }));

    expect(await ai.check()).toEqual({ correct: true, seconds: 2 });

    expect(requests).toHaveLength(1);
    const { url, init } = requests[0];
    expect(url).toBe("http://127.0.0.1:8123/api/ai/check");
    expect(url).not.toContain(KEY);
    const headers = init.headers as Record<string, string>;
    expect(headers["X-OpenRouter-Key"]).toBe(KEY);
    expect(headers["X-App-Token"]).toBe("codice");
    expect(JSON.parse(init.body as string)).toEqual({ model: "fornitore/modello" });
  });

  it("senza chiave utilizzabile non contatta il backend", async () => {
    const { ai, requests } = client(() => json({}), {
      key: async () => {
        throw new Error("La chiave è protetta da master password: sbloccala nelle Impostazioni");
      },
    });

    await expect(ai.check()).rejects.toThrow("sbloccala nelle Impostazioni");
    expect(requests).toHaveLength(0);
  });

  it("errore del modello: il messaggio del backend", async () => {
    const { ai } = client(() => json({ detail: { kind: "rate", message: "Troppe richieste" } }, 502));
    await expect(ai.check()).rejects.toThrow("Troppe richieste");
  });

  it("errore della richiesta: il messaggio del backend", async () => {
    const { ai } = client(() => json({ detail: "Manca il modello" }, 400));
    await expect(ai.check()).rejects.toThrow("Manca il modello");
  });

  it("errore senza messaggio: lo stato HTTP", async () => {
    const { ai } = client(() => new Response("Internal Server Error", { status: 500 }));
    await expect(ai.check()).rejects.toThrow("HTTP 500");
  });

  it("backend non raggiungibile", async () => {
    const { ai } = client(() => {
      throw new TypeError("fetch failed");
    });
    await expect(ai.check()).rejects.toThrow("Il backend dell'app non risponde");
  });

  it("tempo scaduto", async () => {
    // Come fetch, la richiesta si interrompe quando scade il segnale
    const hang = (init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const { ai } = client(hang, { timeoutMs: 20 });
    await expect(ai.check()).rejects.toThrow("non ha risposto in tempo");
  });
});
