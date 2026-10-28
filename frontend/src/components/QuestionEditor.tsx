import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { generateStudentCode, previewFix, previewReview, type RequestPreview } from "../api";
import { type CopySource, type EditableQuestion, exerciseTests, questionName } from "../exam";
import type { ExamInfo } from "../naming";
import type { ExerciseStatus, SectionStatus } from "../status";
import {
  closeReview,
  discardFix,
  dismissFinding,
  keyProblemForReview,
  markFixApplied,
  markFixSeen,
  markTestsAdded,
  rememberReviewNotes,
  reviewNotes,
  reviewProblem,
  reviewSnapshot,
  setFindingState,
  startFix,
  startReview,
  suggestionRow,
  undoFix,
  useReview,
} from "../review";
import { type TestRow, toTestCase } from "../testcases";
import type { Question, TestOutcome } from "../types";
import { AiRequestDialog } from "./AiRequestDialog";
import { CodeEditor } from "./CodeEditor";
import { FixDialog } from "./FixDialog";
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

/** Una funzione AI pronta da inviare: nome, anteprima della richiesta e invio con le indicazioni. */
interface AiRequest {
  action: string;
  /** Chiave con cui si ricordano le ultime indicazioni aggiuntive. */
  notesKey: string;
  loadPreview: () => Promise<RequestPreview>;
  send: (notes: string) => void;
}

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
  // Richiesta all'AI da mostrare prima dell'invio, comune a tutte le funzioni
  const [aiRequest, setAiRequest] = useState<AiRequest | null>(null);
  // Correzione proposta aperta nella finestra, per indice della segnalazione
  const [fixShown, setFixShown] = useState<number | null>(null);
  // Il messaggio riguarda il testo e la soluzione di quel momento
  useEffect(() => setReviewBlocked(null), [question.text_html, question.solution]);

  /** Controlla la chiave, poi mostra la richiesta oppure la invia subito, secondo le Impostazioni. */
  async function prepareAiRequest(request: AiRequest) {
    setReviewBlocked(null);
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
    let showRequest = true;
    try {
      showRequest = (await window.desktop.settings.get()).ai.showRequest;
    } catch {
      // impostazioni non leggibili: si mostra la richiesta, che è la scelta più prudente
    }
    if (showRequest) setAiRequest(request);
    else sendAiRequest(request, reviewNotes(request.notesKey));
  }

  function sendAiRequest(request: AiRequest, notes: string) {
    rememberReviewNotes(request.notesKey, notes);
    request.send(notes);
  }

  function handleReview() {
    const problem = reviewProblem(question);
    if (problem) {
      setReviewBlocked({ message: problem, settings: false });
      return;
    }
    const withTests = questionForReview();
    prepareAiRequest({
      action: "Revisione della soluzione",
      notesKey: item.id,
      loadPreview: () => previewReview(withTests, ""),
      send: (notes) => startReview(item.id, withTests, (q) => window.desktop.ai.review(q, notes)),
    });
  }

  /** L'esercizio da rivedere: il modello vede tutti i suoi test, comuni compresi. */
  function questionForReview(): Question {
    return { ...question, testcases: exerciseTests(item, common).map(toTestCase) };
  }

  function handleFix(index: number) {
    if (review?.state !== "done") return;
    const finding = review.review.findings[index];
    const withTests = questionForReview();
    // Le due soluzioni si confrontano anche sui test suggeriti non ancora aggiunti
    const extraInputs = review.review.tests.filter((_, i) => !review.added.includes(i)).map((t) => t.stdin);
    prepareAiRequest({
      action: "Correzione della soluzione",
      notesKey: `${item.id}:correzione`,
      loadPreview: () => previewFix(withTests, finding, ""),
      send: (notes) =>
        startFix(item.id, index, withTests.solution, () =>
          window.desktop.ai.fix(withTests, finding, extraInputs, notes),
        ),
    });
  }

  // Una correzione appena arrivata si apre da sola, una volta
  useEffect(() => {
    if (review?.state !== "done" || fixShown !== null) return;
    const ready = Object.entries(review.fixes).find(([, fix]) => fix.state === "done" && !fix.seen);
    if (!ready) return;
    const index = Number(ready[0]);
    markFixSeen(item.id, index);
    setFixShown(index);
  }, [review, fixShown]);

  function applyFix(index: number) {
    const fix = review?.state === "done" ? review.fixes[index] : undefined;
    if (fix?.state !== "done") return;
    const previous = question.solution;
    update({ solution: fix.fix.solution });
    markFixApplied(item.id, index, previous);
  }

  function undoAppliedFix(index: number) {
    const fix = review?.state === "done" ? review.fixes[index] : undefined;
    if (fix?.state !== "applied") return;
    if (!window.confirm("La soluzione torna com'era prima della correzione. Continuare?")) return;
    update({ solution: fix.solution });
    undoFix(item.id, index);
  }

  async function hideRequestNextTime() {
    try {
      await window.desktop.settings.update({ ai: { showRequest: false } });
    } catch (e) {
      setError(`Impostazione non salvata: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Righe delle segnalazioni che il docente corregge da sé
  const flaggedLines =
    review?.state === "done"
      ? review.review.findings.flatMap((finding, i) =>
          review.findingStates[i] === "manual" && finding.line !== null ? [finding.line] : [],
        )
      : [];
  const shownFix = fixShown !== null && review?.state === "done" ? review.fixes[fixShown] : undefined;

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
          highlightLines={flaggedLines}
        />
        {aiRequest && (
          <AiRequestDialog
            action={aiRequest.action}
            loadPreview={aiRequest.loadPreview}
            initialNotes={reviewNotes(aiRequest.notesKey)}
            onSend={(notes) => sendAiRequest(aiRequest, notes)}
            onHideNextTime={hideRequestNextTime}
            onClose={() => setAiRequest(null)}
          />
        )}
        {fixShown !== null && review?.state === "done" && shownFix?.state === "done" && (
          <FixDialog
            finding={review.review.findings[fixShown]}
            fix={shownFix.fix}
            original={shownFix.solution}
            outdated={shownFix.solution !== question.solution}
            onApply={() => applyFix(fixShown)}
            onDiscard={() => discardFix(item.id, fixShown)}
            onClose={() => setFixShown(null)}
          />
        )}
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
            onFindingState={(index, state) => setFindingState(item.id, index, state)}
            onFix={handleFix}
            onShowFix={setFixShown}
            onUndoFix={undoAppliedFix}
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
