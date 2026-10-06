"""Archivio delle tracce in un database SQLite (un unico file).

Ogni traccia è una riga di ``tracks``; i suoi esercizi sono righe di ``exercises``.
Il contenuto completo di un esercizio è salvato in JSON; nome, testo e tag hanno
anche colonne proprie, per le ricerche.
"""

from __future__ import annotations

import html
import json
import re
import sqlite3
import tempfile
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import asdict
from datetime import UTC, date, datetime
from pathlib import Path

from tesi.domain import (
    ExamKind,
    ExamTrack,
    ExerciseMatch,
    Question,
    TestCase,
    TrackExercise,
    TrackSummary,
)
from tesi.ports import InvalidBackup, TrackNotFound, TrackNotInTrash

# Da incrementare a ogni modifica dello schema, con la relativa migrazione in _prepare
SCHEMA_VERSION = 1

# Copia dell'archivio fatta automaticamente prima di un ripristino
BEFORE_RESTORE_FILE = "archivio-prima-del-ripristino.db"

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

    def search_exercises(
        self, query: str = "", *, exclude_track: str | None = None, limit: int = 100
    ) -> list[ExerciseMatch]:
        with self._connect() as db:
            rows = db.execute(
                """SELECT t.id, e.position, t.kind, t.day, t.number, e.number, e.name,
                          e.tags, e.text_html
                   FROM exercises e JOIN tracks t ON t.id = e.track_id
                   WHERE t.deleted_at IS NULL AND t.id IS NOT ?
                   ORDER BY t.updated_at DESC, e.position""",
                (exclude_track,),
            ).fetchall()
        # Il filtro è fatto in Python: confronta il testo senza formattazione e gestisce
        # maiuscole e lettere accentate, che LIKE di SQLite non tratta
        words = query.casefold().split()
        matches = []
        for track_id, position, kind, day, track_number, number, name, tags, text_html in rows:
            text = plain_text(text_html)
            haystack = f"{name}\n{tags}\n{text}".casefold()
            if all(word in haystack for word in words):
                matches.append(
                    ExerciseMatch(
                        track_id=track_id,
                        position=position,
                        track_kind=_kind(kind),
                        track_day=_day(day),
                        track_number=track_number,
                        number=number,
                        name=name,
                        tags=[tag for tag in tags.split(", ") if tag],
                        text=text,
                    )
                )
                if len(matches) == limit:
                    break
        return matches

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

    # ---------------------------------------------------------------- backup

    def backup_to(self, target: Path) -> int:
        # Copiare un database su se stesso bloccherebbe SQLite senza mai terminare
        if _same_file(target, self.path):
            raise InvalidBackup("Il backup non può sostituire l'archivio stesso: scegli un altro file")
        # L'API di backup di SQLite produce una copia coerente anche a database aperto
        with self._connect() as db:
            count = db.execute("SELECT COUNT(*) FROM tracks").fetchone()[0]
        _copy_database(self.path, target)
        return count

    def restore_from(self, source: Path) -> int:
        if _same_file(source, self.path):
            raise InvalidBackup("Il file scelto è l'archivio attuale: scegli un backup")
        count = _check_backup(source)
        with self._connect():
            pass  # l'archivio esiste e ha lo schema aggiornato prima di essere copiato
        # Il backup viene prima copiato a parte: potrebbe essere proprio la copia che sta per
        # essere sovrascritta (ripristino da archivio-prima-del-ripristino.db)
        with tempfile.TemporaryDirectory() as folder:
            staged = Path(folder) / "backup.db"
            _copy_database(source, staged)
            _copy_database(self.path, self.path.with_name(BEFORE_RESTORE_FILE))
            _copy_database(staged, self.path)
        return count

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


def _same_file(a: Path, b: Path) -> bool:
    """Vero se i due percorsi indicano lo stesso file, anche se scritti in modo diverso."""
    try:
        return a.resolve() == b.resolve() or (a.exists() and b.exists() and a.samefile(b))
    except OSError:
        return False


def _copy_database(source: Path, target: Path) -> None:
    """Copia completa di un database SQLite, sostituendo il contenuto di ``target``.
    Gli errori di SQLite (es. file bloccato da un altro programma) diventano OSError."""
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        src = sqlite3.connect(source)
        try:
            dst = sqlite3.connect(target)
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()
    except sqlite3.Error as exc:
        raise OSError(f"il file {target} non si può scrivere ({exc})") from exc


def _check_backup(path: Path) -> int:
    """Numero di tracce del backup; InvalidBackup se il file non è un archivio valido."""
    if not path.is_file():
        raise InvalidBackup(f"Il file {path} non esiste")
    try:
        db = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        try:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master")}
            if version < 1 or not {"tracks", "exercises"} <= tables:
                raise InvalidBackup("Il file scelto non è un backup dell'archivio delle tracce")
            if version > SCHEMA_VERSION:
                raise InvalidBackup(
                    "Il backup è stato creato da una versione più recente dell'applicazione"
                )
            return db.execute("SELECT COUNT(*) FROM tracks").fetchone()[0]
        finally:
            db.close()
    except sqlite3.DatabaseError as exc:
        raise InvalidBackup("Il file scelto non è un backup dell'archivio delle tracce") from exc


_BLOCK_END = re.compile(r"</(p|div|li|h[1-6]|tr|pre)>|<br\s*/?>", re.IGNORECASE)
_TAG = re.compile(r"<[^>]+>")


def plain_text(text_html: str) -> str:
    """Testo leggibile di un frammento HTML: un a capo per ogni paragrafo o riga."""
    text = html.unescape(_TAG.sub("", _BLOCK_END.sub("\n", text_html)))
    lines = (" ".join(line.split()) for line in text.splitlines())
    return "\n".join(line for line in lines if line)


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
