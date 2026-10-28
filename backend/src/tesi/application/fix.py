"""Correzione della soluzione del docente con il modello linguistico, a partire da una
segnalazione della revisione.

Il modello propone la soluzione corretta; l'app la controlla (deve essere Python valido e
diversa da quella attuale) e la esegue su tutti i test, confrontando l'output con quello della
soluzione attuale. Il docente vede le differenze e decide se applicarla: qui non si modifica
nulla.
"""

from dataclasses import dataclass

from tesi.application.ai import ask_json, with_notes
from tesi.application.review import FINDING_KINDS, Finding, NothingToReview
from tesi.application.verification import interrupted, outputs_match, run_error
from tesi.domain import Question, plain_text
from tesi.ports import CodeRunner, LanguageModel, Message, ModelError

# Oltre questa lunghezza la risposta non è una soluzione d'esame
MAX_SOLUTION_CHARS = 20_000
MAX_EXPLANATION = 1500
# Test su cui confrontare le due soluzioni: oltre, il confronto dura troppo
MAX_COMPARED_TESTS = 60


@dataclass(frozen=True)
class TestComparison:
    __test__ = False  # evita che pytest la scambi per una classe di test

    stdin: str
    # Output o errore della soluzione attuale e di quella corretta
    before: str
    after: str
    before_error: str
    after_error: str
    # La soluzione corretta dà lo stesso risultato della soluzione attuale
    same: bool


@dataclass(frozen=True)
class Fix:
    solution: str
    explanation: str
    tests: list[TestComparison]
    # Input non confrontati: oltre il numero massimo, o dopo che la soluzione corretta si è
    # interrotta (tempo limite o output eccessivo)
    not_compared: int = 0


SYSTEM_PROMPT = """\
Sei un docente esperto di Python. Un collega ha scritto la soluzione di un esercizio d'esame \
(domanda CodeRunner di tipo python3_w_input) e una revisione ha trovato un problema. Correggi \
la soluzione.

Regole:
- Correggi solo il problema indicato, con la modifica più piccola possibile. Non cambiare nomi, \
stile, commenti o parti che funzionano.
- Lo studente riceve il main già scritto e completa solo la funzione: il main deve restare \
identico, salvo che il problema riguardi proprio il main.
- Restituisci la soluzione completa (funzione e main), non solo le righe cambiate.
- Se il problema indicato non è un vero problema, restituisci la soluzione invariata e \
spiegalo.
- Scrivi la spiegazione in italiano, in due o tre frasi: cosa hai cambiato e perché.

Rispondi solo con un oggetto JSON di questa forma:
{"soluzione": "codice Python completo", "spiegazione": "testo"}"""

SYNTAX_REMINDER = (
    "Il codice che hai restituito non è Python valido ({error}). Correggilo e rispondi di "
    "nuovo con il solo oggetto JSON."
)


def fix_request(question: Question, finding: Finding, notes: str = "") -> list[Message]:
    """I messaggi per il modello, con le indicazioni aggiuntive del docente."""
    if not question.solution.strip():
        raise NothingToReview("Manca la soluzione da correggere")
    if finding.kind not in FINDING_KINDS:
        raise NothingToReview("Segnalazione non riconosciuta")
    numbered = "\n".join(
        f"{i:>3} | {line}" for i, line in enumerate(question.solution.splitlines(), start=1)
    )
    where = f" (riga {finding.line})" if finding.line else ""
    user = (
        f"TESTO DELL'ESERCIZIO\n{plain_text(question.text_html) or '(vuoto)'}\n\n"
        f"SOLUZIONE ATTUALE (numeri di riga a sinistra, da non copiare nella risposta)\n"
        f"{numbered}\n\n"
        f"PROBLEMA DA CORREGGERE{where}\n{finding.title}\n{finding.explanation}".rstrip()
    )
    return with_notes([Message("system", SYSTEM_PROMPT), Message("user", user)], notes)


