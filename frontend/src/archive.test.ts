import { describe, expect, it } from "vitest";
import {
  type ArchivedExercise,
  formatDay,
  fromArchive,
  reuseExercise,
  type OpenTrack,
  toArchive,
  trackLabel,
  trackYears,
  type TrackSummary,
} from "./archive";
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

describe("etichette dell'archivio", () => {
  const summary = (day: string | null): TrackSummary => ({
    id: day ?? "x",
    kind: "Esame",
    day,
    number: 1,
    exercise_count: 2,
    updated_at: "2026-10-03T10:00:00Z",
    exported_at: null,
    deleted_at: null,
  });

  it("data estesa in italiano", () => {
    expect(formatDay("2026-07-03")).toBe("3 luglio 2026");
    expect(formatDay(null)).toBeNull();
  });

  it("nome della traccia, anche con dati mancanti", () => {
    expect(trackLabel({ kind: "Esame", day: "2026-07-03", number: 1 })).toBe(
      "Esame · 3 luglio 2026 · Traccia 1",
    );
    expect(trackLabel({ kind: null, day: null, number: null })).toBe(
      "Tipo non indicato · senza data · traccia senza numero",
    );
  });

  it("anni presenti, dal più recente e senza doppioni", () => {
    const tracks = [summary("2025-02-01"), summary(null), summary("2026-07-03"), summary("2026-09-30")];
    expect(trackYears(tracks)).toEqual([2026, 2025]);
  });
});

describe("reuseExercise", () => {
  const sourceCommon = standardCommonTests().slice(0, 2).map(({ id: _id, ...test }) => test);

  function source(useCommon = true): ArchivedExercise {
    const { question } = createQuestion(4, { date: "2025-01-20", kind: "Esame", track: 1 });
    return {
      number: 4,
      use_common: useCommon,
      common_expected: ["out 0", "out 1"],
      question: {
        ...question,
        text_html: "<p>Vecchio</p>",
        tags: ["liste"],
        testcases: [{ ...newRow("9 9"), expected: "spec" }].map(({ id: _id, ...t }) => t),
      },
    };
  }

  it("prende il numero successivo e il nome della traccia aperta", () => {
    const items = [createQuestion(1, exam), createQuestion(2, exam)];
    const { item } = reuseExercise(source(), sourceCommon, items, exam, []);
    expect(item.number).toBe(3);
    expect(item.question.name).toBe("Esame-2026-07-03-Traccia2-Esercizio3");
    expect(item.question.text_html).toBe("<p>Vecchio</p>");
    expect(item.specific.map((r) => r.expected)).toEqual(["spec"]);
  });

  it("usa i test comuni della traccia se sono gli stessi", () => {
    const common = standardCommonTests().slice(0, 2);
    const { item, common: adopted } = reuseExercise(source(), sourceCommon, [], exam, common);
    expect(adopted).toBeNull();
    expect(item.useCommon).toBe(true);
    expect(item.commonExpected).toEqual({ [common[0].id]: "out 0", [common[1].id]: "out 1" });
  });

  it("adotta i test comuni se la traccia non ne ha", () => {
    const { item, common } = reuseExercise(source(), sourceCommon, [], exam, []);
    expect(common?.map((r) => r.stdin)).toEqual(sourceCommon.map((t) => t.stdin));
    expect(common?.every((r) => r.expected === "")).toBe(true);
    expect(Object.values(item.commonExpected)).toEqual(["out 0", "out 1"]);
  });

  it("con test comuni diversi li trasforma in test specifici con i loro output", () => {
    const other = standardCommonTests().slice(3, 6);
    const { item, common } = reuseExercise(source(), sourceCommon, [], exam, other);
    expect(common).toBeNull();
    expect(item.useCommon).toBe(false);
    expect(item.specific.map((r) => r.expected)).toEqual(["out 0", "out 1", "spec"]);
  });

  it("un esercizio senza test comuni resta senza", () => {
    const { item } = reuseExercise(source(false), sourceCommon, [], exam, []);
    expect(item.useCommon).toBe(false);
    expect(item.specific).toHaveLength(1);
  });
});
