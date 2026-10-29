import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import {
  generateStudentCode,
  previewFix,
  previewGenerate,
  previewReview,
  previewSimilar,
  type RequestPreview,
} from "../api";
import { keyProblemForAi } from "../apiKey";
import { type CopySource, type EditableQuestion, exerciseTests, questionName, shortLabel } from "../exam";
import { isSkeletonSolution } from "../export";
import {
  clearGeneration,
  generationProblem,
  markGenerationSeen,
  replacesSolution,
  startGeneration,
  useGeneration,
} from "../generation";
import type { ExamInfo } from "../naming";
import {
  clearSimilar,
  markProposalAdded,
  markSimilarSeen,
  type Proposal,
  similarProblem,
  startSimilar,
  useSimilar,
} from "../similar";
import type { ExerciseStatus, SectionStatus } from "../status";
import {
  closeReview,
  discardFix,
  dismissFinding,
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
import { GenerateDialog } from "./GenerateDialog";
import { SimilarDialog } from "./SimilarDialog";
import { HtmlEditor } from "./HtmlEditor";
import {
  IconAi,
  IconCaret,
  IconCopy,
  IconExpand,
  IconGenerate,
  IconSettings,
  IconTrash,
} from "./icons";
import { Menu, type MenuItem } from "./Menu";
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
  /** Identificativo della traccia aperta: gli esempi di stile si prendono dalle altre. */
  trackId: string;
  /** Crea nella traccia un esercizio da una proposta e restituisce il suo nome. */
  onAddSimilar: (proposal: Proposal) => Promise<string>;
}

type SectionKey = "text" | "solution" | "studentCode" | "tests";

/** Dove si mostra l'avviso di una funzione AI che non parte: vicino al pulsante usato, sotto la
 *  soluzione oppure sotto l'intestazione (esercizi simili, dal menu dell'esercizio). */
type AiPlace = "solution" | "head";

/** Una funzione AI pronta da inviare: nome, anteprima della richiesta e invio con le indicazioni. */
interface AiRequest {
  action: string;
  place: AiPlace;
  /** Chiave con cui si ricordano le ultime indicazioni aggiuntive. */
  notesKey: string;
  loadPreview: () => Promise<RequestPreview>;
  send: (notes: string) => void;
}

