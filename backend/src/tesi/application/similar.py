"""Esercizi simili a quello aperto, proposti dal modello linguistico nello stile del docente.

Il modello riceve l'esercizio di partenza e alcuni esercizi dell'archivio come esempi di stile,
e propone esercizi nuovi con la stessa struttura. Ogni proposta si controlla prima di mostrarla:
Python valido, una funzione e un main che legge l'input, nessun errore sugli input dei test
comuni e output diversi da quelli dell'esercizio di partenza (altrimenti è lo stesso esercizio
con un altro nome). Le proposte che non passano tornano al modello una volta con i problemi;
quelle che falliscono ancora vengono scartate.
"""

import ast
import html
import json
import re
from dataclasses import dataclass

from tesi.application.ai import ask_json, with_notes
from tesi.application.fix import solution_from, syntax_error
from tesi.application.review import NothingToReview
from tesi.application.verification import NOT_RUN, interrupted, outputs_match, run_error
from tesi.domain import ExamKind, Question, plain_text
from tesi.ports import CodeRunner, LanguageModel, Message, ModelError, TrackArchive

PROPOSALS = 3
STYLE_EXAMPLES = 3
# Input su cui si provano le proposte: oltre, il controllo dura troppo
MAX_CHECKED_INPUTS = 20
SAMPLES = 2
MAX_TITLE = 120
MAX_TEXT = 4000


@dataclass(frozen=True)
class StyleExample:
    text: str
    solution: str


@dataclass(frozen=True)
class Sample:
    stdin: str
    output: str


@dataclass(frozen=True)
class Proposal:
    title: str
    # Testo semplice (per l'anteprima) e lo stesso in HTML (per l'editor del testo)
    text: str
    text_html: str
    solution: str
    samples: list[Sample]


@dataclass(frozen=True)
class SimilarExercises:
    proposals: list[Proposal]
    # Proposte scartate perché non superavano i controlli anche dopo la seconda richiesta
    discarded: int
    # Input su cui sono state eseguite le proposte: zero se non c'erano test, e allora si sono
    # controllati solo il codice e la lettura dell'input
    checked_inputs: int = 0


SYSTEM_PROMPT = f"""\
Sei un docente esperto di Python che prepara esercizi d'esame (domande CodeRunner di tipo \
python3_w_input). Proponi {PROPOSALS} esercizi nuovi simili a quello di partenza.

Come sono fatti gli esercizi:
- Il testo chiede allo studente di scrivere una funzione.
- La soluzione contiene la funzione risolta e un main che legge l'input con input(), una riga \
per valore (di solito un seed per il generatore casuale e una dimensione), costruisce i dati, \
chiama la funzione e stampa il risultato. Lo studente riceve il main già scritto.

Regole:
- Stessa struttura, stesso numero e significato delle righe di input e stessa difficoltà \
dell'esercizio di partenza: il main legge gli stessi valori e genera dati dello stesso tipo.
- Argomento diverso: la funzione deve calcolare qualcosa di diverso, non lo stesso compito \
con un altro nome. I {PROPOSALS} esercizi devono essere diversi anche tra loro.
- Imita lo stile degli esempi del docente: lunghezza e tono del testo, nomi in italiano, \
forma del main e della stampa del risultato.
- Il testo dice cosa fa la funzione, i parametri, cosa restituisce e come trattare i casi \
limite (per esempio la lista vuota). Non descrive input, output e main, che lo studente riceve \
già scritti. Testo semplice: paragrafi separati da una riga vuota, nomi di funzioni e variabili \
tra apici inversi `così`.
- La soluzione è completa e corretta, senza librerie esterne.

Rispondi solo con un oggetto JSON di questa forma:
{{"esercizi": [{{"titolo": "nome breve", "testo": "testo dell'esercizio", \
"soluzione": "codice Python completo"}}]}}"""