def fix_solution(
    question: Question,
    finding: Finding,
    model: LanguageModel,
    runner: CodeRunner,
    extra_inputs: list[str] | None = None,
    notes: str = "",
) -> Fix:
    """``extra_inputs``: altri input su cui confrontare le due soluzioni, per esempio i test
    suggeriti dalla revisione non ancora aggiunti."""
    messages = fix_request(question, finding, notes)
    reply = ask_json(model, messages)
    solution = solution_from(reply)
    if (error := syntax_error(solution)) is not None:
        retry = [
            *messages,
            Message("assistant", solution),
            Message("user", SYNTAX_REMINDER.format(error=error)),
        ]
        solution = solution_from(ask_json(model, retry))
        if (error := syntax_error(solution)) is not None:
            raise ModelError(
                "response",
                f"Il modello ha proposto codice Python non valido ({error}): riprova",
            )
    if same_code(solution, question.solution):
        explanation = _text(reply.get("spiegazione"))
        raise ModelError(
            "response",
            "Il modello non ha cambiato la soluzione" + (f": {explanation}" if explanation else ""),
        )
    tests, not_compared = _compare(question, solution, runner, extra_inputs or [])
    return Fix(
        solution=solution,
        explanation=_text(reply.get("spiegazione")),
        tests=tests,
        not_compared=not_compared,
    )


def solution_from(reply: dict) -> str:
    """Il codice nella risposta del modello, senza blocco di codice attorno e con l'a capo finale."""
    code = reply.get("soluzione")
    if not isinstance(code, str) or not code.strip():
        raise ModelError("response", "Il modello non ha restituito la soluzione corretta: riprova")
    code = _strip_fence(code)
    if len(code) > MAX_SOLUTION_CHARS:
        raise ModelError("response", "La soluzione proposta è troppo lunga: riprova")
    return code if code.endswith("\n") else code + "\n"


def _strip_fence(code: str) -> str:
    """Toglie un eventuale blocco ```python ... ``` attorno al codice."""
    lines = code.strip("\n").splitlines()
    if len(lines) >= 2 and lines[0].lstrip().startswith("```") and lines[-1].strip() == "```":
        lines = lines[1:-1]
    return "\n".join(lines)


def syntax_error(code: str) -> str | None:
    """L'errore di sintassi del codice, oppure None se è Python valido."""
    try:
        compile(code, "soluzione", "exec")
    except SyntaxError as exc:
        return f"riga {exc.lineno}: {exc.msg}"
    except ValueError as exc:
        return str(exc)
    return None


def same_code(a: str, b: str) -> bool:
    def normalize(code: str) -> list[str]:
        lines = [line.rstrip() for line in code.splitlines()]
        while lines and not lines[-1]:
            lines.pop()
        return lines

    return normalize(a) == normalize(b)


def _text(value: object) -> str:
    return value.strip()[:MAX_EXPLANATION] if isinstance(value, str) else ""


def _compare(
    question: Question, solution: str, runner: CodeRunner, extra_inputs: list[str]
) -> tuple[list[TestComparison], int]:
    """I confronti e quanti input sono rimasti senza confronto."""
    inputs: list[str] = []
    for stdin in [tc.stdin for tc in question.testcases] + extra_inputs:
        if stdin not in inputs:
            inputs.append(stdin)
    comparisons = []
    for stdin in inputs[:MAX_COMPARED_TESTS]:
        before = runner.run(question.solution, stdin)
        after = runner.run(solution, stdin)
        before_error = run_error(before)
        after_error = run_error(after)
        same = (
            before_error == after_error
            if before_error or after_error
            else outputs_match(before.stdout, after.stdout)
        )
        comparisons.append(
            TestComparison(
                stdin=stdin,
                before="" if before_error else before.stdout,
                after="" if after_error else after.stdout,
                before_error=before_error,
                after_error=after_error,
                same=same,
            )
        )
        # Come nella verifica: sugli altri input la soluzione corretta si interromperebbe quasi
        # certamente allo stesso modo, e il confronto durerebbe tempo limite × numero di input
        if interrupted(after):
            break
    return comparisons, len(inputs) - len(comparisons)
