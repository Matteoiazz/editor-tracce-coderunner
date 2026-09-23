import { describe, expect, it } from "vitest";
import {
  adoptImported,
  createQuestion,
  duplicateNumbers,
  type EditableQuestion,
  nextNumber,
  questionName,
  SOLUTION_SKELETON,
} from "./exam";
import type { ExamInfo } from "./naming";
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
    );

    expect(result.notice).toContain("(Esame del 2026-07-03)");
  });

  it("non segnala nulla se gli importati sono dello stesso esame", () => {
    const result = adoptImported(
      [importedQuestion("Esame-2026-07-03 - Traccia 1 - Esercizio 4")],
      withNumbers(1),
      esame,
    );

    expect(result.notice).toBeNull();
    expect(result.items[0].number).toBe(4);
  });

  it("assegna numeri liberi agli esercizi senza numero", () => {
    const result = adoptImported(
      [importedQuestion("Domanda A"), importedQuestion("Domanda B")],
      withNumbers(1, 2),
      esame,
    );

    expect(result.items.map((it) => it.number)).toEqual([3, 4]);
  });
});
