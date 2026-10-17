// Convenzione dei nomi del docente:
//   Esame:   Esame-<AAAA-MM-GG>-Traccia<T>-Esercizio<N>
//   Pretest: Pretest-<AAAA-MM-GG>-Traccia<T>   (un solo esercizio, senza numero)
// Stessa regola di tesi.domain.question_name nel backend: qui serve per mostrare
// il nome aggiornato mentre il docente compila i campi.

export type ExamKind = "Esame" | "Pretest";

/** Dati comuni a tutti gli esercizi della traccia. */
export interface ExamInfo {
  date: string; // "AAAA-MM-GG", oppure "" se non indicata
  kind: ExamKind | null;
  /** Numero della traccia: tracce diverse dello stesso giorno hanno nomi diversi. */
  track: number | null;
}

export const DEFAULT_TRACK = 1;

export const EMPTY_EXAM: ExamInfo = { date: "", kind: null, track: DEFAULT_TRACK };

/** Parti riconosciute in un nome esistente. */
export interface NameParts extends ExamInfo {
  number: number | null;
}

export function buildName(number: number | null, exam: ExamInfo): string | null {
  const { date, kind, track } = exam;
  if (!date || kind === null || track === null) return null;
  if (kind === "Pretest") return `Pretest-${date}-Traccia${track}`;
  if (number === null) return null;
  return `Esame-${date}-Traccia${track}-Esercizio${number}`;
}

/** Ricava le parti da un nome esistente: ogni parte è riconosciuta indipendentemente,
 *  quelle che mancano restano vuote. Riconosce lo schema attuale, quello precedente
 *  (es. "Esercizio1-2026-07-03-Esame") e la forma con spazi degli export di Moodle
 *  (es. "Esame-2026-07-03 - Traccia 1 - Esercizio 3"). */
export function parseName(name: string): NameParts {
  const number = name.match(/esercizio\s*(?:pretest\s*)?(\d+)/i);
  const track = name.match(/traccia\s*(\d+)/i);
  const date = name.match(/\d{4}-\d{2}-\d{2}/);
  const kind: ExamKind | null = /pretest/i.test(name)
    ? "Pretest"
    : /esame/i.test(name)
      ? "Esame"
      : null;
  return {
    number: number ? Number(number[1]) : null,
    track: track ? Number(track[1]) : null,
    date: date ? date[0] : "",
    kind,
  };
}

/** Data in forma estesa, es. "3 luglio 2026"; null se assente. */
export function formatDay(day: string | null): string | null {
  if (!day) return null;
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
