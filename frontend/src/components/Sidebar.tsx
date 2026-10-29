import { useEffect, useState } from "react";
import { type ArchiveTab, openTrackTitle } from "../archive";
import { isExamComplete, parseExerciseNumber } from "../exam";
import type { Blocker } from "../export";
import type { ExamInfo, ExamKind } from "../naming";
import type { ExamSummary, ExerciseStatus } from "../status";
import {
  IconArchive,
  IconCaret,
  IconCheck,
  IconChevron,
  IconCopy,
  IconExport,
  IconImport,
  IconMore,
  IconNewExam,
  IconPlus,
  IconTrash,
  IconWarning,
} from "./icons";
import { Menu } from "./Menu";
import { StatusDots } from "./StatusDots";

export type Selection =
  | { kind: "common" }
  | { kind: "archive"; tab?: ArchiveTab }
  | { kind: "settings" }
  | { kind: "exercise"; id: string }
  | null;

export interface SidebarExercise {
  id: string;
  /** Nome completo, mostrato al passaggio del mouse. */
  name: string;
  /** Etichetta breve nella colonna: data, tipo e traccia sono già indicati sopra. */
  label: string;
  /** Di cosa parla l'esercizio (nome della funzione o inizio del testo), per riconoscerlo. */
  topic: string;
  grade: number;
  status: ExerciseStatus;
  duplicate: boolean;
  /** Esiti arrivati mentre l'esercizio non era aperto. */
  unseen: boolean;
  revealKey?: string;
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
  onReuse: () => void;
  /** La traccia ha contenuto: si può lasciare per una nuova. */
  hasContent: boolean;
  /** La traccia è nell'archivio (o ci entra con il salvataggio in attesa): si può duplicare o
   *  spostare nel cestino. */
  inArchive: boolean;
  onNewExam: () => void;
  onDuplicateTrack: () => void;
  onTrashTrack: () => void;
  summary: ExamSummary;
  blockers: Blocker[];
  exporting: boolean;
  onExport: () => void;
}

/** Colonna della traccia aperta: dati dell'esame, test comuni, esercizi con i loro esiti, e in
 *  fondo il riepilogo con l'esportazione. */
