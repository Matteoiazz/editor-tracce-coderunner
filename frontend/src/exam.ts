// Regole dell'esame: creazione degli esercizi, numerazione, adattamento degli importati.

import { buildName, type ExamInfo, type ExamKind, parseName } from "./naming";
import { detectCommonBlock, startsWithBlock, type TestRow, toRow } from "./testcases";
import type { Question, TestCase } from "./types";

export interface EditableQuestion {
  id: string; // identificativo interno dell'interfaccia, non esportato
  question: Question; // i test sono in `specific` e nei test comuni, non in question.testcases
  number: number | null;
  useCommon: boolean;
  /** Output attesi dei test comuni per questo esercizio, per identificativo del test. */
  commonExpected: Record<string, string>;
  specific: TestRow[];
}

/** Codice di partenza della soluzione di un esercizio nuovo. */
export const SOLUTION_SKELETON = `def calcola(lst):
    # Inserisci qui la tua implementazione
    return None


if __name__ == "__main__":
    import random
    seed = int(input())
    random.seed(seed)
    n = int(input())
    lst = [random.randint(1, 10) for _ in range(n)]
    print(f"Input: {lst} - Risultato: {calcola(lst)}")
`;

export function isExamComplete(exam: ExamInfo): boolean {
  return Boolean(exam.date) && exam.kind !== null;
}

/** Punti predefiniti, come negli XML del docente. */
export function defaultGrade(kind: ExamKind | null): number {
  return kind === "Pretest" ? 1 : 5;
}

/** Nome dell'esercizio secondo la convenzione; se mancano dati resta il nome originale. */
export function questionName(item: EditableQuestion, exam: ExamInfo): string {
  return buildName(item.number, exam) ?? item.question.name;
}

/** Numero dell'esercizio dal campo di testo: solo cifre, intero da 1 in su; altrimenti null. */
export function parseExerciseNumber(text: string): number | null {
  const digits = text.replace(/\D/g, "");
  const number = digits ? Number.parseInt(digits, 10) : 0;
  return number >= 1 ? number : null;
}

export function isValidGrade(grade: number): boolean {
  return Number.isFinite(grade) && grade > 0;
}

export function nextNumber(items: EditableQuestion[]): number {
  const numbers = items.map((it) => it.number ?? 0);
  return Math.max(0, ...numbers) + 1;
}

/** Numeri usati da più di un esercizio (su Moodle avrebbero lo stesso nome). */
export function duplicateNumbers(items: EditableQuestion[]): Set<number> {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const { number } of items) {
    if (number === null) continue;
    if (seen.has(number)) duplicates.add(number);
    seen.add(number);
  }
  return duplicates;
}

export function createQuestion(number: number, exam: ExamInfo): EditableQuestion {
  return {
    id: crypto.randomUUID(),
    number,
    useCommon: true,
    commonExpected: {},
    specific: [],
    question: {
      name: buildName(number, exam) ?? `Esercizio${number}`,
      text_html: "",
      solution: SOLUTION_SKELETON,
      student_code: "",
      testcases: [],
      coderunner_type: "python3_w_input",
      default_grade: defaultGrade(exam.kind),
      general_feedback_html: "",
      tags: [],
      settings: {},
    },
  };
}

export interface ImportResult {
  exam: ExamInfo;
  common: TestRow[];
  items: EditableQuestion[];
  /** Avviso per il docente, se gli esercizi sono stati adattati all'esame corrente. */
  notice: string | null;
}

/** Adatta gli esercizi importati all'esame corrente.
 *  - i campi vuoti dell'esame vengono compilati con i dati ricavati dai nomi importati;
 *  - se un numero è mancante o già usato, l'esercizio prende il primo numero libero;
 *  - se non ci sono test comuni, si cerca un blocco iniziale condiviso dagli importati;
 *    gli esercizi che iniziano con i test comuni li usano, gli altri no. */
