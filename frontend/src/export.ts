// Preparazione degli esercizi per l'esportazione in XML Moodle e controlli preliminari.

import {
  duplicateNumbers,
  type EditableQuestion,
  exerciseTests,
  isValidGrade,
  questionName,
  shortLabel,
  SOLUTION_SKELETON,
  unsupportedReason,
} from "./exam";
import type { ExamInfo } from "./naming";
import {
  inputLineCount,
  missingInputMessage,
  requiredInputLines,
  type TestRow,
  toTestCase,
} from "./testcases";
import type { Question } from "./types";

/** Nome proposto per il file, es. "Esame-2026-10-15-Traccia1.xml". */
export function exportFileName(exam: ExamInfo): string {
  return exam.kind && exam.date && exam.track !== null
    ? `${exam.kind}-${exam.date}-Traccia${exam.track}.xml`
    : "esercizi.xml";
}

export function sortedByNumber(items: EditableQuestion[]): EditableQuestion[] {
  return [...items].sort(
    (a, b) => (a.number ?? Number.POSITIVE_INFINITY) - (b.number ?? Number.POSITIVE_INFINITY),
  );
}

/** Esercizio nella forma attesa dal backend: nome secondo la convenzione e test
 *  nell'ordine di Moodle (comuni con gli output di questo esercizio, poi specifici).
 *  Gli esercizi senza tag ricevono il tag del tipo di esame. */
export function prepareQuestion(
  item: EditableQuestion,
  exam: ExamInfo,
  common: TestRow[],
): Question {
  const tests = exerciseTests(item, common);
  const tags = item.question.tags.length === 0 && exam.kind ? [exam.kind] : item.question.tags;
  return {
    ...item.question,
    name: questionName(item, exam),
    testcases: tests.map(toTestCase),
    tags,
  };
}

export function hasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

