// Importazione di più file XML del docente nell'archivio: gli esercizi vengono raggruppati
// per tipo, data e numero di traccia ricavati dai nomi, e ogni gruppo diventa una traccia.

import type { ImportResult } from "./api";
import { type ArchivedTrack, toArchive, trackLabel, type TrackSummary } from "./archive";
import { adoptImported } from "./exam";
import { DEFAULT_TRACK, EMPTY_EXAM, parseName } from "./naming";
import type { Question } from "./types";

export interface XmlFile {
  path: string;
  content: string;
}

export interface ArchiveImportReport {
  files: number;
  tracks: number;
  exercises: number;
  /** Tracce già presenti nell'archivio, non importate di nuovo. */
  skipped: string[];
  /** File non letti, con il motivo. */
  failed: string[];
  /** Domande di altro tipo presenti nei file e non importate. */
  ignored: number;
}

export interface ArchiveImportDeps {
  importXml: (xml: string) => Promise<ImportResult>;
  saveTrack: (track: ArchivedTrack) => Promise<unknown>;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export async function importIntoArchive(
  files: XmlFile[],
  existing: TrackSummary[],
  deps: ArchiveImportDeps,
): Promise<ArchiveImportReport> {
  const report: ArchiveImportReport = {
    files: files.length,
    tracks: 0,
    exercises: 0,
    skipped: [],
    failed: [],
    ignored: 0,
  };

  // Gruppi per tipo, data e traccia: la stessa traccia divisa in più file diventa una sola
  const groups = new Map<string, Question[]>();
  for (const file of files) {
    try {
      const { questions, ignored } = await deps.importXml(file.content);
      report.ignored += Object.values(ignored).reduce((sum, n) => sum + n, 0);
      for (const question of questions) {
        const parts = parseName(question.name);
        const key = [parts.kind ?? "", parts.date, parts.track ?? DEFAULT_TRACK].join("|");
        groups.set(key, [...(groups.get(key) ?? []), question]);
      }
    } catch (e) {
      report.failed.push(`${fileName(file.path)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const questions of groups.values()) {
    const { exam, common, items } = adoptImported(questions, [], EMPTY_EXAM, []);
    const label = trackLabel({ kind: exam.kind, day: exam.date || null, number: exam.track });
    const duplicate = existing.some(
      (t) => t.kind === exam.kind && t.day === (exam.date || null) && t.number === exam.track,
    );
    if (duplicate) {
      report.skipped.push(label);
      continue;
    }
    await deps.saveTrack(toArchive({ id: crypto.randomUUID(), exam, common, items }));
    report.tracks += 1;
    report.exercises += items.length;
  }
  return report;
}

/** Riepilogo per il docente, es. "Importati 3 file: 2 tracce, 5 esercizi." */
export function importReportMessage(report: ArchiveImportReport): string {
  const files = report.files === 1 ? "1 file" : `${report.files} file`;
  const tracks = report.tracks === 1 ? "1 traccia" : `${report.tracks} tracce`;
  const exercises = report.exercises === 1 ? "1 esercizio" : `${report.exercises} esercizi`;
  const lines = [`Letti ${files}: aggiunte all'archivio ${tracks} con ${exercises}.`];
  if (report.skipped.length > 0) {
    lines.push(`Già presenti nell'archivio, non importate di nuovo: ${report.skipped.join("; ")}.`);
  }
  if (report.ignored > 0) {
    lines.push(
      report.ignored === 1
        ? "Ignorata 1 domanda che non è di tipo CodeRunner."
        : `Ignorate ${report.ignored} domande che non sono di tipo CodeRunner.`,
    );
  }
  if (report.failed.length > 0) {
    lines.push(`File non letti: ${report.failed.join("; ")}`);
  }
  return lines.join("\n");
}
