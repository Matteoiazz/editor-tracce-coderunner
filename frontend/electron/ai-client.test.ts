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

  it("revisione: l'esercizio insieme al modello", async () => {
    const { ai, requests } = client(() => json({ findings: [], tests: [] }));
    const question = { name: "q", solution: "print(1)" };

    expect(await ai.review(question, "solo errori")).toEqual({ findings: [], tests: [] });
    expect(requests[0].url).toBe("http://127.0.0.1:8123/api/ai/review");
    expect(JSON.parse(requests[0].init.body as string)).toEqual({
      question,
      notes: "solo errori",
      model: "fornitore/modello",
    });
  });

  it("correzione: esercizio, segnalazione e input in più", async () => {
    const { ai, requests } = client(() => json({ solution: "print(2)\n", explanation: "", tests: [] }));
    const finding = { kind: "errore", title: "t", explanation: "e", line: null };

    await ai.fix({ name: "q" }, finding, ["3"], "minima");
    expect(requests[0].url).toBe("http://127.0.0.1:8123/api/ai/fix");
    expect(JSON.parse(requests[0].init.body as string)).toEqual({
      question: { name: "q" },
      finding,
      extra_inputs: ["3"],
      notes: "minima",
      model: "fornitore/modello",
    });
  });

  it("soluzione generata: esercizio e indicazioni", async () => {
    const { ai, requests } = client(() => json({ solution: "", explanation: "", attempts: 1, tests: [], problems: [] }));

    await ai.generate({ name: "q" }, "usa un ciclo");
    expect(requests[0].url).toBe("http://127.0.0.1:8123/api/ai/generate");
    expect(JSON.parse(requests[0].init.body as string)).toEqual({
      question: { name: "q" },
      notes: "usa un ciclo",
      model: "fornitore/modello",
    });
  });

  it("esercizi simili: esercizio, traccia e input dei test comuni", async () => {
    const { ai, requests } = client(() => json({ proposals: [], discarded: 0 }));

    await ai.similar({ name: "q" }, { kind: "Esame", excludeTrack: "t1", testInputs: ["0\n1"] }, "stringhe");
    expect(requests[0].url).toBe("http://127.0.0.1:8123/api/ai/similar");
    expect(JSON.parse(requests[0].init.body as string)).toEqual({
      question: { name: "q" },
      kind: "Esame",
      exclude_track: "t1",
      test_inputs: ["0\n1"],
      notes: "stringhe",
      model: "fornitore/modello",
    });
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
    await expect(ai.check()).rejects.toThrow("è durata troppo ed è stata interrotta");
  });
});
