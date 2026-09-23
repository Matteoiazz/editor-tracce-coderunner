import pytest

from samples import FIXTURES, load_questions
from tesi.domain import Question


@pytest.fixture
def pretest_question() -> Question:
    return load_questions(FIXTURES / "pretest_2026-07_es1.xml")[0]
