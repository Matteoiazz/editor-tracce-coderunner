// Regole dell'esame: creazione degli esercizi, numerazione, adattamento degli importati.

import { buildName, type ExamInfo, type ExamKind, parseName } from "./naming";
import type { Question } from "./types";

export interface EditableQuestion {
  id: string; // identificativo interno dell'interfaccia, non esportato
  question: Question;
  number: number | null;
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
  items: EditableQuestion[];
  /** Avviso per il docente, se gli esercizi sono stati adattati all'esame corrente. */
  notice: string | null;
}

/** Adatta gli esercizi importati all'esame corrente.
 *  - i campi vuoti dell'esame vengono compilati con i dati ricavati dai nomi importati;
 *  - se un numero è mancante o già usato, l'esercizio prende il primo numero libero. */
export function adoptImported(
  imported: Question[],
  current: EditableQuestion[],
  exam: ExamInfo,
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

  const taken = new Set(current.map((it) => it.number).filter((n): n is number => n !== null));
  const items = parsed.map(({ question, parts }) => {
    let number = parts.number;
    if (number === null || taken.has(number)) {
      number = Math.max(0, ...taken) + 1;
    }
    taken.add(number);
    return { id: crypto.randomUUID(), question, number };
  });

  return { exam: newExam, items, notice };
}
