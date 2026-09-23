// Convenzione dei nomi del docente: Esercizio<N>-<AAAA-MM-GG>-<Esame|Pretest>.
// Stessa regola di tesi.domain.question_name nel backend: qui serve per mostrare
// il nome aggiornato mentre il docente compila i campi.

export type ExamKind = "Esame" | "Pretest";

export interface NameParts {
  number: number | null;
  date: string; // "AAAA-MM-GG", oppure "" se non indicata
  kind: ExamKind | null;
}

export function buildName(parts: NameParts): string | null {
  if (parts.number === null || !parts.date || parts.kind === null) return null;
  return `Esercizio${parts.number}-${parts.date}-${parts.kind}`;
}

/** Ricava i campi da un nome esistente: ogni parte è riconosciuta indipendentemente,
 *  quelle che mancano restano vuote. Es. "Esame-2026-07-03 - Traccia 1 - Esercizio 3". */
export function parseName(name: string): NameParts {
  const number = name.match(/esercizio\s*(?:pretest\s*)?(\d+)/i);
  const date = name.match(/\d{4}-\d{2}-\d{2}/);
  const kind: ExamKind | null = /pretest/i.test(name)
    ? "Pretest"
    : /esame/i.test(name)
      ? "Esame"
      : null;
  return {
    number: number ? Number(number[1]) : null,
    date: date ? date[0] : "",
    kind,
  };
}
