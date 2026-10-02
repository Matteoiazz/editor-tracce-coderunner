import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { generateStudentCode } from "../api";
import { type EditableQuestion, questionName } from "../exam";
import type { ExamInfo } from "../naming";
import type { ExerciseStatus, SectionStatus } from "../status";
import type { TestRow } from "../testcases";
import type { Question, TestOutcome } from "../types";
import { CodeEditor } from "./CodeEditor";
import { HtmlEditor } from "./HtmlEditor";
import { IconGenerate } from "./icons";
import { QuestionHeader } from "./QuestionHeader";
import { SectionStateIcon } from "./SectionState";
import { TestsSection } from "./TestsSection";

interface Props {
  item: EditableQuestion;
  exam: ExamInfo;
  common: TestRow[];
  status: ExerciseStatus;
  outcomes: Record<string, TestOutcome> | null;
  duplicate: boolean;
  /** Applica una modifica alla versione più recente dell'esercizio. */
  onUpdate: (change: (item: EditableQuestion) => EditableQuestion) => void;
  onVerified: (rows: TestRow[], solution: string, outcomes: TestOutcome[]) => void;
  onRemove: () => void;
}

type SectionKey = "text" | "solution" | "studentCode" | "tests";

const SECTIONS: { key: SectionKey; title: string }[] = [
  { key: "text", title: "Traccia" },
  { key: "solution", title: "Soluzione" },
  { key: "studentCode", title: "Codice per gli studenti" },
  { key: "tests", title: "Test" },
];

/** L'esercizio aperto: le sezioni sono sempre nello stesso ordine e nella stessa posizione. */
export function QuestionEditor(props: Props) {
  const { item, exam, common, status, onUpdate } = props;
  const { question } = item;
  const [error, setError] = useState<string | null>(null);

  // Altezza dell'intestazione fissa: le barre dell'editor del testo si fermano subito sotto.
  const headRef = useRef<HTMLElement>(null);
  const [headHeight, setHeadHeight] = useState(0);
  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const observer = new ResizeObserver(() => setHeadHeight(head.offsetHeight));
    observer.observe(head);
    return () => observer.disconnect();
  }, []);

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

  function goTo(key: SectionKey) {
    document.getElementById(`sezione-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const heading = (key: SectionKey, title: string, sectionStatus: SectionStatus, extra?: ReactNode) => (
    <div className="section-head">
      <h2>
        <SectionStateIcon state={sectionStatus.state} />
        {title}
      </h2>
      <span className="section-note">{sectionStatus.note}</span>
      {extra}
    </div>
  );

  return (
    <article
      className="exercise"
      aria-label={questionName(item, exam)}
      style={{ "--head-height": `${headHeight}px` } as CSSProperties}
    >
      <header ref={headRef} className="exercise-head">
        <QuestionHeader
          name={questionName(item, exam)}
          number={item.number}
          grade={question.default_grade}
          tags={question.tags}
          examKind={exam.kind}
          duplicate={props.duplicate}
          onNumberChange={(number) => onUpdate((current) => ({ ...current, number }))}
          onGradeChange={(default_grade) => update({ default_grade })}
          onTagsChange={(tags) => update({ tags })}
          onRemove={props.onRemove}
        />
        <nav className="section-index" aria-label="Sezioni dell'esercizio">
          {SECTIONS.map(({ key, title }) => (
            <button
              key={key}
              type="button"
              className="section-link"
              onClick={() => goTo(key)}
              title={status.sections[key].note}
            >
              <SectionStateIcon state={status.sections[key].state} />
              {title}
            </button>
          ))}
        </nav>
      </header>

      <section id="sezione-text" className="exercise-section">
        {heading("text", "Traccia", status.sections.text)}
        <HtmlEditor value={question.text_html} onChange={(text_html) => update({ text_html })} />
      </section>

      <section id="sezione-solution" className="exercise-section">
        {heading("solution", "Soluzione", status.sections.solution, (
          <span className="section-aside">nascosta agli studenti</span>
        ))}
        <CodeEditor value={question.solution} onChange={(solution) => update({ solution })} />
      </section>

      <section id="sezione-studentCode" className="exercise-section">
        {heading("studentCode", "Codice per gli studenti", status.sections.studentCode, (
          <button type="button" className="secondary" onClick={handleGenerateStudentCode}>
            <IconGenerate /> Genera dalla soluzione
          </button>
        ))}
        {error && <p className="inline-error">{error}</p>}
        <CodeEditor
          value={question.student_code}
          onChange={(student_code) => update({ student_code })}
        />
      </section>

      <section id="sezione-tests" className="exercise-section">
        <TestsSection
          item={item}
          common={common}
          outcomes={props.outcomes}
          sectionStatus={status.sections.tests}
          onUpdate={onUpdate}
          onVerified={props.onVerified}
        />
      </section>
    </article>
  );
}
