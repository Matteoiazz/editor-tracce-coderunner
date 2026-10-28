import { useEffect, useState } from "react";
import { deleteTrack, emptyTrash, listTracks, restoreTrack } from "../api";
import {
  type ArchiveTab,
  type ExerciseMatch,
  formatMoment,
  sameNameIds,
  trackLabel,
  tracksByYear,
  trackYears,
  type TrackSummary,
} from "../archive";
import type { ExamKind } from "../naming";
import { ArchiveExercises } from "./ArchiveExercises";
import { IconCopy, IconExport, IconImport, IconMore, IconRestore, IconTrash } from "./icons";
import { Menu } from "./Menu";

interface Props {
  /** Traccia aperta in questo momento, evidenziata nell'elenco. */
  currentId: string;
  currentTitle: string;
  initialTab: ArchiveTab;
  onOpen: (id: string) => Promise<void>;
  /** Torna alla traccia aperta (clic sulla sua riga). */
  onShowCurrent: () => void;
  onDuplicate: (id: string) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
  /** Importa uno o più file XML del docente come nuove tracce. */
  onImportFiles: () => Promise<void>;
  onBackup: () => Promise<void>;
  onRestore: () => Promise<void>;
  /** Motivo per cui non si possono aggiungere esercizi alla traccia aperta, oppure null. */
  reuseBlocked: string | null;
  /** Copia un esercizio di un'altra traccia nella traccia aperta. */
  onReuse: (match: ExerciseMatch) => Promise<void>;
  /** Messaggio sull'esito di un'azione svolta qui (ripristino, eliminazione, cestino). */
  onNotice: (message: string) => void;
  /** Chiamata dopo ogni azione: l'elenco delle tracce può essere cambiato. */
  onChanged: () => void;
  onError: (message: string) => void;
}

