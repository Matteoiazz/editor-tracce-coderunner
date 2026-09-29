// Regole sui test case: test comuni all'esame, test specifici dell'esercizio,
// riconoscimento del blocco comune negli esercizi importati.

import type { TestCase, TestOutcome } from "./types";

/** Test con un identificativo interno dell'interfaccia (non esportato). */
export interface TestRow extends TestCase {
  id: string;
}

export const VISIBLE = "SHOW";
export const HIDDEN = "HIDE";

export function newRow(stdin = ""): TestRow {
  return {
    id: crypto.randomUUID(),
    stdin,
    expected: "",
    use_as_example: false,
    hide_rest_if_fail: false,
    mark: 1,
    display: VISIBLE,
    testcode: "",
    extra: "",
  };
}

export function toRow(test: TestCase): TestRow {
  return { ...test, id: crypto.randomUUID() };
}

export function toTestCase(row: TestRow): TestCase {
  const { id: _id, ...test } = row;
  return test;
}

// Blocco usato dal docente sia nell'esame sia nel pretest di luglio 2026:
// [seed, dimensione, esempio, nascondi i successivi se fallisce]
const STANDARD_TESTS: [number, number, boolean, boolean][] = [
  [0, 1, false, false],
  [1, 10, true, false],
  [2, 0, false, false],
  [3, 4, false, false],
  [4, 5, false, false],
  [5, 50, false, false],
  [6, 3, false, true],
  [7, 18, false, true],
  [8, 94, false, false],
];

export function standardCommonTests(): TestRow[] {
  return STANDARD_TESTS.map(([seed, size, example, hideRest]) => ({
    ...newRow(`${seed}\n${size}`),
    use_as_example: example,
    hide_rest_if_fail: hideRest,
  }));
}

/** Dimensione proposta per un nuovo test, da modificare secondo l'esercizio. */
export const DEFAULT_TEST_SIZE = 10;

/** Input iniziale di un nuovo test, già completo: il seed successivo al più alto già
 *  usato e una dimensione predefinita, uno per riga. */
export function nextSeedInput(rows: TestCase[]): string {
  const seeds = rows
    .map((row) => Number.parseInt(row.stdin.split("\n")[0], 10))
    .filter((seed) => Number.isFinite(seed));
  return `${seeds.length ? Math.max(...seeds) + 1 : 0}\n${DEFAULT_TEST_SIZE}`;
}

/** Quante volte la soluzione chiama input(), escludendo i commenti: è il numero minimo di
 *  righe che l'input di un test deve avere (con input() dentro un ciclo può servirne di più). */
export function requiredInputLines(solution: string): number {
  const code = solution
    .split("\n")
    .map((line) => line.replace(/#.*$/, ""))
    .join("\n");
  return (code.match(/\binput\s*\(/g) ?? []).length;
}

/** Numero di righe dell'input di un test (l'ultimo a capo non conta come riga in più). */
export function inputLineCount(stdin: string): number {
  return stdin === "" ? 0 : stdin.replace(/\n$/, "").split("\n").length;
}

/** Messaggio per i test con meno righe di input di quelle che la soluzione legge, oppure null. */
export function missingInputMessage(numbers: number[], required: number): string | null {
  if (numbers.length === 0) return null;
  const which = numbers.length === 1 ? `Test ${numbers[0]}` : `Test ${numbers.join(", ")}`;
  return (
    `${which}: mancano valori di input. La soluzione ne legge ${required} con input(), ` +
    "uno per riga (es. seed e dimensione su due righe)."
  );
}

/** Stesso input e stesse opzioni. L'output atteso non si confronta: dipende dalla soluzione. */
export function sameTest(a: TestCase, b: TestCase): boolean {
  return (
    a.stdin === b.stdin &&
    a.use_as_example === b.use_as_example &&
    a.hide_rest_if_fail === b.hide_rest_if_fail &&
    a.display === b.display &&
    a.mark === b.mark &&
    a.testcode === b.testcode &&
    a.extra === b.extra
  );
}

export function startsWithBlock(tests: TestCase[], block: TestCase[]): boolean {
  return block.length > 0 && block.every((b, i) => i < tests.length && sameTest(tests[i], b));
}

function sharedPrefixLength(a: TestCase[], b: TestCase[]): number {
  let n = 0;
  while (n < a.length && n < b.length && sameTest(a[n], b[n])) n++;
  return n;
}

export interface CommonBlock {
  block: TestCase[];
  /** Indici delle liste che iniziano con il blocco. */
  members: number[];
}

/** Cerca il blocco iniziale più lungo condiviso da almeno due liste di test.
 *  Sotto `minLength` test la somiglianza è considerata casuale. */
export function detectCommonBlock(lists: TestCase[][], minLength = 3): CommonBlock | null {
  let best: TestCase[] = [];
  for (let i = 0; i < lists.length; i++) {
    for (let j = i + 1; j < lists.length; j++) {
      const length = sharedPrefixLength(lists[i], lists[j]);
      if (length > best.length) best = lists[i].slice(0, length);
    }
  }
  if (best.length < minLength) return null;
  const members = lists.flatMap((tests, i) => (startsWithBlock(tests, best) ? [i] : []));
  return { block: best, members };
}

/** Lista completa dei test di un esercizio, nell'ordine di Moodle: comuni, poi specifici. */
export function composeTests(
  common: TestRow[],
  useCommon: boolean,
  commonExpected: Record<string, string>,
  specific: TestRow[],
): TestRow[] {
  const commonRows = useCommon
    ? common.map((row) => ({ ...row, expected: commonExpected[row.id] ?? "" }))
    : [];
  return [...commonRows, ...specific];
}

/** Associa ai test, per identificativo, i valori restituiti dal backend nello stesso ordine. */
export function byId<T>(rows: TestRow[], values: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((row, i) => [row.id, values[i]]));
}

export function outcomesById(rows: TestRow[], outcomes: TestOutcome[]): Record<string, TestOutcome> {
  const byIndex = new Map(outcomes.map((o) => [o.index, o]));
  return Object.fromEntries(
    rows.flatMap((row, i) => {
      const outcome = byIndex.get(i);
      return outcome ? [[row.id, outcome]] : [];
    }),
  );
}
