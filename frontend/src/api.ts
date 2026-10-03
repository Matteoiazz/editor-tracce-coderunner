// Chiamate al backend Python. L'indirizzo lo fornisce Electron, perché la porta cambia a ogni avvio.

import type { ArchivedTrack, TrackSummary } from "./archive";
import type { Question, TestOutcome } from "./types";

let backendUrl: Promise<string> | null = null;

function getBackendUrl(): Promise<string> {
  backendUrl ??= window.desktop.getBackendUrl();
  return backendUrl;
}

export const BACKEND_UNREACHABLE =
  "Il backend non risponde. Chiudi e riapri l'applicazione; se il problema continua, riavvia il computer.";

async function send(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${await getBackendUrl()}${path}`, init);
  } catch {
    // fetch fallisce senza risposta solo se il backend non è raggiungibile
    throw new Error(BACKEND_UNREACHABLE);
  }
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

export interface ImportResult {
  questions: Question[];
  /** Domande di altro tipo non importate, per tipo Moodle (es. { multichoice: 2 }). */
  ignored: Record<string, number>;
}

export function importXml(xml: string): Promise<ImportResult> {
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

// ---------------------------------------------------------------- archivio delle tracce

export function listTracks(trash = false): Promise<TrackSummary[]> {
  return request(`/api/tracks${trash ? "?trash=true" : ""}`, { method: "GET" });
}

export function getTrack(id: string): Promise<ArchivedTrack> {
  return request(`/api/tracks/${encodeURIComponent(id)}`, { method: "GET" });
}

export function saveTrack(track: ArchivedTrack): Promise<ArchivedTrack> {
  return request(`/api/tracks/${encodeURIComponent(track.id)}`, {
    ...jsonBody(track),
    method: "PUT",
  });
}

export function markExported(id: string): Promise<ArchivedTrack> {
  return request(`/api/tracks/${encodeURIComponent(id)}/exported`, { method: "POST" });
}

export function duplicateTrack(id: string): Promise<ArchivedTrack> {
  return request(`/api/tracks/${encodeURIComponent(id)}/duplicate`, { method: "POST" });
}

export async function trashTrack(id: string): Promise<void> {
  await send(`/api/tracks/${encodeURIComponent(id)}/trash`, { method: "POST" });
}

export async function restoreTrack(id: string): Promise<void> {
  await send(`/api/tracks/${encodeURIComponent(id)}/restore`, { method: "POST" });
}

/** Eliminazione definitiva di una traccia del cestino. */
export async function deleteTrack(id: string): Promise<void> {
  await send(`/api/tracks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Svuota il cestino e restituisce quante tracce sono state eliminate. */
export async function emptyTrash(): Promise<number> {
  return (await request<{ deleted: number }>("/api/trash", { method: "DELETE" })).deleted;
}
