import { describe, expect, it } from "vitest";
import {
  adoptImported,
  createQuestion,
  duplicateNumbers,
  ignoredMessage,
  type EditableQuestion,
  isValidGrade,
  nextNumber,
  parseExerciseNumber,
  questionName,
  SOLUTION_SKELETON,
  unsupportedReason,
} from "./exam";
import type { ExamInfo } from "./naming";
import { newRow, standardCommonTests } from "./testcases";
import { parseInputs, REAL_INPUTS } from "./testdata";
import type { Question } from "./types";

const esame: ExamInfo = { date: "2026-07-03", kind: "Esame" };
const vuoto: ExamInfo = { date: "", kind: null };

function importedQuestion(name: string): Question {
  return { ...createQuestion(1, vuoto).question, name };
}

function withNumbers(...numbers: (number | null)[]): EditableQuestion[] {
  return numbers.map((n) => ({ ...createQuestion(1, esame), number: n }));
}

describe("createQuestion", () => {
  it("crea un esercizio con nome, punti e scheletro della soluzione", () => {
    const item = createQuestion(3, esame);

    expect(item.number).toBe(3);
    expect(questionName(item, esame)).toBe("Esercizio3-2026-07-03-Esame");
    expect(item.question.default_grade).toBe(5);
    expect(item.question.solution).toBe(SOLUTION_SKELETON);
    expect(item.question.student_code).toBe("");
    expect(item.question.testcases).toEqual([]);
  });

  it("assegna 1 punto agli esercizi del pretest", () => {
    expect(createQuestion(1, { ...esame, kind: "Pretest" }).question.default_grade).toBe(1);
  });
});

describe("nextNumber e duplicateNumbers", () => {
  it("propone il numero successivo al più alto", () => {
    expect(nextNumber([])).toBe(1);
    expect(nextNumber(withNumbers(1, 3))).toBe(4);
    expect(nextNumber(withNumbers(null, 2))).toBe(3);
  });

  it("rileva i numeri usati più volte", () => {
    expect(duplicateNumbers(withNumbers(1, 2, 2, null, null))).toEqual(new Set([2]));
    expect(duplicateNumbers(withNumbers(1, 2, 3))).toEqual(new Set());
  });
});

describe("questionName", () => {
  it("segue l'esame corrente quando i dati sono completi", () => {
    const [item] = withNumbers(2);

    expect(questionName(item, { date: "2026-09-30", kind: "Pretest" })).toBe(
      "Esercizio2-2026-09-30-Pretest",
    );
  });

  it("mantiene il nome originale se mancano dati", () => {
    const item = { ...createQuestion(1, vuoto), question: importedQuestion("Nome originale") };

    expect(questionName(item, vuoto)).toBe("Nome originale");
  });
});

describe("adoptImported", () => {
  it("compila l'esame vuoto con i dati dei nomi importati", () => {
    const result = adoptImported(
      [importedQuestion("Esame-2026-07-03 - Traccia 1 - Esercizio 3")],
      [],
      vuoto,
      [],
    );

    expect(result.exam).toEqual(esame);
    expect(result.items[0].number).toBe(3);
    expect(result.notice).toBeNull();
  });

  it("adatta all'esame corrente gli esercizi di un altro esame e lo segnala", () => {
    const result = adoptImported(
      [importedQuestion("2026-07 - Esercizio pretest 1")],
      withNumbers(1),
      { date: "2026-09-30", kind: "Esame" },
      [],
    );

    expect(result.exam).toEqual({ date: "2026-09-30", kind: "Esame" });
    expect(result.items[0].number).toBe(2); // il numero 1 era già usato
    expect(result.notice).toBe(
      "Gli esercizi importati provenivano da un altro esame (Pretest): " +
        "ora seguono l'esame corrente.",
    );
  });

  it("nell'avviso indica tipo e data di provenienza", () => {
    const result = adoptImported(
      [importedQuestion("Esame-2026-07-03 - Traccia 1 - Esercizio 1")],
      [],
      { date: "2026-09-30", kind: "Pretest" },
      [],
    );

    expect(result.notice).toContain("(Esame del 2026-07-03)");
  });

  it("non segnala nulla se gli importati sono dello stesso esame", () => {
    const result = adoptImported(
      [importedQuestion("Esame-2026-07-03 - Traccia 1 - Esercizio 4")],
      withNumbers(1),
      esame,
      [],
    );

    expect(result.notice).toBeNull();
    expect(result.items[0].number).toBe(4);
  });

  it("assegna numeri liberi agli esercizi senza numero", () => {
    const result = adoptImported(
      [importedQuestion("Domanda A"), importedQuestion("Domanda B")],
      withNumbers(1, 2),
      esame,
      [],
    );

    expect(result.items.map((it) => it.number)).toEqual([3, 4]);
  });
});

