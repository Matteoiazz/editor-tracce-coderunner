import { useState } from "react";
import { generateStudentCode } from "../api";
import { type EditableQuestion, questionName } from "../exam";
import type { ExamInfo } from "../naming";
import type { TestRow } from "../testcases";
import type { Question } from "../types";
import { CodeEditor } from "./CodeEditor";
import { HtmlEditor } from "./HtmlEditor";
import { QuestionHeader } from "./QuestionHeader";
import { TestsSection } from "./TestsSection";

interface Props {
  item: EditableQuestion;
  exam: ExamInfo;
  common: TestRow[];
  duplicate: boolean;
  /** Applica una modifica alla versione più recente dell'esercizio. */
  onUpdate: (change: (item: EditableQuestion) => EditableQuestion) => void;
  onRemove: () => void;
}

/** Un blocco esercizio, come nel foglietto del docente. */
export function QuestionEditor({ item, exam, common, duplicate, onUpdate, onRemove }: Props) {
  const { question } = item;
  const [error, setError] = useState<string | null>(null);

  function update(changes: Partial<Question>) {
    onUpdate((current) => ({ ...current, question: { ...current.question, ...changes } }));
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
        name={questionName(item, exam)}
        number={item.number}
        grade={question.default_grade}
        tags={question.tags}
        examKind={exam.kind}
        duplicate={duplicate}
        onNumberChange={(number) => onUpdate((current) => ({ ...current, number }))}
        onGradeChange={(default_grade) => update({ default_grade })}
        onTagsChange={(tags) => update({ tags })}
        onRemove={onRemove}
      />

      <h3>Testo della traccia</h3>
      <HtmlEditor value={question.text_html} onChange={(text_html) => update({ text_html })} />

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

      <TestsSection item={item} common={common} onUpdate={onUpdate} />
    </section>
  );
}
