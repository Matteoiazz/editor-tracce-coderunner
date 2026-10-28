// Soluzione generata con l'AI: forma della risposta del backend, testi mostrati e stato della
// richiesta per esercizio. Come le revisioni, resta finché l'app è aperta e sopravvive al cambio
// di esercizio anche con la richiesta in corso.

import { useSyncExternalStore } from "react";
import { isSkeletonSolution } from "./export";
import { aiTextProblem } from "./richtext";
import type { Question } from "./types";

/** Stessa forma del JSON del backend (tesi.application.generate). */
export interface TestRun {
  stdin: string;
  output: string;
  error: string;
  /** Output atteso già presente nel test, vuoto se non calcolato. */
  expected: string;
  passed: boolean;
}

export interface GeneratedSolution {
  solution: string;
  explanation: string;
  attempts: number;
  tests: TestRun[];
  /** Problemi rimasti dopo l'ultimo tentativo; vuoto se supera tutti i controlli. */
  problems: string[];
  /** Test non eseguiti dopo un test interrotto (tempo limite o output eccessivo); `tests`
   *  contiene solo quelli eseguiti. */
  not_run: number;
}

/** Perché la generazione non può partire, oppure null. */
export function generationProblem(question: Question): string | null {
  return aiTextProblem(
    question.text_html,
    "Scrivi prima il testo dell'esercizio: la soluzione si genera da quello che chiede.",
  );
}

/** Vero se generare sostituirebbe una soluzione scritta dal docente (va chiesta conferma). */
export function replacesSolution(question: Question): boolean {
  return question.solution.trim() !== "" && !isSkeletonSolution(question.solution);
}

/** Es. "Al primo tentativo", "Dopo 3 tentativi". */
export function attemptsText(attempts: number): string {
  return attempts === 1 ? "Al primo tentativo" : `Dopo ${attempts} tentativi`;
}

/** Esito sui test in una frase. */
export function testsSummary(result: GeneratedSolution): string {
  const total = result.tests.length;
  if (total === 0) return "Nessun test su cui eseguirla: aggiungi i test e verifica dopo averla applicata.";
  const errors = result.tests.filter((t) => t.error).length;
  const compared = result.tests.filter((t) => t.expected && !t.error);
  const matching = compared.filter((t) => t.passed).length;
  const parts = [errors === 0 ? `Eseguita su ${total} test senza errori` : `Va in errore su ${errors} test su ${total}`];
  if (compared.length > 0) {
    parts.push(
      matching < compared.length
        ? `output uguale a quello atteso su ${matching} test su ${compared.length}`
        : compared.length === 1
          ? "output uguale a quello atteso sull'unico test che lo ha"
          : `output uguale a quello atteso su tutti i ${compared.length} test che lo hanno`,
    );
  }
  if (result.not_run > 0) {
    parts.push(
      result.not_run === 1
        ? "l'altro test non è stato eseguito dopo l'interruzione"
        : `gli altri ${result.not_run} test non sono stati eseguiti dopo l'interruzione`,
    );
  }
  return `${parts.join("; ")}.`;
}

// ---------------------------------------------------------------- stato per esercizio

/** `solution`: la soluzione al momento della richiesta; la proposta si applica solo se nel
 *  frattempo non è cambiata. */
export type GenerationEntry =
  | { state: "pending"; solution: string }
  | { state: "error"; solution: string; message: string }
  | { state: "done"; solution: string; result: GeneratedSolution; seen: boolean };

const entries = new Map<string, GenerationEntry>();
const listeners = new Set<() => void>();

function set(id: string, entry: GenerationEntry | null) {
  if (entry) entries.set(id, entry);
  else entries.delete(id);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function generationOf(id: string): GenerationEntry | null {
  return entries.get(id) ?? null;
}

export function useGeneration(id: string): GenerationEntry | null {
  return useSyncExternalStore(subscribe, () => generationOf(id));
}

/** Avvia la generazione; se ne parte un'altra mentre la precedente è in corso, vale l'ultima. */
export async function startGeneration(id: string, solution: string, request: () => Promise<GeneratedSolution>) {
  const pending: GenerationEntry = { state: "pending", solution };
  set(id, pending);
  try {
    const result = await request();
    if (entries.get(id) === pending) set(id, { state: "done", solution, result, seen: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (entries.get(id) === pending) set(id, { state: "error", solution, message });
  }
}

export function markGenerationSeen(id: string) {
  const entry = entries.get(id);
  if (entry?.state === "done") set(id, { ...entry, seen: true });
}

export function clearGeneration(id: string) {
  set(id, null);
}
