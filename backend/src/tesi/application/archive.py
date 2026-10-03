"""Operazioni sull'archivio che combinano più passi."""

import copy
import uuid

from tesi.domain import ExamTrack
from tesi.ports import TrackArchive


def duplicate_track(archive: TrackArchive, track_id: str) -> ExamTrack:
    """Copia di una traccia come punto di partenza per un nuovo appello.

    La copia ha un nuovo identificativo e non risulta esportata né nel cestino;
    data e numero di traccia restano quelli dell'originale, da cambiare.
    """
    source = archive.get(track_id)
    duplicate = copy.deepcopy(source)
    duplicate.id = str(uuid.uuid4())
    duplicate.created_at = duplicate.updated_at = None
    duplicate.exported_at = duplicate.deleted_at = None
    return archive.save(duplicate)
