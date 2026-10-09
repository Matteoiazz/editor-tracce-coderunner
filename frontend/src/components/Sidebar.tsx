import { parseExerciseNumber } from "../exam";
import type { ExamInfo, ExamKind } from "../naming";
import type { ExamSummary, ExerciseStatus } from "../status";
import { IconArchive, IconCheck, IconExport, IconImport, IconNewExam, IconPlus } from "./icons";
import { StatusDots } from "./StatusDots";

export type Selection =
  | { kind: "common" }
  | { kind: "archive" }
  | { kind: "reuse" }
  | { kind: "exercise"; id: string }
  | null;

export interface SidebarExercise {
  id: string;
  /** Nome completo, mostrato al passaggio del mouse. */
  name: string;
  /** Etichetta breve nella colonna: data, tipo e traccia sono già indicati sopra. */
  label: string;
  kind: ExamKind | null;
  grade: number;
  status: ExerciseStatus;
  duplicate: boolean;
  /** Esiti arrivati mentre l'esercizio non era aperto. */
  unseen: boolean;
  revealKey?: string;
}

/** Problema che blocca l'esportazione; con exerciseId è cliccabile e porta all'esercizio. */
export interface Blocker {
  text: string;
  /** Testo completo con il nome dell'esercizio, mostrato al passaggio del mouse. */
  title?: string;
  exerciseId?: string;
}

