import { useState } from "react";
import { generateStudentCode } from "../api";
import { buildName, type NameParts } from "../naming";
import type { Question } from "../types";
import { CodeEditor } from "./CodeEditor";
import { QuestionHeader } from "./QuestionHeader";

export interface EditableQuestion {
  id: string; // solo per React, non esportato
  question: Question;
  parts: NameParts;
}

interface Props {
  item: EditableQuestion;
  onChange: (item: EditableQuestion) => void;
}

/** Un blocco esercizio, come nel foglietto del docente. */
export function QuestionEditor({ item, onChange }: Props) {
  const { question, parts } = item;
  const [error, setError] = useState<string | null>(null);

  function update(changes: Partial<Question>) {
    onChange({ ...item, question: { ...question, ...changes } });
  }

  function updateParts(newParts: NameParts) {
    // Quando tutti i campi sono compilati il nome segue la convenzione;
    // altrimenti resta quello originale (es. un nome importato non riconosciuto).
    const name = buildName(newParts) ?? question.name;
    onChange({ ...item, parts: newParts, question: { ...question, name } });
  }

  async function handleGenerateStudentCode() {
    setError(null);
    if (
      question.student_code.trim() &&
      !window.confirm("Il codice per gli studenti verrà sostituito. Continuare?")
    ) {
      return;
    }
    try {
      update({ student_code: await generateStudentCode(question.solution) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="question">
      <QuestionHeader
        parts={parts}
        grade={question.default_grade}
        name={question.name}
        onPartsChange={updateParts}
        onGradeChange={(default_grade) => update({ default_grade })}
      />

      <h3>Soluzione (nascosta agli studenti)</h3>
      <CodeEditor value={question.solution} onChange={(solution) => update({ solution })} />

      <div className="section-title">
        <h3>Codice per gli studenti</h3>
        <button type="button" onClick={handleGenerateStudentCode}>
          Genera dalla soluzione
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <CodeEditor
        value={question.student_code}
        onChange={(student_code) => update({ student_code })}
      />

      <p className="muted">{question.testcases.length} test</p>
    </section>
  );
}
