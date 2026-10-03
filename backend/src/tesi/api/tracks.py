"""Endpoint sull'archivio delle tracce."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from tesi.application.archive import duplicate_track
from tesi.domain import ExamTrack, ExerciseMatch, TrackSummary
from tesi.ports import TrackArchive, TrackNotFound, TrackNotInTrash

router = APIRouter(prefix="/api", tags=["archivio"])


def get_archive(request: Request) -> TrackArchive:
    return request.app.state.archive


Archive = Annotated[TrackArchive, Depends(get_archive)]


@dataclass
class EmptyTrashResponse:
    deleted: int


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Traccia non trovata nell'archivio")


@router.get("/tracks")
def list_tracks(archive: Archive, trash: bool = False) -> list[TrackSummary]:
    """Tracce in archivio, oppure nel cestino con ``?trash=true``."""
    return archive.list(trash=trash)


@router.get("/tracks/{track_id}")
def get_track(track_id: str, archive: Archive) -> ExamTrack:
    try:
        return archive.get(track_id)
    except TrackNotFound as exc:
        raise _not_found() from exc


@router.put("/tracks/{track_id}")
def save_track(track_id: str, track: ExamTrack, archive: Archive) -> ExamTrack:
    """Crea o aggiorna una traccia."""
    if track.id != track_id:
        raise HTTPException(status_code=422, detail="L'identificativo non corrisponde")
    return archive.save(track)


@router.post("/tracks/{track_id}/duplicate")
def duplicate(track_id: str, archive: Archive) -> ExamTrack:
    try:
        return duplicate_track(archive, track_id)
    except TrackNotFound as exc:
        raise _not_found() from exc


@router.post("/tracks/{track_id}/exported")
def mark_exported(track_id: str, archive: Archive) -> ExamTrack:
    try:
        return archive.mark_exported(track_id)
    except TrackNotFound as exc:
        raise _not_found() from exc


@router.post("/tracks/{track_id}/trash", status_code=204)
def move_to_trash(track_id: str, archive: Archive) -> None:
    try:
        archive.move_to_trash(track_id)
    except TrackNotFound as exc:
        raise _not_found() from exc


@router.post("/tracks/{track_id}/restore", status_code=204)
def restore(track_id: str, archive: Archive) -> None:
    try:
        archive.restore(track_id)
    except TrackNotFound as exc:
        raise _not_found() from exc


@router.delete("/tracks/{track_id}", status_code=204)
def delete_forever(track_id: str, archive: Archive) -> None:
    """Eliminazione definitiva, ammessa solo per le tracce nel cestino."""
    try:
        archive.delete_forever(track_id)
    except TrackNotFound as exc:
        raise _not_found() from exc
    except TrackNotInTrash as exc:
        raise HTTPException(
            status_code=409,
            detail="Solo le tracce nel cestino si possono eliminare definitivamente",
        ) from exc


@router.get("/exercises")
def search_exercises(
    archive: Archive, q: str = "", exclude_track: str | None = None
) -> list[ExerciseMatch]:
    """Esercizi dell'archivio che contengono le parole cercate, per riusarli in un'altra
    traccia; ``exclude_track`` esclude la traccia aperta."""
    return archive.search_exercises(q, exclude_track=exclude_track)


@router.delete("/trash")
def empty_trash(archive: Archive) -> EmptyTrashResponse:
    return EmptyTrashResponse(deleted=archive.empty_trash())
