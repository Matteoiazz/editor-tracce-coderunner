import { describe, expect, it } from "vitest";
import { keyDetails, keyProblem, newPasswordProblem, protectionText } from "./apiKey";

const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab";

const status = (change: Partial<ApiKeyStatus>): ApiKeyStatus => ({
  saved: true,
  mask: "sk-or-v1-••••89ab",
  protected: false,
  unlocked: false,
  weakKeychain: false,
  problem: null,
  ...change,
});

const valid = (change: Partial<Extract<KeyCheck, { outcome: "valid" }>> = {}) => ({
  outcome: "valid" as const,
  usage: null,
  limit: null,
  limitRemaining: null,
  freeRequestsRemaining: null,
  freeRequestsLimit: null,
  expiresAt: null,
  ...change,
});

describe("campo della chiave", () => {
  it("accetta una chiave incollata con spazi agli estremi", () => {
    expect(keyProblem(`  ${KEY}\n`)).toBeNull();
  });

  it("segnala un campo vuoto, una chiave troppo corta o con spazi interni", () => {
    expect(keyProblem("   ")).toBe("Incolla la chiave");
    expect(keyProblem("sk-or-v1-corta")).toContain("Non sembra una chiave");
    expect(keyProblem("sk-or-v1-0123456789 abcdef0123")).toContain("senza spazi");
  });
});

describe("nuova master password", () => {
  it("almeno 8 caratteri, scritta due volte uguale", () => {
    expect(newPasswordProblem("corta", "corta")).toBe("La master password deve avere almeno 8 caratteri");
    expect(newPasswordProblem("password lunga", "password lungha")).toBe("Le due password non coincidono");
    expect(newPasswordProblem("password lunga", "password lunga")).toBeNull();
  });

  it("conta i caratteri, non i byte", () => {
    expect(newPasswordProblem("èèèèèèèè", "èèèèèèèè")).toBeNull();
  });
});

describe("testi della chiave", () => {
  it("dicono dove è conservata e se è sbloccata", () => {
    expect(protectionText(status({}))).toBe("Conservata nel portachiavi del sistema");
    expect(protectionText(status({ weakKeychain: true }))).toBe(
      "Conservata senza master password, con una protezione debole",
    );
    expect(protectionText(status({ protected: true }))).toBe("Protetta da master password · bloccata");
    expect(protectionText(status({ protected: true, unlocked: true }))).toContain("sbloccata per questa sessione");
  });

  it("mostrano solo i dettagli indicati da OpenRouter", () => {
    expect(keyDetails(valid())).toEqual([]);
    expect(
      keyDetails(
        valid({
          freeRequestsRemaining: 47,
          freeRequestsLimit: 50,
          limit: 10,
          limitRemaining: 8.75,
          usage: 1.25,
          expiresAt: "2027-03-01T00:00:00Z",
        }),
      ),
    ).toEqual([
      "Modelli gratuiti: 47 richieste rimaste oggi su 50.",
      "Limite di spesa della chiave: 8,75 $ rimasti su 10,00 $.",
      "Spesa finora con questa chiave: 1,25 $.",
      "Scade il 1 marzo 2027.",
    ]);
  });
});