export function Sidebar(props: Props) {
  const { exam, onExamChange, exercises, selection, onSelect, summary, blockers } = props;
  const isSelected = (id: string) => selection?.kind === "exercise" && selection.id === id;
  const complete = isExamComplete(exam);
  // I dati dell'esame restano aperti finché non sono completi; poi bastano su una riga
  const [editingExam, setEditingExam] = useState(!complete);
  useEffect(() => {
    if (!complete) setEditingExam(true);
  }, [complete]);
  const [showBlockers, setShowBlockers] = useState(false);
  const notStored = props.inArchive
    ? undefined
    : "La traccia entra nell'archivio quando ha un esercizio o dei test comuni";

  return (
    <aside className="sidebar" aria-label="Traccia aperta">
      {/* Dati della traccia ed elenco degli esercizi scorrono insieme; il riepilogo con
          Esporta resta sempre visibile in fondo, anche con la finestra bassa */}
      <div className="sidebar-scroll">
        <section className="exam-panel">
          <div className="exam-panel-head">
            <button
              type="button"
              className="exam-toggle"
              aria-expanded={editingExam}
              onClick={() => setEditingExam(!editingExam)}
              title={editingExam ? "Chiudi i dati dell'esame" : "Modifica tipo, data e numero della traccia"}
            >
              <IconChevron size={14} className={editingExam ? "chevron open" : "chevron"} />
              {/* Chiusi, i dati dicono già quale esame è; aperti, si modificano qui sotto */}
              <span className="exam-toggle-text">{editingExam ? "Dati dell'esame" : openTrackTitle(exam)}</span>
            </button>
            <Menu
              label={<IconMore />}
              className="icon track-menu"
              ariaLabel="Azioni della traccia"
              title="Nuova traccia, duplica, cestino"
              align="end"
              groups={[
                {
                  items: [
                    {
                      label: "Nuova traccia",
                      description: "Quella aperta resta salvata nell'archivio",
                      icon: <IconNewExam />,
                      onSelect: props.onNewExam,
                      disabled: !props.hasContent,
                    },
                    {
                      label: "Duplica per un nuovo appello",
                      description: "Copia esercizi e test; poi cambia la data",
                      icon: <IconCopy />,
                      onSelect: props.onDuplicateTrack,
                      disabled: !props.inArchive,
                      title: notStored,
                    },
                  ],
                },
                {
                  items: [
                    {
                      label: "Sposta nel cestino",
                      description: "Si può ripristinare dall'archivio",
                      icon: <IconTrash />,
                      danger: true,
                      onSelect: props.onTrashTrack,
                      disabled: !props.inArchive,
                      title: notStored,
                    },
                  ],
                },
              ]}
            />
          </div>
          {editingExam && (
            <div className="exam-fields">
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
              <div className="exam-row">
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
              </div>
            </div>
          )}
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
                ? "Nessun esercizio: aggiungine uno qui sotto."
                : "Indica tipo, data e numero della traccia per creare il primo esercizio."}
            </p>
          ) : (
            <ul className="exercise-list">
              {exercises.map((ex) => (
                <li key={ex.id}>
                  <ExerciseRow
                    exercise={ex}
                    selected={isSelected(ex.id)}
                    onSelect={() => onSelect({ kind: "exercise", id: ex.id })}
                  />
                </li>
              ))}
            </ul>
          )}
          {/* Un solo punto da cui aggiungere esercizi, in tutti i modi possibili */}
          <Menu
            label={
              <>
                <IconPlus /> Aggiungi esercizio <IconCaret />
              </>
            }
            className="ghost add-exercise"
            ariaLabel="Aggiungi esercizio"
            groups={[
              {
                items: [
                  {
                    label: "Esercizio vuoto",
                    description: "Da scrivere: testo, soluzione e test",
                    icon: <IconNewExam />,
                    onSelect: props.onNew,
                    disabled: !props.canCreate,
                    title: props.createHint ?? undefined,
                  },
                  {
                    label: "Dall'archivio…",
                    description: "Copia un esercizio di un'altra traccia",
                    icon: <IconArchive />,
                    onSelect: props.onReuse,
                    disabled: !props.canCreate,
                    title: props.createHint ?? undefined,
                  },
                  {
                    label: "Da file XML…",
                    description: "Esportato da Moodle, nello stesso formato",
                    icon: <IconImport />,
                    onSelect: props.onImport,
                  },
                ],
              },
            ]}
          />
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
            <button
              type="button"
              className="blockers-toggle"
              aria-expanded={showBlockers}
              onClick={() => setShowBlockers(!showBlockers)}
            >
              <IconWarning size={14} />
              <span>
                {blockers.length === 1
                  ? "1 cosa da sistemare prima di esportare"
                  : `${blockers.length} cose da sistemare prima di esportare`}
              </span>
              <IconChevron size={14} className={showBlockers ? "chevron open" : "chevron"} />
            </button>
            {showBlockers && (
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
                      <span title={b.title}>{b.text}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button
          type="button"
          className="primary export-button"
          onClick={props.onExport}
          disabled={props.exporting || blockers.length > 0 || summary.exercises === 0}
        >
          <IconExport /> {props.exporting ? "Verifica ed esportazione…" : "Esporta XML"}
        </button>
      </footer>
    </aside>
  );
}

/** Un esercizio nella colonna: nome breve e stato, di cosa parla e punti, un puntino per test. */
function ExerciseRow(props: { exercise: SidebarExercise; selected: boolean; onSelect: () => void }) {
  const { exercise, selected, onSelect } = props;
  const { status } = exercise;
  const done = status.passed + status.failed;
  const count =
    status.rows.length === 0
      ? "nessun test"
      : status.unsupported
        ? "non eseguibile"
        : done === 0
          ? status.pending > 0
            ? "da calcolare"
            : "da verificare"
          : `${status.passed}/${status.rows.length}`;
  return (
    <button
      type="button"
      className={`session-row exercise-row${selected ? " selected" : ""}`}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      title={exercise.name}
    >
      <span className="row-line">
        <span className="row-title mono">{exercise.label}</span>
        <span className="row-count mono">
          {status.ready ? (
            <span className="ready-mark">
              <IconCheck size={14} /> pronto
            </span>
          ) : (
            count
          )}
        </span>
      </span>
      <span className="row-line row-sub">
        <span className="row-topic">{exercise.topic || "da scrivere"}</span>
        <span className="row-meta">{exercise.grade} pt</span>
      </span>
      {exercise.duplicate && <span className="row-alert">Numero già usato da un altro esercizio</span>}
      {status.rows.length > 0 && <StatusDots states={status.tests} revealKey={exercise.revealKey} />}
      {exercise.unseen && <span className="unseen-mark">esiti aggiornati</span>}
    </button>
  );
}
