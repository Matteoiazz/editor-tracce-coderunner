import { describe, expect, it } from "vitest";
import { contextText, filterModels, ipcErrorText, isModelId, priceText } from "./settings";

function model(id: string, name: string, extra: Partial<ModelInfo> = {}): ModelInfo {
  return { id, name, free: false, context: null, promptPrice: 1, completionPrice: 2, ...extra };
}

const ULTRA = model("nvidia/nemotron-3-ultra-550b-a55b", "NVIDIA: Nemotron 3 Ultra", {
  promptPrice: 0.6,
  completionPrice: 2.4,
});
const ULTRA_FREE = model("nvidia/nemotron-3-ultra-550b-a55b:free", "NVIDIA: Nemotron 3 Ultra (free)", {
  free: true,
  promptPrice: 0,
  completionPrice: 0,
});
const GPT = model("openai/gpt-5", "OpenAI: GPT-5");
const MODELS = [ULTRA, ULTRA_FREE, GPT];

describe("ricerca dei modelli", () => {
  it("trova i modelli con tutte le parole cercate, nel nome o nell'identificativo", () => {
    expect(filterModels(MODELS, "nemotron ultra", false)).toEqual([ULTRA, ULTRA_FREE]);
    expect(filterModels(MODELS, "  NVIDIA   free ", false)).toEqual([ULTRA_FREE]);
    expect(filterModels(MODELS, "openai/", false)).toEqual([GPT]);
    expect(filterModels(MODELS, "mistral", false)).toEqual([]);
  });

  it("senza parole mostra tutti i modelli, o solo i gratuiti", () => {
    expect(filterModels(MODELS, "", false)).toEqual(MODELS);
    expect(filterModels(MODELS, "", true)).toEqual([ULTRA_FREE]);
    expect(filterModels(MODELS, "gpt", true)).toEqual([]);
  });
});

describe("testi del modello", () => {
  it("indica il prezzo per milione di token, gratuito o variabile", () => {
    expect(priceText(ULTRA)).toBe("input 0,60 $ · output 2,40 $ per milione di token");
    expect(priceText(model("a/b", "B", { promptPrice: 0.07, completionPrice: 15 }))).toBe(
      "input 0,07 $ · output 15,00 $ per milione di token",
    );
    expect(priceText(model("a/b", "B", { promptPrice: 0.015, completionPrice: 0.0375 }))).toBe(
      "input 0,015 $ · output 0,038 $ per milione di token",
    );
    expect(priceText(ULTRA_FREE)).toBe("gratuito");
    expect(priceText(model("openrouter/auto", "Auto", { promptPrice: null, completionPrice: null }))).toBe(
      "prezzo variabile",
    );
  });

  it("indica il contesto con il separatore delle migliaia", () => {
    expect(contextText(262144)).toBe("262.144 token di contesto");
  });
});

describe("identificativo scritto a mano", () => {
  it("deve essere fornitore/nome senza spazi", () => {
    expect(isModelId("nvidia/nemotron-3-ultra-550b-a55b")).toBe(true);
    expect(isModelId("meta-llama/llama-3.3-70b-instruct:free")).toBe(true);
    expect(isModelId("nemotron")).toBe(false);
    expect(isModelId("nvidia/ nemotron")).toBe(false);
    expect(isModelId("nvidia/")).toBe(false);
  });
});

describe("errori del processo principale", () => {
  it("perdono il prefisso aggiunto da Electron", () => {
    const e = new Error("Error invoking remote method 'settings:update': Error: Identificativo del modello non valido");
    expect(ipcErrorText(e)).toBe("Identificativo del modello non valido");
    expect(ipcErrorText(new Error("ENOSPC: no space left on device"))).toBe("ENOSPC: no space left on device");
  });
});
