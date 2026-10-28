import { describe, expect, it } from "vitest";
import { parseInputs, REAL_INPUTS } from "./testdata";
import {
  byId,
  composeTests,
  detectCommonBlock,
  type GeneratorParams,
  generateCommonTests,
  generatedCount,
  generatedSizes,
  generatorErrors,
  inputLineCount,
  missingInputMessage,
  newRow,
  nextSeed,
  nextSeedInput,
  outcomesById,
  requiredInputLines,
  sameTest,
  standardCommonTests,
  startsWithBlock,
  stepCount,
  toRow,
} from "./testcases";

const es1 = parseInputs(REAL_INPUTS.esame_es1);
const es3 = parseInputs(REAL_INPUTS.esame_es3);
const es4 = parseInputs(REAL_INPUTS.esame_es4);
const pretest = parseInputs(REAL_INPUTS.pretest_es1);

describe("detectCommonBlock", () => {
  it("trova i 9 test comuni tra l'esame (es. 1) e il pretest", () => {
    const result = detectCommonBlock([es1, pretest]);

    expect(result?.block).toHaveLength(9);
    expect(result?.members).toEqual([0, 1]);
  });

  it("non trova test comuni tra gli esercizi 3 e 4", () => {
    expect(detectCommonBlock([es3, es4])).toBeNull();
  });

  it("ignora somiglianze troppo brevi (es. 1 ed es. 4 iniziano entrambi con 0/1)", () => {
    expect(detectCommonBlock([es1, es4])).toBeNull();
  });

  it("indica quali esercizi usano il blocco quando sono importati tutti insieme", () => {
    const result = detectCommonBlock([es1, es3, es4, pretest]);

    expect(result?.block).toHaveLength(9);
    expect(result?.members).toEqual([0, 3]);
  });
});

describe("standardCommonTests", () => {
  it("coincide con i primi 9 test reali del docente (input e opzioni)", () => {
    const standard = standardCommonTests();

    expect(standard).toHaveLength(9);
    standard.forEach((test, i) => expect(sameTest(test, es1[i])).toBe(true));
    expect(startsWithBlock(pretest, standard)).toBe(true);
  });
});

describe("nextSeedInput", () => {
  it("propone il seed successivo al più alto e una dimensione predefinita", () => {
    expect(nextSeedInput(standardCommonTests())).toBe("9\n10");
    expect(nextSeedInput(es1)).toBe("301\n10");
  });

  it("parte da 0 se non ci sono test o gli input non sono numerici", () => {
    expect(nextSeedInput([])).toBe("0\n10");
    expect(nextSeedInput([newRow("abc")])).toBe("0\n10");
  });
});

describe("composeTests e corrispondenza dei risultati", () => {
  const common = standardCommonTests();
  const specific = es1.slice(9).map(toRow);
  const commonExpected = Object.fromEntries(common.map((row, i) => [row.id, `comune-${i}`]));

  it("mette prima i test comuni, con gli output di questo esercizio, poi gli specifici", () => {
    const composed = composeTests(common, true, commonExpected, specific);

    expect(composed).toHaveLength(16);
    expect(composed[0].expected).toBe("comune-0");
    expect(composed[9]).toEqual(specific[0]);
  });

  it("senza test comuni restano solo gli specifici", () => {
    expect(composeTests(common, false, commonExpected, specific)).toEqual(specific);
  });

  it("salta i test comuni esclusi dall'esercizio", () => {
    const composed = composeTests(common, true, commonExpected, specific, [common[2].id, common[5].id]);

    expect(composed).toHaveLength(14);
    expect(composed.slice(0, 7).map((r) => r.id)).toEqual(
      common.filter((_, i) => i !== 2 && i !== 5).map((r) => r.id),
    );
    expect(composed[7]).toEqual(specific[0]);
  });

  it("un test comune senza output calcolato ha l'output vuoto", () => {
    expect(composeTests(common, true, {}, [])[0].expected).toBe("");
  });

  it("riporta i risultati del backend sui test giusti", () => {
    const composed = composeTests(common, true, commonExpected, specific);
    const outcomes = composed.map((_, index) => ({
      index,
      passed: index !== 10,
      expected: "",
      got: "",
      error: "",
    }));

    expect(byId(composed, composed.map((_, i) => i))[specific[1].id]).toBe(10);
    expect(outcomesById(composed, outcomes)[specific[1].id].passed).toBe(false);
    expect(outcomesById(composed, outcomes)[common[0].id].passed).toBe(true);
  });
});

