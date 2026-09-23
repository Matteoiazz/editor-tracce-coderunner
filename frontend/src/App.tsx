import { useState } from "react";
import { importXml } from "./api";
import { type EditableQuestion, QuestionEditor } from "./components/QuestionEditor";
import { buildName, parseName } from "./naming";
import type { Question } from "./types";

function toEditable(question: Question): EditableQuestion {
  const parts = parseName(question.name);
  // Se il nome importato contiene tutti i dati, lo si porta subito alla convenzione.
  const name = buildName(parts) ?? question.name;
  return { id: crypto.randomUUID(), parts, question: { ...question, name } };
}

export function App() {
  const [items, setItems] = useState<EditableQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setError(null);
    try {
      const file = await window.desktop.openXmlFile();
      if (!file) return; // l'utente ha annullato
      const imported = await importXml(file.content);
      // Gli esercizi importati si aggiungono a quelli già presenti
      setItems((current) => [...current, ...imported.map(toEditable)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function updateItem(updated: EditableQuestion) {
    setItems((current) => current.map((it) => (it.id === updated.id ? updated : it)));
  }

  return (
    <div className="app">
      <header className="toolbar">
        <button type="button" onClick={handleImport}>
          Importa XML
        </button>
      </header>

      <main className="content">
        {error && <p className="error">Importazione non riuscita: {error}</p>}

        {items.length === 0 ? (
          <p className="empty">Nessun esercizio. Importa un file XML esportato da Moodle.</p>
        ) : (
          items.map((item) => <QuestionEditor key={item.id} item={item} onChange={updateItem} />)
        )}
      </main>
    </div>
  );
}
