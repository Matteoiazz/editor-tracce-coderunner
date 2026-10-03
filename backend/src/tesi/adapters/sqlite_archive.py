"""Archivio delle tracce in un database SQLite (un unico file).

Ogni traccia è una riga di ``tracks``; i suoi esercizi sono righe di ``exercises``.
Il contenuto completo di un esercizio è salvato in JSON; nome, testo e tag hanno
anche colonne proprie, per le ricerche.
"""

import json
import sqlite3
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import asdict
from datetime import UTC, date, datetime
from pathlib import Path

from tesi.domain import ExamKind, ExamTrack, Question, TestCase, TrackExercise, TrackSummary
from tesi.ports import TrackNotFound, TrackNotInTrash

# Da incrementare a ogni modifica dello schema, con la relativa migrazione in _prepare
SCHEMA_VERSION = 1

_SCHEMA = """
CREATE TABLE tracks (
    id           TEXT PRIMARY KEY,
    kind         TEXT,
    day          TEXT,
    number       INTEGER,
    common_tests TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    exported_at  TEXT,
    deleted_at   TEXT
);
CREATE TABLE exercises (
    track_id  TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position  INTEGER NOT NULL,
    number    INTEGER,
    name      TEXT NOT NULL,
    text_html TEXT NOT NULL,
    tags      TEXT NOT NULL,
    data      TEXT NOT NULL,
    PRIMARY KEY (track_id, position)
);
CREATE INDEX tracks_by_update ON tracks(deleted_at, updated_at);
"""


def _now() -> datetime:
    return datetime.now(UTC)


