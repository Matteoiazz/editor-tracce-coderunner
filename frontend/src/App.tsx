import { useState } from "react";
import { importXml } from "./api";
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

export function App() {
  const [exam, setExam] = useState<ExamInfo>({ date: "", kind: null });
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
      const result = adoptImported(await importXml(file.content), items, exam);
      setExam(result.exam);
      setItems((current) => [...current, ...result.items]);
      setNotice(result.notice);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleRemove(item: EditableQuestion) {
    const name = questionName(item, exam);
    if (!window.confirm(`Eliminare ${name}? L'operazione non si può annullare.`)) return;
    setItems((current) => current.filter((it) => it.id !== item.id));
  }

  function updateItem(updated: EditableQuestion) {
    setItems((current) => current.map((it) => (it.id === updated.id ? updated : it)));
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
              duplicate={item.number !== null && duplicates.has(item.number)}
              onChange={updateItem}
              onRemove={() => handleRemove(item)}
            />
          ))
        )}
      </main>
    </div>
  );
}
