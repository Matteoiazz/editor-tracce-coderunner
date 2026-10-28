"""Porta per l'archivio delle tracce.

L'implementazione attuale usa SQLite; il resto dell'applicazione dipende solo da
questa interfaccia.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from tesi.domain import ExamTrack, ExerciseMatch, TrackSummary


class TrackNotFound(LookupError):
    """Nessuna traccia con l'identificativo indicato."""


class TrackNotInTrash(ValueError):
    """Solo le tracce nel cestino si possono eliminare definitivamente."""


class InvalidBackup(ValueError):
    """Il file indicato non è un backup dell'archivio utilizzabile."""


class TrackArchive(Protocol):
    def list(self, *, trash: bool = False) -> list[TrackSummary]:
        """Tracce in archivio (o nel cestino), dalla modificata più di recente."""
        ...

    def get(self, track_id: str) -> ExamTrack:
        """Traccia completa; solleva TrackNotFound se non esiste."""
        ...

    def save(self, track: ExamTrack) -> ExamTrack:
        """Crea o aggiorna la traccia e restituisce la versione salvata, con le date."""
        ...

    def mark_exported(self, track_id: str) -> ExamTrack:
        """Registra il momento dell'ultima esportazione."""
        ...

    def move_to_trash(self, track_id: str) -> None: ...

    def restore(self, track_id: str) -> None:
        """Riporta in archivio una traccia del cestino."""
        ...

    def delete_forever(self, track_id: str) -> None:
        """Elimina una traccia del cestino; solleva TrackNotInTrash se non vi si trova."""
        ...

    def search_exercises(
        self, query: str = "", *, exclude_track: str | None = None
    ) -> list[ExerciseMatch]:
        """Esercizi delle tracce in archivio (non nel cestino) che contengono tutte le parole
        di ``query`` nel nome, nel testo o nei tag; senza parole, tutti, senza limite di
        numero. Dalla traccia modificata più di recente."""
        ...

    def empty_trash(self) -> int:
        """Elimina tutte le tracce del cestino e restituisce quante erano."""
        ...

    def backup_to(self, target: Path) -> int:
        """Copia completa dell'archivio nel file indicato; restituisce il numero di tracce.
        Solleva InvalidBackup se il file è l'archivio stesso, OSError se non si può scrivere."""
        ...

    def inspect_backup(self, source: Path) -> int:
        """Numero di tracce del backup, senza ripristinarlo; solleva InvalidBackup se il file
        non è utilizzabile (anche se è l'archivio stesso)."""
        ...

    def restore_from(self, source: Path) -> int:
        """Sostituisce l'archivio con il contenuto di un backup, dopo averne conservato una
        copia; solleva InvalidBackup se il file non è utilizzabile. Restituisce il numero
        di tracce ripristinate."""
        ...
