"""Traccia d'esame: insieme degli esercizi di uno stesso appello e numero di traccia.

È l'unità salvata nell'archivio. Come il resto del dominio non sa nulla di
database o HTTP.
"""

from dataclasses import dataclass, field
from datetime import date, datetime

from tesi.domain.question import ExamKind, Question, TestCase


@dataclass
class TrackExercise:
    """Esercizio della traccia con i dati che servono per riprenderlo in mano."""

    question: Question  # in question.testcases ci sono solo i test specifici
    number: int | None = None
    # Se l'esercizio usa i test comuni della traccia
    use_common: bool = True
    # Output attesi dei test comuni per questo esercizio, nello stesso ordine dei test comuni
    common_expected: list[str] = field(default_factory=list)


@dataclass
class ExamTrack:
    id: str
    kind: ExamKind | None = None
    day: date | None = None
    number: int | None = None  # numero della traccia
    # Test comuni: solo input e opzioni, gli output dipendono dalla soluzione di ogni esercizio
    common_tests: list[TestCase] = field(default_factory=list)
    exercises: list[TrackExercise] = field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    exported_at: datetime | None = None
    # Valorizzato quando la traccia è nel cestino
    deleted_at: datetime | None = None


@dataclass
class TrackSummary:
    """Riga dell'elenco dell'archivio, senza il contenuto degli esercizi."""

    id: str
    kind: ExamKind | None
    day: date | None
    number: int | None
    exercise_count: int
    updated_at: datetime
    exported_at: datetime | None
    deleted_at: datetime | None


@dataclass
class ExerciseMatch:
    """Esercizio trovato nell'archivio, con la traccia da cui proviene."""

    track_id: str
    position: int  # posizione dell'esercizio nella traccia
    track_kind: ExamKind | None
    track_day: date | None
    track_number: int | None
    number: int | None
    name: str
    tags: list[str]
    text: str  # testo della traccia senza formattazione
