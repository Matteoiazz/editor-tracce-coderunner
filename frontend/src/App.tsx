import { useState } from "react";
import { importXml } from "./api";
import type { Question } from "./types";

export function App() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setError(null);
    try {
      const file = await window.desktop.openXmlFile();
      if (!file) return; // l'utente ha annullato
      const imported = await importXml(file.content);
      // Gli esercizi importati si aggiungono a quelli già presenti
      setQuestions((current) => [...current, ...imported]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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

        {questions.length === 0 ? (
          <p className="empty">Nessun esercizio. Importa un file XML esportato da Moodle.</p>
        ) : (
          <ul className="question-list">
            {questions.map((q, i) => (
              <li key={i}>
                <strong>{q.name}</strong>
                <span className="muted"> · {q.testcases.length} test</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
