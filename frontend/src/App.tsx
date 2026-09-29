import { useEffect, useRef, useState } from "react";
import { exportXml, importXml, verifyQuestion } from "./api";
import { CommonTestsPanel } from "./components/CommonTestsPanel";
import { ExamHeader } from "./components/ExamHeader";
import { QuestionEditor } from "./components/QuestionEditor";
import {
  adoptImported,
  createQuestion,
  duplicateNumbers,
  type EditableQuestion,
  isExamComplete,
  nextNumber,
  questionName,
} from "./exam";
import { exportFileName, exportProblems, prepareQuestion, sortedByNumber } from "./export";
import type { ExamInfo } from "./naming";
import type { TestRow } from "./testcases";

export function App() {
  const [exam, setExam] = useState<ExamInfo>({ date: "", kind: null });
  const [common, setCommon] = useState<TestRow[]>([]);
  const [items, setItems] = useState<EditableQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportIssues, setExportIssues] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);

  const canCreate = isExamComplete(exam);
  const duplicates = duplicateNumbers(items);

  // I messaggi compaiono in cima alla pagina: se il docente sta lavorando più in basso,
  // la pagina scorre fino a loro, altrimenti non si accorgerebbe dell'esito.
  useEffect(() => {
    if (error || notice || exportIssues.length > 0) {
      messagesRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [error, notice, exportIssues]);

  // Chiudere o ricaricare la finestra cancellerebbe il lavoro: se ci sono esercizi si chiede
  // conferma (in Electron la finestra di conferma la mostra il processo principale).
  useEffect(() => {
    if (items.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [items.length]);

  function handleNew() {
    setItems((current) => [...current, createQuestion(nextNumber(current), exam)]);
  }

  async function handleImport() {
    setError(null);
    setNotice(null);
    setExportIssues([]);
    try {
      const file = await window.desktop.openXmlFile();
      if (!file) return; // l'utente ha annullato
      const result = adoptImported(await importXml(file.content), items, exam, common);
      setExam(result.exam);
      setCommon(result.common);
      setItems((current) => [...current, ...result.items]);
      setNotice(result.notice);
    } catch (e) {
      setError(`Importazione non riuscita: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleExport() {
    setError(null);
    setNotice(null);
    setExportIssues([]);
    const problems = exportProblems(items, exam, common);
    if (problems.length > 0) {
      setExportIssues(problems);
      return;
    }
    setExporting(true);
    try {
      const questions = sortedByNumber(items).map((item) => prepareQuestion(item, exam, common));
      // Su Moodle una soluzione che non supera i propri test renderebbe l'esercizio inutilizzabile
      const failures: string[] = [];
      for (const question of questions) {
        const failed = (await verifyQuestion(question)).filter((o) => !o.passed).length;
        if (failed > 0) {
          failures.push(
            `${question.name}: ${failed} test non superati dalla soluzione (premi «Verifica» per i dettagli)`,
          );
        }
      }
      if (failures.length > 0) {
        setExportIssues(failures);
        return;
      }
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

  function handleRemove(item: EditableQuestion) {
    const name = questionName(item, exam);
    if (!window.confirm(`Eliminare ${name}? L'operazione non si può annullare.`)) return;
    setItems((current) => current.filter((it) => it.id !== item.id));
  }

  function updateItem(id: string, change: (item: EditableQuestion) => EditableQuestion) {
    setItems((current) => current.map((it) => (it.id === id ? change(it) : it)));
  }

  return (
    <div className="app">
      <header className="toolbar">
        <button type="button" className="primary" onClick={handleNew} disabled={!canCreate}>
          + Nuovo esercizio
        </button>
        <button type="button" onClick={handleImport}>
          Importa XML
        </button>
        <button type="button" onClick={handleExport} disabled={exporting}>
          {exporting ? "Esportazione…" : "Esporta XML"}
        </button>
        {!canCreate && (
          <span className="muted">Indica data e tipo dell'esame per creare un esercizio</span>
        )}
      </header>

      <main className="content">
        <ExamHeader exam={exam} onChange={setExam} />
        <CommonTestsPanel rows={common} onChange={handleCommonChange} />

        <div ref={messagesRef} className="messages">
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
          {exportIssues.length > 0 && (
            <div className="export-issues">
              <strong>Impossibile esportare:</strong>
              <ul>
                {exportIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <p className="empty">
            Nessun esercizio. Indica data e tipo dell'esame e premi «+ Nuovo esercizio», oppure
            importa un file XML esportato da Moodle.
          </p>
        ) : (
          items.map((item) => (
            <QuestionEditor
              key={item.id}
              item={item}
              exam={exam}
              common={common}
              duplicate={item.number !== null && duplicates.has(item.number)}
              onUpdate={(change) => updateItem(item.id, change)}
              onRemove={() => handleRemove(item)}
            />
          ))
        )}
      </main>
    </div>
  );
}