RETRY_MESSAGE = (
    "Alcuni esercizi non superano i controlli dell'applicazione:\n{problems}\n\n"
    "Riscrivi solo questi {count} esercizi, corretti, e rispondi di nuovo con il solo oggetto "
    "JSON nella stessa forma."
)


def style_examples(
    archive: TrackArchive, kind: ExamKind | None, exclude_track: str, count: int = STYLE_EXAMPLES
) -> list[StyleExample]:
    """Esercizi dell'archivio come esempi dello stile del docente: dalle tracce modificate più
    di recente, uno per traccia, prima quelle dello stesso tipo (esame o pretest)."""
    summaries = [s for s in archive.list() if s.id != exclude_track and s.exercise_count > 0]
    summaries.sort(key=lambda s: s.kind != kind)  # ordinamento stabile: restano per data
    examples: list[StyleExample] = []
    for summary in summaries:
        if len(examples) >= count:
            break
        for exercise in archive.get(summary.id).exercises:
            text = plain_text(exercise.question.text_html)
            if text and exercise.question.solution.strip():
                examples.append(StyleExample(text, exercise.question.solution.strip()))
                break
    return examples


def similar_request(
    question: Question, examples: list[StyleExample], notes: str = ""
) -> list[Message]:
    """I messaggi per il modello, con le indicazioni aggiuntive del docente."""
    text = plain_text(question.text_html)
    if not text or not question.solution.strip():
        raise NothingToReview(
            "Servono testo e soluzione dell'esercizio di partenza: gli esercizi simili si "
            "costruiscono su quelli"
        )
    parts = [
        f"ESERCIZIO DI PARTENZA\nTesto:\n{text}\n\nSoluzione:\n{question.solution.strip()}",
    ]
    for i, example in enumerate(examples, 1):
        parts.append(
            f"ESEMPIO DI STILE {i} (un altro esercizio del docente)\nTesto:\n{example.text}\n\n"
            f"Soluzione:\n{example.solution}"
        )
    user = "\n\n".join(parts)
    return with_notes([Message("system", SYSTEM_PROMPT), Message("user", user)], notes)


def similar_exercises(
    question: Question,
    examples: list[StyleExample],
    test_inputs: list[str],
    model: LanguageModel,
    runner: CodeRunner,
    notes: str = "",
) -> SimilarExercises:
    """``test_inputs``: gli input dei test comuni dell'esame, su cui si provano le proposte."""
    # Prima la richiesta, che si rifiuta senza testo o soluzione: solo dopo si esegue il codice
    messages = similar_request(question, examples, notes)
    inputs = list(dict.fromkeys(test_inputs))[:MAX_CHECKED_INPUTS]
    original = _outputs(runner, question.solution, inputs)
    reply = ask_json(model, messages)
    raw = _raw_proposals(reply)
    if not raw:
        raise ModelError("response", "Il modello non ha proposto esercizi: riprova")

    accepted: list[Proposal] = []
    failed: list[tuple[dict, list[str]]] = []
    for item in raw:
        proposal, problems = _check(item, inputs, original, runner)
        if proposal:
            accepted.append(proposal)
        else:
            failed.append((item, problems))

    discarded = 0
    if failed:
        problems = "\n".join(
            f"- «{_title(item) or 'senza titolo'}»: " + " ".join(found) for item, found in failed
        )
        retry = [
            *messages,
            Message("assistant", _json_text(reply)),
            Message("user", RETRY_MESSAGE.format(problems=problems, count=len(failed))),
        ]
        try:
            second = _raw_proposals(ask_json(model, retry))
        except ModelError:
            second = []
        for item in second[: len(failed)]:
            proposal, _ = _check(item, inputs, original, runner)
            if proposal:
                accepted.append(proposal)
        discarded = len(raw) - len(accepted)
    # Due proposte con gli stessi output sono lo stesso esercizio
    unique: list[Proposal] = []
    for proposal in accepted:
        if not any(_same_samples(proposal, other) for other in unique):
            unique.append(proposal)
    return SimilarExercises(
        proposals=unique[:PROPOSALS], discarded=max(discarded, 0), checked_inputs=len(inputs)
    )


