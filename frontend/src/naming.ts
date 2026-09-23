// Convenzione dei nomi del docente: Esercizio<N>-<AAAA-MM-GG>-<Esame|Pretest>.
// Stessa regola di tesi.domain.question_name nel backend: qui serve per mostrare
// il nome aggiornato mentre il docente compila i campi.

export type ExamKind = "Esame" | "Pretest";

/** Dati comuni a tutti gli esercizi dell'esame. */
export interface ExamInfo {
  date: string; // "AAAA-MM-GG", oppure "" se non indicata
  kind: ExamKind | null;
}

/** Parti riconosciute in un nome esistente. */
export interface NameParts extends ExamInfo {
  number: number | null;
}

export function buildName(number: number | null, exam: ExamInfo): string | null {
  if (number === null || !exam.date || exam.kind === null) return null;
  return `Esercizio${number}-${exam.date}-${exam.kind}`;
}

/** Ricava le parti da un nome esistente: ogni parte è riconosciuta indipendentemente,
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