describe("adoptImported con i test", () => {
  const importedWithTests = (name: string, notation: string) => ({
    ...importedQuestion(name),
    testcases: parseInputs(notation, name),
  });

  it("riconosce i test comuni tra esame e pretest e separa quelli specifici", () => {
    const es1 = importedWithTests("Esame-2026-07-03 - Traccia 1 - Esercizio 1", REAL_INPUTS.esame_es1);
    const pre = importedWithTests("2026-07 - Esercizio pretest 1", REAL_INPUTS.pretest_es1);

    const result = adoptImported([es1, pre], [], vuoto, []);

    expect(result.common).toHaveLength(9);
    expect(result.common.every((row) => row.expected === "")).toBe(true);
    const [first, second] = result.items;
    expect(first.useCommon && second.useCommon).toBe(true);
    expect(first.specific).toHaveLength(7);
    expect(first.specific[0].stdin).toBe("76\n28");
    // Ogni esercizio conserva i propri output dei test comuni
    expect(first.commonExpected[result.common[0].id]).toBe(es1.testcases[0].expected);
    expect(second.commonExpected[result.common[0].id]).toBe(pre.testcases[0].expected);
    expect(first.question.testcases).toEqual([]);
  });

  it("senza blocco comune gli esercizi tengono tutti i loro test come specifici", () => {
    const es3 = importedWithTests("Esame-2026-07-03 - Traccia 1 - Esercizio 3", REAL_INPUTS.esame_es3);
    const es4 = importedWithTests("Esame-2026-07-03 - Traccia 1 - Esercizio 4", REAL_INPUTS.esame_es4);

    const result = adoptImported([es3, es4], [], vuoto, []);

    expect(result.common).toEqual([]);
    expect(result.items.map((it) => it.useCommon)).toEqual([false, false]);
    expect(result.items.map((it) => it.specific.length)).toEqual([14, 15]);
  });

  it("con test comuni già presenti li usa solo chi inizia con quei test", () => {
    const common = standardCommonTests();
    const pre = importedWithTests("2026-07 - Esercizio pretest 1", REAL_INPUTS.pretest_es1);
    const es3 = importedWithTests("Esame-2026-07-03 - Traccia 1 - Esercizio 3", REAL_INPUTS.esame_es3);

    const result = adoptImported([pre, es3], [], esame, common);

    expect(result.common).toBe(common);
    expect(result.items.map((it) => it.useCommon)).toEqual([true, false]);
    expect(result.items[0].specific).toHaveLength(7);
  });
});

describe("parseExerciseNumber e isValidGrade", () => {
  it("accetta solo interi da 1 in su, ignorando i caratteri non numerici", () => {
    expect(parseExerciseNumber("3")).toBe(3);
    expect(parseExerciseNumber("12")).toBe(12);
    expect(parseExerciseNumber("-3")).toBe(3);
    expect(parseExerciseNumber("")).toBeNull();
    expect(parseExerciseNumber("0")).toBeNull();
    expect(parseExerciseNumber("abc")).toBeNull();
  });

  it("i punti devono essere un numero maggiore di 0", () => {
    expect(isValidGrade(5)).toBe(true);
    expect(isValidGrade(0.5)).toBe(true);
    expect(isValidGrade(0)).toBe(false);
    expect(isValidGrade(-2)).toBe(false);
    expect(isValidGrade(Number.NaN)).toBe(false);
  });
});

describe("unsupportedReason e ignoredMessage", () => {
  const base = createQuestion(1, esame).question;
  const stdinTest = { ...newRow("0\n1"), expected: "x" };

  it("gli esercizi nel formato del docente sono eseguibili", () => {
    expect(unsupportedReason(base, [stdinTest])).toBeNull();
  });

  it("segnala tipi CodeRunner diversi e test con testcode", () => {
    expect(unsupportedReason({ ...base, coderunner_type: "python3" }, [stdinTest])).toBe(
      "tipo CodeRunner «python3» non supportato",
    );
    expect(unsupportedReason(base, [{ ...stdinTest, testcode: "print(f(1))" }])).toBe(
      "test con codice di prova (testcode) non supportati",
    );
  });

  it("descrive le domande di altro tipo ignorate", () => {
    expect(ignoredMessage({})).toBeNull();
    expect(ignoredMessage({ multichoice: 1 })).toBe(
      "Ignorata 1 domanda che non è di tipo CodeRunner (1 scelta multipla).",
    );
    expect(ignoredMessage({ multichoice: 2, truefalse: 1 })).toBe(
      "Ignorate 3 domande che non sono di tipo CodeRunner (2 scelta multipla, 1 vero/falso).",
    );
  });
});