describe("righe di input richieste dalla soluzione", () => {
  it("conta le chiamate a input() ignorando i commenti", () => {
    const solution = [
      "def calcola(lst):",
      "    # qui non si usa input()",
      "    return 0",
      "if __name__ == '__main__':",
      "    seed = int(input())",
      "    n = int(input( ))",
    ].join("\n");

    expect(requiredInputLines(solution)).toBe(2);
    expect(requiredInputLines("print(1)")).toBe(0);
  });

  it("conta le righe dell'input di un test", () => {
    expect(inputLineCount("")).toBe(0);
    expect(inputLineCount("0")).toBe(1);
    expect(inputLineCount("0\n")).toBe(1);
    expect(inputLineCount("0\n3")).toBe(2);
  });

  it("descrive i test con valori mancanti", () => {
    expect(missingInputMessage([], 2)).toBeNull();
    expect(missingInputMessage([1, 2], 2)).toBe(
      "Test 1, 2: mancano valori di input. La soluzione ne legge 2 con input(), " +
        "uno per riga (es. seed e dimensione su due righe).",
    );
  });
});

describe("generatore di test comuni", () => {
  const base: GeneratorParams = {
    start: 0,
    end: 100,
    step: 5,
    count: 1,
    mode: "perStep",
    visibility: "visible",
  };
  const inputs = (params: GeneratorParams, firstSeed = 0) =>
    generateCommonTests(params, firstSeed).map((row) => row.stdin);

  it("da 0 a 100 a passi di 5: una dimensione per passo, estremi compresi", () => {
    expect(stepCount(base)).toBe(21);
    expect(generatedSizes(base).slice(0, 3)).toEqual([0, 5, 10]);
    expect(generatedSizes(base).at(-1)).toBe(100);
  });

  it("valori enormi: il conteggio non crea l'elenco delle dimensioni", () => {
    const huge = { ...base, end: 1e12, step: 1 };
    expect(generatorErrors(huge).count).toContain("il massimo è 200");
    expect(generatedSizes({ ...huge, count: 3, mode: "total" })).toEqual([0, 5e11, 1e12]);
  });

  it("per ogni passo: N test per dimensione, con seed consecutivi", () => {
    const params = { ...base, end: 10, count: 2 };
    expect(generatedCount(params)).toBe(6);
    expect(inputs(params)).toEqual(["0\n0", "1\n0", "2\n5", "3\n5", "4\n10", "5\n10"]);
  });

  it("in totale: dimensioni distribuite in modo uniforme sul range", () => {
    expect(generatedSizes({ ...base, count: 5, mode: "total" })).toEqual([0, 25, 50, 75, 100]);
    expect(generatedSizes({ ...base, count: 1, mode: "total" })).toEqual([0]);
  });

  it("in totale con più test che passi: le dimensioni si ripetono in modo regolare", () => {
    expect(generatedSizes({ ...base, end: 10, count: 5, mode: "total" })).toEqual([0, 5, 5, 10, 10]);
  });

  it("un passo più grande del range e start uguale a end", () => {
    expect(generatedSizes({ ...base, end: 3, step: 10 })).toEqual([0]);
    expect(generatedSizes({ ...base, start: 7, end: 7 })).toEqual([7]);
  });

  it("i seed partono da quello indicato: in coda ai test esistenti si continua la numerazione", () => {
    const existing = standardCommonTests();
    expect(nextSeed(existing)).toBe(9);
    expect(nextSeed([])).toBe(0);
    expect(inputs({ ...base, end: 5 }, nextSeed(existing))).toEqual(["9\n0", "10\n5"]);
  });

  it("visibili, nascosti o a caso", () => {
    const params = { ...base, end: 15 };
    const shown = (visibility: GeneratorParams["visibility"], random?: () => number) =>
      generateCommonTests({ ...params, visibility }, 0, random).map((row) => row.display);
    expect(shown("visible")).toEqual(["SHOW", "SHOW", "SHOW", "SHOW"]);
    expect(shown("hidden")).toEqual(["HIDE", "HIDE", "HIDE", "HIDE"]);
    const sequence = [0.1, 0.9, 0.4, 0.6];
    expect(shown("random", () => sequence.shift()!)).toEqual(["HIDE", "SHOW", "HIDE", "SHOW"]);
  });

  it("i test generati hanno le stesse opzioni dei test standard, senza esempi", () => {
    const [row] = generateCommonTests({ ...base, end: 0 }, 0);
    expect(row).toMatchObject({ expected: "", use_as_example: false, hide_rest_if_fail: false, mark: 1 });
  });

  it("segnala i valori non validi campo per campo", () => {
    expect(generatorErrors(base)).toEqual({});
    expect(generatorErrors({ ...base, start: -1, step: 0, count: 1.5 })).toEqual({
      start: "Un numero intero da 0 in su",
      step: "Un numero intero da 1 in su",
      count: "Un numero intero da 1 in su",
    });
    expect(generatorErrors({ ...base, start: 50, end: 10 })).toEqual({
      end: "Deve essere almeno uguale a «da»",
    });
    expect(generatorErrors({ ...base, end: Number.NaN })).toEqual({ end: "Un numero intero da 0 in su" });
  });

  it("blocca più di 200 test", () => {
    expect(generatorErrors({ ...base, count: 10 })).toEqual({
      count: "Verrebbero creati 210 test: il massimo è 200",
    });
    expect(generatorErrors({ ...base, count: 200, mode: "total" })).toEqual({});
    expect(generatorErrors({ ...base, count: 201, mode: "total" }).count).toContain("201");
  });
});
