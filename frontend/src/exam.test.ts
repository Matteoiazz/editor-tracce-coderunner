import { describe, expect, it } from "vitest";
import {
  adaptItemsToKind,
  adaptQuestionToKind,
  adoptImported,
  canAddExercise,
  copyExerciseContent,
  copySources,
  createQuestion,
  duplicateQuestion,
  duplicateNumbers,
  ignoredMessage,
  type EditableQuestion,
  isValidGrade,
  nextNumber,
  parseExerciseNumber,
  parseTags,
  plainText,
  questionName,
  SOLUTION_SKELETON,
  unsupportedReason,
} from "./exam";
import type { ExamInfo } from "./naming";
import { newRow, standardCommonTests } from "./testcases";
import { parseInputs, REAL_INPUTS } from "./testdata";
import type { Question } from "./types";

const esame: ExamInfo = { date: "2026-07-03", kind: "Esame", track: 1 };
const vuoto: ExamInfo = { date: "", kind: null, track: 1 };

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
    expect(questionName(item, esame)).toBe("Esame-2026-07-03-Traccia1-Esercizio3");
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

    expect(questionName(item, { date: "2026-09-30", kind: "Pretest", track: 1 })).toBe(
      "Pretest-2026-09-30-Traccia1",
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
      { date: "2026-09-30", kind: "Esame", track: 1 },
      [],
    );

    expect(result.exam).toEqual({ date: "2026-09-30", kind: "Esame", track: 1 });
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
      { date: "2026-09-30", kind: "Pretest", track: 1 },
      [],
    );

    expect(result.notice).toContain("(Esame del 3 luglio 2026)");
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

