"""Porte: interfacce verso l'esterno, implementate dagli adapter."""

from tesi.ports.code_runner import CodeRunner, RunResult
from tesi.ports.language_model import LanguageModel, Message, ModelError
from tesi.ports.track_archive import (
    InvalidBackup,
    TrackArchive,
    TrackNotFound,
    TrackNotInTrash,
)

__all__ = [
    "CodeRunner",
    "InvalidBackup",
    "LanguageModel",
    "Message",
    "ModelError",
    "RunResult",
    "TrackArchive",
    "TrackNotFound",
    "TrackNotInTrash",
]
