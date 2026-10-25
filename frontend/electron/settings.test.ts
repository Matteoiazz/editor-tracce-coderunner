import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DAMAGED_COPY,
  DEFAULT_MODEL,
  SETTINGS_FILE,
  createSettingsStore,
  isModelId,
  readSettings,
} from "./settings.cjs";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "impostazioni-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const settingsFile = () => join(dir, SETTINGS_FILE);
const readJson = async (name: string) => JSON.parse(await readFile(join(dir, name), "utf-8"));

describe("impostazioni", () => {
  it("senza file valgono i predefiniti, e il file non viene creato", async () => {
    const view = await createSettingsStore(dir).get();

    expect(view).toEqual({
      ai: { model: DEFAULT_MODEL },
      updates: { auto: true },
      defaultModel: DEFAULT_MODEL,
      damagedCopy: null,
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it("salvano il modello scelto e lo rileggono a un nuovo avvio", async () => {
    const view = await createSettingsStore(dir).update({ ai: { model: "openai/gpt-5:free" } });

    expect(view.ai.model).toBe("openai/gpt-5:free");
    expect(await readJson(SETTINGS_FILE)).toEqual({
      version: 1,
      ai: { model: "openai/gpt-5:free" },
      updates: { auto: true },
    });
    expect((await createSettingsStore(dir).get()).ai.model).toBe("openai/gpt-5:free");
  });

  it("rifiutano un identificativo non valido senza toccare il file", async () => {
    const store = createSettingsStore(dir);
    await store.update({ ai: { model: "meta/llama" } });

    await expect(store.update({ ai: { model: "senza barra" } })).rejects.toThrow("non valido");
    await expect(store.update({ ai: { model: 42 } })).rejects.toThrow("non valido");
    expect((await readJson(SETTINGS_FILE)).ai.model).toBe("meta/llama");
    expect((await store.get()).ai.model).toBe("meta/llama");
  });

  it("accettano dalla pagina solo i valori previsti", async () => {
    await createSettingsStore(dir).update({
      ai: { model: "a/b", altro: 1 },
      updates: { auto: false, canale: "beta" },
      version: 99,
      segreto: "x",
    });

    expect(await readJson(SETTINGS_FILE)).toEqual({ version: 1, ai: { model: "a/b" }, updates: { auto: false } });
  });

  it("salvano la scelta sull'aggiornamento automatico senza toccare il modello", async () => {
    const store = createSettingsStore(dir);
    await store.update({ ai: { model: "a/b" } });

    expect((await store.update({ updates: { auto: false } })).updates.auto).toBe(false);
    expect((await createSettingsStore(dir).get()).ai.model).toBe("a/b");
    await expect(store.update({ updates: { auto: "no" } })).rejects.toThrow("non valido");
    expect((await readJson(SETTINGS_FILE)).updates.auto).toBe(false);
  });

  it("applicano le modifiche nell'ordine in cui arrivano, senza lasciare file temporanei", async () => {
    const store = createSettingsStore(dir);
    await Promise.all(["a/1", "a/2", "a/3"].map((model) => store.update({ ai: { model } })));

    expect((await readJson(SETTINGS_FILE)).ai.model).toBe("a/3");
    expect(await readdir(dir)).toEqual([SETTINGS_FILE]);
  });

  it("conservano le voci di una versione più recente dell'app", async () => {
    await writeFile(settingsFile(), JSON.stringify({ version: 3, ai: { model: "x/y", temp: 1 }, nuovo: true }));

    await createSettingsStore(dir).update({ ai: { model: "x/z" } });

    expect(await readJson(SETTINGS_FILE)).toEqual({
      version: 3,
      ai: { model: "x/z", temp: 1 },
      updates: { auto: true },
      nuovo: true,
    });
  });

  it("sostituiscono con il predefinito un modello non valido nel file", async () => {
    await writeFile(settingsFile(), JSON.stringify({ ai: { model: "" } }));

    const { settings, damagedCopy } = await readSettings(dir);

    expect(settings).toEqual({ version: 1, ai: { model: DEFAULT_MODEL }, updates: { auto: true } });
    expect(damagedCopy).toBeNull();
  });
});

describe("file delle impostazioni rovinato", () => {
  it.each([
    ["testo non JSON", '{"ai": {"model": "a/b"'],
    ["JSON che non è un oggetto", "[1, 2]"],
    ["file vuoto", ""],
  ])("%s: si riparte dai predefiniti conservando una copia", async (_case, content) => {
    await writeFile(settingsFile(), content);

    const view = await createSettingsStore(dir).get();

    expect(view.ai.model).toBe(DEFAULT_MODEL);
    expect(view.damagedCopy).toBe(join(dir, DAMAGED_COPY));
    expect(await readFile(join(dir, DAMAGED_COPY), "utf-8")).toBe(content);
    // Il file viene riscritto subito: al prossimo avvio non risulta più rovinato
    expect(await readJson(SETTINGS_FILE)).toEqual({
      version: 1,
      ai: { model: DEFAULT_MODEL },
      updates: { auto: true },
    });
    expect((await createSettingsStore(dir).get()).damagedCopy).toBeNull();
  });
});

describe("identificativo del modello", () => {
  it("è fornitore/nome senza spazi", () => {
    expect(isModelId(DEFAULT_MODEL)).toBe(true);
    expect(isModelId("nvidia/nemotron-3-ultra-550b-a55b:free")).toBe(true);
    expect(isModelId("openrouter/auto")).toBe(true);
    expect(isModelId("nemotron")).toBe(false);
    expect(isModelId("/nemotron")).toBe(false);
    expect(isModelId("nvidia/")).toBe(false);
    expect(isModelId("nvidia/nemotron 3")).toBe(false);
    expect(isModelId(`a/${"x".repeat(200)}`)).toBe(false);
    expect(isModelId(null)).toBe(false);
  });
});
