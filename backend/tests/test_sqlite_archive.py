from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

from tesi.adapters.sqlite_archive import SqliteTrackArchive
from tesi.application.archive import duplicate_track
from tesi.domain import ExamKind, ExamTrack, Question, TestCase, TrackExercise
from tesi.ports import TrackNotFound, TrackNotInTrash


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