export function adoptImported(
  imported: Question[],
  current: EditableQuestion[],
  exam: ExamInfo,
  common: TestRow[],
): ImportResult {
  const parsed = imported.map((question) => ({ question, parts: parseName(question.name) }));

  const newExam: ExamInfo = {
    date: exam.date || (parsed.find((p) => p.parts.date)?.parts.date ?? ""),
    kind: exam.kind ?? parsed.find((p) => p.parts.kind)?.parts.kind ?? null,
  };

  const different = isExamComplete(exam)
    ? parsed.filter(
        ({ parts }) =>
          (parts.date && parts.date !== exam.date) || (parts.kind && parts.kind !== exam.kind),
      )
    : [];
  // Es. "Pretest", "Esame del 2026-07-03"
  const origins = [
    ...new Set(
      different.map(({ parts }) =>
        [parts.kind, parts.date && `del ${parts.date}`].filter(Boolean).join(" "),
      ),
    ),
  ];
  const notice = origins.length
    ? `Gli esercizi importati provenivano da un altro esame (${origins.join(", ")}): ` +
      "ora seguono l'esame corrente."
    : null;

  let newCommon = common;
  if (common.length === 0) {
    const detected = detectCommonBlock(imported.map((q) => q.testcases));
    if (detected) {
      newCommon = detected.block.map((test) => ({ ...toRow(test), expected: "" }));
    }
  }

  const taken = new Set(current.map((it) => it.number).filter((n): n is number => n !== null));
  const items = parsed.map(({ question, parts }): EditableQuestion => {
    let number = parts.number;
    if (number === null || taken.has(number)) {
      number = Math.max(0, ...taken) + 1;
    }
    taken.add(number);

    const useCommon = startsWithBlock(question.testcases, newCommon);
    const commonCount = useCommon ? newCommon.length : 0;
    return {
      id: crypto.randomUUID(),
      number,
      useCommon,
      commonExpected: Object.fromEntries(
        newCommon.slice(0, commonCount).map((row, i) => [row.id, question.testcases[i].expected]),
      ),
      specific: question.testcases.slice(commonCount).map(toRow),
      question: { ...question, testcases: [] },
    };
  });

  return { exam: newExam, common: newCommon, items, notice };
}

/** Tipo CodeRunner che l'esecutore dell'applicazione sa riprodurre. */
export const SUPPORTED_CODERUNNER_TYPE = "python3_w_input";

/** Motivo per cui l'applicazione non può eseguire i test dell'esercizio, oppure null.
 *  In questi casi Calcola output e Verifica darebbero risultati non affidabili. */
export function unsupportedReason(question: Question, tests: TestCase[]): string | null {
  if (question.coderunner_type !== SUPPORTED_CODERUNNER_TYPE) {
    return `tipo CodeRunner «${question.coderunner_type}» non supportato`;
  }
  if (tests.some((test) => test.testcode.trim())) {
    return "test con codice di prova (testcode) non supportati";
  }
  return null;
}

// Nomi leggibili dei tipi di domanda Moodle
const MOODLE_TYPE_NAMES: Record<string, string> = {
  multichoice: "scelta multipla",
  truefalse: "vero/falso",
  shortanswer: "risposta breve",
  numerical: "numerica",
  essay: "risposta aperta",
  matching: "corrispondenza",
  multianswer: "cloze",
  description: "descrizione",
  calculated: "calcolata",
  ddwtos: "trascina e rilascia",
  gapselect: "selezione nel testo",
};

/** Messaggio sulle domande non CodeRunner presenti nel file e non importate. */
export function ignoredMessage(ignored: Record<string, number>): string | null {
  const entries = Object.entries(ignored).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return null;
  const detail = entries
    .map(([type, count]) => `${count} ${MOODLE_TYPE_NAMES[type] ?? type}`)
    .join(", ");
  const noun = total === 1 ? "domanda che non è" : "domande che non sono";
  const verb = total === 1 ? "Ignorata" : "Ignorate";
  return `${verb} ${total} ${noun} di tipo CodeRunner (${detail}).`;
}