describe("parseTags", () => {
  it("separa i tag con la virgola, togliendo spazi, vuoti e doppioni", () => {
    expect(parseTags("Python - easy, liste")).toEqual(["Python - easy", "liste"]);
    expect(parseTags(" a ,, b , a ,")).toEqual(["a", "b"]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("tracce", () => {
  it("prende il numero di traccia dai nomi importati se la traccia è ancora vuota", () => {
    const result = adoptImported(
      [importedQuestion("Esame-2026-07-03 - Traccia 2 - Esercizio 1")],
      [],
      vuoto,
      [],
    );
    expect(result.exam).toEqual({ date: "2026-07-03", kind: "Esame", track: 2 });
  });

  it("segnala gli esercizi di un'altra traccia", () => {
    const result = adoptImported(
      [importedQuestion("Esame-2026-07-03-Traccia2-Esercizio1")],
      [],
      esame,
      [],
    );
    expect(result.notice).toContain("(Esame del 3 luglio 2026, traccia 2)");
  });

  it("il pretest ammette un solo esercizio", () => {
    const pretest: ExamInfo = { ...esame, kind: "Pretest" };
    expect(canAddExercise([], pretest)).toBe(true);
    expect(canAddExercise(withNumbers(1), pretest)).toBe(false);
    expect(canAddExercise(withNumbers(1, 2), esame)).toBe(true);
    expect(canAddExercise([], vuoto)).toBe(false);
  });
});

describe("duplicateQuestion", () => {
  it("copia testo, codice e test con il numero successivo e identificativi nuovi", () => {
    const source = createQuestion(1, esame);
    source.question.text_html = "<p>Testo</p>";
    source.question.tags = ["Python - easy"];
    source.specific = [{ ...newRow("5\n10"), expected: "out" }];
    source.commonExpected = { c1: "comune" };
    const items = [source, ...withNumbers(2)];

    const copy = duplicateQuestion(source, items, esame);

    expect(copy.id).not.toBe(source.id);
    expect(copy.number).toBe(3);
    expect(copy.question.name).toBe("Esame-2026-07-03-Traccia1-Esercizio3");
    expect(copy.question.text_html).toBe("<p>Testo</p>");
    expect(copy.question.solution).toBe(source.question.solution);
    expect(copy.specific[0].stdin).toBe("5\n10");
    expect(copy.specific[0].expected).toBe("out");
    expect(copy.specific[0].id).not.toBe(source.specific[0].id);
    expect(copy.commonExpected).toEqual({ c1: "comune" });

    // La copia è indipendente dall'originale
    copy.question.tags.push("altro");
    expect(source.question.tags).toEqual(["Python - easy"]);
  });
});

describe("adaptItemsToKind", () => {
  it("adatta solo i punti predefiniti al nuovo tipo", () => {
    const standard = createQuestion(1, esame); // 5 punti, predefiniti per l'esame
    const chosen = { ...createQuestion(2, esame), question: { ...createQuestion(2, esame).question, default_grade: 6 } };

    const [a, b] = adaptItemsToKind([standard, chosen], "Esame", "Pretest");

    expect(a.question.default_grade).toBe(1);
    expect(b.question.default_grade).toBe(6);
    expect(adaptItemsToKind([a], "Pretest", "Esame")[0].question.default_grade).toBe(5);
  });

  it("senza cambio di tipo non cambia nulla", () => {
    const items = [createQuestion(1, esame)];
    expect(adaptItemsToKind(items, "Esame", "Esame")).toBe(items);
    expect(adaptItemsToKind(items, null, "Pretest")).toBe(items);
  });
});

describe("adaptQuestionToKind", () => {
  it("il tag con il nome del tipo di provenienza diventa quello nuovo", () => {
    const question = { ...createQuestion(1, esame).question, default_grade: 1, tags: ["Pretest", "liste"] };

    const adapted = adaptQuestionToKind(question, "Pretest", "Esame");

    expect(adapted.default_grade).toBe(5);
    expect(adapted.tags).toEqual(["Esame", "liste"]);
  });

  it("non crea tag doppi", () => {
    const question = { ...createQuestion(1, esame).question, tags: ["Pretest", "Esame"] };
    expect(adaptQuestionToKind(question, "Pretest", "Esame").tags).toEqual(["Esame"]);
  });

  it("un esercizio del pretest importato in un esame ne prende punti e tag", () => {
    const pretest = { ...importedQuestion("Pretest-2026-07-03-Traccia1"), default_grade: 1, tags: ["Pretest"] };

    const [item] = adoptImported([pretest], [], esame, []).items;

    expect(item.question.default_grade).toBe(5);
    expect(item.question.tags).toEqual(["Esame"]);
  });
});

describe("plainText", () => {
  it("toglie i tag e decodifica i caratteri speciali", () => {
    expect(plainText("<p>Se <strong>lst</strong> &lt; 3&nbsp;e</p><p>altro &amp; fine</p>")).toBe(
      "Se lst < 3 e altro & fine",
    );
  });
});

describe("copySources", () => {
  function withText(number: number | null, html: string): EditableQuestion {
    const item = createQuestion(number ?? 1, esame);
    return { ...item, number, question: { ...item.question, text_html: html } };
  }

  it("elenca gli altri esercizi in ordine di numero, anche senza testo", () => {
    const current = withText(2, "<p>Testo del 2</p>");
    const third = withText(3, "<p></p>");
    const first = withText(1, "<p>Implementare la funzione <strong>calcola</strong></p>");

    const sources = copySources([current, third, first], current.id);

    expect(sources.map((s) => s.label)).toEqual(["Esercizio 1", "Esercizio 3"]);
    expect(sources[0].preview).toBe("Implementare la funzione calcola");
    expect(sources[1].preview).toBe("Testo della traccia vuoto");
  });

  it("accorcia le anteprime lunghe", () => {
    const long = withText(1, `<p>${"parola ".repeat(30)}</p>`);
    const [source] = copySources([long], "altro");

    expect(source.preview.length).toBe(91);
    expect(source.preview.endsWith("…")).toBe(true);
  });
});

describe("copyExerciseContent", () => {
  it("copia tutto il contenuto e mantiene numero e nome dell'esercizio", () => {
    const target = createQuestion(4, esame);
    const base = createQuestion(2, esame);
    const source: EditableQuestion = {
      ...base,
      useCommon: false,
      commonExpected: { comune: "out" },
      specific: [{ ...newRow("9"), expected: "9" }],
      question: {
        ...base.question,
        text_html: "<p>Testo</p>",
        solution: "print(1)",
        student_code: "print(None)",
        default_grade: 6,
        tags: ["liste"],
      },
    };

    const copied = copyExerciseContent(target, source);

    expect(copied.id).toBe(target.id);
    expect(copied.number).toBe(4);
    expect(copied.question.name).toBe(target.question.name);
    expect(copied.question.text_html).toBe("<p>Testo</p>");
    expect(copied.question.solution).toBe("print(1)");
    expect(copied.question.student_code).toBe("print(None)");
    expect(copied.question.default_grade).toBe(6);
    expect(copied.useCommon).toBe(false);
    expect(copied.commonExpected).toEqual({ comune: "out" });
    expect(copied.specific.map((r) => [r.stdin, r.expected])).toEqual([["9", "9"]]);
  });

  it("copia anche i test comuni esclusi, in modo indipendente", () => {
    const source = { ...createQuestion(1, esame), excludedCommon: ["c2"] };
    const copied = copyExerciseContent(createQuestion(2, esame), source);
    const duplicated = duplicateQuestion(source, [source], esame);

    expect(copied.excludedCommon).toEqual(["c2"]);
    expect(duplicated.excludedCommon).toEqual(["c2"]);
    copied.excludedCommon.push("c3");
    expect(source.excludedCommon).toEqual(["c2"]);
  });

  it("la copia è indipendente dall'originale", () => {
    const source = { ...createQuestion(1, esame), specific: [newRow("1")] };
    const copied = copyExerciseContent(createQuestion(2, esame), source);

    expect(copied.specific[0].id).not.toBe(source.specific[0].id);
    copied.question.tags.push("nuovo");
    copied.commonExpected.x = "y";
    expect(source.question.tags).toEqual([]);
    expect(source.commonExpected).toEqual({});
  });
});
