import { useEffect, useRef, useState } from "react";
import { exportXml, importXml, verifyQuestion } from "./api";
import { CommonTestsPanel } from "./components/CommonTestsPanel";
import { IconClose } from "./components/icons";
import { QuestionEditor } from "./components/QuestionEditor";
import { type Blocker, type Selection, Sidebar } from "./components/Sidebar";
import {
  adoptImported,
  canAddExercise,
  createQuestion,
  duplicateQuestion,
  duplicateNumbers,
  type EditableQuestion,
  ignoredMessage,
  isExamComplete,
  nextNumber,
  questionName,
  unsupportedReason,
} from "./exam";
import { exportFileName, exportProblems, prepareQuestion, sortedByNumber } from "./export";
import { EMPTY_EXAM, type ExamInfo } from "./naming";
import { isEmptySession, parseSession, serializeSession } from "./session";
import {
  examSummary,
  exerciseStatus,
  makeRecord,
  validOutcomes,
  type VerifyRecord,
} from "./status";
import { composeTests, type TestRow } from "./testcases";
import type { TestOutcome } from "./types";

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

  // ------------------------------------------------ salvataggio automatico
  const [loaded, setLoaded] = useState(false);
  const latestSession = useRef<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  // All'avvio si ripristina il lavoro della sessione precedente
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
        setExam(session.exam);
        setCommon(session.common);
        setItems(session.items);
        if (session.items.length > 0) {
          setSelection({ kind: "exercise", id: session.items[0].id });
          setNotice(`Ripristinato il lavoro della sessione precedente (${session.items.length} esercizi).`);
        }
      } catch (e) {
        setError(`Ripristino del lavoro non riuscito: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ogni modifica viene salvata poco dopo; i salvataggi sono eseguiti in ordine,
  // così uno più vecchio non può sovrascrivere uno più recente.
  useEffect(() => {
    if (!loaded) return;
    const content = serializeSession({ exam, common, items });
    latestSession.current = content;
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current
        .then(() => window.desktop.saveSession(content))
        .catch((e) =>
          setError(`Salvataggio automatico non riuscito: ${e instanceof Error ? e.message : String(e)}`),
        );
    }, 500);
    return () => clearTimeout(timer);
  }, [loaded, exam, common, items]);

  // Alla chiusura o alla ricarica si salva subito, senza attendere
  useEffect(() => {
    const saveNow = () => {
      if (latestSession.current !== null) window.desktop.saveSessionNow(latestSession.current);
    };
    window.addEventListener("beforeunload", saveNow);
    return () => window.removeEventListener("beforeunload", saveNow);
  }, []);

  // ------------------------------------------------ selezione ed esiti

  function select(next: Selection) {
    setSelection(next);
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
    setError(null);
    setNotice(null);
  }

  function handleNewExam() {
    if (
      !window.confirm(
        "Svuotare l'esame corrente? Esercizi e test verranno eliminati: esporta prima l'XML se vuoi conservarli.",
      )
    ) {
      return;
    }
    setExam(EMPTY_EXAM);
    setCommon([]);
    setItems([]);
    setRecords({});
    setSelection(null);
    clearMessages();
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
        const tests = composeTests(result.common, item.useCommon, item.commonExpected, item.specific);
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
    if (exportProblems(items, exam, common).length > 0) return;
    setExporting(true);
    try {
      // Su Moodle una soluzione che non supera i propri test renderebbe l'esercizio inutilizzabile:
      // ogni esercizio viene verificato e gli esiti compaiono nella colonna.
      let failures = 0;
      for (const item of sortedByNumber(items)) {
        const question = prepareQuestion(item, exam, common);
        if (unsupportedReason(question, question.testcases)) continue;
        const rows = composeTests(common, item.useCommon, item.commonExpected, item.specific);
        const outcomes = await verifyQuestion(question);
        recordOutcomes(item.id, rows, item.question.solution, outcomes);
        if (outcomes.some((o) => !o.passed)) failures++;
      }
      if (failures > 0) {
        setError(
          failures === 1
            ? "Esportazione annullata: un esercizio non supera i propri test (vedi la colonna a sinistra)."
            : `Esportazione annullata: ${failures} esercizi non superano i propri test (vedi la colonna a sinistra).`,
        );
        return;
      }
      const questions = sortedByNumber(items).map((item) => prepareQuestion(item, exam, common));
      const path = await window.desktop.saveXmlFile(exportFileName(exam), await exportXml(questions));
      if (path) setNotice(`Esportati ${questions.length} esercizi in ${path}`);
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
    setSelection(neighbour ? { kind: "exercise", id: neighbour.id } : null);
  }

  function updateItem(id: string, change: (item: EditableQuestion) => EditableQuestion) {
    setItems((current) => current.map((it) => (it.id === id ? change(it) : it)));
  }

  // ------------------------------------------------ vista

  // Cosa impedisce l'esportazione: problemi di struttura e test falliti nell'ultima verifica
  const names = new Map(items.map((it) => [questionName(it, exam), it.id]));
  const blockers: Blocker[] = exportProblems(items, exam, common).map((text) => {
    const name = [...names.keys()].find((n) => text.startsWith(`${n}: `));
    return { text, exerciseId: name ? names.get(name) : undefined };
  });
  for (const it of items) {
    const failed = statuses.get(it.id)?.failed ?? 0;
    if (failed > 0) {
      blockers.push({
        text: `${questionName(it, exam)}: ${failed === 1 ? "1 test fallito" : `${failed} test falliti`}`,
        exerciseId: it.id,
      });
    }
  }

  if (!loaded) {
    return <p className="loading">Caricamento del lavoro salvato…</p>;
  }

  const selectedItem = items.find((it) => it.id === selectedId);

  return (
    <div className="app">
      <Sidebar
        exam={exam}
        onExamChange={setExam}
        commonCount={common.length}
        exercises={sortedByNumber(items).map((it) => ({
          id: it.id,
          name: questionName(it, exam),
          label:
            exam.kind === "Pretest"
              ? "Esercizio del pretest"
              : it.number !== null
                ? `Esercizio ${it.number}`
                : "Esercizio senza numero",
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
        summary={summary}
        blockers={items.length === 0 ? [] : blockers}
        exporting={exporting}
        onExport={handleExport}
      />

      <main className="main" ref={mainRef}>
        {(error || notice) && (
          <div className={`banner ${error ? "banner-error" : "banner-info"}`} role="status">
            <p>{error ?? notice}</p>
            <button type="button" className="icon" onClick={clearMessages} aria-label="Chiudi il messaggio">
              <IconClose />
            </button>
          </div>
        )}

        {selection?.kind === "common" ? (
          <CommonTestsPanel rows={common} onChange={handleCommonChange} />
        ) : selectedItem ? (
          <QuestionEditor
            key={selectedItem.id}
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
  );
}
