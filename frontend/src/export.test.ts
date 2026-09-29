import { describe, expect, it } from "vitest";
import { createQuestion, type EditableQuestion } from "./exam";
import { exportFileName, exportProblems, prepareQuestion, sortedByNumber } from "./export";
import type { ExamInfo } from "./naming";
import { newRow, standardCommonTests } from "./testcases";

const esame: ExamInfo = { date: "2026-10-15", kind: "Esame" };
const common = standardCommonTests();

/** Esercizio completo e pronto per l'esportazione. */
function readyQuestion(number: number): EditableQuestion {
  const item = createQuestion(number, esame);
  return {
    ...item,
    commonExpected: Object.fromEntries(common.map((row, i) => [row.id, `comune-${i}\n`])),
    specific: [{ ...newRow("9\n12"), expected: "specifico\n" }],
    question: {
      ...item.question,
      text_html: "<p>Implementare la funzione <strong>calcola(lst)</strong>.</p>",
      student_code: "def calcola(lst):\n    return None\n",
    },
  };
}

describe("exportFileName", () => {
  it("propone tipo e data dell'esame", () => {
    expect(exportFileName(esame)).toBe("Esame-2026-10-15.xml");
    expect(exportFileName({ date: "2026-11-05", kind: "Pretest" })).toBe("Pretest-2026-11-05.xml");
  });
});

describe("prepareQuestion", () => {
  it("usa il nome della convenzione e mette i test comuni prima degli specifici", () => {
    const question = prepareQuestion(readyQuestion(2), esame, common);

    expect(question.name).toBe("Esercizio2-2026-10-15-Esame");
    expect(question.testcases).toHaveLength(10);
    expect(question.testcases[0]).toMatchObject({ stdin: "0\n1", expected: "comune-0\n" });
    expect(question.testcases[9]).toMatchObject({ stdin: "9\n12", expected: "specifico\n" });
    expect(question.testcases[0]).not.toHaveProperty("id");
  });

  it("aggiunge il tag del tipo di esame solo se l'esercizio non ha tag", () => {
    const senzaTag = readyQuestion(1);
    const conTag = { ...senzaTag, question: { ...senzaTag.question, tags: ["python - ricorsione"] } };

    expect(prepareQuestion(senzaTag, esame, common).tags).toEqual(["Esame"]);
    expect(prepareQuestion(conTag, esame, common).tags).toEqual(["python - ricorsione"]);
  });

  it("senza test comuni esporta solo gli specifici", () => {
    const item = { ...readyQuestion(1), useCommon: false };

    expect(prepareQuestion(item, esame, common).testcases).toHaveLength(1);
  });
});

describe("sortedByNumber", () => {
  it("ordina gli esercizi per numero", () => {
    const items = [readyQuestion(3), readyQuestion(1), readyQuestion(2)];

    expect(sortedByNumber(items).map((it) => it.number)).toEqual([1, 2, 3]);
  });
});

describe("exportProblems", () => {
  it("nessun problema per esercizi completi", () => {
    expect(exportProblems([readyQuestion(1), readyQuestion(2)], esame, common)).toEqual([]);
  });

  it("segnala dati dell'esame mancanti e nessun esercizio", () => {
    expect(exportProblems([], { date: "", kind: null }, common)).toEqual([
      "Esame: manca la data",
      "Esame: manca il tipo (Esame o Pretest)",
      "Nessun esercizio da esportare",
    ]);
  });

  it("segnala i numeri duplicati", () => {
    expect(exportProblems([readyQuestion(1), readyQuestion(1)], esame, common)).toContain(
      "Numeri usati da più esercizi: 1",
    );
  });

  it("segnala testo vuoto, codice studenti uguale alla soluzione e output mancanti", () => {
    const item = readyQuestion(1);
    const problems = exportProblems(
      [
        {
          ...item,
          commonExpected: {},
          question: { ...item.question, text_html: "<p></p>", student_code: item.question.solution },
        },
      ],
      esame,
      common,
    );

    expect(problems).toEqual([
      "Esercizio1-2026-10-15-Esame: il testo della traccia è vuoto",
      "Esercizio1-2026-10-15-Esame: il codice per gli studenti è uguale alla soluzione (premi «Genera dalla soluzione»)",
      "Esercizio1-2026-10-15-Esame: 9 test senza output atteso (premi «Calcola output»)",
    ]);
  });

  it("segnala codice studenti vuoto ed esercizio senza test", () => {
    const item = readyQuestion(1);
    const problems = exportProblems(
      [{ ...item, useCommon: false, specific: [], question: { ...item.question, student_code: "" } }],
      esame,
      common,
    );

    expect(problems).toEqual([
      "Esercizio1-2026-10-15-Esame: il codice per gli studenti è vuoto (premi «Genera dalla soluzione»)",
      "Esercizio1-2026-10-15-Esame: nessun test",
    ]);
  });
});

describe("exportProblems sui punti", () => {
  it("segnala punti non validi", () => {
    const item = readyQuestion(1);

    expect(
      exportProblems([{ ...item, question: { ...item.question, default_grade: 0 } }], esame, common),
    ).toEqual(["Esercizio1-2026-10-15-Esame: i punti devono essere maggiori di 0"]);
  });
});
