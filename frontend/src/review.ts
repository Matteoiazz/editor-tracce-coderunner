// Revisione della soluzione con l'AI: forma della risposta del backend, testi mostrati e
// memoria delle revisioni fatte. Le revisioni restano finché l'app è aperta (non vanno
// nell'archivio) e sopravvivono al cambio di esercizio, anche se la richiesta è ancora in corso.

import { useSyncExternalStore } from "react";
import { hasText, isSkeletonSolution } from "./export";
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

/** Esito della correzione proposta dal modello (tesi.application.fix). */
export interface TestComparison {
  stdin: string;
  before: string;
  after: string;
  before_error: string;
  after_error: string;
  /** La soluzione corretta dà lo stesso risultato di quella attuale. */
  same: boolean;
}

export interface Fix {
  solution: string;
  explanation: string;
  tests: TestComparison[];
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

/** Solo i problemi della soluzione si possono correggere: testo e test si sistemano a mano. */
export function canFix(finding: Finding): boolean {
  return finding.kind === "errore" || finding.kind === "caso_limite";
}

/** Riepilogo del confronto tra soluzione attuale e corretta, es. "Su 9 test il risultato non
 *  cambia, su 2 cambia". */
export function comparisonSummary(tests: TestComparison[]): string {
  const changed = tests.filter((t) => !t.same).length;
  const same = tests.length - changed;
  const broken = tests.filter((t) => t.after_error && !t.before_error).length;
  const parts = [];
  if (same > 0) parts.push(`su ${same} test il risultato non cambia`);
  if (changed > 0) parts.push(`su ${changed} cambia`);
  let text = parts.join(", ");
  text = text ? text[0].toUpperCase() + text.slice(1) : "Nessun test su cui confrontare";
  if (broken > 0) {
    text += `. Attenzione: su ${broken} test la soluzione corretta va in errore`;
  }
  return `${text}.`;
}

/** Input su una riga, es. "3 · 0", per l'elenco dei test suggeriti. */
export function inputSummary(stdin: string): string {
  return stdin.split("\n").join(" · ");
}

/** Il test da aggiungere ai test specifici, con l'output già calcolato dalla revisione. */
export function suggestionRow(test: SuggestedTest): TestRow {
  return { ...newRow(test.stdin), expected: test.output };
}

/** Perché la revisione non può partire (testo o soluzione mancanti), oppure null: si controlla
 *  prima di inviare, così non si consuma una richiesta al modello. */
export function reviewProblem(question: Question): string | null {
  if (!hasText(question.text_html)) {
    return "Scrivi prima la traccia: la revisione confronta la soluzione con quello che chiede il testo.";
  }
  if (!question.solution.trim()) return "Scrivi prima la soluzione.";
  if (isSkeletonSolution(question.solution)) {
    return "Scrivi prima la soluzione: è ancora quella di partenza dell'esercizio nuovo.";
  }
  return null;
}

/** Perché la chiave non si può usare per la revisione, oppure null. */
export function keyProblemForReview(status: ApiKeyStatus): string | null {
  if (status.problem) return `La chiave di OpenRouter non si può leggere (${status.problem}).`;
  if (!status.saved) return "Per la revisione serve la chiave di OpenRouter: inseriscila nelle Impostazioni.";
  if (status.protected && !status.unlocked) {
    return "La chiave di OpenRouter è protetta da master password: sbloccala nelle Impostazioni, poi premi di nuovo «Rivedi con l'AI».";
  }
  return null;
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

/** Cosa ha deciso il docente per una segnalazione: correggerla da sé ("manual"), segnarla come
 *  risolta, oppure ha applicato la correzione dell'AI ("fixed"). */
export type FindingState = "manual" | "resolved" | "fixed";

/** Correzione chiesta al modello per una segnalazione. `solution`: la soluzione al momento della
 *  richiesta; la correzione si applica solo se nel frattempo non è cambiata. */
export type FixEntry =
  | { state: "pending"; solution: string }
  | { state: "error"; solution: string; message: string }
  | { state: "done"; solution: string; fix: Fix; seen: boolean }
  /** Applicata: `solution` è quella di prima, per poterla ripristinare. */
  | { state: "applied"; solution: string };

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
      /** Per indice della segnalazione. */
      findingStates: Record<number, FindingState>;
      fixes: Record<number, FixEntry>;
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
    if (entries.get(id) === pending) {
      set(id, { state: "done", snapshot, review, dismissed: [], added: [], findingStates: {}, fixes: {} });
    }
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

export function setFindingState(id: string, index: number, state: FindingState | null) {
  const entry = entries.get(id);
  if (entry?.state !== "done") return;
  const findingStates = { ...entry.findingStates };
  if (state) findingStates[index] = state;
  else delete findingStates[index];
  set(id, { ...entry, findingStates });
}

function setFix(id: string, index: number, fix: FixEntry | null) {
  const entry = entries.get(id);
  if (entry?.state !== "done") return;
  const fixes = { ...entry.fixes };
  if (fix) fixes[index] = fix;
  else delete fixes[index];
  set(id, { ...entry, fixes });
}

/** Chiede la correzione di una segnalazione; vale l'ultima richiesta per quella segnalazione. */
export async function startFix(id: string, index: number, solution: string, request: () => Promise<Fix>) {
  const pending: FixEntry = { state: "pending", solution };
  setFix(id, index, pending);
  const current = () => {
    const entry = entries.get(id);
    return entry?.state === "done" && entry.fixes[index] === pending;
  };
  try {
    const fix = await request();
    if (current()) setFix(id, index, { state: "done", solution, fix, seen: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (current()) setFix(id, index, { state: "error", solution, message });
  }
}

export function markFixSeen(id: string, index: number) {
  const entry = entries.get(id);
  const fix = entry?.state === "done" ? entry.fixes[index] : undefined;
  if (fix?.state === "done") setFix(id, index, { ...fix, seen: true });
}

/** La correzione è stata applicata: si ricorda la soluzione di prima. */
export function markFixApplied(id: string, index: number, previous: string) {
  setFix(id, index, { state: "applied", solution: previous });
  setFindingState(id, index, "fixed");
}

export function discardFix(id: string, index: number) {
  setFix(id, index, null);
}

/** Dopo il ripristino della soluzione precedente la segnalazione torna da decidere. */
export function undoFix(id: string, index: number) {
  setFix(id, index, null);
  setFindingState(id, index, null);
}

export function closeReview(id: string) {
  set(id, null);
}

// ---------------------------------------------------------------- indicazioni aggiuntive

/** Lunghezza massima delle indicazioni aggiuntive, come nel backend. */
export const MAX_NOTES = 4000;

// Ultime indicazioni scritte per ogni esercizio, riproposte alla richiesta successiva
const notesByItem = new Map<string, string>();

export function reviewNotes(id: string): string {
  return notesByItem.get(id) ?? "";
}

export function rememberReviewNotes(id: string, notes: string) {
  if (notes) notesByItem.set(id, notes);
  else notesByItem.delete(id);
}
