import { useState } from "react";
import { importXml } from "./api";
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
import type { ExamInfo } from "./naming";
import type { TestRow } from "./testcases";

export function App() {
  const [exam, setExam] = useState<ExamInfo>({ date: "", kind: null });
  const [common, setCommon] = useState<TestRow[]>([]);
  const [items, setItems] = useState<EditableQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canCreate = isExamComplete(exam);
  const duplicates = duplicateNumbers(items);

  function handleNew() {
    setItems((current) => [...current, createQuestion(nextNumber(current), exam)]);
  }

  async function handleImport() {
    setError(null);
    setNotice(null);
    try {
      const file = await window.desktop.openXmlFile();
      if (!file) return; // l'utente ha annullato
      const result = adoptImported(await importXml(file.content), items, exam, common);
      setExam(result.exam);
      setCommon(result.common);
      setItems((current) => [...current, ...result.items]);
      setNotice(result.notice);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        {!canCreate && (
          <span className="muted">Indica data e tipo dell'esame per creare un esercizio</span>
        )}
      </header>

      <main className="content">
        <ExamHeader exam={exam} onChange={setExam} />
        <CommonTestsPanel rows={common} onChange={handleCommonChange} />

        {error && <p className="error">Importazione non riuscita: {error}</p>}
        {notice && <p className="notice">{notice}</p>}

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
