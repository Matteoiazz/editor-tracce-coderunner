import { describe, expect, it } from "vitest";
import { createQuestion } from "./exam";
import type { ExamInfo } from "./naming";
import { isEmptySession, parseSession, SESSION_VERSION } from "./session";
import { standardCommonTests } from "./testcases";

const exam: ExamInfo = { date: "2026-10-15", kind: "Esame", track: 1 };

describe("vecchio file di sessione", () => {
  it("legge esame, test comuni ed esercizi senza perdite", () => {
    const common = standardCommonTests();
    const item = { ...createQuestion(1, exam), commonExpected: { [common[0].id]: "0\n1\nx\n" } };

    const text = JSON.stringify({ version: SESSION_VERSION, exam, common, items: [item] });
    const restored = parseSession(text);

    expect(restored).toEqual({ exam, common, items: [item] });
  });

  it("rifiuta contenuti non validi o di un'altra versione", () => {
    expect(parseSession("non json")).toBeNull();
    expect(parseSession("null")).toBeNull();
    expect(parseSession(JSON.stringify({ version: 99, exam, common: [], items: [] }))).toBeNull();
    expect(parseSession(JSON.stringify({ version: 1, exam, common: [], items: [{}] }))).toBeNull();
    expect(parseSession(JSON.stringify({ version: 1, exam: { date: 3 }, common: [], items: [] }))).toBeNull();
  });

  it("riconosce una sessione vuota", () => {
    expect(isEmptySession({ exam: { date: "", kind: null, track: 1 }, common: [], items: [] })).toBe(true);
    expect(isEmptySession({ exam, common: [], items: [] })).toBe(false);
  });
});

describe("esercizi del vecchio file di sessione", () => {
  it("usano tutti i test comuni", () => {
    const { excludedCommon: _excluded, ...old } = createQuestion(1, exam);
    const text = JSON.stringify({ version: SESSION_VERSION, exam, common: [], items: [old] });

    expect(parseSession(text)?.items[0].excludedCommon).toEqual([]);
  });
});

describe("salvataggi precedenti al numero di traccia", () => {
  it("valgono come traccia 1", () => {
    const old = JSON.stringify({ version: 1, exam: { date: "2026-10-15", kind: "Esame" }, common: [], items: [] });
    expect(parseSession(old)?.exam).toEqual({ date: "2026-10-15", kind: "Esame", track: 1 });
  });
});
