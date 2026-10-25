import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";

// I file del processo principale non passano dal controllo dei tipi e main.cjs si può
// eseguire solo dentro Electron: qui si compilano tutti, senza eseguirli, per trovare
// errori come una variabile dichiarata due volte, che impedirebbero l'avvio dell'app.
const dir = fileURLToPath(new URL(".", import.meta.url));
const modules = readdirSync(dir).filter((name) => name.endsWith(".cjs"));

describe("file del processo principale", () => {
  it.each(modules)("%s si compila", (name) => {
    const source = readFileSync(join(dir, name), "utf-8");
    // Stesso involucro con cui Node carica un modulo CommonJS
    const wrapped = `(function (exports, require, module, __filename, __dirname) {${source}\n})`;
    expect(() => new Script(wrapped, { filename: name })).not.toThrow();
  });

  it("comprendono main.cjs e preload.cjs", () => {
    expect(modules).toEqual(expect.arrayContaining(["main.cjs", "preload.cjs"]));
  });
});
