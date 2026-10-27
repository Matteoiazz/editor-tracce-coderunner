import { describe, expect, it } from "vitest";
import {
  closeReview,
  dismissFinding,
  type Finding,
  inputSummary,
  keyProblemForReview,
  markTestsAdded,
  type Review,
  reviewOf,
  reviewProblem,
  reviewSnapshot,
  reviewSummary,
  sortedFindings,
  startReview,
  suggestionRow,
} from "./review";
import { SOLUTION_SKELETON } from "./exam";
import type { Question } from "./types";

const question = { text_html: "<p>Testo</p>", solution: "print(1)" } as Question;

const finding = (kind: Finding["kind"], title: string): Finding => ({ kind, title, explanation: "", line: null });

const REVIEW: Review = {
  findings: [finding("testo", "a"), finding("errore", "b"), finding("test_mancante", "c")],
  tests: [{ stdin: "3\n0", reason: "lista vuota", output: "3\n0\n0\n", error: "" }],
};

describe("testi della revisione", () => {
  it("prima le segnalazioni sulla correttezza, con la posizione originale", () => {
    expect(sortedFindings(REVIEW.findings).map(({ finding, index }) => [finding.title, index])).toEqual([
      ["b", 1],
      ["a", 0],
      ["c", 2],
    ]);
  });

  it("input su una riga", () => {
    expect(inputSummary("3\n10")).toBe("3 · 10");
  });

  it("riepilogo", () => {
    expect(reviewSummary(REVIEW)).toBe("3 segnalazioni e 1 test suggerito");
    expect(reviewSummary({ findings: [], tests: [] })).toBe("Nessun problema trovato");
    expect(reviewSummary({ findings: [finding("testo", "a")], tests: [] })).toBe("1 segnalazione");
  });

  it("il test aggiunto ha l'output già calcolato", () => {
    const row = suggestionRow(REVIEW.tests[0]);
    expect(row.stdin).toBe("3\n0");
    expect(row.expected).toBe("3\n0\n0\n");
    expect(row.id).toBeTruthy();
  });

  it("la revisione è superata se cambiano testo o soluzione, non i test", () => {
    const base = reviewSnapshot(question);
    expect(reviewSnapshot({ ...question, testcases: [] })).toBe(base);
    expect(reviewSnapshot({ ...question, solution: "print(2)" })).not.toBe(base);
    expect(reviewSnapshot({ ...question, text_html: "<p>Altro</p>" })).not.toBe(base);
  });
});

describe("revisioni per esercizio", () => {
  it("in corso, poi completata; ignora e aggiunge", async () => {
    let resolve!: (review: Review) => void;
    const done = startReview("es1", question, (q) => {
      expect(q).toBe(question);
      return new Promise<Review>((r) => (resolve = r));
    });
    expect(reviewOf("es1")).toMatchObject({ state: "pending" });
    resolve(REVIEW);
    await done;
    dismissFinding("es1", 1);
    markTestsAdded("es1", [0]);
    markTestsAdded("es1", [0]);
    expect(reviewOf("es1")).toMatchObject({ state: "done", dismissed: [1], added: [0] });
    closeReview("es1");
    expect(reviewOf("es1")).toBeNull();
  });

  it("errore della richiesta", async () => {
    await startReview("es2", question, async () => {
      throw new Error("Troppe richieste");
    });
    expect(reviewOf("es2")).toMatchObject({ state: "error", message: "Troppe richieste" });
    closeReview("es2");
  });

  it("vale l'ultima revisione avviata", async () => {
    let first!: (review: Review) => void;
    const slow = startReview("es3", question, () => new Promise<Review>((r) => (first = r)));
    await startReview("es3", question, async () => ({ findings: [], tests: [] }));
    first(REVIEW);
    await slow;
    expect(reviewOf("es3")).toMatchObject({ state: "done", review: { findings: [] } });
    closeReview("es3");
  });
});

describe("controlli prima della revisione", () => {
  it("serve il testo della traccia", () => {
    expect(reviewProblem({ ...question, text_html: "" })).toContain("Scrivi prima la traccia");
    expect(reviewProblem({ ...question, text_html: "<p>&nbsp;</p>" })).toContain("Scrivi prima la traccia");
  });

  it("serve una soluzione scritta dal docente", () => {
    expect(reviewProblem({ ...question, solution: "  \n" })).toBe("Scrivi prima la soluzione.");
    expect(reviewProblem({ ...question, solution: SOLUTION_SKELETON })).toContain("quella di partenza");
  });

  it("testo e soluzione presenti", () => {
    expect(reviewProblem(question)).toBeNull();
  });

  const status = (changes: Partial<ApiKeyStatus>): ApiKeyStatus => ({
    saved: true,
    mask: "sk-or-v1-••••89ab",
    protected: false,
    unlocked: false,
    weakKeychain: false,
    problem: null,
    ...changes,
  });

  it("chiave mancante, bloccata o illeggibile", () => {
    expect(keyProblemForReview(status({ saved: false, mask: null }))).toContain("inseriscila nelle Impostazioni");
    expect(keyProblemForReview(status({ protected: true }))).toContain("sbloccala nelle Impostazioni");
    expect(keyProblemForReview(status({ problem: "file danneggiato" }))).toContain("file danneggiato");
  });

  it("chiave utilizzabile", () => {
    expect(keyProblemForReview(status({}))).toBeNull();
    expect(keyProblemForReview(status({ protected: true, unlocked: true }))).toBeNull();
  });
});