// "Testo" e non "Traccia": la traccia è l'esame intero, con tutti i suoi esercizi
const SECTIONS: { key: SectionKey; title: string }[] = [
  { key: "text", title: "Testo" },
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
  // Perché una funzione AI non è partita; `settings` se si risolve nelle Impostazioni
  const [aiBlocked, setAiBlocked] = useState<{ message: string; settings: boolean; place: AiPlace } | null>(
    null,
  );
  const [checkingKey, setCheckingKey] = useState(false);
  // Richiesta all'AI da mostrare prima dell'invio, comune a tutte le funzioni
  const [aiRequest, setAiRequest] = useState<AiRequest | null>(null);
  // Correzione proposta aperta nella finestra, per indice della segnalazione
  const [fixShown, setFixShown] = useState<number | null>(null);
  // Il messaggio riguarda il testo e la soluzione di quel momento
  useEffect(() => setAiBlocked(null), [question.text_html, question.solution]);
  // Quando compare, l'avviso si porta in vista: il pulsante può essere nell'intestazione fissa
  const blockedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (aiBlocked) blockedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [aiBlocked]);

  /** Controlla la chiave, poi mostra la richiesta oppure la invia subito, secondo le Impostazioni. */
  async function prepareAiRequest(request: AiRequest) {
    setAiBlocked(null);
    setCheckingKey(true);
    let keyProblem: string | null;
    try {
      keyProblem = keyProblemForAi(await window.desktop.apiKey.status());
    } catch (e) {
      keyProblem = `Stato della chiave non disponibile: ${e instanceof Error ? e.message : String(e)}.`;
    } finally {
      setCheckingKey(false);
    }
    if (keyProblem) {
      setAiBlocked({ message: keyProblem, settings: true, place: request.place });
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
      setAiBlocked({ message: problem, settings: false, place: "solution" });
      return;
    }
    const withTests = questionForReview();
    prepareAiRequest({
      action: "Revisione della soluzione",
      place: "solution",
      notesKey: item.id,
      loadPreview: () => previewReview(withTests, ""),
      send: (notes) => startReview(item.id, withTests, (q) => window.desktop.ai.review(q, notes)),
    });
  }

  /** L'esercizio da rivedere: il modello vede tutti i suoi test, comuni compresi. */
  function questionForReview(): Question {
    return { ...question, testcases: exerciseTests(item, common).map(toTestCase) };
  }

  const generation = useGeneration(item.id);
  const [generationShown, setGenerationShown] = useState(false);

  function handleGenerate() {
    const problem = generationProblem(question);
    if (problem) {
      setAiBlocked({ message: problem, settings: false, place: "solution" });
      return;
    }
    if (
      replacesSolution(question) &&
      !window.confirm(
        "C'è già una soluzione: quella generata la sostituirà solo se la applichi, dopo averla vista. Continuare?",
      )
    ) {
      return;
    }
    const withTests = questionForReview();
    prepareAiRequest({
      action: "Soluzione generata",
      place: "solution",
      notesKey: `${item.id}:soluzione`,
      loadPreview: () => previewGenerate(withTests, ""),
      send: (notes) =>
        startGeneration(item.id, withTests.solution, () => window.desktop.ai.generate(withTests, notes)),
    });
  }

  // La soluzione generata si apre da sola quando arriva, una volta
  useEffect(() => {
    if (generation?.state === "done" && !generation.seen) {
      markGenerationSeen(item.id);
      setGenerationShown(true);
    }
  }, [generation]);

  function applyGenerated() {
    if (generation?.state !== "done") return;
    update({ solution: generation.result.solution });
    clearGeneration(item.id);
  }

  const similar = useSimilar(item.id);
  const [similarShown, setSimilarShown] = useState(false);

  function handleSimilar() {
    const problem = similarProblem(question);
    if (problem) {
      setAiBlocked({ message: problem, settings: false, place: "head" });
      return;
    }
    const source = { ...question, testcases: [] };
    // Le proposte si provano sugli input dei test comuni, che anche i nuovi esercizi useranno
    const testInputs = (common.length > 0 ? common : exerciseTests(item, common)).map((row) => row.stdin);
    const context = { kind: exam.kind, excludeTrack: props.trackId, testInputs };
    prepareAiRequest({
      action: "Esercizi simili",
      place: "head",
      notesKey: `${item.id}:simili`,
      loadPreview: () => previewSimilar(source, exam.kind, props.trackId, ""),
      send: (notes) => startSimilar(item.id, () => window.desktop.ai.similar(source, context, notes)),
    });
  }

  // Le proposte si aprono da sole quando arrivano, una volta
  useEffect(() => {
    if (similar?.state === "done" && !similar.seen) {
      markSimilarSeen(item.id);
      setSimilarShown(true);
    }
  }, [similar]);

  async function addProposal(index: number) {
    if (similar?.state !== "done") return;
    const name = await props.onAddSimilar(similar.result.proposals[index]);
    markProposalAdded(item.id, index, name);
  }

  function handleFix(index: number) {
    if (review?.state !== "done") return;
    const finding = review.review.findings[index];
    const withTests = questionForReview();
    // Le due soluzioni si confrontano anche sui test suggeriti non ancora aggiunti
    const extraInputs = review.review.tests.filter((_, i) => !review.added.includes(i)).map((t) => t.stdin);
    prepareAiRequest({
      action: "Correzione della soluzione",
      place: "solution",
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

  // Avviso di una funzione AI che non è partita, nel punto da cui è stata chiesta
  const blockedNotice = (place: AiPlace) =>
    aiBlocked?.place === place && (
      <div
        ref={blockedRef}
        className={place === "head" ? "review-blocked exercise-head-notice" : "review-blocked solution-notice"}
        role="alert"
      >
        <p className="inline-notice">{aiBlocked.message}</p>
        {aiBlocked.settings && (
          <button type="button" className="secondary small" onClick={props.onOpenSettings}>
            <IconSettings /> Vai alle Impostazioni
          </button>
        )}
      </div>
    );

  const heading = (key: SectionKey, title: string, sectionStatus: SectionStatus, extra?: ReactNode) => (
    <div className="section-head">
      <h2>
        <SectionStateIcon state={sectionStatus.state} />
        {title}
      </h2>
      {sectionStatus.state !== "done" && <span className="section-note">{sectionStatus.note}</span>}
      {extra}
    </div>
  );

  // Azioni dell'esercizio nel menu dell'intestazione: le più usate in alto, Rimuovi in fondo
  const exerciseActions: MenuItem[] = props.canDuplicate
    ? [
        {
          label: "Duplica",
          description: "Nuovo esercizio con lo stesso testo, codice e test",
          icon: <IconCopy />,
          onSelect: props.onDuplicate,
        },
        {
          label: similar?.state === "pending" ? "Proposte in corso…" : "Esercizi simili con l'AI…",
          description: "Nuovi esercizi con la stessa struttura, nel tuo stile",
          icon: <IconAi />,
          onSelect: handleSimilar,
          disabled: similar?.state === "pending" || checkingKey,
        },
      ]
    : [];
  const aiBusy =
    generation?.state === "pending" ? "Generazione…" : review?.state === "pending" ? "Revisione…" : null;

  return (
    <article
      className="exercise"
      aria-label={questionName(item, exam)}
      style={{ "--head-height": `${headHeight}px` } as CSSProperties}
    >
      {/* Intestazione fissa su una riga: nome breve, sezioni con il loro stato, altre azioni */}
      <header ref={headRef} className="exercise-head">
        <h1 className="exercise-title mono" title={questionName(item, exam)}>
          {shortLabel(item, exam)}
        </h1>
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
        <Menu
          label={
            <>
              Azioni <IconCaret />
            </>
          }
          className="secondary exercise-menu"
          ariaLabel="Azioni dell'esercizio"
          title="Duplica, esercizi simili, copia da un altro esercizio, rimuovi"
          align="end"
          groups={[
            { items: exerciseActions },
            {
              heading: "Copia qui il contenuto di",
              items: props.copySources.map((source) => ({
                label: source.label,
                description: source.preview,
                onSelect: () => props.onCopyFrom(source),
              })),
            },
            {
              items: [
                { label: "Rimuovi l'esercizio", icon: <IconTrash />, danger: true, onSelect: props.onRemove },
              ],
            },
          ]}
        />
      </header>

      <div className="exercise-intro">
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
        />
        {blockedNotice("head")}
        {similar?.state === "error" && (
          <div className="review-blocked exercise-head-notice" role="alert">
            <p className="inline-notice">Esercizi simili non riusciti: {similar.message}.</p>
            <button type="button" className="ghost small" onClick={() => clearSimilar(item.id)}>
              Chiudi
            </button>
          </div>
        )}
        {similar?.state === "done" && !similarShown && (
          <div className="review-blocked exercise-head-notice">
            <p className="small-text muted">Le proposte di esercizi simili sono pronte.</p>
            <button type="button" className="secondary small" onClick={() => setSimilarShown(true)}>
              Vedi le proposte
            </button>
          </div>
        )}
        {similarShown && similar?.state === "done" && (
          <SimilarDialog
            result={similar.result}
            added={similar.added}
            onAdd={addProposal}
            onDiscard={() => clearSimilar(item.id)}
            onClose={() => setSimilarShown(false)}
          />
        )}
      </div>

      <section id="sezione-text" className="exercise-section">
        {heading("text", "Testo", status.sections.text)}
        <HtmlEditor value={question.text_html} onChange={(text_html) => update({ text_html })} />
      </section>

      <section id="sezione-solution" className="exercise-section">
        {heading("solution", "Soluzione", status.sections.solution, (
          <>
            <span className="section-aside">nascosta agli studenti</span>
            <div className="section-actions">
              {/* Le funzioni AI sulla soluzione in un solo pulsante: mentre una è in corso,
                  il pulsante lo dice */}
              <Menu
                label={
                  <>
                    <IconAi /> {aiBusy ?? "AI"} <IconCaret />
                  </>
                }
                className="secondary"
                ariaLabel="Funzioni AI sulla soluzione"
                align="end"
                disabled={checkingKey}
                groups={[
                  {
                    items: [
                      {
                        label: generation?.state === "pending" ? "Generazione in corso…" : "Genera la soluzione",
                        description: "Dal testo; l'app la controlla sui test prima di mostrartela",
                        onSelect: handleGenerate,
                        disabled: generation?.state === "pending",
                      },
                      {
                        label: review?.state === "pending" ? "Revisione in corso…" : "Rivedi la soluzione",
                        description: "Possibili errori, casi limite, testo ambiguo, test mancanti",
                        onSelect: handleReview,
                        disabled: review?.state === "pending",
                      },
                    ],
                  },
                ]}
              />
              {expandButton("solution")}
            </div>
          </>
        ))}
        {/* Sotto il pulsante AI, sopra l'editor: sotto l'editor resterebbe fuori dallo schermo */}
        {blockedNotice("solution")}
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
        {generation?.state === "pending" && (
          <p className="muted small-text review-progress" role="status">
            Generazione della soluzione in corso: l'app la controllerà sui test, anche più volte. Con i
            modelli gratuiti può volerci qualche minuto.
          </p>
        )}
        {generation?.state === "error" && (
          <div className="review-blocked" role="alert">
            <p className="inline-notice">Generazione non riuscita: {generation.message}.</p>
            <button type="button" className="ghost small" onClick={() => clearGeneration(item.id)}>
              Chiudi
            </button>
          </div>
        )}
        {generation?.state === "done" && !generationShown && (
          <div className="review-blocked">
            <p className="inline-notice">La soluzione generata è pronta e non è ancora stata applicata.</p>
            <button type="button" className="secondary small" onClick={() => setGenerationShown(true)}>
              Vedi la soluzione generata
            </button>
          </div>
        )}
        {generationShown && generation?.state === "done" && (
          <GenerateDialog
            result={generation.result}
            original={generation.solution}
            showDiff={generation.solution.trim() !== "" && !isSkeletonSolution(generation.solution)}
            outdated={generation.solution !== question.solution}
            onApply={applyGenerated}
            onDiscard={() => clearGeneration(item.id)}
            onClose={() => setGenerationShown(false)}
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
        {review && (
          <ReviewPanel
            entry={review}
            stale={review.snapshot !== reviewSnapshot(question)}
            checking={checkingKey}
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
