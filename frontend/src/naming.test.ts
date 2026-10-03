import { describe, expect, it } from "vitest";
import { buildName, parseName } from "./naming";

describe("buildName", () => {
  it("compone il nome secondo la convenzione del docente", () => {
    expect(buildName(1, { date: "2026-07-03", kind: "Esame", track: 1 })).toBe(
      "Esame-2026-07-03-Traccia1-Esercizio1",
    );
    expect(buildName(3, { date: "2026-07-03", kind: "Esame", track: 2 })).toBe(
      "Esame-2026-07-03-Traccia2-Esercizio3",
    );
  });

  it("il pretest ha un solo esercizio e il nome non contiene il numero", () => {
    expect(buildName(1, { date: "2026-09-30", kind: "Pretest", track: 1 })).toBe(
      "Pretest-2026-09-30-Traccia1",
    );
    expect(buildName(null, { date: "2026-09-30", kind: "Pretest", track: 1 })).toBe(
      "Pretest-2026-09-30-Traccia1",
    );
  });

  it("restituisce null se manca un dato", () => {
    expect(buildName(null, { date: "2026-07-03", kind: "Esame", track: 1 })).toBeNull();
    expect(buildName(1, { date: "", kind: "Esame", track: 1 })).toBeNull();
    expect(buildName(1, { date: "2026-07-03", kind: null, track: 1 })).toBeNull();
    expect(buildName(1, { date: "2026-07-03", kind: "Esame", track: null })).toBeNull();
  });
});

describe("parseName", () => {
  it("riconosce i nomi reali degli esami", () => {
    expect(parseName("Esame-2026-07-03 - Traccia 1 - Esercizio 3")).toEqual({
      number: 3,
      track: 1,
      date: "2026-07-03",
      kind: "Esame",
    });
  });

  it("riconosce il pretest anche senza giorno", () => {
    expect(parseName("2026-07 - Esercizio pretest 1")).toEqual({
      number: 1,
      track: null,
      date: "",
      kind: "Pretest",
    });
  });

  it("riconosce i nomi prodotti dall'applicazione", () => {
    expect(parseName("Esame-2026-07-03-Traccia2-Esercizio4")).toEqual({
      number: 4,
      track: 2,
      date: "2026-07-03",
      kind: "Esame",
    });
    expect(parseName("Pretest-2026-09-30-Traccia1")).toEqual({
      number: null,
      track: 1,
      date: "2026-09-30",
      kind: "Pretest",
    });
  });

  it("riconosce lo schema precedente", () => {
    expect(parseName("Esercizio2-2026-09-30-Pretest")).toEqual({
      number: 2,
      track: null,
      date: "2026-09-30",
      kind: "Pretest",
    });
  });

  it("lascia vuote le parti non riconosciute", () => {
    expect(parseName("Domanda senza convenzione")).toEqual({
      number: null,
      track: null,
      date: "",
      kind: null,
    });
  });
});
