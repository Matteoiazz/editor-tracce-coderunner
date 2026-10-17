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

/** File incorporato nel testo (es. un'immagine), richiamato con @@PLUGINFILE@@/nome. */
export interface EmbeddedFile {
  name: string;
  path: string;
  encoding: string;
  content: string;
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
  /** File richiamati dal testo, riscritti così come sono nell'XML esportato. */
  text_files: EmbeddedFile[];
  settings: Record<string, string>;
}

/** Esito di un test dopo l'esecuzione della soluzione (tesi.application.verification). */
export interface TestOutcome {
  index: number;
  passed: boolean;
  expected: string;
  got: string;
  error: string;
}
