import { describe, expect, it } from "vitest";
import { createQuestion, type EditableQuestion } from "./exam";
import type { ExamInfo } from "./naming";
import {
  examSummary,
  exerciseStatus,
  makeRecord,
  testStates,
  validOutcomes,
} from "./status";
import { composeTests, newRow, standardCommonTests } from "./testcases";

const exam: ExamInfo = { date: "2026-10-15", kind: "Esame" };
const common = standardCommonTests();

function complete(): EditableQuestion {
  const item = createQuestion(1, exam);
  return {
    ...item,
    commonExpected: Object.fromEntries(common.map((row) => [row.id, "out\n"])),
    specific: [{ ...newRow("9\n12"), expected: "out\n" }],
    question: {
      ...item.question,
      text_html: "<p>Calcola la somma.</p>",
      student_code: "def calcola(lst):\n    return None\n",
    },
  };
}

function rowsOf(item: EditableQuestion) {
  return composeTests(common, item.useCommon, item.commonExpected, item.specific);
}

const pass = (index: number) => ({ index, passed: true, expected: "", got: "", error: "" });
const fail = (index: number) => ({ index, passed: false, expected: "", got: "", error: "" });

describe("testStates", () => {
  it("distingue da calcolare, da verificare, superato e fallito", () => {
    const rows = [newRow("0\n1"), { ...newRow("1\n2"), expected: "x" }, { ...newRow("2\n3"), expected: "y" }];
    const record = makeRecord("sol", rows, [pass(1), fail(2)], false);

    expect(testStates(rows, null)).toEqual(["pending", "unverified", "unverified"]);
    expect(testStates(rows, record.outcomes)).toEqual(["pending", "passed", "failed"]);
  });
});

describe("validOutcomes", () => {
  it("gli esiti non valgono più se cambiano la soluzione o i test", () => {
    const rows = [{ ...newRow("0\n1"), expected: "x" }];
    const record = makeRecord("sol", rows, [pass(0)], false);

    expect(validOutcomes(record, "sol", rows)).not.toBeNull();
    expect(validOutcomes(record, "sol modificata", rows)).toBeNull();
    expect(validOutcomes(record, "sol", [{ ...rows[0], stdin: "0\n2" }])).toBeNull();
    expect(validOutcomes(undefined, "sol", rows)).toBeNull();
  });
});

describe("exerciseStatus", () => {
  it("un esercizio completo non ancora verificato non è pronto", () => {
    const status = exerciseStatus(complete(), common, undefined);

    expect(status.sections.text.state).toBe("done");
    expect(status.sections.studentCode.state).toBe("done");
    expect(status.sections.tests).toEqual({ state: "warning", note: "Da verificare" });
    expect(status.unverified).toBe(10);
    expect(status.ready).toBe(false);
  });

  it("dopo una verifica tutta verde è pronto", () => {
    const item = complete();
    const rows = rowsOf(item);
    const record = makeRecord(item.question.solution, rows, rows.map((_, i) => pass(i)), false);

    const status = exerciseStatus(item, common, record);

    expect(status.passed).toBe(10);
    expect(status.sections.tests.state).toBe("done");
    expect(status.ready).toBe(true);
  });

  it("segnala test falliti, codice studenti uguale alla soluzione e sezioni vuote", () => {
    const item = complete();
    const rows = rowsOf(item);
    const record = makeRecord(item.question.solution, rows, rows.map((_, i) => (i === 3 ? fail(i) : pass(i))), false);
    const broken = { ...item, question: { ...item.question, text_html: "<p></p>", student_code: item.question.solution } };

    const status = exerciseStatus(broken, common, record);

    expect(status.sections.text.state).toBe("todo");
    expect(status.sections.studentCode.state).toBe("error");
    expect(status.sections.tests).toEqual({ state: "error", note: "1 test falliti" });
    expect(status.ready).toBe(false);
  });

  it("segnala input incompleti e test da calcolare", () => {
    const item = { ...complete(), useCommon: false, specific: [newRow("0")] };

    expect(exerciseStatus(item, common, undefined).sections.tests.state).toBe("error");
    expect(
      exerciseStatus({ ...item, specific: [newRow("0\n5")] }, common, undefined).sections.tests,
    ).toEqual({ state: "warning", note: "1 test da calcolare" });
  });
});

describe("examSummary", () => {
  it("somma esercizi pronti e test superati", () => {
    const item = complete();
    const rows = rowsOf(item);
    const ready = exerciseStatus(item, common, makeRecord(item.question.solution, rows, rows.map((_, i) => pass(i)), false));
    const notReady = exerciseStatus(complete(), common, undefined);

    expect(examSummary([ready, notReady])).toEqual({
      exercises: 2,
      ready: 1,
      tests: 20,
      passed: 10,
      failed: 0,
    });
  });
});
