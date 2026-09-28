// Input dei test dei quattro esercizi reali del docente (backend/tests/fixtures/moodle),
// usati dai test automatici. Notazione: "seed/dimensione", "*" = esempio,
// "h" = nasconde i successivi se fallisce.

import type { TestCase } from "./types";

export const REAL_INPUTS = {
  esame_es1:
    "0/1 1/10* 2/0 3/4 4/5 5/50 6/3h 7/18h 8/94 76/28h 130/150h 134/120h 146/146h 200/200h 300/-15 300/-17",
  esame_es3: "0/12 1/13 2/14 3/15* 4/17 5/20h 6/12h 7/18h 8/15 9/18h 10/17h 11/12h 12/15h 13/22h",
  esame_es4: "0/1 1/6 2/8 3/10 4/15 5/16 77/3h 88/18h 100/15h 102/18h 111/21h 222/12h 232/32h 278/22h 50/10h",
  pretest_es1:
    "0/1 1/10* 2/0 3/4 4/5 5/50 6/3h 7/18h 8/94 15/28h 16/150 18/120 21/112h 28/110h 30/4 35/8",
};

/** Converte la notazione compatta in test case; l'output atteso è un segnaposto riconoscibile. */
export function parseInputs(notation: string, outputPrefix = "out"): TestCase[] {
  return notation.split(" ").map((token, i) => {
    const [seed, size] = token.replace(/[*h]/g, "").split("/");
    return {
      stdin: `${seed}\n${size}`,
      expected: `${outputPrefix}-${i}`,
      use_as_example: token.includes("*"),
      hide_rest_if_fail: token.includes("h"),
      mark: 1,
      display: "SHOW",
      testcode: "",
      extra: "",
    };
  });
}
