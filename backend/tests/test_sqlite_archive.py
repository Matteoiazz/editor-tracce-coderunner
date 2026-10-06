from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

from tesi.adapters.sqlite_archive import SqliteTrackArchive, plain_text
from tesi.application.archive import duplicate_track
from tesi.domain import ExamKind, ExamTrack, Question, TestCase, TrackExercise
from tesi.ports import InvalidBackup, TrackNotFound, TrackNotInTrash


class Clock:
    """Orologio controllato dai test: avanza di un minuto a ogni lettura."""

    def __init__(self) -> None:
        self.current = datetime(2026, 10, 3, 9, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        self.current += timedelta(minutes=1)
        return self.current


@pytest.fixture
def archive(tmp_path: Path) -> SqliteTrackArchive:
    return SqliteTrackArchive(tmp_path / "dati" / "archivio.db", clock=Clock())


def make_track(track_id: str = "t1", exercises: int = 2) -> ExamTrack:
    return ExamTrack(
        id=track_id,
        kind=ExamKind.ESAME,
        day=date(2026, 7, 3),
        number=1,
        common_tests=[TestCase(stdin="0\n1", hide_rest_if_fail=True)],
        exercises=[
            TrackExercise(
                number=n,
                use_common=True,
                common_expected=[f"output {n}"],
                question=Question(
                    name=f"Esame-2026-07-03-Traccia1-Esercizio{n}",
                    text_html=f"<p>Testo {n}</p>",
                    solution="print(input())",
                    student_code="",
                    testcases=[TestCase(stdin="5\n10", expected="5\n10\n", use_as_example=True)],
                    default_grade=6,
                    tags=["Python - easy", "liste"],
                    settings={"penalty": "0.0000000"},
                ),
            )
            for n in range(1, exercises + 1)
        ],
    )


def test_il_file_viene_creato_solo_al_primo_utilizzo(tmp_path: Path) -> None:
    path = tmp_path / "dati" / "archivio.db"
    archive = SqliteTrackArchive(path)
    assert not path.exists()

    archive.list()

    assert path.exists()


def test_salva_e_rilegge_la_traccia_completa(archive: SqliteTrackArchive) -> None:
    track = make_track()

    saved = archive.save(track)

    assert saved.created_at is not None and saved.updated_at is not None
    loaded = archive.get("t1")
    assert loaded.kind is ExamKind.ESAME
    assert loaded.day == date(2026, 7, 3)
    assert loaded.number == 1
    assert loaded.common_tests == track.common_tests
    assert loaded.exercises == track.exercises
    assert loaded.exported_at is None and loaded.deleted_at is None


def test_aggiornamento_sostituisce_gli_esercizi_e_mantiene_la_creazione(
    archive: SqliteTrackArchive,
) -> None:
    first = archive.save(make_track(exercises=3))
    second = archive.save(make_track(exercises=1))

    assert len(archive.get("t1").exercises) == 1
    assert second.created_at == first.created_at
    assert second.updated_at > first.updated_at


def test_traccia_inesistente(archive: SqliteTrackArchive) -> None:
    with pytest.raises(TrackNotFound):
        archive.get("manca")
    with pytest.raises(TrackNotFound):
        archive.move_to_trash("manca")


def test_elenco_dalla_traccia_modificata_piu_di_recente(archive: SqliteTrackArchive) -> None:
    archive.save(make_track("a", exercises=1))
    archive.save(make_track("b", exercises=3))
    archive.save(make_track("a", exercises=2))

    summaries = archive.list()

    assert [s.id for s in summaries] == ["a", "b"]
    assert [s.exercise_count for s in summaries] == [2, 3]
    assert summaries[0].kind is ExamKind.ESAME and summaries[0].number == 1


def test_cestino_e_ripristino(archive: SqliteTrackArchive) -> None:
    archive.save(make_track("a"))
    archive.save(make_track("b"))

    archive.move_to_trash("a")
    assert [s.id for s in archive.list()] == ["b"]
    assert [s.id for s in archive.list(trash=True)] == ["a"]
    assert archive.get("a").deleted_at is not None

    archive.restore("a")
    assert {s.id for s in archive.list()} == {"a", "b"}
    assert archive.list(trash=True) == []


def test_salvare_una_traccia_nel_cestino_non_la_ripristina(archive: SqliteTrackArchive) -> None:
    archive.save(make_track("a"))
    archive.move_to_trash("a")

    archive.save(make_track("a"))

    assert [s.id for s in archive.list(trash=True)] == ["a"]


def test_eliminazione_definitiva_solo_dal_cestino(archive: SqliteTrackArchive) -> None:
    archive.save(make_track("a"))

    with pytest.raises(TrackNotInTrash):
        archive.delete_forever("a")

    archive.move_to_trash("a")
    archive.delete_forever("a")
    with pytest.raises(TrackNotFound):
        archive.get("a")


def test_svuota_cestino_elimina_anche_gli_esercizi(archive: SqliteTrackArchive) -> None:
    archive.save(make_track("a"))
    archive.save(make_track("b"))
    archive.save(make_track("c"))
    archive.move_to_trash("a")
    archive.move_to_trash("b")

    assert archive.empty_trash() == 2
    assert [s.id for s in archive.list()] == ["c"]
    assert archive.list(trash=True) == []


def test_esportazione_registrata_e_conservata_ai_salvataggi(archive: SqliteTrackArchive) -> None:
    archive.save(make_track())
    exported = archive.mark_exported("t1")

    assert exported.exported_at is not None
    assert archive.save(make_track()).exported_at == exported.exported_at


def test_duplica_una_traccia(archive: SqliteTrackArchive) -> None:
    archive.save(make_track())
    archive.mark_exported("t1")

    copy = duplicate_track(archive, "t1")

    assert copy.id != "t1"
    assert copy.exported_at is None
    assert copy.exercises == archive.get("t1").exercises
    assert len(archive.list()) == 2


def test_archivio_di_una_versione_piu_recente(tmp_path: Path) -> None:
    import sqlite3

    path = tmp_path / "archivio.db"
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA user_version = 99")

    with pytest.raises(RuntimeError, match="versione più recente"):
        SqliteTrackArchive(path).list()


def test_testo_senza_formattazione() -> None:
    html = "<p>Calcola la <strong>somma</strong></p><ul><li>pari &amp; dispari</li></ul>a<br>b"
    assert plain_text(html) == "Calcola la somma\npari & dispari\na\nb"


def with_text(track_id: str, texts: list[tuple[str, list[str]]]) -> ExamTrack:
    track = make_track(track_id, exercises=len(texts))
    for exercise, (text, tags) in zip(track.exercises, texts, strict=True):
        exercise.question.text_html = text
        exercise.question.tags = tags
    return track


def test_ricerca_per_parole_nel_testo_e_nei_tag(archive: SqliteTrackArchive) -> None:
    archive.save(with_text("a", [("<p>Somma dei <b>numeri</b> pari</p>", ["liste"])]))
    archive.save(with_text("b", [("<p>Matrice a forma di Z</p>", ["Matrici"]), ("<p>Città</p>", [])]))

    assert [m.text for m in archive.search_exercises("SOMMA pari")] == ["Somma dei numeri pari"]
    assert [m.track_id for m in archive.search_exercises("matrici")] == ["b"]
    # Lettere accentate e maiuscole
    assert [m.text for m in archive.search_exercises("CITTÀ")] == ["Città"]
    assert archive.search_exercises("somma matrice") == []


def test_ricerca_senza_parole_dalla_traccia_piu_recente(archive: SqliteTrackArchive) -> None:
    archive.save(with_text("a", [("<p>Uno</p>", [])]))
    archive.save(with_text("b", [("<p>Due</p>", []), ("<p>Tre</p>", [])]))

    matches = archive.search_exercises()

    assert [(m.track_id, m.position, m.text) for m in matches] == [
        ("b", 0, "Due"),
        ("b", 1, "Tre"),
        ("a", 0, "Uno"),
    ]
    assert matches[0].track_kind is ExamKind.ESAME
    assert matches[0].track_day == date(2026, 7, 3)
    assert matches[0].name == "Esame-2026-07-03-Traccia1-Esercizio1"


def test_ricerca_esclude_cestino_e_traccia_aperta(archive: SqliteTrackArchive) -> None:
    archive.save(with_text("a", [("<p>Uno</p>", [])]))
    archive.save(with_text("b", [("<p>Due</p>", [])]))
    archive.save(with_text("c", [("<p>Tre</p>", [])]))
    archive.move_to_trash("c")

    assert [m.track_id for m in archive.search_exercises(exclude_track="a")] == ["b"]


def test_backup_e_ripristino(archive: SqliteTrackArchive, tmp_path: Path) -> None:
    archive.save(make_track("a"))
    archive.save(make_track("b"))
    backup = tmp_path / "copie" / "backup.db"

    assert archive.backup_to(backup) == 2

    archive.move_to_trash("a")
    archive.empty_trash()
    archive.save(make_track("c"))

    assert archive.restore_from(backup) == 2
    assert {s.id for s in archive.list()} == {"a", "b"}
    assert archive.get("a").exercises == make_track("a").exercises
    # L'archivio prima del ripristino resta disponibile
    before = SqliteTrackArchive(archive.path.with_name("archivio-prima-del-ripristino.db"))
    assert {s.id for s in before.list()} == {"b", "c"}


def test_ripristino_da_un_file_non_valido(archive: SqliteTrackArchive, tmp_path: Path) -> None:
    archive.save(make_track("a"))
    other = tmp_path / "altro.db"
    other.write_text("non è un database", encoding="utf-8")

    with pytest.raises(InvalidBackup, match="non è un backup"):
        archive.restore_from(other)
    with pytest.raises(InvalidBackup, match="non esiste"):
        archive.restore_from(tmp_path / "manca.db")
    assert [s.id for s in archive.list()] == ["a"]


def test_backup_e_ripristino_sull_archivio_stesso(archive: SqliteTrackArchive) -> None:
    archive.save(make_track("a"))
    # Scritto in modo diverso, ma è lo stesso file
    same = archive.path.parent / "." / archive.path.name

    with pytest.raises(InvalidBackup, match="archivio stesso"):
        archive.backup_to(same)
    with pytest.raises(InvalidBackup, match="archivio attuale"):
        archive.restore_from(same)
    assert [s.id for s in archive.list()] == ["a"]


def test_ripristino_dalla_copia_fatta_prima_del_ripristino(
    archive: SqliteTrackArchive, tmp_path: Path
) -> None:
    archive.save(make_track("a"))
    backup = tmp_path / "backup.db"
    archive.backup_to(backup)
    archive.save(make_track("b"))
    archive.restore_from(backup)  # ora l'archivio ha solo "a"; la copia ha "a" e "b"

    # Annullare il ripristino usando la copia automatica
    archive.restore_from(archive.path.with_name("archivio-prima-del-ripristino.db"))

    assert {s.id for s in archive.list()} == {"a", "b"}


def test_backup_su_un_file_non_scrivibile(archive: SqliteTrackArchive, tmp_path: Path) -> None:
    archive.save(make_track("a"))
    folder = tmp_path / "una-cartella"
    folder.mkdir()

    with pytest.raises(OSError, match="non si può scrivere"):
        archive.backup_to(folder)
