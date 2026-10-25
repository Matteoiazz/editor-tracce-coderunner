import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CACHE_FILE, MODELS_URL, listModels, parseModels } from "./models.cjs";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "modelli-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Voci nel formato di OpenRouter (solo i campi usati)
const ULTRA = {
  id: "nvidia/nemotron-3-ultra-550b-a55b",
  name: "NVIDIA: Nemotron 3 Ultra",
  context_length: 262144,
  architecture: { output_modalities: ["text"] },
  pricing: { prompt: "0.0000006", completion: "0.0000024" },
};
const ULTRA_FREE = {
  id: "nvidia/nemotron-3-ultra-550b-a55b:free",
  name: "NVIDIA: Nemotron 3 Ultra (free)",
  context_length: 1000000,
  architecture: { output_modalities: ["text"] },
  pricing: { prompt: "0", completion: "0" },
};
const IMAGE = {
  id: "acme/painter",
  name: "Acme: Painter",
  architecture: { output_modalities: ["image"] },
  pricing: { prompt: "0", completion: "0" },
};
const AUTO = { id: "openrouter/auto", name: "Auto Router", pricing: { prompt: "-1", completion: "-1" } };

const NOW = Date.parse("2026-10-25T10:00:00Z");
const HOUR = 60 * 60 * 1000;

function respond(body: unknown, status = 200) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

async function writeCache(fetchedAt: number, models: unknown[]) {
  await writeFile(join(dir, CACHE_FILE), JSON.stringify({ fetchedAt: new Date(fetchedAt).toISOString(), models }));
}

describe("elenco dei modelli di OpenRouter", () => {
  it("tiene i modelli che rispondono con testo, in ordine di nome, con i prezzi per milione di token", () => {
    const models = parseModels({ data: [ULTRA_FREE, IMAGE, AUTO, ULTRA] });

    expect(models.map((m) => m.id)).toEqual([
      "openrouter/auto",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
    ]);
    expect(models[1]).toEqual({
      id: ULTRA.id,
      name: ULTRA.name,
      free: false,
      context: 262144,
      promptPrice: expect.closeTo(0.6, 9),
      completionPrice: expect.closeTo(2.4, 9),
    });
    expect(models[2]).toMatchObject({ free: true, promptPrice: 0, completionPrice: 0 });
  });

  it("non considera gratuito un modello a prezzo variabile o senza prezzo", () => {
    const [auto, unknown] = parseModels({ data: [AUTO, { id: "x/y", pricing: { prompt: null } }] });

    expect(auto).toMatchObject({ free: false, promptPrice: null, completionPrice: null, context: null });
    // Senza nome si mostra l'identificativo
    expect(unknown).toMatchObject({ name: "x/y", free: false, promptPrice: null });
  });

  it("riconosce come gratuito un modello «:free» anche senza prezzi", () => {
    expect(parseModels({ data: [{ id: "a/b:free" }] })[0].free).toBe(true);
  });

  it("rifiuta una risposta in un altro formato", () => {
    expect(() => parseModels(null)).toThrow("non riconosciuta");
    expect(() => parseModels({ models: [] })).toThrow("non riconosciuta");
  });
});

describe("copia dell'elenco nella cartella dati", () => {
  it("al primo uso scarica l'elenco e ne salva una copia", async () => {
    const { fetch, calls } = respond({ data: [ULTRA] });

    const list = await listModels(dir, { fetch, now: () => NOW });

    expect(calls).toEqual([MODELS_URL]);
    expect(list).toMatchObject({ fetchedAt: "2026-10-25T10:00:00.000Z", error: null });
    expect(list.models.map((m) => m.id)).toEqual([ULTRA.id]);
    const cache = JSON.parse(await readFile(join(dir, CACHE_FILE), "utf-8"));
    expect(cache.models).toEqual(list.models);
    expect(await readdir(dir)).toEqual([CACHE_FILE]);
  });

  it("usa la copia se ha meno di un giorno, senza scaricare", async () => {
    await writeCache(NOW - 2 * HOUR, [{ id: "salvato/1" }]);
    const { fetch, calls } = respond({ data: [ULTRA] });

    const list = await listModels(dir, { fetch, now: () => NOW });

    expect(calls).toEqual([]);
    expect(list.models).toEqual([{ id: "salvato/1" }]);
  });

  it("riscarica l'elenco se la copia è vecchia o se si chiede di aggiornarlo", async () => {
    await writeCache(NOW - 25 * HOUR, [{ id: "salvato/1" }]);
    const old = respond({ data: [ULTRA] });
    expect((await listModels(dir, { fetch: old.fetch, now: () => NOW })).models[0].id).toBe(ULTRA.id);

    const refresh = respond({ data: [ULTRA_FREE] });
    const list = await listModels(dir, { refresh: true, fetch: refresh.fetch, now: () => NOW + HOUR });

    expect(refresh.calls).toHaveLength(1);
    expect(list.models[0].id).toBe(ULTRA_FREE.id);
  });

  it("senza connessione restituisce la copia, anche vecchia, con il motivo", async () => {
    await writeCache(NOW - 72 * HOUR, [{ id: "salvato/1" }]);
    const fetch = async () => {
      throw new TypeError("fetch failed");
    };

    const list = await listModels(dir, { fetch, now: () => NOW });

    expect(list).toEqual({
      models: [{ id: "salvato/1" }],
      fetchedAt: new Date(NOW - 72 * HOUR).toISOString(),
      error: "OpenRouter non è raggiungibile, controlla la connessione",
    });
  });

  it("senza connessione e senza copia restituisce un elenco vuoto con il motivo", async () => {
    const list = await listModels(dir, { fetch: respond("errore", 503).fetch, now: () => NOW });

    expect(list).toEqual({ models: [], fetchedAt: null, error: "OpenRouter ha risposto con un errore (HTTP 503)" });
    expect(await readdir(dir)).toEqual([]);
  });

  it("segnala una risposta non riconosciuta senza toccare la copia", async () => {
    await writeCache(NOW - 25 * HOUR, [{ id: "salvato/1" }]);

    const list = await listModels(dir, { fetch: respond("<html>").fetch, now: () => NOW });

    expect(list.error).toBe("Risposta di OpenRouter non riconosciuta");
    expect(list.models).toEqual([{ id: "salvato/1" }]);
  });

  it("smette di aspettare dopo il tempo massimo", async () => {
    // Risponde solo quando la richiesta viene interrotta
    const fetch = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("interrotta")));
      });

    const list = await listModels(dir, { fetch, now: () => NOW, timeoutMs: 20 });

    expect(list.error).toBe("OpenRouter non ha risposto in tempo");
  });

  it("ignora una copia illeggibile", async () => {
    await writeFile(join(dir, CACHE_FILE), "{rovinata");
    const { fetch, calls } = respond({ data: [ULTRA] });

    const list = await listModels(dir, { fetch, now: () => NOW });

    expect(calls).toHaveLength(1);
    expect(list.models[0].id).toBe(ULTRA.id);
  });
});
