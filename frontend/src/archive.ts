// Conversione tra la traccia aperta nell'interfaccia e la forma salvata nell'archivio
// (tesi.domain.track nel backend). Gli identificativi dei test servono solo all'interfaccia:
// nell'archivio gli output dei test comuni sono salvati nello stesso ordine dei test.

import type { EditableQuestion } from "./exam";
import type { ExamInfo, ExamKind } from "./naming";
import { type TestRow, toRow, toTestCase } from "./testcases";
import type { Question, TestCase } from "./types";

export interface ArchivedExercise {
  question: Question; // in question.testcases ci sono solo i test specifici
  number: number | null;
  use_common: boolean;
  common_expected: string[];
}

export interface ArchivedTrack {
  id: string;
  kind: ExamKind | null;
  day: string | null; // "AAAA-MM-GG"
  number: number | null;
  common_tests: TestCase[];
  exercises: ArchivedExercise[];
  created_at?: string | null;
  updated_at?: string | null;
  exported_at?: string | null;
  deleted_at?: string | null;
}

export interface TrackSummary {
  id: string;
  kind: ExamKind | null;
  day: string | null;
  number: number | null;
  exercise_count: number;
  updated_at: string;
  exported_at: string | null;
  deleted_at: string | null;
}

/** Traccia così come la usa l'interfaccia. */
export interface OpenTrack {
  id: string;
  exam: ExamInfo;
  common: TestRow[];
  items: EditableQuestion[];
}

export function toArchive({ id, exam, common, items }: OpenTrack): ArchivedTrack {
  return {
    id,
    kind: exam.kind,
    day: exam.date || null,
    number: exam.track,
    common_tests: common.map((row) => ({ ...toTestCase(row), expected: "" })),
    exercises: items.map((item) => ({
      number: item.number,
      use_common: item.useCommon,
      common_expected: common.map((row) => item.commonExpected[row.id] ?? ""),
      question: { ...item.question, testcases: item.specific.map(toTestCase) },
    })),
  };
}

export function fromArchive(track: ArchivedTrack): OpenTrack {
  const common = track.common_tests.map(toRow);
  return {
    id: track.id,
    exam: { date: track.day ?? "", kind: track.kind, track: track.number },
    common,
    items: track.exercises.map((exercise) => ({
      id: crypto.randomUUID(),
      number: exercise.number,
      useCommon: exercise.use_common,
      // Un output vuoto significa "da calcolare": non viene riportato
      commonExpected: Object.fromEntries(
        common.flatMap((row, i) =>
          exercise.common_expected[i] ? [[row.id, exercise.common_expected[i]]] : [],
        ),
      ),
      specific: exercise.question.testcases.map(toRow),
      question: { ...exercise.question, testcases: [] },
    })),
  };
}

/** Data in forma estesa, es. "3 luglio 2026"; null se assente. */
export function formatDay(day: string | null): string | null {
  if (!day) return null;
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Data e ora brevi, es. "3 ott 2026, 16:55". */
export function formatMoment(moment: string): string {
  return new Date(moment).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Nome della traccia nell'elenco, es. "Esame · 3 luglio 2026 · Traccia 1". */
export function trackLabel(track: Pick<TrackSummary, "kind" | "day" | "number">): string {
  return [
    track.kind ?? "Tipo non indicato",
    formatDay(track.day) ?? "senza data",
    track.number !== null ? `Traccia ${track.number}` : "traccia senza numero",
  ].join(" · ");
}

/** Anni presenti nelle tracce, dal più recente. */
export function trackYears(tracks: TrackSummary[]): number[] {
  const years = new Set(tracks.flatMap((t) => (t.day ? [Number(t.day.slice(0, 4))] : [])));
  return [...years].sort((a, b) => b - a);
}
