"""Endpoint delle funzioni AI.

La chiave di OpenRouter arriva a ogni richiesta nell'intestazione X-OpenRouter-Key, aggiunta
dal processo principale di Electron: la pagina non la vede e il backend non la salva.
"""

from dataclasses import dataclass, field

from fastapi import APIRouter, Header, HTTPException, Request

from tesi.api.questions import runner
from tesi.application.ai import ModelCheck, RequestPreview, check_model, preview_of
from tesi.application.fix import Fix, fix_request, fix_solution
from tesi.application.generate import GeneratedSolution, generate_request, generate_solution
from tesi.application.review import Finding, Review, review_request, review_solution
from tesi.application.similar import (
    SimilarExercises,
    StyleExample,
    similar_exercises,
    similar_request,
    style_examples,
)
from tesi.domain import ExamKind, Question
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


@dataclass
class FixPreviewRequest:
    question: Question
    # La segnalazione della revisione da correggere
    finding: Finding
    notes: str = ""


@dataclass
class FixRequest(FixPreviewRequest):
    model: str = ""
    # Altri input su cui confrontare le due soluzioni (test suggeriti non ancora aggiunti)
    extra_inputs: list[str] = field(default_factory=list)


@router.post("/fix/preview")
def fix_preview(body: FixPreviewRequest) -> RequestPreview:
    """La richiesta di correzione che verrà inviata al modello, da mostrare al docente."""
    try:
        return preview_of(fix_request(body.question, body.finding, body.notes))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/fix")
def fix(
    body: FixRequest,
    request: Request,
    key: str | None = Header(default=None, alias=KEY_HEADER),
) -> Fix:
    """Soluzione corretta proposta dal modello, confrontata con quella attuale su tutti i test."""
    model = language_model(request, key, body.model)
    try:
        return fix_solution(
            body.question, body.finding, model, runner, body.extra_inputs[:20], body.notes
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ModelError as exc:
        raise model_failed(exc) from exc


@dataclass
class GeneratePreviewRequest:
    # L'esercizio con tutti i suoi test, comuni compresi
    question: Question
    notes: str = ""


@dataclass
class GenerateRequest(GeneratePreviewRequest):
    model: str = ""


@router.post("/generate/preview")
def generate_preview(body: GeneratePreviewRequest) -> RequestPreview:
    """La richiesta di generazione che verrà inviata al modello, da mostrare al docente."""
    try:
        return preview_of(generate_request(body.question, body.notes))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/generate")
def generate(
    body: GenerateRequest,
    request: Request,
    key: str | None = Header(default=None, alias=KEY_HEADER),
) -> GeneratedSolution:
    """Soluzione generata dal modello e controllata sui test, fino a tre tentativi."""
    model = language_model(request, key, body.model)
    try:
        return generate_solution(body.question, model, runner, body.notes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ModelError as exc:
        raise model_failed(exc) from exc


@dataclass
class SimilarPreviewRequest:
    # L'esercizio di partenza
    question: Question
    # Tipo della traccia aperta e il suo identificativo, per scegliere gli esempi di stile
    # dall'archivio (esclusa la traccia stessa)
    kind: ExamKind | None = None
    exclude_track: str = ""
    notes: str = ""


@dataclass
class SimilarRequest(SimilarPreviewRequest):
    model: str = ""
    # Input dei test comuni dell'esame, su cui si provano le proposte
    test_inputs: list[str] = field(default_factory=list)


def _examples(request: Request, body: SimilarPreviewRequest) -> list[StyleExample]:
    return style_examples(request.app.state.archive, body.kind, body.exclude_track)


@router.post("/similar/preview")
def similar_preview(body: SimilarPreviewRequest, request: Request) -> RequestPreview:
    """La richiesta di esercizi simili che verrà inviata al modello, da mostrare al docente."""
    try:
        return preview_of(similar_request(body.question, _examples(request, body), body.notes))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/similar")
def similar(
    body: SimilarRequest,
    request: Request,
    key: str | None = Header(default=None, alias=KEY_HEADER),
) -> SimilarExercises:
    """Esercizi simili proposti dal modello, controllati sugli input dei test comuni."""
    model = language_model(request, key, body.model)
    try:
        return similar_exercises(
            body.question,
            _examples(request, body),
            body.test_inputs,
            model,
            runner,
            body.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ModelError as exc:
        raise model_failed(exc) from exc
