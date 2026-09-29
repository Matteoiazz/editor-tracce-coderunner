import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKEND_UNREACHABLE, verifyQuestion } from "./api";
import { createQuestion } from "./exam";

describe("chiamate al backend", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("se il backend non risponde il messaggio è comprensibile", async () => {
    vi.stubGlobal("window", { desktop: { getBackendUrl: async () => "http://127.0.0.1:1" } });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const { question } = createQuestion(1, { date: "2026-10-15", kind: "Esame" });

    await expect(verifyQuestion(question)).rejects.toThrow(BACKEND_UNREACHABLE);
  });
});
