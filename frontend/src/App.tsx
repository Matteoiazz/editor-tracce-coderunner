import { useEffect, useRef, useState } from "react";
import {
  backupArchive,
  checkBackup,
  duplicateTrack,
  exportXml,
  getTrack,
  importXml,
  listTracks,
  markExported,
  restoreArchive,
  saveTrack,
  trashTrack,
  verifyQuestion,
} from "./api";
import {
  type ExerciseMatch,
  fromArchive,
  type OpenTrack,
  reuseExercise,
  sameNameTracks,
  toArchive,
  trackLabel,
  type TrackSummary,
} from "./archive";
import { importIntoArchive, importReportMessage } from "./archiveImport";
import { createArchiveSaver } from "./archiveSaver";
import { ArchivePanel } from "./components/ArchivePanel";
import { ReusePanel } from "./components/ReusePanel";
import { CommonTestsPanel } from "./components/CommonTestsPanel";
import { IconClose } from "./components/icons";
import { QuestionEditor } from "./components/QuestionEditor";
import { type Selection, Sidebar } from "./components/Sidebar";
import {
  adaptItemsToKind,
  adoptImported,
  canAddExercise,
  createQuestion,
  duplicateQuestion,
  duplicateNumbers,
  type EditableQuestion,
  exerciseTests,
  ignoredMessage,
  isExamComplete,
  nextNumber,
  copyExerciseContent,
  type CopySource,
  copySources,
  exerciseLabel,
  questionName,
  shortLabel,
  unsupportedReason,
} from "./exam";
import {
  exportBlockers,
  exportFileName,
  prepareQuestion,
  sortedByNumber,
} from "./export";
import { EMPTY_EXAM, type ExamInfo, localDay } from "./naming";
import { isEmptySession, parseSession } from "./session";
import {
  examSummary,
  exerciseStatus,
  makeRecord,
  validOutcomes,
  type VerifyRecord,
} from "./status";
import type { TestRow } from "./testcases";
import type { TestOutcome } from "./types";

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function exerciseCount(n: number): string {
  return n === 1 ? "1 esercizio" : `${n} esercizi`;
}

