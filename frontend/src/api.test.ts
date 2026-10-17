import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKEND_UNREACHABLE, verifyQuestion } from "./api";
import { createQuestion } from "./exam";

// Il collegamento al backend viene chiesto a Electron una volta sola: tutti i test usano lo stesso.
function stubDesktop() {
  vi.stubGlobal("window", {
    desktop: { getBackendConnection: async () => ({ url: "http://127.0.0.1:1", token: "segreto" }) },
  });
}

describe("chiamate al backend", () => {
  beforeEach(stubDesktop);
  afterEach(() => vi.unstubAllGlobals());

  it("se il backend non risponde il messaggio è comprensibile", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const { question } = createQuestion(1, { date: "2026-10-15", kind: "Esame", track: 1 });

    await expect(verifyQuestion(question)).rejects.toThrow(BACKEND_UNREACHABLE);
  });

  it("ogni richiesta porta il codice segreto", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);
    const { question } = createQuestion(1, { date: "2026-10-15", kind: "Esame", track: 1 });

    await verifyQuestion(question);

    const init = fetchMock.mock.calls[0][1];
    const headers = new Headers(init.headers);
    expect(headers.get("X-App-Token")).toBe("segreto");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
