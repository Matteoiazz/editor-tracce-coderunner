"""Porta per l'archivio delle tracce.

L'implementazione attuale usa SQLite; il resto dell'applicazione dipende solo da
questa interfaccia.
"""

from typing import Protocol

from tesi.domain import ExamTrack, TrackSummary


class TrackNotFound(LookupError):
    """Nessuna traccia con l'identificativo indicato."""


class TrackNotInTrash(ValueError):
    """Solo le tracce nel cestino si possono eliminare definitivamente."""


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

    def empty_trash(self) -> int:
        """Elimina tutte le tracce del cestino e restituisce quante erano."""
        ...
