// Regole dell'esame: creazione degli esercizi, numerazione, adattamento degli importati.

import { buildName, DEFAULT_TRACK, type ExamInfo, type ExamKind, formatDay, parseName } from "./naming";
import { plainText } from "./richtext";
import { composeTests, detectCommonBlock, startsWithBlock, type TestRow, toRow } from "./testcases";
import type { Question, TestCase } from "./types";

export interface EditableQuestion {
  id: string; // identificativo interno dell'interfaccia, non esportato
  question: Question; // i test sono in `specific` e nei test comuni, non in question.testcases
  number: number | null;
  useCommon: boolean;
  /** Output attesi dei test comuni per questo esercizio, per identificativo del test. */
  commonExpected: Record<string, string>;
  /** Test comuni che questo esercizio non usa, per identificativo. */
  excludedCommon: string[];
  specific: TestRow[];
}

/** Test dell'esercizio nell'ordine di Moodle: i test comuni che usa, poi i suoi specifici. */
export function exerciseTests(item: EditableQuestion, common: TestRow[]): TestRow[] {
  return composeTests(common, item.useCommon, item.commonExpected, item.specific, item.excludedCommon);
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
  return Boolean(exam.date) && exam.kind !== null && exam.track !== null;
}

/** Punti predefiniti, come negli XML del docente. */
export function defaultGrade(kind: ExamKind | null): number {
  return kind === "Pretest" ? 1 : 5;
}

/** Esercizio che passa da un tipo di traccia all'altro (cambio di tipo, riuso, importazione):
 *  i punti predefiniti del tipo di provenienza e il tag con il suo nome diventano quelli del
 *  nuovo tipo; punti e tag scelti dal docente restano invariati. */
export function adaptQuestionToKind(
  question: Question,
  from: ExamKind | null,
  to: ExamKind | null,
): Question {
  if (from === null || to === null || from === to) return question;
  const tags = question.tags.map((tag) => (tag.toLowerCase() === from.toLowerCase() ? to : tag));
  return {
    ...question,
    default_grade: question.default_grade === defaultGrade(from) ? defaultGrade(to) : question.default_grade,
    tags: [...new Set(tags)],
  };
}

