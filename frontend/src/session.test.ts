import { describe, expect, it } from "vitest";
import { createQuestion } from "./exam";
import type { ExamInfo } from "./naming";
import { isEmptySession, parseSession, serializeSession } from "./session";
import { standardCommonTests } from "./testcases";

const exam: ExamInfo = { date: "2026-10-15", kind: "Esame" };

describe("salvataggio della sessione", () => {
  it("salva e ripristina esame, test comuni ed esercizi senza perdite", () => {
    const common = standardCommonTests();
    const item = { ...createQuestion(1, exam), commonExpected: { [common[0].id]: "0\n1\nx\n" } };

    const restored = parseSession(serializeSession({ exam, common, items: [item] }));

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
    expect(isEmptySession({ exam: { date: "", kind: null }, common: [], items: [] })).toBe(true);
    expect(isEmptySession({ exam, common: [], items: [] })).toBe(false);
  });
});