interface Props {
  exam: ExamInfo;
  onExamChange: (exam: ExamInfo) => void;
  commonCount: number;
  exercises: SidebarExercise[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  canCreate: boolean;
  /** Perché non si possono aggiungere esercizi, se la traccia è completa (es. pretest). */
  createHint: string | null;
  onNew: () => void;
  onImport: () => void;
  canClearExam: boolean;
  onNewExam: () => void;
  onArchive: () => void;
  onReuse: () => void;
  summary: ExamSummary;
  blockers: Blocker[];
  exporting: boolean;
  onExport: () => void;
}

/** Colonna della sessione d'esame: dati dell'esame, test comuni, esercizi con i loro esiti,
 *  e in fondo il riepilogo con l'esportazione. */
export function Sidebar(props: Props) {
  const { exam, onExamChange, exercises, selection, onSelect, summary, blockers } = props;
  const isSelected = (id: string) => selection?.kind === "exercise" && selection.id === id;

  return (
    <aside className="sidebar" aria-label="Traccia">
      {/* Dati della traccia ed elenco degli esercizi scorrono insieme; il riepilogo con
          Esporta resta sempre visibile in fondo, anche con la finestra bassa */}
      <div className="sidebar-scroll">
      <section className="exam-panel">
        <div className="exam-panel-head">
          <h1>Traccia</h1>
          <div className="exam-actions">
            <button type="button" className="ghost small" onClick={props.onImport}>
              <IconImport /> Importa XML
            </button>
            <button
              type="button"
              className="ghost small"
              onClick={props.onNewExam}
              disabled={!props.canClearExam}
              title="Inizia una nuova traccia; quella attuale resta salvata nell'archivio"
            >
              <IconNewExam /> Nuovo esame
            </button>
            <button
              type="button"
              className={`ghost small${selection?.kind === "archive" ? " active" : ""}`}
              onClick={props.onArchive}
              aria-pressed={selection?.kind === "archive"}
              title="Tracce salvate e cestino"
            >
              <IconArchive /> Archivio
            </button>
          </div>
        </div>
        <label className="field">
          <span>Data</span>
          <input
            type="date"
            value={exam.date}
            onChange={(e) => onExamChange({ ...exam, date: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Traccia</span>
          <input
            type="text"
            inputMode="numeric"
            className="number-input"
            value={exam.track ?? ""}
            onChange={(e) => onExamChange({ ...exam, track: parseExerciseNumber(e.target.value) })}
            title="Tracce diverse dello stesso giorno hanno numeri diversi"
          />
        </label>
        <div className="segmented" role="radiogroup" aria-label="Tipo di esame">
          {(["Esame", "Pretest"] as ExamKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={exam.kind === kind}
              className={exam.kind === kind ? "selected" : ""}
              onClick={() => onExamChange({ ...exam, kind })}
            >
              {kind}
            </button>
          ))}
        </div>
      </section>

      <nav className="session" aria-label="Test ed esercizi">
        <button
          type="button"
          className={`session-row common-row${selection?.kind === "common" ? " selected" : ""}`}
          onClick={() => onSelect({ kind: "common" })}
        >
          <span className="row-title">Test comuni</span>
          <span className="row-meta mono">
            {props.commonCount === 0 ? "nessuno" : `${props.commonCount} test`}
          </span>
        </button>

        <h2 className="session-heading">Esercizi</h2>
        {exercises.length === 0 ? (
          <p className="session-empty">
            {props.canCreate
              ? "Nessun esercizio: creane uno o importa un XML."
              : "Indica data, tipo e traccia per creare il primo esercizio."}
          </p>
        ) : (
          <ul className="exercise-list">
            {exercises.map((ex) => {
              const { status } = ex;
              const done = status.passed + status.failed;
              return (
                <li key={ex.id}>
                  <button
                    type="button"
                    className={`session-row exercise-row${isSelected(ex.id) ? " selected" : ""}`}
                    aria-current={isSelected(ex.id) ? "true" : undefined}
                    onClick={() => onSelect({ kind: "exercise", id: ex.id })}
                  >
                    <span className="row-line">
                      <span className="row-title mono" title={ex.name}>
                        {ex.label}
                      </span>
                      {status.ready && (
                        <span className="ready-mark" title="Pronto per l'esportazione">
                          <IconCheck size={14} />
                          <span className="visually-hidden">pronto</span>
                        </span>
                      )}
                    </span>
                    <span className="row-line row-sub">
                      <span className="row-meta">
                        {ex.kind ?? "Tipo non indicato"} · {ex.grade} pt
                        {ex.duplicate && <span className="row-alert"> · numero doppio</span>}
                      </span>
                      <span className="row-count mono">
                        {status.rows.length === 0
                          ? "nessun test"
                          : status.unsupported
                            ? "non eseguibile"
                            : done === 0
                              ? status.pending > 0
                                ? "da calcolare"
                                : "da verificare"
                              : `${status.passed}/${status.rows.length}`}
                      </span>
                    </span>
                    {status.rows.length > 0 && (
                      <StatusDots states={status.tests} revealKey={ex.revealKey} />
                    )}
                    {ex.unseen && <span className="unseen-mark">esiti aggiornati</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className="ghost add-exercise"
          onClick={props.onNew}
          disabled={!props.canCreate}
          title={props.createHint ?? undefined}
        >
          <IconPlus /> Nuovo esercizio
        </button>
        <button
          type="button"
          className={`ghost add-exercise${selection?.kind === "reuse" ? " active" : ""}`}
          onClick={props.onReuse}
          disabled={!props.canCreate}
          title={props.createHint ?? "Copia un esercizio di un'altra traccia dell'archivio"}
        >
          <IconArchive /> Aggiungi da archivio
        </button>
        {props.createHint && <p className="session-empty">{props.createHint}.</p>}
      </nav>
      </div>

      <footer className="summary">
        <p className="summary-line mono">
          {summary.exercises === 1 ? "1 esercizio" : `${summary.exercises} esercizi`} ·{" "}
          {summary.ready === 1 ? "1 pronto" : `${summary.ready} pronti`} ·{" "}
          {`${summary.passed}/${summary.tests}`} superati
        </p>
        {blockers.length > 0 && (
          <div className="blockers">
            <p>Prima di esportare:</p>
            <ul>
              {/* L'elenco scorre al suo interno: si mostrano tutti i problemi */}
              {blockers.map((b, i) => (
                <li key={`${i}-${b.text}`}>
                  {b.exerciseId ? (
                    <button
                      type="button"
                      className="link"
                      title={b.title}
                      onClick={() => onSelect({ kind: "exercise", id: b.exerciseId! })}
                    >
                      {b.text}
                    </button>
                  ) : (
                    b.text
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          className="primary export-button"
          onClick={props.onExport}
          disabled={props.exporting || blockers.length > 0}
        >
          <IconExport /> {props.exporting ? "Verifica ed esportazione…" : "Esporta XML"}
        </button>
      </footer>
    </aside>
  );
}
