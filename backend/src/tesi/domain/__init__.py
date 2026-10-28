"""Dominio: i concetti del problema, in Python puro (nessuna dipendenza esterna)."""

from tesi.domain.question import EmbeddedFile, ExamKind, Question, TestCase, question_name
from tesi.domain.text import plain_text
from tesi.domain.track import ExamTrack, ExerciseMatch, TrackExercise, TrackSummary

__all__ = [
    "EmbeddedFile",
    "ExamKind",
    "ExamTrack",
    "ExerciseMatch",
    "Question",
    "TestCase",
    "TrackExercise",
    "TrackSummary",
    "plain_text",
    "question_name",
]
