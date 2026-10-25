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

/** Il seed successivo al più alto già usato (prima riga dell'input), 0 se non ce ne sono. */
export function nextSeed(rows: TestCase[]): number {
  const seeds = rows
    .map((row) => Number.parseInt(row.stdin.split("\n")[0], 10))
    .filter((seed) => Number.isFinite(seed));
  return seeds.length ? Math.max(...seeds) + 1 : 0;
}

/** Input iniziale di un nuovo test, già completo: il seed successivo al più alto già
 *  usato e una dimensione predefinita, uno per riga. */
export function nextSeedInput(rows: TestCase[]): string {
  return `${nextSeed(rows)}\n${DEFAULT_TEST_SIZE}`;
}

// ---------------------------------------------------------------- generatore di test comuni

/** Parametri del generatore: dimensioni da `start` a `end` a passi di `step`; `count` test
 *  per ogni dimensione ("perStep") oppure in tutto, distribuiti sull'intervallo ("total"). */
export interface GeneratorParams {
  start: number;
  end: number;
  step: number;
  count: number;
  mode: "perStep" | "total";
  visibility: "visible" | "hidden" | "random";
}

/** Oltre questo numero di test si tratta quasi certamente di un errore di battitura. */
export const MAX_GENERATED_TESTS = 200;

/** Dimensioni del range: start, start + step, … fino a end compreso (se ci si arriva). */
export function generatorSizes({ start, end, step }: GeneratorParams): number[] {
  const sizes: number[] = [];
  for (let size = start; size <= end; size += step) sizes.push(size);
  return sizes;
}

/** Quanti test verrebbero creati con questi parametri. */
export function generatedCount(params: GeneratorParams): number {
  return params.mode === "perStep" ? generatorSizes(params).length * params.count : params.count;
}

export type GeneratorErrors = Partial<Record<"start" | "end" | "step" | "count", string>>;

/** Problemi dei parametri, per campo; nessuna voce se si può generare. */
export function generatorErrors(params: GeneratorParams): GeneratorErrors {
  const errors: GeneratorErrors = {};
  const whole = (n: number) => Number.isInteger(n);
  if (!whole(params.start) || params.start < 0) errors.start = "Un numero intero da 0 in su";
  if (!whole(params.end) || params.end < 0) errors.end = "Un numero intero da 0 in su";
  else if (!errors.start && params.end < params.start) errors.end = "Deve essere almeno uguale a «da»";
  if (!whole(params.step) || params.step < 1) errors.step = "Un numero intero da 1 in su";
  if (!whole(params.count) || params.count < 1) errors.count = "Un numero intero da 1 in su";
  if (Object.keys(errors).length === 0) {
    const total = generatedCount(params);
    if (total > MAX_GENERATED_TESTS) {
      errors.count = `Verrebbero creati ${total} test: il massimo è ${MAX_GENERATED_TESTS}`;
    }
  }
  return errors;
}

/** Dimensioni dei test generati, in ordine. "In totale": `count` valori presi a distanza
 *  uniforme tra quelli del range (primo e ultimo compresi), ripetuti se sono più dei passi. */
export function generatedSizes(params: GeneratorParams): number[] {
  const sizes = generatorSizes(params);
  if (params.mode === "perStep") return sizes.flatMap((size) => Array(params.count).fill(size));
  if (params.count === 1) return [sizes[0]];
  return Array.from(
    { length: params.count },
    (_, i) => sizes[Math.round((i * (sizes.length - 1)) / (params.count - 1))],
  );
}

/** Test comuni generati: input "seed / dimensione" come i test standard, seed consecutivi
 *  da `firstSeed`, visibilità scelta (casuale: visibile o nascosto con uguale probabilità). */
export function generateCommonTests(
  params: GeneratorParams,
  firstSeed: number,
  random: () => number = Math.random,
): TestRow[] {
  return generatedSizes(params).map((size, i) => ({
    ...newRow(`${firstSeed + i}\n${size}`),
    display:
      params.visibility === "hidden" ||
      (params.visibility === "random" && random() < 0.5)
        ? HIDDEN
        : VISIBLE,
  }));
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

/** Lista completa dei test di un esercizio, nell'ordine di Moodle: comuni (tranne quelli
 *  esclusi da questo esercizio, per identificativo), poi specifici. */
export function composeTests(
  common: TestRow[],
  useCommon: boolean,
  commonExpected: Record<string, string>,
  specific: TestRow[],
  excluded: string[] = [],
): TestRow[] {
  const commonRows = useCommon
    ? common
        .filter((row) => !excluded.includes(row.id))
        .map((row) => ({ ...row, expected: commonExpected[row.id] ?? "" }))
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
