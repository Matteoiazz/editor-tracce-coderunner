import { describe, expect, it } from "vitest";
import { updateBanner, updateStatusText } from "./updates";

type Active = Exclude<UpdateStatus, { mode: "none" }>;

const status = (change: Partial<Active> = {}): Active => ({
  mode: "auto",
  automatic: true,
  downloadUrl: "https://github.com/Matteoiazz/editor-tracce-coderunner/releases/latest",
  phase: "idle",
  version: null,
  progress: null,
  checkedAt: null,
  error: null,
  ...change,
});

describe("testo dell'aggiornamento", () => {
  it("descrive ogni fase", () => {
    expect(updateStatusText(status())).toBe("Nessun controllo in questa sessione.");
    expect(updateStatusText(status({ phase: "checking" }))).toBe("Controllo in corso…");
    expect(updateStatusText(status({ phase: "downloading", version: "1.2.1", progress: 42 }))).toBe(
      "Download della versione 1.2.1: 42%.",
    );
    expect(updateStatusText(status({ phase: "ready", version: "1.2.1" }))).toBe(
      "La versione 1.2.1 è pronta: si installa alla chiusura dell'app.",
    );
    expect(updateStatusText(status({ phase: "available", version: "1.2.1", mode: "manual" }))).toContain(
      "pagina delle release",
    );
  });

  it("dice quando è stato l'ultimo controllo", () => {
    const checkedAt = "2026-10-25T10:00:00Z";
    expect(updateStatusText(status({ phase: "current", checkedAt }))).toMatch(
      /^Hai l'ultima versione \(controllo del .*2026.*\)\.$/,
    );
    expect(
      updateStatusText(status({ phase: "error", error: "Nessuna connessione con il server degli aggiornamenti", checkedAt })),
    ).toMatch(/^Nessuna connessione con il server degli aggiornamenti \(controllo del .*\)\.$/);
  });
});

describe("messaggio in alto", () => {
  it("compare per una versione pronta o da scaricare", () => {
    expect(updateBanner(status({ phase: "ready", version: "1.2.1" }), null)?.version).toBe("1.2.1");
    expect(updateBanner(status({ phase: "available", version: "1.2.1", mode: "manual" }), null)).not.toBeNull();
  });

  it("non compare negli altri casi né per una versione rimandata", () => {
    expect(updateBanner(null, null)).toBeNull();
    expect(updateBanner({ mode: "none", reason: "in sviluppo", downloadUrl: "" }, null)).toBeNull();
    expect(updateBanner(status({ phase: "downloading", version: "1.2.1" }), null)).toBeNull();
    expect(updateBanner(status({ phase: "ready", version: "1.2.1" }), "1.2.1")).toBeNull();
    // Una versione ancora più nuova si mostra di nuovo
    expect(updateBanner(status({ phase: "ready", version: "1.2.2" }), "1.2.1")).not.toBeNull();
  });
});
