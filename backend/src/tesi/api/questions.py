"""Endpoint sugli esercizi: import/export XML Moodle e verifica della soluzione."""

from dataclasses import dataclass

from fastapi import APIRouter, HTTPException, Response, UploadFile

from tesi.adapters.local_runner import LocalPythonRunner
from tesi.adapters.moodle_xml import MoodleXmlError, parse_quiz, to_quiz_xml
from tesi.application.student_code import StudentCodeError, generate_student_code
from tesi.application.verification import (
    SolutionFailed,
    TestOutcome,
    fill_expected_outputs,
    verify_solution,
)
from tesi.domain import Question

router = APIRouter(prefix="/api/questions", tags=["esercizi"])

# Esecutore del codice usato dagli endpoint: Python locale. Per un ambiente isolato
# (es. un container) basta sostituirlo qui con un'altra implementazione di CodeRunner.
runner = LocalPythonRunner()


@router.post("/import")
async def import_xml(file: UploadFile) -> list[Question]:
    """Legge un file XML esportato da Moodle."""
    try:
        return parse_quiz(await file.read())
    except MoodleXmlError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/export")
def export_xml(questions: list[Question]) -> Response:
    """Produce l'XML da importare nella banca delle domande di Moodle."""
    return Response(
        content=to_quiz_xml(questions),
        media_type="application/xml",
        headers={"Content-Disposition": 'attachment; filename="esercizi.xml"'},
    )


@router.post("/verify")
def verify(question: Question) -> list[TestOutcome]:
    """Esegue la soluzione del docente su ogni test e dice quali passano."""
    return verify_solution(question, runner)


@router.post("/fill-expected")
def fill_expected(question: Question) -> Question:
    """Calcola gli output attesi dei test eseguendo la soluzione del docente."""
    try:
        return fill_expected_outputs(question, runner)
    except SolutionFailed as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@dataclass
class StudentCodeRequest:
    solution: str


@dataclass
class StudentCodeResponse:
    student_code: str


@router.post("/student-code")
def student_code(request: StudentCodeRequest) -> StudentCodeResponse:
    """Genera il codice per gli studenti: stesso main, funzione richiesta svuotata."""
    try:
        return StudentCodeResponse(generate_student_code(request.solution))
    except StudentCodeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
