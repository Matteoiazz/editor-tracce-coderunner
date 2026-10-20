import { describe, expect, it } from "vitest";
import { createQuestion, type EditableQuestion } from "./exam";
import {
  exportBlockers,
  exportFileName,
  exportProblemList,
  exportProblems,
  prepareQuestion,
  sortedByNumber,
} from "./export";
import type { ExamInfo } from "./naming";
import { newRow, standardCommonTests } from "./testcases";

const esame: ExamInfo = { date: "2026-10-15", kind: "Esame", track: 1 };
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
      solution: item.question.solution.replace("return None", "return sum(lst)"),
      student_code: "def calcola(lst):\n    return None\n",
    },
  };
}

describe("exportFileName", () => {
  it("propone tipo e data dell'esame", () => {
    expect(exportFileName(esame)).toBe("Esame-2026-10-15-Traccia1.xml");
    expect(exportFileName({ date: "2026-11-05", kind: "Pretest", track: 1 })).toBe("Pretest-2026-11-05-Traccia1.xml");
  });
});

describe("prepareQuestion", () => {
  it("usa il nome della convenzione e mette i test comuni prima degli specifici", () => {
    const question = prepareQuestion(readyQuestion(2), esame, common);

    expect(question.name).toBe("Esame-2026-10-15-Traccia1-Esercizio2");
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
    expect(exportProblems([], { date: "", kind: null, track: 1 }, common)).toEqual([
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
      "Esame-2026-10-15-Traccia1-Esercizio1: il testo della traccia è vuoto",
      "Esame-2026-10-15-Traccia1-Esercizio1: il codice per gli studenti è uguale alla soluzione (premi «Genera dalla soluzione»)",
      "Esame-2026-10-15-Traccia1-Esercizio1: 9 test senza output atteso (premi «Calcola output»)",
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
      "Esame-2026-10-15-Traccia1-Esercizio1: il codice per gli studenti è vuoto (premi «Genera dalla soluzione»)",
      "Esame-2026-10-15-Traccia1-Esercizio1: nessun test",
    ]);
  });
});

describe("exportProblems sui punti", () => {
  it("segnala punti non validi", () => {
    const item = readyQuestion(1);

    expect(
      exportProblems([{ ...item, question: { ...item.question, default_grade: 0 } }], esame, common),
    ).toEqual(["Esame-2026-10-15-Traccia1-Esercizio1: i punti devono essere maggiori di 0"]);
  });
});

describe("exportProblems sulle righe di input", () => {
  it("segnala i test con meno righe di quelle lette dalla soluzione", () => {
    const item = readyQuestion(1);
    const incompleto = {
      ...item,
      useCommon: false,
      specific: [{ ...newRow("0"), expected: "x\n" }, { ...newRow("3"), expected: "y\n" }],
    };

    expect(exportProblems([incompleto], esame, common)).toEqual([
      "Esame-2026-10-15-Traccia1-Esercizio1: Test 1, 2: mancano valori di input. La soluzione ne legge 2 " +
        "con input(), uno per riga (es. seed e dimensione su due righe).",
    ]);
  });
});

describe("exportProblems per il pretest", () => {
  const pretest: ExamInfo = { ...esame, kind: "Pretest" };

  it("non chiede il numero dell'esercizio", () => {
    const item = { ...readyQuestion(1), number: null };
    expect(exportProblems([item], pretest, common)).toEqual([]);
  });

  it("segnala più di un esercizio", () => {
    expect(exportProblems([readyQuestion(1), readyQuestion(2)], pretest, common)).toContain(
      "Il pretest ha un solo esercizio: ce ne sono 2, rimuovi quelli in più",
    );
  });

  it("segnala il numero di traccia mancante", () => {
    expect(exportProblems([readyQuestion(1)], { ...esame, track: null }, common)).toContain(
      "Esame: manca il numero della traccia",
    );
  });
});

describe("exportProblems sulla soluzione di partenza", () => {
  it("blocca un esercizio con la soluzione ancora da scrivere", () => {
    const item = readyQuestion(1);
    const untouched = { ...item, question: { ...item.question, solution: createQuestion(1, esame).question.solution } };

    expect(exportProblems([untouched], esame, common)).toContain(
      "Esame-2026-10-15-Traccia1-Esercizio1: la soluzione è ancora quella di partenza: scrivi la soluzione vera",
    );
  });
});

describe("exportBlockers", () => {
  it("una riga per esercizio con i problemi in forma breve, la descrizione completa nel suggerimento", () => {
    const fresh = createQuestion(3, esame);
    const ready = readyQuestion(1);

    const blockers = exportBlockers([fresh, ready], esame, common, {});

    expect(blockers).toEqual([
      {
        text:
          "Esercizio 3: testo vuoto, soluzione da scrivere, codice studenti da generare, " +
          "9 output da calcolare",
        title: [
          "Esame-2026-10-15-Traccia1-Esercizio3: il testo della traccia è vuoto",
          "Esame-2026-10-15-Traccia1-Esercizio3: la soluzione è ancora quella di partenza: scrivi la soluzione vera",
          "Esame-2026-10-15-Traccia1-Esercizio3: il codice per gli studenti è vuoto (premi «Genera dalla soluzione»)",
          "Esame-2026-10-15-Traccia1-Esercizio3: 9 test senza output atteso (premi «Calcola output»)",
        ].join("\n"),
        exerciseId: fresh.id,
      },
    ]);
  });

  it("aggiunge i test falliti alla riga dell'esercizio, in ordine di numero", () => {
    const second = readyQuestion(2);
    const first = { ...readyQuestion(1), question: { ...readyQuestion(1).question, text_html: "" } };

    const blockers = exportBlockers([second, first], esame, common, { [second.id]: 1, [first.id]: 3 });

    expect(blockers.map((b) => b.text)).toEqual([
      "Esercizio 1: testo vuoto, 3 test falliti",
      "Esercizio 2: 1 test fallito",
    ]);
  });

  it("mette prima i problemi della traccia, compresi quelli indicati da fuori", () => {
    const blockers = exportBlockers(
      [readyQuestion(1)],
      { ...esame, track: null },
      common,
      {},
      ["Nell'archivio c'è un'altra traccia con lo stesso nome"],
    );

    expect(blockers).toEqual([
      { text: "Esame: manca il numero della traccia" },
      { text: "Nell'archivio c'è un'altra traccia con lo stesso nome" },
    ]);
  });

  it("nel pretest l'esercizio si chiama «Esercizio del pretest»", () => {
    const item = { ...readyQuestion(1), question: { ...readyQuestion(1).question, student_code: "" } };

    expect(exportBlockers([item], { ...esame, kind: "Pretest" }, common, {})[0].text).toBe(
      "Esercizio del pretest: codice studenti da generare",
    );
  });
});

describe("exportProblemList", () => {
  it("collega ogni problema al suo esercizio anche con nomi uguali", () => {
    const pretest: ExamInfo = { ...esame, kind: "Pretest" };
    const first = readyQuestion(1);
    const second = { ...readyQuestion(2), question: { ...readyQuestion(2).question, text_html: "" } };

    const problems = exportProblemList([first, second], pretest, common);

    const empty = problems.find((p) => p.issue === "il testo della traccia è vuoto");
    expect(empty?.item?.id).toBe(second.id);
    expect(problems[0]).toEqual({ text: "Il pretest ha un solo esercizio: ce ne sono 2, rimuovi quelli in più" });
  });
});