/** Tracce ed esercizi salvati, cestino e backup. */
export function ArchivePanel(props: Props) {
  const { currentId, onOpen, onDuplicate, onTrash, onNotice, onChanged, onError } = props;
  const [tab, setTab] = useState<ArchiveTab>(props.initialTab);
  const [tracks, setTracks] = useState<TrackSummary[] | null>(null);
  const [trash, setTrash] = useState<TrackSummary[]>([]);
  const [kind, setKind] = useState<ExamKind | "">("");
  const [year, setYear] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [inArchive, inTrash] = await Promise.all([listTracks(), listTracks(true)]);
      setTracks(inArchive);
      setTrash(inTrash);
    } catch (e) {
      onError(`Lettura dell'archivio non riuscita: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    // L'elenco si legge all'apertura della vista e dopo ogni azione
    refresh();
  }, []);

  /** Esegue un'azione bloccando i pulsanti, poi rilegge l'elenco. Se l'azione riesce e
   *  `done` è indicato, lo mostra come messaggio (al posto di quello dell'azione precedente). */
  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await action();
      if (done) onNotice(done);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      await refresh();
      onChanged();
    }
  }

  function moveToTrash(t: TrackSummary) {
    run(
      () => onTrash(t.id),
      // Per la traccia aperta il messaggio lo dà l'applicazione, che ne apre una nuova
      t.id === currentId
        ? undefined
        : `Spostata nel cestino: ${trackLabel(t)}. Si può ripristinare dalla scheda Cestino.`,
    );
  }

  // Tracce con lo stesso tipo, data e numero di un'altra: su Moodle i nomi sarebbero uguali
  const sameName = sameNameIds(tracks ?? []);

  const visible = (tracks ?? []).filter(
    (t) => (!kind || t.kind === kind) && (!year || t.day?.startsWith(`${year}-`)),
  );

  const tabs: { id: ArchiveTab; label: string }[] = [
    { id: "tracks", label: `Tracce (${tracks?.length ?? 0})` },
    { id: "exercises", label: "Esercizi" },
    { id: "trash", label: `Cestino (${trash.length})` },
  ];

  return (
    <article className="archive-view">
      <header className="view-head">
        <h1>Archivio</h1>
        <p className="view-lede">
          Tutte le tracce preparate, salvate automaticamente: aprine una per modificarla, duplicala per
          un nuovo appello o copia un suo esercizio nella traccia aperta.
        </p>
      </header>

      <div className="archive-toolbar">
        <div className="segmented archive-tabs" role="tablist" aria-label="Parti dell'archivio">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "selected" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "tracks" && (
          <div className="archive-filters">
            <button
              type="button"
              className="ghost small"
              disabled={busy}
              title="Ogni traccia trovata nei file diventa una traccia dell'archivio"
              onClick={() => run(props.onImportFiles)}
            >
              <IconImport /> Importa XML nell'archivio
            </button>
            <label>
              Tipo
              <select value={kind} onChange={(e) => setKind(e.target.value as ExamKind | "")}>
                <option value="">Tutti</option>
                <option value="Esame">Esame</option>
                <option value="Pretest">Pretest</option>
              </select>
            </label>
            <label>
              Anno
              <select
                value={year}
                onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Tutti</option>
                {trackYears(tracks ?? []).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {tab === "trash" && trash.length > 0 && (
          <button
            type="button"
            className="ghost danger"
            disabled={busy}
            onClick={() => {
              const n = trash.length;
              const what = n === 1 ? "la traccia nel cestino" : `le ${n} tracce nel cestino`;
              const lost = n === 1 ? "Non si potrà recuperare." : "Non si potranno recuperare.";
              const message = `Eliminare definitivamente ${what}? ${lost}`;
              if (!window.confirm(message)) return;
              run(
                emptyTrash,
                n === 1
                  ? "Cestino svuotato: 1 traccia eliminata definitivamente."
                  : `Cestino svuotato: ${n} tracce eliminate definitivamente.`,
              );
            }}
          >
            <IconTrash /> Svuota cestino
          </button>
        )}
      </div>

      {tab === "exercises" ? (
        <ArchiveExercises
          currentTrackId={currentId}
          currentTitle={props.currentTitle}
          blockedReason={props.reuseBlocked}
          onAdd={props.onReuse}
          onError={onError}
        />
      ) : tracks === null ? (
        <p className="empty-state">Lettura dell'archivio…</p>
      ) : tab === "tracks" ? (
        visible.length === 0 ? (
          <p className="empty-state">
            {tracks.length === 0
              ? "L'archivio è vuoto: una traccia compare qui appena ha un esercizio o dei test comuni."
              : "Nessuna traccia con questi filtri."}
          </p>
        ) : (
          tracksByYear(visible).map((group) => (
            <section key={group.label} className="archive-group">
              <h2 className="archive-group-title">{group.label}</h2>
              <ul className="archive-list">
                {group.tracks.map((t) => {
                  const current = t.id === currentId;
                  return (
                    <li key={t.id} className={current ? "archive-row current" : "archive-row"}>
                      {/* Tutta la riga apre la traccia; le altre azioni sono nel menu */}
                      <button
                        type="button"
                        className="archive-open"
                        disabled={busy}
                        title={current ? "È la traccia aperta: torna a lavorarci" : "Apri la traccia"}
                        onClick={() => (current ? props.onShowCurrent() : run(() => onOpen(t.id)))}
                      >
                        <span className="archive-title">
                          {trackLabel(t)}
                          {current && <span className="archive-badge">aperta</span>}
                          {sameName.has(t.id) && (
                            <span
                              className="archive-badge warning"
                              title="Un'altra traccia ha lo stesso tipo, data e numero: cambiane uno prima di esportarla"
                            >
                              stesso nome di un'altra
                            </span>
                          )}
                        </span>
                        <span className="archive-meta">
                          {t.exercise_count === 1 ? "1 esercizio" : `${t.exercise_count} esercizi`} ·
                          modificata {formatMoment(t.updated_at)} ·{" "}
                          {t.exported_at ? `esportata ${formatMoment(t.exported_at)}` : "mai esportata"}
                        </span>
                      </button>
                      <Menu
                        label={<IconMore />}
                        className="icon"
                        ariaLabel={`Azioni per ${trackLabel(t)}`}
                        title="Duplica o sposta nel cestino"
                        align="end"
                        disabled={busy}
                        groups={[
                          {
                            items: [
                              {
                                label: "Duplica per un nuovo appello",
                                description: "Crea una copia e la apre",
                                icon: <IconCopy />,
                                onSelect: () => run(() => onDuplicate(t.id)),
                              },
                            ],
                          },
                          {
                            items: [
                              {
                                label: "Sposta nel cestino",
                                description: "Si può ripristinare dalla scheda Cestino",
                                icon: <IconTrash />,
                                danger: true,
                                onSelect: () => moveToTrash(t),
                              },
                            ],
                          },
                        ]}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )
      ) : trash.length === 0 ? (
        <p className="empty-state">Il cestino è vuoto.</p>
      ) : (
        <ul className="archive-list">
          {trash.map((t) => (
            <li key={t.id} className="archive-row">
              <div className="archive-info">
                <span className="archive-title">{trackLabel(t)}</span>
                <span className="archive-meta">
                  {t.exercise_count === 1 ? "1 esercizio" : `${t.exercise_count} esercizi`} ·
                  nel cestino dal {t.deleted_at ? formatMoment(t.deleted_at) : "?"}
                </span>
              </div>
              <div className="archive-actions">
                <button
                  type="button"
                  className="secondary small"
                  disabled={busy}
                  onClick={() => run(() => restoreTrack(t.id), `Ripristinata dal cestino: ${trackLabel(t)}.`)}
                >
                  <IconRestore /> Ripristina
                </button>
                <button
                  type="button"
                  className="ghost small danger"
                  disabled={busy}
                  onClick={() => {
                    const message = `Eliminare definitivamente «${trackLabel(t)}»? Non si potrà recuperare.`;
                    if (!window.confirm(message)) return;
                    run(() => deleteTrack(t.id), `Eliminata definitivamente: ${trackLabel(t)}.`);
                  }}
                >
                  <IconTrash /> Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab !== "exercises" && (
        <section className="archive-backup" aria-label="Backup">
          <h2>Backup</h2>
          <p className="view-lede">
            Una copia di tutto l'archivio, cestino compreso, in un file da conservare (per esempio su
            una chiavetta o su OneDrive). Il ripristino sostituisce l'archivio attuale, che viene
            comunque conservato in una copia.
          </p>
          <div className="view-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => run(props.onBackup)}
            >
              <IconExport /> Salva un backup…
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => run(props.onRestore)}
            >
              <IconRestore /> Ripristina da backup…
            </button>
          </div>
        </section>
      )}
    </article>
  );
}