export function normalizeCode(code: string): string {
  return code
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/** Vero se la soluzione è ancora quella di partenza di un esercizio nuovo, non modificata. */
export function isSkeletonSolution(solution: string): boolean {
  return normalizeCode(solution) === normalizeCode(SOLUTION_SKELETON);
}

/** Problema che impedisce l'esportazione. Se riguarda un esercizio, `item` è l'esercizio e
 *  `issue` la descrizione senza il nome (due esercizi possono avere lo stesso nome). */
export interface ExportProblem {
  text: string;
  item?: EditableQuestion;
  issue?: string;
  /** Forma breve del problema per l'elenco della colonna, es. "testo vuoto". */
  short?: string;
}

/** Problemi che impediscono l'esportazione; lista vuota se si può esportare. */
export function exportProblems(
  items: EditableQuestion[],
  exam: ExamInfo,
  common: TestRow[],
): string[] {
  return exportProblemList(items, exam, common).map((problem) => problem.text);
}

/** Come exportProblems, con l'esercizio a cui si riferisce ogni problema. */
export function exportProblemList(
  items: EditableQuestion[],
  exam: ExamInfo,
  common: TestRow[],
): ExportProblem[] {
  const problems: ExportProblem[] = [];
  const general = (text: string) => problems.push({ text });
  if (!exam.date) general("Esame: manca la data");
  if (!exam.kind) general("Esame: manca il tipo (Esame o Pretest)");
  if (exam.track === null) general("Esame: manca il numero della traccia");
  if (items.length === 0) general("Nessun esercizio da esportare");
  const pretest = exam.kind === "Pretest";
  if (pretest && items.length > 1) {
    general(`Il pretest ha un solo esercizio: ce ne sono ${items.length}, rimuovi quelli in più`);
  }

  const duplicates = pretest ? [] : [...duplicateNumbers(items)].sort((a, b) => a - b);
  if (duplicates.length) {
    general(`Numeri usati da più esercizi: ${duplicates.join(", ")}`);
  }

  for (const item of sortedByNumber(items)) {
    const { question } = item;
    // Per ogni problema: descrizione completa e forma breve
    const issues: [string, string][] = [];
    if (item.number === null && !pretest) issues.push(["manca il numero", "manca il numero"]);
    if (!isValidGrade(question.default_grade)) {
      issues.push(["i punti devono essere maggiori di 0", "punti non validi"]);
    }
    if (!hasText(question.text_html)) issues.push(["il testo è vuoto", "testo vuoto"]);
    if (!question.solution.trim()) issues.push(["la soluzione è vuota", "soluzione vuota"]);
    else if (isSkeletonSolution(question.solution)) {
      issues.push([
        "la soluzione è ancora quella di partenza: scrivi la soluzione vera",
        "soluzione da scrivere",
      ]);
    }
    if (!question.student_code.trim()) {
      issues.push([
        "il codice per gli studenti è vuoto (premi «Genera dalla soluzione»)",
        "codice studenti da generare",
      ]);
    } else if (normalizeCode(question.student_code) === normalizeCode(question.solution)) {
      issues.push([
        "il codice per gli studenti è uguale alla soluzione (premi «Genera dalla soluzione»)",
        "codice studenti uguale alla soluzione",
      ]);
    }
    const tests = exerciseTests(item, common);
    const missing = tests.filter((test) => !test.expected).length;
    if (tests.length === 0) issues.push(["nessun test", "nessun test"]);
    else if (missing > 0) {
      issues.push([
        `${missing} test senza output atteso (premi «Calcola output»)`,
        `${missing} output da calcolare`,
      ]);
    }
    if (!unsupportedReason(question, tests)) {
      const required = requiredInputLines(question.solution);
      const short = tests.flatMap((test, i) => (inputLineCount(test.stdin) < required ? [i + 1] : []));
      const message = missingInputMessage(short, required);
      if (message) issues.push([message, "input dei test incompleti"]);
    }
    const name = questionName(item, exam);
    problems.push(
      ...issues.map(([issue, short]) => ({ text: `${name}: ${issue}`, item, issue, short })),
    );
  }
  return problems;
}

/** Problema che blocca l'esportazione come lo mostra la colonna; con exerciseId porta
 *  all'esercizio. */
export interface Blocker {
  text: string;
  /** Descrizione completa, mostrata al passaggio del mouse. */
  title?: string;
  exerciseId?: string;
}

/** Problemi che bloccano l'esportazione, in poche righe: prima quelli della traccia (con
 *  `general`, es. un'altra traccia con lo stesso nome), poi una riga per esercizio con i suoi
 *  problemi in forma breve, es. "Esercizio 3: testo vuoto, nessun test". Così l'elenco non
 *  toglie spazio agli esercizi nella colonna. `failed`: test falliti nell'ultima verifica,
 *  per esercizio. */
export function exportBlockers(
  items: EditableQuestion[],
  exam: ExamInfo,
  common: TestRow[],
  failed: Record<string, number>,
  general: string[] = [],
): Blocker[] {
  const problems = exportProblemList(items, exam, common);
  const blockers: Blocker[] = [
    ...problems.filter((p) => !p.item).map((p) => ({ text: p.text })),
    ...general.map((text) => ({ text })),
  ];
  for (const item of sortedByNumber(items)) {
    const issues = problems
      .filter((p) => p.item?.id === item.id)
      .map((p) => ({ issue: p.issue!, short: p.short! }));
    const count = failed[item.id] ?? 0;
    if (count > 0) {
      const text = count === 1 ? "1 test fallito" : `${count} test falliti`;
      issues.push({ issue: text, short: text });
    }
    if (issues.length === 0) continue;
    const name = questionName(item, exam);
    blockers.push({
      text: `${shortLabel(item, exam)}: ${issues.map((i) => i.short).join(", ")}`,
      title: issues.map((i) => `${name}: ${i.issue}`).join("\n"),
      exerciseId: item.id,
    });
  }
  return blockers;
}