def _raw_proposals(reply: dict) -> list[dict]:
    items = reply.get("esercizi")
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)][:PROPOSALS]


def _check(
    item: dict, inputs: list[str], original: list[tuple[str, str]], runner: CodeRunner
) -> tuple[Proposal | None, list[str]]:
    text = item.get("testo")
    if not isinstance(text, str) or not text.strip():
        return None, ["manca il testo."]
    try:
        solution = solution_from(item)
    except ModelError:
        return None, ["manca la soluzione."]
    if (error := syntax_error(solution)) is not None:
        return None, [f"il codice non è Python valido ({error})."]
    tree = ast.parse(solution)
    if not any(isinstance(node, ast.FunctionDef) for node in tree.body):
        return None, ["la soluzione non definisce una funzione."]
    if "input(" not in solution:
        return None, ["il main non legge l'input con input()."]
    problems = []
    outputs = []
    for stdin in inputs:
        output, error = _output(runner, solution, stdin)
        if error:
            inputs_line = " | ".join(stdin.splitlines())
            problems.append(f"con l'input {inputs_line} va in errore: {error.splitlines()[-1]}")
            break
        outputs.append(output)
    if (
        not problems
        and inputs
        and all(
            not orig_error and outputs_match(orig, out)
            for (orig, orig_error), out in zip(original, outputs, strict=True)
        )
    ):
        problems.append("dà gli stessi risultati dell'esercizio di partenza: è lo stesso compito.")
    if problems:
        return None, problems
    text = text.strip()[:MAX_TEXT]
    return (
        Proposal(
            title=_title(item) or "Esercizio simile",
            text=text,
            text_html=text_to_html(text),
            solution=solution,
            samples=[Sample(stdin, out) for stdin, out in zip(inputs, outputs, strict=False)][
                :SAMPLES
            ],
        ),
        [],
    )


def _output(runner: CodeRunner, solution: str, stdin: str) -> tuple[str, str]:
    result = runner.run(solution, stdin)
    error = run_error(result)
    return ("" if error else result.stdout), error


def _outputs(runner: CodeRunner, solution: str, inputs: list[str]) -> list[tuple[str, str]]:
    """Output o errore della soluzione di partenza su ogni input. Dopo un'interruzione (tempo
    limite o output eccessivo) gli input successivi non si eseguono, come nella verifica."""
    outputs: list[tuple[str, str]] = []
    for stdin in inputs:
        result = runner.run(solution, stdin)
        error = run_error(result)
        outputs.append(("" if error else result.stdout, error))
        if interrupted(result):
            outputs.extend([("", NOT_RUN)] * (len(inputs) - len(outputs)))
            break
    return outputs


def _same_samples(a: Proposal, b: Proposal) -> bool:
    return bool(a.samples) and [s.output for s in a.samples] == [s.output for s in b.samples]


def _title(item: dict) -> str:
    title = item.get("titolo")
    return title.strip()[:MAX_TITLE] if isinstance(title, str) else ""


def _json_text(reply: dict) -> str:
    return json.dumps(reply, ensure_ascii=False)


def text_to_html(text: str) -> str:
    """Testo semplice in HTML per l'editor: un paragrafo per blocco separato da una riga vuota,
    gli elenchi con "- " come elenchi puntati, `nomi` come codice. Tutto il resto è escapato."""
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text.replace("\r\n", "\n")) if b.strip()]
    parts = []
    for block in blocks:
        lines = [line.strip() for line in block.splitlines()]
        if all(line.startswith(("- ", "* ")) for line in lines):
            items = "".join(f"<li><p>{_inline(line[2:])}</p></li>" for line in lines)
            parts.append(f"<ul>{items}</ul>")
        else:
            parts.append(f"<p>{'<br>'.join(_inline(line) for line in lines)}</p>")
    return "".join(parts)


def _inline(text: str) -> str:
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", html.escape(text, quote=False))
