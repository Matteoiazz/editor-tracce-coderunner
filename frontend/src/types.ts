// Stessa forma del JSON prodotto dal backend (tesi.domain.question).

export interface TestCase {
  stdin: string;
  expected: string;
  use_as_example: boolean;
  hide_rest_if_fail: boolean;
  mark: number;
  display: string;
  testcode: string;
  extra: string;
}

export interface Question {
  name: string;
  text_html: string;
  /** Codice completo del docente, nascosto agli studenti. */
  solution: string;
  /** Codice che vedono gli studenti: funzione da completare + main. */
  student_code: string;
  testcases: TestCase[];
  coderunner_type: string;
  default_grade: number;
  general_feedback_html: string;
  tags: string[];
  settings: Record<string, string>;
}