export function App() {
  const [exam, setExam] = useState<ExamInfo>(EMPTY_EXAM);
  const [common, setCommon] = useState<TestRow[]>([]);
  const [items, setItems] = useState<EditableQuestion[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  // Esiti dell'ultima verifica per esercizio: non salvati, dopo una riapertura vanno rifatti
  const [records, setRecords] = useState<Record<string, VerifyRecord>>({});
  const [revealKeys, setRevealKeys] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Copia del contenuto da un altro esercizio: si può annullare finché resta il suo messaggio
  // e l'esercizio non è stato modificato (`copied` è l'esercizio subito dopo la copia)
  const [copyUndo, setCopyUndo] = useState<{
    itemId: string;
    previous: EditableQuestion;
    copied: EditableQuestion;
    notice: string;
  } | null>(null);
  // Cambia a ogni copia o annullamento: gli editor ripartono dal contenuto nuovo
  const [contentVersion, setContentVersion] = useState(0);
  const [exporting, setExporting] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const selectedId = selection?.kind === "exercise" ? selection.id : null;
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const canCreate = canAddExercise(items, exam);
  const pretestFull = exam.kind === "Pretest" && items.length >= 1;
  const duplicates = duplicateNumbers(items);
  const statuses = new Map(items.map((it) => [it.id, exerciseStatus(it, common, records[it.id])]));
  const summary = examSummary([...statuses.values()]);

  // ------------------------------------------------ archivio
  // Identificativo della traccia aperta nell'archivio
  const [trackId, setTrackId] = useState<string>(() => crypto.randomUUID());
  const [loaded, setLoaded] = useState(false);
  const [archiveKey, setArchiveKey] = useState(0);
  // Salvataggio nell'archivio: in caso di errore la versione viene ritentata in seguito
  const [saver] = useState(() =>
    createArchiveSaver(saveTrack, (e) =>
      setError(
        `Salvataggio nell'archivio non riuscito: ${errorText(e).replace(/\.$/, "")}. ` +
          "Verrà ritentato alla prossima modifica o alla chiusura.",
      ),
    ),
  );

  /** Invia subito all'archivio l'eventuale versione in attesa; si risolve a salvataggio finito. */
  function flushSave(): Promise<void> {
    return saver.flush();
  }

  // Vero se la traccia aperta è già nell'archivio: allora va salvata anche se viene svuotata
  const inArchive = useRef(false);

  /** Apre una traccia; `stored` è falso per una traccia nuova, non ancora nell'archivio. */
  function openTrack(track: OpenTrack, stored = true) {
    inArchive.current = stored;
    saver.markSaved(toArchive(track));
    setTrackId(track.id);
    setExam(track.exam);
    setCommon(track.common);
    setItems(track.items);
    setRecords({});
    setSelection(track.items.length > 0 ? { kind: "exercise", id: track.items[0].id } : null);
  }

  // All'avvio si riapre la traccia modificata più di recente. Se l'archivio è vuoto e c'è
  // il file di sessione delle versioni precedenti, il suo contenuto diventa la prima traccia.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [last] = await listTracks();
        if (last) {
          const track = fromArchive(await getTrack(last.id));
          if (cancelled) return;
          openTrack(track);
          if (track.items.length > 0) {
            setNotice(`Riaperta l'ultima traccia (${exerciseCount(track.items.length)}).`);
          }
          return;
        }
        const text = await window.desktop.loadSession();
        if (cancelled || text === null) return;
        const session = parseSession(text);
        if (session === null) {
          const backup = await window.desktop.backupCorruptSession();
          setError(
            `Il salvataggio precedente non è leggibile e non è stato ripristinato. ` +
              `Una copia è stata conservata in ${backup}.`,
          );
          return;
        }
        if (!isEmptySession(session)) {
          const track = { id: crypto.randomUUID(), ...session };
          await saveTrack(toArchive(track));
          if (cancelled) return;
          openTrack(track);
          setNotice(
            `Il lavoro della sessione precedente è stato trasferito nell'archivio ` +
              `(${exerciseCount(track.items.length)}).`,
          );
        }
        await window.desktop.markSessionTransferred();
      } catch (e) {
        setError(`Apertura dell'archivio non riuscita: ${errorText(e)}`);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ogni modifica viene salvata poco dopo. Una traccia ancora vuota non viene salvata,
  // per non riempire l'archivio di tracce vuote.
  useEffect(() => {
    if (!loaded) return;
    // Una traccia nuova entra nell'archivio solo quando ha esercizi o test comuni: data e tipo
    // da soli non bastano, altrimenti l'archivio si riempirebbe di tracce vuote. Una traccia
    // già nell'archivio si salva sempre, anche quando viene svuotata.
    const empty = items.length === 0 && common.length === 0;
    if (!saver.set(empty && !inArchive.current ? null : toArchive({ id: trackId, exam, common, items }))) {
      return;
    }
    inArchive.current = true;
    const timer = setTimeout(flushSave, 500);
    return () => clearTimeout(timer);
  }, [loaded, trackId, exam, common, items]);

  // Elenco delle tracce dell'archivio, per accorgersi di un'altra traccia con lo stesso nome.
  // Si rilegge quando cambia la traccia aperta e dopo ogni azione nella vista Archivio.
  const [archiveTracks, setArchiveTracks] = useState<TrackSummary[]>([]);
  const [archiveVersion, setArchiveVersion] = useState(0);
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    listTracks().then(
      (tracks) => {
        if (!cancelled) setArchiveTracks(tracks);
      },
      // Serve solo per l'avviso sui nomi uguali: un errore qui non blocca il lavoro
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [loaded, trackId, archiveVersion]);

  // Alla chiusura della finestra Electron attende la fine del salvataggio
  useEffect(() => {
    window.desktop.onBeforeClose(() => flushSave());
  }, []);

  // Il messaggio "Esportazione annullata" scompare da solo quando non restano test falliti:
  // la colonna mostra già lo stato aggiornato
  const exportFailed = useRef(false);
  useEffect(() => {
    if (exportFailed.current && summary.failed === 0) {
      exportFailed.current = false;
      setError(null);
    }
  }, [summary.failed]);

  // ------------------------------------------------ selezione ed esiti

  function select(next: Selection) {
    setSelection(next);
    // Un messaggio informativo riguarda la vista precedente: al cambio di vista sparisce.
    // Non sparisce invece a tempo, perché la pagina salirebbe sotto il mouse del docente.
    // Gli errori restano finché non vengono chiusi.
    setNotice(null);
    setCopyUndo(null);
    mainRef.current?.scrollTo({ top: 0 });
    // Aprire un esercizio conferma di averne visto gli esiti aggiornati
    if (next?.kind === "exercise" && records[next.id]?.unseen) {
      setRecords((current) => ({ ...current, [next.id]: { ...current[next.id], unseen: false } }));
    }
  }

  function recordOutcomes(id: string, rows: TestRow[], solution: string, outcomes: TestOutcome[]) {
    setRecords((current) => ({
      ...current,
      [id]: makeRecord(solution, rows, outcomes, id !== selectedRef.current),
    }));
    setRevealKeys((current) => ({ ...current, [id]: String(Date.now()) }));
  }

  // ------------------------------------------------ azioni

  function clearMessages() {
    exportFailed.current = false;
    setError(null);
    setNotice(null);
    setCopyUndo(null);
  }

  // ------------------------------------------------ archivio: vista e azioni

  // L'elenco mostra anche l'ultima modifica della traccia aperta
  async function handleShowArchive() {
    clearMessages();
    await flushSave();
    // Una nuova chiave rilegge l'elenco anche se la vista è già aperta
    setArchiveKey((k) => k + 1);
    select({ kind: "archive" });
  }

  async function handleOpenTrack(id: string) {
    clearMessages();
    await flushSave();
    const track = await getTrack(id);
    openTrack(fromArchive(track));
    setNotice(`Aperta la traccia ${trackLabel(track)}.`);
  }

  async function handleDuplicateTrack(id: string) {
    clearMessages();
    await flushSave();
    const copy = await duplicateTrack(id);
    openTrack(fromArchive(copy));
    setNotice(
      `Creata e aperta una copia di ${trackLabel(copy)}: cambia data o numero di traccia ` +
        "per il nuovo appello.",
    );
  }

  async function handleTrashTrack(id: string) {
    clearMessages();
    await flushSave();
    await trashTrack(id);
    // Se era la traccia aperta, si continua su una traccia nuova vuota
    if (id === trackId) {
      openTrack({ id: crypto.randomUUID(), exam: EMPTY_EXAM, common: [], items: [] }, false);
      setSelection({ kind: "archive" });
      setNotice(
        "La traccia aperta è stata spostata nel cestino (scheda Cestino, da cui si può " +
          "ripristinare). Ora è aperta una traccia nuova.",
      );
    }
  }

  async function handleImportIntoArchive() {
    clearMessages();
    const files = await window.desktop.openXmlFiles();
    if (files.length === 0) return;
    await flushSave();
    const report = await importIntoArchive(files, await listTracks(), { importXml, saveTrack });
    setNotice(importReportMessage(report));
  }

  async function handleBackup() {
    clearMessages();
    await flushSave();
    const path = await window.desktop.chooseBackupTarget(`archivio-tracce-${localDay()}.db`);
    if (!path) return;
    const count = await backupArchive(path);
    setNotice(`Backup salvato in ${path} (${count === 1 ? "1 traccia" : `${count} tracce`}).`);
  }

  async function handleRestore() {
    clearMessages();
    const path = await window.desktop.chooseBackupSource();
    if (!path) return;
    // Il file si controlla prima della conferma: un file non valido viene segnalato subito
    const found = await checkBackup(path);
    if (
      !window.confirm(
        `Il backup contiene ${found === 1 ? "1 traccia" : `${found} tracce`}. ` +
          "Sostituire l'archivio con questo backup? L'archivio attuale viene conservato nel file " +
          "archivio-prima-del-ripristino.db nella cartella dei dati dell'applicazione.",
      )
    ) {
      return;
    }
    await flushSave();
    const count = await restoreArchive(path);
    // Si riapre la traccia aperta, nella versione del backup; se nel backup non c'è,
    // la più recente
    const restored = await listTracks();
    const reopen = restored.find((t) => t.id === trackId) ?? restored[0];
    openTrack(
      reopen
        ? fromArchive(await getTrack(reopen.id))
        : { id: crypto.randomUUID(), exam: EMPTY_EXAM, common: [], items: [] },
      Boolean(reopen),
    );
    setSelection({ kind: "archive" });
    // Si dice quale traccia è aperta: la colonna a sinistra ora mostra quella
    setNotice(
      `Archivio ripristinato dal backup (${count === 1 ? "1 traccia" : `${count} tracce`}). ` +
        (reopen ? `Aperta la traccia ${trackLabel(reopen)}.` : "Ora è aperta una traccia nuova."),
    );
  }

  async function handleReuse(match: ExerciseMatch) {
    const source = await getTrack(match.track_id);
    const { item, common: adopted } = reuseExercise(
      source.exercises[match.position],
      source.common_tests,
      items,
      exam,
      common,
      source.kind,
    );
    if (adopted) setCommon(adopted);
    setItems((current) => [...current, item]);
    select({ kind: "exercise", id: item.id });
    setNotice(
      `Aggiunto ${questionName(item, exam)}, copiato da ${trackLabel(source)}` +
        (adopted ? ". La traccia ha preso anche i suoi test comuni." : "."),
    );
  }

  // La traccia corrente resta nell'archivio: se ne apre una nuova vuota
  async function handleNewExam() {
    await flushSave();
    openTrack({ id: crypto.randomUUID(), exam: EMPTY_EXAM, common: [], items: [] }, false);
    clearMessages();
    setNotice("Nuova traccia. Quella precedente è salvata nell'archivio.");
  }

  function handleExamChange(next: ExamInfo) {
    if (next.kind !== exam.kind) setItems((current) => adaptItemsToKind(current, exam.kind, next.kind));
    setExam(next);
  }

  function handleNew() {
    const created = createQuestion(nextNumber(items), exam);
    setItems((current) => [...current, created]);
    select({ kind: "exercise", id: created.id });
  }

  async function handleImport() {
    clearMessages();
    try {
      const file = await window.desktop.openXmlFile();
      if (!file) return; // l'utente ha annullato
      const { questions, ignored } = await importXml(file.content);
      const result = adoptImported(questions, items, exam, common);
      // Esercizi che l'applicazione non sa eseguire: vanno segnalati subito
      const unsupported = result.items.flatMap((item) => {
        const tests = exerciseTests(item, result.common);
        const reason = unsupportedReason(item.question, tests);
        return reason
          ? [`${questionName(item, result.exam)}: ${reason}. Calcola output e Verifica non sono ` +
             "disponibili; all'esportazione l'esercizio viene riportato così com'è."]
          : [];
      });
      const messages = [
        questions.length === 0 ? "Nel file non ci sono domande di tipo CodeRunner." : null,
        result.notice,
        ignoredMessage(ignored),
        ...unsupported,
      ].filter((m): m is string => m !== null);
      setExam(result.exam);
      setCommon(result.common);
      setItems((current) => [...current, ...result.items]);
      if (result.items.length > 0) select({ kind: "exercise", id: result.items[0].id });
      const imported =
        result.items.length === 1 ? "Importato 1 esercizio." : `Importati ${result.items.length} esercizi.`;
      setNotice([imported, ...messages].join("\n"));
    } catch (e) {
      setError(`Importazione non riuscita: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleExport() {
    clearMessages();
    // Stessa condizione del pulsante Esporta, disattivato finché l'elenco non è vuoto
    if (blockers.length > 0) return;
    setExporting(true);
    try {
      // Su Moodle una soluzione che non supera i propri test renderebbe l'esercizio inutilizzabile:
      // ogni esercizio viene verificato e gli esiti compaiono nella colonna.
      let failures = 0;
      for (const item of sortedByNumber(items)) {
        const question = prepareQuestion(item, exam, common);
        if (unsupportedReason(question, question.testcases)) continue;
        const rows = exerciseTests(item, common);
        const outcomes = await verifyQuestion(question);
        recordOutcomes(item.id, rows, item.question.solution, outcomes);
        if (outcomes.some((o) => !o.passed)) failures++;
      }
      if (failures > 0) {
        exportFailed.current = true;
        setError(
          failures === 1
            ? "Esportazione annullata: un esercizio non supera i propri test (vedi la colonna a sinistra)."
            : `Esportazione annullata: ${failures} esercizi non superano i propri test (vedi la colonna a sinistra).`,
        );
        return;
      }
      const questions = sortedByNumber(items).map((item) => prepareQuestion(item, exam, common));
      const path = await window.desktop.saveXmlFile(exportFileName(exam), await exportXml(questions));
      if (!path) return;
      const exported = `${questions.length === 1 ? "Esportato" : "Esportati"} ${exerciseCount(questions.length)} in ${path}`;
      setNotice(exported);
      // L'archivio registra l'esportazione: prima va salvata l'ultima versione della traccia.
      // Se la registrazione non riesce, il file resta comunque esportato.
      try {
        await flushSave();
        await markExported(trackId);
      } catch (e) {
        setError(`${exported}, ma l'archivio non ha registrato l'esportazione: ${errorText(e)}`);
      }
    } catch (e) {
      setError(`Esportazione non riuscita: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  function handleCommonChange(rows: TestRow[]) {
    // Se cambia l'input di un test comune, il suo output va ricalcolato in ogni esercizio
    const previous = new Map(common.map((row) => [row.id, row.stdin]));
    const changed = new Set(
      rows.filter((row) => previous.has(row.id) && previous.get(row.id) !== row.stdin).map((r) => r.id),
    );
    setCommon(rows);
    if (changed.size > 0) {
      setItems((current) =>
        current.map((it) => ({
          ...it,
          commonExpected: Object.fromEntries(
            Object.entries(it.commonExpected).filter(([id]) => !changed.has(id)),
          ),
        })),
      );
    }
  }

  /** Copia nell'esercizio aperto tutto il contenuto di un altro esercizio della traccia. */
  function handleCopyFrom(item: EditableQuestion, source: CopySource) {
    const from = items.find((it) => it.id === source.id);
    if (!from) return;
    const target = exerciseLabel(item);
    if (
      !window.confirm(
        `Sostituire testo, soluzione, codice per gli studenti e test di ${target} con quelli di ` +
          `${source.label}? Subito dopo la copia si può annullare.`,
      )
    ) {
      return;
    }
    const copied = copyExerciseContent(item, from);
    updateItem(item.id, () => copied);
    setContentVersion((v) => v + 1);
    const message = `${target}: copiati testo, soluzione, codice per gli studenti e test da ${source.label}.`;
    setError(null);
    setNotice(message);
    setCopyUndo({ itemId: item.id, previous: item, copied, notice: message });
  }

  // Dopo una modifica dell'esercizio la copia non si annulla più: annullarla cancellerebbe
  // anche le modifiche fatte dopo. Ogni modifica crea un nuovo oggetto esercizio.
  const canUndoCopy =
    copyUndo !== null &&
    copyUndo.notice === notice &&
    items.find((it) => it.id === copyUndo.itemId) === copyUndo.copied;

  /** Riporta l'esercizio com'era prima dell'ultima copia. */
  function handleUndoCopy() {
    if (!copyUndo || !canUndoCopy) return;
    const { itemId, previous } = copyUndo;
    updateItem(itemId, () => previous);
    setContentVersion((v) => v + 1);
    setCopyUndo(null);
    setNotice("Copia annullata: l'esercizio è tornato com'era.");
  }

  function handleDuplicate(item: EditableQuestion) {
    const copy = duplicateQuestion(item, items, exam);
    const index = items.findIndex((it) => it.id === item.id);
    setItems((current) => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]);
    select({ kind: "exercise", id: copy.id });
    setNotice(`Creato ${questionName(copy, exam)} come copia di ${questionName(item, exam)}.`);
  }

  function handleRemove(item: EditableQuestion) {
    const name = questionName(item, exam);
    if (!window.confirm(`Eliminare ${name}? L'operazione non si può annullare.`)) return;
    const index = items.findIndex((it) => it.id === item.id);
    const rest = items.filter((it) => it.id !== item.id);
    setItems(rest);
    const neighbour = rest[Math.min(index, rest.length - 1)];
    select(neighbour ? { kind: "exercise", id: neighbour.id } : null);
  }

  function updateItem(id: string, change: (item: EditableQuestion) => EditableQuestion) {
    setItems((current) => current.map((it) => (it.id === id ? change(it) : it)));
  }

  // ------------------------------------------------ vista

  // Cosa impedisce l'esportazione: problemi di struttura, test falliti nell'ultima verifica e
  // un'altra traccia dell'archivio con lo stesso nome (es. duplicata e non ancora modificata)
  const sameName = sameNameTracks(exam, trackId, archiveTracks);
  const blockers = exportBlockers(
    items,
    exam,
    common,
    Object.fromEntries(items.map((it) => [it.id, statuses.get(it.id)?.failed ?? 0])),
    sameName.length > 0
      ? [
          `Nell'archivio c'è un'altra traccia ${trackLabel(sameName[0])}: cambia data o numero ` +
            "di traccia, altrimenti su Moodle le domande avrebbero gli stessi nomi",
        ]
      : [],
  );

  if (!loaded) {
    return <p className="loading">Caricamento del lavoro salvato…</p>;
  }

  const selectedItem = items.find((it) => it.id === selectedId);

  return (
    <div className="app">
      <Sidebar
        exam={exam}
        onExamChange={handleExamChange}
        commonCount={common.length}
        exercises={sortedByNumber(items).map((it) => ({
          id: it.id,
          name: questionName(it, exam),
          label: shortLabel(it, exam),
          kind: exam.kind,
          grade: it.question.default_grade,
          status: statuses.get(it.id)!,
          duplicate: it.number !== null && duplicates.has(it.number),
          unseen: records[it.id]?.unseen === true && it.id !== selectedId,
          revealKey: revealKeys[it.id],
        }))}
        selection={selection}
        onSelect={select}
        canCreate={canCreate}
        createHint={pretestFull ? "Il pretest ha un solo esercizio" : null}
        onNew={handleNew}
        onImport={handleImport}
        canClearExam={!isEmptySession({ exam, common, items })}
        onNewExam={handleNewExam}
        onArchive={handleShowArchive}
        onReuse={() => {
          clearMessages();
          select({ kind: "reuse" });
        }}
        summary={summary}
        blockers={items.length === 0 ? [] : blockers}
        exporting={exporting}
        onExport={handleExport}
      />

      {/* Il messaggio sta sopra l'area che scorre: non copre l'intestazione dell'esercizio */}
      <div className="main-column">
      {(error || notice) && (
        <div className={`banner ${error ? "banner-error" : "banner-info"}`} role="status">
          <p>{error ?? notice}</p>
          {!error && canUndoCopy && (
            <button type="button" className="secondary small" onClick={handleUndoCopy}>
              Annulla la copia
            </button>
          )}
          <button type="button" className="icon" onClick={clearMessages} aria-label="Chiudi il messaggio">
            <IconClose />
          </button>
        </div>
      )}
      <main className="main" ref={mainRef}>

        {selection?.kind === "reuse" ? (
          <ReusePanel
            currentTrackId={trackId}
            blockedReason={pretestFull ? "Il pretest ha un solo esercizio" : null}
            onAdd={handleReuse}
            onError={setError}
          />
        ) : selection?.kind === "archive" ? (
          <ArchivePanel
            key={archiveKey}
            currentId={trackId}
            onOpen={handleOpenTrack}
            onDuplicate={handleDuplicateTrack}
            onTrash={handleTrashTrack}
            onImportFiles={handleImportIntoArchive}
            onBackup={handleBackup}
            onRestore={handleRestore}
            onNotice={(message) => {
              clearMessages();
              setNotice(message);
            }}
            onChanged={() => setArchiveVersion((v) => v + 1)}
            onError={setError}
          />
        ) : selection?.kind === "common" ? (
          <CommonTestsPanel rows={common} onChange={handleCommonChange} />
        ) : selectedItem ? (
          <QuestionEditor
            key={`${selectedItem.id}:${contentVersion}`}
            item={selectedItem}
            exam={exam}
            common={common}
            status={statuses.get(selectedItem.id)!}
            outcomes={validOutcomes(
              records[selectedItem.id],
              selectedItem.question.solution,
              statuses.get(selectedItem.id)!.rows,
            )}
            duplicate={selectedItem.number !== null && duplicates.has(selectedItem.number)}
            onUpdate={(change) => updateItem(selectedItem.id, change)}
            onVerified={(rows, solution, outcomes) =>
              recordOutcomes(selectedItem.id, rows, solution, outcomes)
            }
            onRemove={() => handleRemove(selectedItem)}
            copySources={exam.kind === "Pretest" ? [] : copySources(items, selectedItem.id)}
            onCopyFrom={(source) => handleCopyFrom(selectedItem, source)}
            canDuplicate={exam.kind !== "Pretest" && isExamComplete(exam)}
            onDuplicate={() => handleDuplicate(selectedItem)}
          />
        ) : (
          <section className="start">
            <h1>Prepara un esame per Moodle</h1>
            <ol className="start-steps">
              <li className={isExamComplete(exam) ? "done" : ""}>
                <strong>Indica data, tipo e traccia</strong> nella colonna a sinistra.
              </li>
              <li className={common.length > 0 ? "done" : ""}>
                <strong>Definisci i test comuni</strong>, per esempio i 9 test standard.
              </li>
              <li>
                <strong>Crea gli esercizi</strong>: traccia, soluzione, codice per gli studenti, test.
              </li>
              <li>
                <strong>Esporta l'XML</strong> quando il riepilogo in basso a sinistra è tutto verde.
              </li>
            </ol>
            <p className="start-alt">
              Hai già un esame su Moodle? Importa il suo XML per riusare gli esercizi.
            </p>
          </section>
        )}
      </main>
      </div>
    </div>
  );
}
