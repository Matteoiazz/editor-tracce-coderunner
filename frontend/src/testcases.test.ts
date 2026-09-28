import { describe, expect, it } from "vitest";
import { parseInputs, REAL_INPUTS } from "./testdata";
import {
  byId,
  composeTests,
  detectCommonBlock,
  newRow,
  nextSeedInput,
  outcomesById,
  sameTest,
  standardCommonTests,
  startsWithBlock,
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
  it("propone il seed successivo al più alto", () => {
    expect(nextSeedInput(standardCommonTests())).toBe("9\n");
    expect(nextSeedInput(es1)).toBe("301\n");
  });

  it("parte da 0 se non ci sono test o gli input non sono numerici", () => {
    expect(nextSeedInput([])).toBe("0\n");
    expect(nextSeedInput([newRow("abc")])).toBe("0\n");
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
