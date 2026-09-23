import { describe, expect, it } from "vitest";
import { buildName, parseName } from "./naming";

describe("buildName", () => {
  it("compone il nome secondo la convenzione del docente", () => {
    expect(buildName(1, { date: "2026-07-03", kind: "Esame" })).toBe(
      "Esercizio1-2026-07-03-Esame",
    );
    expect(buildName(2, { date: "2026-09-30", kind: "Pretest" })).toBe(
      "Esercizio2-2026-09-30-Pretest",
    );
  });

  it("restituisce null se manca un dato", () => {
    expect(buildName(null, { date: "2026-07-03", kind: "Esame" })).toBeNull();
    expect(buildName(1, { date: "", kind: "Esame" })).toBeNull();
    expect(buildName(1, { date: "2026-07-03", kind: null })).toBeNull();
  });
});

describe("parseName", () => {
  it("riconosce i nomi reali degli esami", () => {
    expect(parseName("Esame-2026-07-03 - Traccia 1 - Esercizio 3")).toEqual({
      number: 3,
      date: "2026-07-03",
      kind: "Esame",
    });
  });

  it("riconosce il pretest anche senza giorno", () => {
    expect(parseName("2026-07 - Esercizio pretest 1")).toEqual({
      number: 1,
      date: "",
      kind: "Pretest",
    });
  });

  it("riconosce i nomi prodotti dall'applicazione", () => {
    expect(parseName("Esercizio2-2026-09-30-Pretest")).toEqual({
      number: 2,
      date: "2026-09-30",
      kind: "Pretest",
    });
  });

  it("lascia vuote le parti non riconosciute", () => {
    expect(parseName("Domanda senza convenzione")).toEqual({
      number: null,
      date: "",
      kind: null,
    });
  });
});
