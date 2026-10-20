// Conversione tra la traccia aperta nell'interfaccia e la forma salvata nell'archivio
// (tesi.domain.track nel backend). Gli identificativi dei test servono solo all'interfaccia:
// nell'archivio gli output dei test comuni sono salvati nello stesso ordine dei test.

import { adaptQuestionToKind, type EditableQuestion, isExamComplete, nextNumber } from "./exam";
import { buildName, type ExamInfo, type ExamKind, formatDay } from "./naming";

export { formatDay };
import { sameTest, type TestRow, toRow, toTestCase } from "./testcases";
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

/** Altre tracce dell'archivio con tipo, data e numero della traccia aperta: su Moodle i loro
 *  esercizi avrebbero gli stessi nomi (succede con una traccia duplicata e non modificata). */
export function sameNameTracks(
  exam: ExamInfo,
  trackId: string,
  tracks: TrackSummary[],
): TrackSummary[] {
  if (!isExamComplete(exam)) return [];
  return tracks.filter(
    (t) => t.id !== trackId && t.kind === exam.kind && t.day === exam.date && t.number === exam.track,
  );
}

/** Tracce dell'elenco che hanno lo stesso tipo, data e numero di un'altra. */
export function sameNameIds(tracks: TrackSummary[]): Set<string> {
  const byName = new Map<string, string[]>();
  for (const t of tracks) {
    if (t.kind === null || t.day === null || t.number === null) continue;
    const key = `${t.kind}|${t.day}|${t.number}`;
    byName.set(key, [...(byName.get(key) ?? []), t.id]);
  }
  return new Set([...byName.values()].filter((ids) => ids.length > 1).flat());
}

/** Anni presenti nelle tracce, dal più recente. */
export function trackYears(tracks: TrackSummary[]): number[] {
  const years = new Set(tracks.flatMap((t) => (t.day ? [Number(t.day.slice(0, 4))] : [])));
  return [...years].sort((a, b) => b - a);
}

/** Esercizio trovato nell'archivio (tesi.domain.track.ExerciseMatch). */
export interface ExerciseMatch {
  track_id: string;
  position: number;
  track_kind: ExamKind | null;
  track_day: string | null;
  track_number: number | null;
  number: number | null;
  name: string;
  tags: string[];
  text: string; // testo senza formattazione
}

export interface ReusedExercise {
  item: EditableQuestion;
  /** Test comuni da adottare per la traccia, se finora non ne aveva. */
  common: TestRow[] | null;
}

/** Copia nella traccia aperta un esercizio di un'altra traccia, con il numero successivo.
 *  Da una traccia di altro tipo (es. dal pretest a un esame) prende punti e tag del tipo corrente.
 *  I test comuni dell'esercizio di provenienza:
 *  - se la traccia ha gli stessi test comuni, l'esercizio li usa con i propri output;
 *  - se la traccia è ancora vuota (né test comuni né esercizi), li adotta;
 *  - altrimenti diventano test specifici dell'esercizio, con i loro output: adottarli
 *    li aggiungerebbe anche agli altri esercizi della traccia. */
export function reuseExercise(
  source: ArchivedExercise,
  sourceCommon: TestCase[],
  items: EditableQuestion[],
  exam: ExamInfo,
  common: TestRow[],
  sourceKind: ExamKind | null = null,
): ReusedExercise {
  const number = nextNumber(items);
  const specific = source.question.testcases.map(toRow);
  const question = {
    ...source.question,
    name: buildName(number, exam) ?? source.question.name,
    testcases: [],
    tags: [...source.question.tags],
    settings: { ...source.question.settings },
  };
  const base = {
    id: crypto.randomUUID(),
    number,
    question: adaptQuestionToKind(question, sourceKind, exam.kind),
  };
  const expectedFor = (rows: TestRow[]) =>
    Object.fromEntries(
      rows.flatMap((row, i) => (source.common_expected[i] ? [[row.id, source.common_expected[i]]] : [])),
    );

  if (!source.use_common || sourceCommon.length === 0) {
    return { item: { ...base, useCommon: false, commonExpected: {}, specific }, common: null };
  }
  const same =
    common.length === sourceCommon.length && common.every((row, i) => sameTest(row, sourceCommon[i]));
  if (same) {
    return {
      item: { ...base, useCommon: true, commonExpected: expectedFor(common), specific },
      common: null,
    };
  }
  if (common.length === 0 && items.length === 0) {
    const adopted = sourceCommon.map((test) => ({ ...toRow(test), expected: "" }));
    return {
      item: { ...base, useCommon: true, commonExpected: expectedFor(adopted), specific },
      common: adopted,
    };
  }
  const fromCommon = sourceCommon.map((test, i) => ({
    ...toRow(test),
    expected: source.common_expected[i] ?? "",
  }));
  return {
    item: { ...base, useCommon: false, commonExpected: {}, specific: [...fromCommon, ...specific] },
    common: null,
  };
}
