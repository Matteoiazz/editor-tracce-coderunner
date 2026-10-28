"""Soluzione nascosta generata dal modello linguistico a partire dal testo dell'esercizio.

Il modello scrive la soluzione completa (funzione e main). L'app la controlla: Python valido,
la funzione del codice per gli studenti presente, lo stesso main, nessun errore sui test e,
dove l'output atteso c'è già, lo stesso output. Se un controllo fallisce, l'errore preciso torna
al modello, fino a tre tentativi. Il docente vede la proposta e decide se applicarla.
"""

import ast
from dataclasses import dataclass

from tesi.application.ai import ask_json, with_notes
from tesi.application.fix import solution_from, syntax_error
from tesi.application.review import MAX_EXISTING_TESTS, NothingToReview, plain_text, test_line
from tesi.application.verification import outputs_match, run_error
from tesi.domain import Question
from tesi.ports import CodeRunner, LanguageModel, Message

MAX_ATTEMPTS = 3
MAX_EXPLANATION = 1500
# Problemi rimandati al modello a ogni tentativo: oltre, la richiesta si allunga senza utilità
MAX_PROBLEMS = 8
MAX_SHOWN_OUTPUT = 400


@dataclass(frozen=True)
class TestRun:
    __test__ = False  # evita che pytest la scambi per una classe di test

    stdin: str
    output: str
    error: str
    # Output atteso già presente nel test (vuoto se non è stato calcolato)
    expected: str
    # Nessun errore e, se c'è un output atteso, output uguale
    passed: bool


@dataclass(frozen=True)
class GeneratedSolution:
    solution: str
    explanation: str
    attempts: int
    tests: list[TestRun]
    # Problemi rimasti dopo l'ultimo tentativo; vuoto se la soluzione supera tutti i controlli
    problems: list[str]


SYSTEM_PROMPT = """\
Sei un docente esperto di Python. Scrivi la soluzione completa di un esercizio d'esame \
(domanda CodeRunner di tipo python3_w_input), quella nascosta agli studenti che serve a \
calcolare gli output attesi dei test.

Come sono fatti gli esercizi:
- Il testo chiede allo studente di scrivere una funzione.
- La soluzione contiene la funzione risolta e un main che legge l'input con input(), una riga \
per valore (di solito un seed per il generatore casuale e una dimensione), costruisce i dati, \
chiama la funzione e stampa il risultato.
- Se ti viene dato il codice di partenza dello studente, contiene già il main: copialo \
identico, senza cambiare nemmeno una riga, e completa solo la funzione con lo stesso nome e gli \
stessi parametri.
- Senza codice di partenza, scrivi un main nella forma solita:
    if __name__ == "__main__":
        import random
        seed = int(input())
        random.seed(seed)
        n = int(input())
        lst = [random.randint(1, 10) for _ in range(n)]
        print(f"Input: {lst} - Risultato: {nome_funzione(lst)}")
  adattando i dati generati a ciò che chiede il testo.

Regole per la funzione:
- Fa esattamente ciò che chiede il testo, anche nei casi limite ammessi (dimensione 0, valori \
uguali, nessun elemento che soddisfa la condizione).
- Codice semplice e leggibile, come lo scriverebbe un docente di un corso introduttivo: niente \
librerie esterne, niente costrutti avanzati se non servono.
- Non leggere input e non stampare nulla dentro la funzione.

Scrivi la spiegazione in italiano, in due o tre frasi: l'idea della soluzione e come tratta i \
casi limite.

Rispondi solo con un oggetto JSON di questa forma:
{"soluzione": "codice Python completo", "spiegazione": "testo"}"""

RETRY_MESSAGE = (
    "La soluzione non supera i controlli dell'applicazione:\n{problems}\n\n"
    "Correggila e rispondi di nuovo con il solo oggetto JSON, con la soluzione completa."
)


