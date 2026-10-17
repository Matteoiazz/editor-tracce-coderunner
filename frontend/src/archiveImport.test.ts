import { describe, expect, it } from "vitest";
import type { ImportResult } from "./api";
import type { ArchivedTrack, TrackSummary } from "./archive";
import { importIntoArchive, importReportMessage } from "./archiveImport";
import { createQuestion } from "./exam";
import { EMPTY_EXAM } from "./naming";

function question(name: string) {
  return { ...createQuestion(1, EMPTY_EXAM).question, name };
}

/** Finto backend: ogni file contiene i nomi degli esercizi separati da virgola. */
function fakeDeps() {
  const saved: ArchivedTrack[] = [];
  return {
    saved,
    deps: {
      importXml: async (xml: string): Promise<ImportResult> => {
        if (xml === "rotto") throw new Error("non è un XML valido");
        const [names, ignored] = xml.split("|");
        return {
          questions: names.split(",").map(question),
          ignored: ignored ? { multichoice: Number(ignored) } : {},
        };
      },
      saveTrack: async (track: ArchivedTrack) => {
        saved.push(track);
      },
    },
  };
}

const summary = (kind: "Esame" | "Pretest", day: string, number: number): TrackSummary => ({
  id: `${kind}${day}${number}`,
  kind,
  day,
  number,
  exercise_count: 1,
  updated_at: "2026-10-03T10:00:00Z",
  exported_at: null,
  deleted_at: null,
});

describe("importIntoArchive", () => {
  it("raggruppa per tipo, data e traccia, anche da file diversi", async () => {
    const { saved, deps } = fakeDeps();
    const files = [
      {
        path: "C:\\esami\\a.xml",
        content:
          "Esame-2026-07-03 - Traccia 1 - Esercizio 1,Esame-2026-07-03 - Traccia 2 - Esercizio 1",
      },
      { path: "b.xml", content: "Esame-2026-07-03 - Traccia 1 - Esercizio 2|2" },
      { path: "c.xml", content: "2026-07 - Esercizio pretest 1" },
    ];

    const report = await importIntoArchive(files, [], deps);

    expect(report).toMatchObject({ files: 3, tracks: 3, exercises: 4, ignored: 2 });
    const tracks = saved.map((t) => [t.kind, t.day, t.number, t.exercises.length]);
    expect(tracks).toEqual([
      ["Esame", "2026-07-03", 1, 2],
      ["Esame", "2026-07-03", 2, 1],
      ["Pretest", null, 1, 1],
    ]);
    expect(saved[0].exercises.map((e) => e.number)).toEqual([1, 2]);
  });

  it("salta le tracce già presenti e segnala i file non validi", async () => {
    const { saved, deps } = fakeDeps();
    const files = [
      { path: "a.xml", content: "Esame-2026-07-03-Traccia1-Esercizio1" },
      { path: "C:\\esami\\rotto.xml", content: "rotto" },
    ];

    const report = await importIntoArchive(files, [summary("Esame", "2026-07-03", 1)], deps);

    expect(saved).toHaveLength(0);
    expect(report.skipped).toEqual(["Esame · 3 luglio 2026 · Traccia 1"]);
    expect(report.failed).toEqual(["rotto.xml: non è un XML valido"]);
  });

  it("importa le tracce senza data e quelle che in archivio sono vuote", async () => {
    const { saved, deps } = fakeDeps();
    const files = [
      { path: "a.xml", content: "2026-07 - Esercizio pretest 1" },
      { path: "b.xml", content: "Esame-2026-07-03-Traccia1-Esercizio1" },
    ];
    const undated = { ...summary("Pretest", "", 1), day: null };
    const empty = { ...summary("Esame", "2026-07-03", 1), exercise_count: 0 };

    const report = await importIntoArchive(files, [undated, empty], deps);

    expect(report.skipped).toEqual([]);
    expect(saved.map((t) => [t.kind, t.day])).toEqual([
      ["Pretest", null],
      ["Esame", "2026-07-03"],
    ]);
  });
});

describe("importReportMessage", () => {
  it("riassume tracce, doppioni, domande ignorate e file non letti", () => {
    const message = importReportMessage({
      files: 2,
      tracks: 1,
      exercises: 3,
      skipped: ["Esame · 3 luglio 2026 · Traccia 1"],
      failed: ["rotto.xml: non è un XML valido"],
      ignored: 1,
    });
    expect(message).toBe(
      [
        "Letti 2 file: aggiunte all'archivio 1 traccia con 3 esercizi.",
        "Già presenti nell'archivio, non importate di nuovo: Esame · 3 luglio 2026 · Traccia 1.",
        "Ignorata 1 domanda che non è di tipo CodeRunner.",
        "File non letti: rotto.xml: non è un XML valido",
      ].join("\n"),
    );
  });
});
