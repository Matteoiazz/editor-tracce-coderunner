import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { generateStudentCode } from "../api";
import { type CopySource, type EditableQuestion, exerciseTests, questionName } from "../exam";
import type { ExamInfo } from "../naming";
import type { ExerciseStatus, SectionStatus } from "../status";
import {
  closeReview,
  dismissFinding,
  keyProblemForReview,
  markTestsAdded,
  reviewProblem,
  reviewSnapshot,
  startReview,
  suggestionRow,
  useReview,
} from "../review";
import { type TestRow, toTestCase } from "../testcases";
import type { Question, TestOutcome } from "../types";
import { CodeEditor } from "./CodeEditor";
import { HtmlEditor } from "./HtmlEditor";
import { IconExpand, IconGenerate, IconReview, IconSettings } from "./icons";
import { QuestionHeader } from "./QuestionHeader";
import { ReviewPanel } from "./ReviewPanel";
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
  /** Falso nel pretest, che ha un solo esercizio. */
  canDuplicate: boolean;
  onDuplicate: () => void;
  copySources: CopySource[];
  onCopyFrom: (source: CopySource) => void;
  onOpenSettings: () => void;
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
  const [expandedCode, setExpandedCode] = useState<"solution" | "studentCode" | null>(null);

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

  const review = useReview(item.id);
  // Perché la revisione non è partita; `settings` se si risolve nelle Impostazioni
  const [reviewBlocked, setReviewBlocked] = useState<{ message: string; settings: boolean } | null>(null);
  const [checkingKey, setCheckingKey] = useState(false);
  // Il messaggio riguarda il testo e la soluzione di quel momento
  useEffect(() => setReviewBlocked(null), [question.text_html, question.solution]);

  async function handleReview() {
    setReviewBlocked(null);
    const problem = reviewProblem(question);
    if (problem) {
      setReviewBlocked({ message: problem, settings: false });
      return;
    }
    setCheckingKey(true);
    let keyProblem: string | null;
    try {
      keyProblem = keyProblemForReview(await window.desktop.apiKey.status());
    } catch (e) {
      keyProblem = `Stato della chiave non disponibile: ${e instanceof Error ? e.message : String(e)}.`;
    } finally {
      setCheckingKey(false);
    }
    if (keyProblem) {
      setReviewBlocked({ message: keyProblem, settings: true });
      return;
    }
    // Il modello vede tutti i test dell'esercizio, comuni compresi
    const withTests = { ...question, testcases: exerciseTests(item, common).map(toTestCase) };
    startReview(item.id, withTests, window.desktop.ai.review);
  }

  function addSuggestedTests(indexes: number[]) {
    if (review?.state !== "done") return;
    const rows = indexes.map((i) => suggestionRow(review.review.tests[i]));
    onUpdate((current) => ({ ...current, specific: [...current.specific, ...rows] }));
    markTestsAdded(item.id, indexes);
  }

  function goTo(key: SectionKey) {
    document.getElementById(`sezione-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const expandButton = (key: "solution" | "studentCode") => (
    <button
      type="button"
      className="ghost small expand-code"
      onClick={() => setExpandedCode(key)}
      title="Espandi l'editor"
    >
      <IconExpand /> Espandi
    </button>
  );

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
          canDuplicate={props.canDuplicate}
          onDuplicate={props.onDuplicate}
          copySources={props.copySources}
          onCopyFrom={props.onCopyFrom}
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
          <>
            <span className="section-aside">nascosta agli studenti</span>
            <div className="section-actions">
              <button
                type="button"
                className="secondary"
                onClick={handleReview}
                disabled={review?.state === "pending" || checkingKey}
                title="Il modello cerca errori, casi limite, punti ambigui del testo e test mancanti"
              >
                <IconReview /> {review?.state === "pending" ? "Revisione in corso…" : "Rivedi con l'AI"}
              </button>
              {expandButton("solution")}
            </div>
          </>
        ))}
        <CodeEditor
          value={question.solution}
          onChange={(solution) => update({ solution })}
          expanded={expandedCode === "solution"}
          onExpandedChange={(open) => setExpandedCode(open ? "solution" : null)}
          title={`Soluzione · ${questionName(item, exam)}`}
        />
        {reviewBlocked && (
          <div className="review-blocked" role="alert">
            <p className="inline-notice">{reviewBlocked.message}</p>
            {reviewBlocked.settings && (
              <button type="button" className="secondary small" onClick={props.onOpenSettings}>
                <IconSettings /> Vai alle Impostazioni
              </button>
            )}
          </div>
        )}
        {review && (
          <ReviewPanel
            entry={review}
            stale={review.snapshot !== reviewSnapshot(question)}
            onRetry={handleReview}
            onClose={() => closeReview(item.id)}
            onDismiss={(index) => dismissFinding(item.id, index)}
            onAddTests={addSuggestedTests}
          />
        )}
      </section>

      <section id="sezione-studentCode" className="exercise-section">
        {heading("studentCode", "Codice per gli studenti", status.sections.studentCode, (
          <>
            <div className="section-actions">
              <button type="button" className="secondary" onClick={handleGenerateStudentCode}>
                <IconGenerate /> Genera dalla soluzione
              </button>
              {expandButton("studentCode")}
            </div>
          </>
        ))}
        {error && <p className="inline-error">{error}</p>}
        <CodeEditor
          value={question.student_code}
          onChange={(student_code) => update({ student_code })}
          expanded={expandedCode === "studentCode"}
          onExpandedChange={(open) => setExpandedCode(open ? "studentCode" : null)}
          title={`Codice per gli studenti · ${questionName(item, exam)}`}
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
