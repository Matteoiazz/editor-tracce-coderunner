// Esercizi simili proposti con l'AI: forma della risposta del backend e stato della richiesta
// per esercizio di partenza. Come le revisioni, resta finché l'app è aperta e sopravvive al
// cambio di esercizio anche con la richiesta in corso.

import { useSyncExternalStore } from "react";
import { isSkeletonSolution } from "./export";
import { aiTextProblem } from "./richtext";
import type { Question } from "./types";

/** Stessa forma del JSON del backend (tesi.application.similar). */
export interface Proposal {
  title: string;
  /** Testo semplice per l'anteprima e lo stesso in HTML per l'editor del testo. */
  text: string;
  text_html: string;
  solution: string;
  samples: { stdin: string; output: string }[];
}

export interface SimilarExercises {
  proposals: Proposal[];
  /** Proposte scartate perché non superavano i controlli. */
  discarded: number;
  /** Input su cui sono state eseguite le proposte: zero se non c'erano test. */
  checked_inputs: number;
}

/** Quali controlli hanno superato le proposte, per la finestra che le mostra. */
export function checksText(result: SimilarExercises): string {
  if (result.checked_inputs === 0) {
    return (
      "Non c'erano test su cui eseguirle: è stato controllato solo che siano Python valido, con una " +
      "funzione e un main che legge l'input. Dopo averne aggiunta una, calcola gli output dei test."
    );
  }
  const inputs = result.checked_inputs === 1 ? "sull'input di 1 test" : `sugli input di ${result.checked_inputs} test`;
  return `Ogni proposta è stata eseguita ${inputs} senza errori e dà risultati diversi dall'esercizio di partenza.`;
}

/** Perché la richiesta non può partire, oppure null. */
export function similarProblem(question: Question): string | null {
  const textProblem = aiTextProblem(
    question.text_html,
    "Scrivi prima il testo dell'esercizio: gli esercizi simili si costruiscono su questo.",
  );
  if (textProblem) return textProblem;
  if (!question.solution.trim() || isSkeletonSolution(question.solution)) {
    return "Scrivi prima la soluzione: serve per proporre esercizi con la stessa struttura.";
  }
  return null;
}

/** Riepilogo, es. "3 proposte" o "2 proposte (1 scartata perché non superava i controlli)". */
export function similarSummary(result: SimilarExercises): string {
  const count = result.proposals.length;
  const proposals =
    count === 0 ? "Nessuna proposta valida" : count === 1 ? "1 proposta" : `${count} proposte`;
  if (result.discarded === 0) return proposals;
  const discarded = result.discarded === 1 ? "1 scartata" : `${result.discarded} scartate`;
  return `${proposals} (${discarded} perché non superava${result.discarded === 1 ? "" : "no"} i controlli)`;
}

// ---------------------------------------------------------------- stato per esercizio

export type SimilarEntry =
  | { state: "pending" }
  | { state: "error"; message: string }
  /** `added`: per indice della proposta, il nome dell'esercizio creato. */
  | { state: "done"; result: SimilarExercises; seen: boolean; added: Record<number, string> };

const entries = new Map<string, SimilarEntry>();
const listeners = new Set<() => void>();

function set(id: string, entry: SimilarEntry | null) {
  if (entry) entries.set(id, entry);
  else entries.delete(id);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function similarOf(id: string): SimilarEntry | null {
  return entries.get(id) ?? null;
}

export function useSimilar(id: string): SimilarEntry | null {
  return useSyncExternalStore(subscribe, () => similarOf(id));
}

/** Avvia la richiesta; se ne parte un'altra mentre la precedente è in corso, vale l'ultima. */
export async function startSimilar(id: string, request: () => Promise<SimilarExercises>) {
  const pending: SimilarEntry = { state: "pending" };
  set(id, pending);
  try {
    const result = await request();
    if (entries.get(id) === pending) set(id, { state: "done", result, seen: false, added: {} });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (entries.get(id) === pending) set(id, { state: "error", message });
  }
}

export function markSimilarSeen(id: string) {
  const entry = entries.get(id);
  if (entry?.state === "done") set(id, { ...entry, seen: true });
}

export function markProposalAdded(id: string, index: number, name: string) {
  const entry = entries.get(id);
  if (entry?.state === "done") set(id, { ...entry, added: { ...entry.added, [index]: name } });
}

export function clearSimilar(id: string) {
  set(id, null);
}
