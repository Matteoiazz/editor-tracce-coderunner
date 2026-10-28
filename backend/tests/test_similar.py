"""Esercizi simili con un modello finto, l'esecutore Python vero e un archivio vero."""

import json
from pathlib import Path

import pytest

from tesi.adapters.local_runner import LocalPythonRunner
from tesi.adapters.sqlite_archive import SqliteTrackArchive
from tesi.application.review import NothingToReview
from tesi.application.similar import (
    PROPOSALS,
    StyleExample,
    similar_exercises,
    similar_request,
    style_examples,
    text_to_html,
)
from tesi.domain import ExamKind, ExamTrack, Question, TrackExercise
from tesi.ports import Message, ModelError

MAIN = """
if __name__ == "__main__":
    n = int(input())
    lst = list(range(n))
    print(f"Input: {lst} - Risultato: {FUNZIONE(lst)}")
"""


def solution(name: str, body: str) -> str:
    return f"def {name}(lst):\n    {body}\n" + MAIN.replace("FUNZIONE", name)


SOURCE = solution("somma_pari", "return sum(x for x in lst if x % 2 == 0)")
MAXIMUM = solution("massimo", "return max(lst, default=None)")
COUNT_ODD = solution("conta_dispari", "return sum(1 for x in lst if x % 2)")
# Stesso compito dell'esercizio di partenza con un altro nome
SAME_TASK = solution("pari_sommati", "return sum(x for x in lst if not x % 2)")
CRASHES = solution("primo", "return lst[0]")

INPUTS = ["0", "3", "5"]


def question() -> Question:
    return Question(name="pari", text_html="<p>Somma dei pari della lista.</p>", solution=SOURCE)


def exercise(title: str, code: str) -> dict:
    return {"titolo": title, "testo": f"Scrivere la funzione `{title}`.", "soluzione": code}


class ScriptedModel:
    def __init__(self, *replies: dict) -> None:
        self.replies = [json.dumps(r) for r in replies]
        self.calls: list[list[Message]] = []

    def complete(self, messages: list[Message]) -> str:
        self.calls.append(messages)
        return self.replies.pop(0)


runner = LocalPythonRunner()


def test_la_richiesta_contiene_partenza_ed_esempi_di_stile() -> None:
    examples = [StyleExample("Contare gli zeri.", "def zeri(lst): ...")]
    system, user = similar_request(question(), examples, "argomento: stringhe")
    assert str(PROPOSALS) in system.content
    assert "ESERCIZIO DI PARTENZA\nTesto:\nSomma dei pari della lista." in user.content
    assert "ESEMPIO DI STILE 1" in user.content
    assert "Contare gli zeri." in user.content
    assert user.content.endswith("argomento: stringhe")


def test_senza_testo_o_soluzione_non_chiede_al_modello() -> None:
    q = question()
    q.solution = ""
    with pytest.raises(NothingToReview):
        similar_request(q, [])


def test_proposte_valide_con_esempi_di_output() -> None:
    model = ScriptedModel(
        {"esercizi": [exercise("massimo", MAXIMUM), exercise("conta_dispari", COUNT_ODD)]}
    )
    result = similar_exercises(question(), [], INPUTS, model, runner)

    assert [p.title for p in result.proposals] == ["massimo", "conta_dispari"]
    assert result.discarded == 0
    first = result.proposals[0]
    assert first.text_html == "<p>Scrivere la funzione <code>massimo</code>.</p>"
    assert [(s.stdin, s.output) for s in first.samples] == [
        ("0", "0\nInput: [] - Risultato: None\n"),
        ("3", "3\nInput: [0, 1, 2] - Risultato: 2\n"),
    ]
    assert len(model.calls) == 1