class SqliteTrackArchive:
    def __init__(self, path: Path, clock: Callable[[], datetime] = _now) -> None:
        # Il file viene creato al primo utilizzo, non alla costruzione
        self.path = path
        self._clock = clock
        self._ready = False

    # ---------------------------------------------------------------- lettura

    def list(self, *, trash: bool = False) -> list[TrackSummary]:
        condition = "t.deleted_at IS NOT NULL" if trash else "t.deleted_at IS NULL"
        with self._connect() as db:
            rows = db.execute(
                f"""SELECT t.id, t.kind, t.day, t.number, t.updated_at, t.exported_at,
                           t.deleted_at, COUNT(e.position)
                    FROM tracks t LEFT JOIN exercises e ON e.track_id = t.id
                    WHERE {condition}
                    GROUP BY t.id
                    ORDER BY t.updated_at DESC"""
            ).fetchall()
        return [
            TrackSummary(
                id=row[0],
                kind=_kind(row[1]),
                day=_day(row[2]),
                number=row[3],
                updated_at=datetime.fromisoformat(row[4]),
                exported_at=_moment(row[5]),
                deleted_at=_moment(row[6]),
                exercise_count=row[7],
            )
            for row in rows
        ]

    def get(self, track_id: str) -> ExamTrack:
        with self._connect() as db:
            return self._read(db, track_id)

    # ---------------------------------------------------------------- scrittura

    def save(self, track: ExamTrack) -> ExamTrack:
        now = self._clock().isoformat()
        with self._connect() as db:
            existing = db.execute(
                "SELECT created_at, exported_at, deleted_at FROM tracks WHERE id = ?",
                (track.id,),
            ).fetchone()
            # Creazione, esportazione e cestino sono gestiti dall'archivio, non da chi salva
            created_at, exported_at, deleted_at = existing or (now, None, None)
            db.execute(
                """INSERT OR REPLACE INTO tracks
                   (id, kind, day, number, common_tests, created_at, updated_at,
                    exported_at, deleted_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    track.id,
                    track.kind.value if track.kind else None,
                    track.day.isoformat() if track.day else None,
                    track.number,
                    json.dumps([asdict(test) for test in track.common_tests]),
                    created_at,
                    now,
                    exported_at,
                    deleted_at,
                ),
            )
            db.execute("DELETE FROM exercises WHERE track_id = ?", (track.id,))
            db.executemany(
                """INSERT INTO exercises (track_id, position, number, name, text_html, tags, data)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        track.id,
                        position,
                        exercise.number,
                        exercise.question.name,
                        exercise.question.text_html,
                        ", ".join(exercise.question.tags),
                        json.dumps(asdict(exercise)),
                    )
                    for position, exercise in enumerate(track.exercises)
                ],
            )
            return self._read(db, track.id)

    def mark_exported(self, track_id: str) -> ExamTrack:
        with self._connect() as db:
            self._update(db, track_id, "exported_at = ?", self._clock().isoformat())
            return self._read(db, track_id)

    def move_to_trash(self, track_id: str) -> None:
        with self._connect() as db:
            self._update(db, track_id, "deleted_at = ?", self._clock().isoformat())

    def restore(self, track_id: str) -> None:
        with self._connect() as db:
            self._update(db, track_id, "deleted_at = ?", None)

    def delete_forever(self, track_id: str) -> None:
        with self._connect() as db:
            row = db.execute("SELECT deleted_at FROM tracks WHERE id = ?", (track_id,)).fetchone()
            if row is None:
                raise TrackNotFound(track_id)
            if row[0] is None:
                raise TrackNotInTrash(track_id)
            db.execute("DELETE FROM tracks WHERE id = ?", (track_id,))

    def empty_trash(self) -> int:
        with self._connect() as db:
            return db.execute("DELETE FROM tracks WHERE deleted_at IS NOT NULL").rowcount

    # ---------------------------------------------------------------- interni

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        """Connessione per una singola operazione: le modifiche sono confermate tutte
        insieme alla fine, o annullate tutte in caso di errore."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path)
        try:
            db.execute("PRAGMA foreign_keys = ON")
            if not self._ready:
                self._prepare(db)
                self._ready = True
            with db:
                yield db
        finally:
            db.close()

    def _prepare(self, db: sqlite3.Connection) -> None:
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version == 0:
            with db:
                db.executescript(_SCHEMA)
                db.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        elif version > SCHEMA_VERSION:
            raise RuntimeError(
                f"L'archivio {self.path} è stato creato da una versione più recente "
                "dell'applicazione"
            )

    def _update(self, db: sqlite3.Connection, track_id: str, assignment: str, value: object) -> None:
        cursor = db.execute(f"UPDATE tracks SET {assignment} WHERE id = ?", (value, track_id))
        if cursor.rowcount == 0:
            raise TrackNotFound(track_id)

    def _read(self, db: sqlite3.Connection, track_id: str) -> ExamTrack:
        row = db.execute(
            """SELECT kind, day, number, common_tests, created_at, updated_at,
                      exported_at, deleted_at
               FROM tracks WHERE id = ?""",
            (track_id,),
        ).fetchone()
        if row is None:
            raise TrackNotFound(track_id)
        exercises = db.execute(
            "SELECT data FROM exercises WHERE track_id = ? ORDER BY position", (track_id,)
        ).fetchall()
        return ExamTrack(
            id=track_id,
            kind=_kind(row[0]),
            day=_day(row[1]),
            number=row[2],
            common_tests=[TestCase(**test) for test in json.loads(row[3])],
            exercises=[_exercise(json.loads(data)) for (data,) in exercises],
            created_at=datetime.fromisoformat(row[4]),
            updated_at=datetime.fromisoformat(row[5]),
            exported_at=_moment(row[6]),
            deleted_at=_moment(row[7]),
        )


def _exercise(data: dict) -> TrackExercise:
    question = dict(data["question"])
    question["testcases"] = [TestCase(**test) for test in question["testcases"]]
    return TrackExercise(
        question=Question(**question),
        number=data["number"],
        use_common=data["use_common"],
        common_expected=data["common_expected"],
    )


def _kind(value: str | None) -> ExamKind | None:
    return ExamKind(value) if value else None


def _day(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _moment(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None
