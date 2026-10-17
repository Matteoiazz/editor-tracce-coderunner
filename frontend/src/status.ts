// Stato degli esercizi per la colonna laterale e l'indice delle sezioni:
// esiti della verifica, puntini dei test, stato di ogni sezione, riepilogo dell'esame.

import { type EditableQuestion, unsupportedReason } from "./exam";
import { hasText, isSkeletonSolution, normalizeCode } from "./export";
import {
  composeTests,
  inputLineCount,
  outcomesById,
  requiredInputLines,
  type TestRow,
} from "./testcases";
import type { TestOutcome } from "./types";

/** Esiti dell'ultima verifica di un esercizio. */
export interface VerifyRecord {
  /** Soluzione e test al momento della verifica: se cambiano, gli esiti non valgono più. */
  signature: string;
  outcomes: Record<string, TestOutcome>;
  /** Esiti arrivati mentre l'esercizio non era aperto: restano evidenziati finché non viene aperto. */
  unseen: boolean;
}

export function testsSignature(solution: string, rows: TestRow[]): string {
  return JSON.stringify([solution, rows.map((row) => [row.id, row.stdin, row.expected])]);
}

export function makeRecord(
  solution: string,
  rows: TestRow[],
  outcomes: TestOutcome[],
  unseen: boolean,
): VerifyRecord {
  return { signature: testsSignature(solution, rows), outcomes: outcomesById(rows, outcomes), unseen };
}

/** Esiti ancora validi per la soluzione e i test attuali, altrimenti null. */
export function validOutcomes(
  record: VerifyRecord | undefined,
  solution: string,
  rows: TestRow[],
): Record<string, TestOutcome> | null {
  return record && record.signature === testsSignature(solution, rows) ? record.outcomes : null;
}

/** Stato di un singolo test, dal meno al più avanzato. */
export type TestState = "pending" | "unverified" | "passed" | "failed";

export const TEST_STATE_LABEL: Record<TestState, string> = {
  pending: "da calcolare",
  unverified: "da verificare",
  passed: "superato",
  failed: "fallito",
};

export function testStates(
  rows: TestRow[],
  outcomes: Record<string, TestOutcome> | null,
): TestState[] {
  return rows.map((row) => {
    const outcome = outcomes?.[row.id];
    if (outcome) return outcome.passed ? "passed" : "failed";
    return row.expected ? "unverified" : "pending";
  });
}

/** Stato di una sezione dell'esercizio. */
export type SectionState = "done" | "todo" | "warning" | "error";

export interface SectionStatus {
  state: SectionState;
  /** Spiegazione breve, mostrata come suggerimento. */
  note: string;
}

export interface ExerciseStatus {
  rows: TestRow[];
  tests: TestState[];
  passed: number;
  failed: number;
  pending: number;
  unverified: number;
  unsupported: string | null;
  sections: {
    text: SectionStatus;
    solution: SectionStatus;
    studentCode: SectionStatus;
    tests: SectionStatus;
  };
  /** Pronto per l'esportazione, verifica compresa. */
  ready: boolean;
}

function section(state: SectionState, note: string): SectionStatus {
  return { state, note };
}

export function exerciseStatus(
  item: EditableQuestion,
  common: TestRow[],
  record: VerifyRecord | undefined,
): ExerciseStatus {
  const { question } = item;
  const rows = composeTests(common, item.useCommon, item.commonExpected, item.specific);
  const tests = testStates(rows, validOutcomes(record, question.solution, rows));
  const count = (state: TestState) => tests.filter((t) => t === state).length;
  const passed = count("passed");
  const failed = count("failed");
  const pending = count("pending");
  const unverified = count("unverified");
  const unsupported = unsupportedReason(question, rows);

  const required = requiredInputLines(question.solution);
  const shortInputs = unsupported ? 0 : rows.filter((r) => inputLineCount(r.stdin) < required).length;

  const text = hasText(question.text_html)
    ? section("done", "Testo presente")
    : section("todo", "Scrivi il testo della traccia");
  const solution = !question.solution.trim()
    ? section("todo", "Scrivi la soluzione")
    : isSkeletonSolution(question.solution)
      ? section("todo", "Sostituisci la soluzione di partenza con quella vera")
      : section("done", "Soluzione presente");
  const studentCode = !question.student_code.trim()
    ? section("todo", "Genera il codice dalla soluzione")
    : normalizeCode(question.student_code) === normalizeCode(question.solution)
      ? section("error", "Uguale alla soluzione: gli studenti la vedrebbero")
      : section("done", "Codice per gli studenti presente");

  let testsSection: SectionStatus;
  if (rows.length === 0) testsSection = section("todo", "Aggiungi almeno un test");
  else if (shortInputs > 0) testsSection = section("error", `${shortInputs} test con valori di input mancanti`);
  else if (unsupported) testsSection = section("warning", "Non eseguibile dall'applicazione");
  else if (failed > 0) testsSection = section("error", `${failed} test falliti`);
  else if (pending > 0) testsSection = section("warning", `${pending} test da calcolare`);
  else if (unverified > 0) testsSection = section("warning", "Da verificare");
  else testsSection = section("done", `${passed} test superati`);

  const sections = { text, solution, studentCode, tests: testsSection };
  const structural = [text, solution, studentCode].every((s) => s.state === "done");
  const testsReady = unsupported ? pending === 0 && shortInputs === 0 : testsSection.state === "done";
  return {
    rows,
    tests,
    passed,
    failed,
    pending,
    unverified,
    unsupported,
    sections,
    ready: structural && testsReady && rows.length > 0,
  };
}

export interface ExamSummary {
  exercises: number;
  ready: number;
  tests: number;
  passed: number;
  failed: number;
}

export function examSummary(statuses: ExerciseStatus[]): ExamSummary {
  return {
    exercises: statuses.length,
    ready: statuses.filter((s) => s.ready).length,
    tests: statuses.reduce((n, s) => n + s.rows.length, 0),
    passed: statuses.reduce((n, s) => n + s.passed, 0),
    failed: statuses.reduce((n, s) => n + s.failed, 0),
  };
}