def test_proposte_sbagliate_tornano_al_modello_una_volta() -> None:
    model = ScriptedModel(
        {
            "esercizi": [
                exercise("massimo", MAXIMUM),
                exercise("primo", CRASHES),
                exercise("pari_sommati", SAME_TASK),
            ]
        },
        {"esercizi": [exercise("conta_dispari", COUNT_ODD), exercise("primo", CRASHES)]},
    )
    result = similar_exercises(question(), [], INPUTS, model, runner)

    assert [p.title for p in result.proposals] == ["massimo", "conta_dispari"]
    assert result.discarded == 1
    feedback = model.calls[1][-1].content
    assert "«primo»: con l'input 0 va in errore: IndexError" in feedback
    assert "«pari_sommati»: dà gli stessi risultati dell'esercizio di partenza" in feedback
    assert "Riscrivi solo questi 2 esercizi" in feedback


@pytest.mark.parametrize(
    ("item", "problem"),
    [
        ({"titolo": "x", "soluzione": MAXIMUM}, "manca il testo"),
        ({"titolo": "x", "testo": "t"}, "manca la soluzione"),
        ({"titolo": "x", "testo": "t", "soluzione": "def f(:\n"}, "non è Python valido"),
        (
            {"titolo": "x", "testo": "t", "soluzione": "print(input())\n"},
            "non definisce una funzione",
        ),
        (
            {"titolo": "x", "testo": "t", "soluzione": "def f():\n    return 1\nprint(f())\n"},
            "non legge l'input",
        ),
    ],
)
def test_controlli_sulle_proposte(item: dict, problem: str) -> None:
    model = ScriptedModel({"esercizi": [item]}, {"esercizi": []})
    result = similar_exercises(question(), [], INPUTS, model, runner)
    assert result.proposals == []
    assert result.discarded == 1
    assert problem in model.calls[1][-1].content


def test_due_proposte_con_gli_stessi_output_valgono_una() -> None:
    twin = MAXIMUM.replace("def massimo", "def piu_grande").replace("{massimo(", "{piu_grande(")
    model = ScriptedModel(
        {"esercizi": [exercise("massimo", MAXIMUM), exercise("piu_grande", twin)]}
    )
    result = similar_exercises(question(), [], INPUTS, model, runner)
    assert [p.title for p in result.proposals] == ["massimo"]


def test_nessuna_proposta() -> None:
    with pytest.raises(ModelError):
        similar_exercises(question(), [], INPUTS, ScriptedModel({"esercizi": []}), runner)


def test_testo_in_html_escapato() -> None:
    text = "Scrivere `f(lst)` per <b>lst</b>.\nSeconda riga.\n\n- primo caso\n- secondo caso"
    assert text_to_html(text) == (
        "<p>Scrivere <code>f(lst)</code> per &lt;b&gt;lst&lt;/b&gt;.<br>Seconda riga.</p>"
        "<ul><li><p>primo caso</p></li><li><p>secondo caso</p></li></ul>"
    )


def test_esempi_di_stile_dall_archivio(tmp_path: Path) -> None:
    archive = SqliteTrackArchive(tmp_path / "archivio.db")

    def track(track_id: str, kind: ExamKind, text: str) -> ExamTrack:
        q = Question(name=text, text_html=f"<p>{text}</p>", solution=f"# {text}\n")
        return ExamTrack(id=track_id, kind=kind, exercises=[TrackExercise(question=q, number=1)])

    archive.save(track("pretest", ExamKind.PRETEST, "Pretest vecchio"))
    archive.save(track("esame-1", ExamKind.ESAME, "Esame uno"))
    archive.save(track("aperta", ExamKind.ESAME, "Traccia aperta"))
    archive.save(ExamTrack(id="vuota", kind=ExamKind.ESAME))

    examples = style_examples(archive, ExamKind.ESAME, exclude_track="aperta")
    # Prima le tracce d'esame, poi le altre; esclusa quella aperta e quelle senza esercizi
    assert [e.text for e in examples] == ["Esame uno", "Pretest vecchio"]
