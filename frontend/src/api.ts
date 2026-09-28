// Chiamate al backend Python. L'indirizzo lo fornisce Electron, perché la porta cambia a ogni avvio.

import type { Question, TestOutcome } from "./types";

let backendUrl: Promise<string> | null = null;

function getBackendUrl(): Promise<string> {
  backendUrl ??= window.desktop.getBackendUrl();
  return backendUrl;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${await getBackendUrl()}${path}`, init);
  if (!response.ok) {
    // FastAPI mette il messaggio d'errore nel campo "detail"
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Errore del backend (HTTP ${response.status})`);
  }
  return response;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  return (await send(path, init)).json() as Promise<T>;
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function importXml(xml: string): Promise<Question[]> {
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "import.xml");
  return request("/api/questions/import", { method: "POST", body: form });
}

/** Restituisce il testo del file XML Moodle con gli esercizi indicati. */
export async function exportXml(questions: Question[]): Promise<string> {
  return (await send("/api/questions/export", jsonBody(questions))).text();
}

export async function generateStudentCode(solution: string): Promise<string> {
  const result = await request<{ student_code: string }>(
    "/api/questions/student-code",
    jsonBody({ solution }),
  );
  return result.student_code;
}

/** Esegue la soluzione su ogni test e restituisce gli esiti, nello stesso ordine. */
export function verifyQuestion(question: Question): Promise<TestOutcome[]> {
  return request("/api/questions/verify", jsonBody(question));
}

/** Restituisce l'esercizio con gli output attesi calcolati dalla soluzione. */
export function fillExpected(question: Question): Promise<Question> {
  return request("/api/questions/fill-expected", jsonBody(question));
}
