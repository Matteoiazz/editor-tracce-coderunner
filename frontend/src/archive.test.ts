import { describe, expect, it } from "vitest";
import { fromArchive, type OpenTrack, toArchive } from "./archive";
import { createQuestion } from "./exam";
import type { ExamInfo } from "./naming";
import { newRow, standardCommonTests } from "./testcases";

const exam: ExamInfo = { date: "2026-07-03", kind: "Esame", track: 2 };

function openTrack(): OpenTrack {
  const common = standardCommonTests().slice(0, 3);
  const item = createQuestion(1, exam);
  item.question.text_html = "<p>Testo</p>";
  item.commonExpected = { [common[0].id]: "out 0", [common[2].id]: "out 2" };
  item.specific = [{ ...newRow("5\n10"), expected: "5\n10\n" }];
  return { id: "t1", exam, common, items: [item] };
}

describe("toArchive", () => {
  it("salva gli output dei test comuni nell'ordine dei test, vuoti se mancanti", () => {
    const archived = toArchive(openTrack());

    expect(archived).toMatchObject({ id: "t1", kind: "Esame", day: "2026-07-03", number: 2 });
    expect(archived.common_tests).toHaveLength(3);
    expect(archived.common_tests.every((test) => test.expected === "")).toBe(true);
    expect(archived.exercises[0].common_expected).toEqual(["out 0", "", "out 2"]);
    expect(archived.exercises[0].question.testcases).toEqual([
      expect.objectContaining({ stdin: "5\n10", expected: "5\n10\n" }),
    ]);
    expect("id" in archived.common_tests[0]).toBe(false);
  });

  it("una data mancante diventa null", () => {
    expect(toArchive({ ...openTrack(), exam: { ...exam, date: "" } }).day).toBeNull();
  });
});

describe("fromArchive", () => {
  it("ricostruisce la traccia con nuovi identificativi dei test", () => {
    const original = openTrack();

    const reopened = fromArchive(toArchive(original));

    expect(reopened.id).toBe("t1");
    expect(reopened.exam).toEqual(exam);
    expect(reopened.common.map((row) => row.stdin)).toEqual(original.common.map((r) => r.stdin));
    expect(reopened.common[0].id).not.toBe(original.common[0].id);

    const [item] = reopened.items;
    expect(item.question.text_html).toBe("<p>Testo</p>");
    expect(item.question.testcases).toEqual([]);
    expect(item.specific[0].stdin).toBe("5\n10");
    expect(item.commonExpected).toEqual({
      [reopened.common[0].id]: "out 0",
      [reopened.common[2].id]: "out 2",
    });
  });

  it("andata e ritorno senza perdite", () => {
    const archived = toArchive(openTrack());
    expect(toArchive(fromArchive(archived))).toEqual(archived);
  });
});