/** Al cambio di tipo della traccia ogni esercizio segue il nuovo tipo (vedi adaptQuestionToKind). */
export function adaptItemsToKind(
  items: EditableQuestion[],
  from: ExamKind | null,
  to: ExamKind | null,
): EditableQuestion[] {
  if (from === null || to === null || from === to) return items;
  return items.map((item) => ({ ...item, question: adaptQuestionToKind(item.question, from, to) }));
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

/** Tag dal campo di testo: separati da virgola, senza spazi ai lati, senza vuoti né doppioni. */
export function parseTags(text: string): string[] {
  const tags = text
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return [...new Set(tags)];
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

/** Il pretest ha un solo esercizio: non se ne possono aggiungere altri. */
export function canAddExercise(items: EditableQuestion[], exam: ExamInfo): boolean {
  return isExamComplete(exam) && !(exam.kind === "Pretest" && items.length >= 1);
}

/** Copia di un esercizio con il numero successivo al più alto: stessi testo, codice e test.
 *  I test ricevono identificativi nuovi; gli output dei test comuni restano validi
 *  finché la soluzione non cambia. */
export function duplicateQuestion(
  source: EditableQuestion,
  items: EditableQuestion[],
  exam: ExamInfo,
): EditableQuestion {
  const number = nextNumber(items);
  return {
    ...source,
    id: crypto.randomUUID(),
    number,
    commonExpected: { ...source.commonExpected },
    excludedCommon: [...source.excludedCommon],
    specific: source.specific.map((row) => ({ ...row, id: crypto.randomUUID() })),
    question: {
      ...source.question,
      name: buildName(number, exam) ?? `Esercizio${number}`,
      tags: [...source.question.tags],
      settings: { ...source.question.settings },
    },
  };
}

export function createQuestion(number: number, exam: ExamInfo): EditableQuestion {
  return {
    id: crypto.randomUUID(),
    number,
    useCommon: true,
    commonExpected: {},
    excludedCommon: [],
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
      text_files: [],
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

  // Traccia ancora da impostare: prende anche il numero di traccia dai nomi importati
  const fresh = !exam.date && exam.kind === null;
  const newExam: ExamInfo = {
    date: exam.date || (parsed.find((p) => p.parts.date)?.parts.date ?? ""),
    kind: exam.kind ?? parsed.find((p) => p.parts.kind)?.parts.kind ?? null,
    track: fresh
      ? (parsed.find((p) => p.parts.track !== null)?.parts.track ?? exam.track ?? DEFAULT_TRACK)
      : exam.track,
  };

  const different = isExamComplete(exam)
    ? parsed.filter(
        ({ parts }) =>
          (parts.date && parts.date !== exam.date) ||
          (parts.kind && parts.kind !== exam.kind) ||
          (parts.track !== null && parts.track !== exam.track),
      )
    : [];
  // Es. "Pretest", "Esame del 3 luglio 2026, traccia 2"
  const origins = [
    ...new Set(
      different.map(({ parts }) => {
        const label = [parts.kind, parts.date && `del ${formatDay(parts.date)}`]
          .filter(Boolean)
          .join(" ");
        return parts.track !== null && parts.track !== exam.track
          ? `${label}, traccia ${parts.track}`
          : label;
      }),
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
      excludedCommon: [],
      specific: question.testcases.slice(commonCount).map(toRow),
      // Un esercizio di un altro tipo (es. dal pretest in un esame) ne prende punti e tag
      question: adaptQuestionToKind({ ...question, testcases: [] }, parts.kind, newExam.kind),
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

/** Etichetta breve di un esercizio, es. "Esercizio 2". */
export function exerciseLabel(item: EditableQuestion): string {
  return item.number !== null ? `Esercizio ${item.number}` : "Esercizio senza numero";
}

const TOPIC_LENGTH = 40;

/** Di cosa parla l'esercizio, per riconoscerlo nella colonna: il nome della funzione della
 *  soluzione, altrimenti l'inizio del testo. Vuoto per un esercizio appena creato. */
export function exerciseTopic(item: EditableQuestion): string {
  const { solution, text_html } = item.question;
  const skeleton = solution.trim() === SOLUTION_SKELETON.trim();
  const name = skeleton ? undefined : /^def\s+([A-Za-z_]\w*)\s*\(/m.exec(solution)?.[1];
  if (name) return name;
  const text = plainText(text_html);
  return text.length > TOPIC_LENGTH ? `${text.slice(0, TOPIC_LENGTH).trimEnd()}…` : text;
}

/** Etichetta di un esercizio nella colonna: data, tipo e traccia sono già indicati sopra. */
export function shortLabel(item: EditableQuestion, exam: ExamInfo): string {
  return exam.kind === "Pretest" ? "Esercizio del pretest" : exerciseLabel(item);
}

/** Esercizio della traccia da cui copiare il contenuto. */
export interface CopySource {
  id: string;
  label: string;
  /** Inizio del testo, per riconoscere l'esercizio. */
  preview: string;
}

const PREVIEW_LENGTH = 90;

/** Gli altri esercizi della stessa traccia, in ordine di numero. */
export function copySources(items: EditableQuestion[], currentId: string): CopySource[] {
  return items
    .filter((item) => item.id !== currentId)
    .sort((a, b) => (a.number ?? Number.POSITIVE_INFINITY) - (b.number ?? Number.POSITIVE_INFINITY))
    .map((item) => {
      const text = plainText(item.question.text_html);
      return {
        id: item.id,
        label: exerciseLabel(item),
        preview: !text
          ? "Testo vuoto"
          : text.length > PREVIEW_LENGTH
            ? `${text.slice(0, PREVIEW_LENGTH)}…`
            : text,
      };
    });
}

/** Contenuto di `source` copiato in `target`: testo, soluzione, codice per gli studenti,
 *  test (specifici e uso dei test comuni, con i loro output e le esclusioni), punti e tag. Restano di `target`
 *  l'identificativo e il numero, quindi il nome. La copia è indipendente dall'originale. */
export function copyExerciseContent(
  target: EditableQuestion,
  source: EditableQuestion,
): EditableQuestion {
  return {
    id: target.id,
    number: target.number,
    useCommon: source.useCommon,
    commonExpected: { ...source.commonExpected },
    excludedCommon: [...source.excludedCommon],
    specific: source.specific.map((row) => ({ ...row, id: crypto.randomUUID() })),
    question: {
      ...source.question,
      name: target.question.name,
      tags: [...source.question.tags],
      text_files: source.question.text_files?.map((file) => ({ ...file })) ?? [],
      settings: { ...source.question.settings },
    },
  };
}
