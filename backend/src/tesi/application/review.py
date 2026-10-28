"""Revisione della soluzione del docente con il modello linguistico.

Il modello legge testo, soluzione e input dei test e restituisce segnalazioni (possibili
errori, casi limite, testo ambiguo, test mancanti) e test da aggiungere. Le sue risposte sono
ipotesi: i test suggeriti si eseguono davvero sulla soluzione, così il docente vede l'output
reale, o l'errore, e non quello immaginato dal modello.
"""

from dataclasses import dataclass
from typing import Literal

from tesi.application.ai import ask_json, with_notes
from tesi.application.verification import run_error
from tesi.domain import Question, TestCase, plain_text
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
# Output dei test mostrati al modello: inizio e fine, dove di solito c'è il risultato
MAX_OUTPUT_CHARS = 300


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
- Lo studente riceve un codice di partenza con il main già scritto: completa solo la funzione. \
Input, output e struttura del programma non sono compito suo, quindi il testo non deve \
descriverli.
- La soluzione del docente contiene la funzione risolta e lo stesso main, che legge l'input \
con input(), una riga per valore (di solito un seed per il generatore casuale e una \
dimensione), costruisce i dati, chiama la funzione e stampa il risultato.
- Ogni test è un input (le righe lette dal main); l'output atteso si ottiene eseguendo la \
soluzione del docente. Ti vengono mostrati gli output già calcolati, senza le righe di input \
che il programma ristampa: guardali per sapere quali dati generano davvero i test.

Il tuo compito: trovare problemi concreti, non dare consigli di stile.
- "errore": la funzione non fa ciò che chiede il testo, oppure va in errore per alcuni input \
ammessi.
- "caso_limite": un input ammesso dal testo (es. dimensione 0 o 1, valori tutti uguali, \
nessun elemento che soddisfa la condizione) su cui il comportamento della funzione è sbagliato \
o non deducibile dal testo. Se la funzione lo gestisce bene e il testo permette di capire cosa \
fare, non segnalarlo.
- "testo": il testo della funzione è ambiguo, incompleto o in contrasto con la soluzione, così \
uno studente potrebbe scrivere una funzione diversa ma ragionevole che non passa i test.
- "test_mancante": una situazione importante che, dagli output mostrati, nessun test copre. \
Basati sugli output, non su ipotesi: se un test la copre già, non segnalarla.

Test suggeriti: solo se verificano un caso preciso che i test esistenti non coprono, e solo \
se quel caso si ottiene con certezza dall'input (per esempio una dimensione limite come 0, 1 \
o 2, o molto grande). Non sai quali dati produce un seed nuovo, quindi non suggerire seed \
nuovi "per aumentare la copertura" né per ottenere dati di un certo tipo. Scrivi solo \
l'input, nello stesso formato dei test esistenti (stesso numero di righe, stesso \
significato), e non l'output: lo calcola l'applicazione. Non ripetere input già presenti. \
Meglio nessun test che un test senza un motivo preciso.

Se non trovi problemi, restituisci liste vuote: è un risultato valido. Scrivi in italiano.

Rispondi solo con un oggetto JSON di questa forma:
{"segnalazioni": [{"tipo": "errore" | "caso_limite" | "testo" | "test_mancante", \
"titolo": "frase breve", "spiegazione": "due o tre frasi", "riga": numero di riga della \
soluzione oppure null}], "test_suggeriti": [{"input": "righe separate da \\n", "motivo": \
"cosa verifica"}]}"""


class NothingToReview(ValueError):
    """Manca il testo o la soluzione: la richiesta al modello sarebbe inutile."""


def review_request(question: Question, notes: str = "") -> list[Message]:
    """I messaggi per il modello, con le indicazioni aggiuntive del docente. Gli stessi
    messaggi si mostrano al docente prima dell'invio."""
    if not question.solution.strip():
        raise NothingToReview("Scrivi prima la soluzione")
    if not plain_text(question.text_html):
        raise NothingToReview(
            "Scrivi prima il testo dell'esercizio: la revisione confronta la soluzione con quello "
            "che chiede"
        )
    return with_notes(review_messages(question), notes)


def review_solution(
    question: Question, model: LanguageModel, runner: CodeRunner, notes: str = ""
) -> Review:
    reply = ask_json(model, review_request(question, notes))
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
    tests = "\n".join(test_line(i, tc) for i, tc in enumerate(existing, 1))
    if len(question.testcases) > len(existing):
        tests += f"\n- … e altri {len(question.testcases) - len(existing)} test"
    parts = [
        f"TESTO DELL'ESERCIZIO\n{plain_text(question.text_html) or '(vuoto)'}",
        f"SOLUZIONE DEL DOCENTE (numeri di riga a sinistra)\n{numbered or '(vuota)'}",
    ]
    if question.student_code.strip():
        parts.append(f"CODICE DI PARTENZA DELLO STUDENTE\n{question.student_code.strip()}")
    parts.append(
        "TEST ESISTENTI (righe dell'input separate da |, output senza le righe di input)\n"
        + (tests or "(nessun test)")
    )
    return [Message("system", SYSTEM_PROMPT), Message("user", "\n\n".join(parts))]


def test_line(number: int, test: TestCase) -> str:
    """Un test per il modello: input su una riga e, se calcolato, output accorciato."""
    line = f"- test {number}: input " + " | ".join(test.stdin.splitlines())
    output = _output_summary(test)
    return f"{line} → output {output}" if output else line


def _output_summary(test: TestCase) -> str:
    """L'output atteso senza le righe di input ristampate (python3_w_input), su una riga e
    accorciato al centro; vuoto se non è stato calcolato."""
    lines = test.expected.splitlines()
    for given in test.stdin.splitlines():
        if lines and lines[0].strip() == given.strip():
            lines.pop(0)
    text = " | ".join(line.rstrip() for line in lines if line.strip())
    if len(text) > MAX_OUTPUT_CHARS:
        head = MAX_OUTPUT_CHARS * 2 // 3
        text = f"{text[:head]} … {text[-(MAX_OUTPUT_CHARS - head) :]}"
    return text


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
