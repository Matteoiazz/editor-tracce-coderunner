"""Accesso agli XML reali forniti dal docente (tests/fixtures/moodle)."""

from pathlib import Path

from tesi.adapters.moodle_xml import parse_quiz
from tesi.domain import Question

FIXTURES = Path(__file__).parent / "fixtures" / "moodle"
FIXTURE_FILES = sorted(FIXTURES.glob("*.xml"))


def load_questions(path: Path) -> list[Question]:
    return parse_quiz(path.read_bytes())


def all_real_questions() -> list[Question]:
    return [q for path in FIXTURE_FILES for q in load_questions(path)]
