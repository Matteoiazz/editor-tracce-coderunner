// Lettura del file di sessione usato prima dell'archivio delle tracce: serve solo a
// trasferirne il contenuto nell'archivio al primo avvio.

import type { EditableQuestion } from "./exam";
import { DEFAULT_TRACK, type ExamInfo } from "./naming";
import type { TestRow } from "./testcases";

// Versione del formato del vecchio file di sessione
export const SESSION_VERSION = 1;

export interface SessionData {
  exam: ExamInfo;
  common: TestRow[];
  items: EditableQuestion[];
}

/** Legge un salvataggio; null se il contenuto non è valido o di una versione diversa. */
export function parseSession(text: string): SessionData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const exam = data.exam as Record<string, unknown> | undefined;
  const valid =
    data.version === SESSION_VERSION &&
    typeof exam === "object" &&
    exam !== null &&
    typeof exam.date === "string" &&
    (exam.kind === null || exam.kind === "Esame" || exam.kind === "Pretest") &&
    Array.isArray(data.common) &&
    Array.isArray(data.items) &&
    data.items.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as EditableQuestion).id === "string" &&
        typeof (item as EditableQuestion).question === "object" &&
        Array.isArray((item as EditableQuestion).specific),
    );
  if (!valid) return null;
  return {
    exam: {
      date: exam.date as string,
      kind: exam.kind as ExamInfo["kind"],
      // I salvataggi precedenti al numero di traccia valgono come traccia 1
      track: typeof exam.track === "number" || exam.track === null ? exam.track : DEFAULT_TRACK,
    },
    common: data.common as TestRow[],
    // Il vecchio file di sessione non conosce l'esclusione dei test comuni
    items: (data.items as EditableQuestion[]).map((item) => ({
      ...item,
      excludedCommon: Array.isArray(item.excludedCommon) ? item.excludedCommon : [],
    })),
  };
}

export function isEmptySession({ exam, common, items }: SessionData): boolean {
  return !exam.date && exam.kind === null && common.length === 0 && items.length === 0;
}