def generate_request(question: Question, notes: str = "") -> list[Message]:
    """I messaggi per il modello, con le indicazioni aggiuntive del docente."""
    text = plain_text(question.text_html)
    if not text:
        raise NothingToReview("Scrivi prima il testo dell'esercizio: la soluzione si genera da quello")
    parts = [f"TESTO DELL'ESERCIZIO\n{text}"]
    if question.student_code.strip():
        parts.append(
            "CODICE DI PARTENZA DELLO STUDENTE (main da copiare identico)\n"
            + question.student_code.strip()
        )
    existing = question.testcases[:MAX_EXISTING_TESTS]
    if existing:
        parts.append(
            "TEST (righe dell'input separate da |; dove c'è, l'output atteso senza le righe di "
            "input, che la soluzione deve riprodurre)\n"
            + "\n".join(test_line(i, tc) for i, tc in enumerate(existing, 1))
        )
    user = "\n\n".join(parts)
    return with_notes([Message("system", SYSTEM_PROMPT), Message("user", user)], notes)


def generate_solution(
    question: Question, model: LanguageModel, runner: CodeRunner, notes: str = ""
) -> GeneratedSolution:
    messages = generate_request(question, notes)
    solution = ""
    explanation = ""
    runs: list[TestRun] = []
    problems: list[str] = []
    for attempt in range(1, MAX_ATTEMPTS + 1):
        reply = ask_json(model, messages)
        solution = solution_from(reply)
        explanation = _text(reply.get("spiegazione"))
        problems, runs = check_solution(solution, question, runner)
        if not problems:
            return GeneratedSolution(solution, explanation, attempt, runs, [])
        messages = [
            *messages,
            Message("assistant", solution),
            Message(
                "user",
                RETRY_MESSAGE.format(problems="\n".join(f"- {p}" for p in problems[:MAX_PROBLEMS])),
            ),
        ]
    return GeneratedSolution(solution, explanation, MAX_ATTEMPTS, runs, problems)


def check_solution(
    solution: str, question: Question, runner: CodeRunner
) -> tuple[list[str], list[TestRun]]:
    """Problemi della soluzione (vuoto se va bene) e la sua esecuzione sui test."""
    if (error := syntax_error(solution)) is not None:
        return [f"Il codice non è Python valido ({error})."], []
    problems = []
    student = question.student_code
    if student.strip() and syntax_error(student) is None:
        missing = _functions(student) - _functions(solution)
        if missing:
            names = ", ".join(sorted(missing))
            problems.append(f"Manca la funzione del codice di partenza: {names}.")
        if _main_lines(student) != _main_lines(solution):
            problems.append(
                "Il main è diverso da quello del codice di partenza: deve essere identico."
            )
    runs = []
    for i, tc in enumerate(question.testcases, 1):
        result = runner.run(solution, tc.stdin)
        error = run_error(result)
        output = "" if error else result.stdout
        inputs = " | ".join(tc.stdin.splitlines())
        if error:
            problems.append(f"Sul test {i} (input {inputs}) va in errore: {_short(error)}")
            passed = False
        elif tc.expected and not outputs_match(tc.expected, output):
            problems.append(
                f"Sul test {i} (input {inputs}) l'output è diverso. Atteso:\n"
                f"{_short(tc.expected)}\nOttenuto:\n{_short(output)}"
            )
            passed = False
        else:
            passed = True
        runs.append(TestRun(tc.stdin, output, error, tc.expected, passed))
    return problems, runs


def _functions(code: str) -> set[str]:
    """Nomi delle funzioni definite al primo livello del codice."""
    tree = ast.parse(code)
    return {
        node.name for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


def _main_lines(code: str) -> list[str]:
    """Il codice senza le funzioni e senza gli import di primo livello: il main. Gli import si
    escludono perché la soluzione può aggiungerne per la funzione."""
    tree = ast.parse(code)
    lines = code.splitlines()
    skip: set[int] = set()
    for node in tree.body:
        if isinstance(
            node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Import, ast.ImportFrom)
        ):
            start = min([node.lineno, *(d.lineno for d in getattr(node, "decorator_list", []))])
            skip.update(range(start, (node.end_lineno or node.lineno) + 1))
    kept = [line.rstrip() for n, line in enumerate(lines, 1) if n not in skip]
    return [line for line in kept if line.strip() and not line.lstrip().startswith("#")]


def _short(text: str) -> str:
    text = text.strip()
    return text if len(text) <= MAX_SHOWN_OUTPUT else text[:MAX_SHOWN_OUTPUT] + " …"


def _text(value: object) -> str:
    return value.strip()[:MAX_EXPLANATION] if isinstance(value, str) else ""
