"""Revisione della soluzione del docente con il modello linguistico.

Il modello legge testo, soluzione e input dei test e restituisce segnalazioni (possibili
errori, casi limite, testo ambiguo, test mancanti) e test da aggiungere. Le sue risposte sono
ipotesi: i test suggeriti si eseguono davvero sulla soluzione, così il docente vede l'output
reale, o l'errore, e non quello immaginato dal modello.
"""

from dataclasses import dataclass
from html.parser import HTMLParser
from typing import ClassVar, Literal

from tesi.application.ai import ask_json
from tesi.application.verification import run_error
from tesi.domain import Question
from tesi.ports import CodeRunner, LanguageModel, Message

FindingKind = Literal["errore", "caso_limite", "testo", "test_mancante"]
FINDING_KINDS: tuple[FindingKind, ...] = ("errore", "caso_limite", "testo", "test_mancante")

MAX_FINDINGS = 8
MAX_TESTS = 5
# Test esistenti mostrati al modello: oltre, la richiesta diventa lunga senza aggiungere molto
MAX_EXISTING_TESTS = 40
MAX_TITLE = 200
MAX_EXPLANATION = 1500
MAX_INPUT_LINES = 20


@dataclass(frozen=True)
class Finding:
    kind: FindingKind
    title: str
    explanation: str
    # Riga della soluzione a cui si riferisce, se il modello la indica
    line: int | None = None


@dataclass(frozen=True)
class SuggestedTest:
    stdin: str
    reason: str
    # Output della soluzione su questo input, oppure l'errore se va in errore o in timeout
    output: str = ""
    error: str = ""


@dataclass(frozen=True)
class Review:
    findings: list[Finding]
    tests: list[SuggestedTest]


SYSTEM_PROMPT = """\
Sei un docente esperto di Python che rivede gli esercizi d'esame di un collega prima della \
pubblicazione su Moodle (domande CodeRunner di tipo python3_w_input).

Come sono fatti gli esercizi:
- Il testo chiede allo studente di scrivere una funzione.
- La soluzione del docente contiene la funzione risolta e un main che legge l'input con \
input(), una riga per valore (di solito un seed per il generatore casuale e una dimensione), \
costruisce i dati, chiama la funzione e stampa il risultato.
- Ogni test è un input (le righe lette dal main); l'output atteso si ottiene eseguendo la \
soluzione del docente.

Il tuo compito: trovare problemi concreti, non dare consigli di stile.
- "errore": la soluzione non fa ciò che chiede il testo, oppure va in errore per alcuni input \
ammessi.
- "caso_limite": un input ammesso dal testo (es. dimensione 0 o 1, valori tutti uguali, \
nessun elemento che soddisfa la condizione) su cui il comportamento è dubbio o non specificato.
- "testo": il testo è ambiguo, incompleto o in contrasto con la soluzione, così uno studente \
potrebbe risolvere correttamente in un altro modo.
- "test_mancante": una situazione importante che nessun test esistente copre.

Per i test suggeriti scrivi solo l'input, nello stesso formato dei test esistenti (stesso \
numero di righe, stesso significato). Non scrivere l'output: lo calcola l'applicazione. Non \
ripetere input già presenti.

Se non trovi problemi, restituisci liste vuote: è un risultato valido. Scrivi in italiano.

Rispondi solo con un oggetto JSON di questa forma:
{"segnalazioni": [{"tipo": "errore" | "caso_limite" | "testo" | "test_mancante", \
"titolo": "frase breve", "spiegazione": "due o tre frasi", "riga": numero di riga della \
soluzione oppure null}], "test_suggeriti": [{"input": "righe separate da \\n", "motivo": \
"cosa verifica"}]}"""


class NothingToReview(ValueError):
    """Manca il testo o la soluzione: la richiesta al modello sarebbe inutile."""


def review_solution(question: Question, model: LanguageModel, runner: CodeRunner) -> Review:
    if not question.solution.strip():
        raise NothingToReview("Scrivi prima la soluzione")
    if not plain_text(question.text_html):
        raise NothingToReview(
            "Scrivi prima la traccia: la revisione confronta la soluzione con quello che chiede "
            "il testo"
        )
    reply = ask_json(model, review_messages(question))
    lines = question.solution.count("\n") + 1
    findings = _findings(reply.get("segnalazioni"), lines)
    tests = [_run(test, question, runner) for test in _tests(reply.get("test_suggeriti"), question)]
    # Un input senza abbastanza righe non dice nulla sulla soluzione: il modello ha sbagliato
    # il formato
    tests = [t for t in tests if "EOFError" not in t.error]
    return Review(findings=findings, tests=tests)


