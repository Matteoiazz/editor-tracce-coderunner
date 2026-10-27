// Revisione della soluzione con l'AI: forma della risposta del backend, testi mostrati e
// memoria delle revisioni fatte. Le revisioni restano finché l'app è aperta (non vanno
// nell'archivio) e sopravvivono al cambio di esercizio, anche se la richiesta è ancora in corso.

import { useSyncExternalStore } from "react";
import { newRow, type TestRow } from "./testcases";
import type { Question } from "./types";

export type FindingKind = "errore" | "caso_limite" | "testo" | "test_mancante";

/** Stessa forma del JSON del backend (tesi.application.review). */
export interface Finding {
  kind: FindingKind;
  title: string;
  explanation: string;
  /** Riga della soluzione, se il modello la indica. */
  line: number | null;
}

export interface SuggestedTest {
  stdin: string;
  reason: string;
  /** Output della soluzione su questo input; vuoto se è andata in errore. */
  output: string;
  error: string;
}

export interface Review {
  findings: Finding[];
  tests: SuggestedTest[];
}

export const KIND_LABELS: Record<FindingKind, string> = {
  errore: "Possibile errore",
  caso_limite: "Caso limite",
  testo: "Testo",
  test_mancante: "Test mancante",
};

const KIND_ORDER: FindingKind[] = ["errore", "caso_limite", "testo", "test_mancante"];

/** Segnalazioni con la loro posizione nella risposta, prima quelle sulla correttezza. */
export function sortedFindings(findings: Finding[]): { finding: Finding; index: number }[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => KIND_ORDER.indexOf(a.finding.kind) - KIND_ORDER.indexOf(b.finding.kind));
}

/** Input su una riga, es. "3 · 0", per l'elenco dei test suggeriti. */
export function inputSummary(stdin: string): string {
  return stdin.split("\n").join(" · ");
}

/** Il test da aggiungere ai test specifici, con l'output già calcolato dalla revisione. */
export function suggestionRow(test: SuggestedTest): TestRow {
  return { ...newRow(test.stdin), expected: test.output };
}

/** Testo e soluzione su cui è stata fatta la revisione: se cambiano, la revisione è superata. */
export function reviewSnapshot(question: Question): string {
  return JSON.stringify([question.text_html, question.solution]);
}

/** Riepilogo in una frase, es. "2 segnalazioni e 3 test suggeriti". */
export function reviewSummary(review: Review): string {
  const findings = review.findings.length;
  const tests = review.tests.length;
  if (findings === 0 && tests === 0) return "Nessun problema trovato";
  const parts = [];
  if (findings > 0) parts.push(findings === 1 ? "1 segnalazione" : `${findings} segnalazioni`);
  if (tests > 0) parts.push(tests === 1 ? "1 test suggerito" : `${tests} test suggeriti`);
  return parts.join(" e ");
}

// ---------------------------------------------------------------- revisioni per esercizio

export type ReviewEntry =
  | { state: "pending"; snapshot: string }
  | { state: "error"; snapshot: string; message: string }
  | {
      state: "done";
      snapshot: string;
      review: Review;
      /** Indici delle segnalazioni ignorate e dei test già aggiunti. */
      dismissed: number[];
      added: number[];
    };

const entries = new Map<string, ReviewEntry>();
const listeners = new Set<() => void>();

function set(id: string, entry: ReviewEntry | null) {
  if (entry) entries.set(id, entry);
  else entries.delete(id);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reviewOf(id: string): ReviewEntry | null {
  return entries.get(id) ?? null;
}

/** Revisione dell'esercizio con identificativo `id`, aggiornata quando cambia. */
export function useReview(id: string): ReviewEntry | null {
  return useSyncExternalStore(subscribe, () => reviewOf(id));
}

/** Avvia la revisione; se ne arriva una nuova mentre la precedente è in corso, vale l'ultima. */
export async function startReview(
  id: string,
  question: Question,
  request: (question: Question) => Promise<Review>,
) {
  const snapshot = reviewSnapshot(question);
  const pending: ReviewEntry = { state: "pending", snapshot };
  set(id, pending);
  try {
    const review = await request(question);
    if (entries.get(id) === pending) set(id, { state: "done", snapshot, review, dismissed: [], added: [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (entries.get(id) === pending) set(id, { state: "error", snapshot, message });
  }
}

export function dismissFinding(id: string, index: number) {
  const entry = entries.get(id);
  if (entry?.state === "done") set(id, { ...entry, dismissed: [...entry.dismissed, index] });
}

export function markTestsAdded(id: string, indexes: number[]) {
  const entry = entries.get(id);
  if (entry?.state === "done") set(id, { ...entry, added: [...new Set([...entry.added, ...indexes])] });
}

export function closeReview(id: string) {
  set(id, null);
}
