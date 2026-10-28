import { describe, expect, it } from "vitest";
import {
  type ArchivedExercise,
  type ExerciseMatch,
  formatDay,
  fromArchive,
  reuseExercise,
  sameNameIds,
  sameNameTracks,
  sameTrackContent,
  type OpenTrack,
  toArchive,
  openTrackTitle,
  trackLabel,
  trackYears,
  tracksByYear,
  matchesByTrack,
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

describe("test comuni esclusi nell'archivio", () => {
  it("si salvano per posizione e si ritrovano dopo la riapertura", () => {
    const track = openTrack();
    track.items[0].excludedCommon = [track.common[1].id];

    const archived = toArchive(track);
    const reopened = fromArchive(archived);

    expect(archived.exercises[0].excluded_common).toEqual([1]);
    expect(reopened.items[0].excludedCommon).toEqual([reopened.common[1].id]);
  });

  it("una traccia salvata prima dell'esclusione usa tutti i test comuni", () => {
    const archived = toArchive(openTrack());
    delete archived.exercises[0].excluded_common;

    expect(fromArchive(archived).items[0].excludedCommon).toEqual([]);
  });

  it("un test comune eliminato dalla traccia sparisce anche dalle esclusioni", () => {
    const track = openTrack();
    track.items[0].excludedCommon = [track.common[2].id];
    track.common = track.common.slice(0, 2);

    expect(toArchive(track).exercises[0].excluded_common).toEqual([]);
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

describe("sameTrackContent", () => {
  it("non contano gli identificativi interni né l'ordine dei campi", () => {
    const original = openTrack();
    // Come la traccia letta dall'archivio: campi della domanda in un altro ordine
    const reordered = toArchive(original);
    reordered.exercises[0].question = Object.fromEntries(
      Object.entries(reordered.exercises[0].question).reverse(),
    ) as ArchivedExercise["question"];

    expect(sameTrackContent(original, fromArchive(reordered))).toBe(true);
  });

  it("una modifica qualsiasi conta", () => {
    const original = openTrack();
    const changed = fromArchive(toArchive(original));
    changed.items[0].question.solution += "\n# altro";
    expect(sameTrackContent(original, changed)).toBe(false);
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

describe("tracce con lo stesso nome", () => {
  const track = (id: string, day: string | null, number: number | null = 1): TrackSummary => ({
    id,
    kind: "Esame",
    day,
    number,
    exercise_count: 2,
    updated_at: "2026-10-03T10:00:00Z",
    exported_at: null,
    deleted_at: null,
  });
  const tracks = [track("a", "2026-07-03"), track("b", "2026-07-03"), track("c", "2026-07-03", 2)];

  it("trova le altre tracce con tipo, data e numero della traccia aperta", () => {
    expect(sameNameTracks({ ...exam, track: 1 }, "a", tracks).map((t) => t.id)).toEqual(["b"]);
    expect(sameNameTracks({ ...exam, track: 2 }, "x", tracks).map((t) => t.id)).toEqual(["c"]);
    // La traccia aperta non conta: c è l'unica con il numero 2
    expect(sameNameTracks({ ...exam, track: 2 }, "c", tracks)).toEqual([]);
    expect(sameNameTracks({ ...exam, kind: "Pretest", track: 1 }, "x", tracks)).toEqual([]);
  });

  it("non segnala nulla finché la traccia aperta non ha data, tipo e numero", () => {
    expect(sameNameTracks({ ...exam, date: "", track: 1 }, "x", [track("a", null)])).toEqual([]);
  });

  it("indica nell'elenco le tracce che hanno lo stesso nome di un'altra", () => {
    expect(sameNameIds([...tracks, track("d", null), track("e", null)])).toEqual(new Set(["a", "b"]));
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
    const { item } = reuseExercise(source(false), sourceCommon, items, exam, []);
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

  it("adotta i test comuni se la traccia è ancora vuota", () => {
    const { item, common } = reuseExercise(source(), sourceCommon, [], exam, []);
    expect(common?.map((r) => r.stdin)).toEqual(sourceCommon.map((t) => t.stdin));
    expect(common?.every((r) => r.expected === "")).toBe(true);
    expect(Object.values(item.commonExpected)).toEqual(["out 0", "out 1"]);
  });

  it("non adotta i test comuni se la traccia ha già esercizi", () => {
    const items = [createQuestion(1, exam)];
    const { item, common } = reuseExercise(source(), sourceCommon, items, exam, []);
    expect(common).toBeNull();
    expect(item.useCommon).toBe(false);
    expect(item.specific.map((r) => r.expected)).toEqual(["out 0", "out 1", "spec"]);
  });

  it("con test comuni diversi li trasforma in test specifici con i loro output", () => {
    const other = standardCommonTests().slice(3, 6);
    const { item, common } = reuseExercise(source(), sourceCommon, [], exam, other);
    expect(common).toBeNull();
    expect(item.useCommon).toBe(false);
    expect(item.specific.map((r) => r.expected)).toEqual(["out 0", "out 1", "spec"]);
  });

  it("con gli stessi test comuni mantiene le esclusioni", () => {
    const common = standardCommonTests().slice(0, 2);
    const { item } = reuseExercise({ ...source(), excluded_common: [1] }, sourceCommon, [], exam, common);
    expect(item.excludedCommon).toEqual([common[1].id]);
  });

  it("adottando i test comuni mantiene le esclusioni", () => {
    const { item, common } = reuseExercise({ ...source(), excluded_common: [0] }, sourceCommon, [], exam, []);
    expect(item.excludedCommon).toEqual([common![0].id]);
  });

  it("con test comuni diversi trasforma in specifici solo quelli usati", () => {
    const other = standardCommonTests().slice(3, 6);
    const { item } = reuseExercise({ ...source(), excluded_common: [0] }, sourceCommon, [], exam, other);
    expect(item.excludedCommon).toEqual([]);
    expect(item.specific.map((r) => r.expected)).toEqual(["out 1", "spec"]);
  });

  it("un esercizio senza test comuni resta senza", () => {
    const { item } = reuseExercise(source(false), sourceCommon, [], exam, []);
    expect(item.useCommon).toBe(false);
    expect(item.specific).toHaveLength(1);
  });
});

describe("reuseExercise da una traccia di altro tipo", () => {
  it("un esercizio del pretest copiato in un esame ne prende punti e tag", () => {
    const { question } = createQuestion(1, { date: "2026-07-03", kind: "Pretest", track: 1 });
    const fromPretest: ArchivedExercise = {
      number: 1,
      use_common: false,
      common_expected: [],
      question: { ...question, default_grade: 1, tags: ["Pretest", "liste"] },
    };

    const { item } = reuseExercise(fromPretest, [], [], exam, [], "Pretest");

    expect(item.question.default_grade).toBe(5);
    expect(item.question.tags).toEqual(["Esame", "liste"]);
  });
});

describe("nome della traccia aperta", () => {
  it("nuova finché non ha tipo né data", () => {
    expect(openTrackTitle({ kind: null, date: "", track: 1 })).toBe("nuova");
  });

  it("altrimenti come nell'archivio", () => {
    expect(openTrackTitle({ kind: "Esame", date: "2027-02-14", track: 2 })).toBe(
      trackLabel({ kind: "Esame", day: "2027-02-14", number: 2 }),
    );
    expect(openTrackTitle({ kind: "Pretest", date: "", track: null })).toBe(
      "Pretest · senza data · traccia senza numero",
    );
  });
});

describe("raggruppamenti dell'archivio", () => {
  const track = (id: string, day: string | null) =>
    ({ id, kind: "Esame", day, number: 1, exercise_count: 1, updated_at: "", exported_at: null, deleted_at: null }) as TrackSummary;

  it("tracce per anno, quelle senza data in fondo", () => {
    const groups = tracksByYear([track("a", "2026-07-03"), track("b", null), track("c", "2027-02-14"), track("d", "2026-01-10")]);
    expect(groups.map((g) => [g.label, g.tracks.map((t) => t.id)])).toEqual([
      ["2027", ["c"]],
      ["2026", ["a", "d"]],
      ["Senza data", ["b"]],
    ]);
  });

  it("esercizi per traccia, nell'ordine dei risultati", () => {
    const match = (track_id: string, position: number) => ({ track_id, position }) as ExerciseMatch;
    const groups = matchesByTrack([match("t1", 0), match("t2", 0), match("t1", 1)]);
    expect(groups.map((g) => g.map((m) => `${m.track_id}/${m.position}`))).toEqual([["t1/0", "t1/1"], ["t2/0"]]);
  });
});