def review_messages(question: Question) -> list[Message]:
    numbered = "\n".join(
        f"{i:>3} | {line}" for i, line in enumerate(question.solution.splitlines(), start=1)
    )
    existing = question.testcases[:MAX_EXISTING_TESTS]
    tests = "\n".join(
        f"- test {i}: " + " | ".join(tc.stdin.splitlines()) for i, tc in enumerate(existing, 1)
    )
    if len(question.testcases) > len(existing):
        tests += f"\n- … e altri {len(question.testcases) - len(existing)} test"
    user = (
        f"TESTO DELL'ESERCIZIO\n{plain_text(question.text_html) or '(vuoto)'}\n\n"
        f"SOLUZIONE DEL DOCENTE (numeri di riga a sinistra)\n{numbered or '(vuota)'}\n\n"
        f"INPUT DEI TEST ESISTENTI (righe separate da |)\n{tests or '(nessun test)'}"
    )
    return [Message("system", SYSTEM_PROMPT), Message("user", user)]


def _findings(raw: object, solution_lines: int) -> list[Finding]:
    findings = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict) or item.get("tipo") not in FINDING_KINDS:
            continue
        title = _text(item.get("titolo"), MAX_TITLE)
        explanation = _text(item.get("spiegazione"), MAX_EXPLANATION)
        if not title and not explanation:
            continue
        findings.append(
            Finding(
                kind=item["tipo"],
                title=title or explanation[:MAX_TITLE],
                explanation=explanation,
                line=_line(item.get("riga"), solution_lines),
            )
        )
    return findings[:MAX_FINDINGS]


def _tests(raw: object, question: Question) -> list[SuggestedTest]:
    seen = {_input_key(tc.stdin) for tc in question.testcases}
    tests = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        stdin = _stdin(item.get("input"))
        if stdin is None or _input_key(stdin) in seen:
            continue
        seen.add(_input_key(stdin))
        tests.append(SuggestedTest(stdin=stdin, reason=_text(item.get("motivo"), MAX_EXPLANATION)))
    return tests[:MAX_TESTS]


def _run(test: SuggestedTest, question: Question, runner: CodeRunner) -> SuggestedTest:
    result = runner.run(question.solution, test.stdin)
    error = run_error(result)
    return SuggestedTest(
        stdin=test.stdin, reason=test.reason, output="" if error else result.stdout, error=error
    )


def _text(value: object, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _line(value: object, solution_lines: int) -> int | None:
    if isinstance(value, str) and value.strip().isdigit():
        value = int(value)
    if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= solution_lines:
        return value
    return None


def _stdin(value: object) -> str | None:
    """L'input come lo scrive il docente: righe separate da a capo, senza a capo finale.
    Il modello a volte lo dà come lista di righe o come numero."""
    if isinstance(value, list):
        if not all(isinstance(v, (str, int, float)) and not isinstance(v, bool) for v in value):
            return None
        value = "\n".join(str(v) for v in value)
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        value = str(value)
    if not isinstance(value, str):
        return None
    lines = [line.strip() for line in value.replace("\r\n", "\n").split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    if not lines or len(lines) > MAX_INPUT_LINES:
        return None
    return "\n".join(lines)


def _input_key(stdin: str) -> tuple[str, ...]:
    lines = [line.strip() for line in stdin.splitlines()]
    while lines and not lines[-1]:
        lines.pop()
    return tuple(lines)


class _TextExtractor(HTMLParser):
    BLOCKS: ClassVar[set[str]] = {
        "p",
        "div",
        "br",
        "li",
        "tr",
        "h1",
        "h2",
        "h3",
        "h4",
        "pre",
        "table",
        "ul",
        "ol",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in self.BLOCKS:
            self.parts.append("\n")
        if tag == "li":
            self.parts.append("- ")
        if tag == "img":
            self.parts.append("[immagine]")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def plain_text(html: str) -> str:
    """Il testo dell'esercizio senza HTML, con un a capo per paragrafo e voce di elenco."""
    parser = _TextExtractor()
    parser.feed(html)
    parser.close()
    lines = [" ".join(line.split()) for line in "".join(parser.parts).splitlines()]
    text = "\n".join(lines)
    while "\n\n\n" in text:
        text = text.replace("\n\n\n", "\n\n")
    return text.strip()
