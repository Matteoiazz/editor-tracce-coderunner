import { describe, expect, it } from "vitest";
import { SOLUTION_SKELETON } from "./exam";
import {
  checksText,
  clearSimilar,
  markProposalAdded,
  markSimilarSeen,
  type SimilarExercises,
  similarOf,
  similarProblem,
  similarSummary,
  startSimilar,
} from "./similar";
import type { Question } from "./types";

const question = { text_html: "<p>Somma dei pari</p>", solution: "def f(lst):\n    return 0\n" } as Question;
const proposal = { title: "Massimo", text: "t", text_html: "<p>t</p>", solution: "s", samples: [] };

describe("esercizi simili", () => {
  it("servono testo e soluzione scritta", () => {
    expect(similarProblem(question)).toBeNull();
    expect(similarProblem({ ...question, text_html: "" })).toContain("Scrivi prima il testo");
    expect(similarProblem({ ...question, solution: SOLUTION_SKELETON })).toContain("Scrivi prima la soluzione");
    expect(similarProblem({ ...question, solution: " " })).toContain("Scrivi prima la soluzione");
  });

  it("riepilogo", () => {
    expect(similarSummary({ proposals: [proposal, proposal, proposal], discarded: 0, checked_inputs: 9 })).toBe("3 proposte");
    expect(similarSummary({ proposals: [proposal], discarded: 2, checked_inputs: 9 })).toBe(
      "1 proposta (2 scartate perché non superavano i controlli)",
    );
    expect(similarSummary({ proposals: [], discarded: 1, checked_inputs: 9 })).toBe(
      "Nessuna proposta valida (1 scartata perché non superava i controlli)",
    );
  });

  it("dice su quanti test sono state eseguite, o che non c'erano test", () => {
    const result = (checked: number): SimilarExercises => ({ proposals: [proposal], discarded: 0, checked_inputs: checked });
    expect(checksText(result(9))).toBe(
      "Ogni proposta è stata eseguita sugli input di 9 test senza errori e dà risultati diversi dall'esercizio di partenza.",
    );
    expect(checksText(result(1))).toContain("sull'input di 1 test");
    expect(checksText(result(0))).toContain("Non c'erano test su cui eseguirle");
  });

  it("in corso, pronte, aggiunte una alla volta", async () => {
    let resolve!: (value: SimilarExercises) => void;
    const done = startSimilar("s1", () => new Promise((r) => (resolve = r)));
    expect(similarOf("s1")).toEqual({ state: "pending" });
    resolve({ proposals: [proposal, proposal], discarded: 0, checked_inputs: 9 });
    await done;
    expect(similarOf("s1")).toMatchObject({ state: "done", seen: false, added: {} });
    markSimilarSeen("s1");
    markProposalAdded("s1", 1, "Esame-2027-02-14-Traccia2-Esercizio3");
    expect(similarOf("s1")).toMatchObject({ seen: true, added: { 1: "Esame-2027-02-14-Traccia2-Esercizio3" } });
    clearSimilar("s1");
    expect(similarOf("s1")).toBeNull();
  });

  it("errore della richiesta", async () => {
    await startSimilar("s2", async () => {
      throw new Error("Il modello non ha proposto esercizi: riprova");
    });
    expect(similarOf("s2")).toEqual({ state: "error", message: "Il modello non ha proposto esercizi: riprova" });
    clearSimilar("s2");
  });
});
