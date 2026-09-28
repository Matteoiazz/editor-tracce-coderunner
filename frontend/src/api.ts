// Chiamate al backend Python. L'indirizzo lo fornisce Electron, perché la porta cambia a ogni avvio.

import type { Question, TestOutcome } from "./types";

let backendUrl: Promise<string> | null = null;

function getBackendUrl(): Promise<string> {
  backendUrl ??= window.desktop.getBackendUrl();
  return backendUrl;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${await getBackendUrl()}${path}`, init);
  if (!response.ok) {
    // FastAPI mette il messaggio d'errore nel campo "detail"
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Errore del backend (HTTP ${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function importXml(xml: string): Promise<Question[]> {
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "import.xml");
  return request("/api/questions/import", { method: "POST", body: form });
}

export async function generateStudentCode(solution: string): Promise<string> {
  const result = await request<{ student_code: string }>("/api/questions/student-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ solution }),
  });
  return result.student_code;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Esegue la soluzione su ogni test e restituisce gli esiti, nello stesso ordine. */
export function verifyQuestion(question: Question): Promise<TestOutcome[]> {
  return postJson("/api/questions/verify", question);
}

/** Restituisce l'esercizio con gli output attesi calcolati dalla soluzione. */
export function fillExpected(question: Question): Promise<Question> {
  return postJson("/api/questions/fill-expected", question);
}
