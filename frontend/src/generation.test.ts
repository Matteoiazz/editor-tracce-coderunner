import { describe, expect, it } from "vitest";
import { SOLUTION_SKELETON } from "./exam";
import {
  attemptsText,
  clearGeneration,
  type GeneratedSolution,
  generationOf,
  generationProblem,
  markGenerationSeen,
  replacesSolution,
  startGeneration,
  testsSummary,
} from "./generation";
import type { Question } from "./types";

const question = { text_html: "<p>Somma dei pari</p>", solution: "" } as Question;

const run = (changes: Partial<GeneratedSolution["tests"][number]>) => ({
  stdin: "1\n3",
  output: "x",
  error: "",
  expected: "",
  passed: true,
  ...changes,
});

const result = (tests: GeneratedSolution["tests"], notRun = 0): GeneratedSolution => ({
  solution: "print(1)\n",
  explanation: "",
  attempts: 1,
  tests,
  problems: [],
  not_run: notRun,
});

describe("soluzione generata", () => {
  it("serve il testo dell'esercizio", () => {
    expect(generationProblem({ ...question, text_html: "<p></p>" })).toContain("Scrivi prima il testo");
    expect(generationProblem(question)).toBeNull();
  });

  it("chiede conferma solo se sostituisce una soluzione scritta", () => {
    expect(replacesSolution(question)).toBe(false);
    expect(replacesSolution({ ...question, solution: SOLUTION_SKELETON })).toBe(false);
    expect(replacesSolution({ ...question, solution: "def f():\n    return 1\n" })).toBe(true);
  });

  it("tentativi", () => {
    expect(attemptsText(1)).toBe("Al primo tentativo");
    expect(attemptsText(3)).toBe("Dopo 3 tentativi");
  });

  it("esito sui test", () => {
    expect(testsSummary(result([]))).toContain("Nessun test");
    expect(testsSummary(result([run({}), run({})]))).toBe("Eseguita su 2 test senza errori.");
    expect(testsSummary(result([run({ expected: "x" }), run({})]))).toBe(
      "Eseguita su 2 test senza errori; output uguale a quello atteso sull'unico test che lo ha.",
    );
    expect(
      testsSummary(result([run({ expected: "y", passed: false }), run({ error: "IndexError", passed: false })])),
    ).toBe("Va in errore su 1 test su 2; output uguale a quello atteso su 0 test su 1.");
  });

  it("test non eseguiti dopo un test interrotto", () => {
    const stopped = run({ error: "tempo limite superato", passed: false });
    expect(testsSummary(result([stopped], 8))).toBe(
      "Va in errore su 1 test su 1; gli altri 8 test non sono stati eseguiti dopo l'interruzione.",
    );
    expect(testsSummary(result([stopped], 1))).toContain("l'altro test non è stato eseguito");
  });

  it("in corso, pronta, vista, chiusa", async () => {
    let resolve!: (value: GeneratedSolution) => void;
    const done = startGeneration("g1", "", () => new Promise((r) => (resolve = r)));
    expect(generationOf("g1")).toMatchObject({ state: "pending" });
    resolve(result([]));
    await done;
    expect(generationOf("g1")).toMatchObject({ state: "done", seen: false });
    markGenerationSeen("g1");
    expect(generationOf("g1")).toMatchObject({ seen: true });
    clearGeneration("g1");
    expect(generationOf("g1")).toBeNull();
  });

  it("errore, e vale l'ultima richiesta", async () => {
    await startGeneration("g2", "", async () => {
      throw new Error("Troppe richieste");
    });
    expect(generationOf("g2")).toMatchObject({ state: "error", message: "Troppe richieste" });
    let first!: (value: GeneratedSolution) => void;
    const slow = startGeneration("g2", "", () => new Promise((r) => (first = r)));
    await startGeneration("g2", "", async () => result([run({})]));
    first(result([]));
    await slow;
    expect(generationOf("g2")).toMatchObject({ state: "done", result: { tests: [{ stdin: "1\n3" }] } });
    clearGeneration("g2");
  });
});
