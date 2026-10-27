"""Endpoint delle funzioni AI.

La chiave di OpenRouter arriva a ogni richiesta nell'intestazione X-OpenRouter-Key, aggiunta
dal processo principale di Electron: la pagina non la vede e il backend non la salva.
"""

from dataclasses import dataclass

from fastapi import APIRouter, Header, HTTPException, Request

from tesi.api.questions import runner
from tesi.application.ai import ModelCheck, RequestPreview, check_model, preview_of
from tesi.application.review import Review, review_request, review_solution
from tesi.domain import Question
from tesi.ports import LanguageModel, ModelError

router = APIRouter(prefix="/api/ai", tags=["ai"])

KEY_HEADER = "X-OpenRouter-Key"


@dataclass
class ModelRequest:
    # Identificativo del modello di OpenRouter, "fornitore/nome"
    model: str


def language_model(request: Request, key: str | None, model: str) -> LanguageModel:
    if not key:
        raise HTTPException(status_code=400, detail="Manca la chiave di OpenRouter")
    if not model.strip():
        raise HTTPException(status_code=400, detail="Manca il modello")
    # create_app la imposta; i test la sostituiscono con un modello finto
    return request.app.state.model_factory(key, model.strip())


def model_failed(exc: ModelError) -> HTTPException:
    return HTTPException(status_code=502, detail={"kind": exc.kind, "message": exc.message})


@router.post("/check")
def check(
    body: ModelRequest,
    request: Request,
    key: str | None = Header(default=None, alias=KEY_HEADER),
) -> ModelCheck:
    """Prova chiave e modello con una richiesta breve."""
    model = language_model(request, key, body.model)
    try:
        return check_model(model)
    except ModelError as exc:
        raise model_failed(exc) from exc


@dataclass
class ReviewPreviewRequest:
    # L'esercizio con tutti i suoi test, comuni compresi
    question: Question
    # Indicazioni aggiuntive scritte dal docente prima dell'invio
    notes: str = ""


@dataclass
class ReviewRequest(ReviewPreviewRequest):
    model: str = ""


@router.post("/review/preview")
def review_preview(body: ReviewPreviewRequest) -> RequestPreview:
    """La richiesta di revisione che verrà inviata al modello, da mostrare al docente.
    Non contatta il modello e non serve la chiave."""
    try:
        return preview_of(review_request(body.question, body.notes))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/review")
def review(
    body: ReviewRequest,
    request: Request,
    key: str | None = Header(default=None, alias=KEY_HEADER),
) -> Review:
    """Revisione della soluzione: segnalazioni del modello e test suggeriti già eseguiti."""
    model = language_model(request, key, body.model)
    try:
        return review_solution(body.question, model, runner, body.notes)
    except ValueError as exc:
        # testo o soluzione mancanti, indicazioni troppo lunghe
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ModelError as exc:
        raise model_failed(exc) from exc
