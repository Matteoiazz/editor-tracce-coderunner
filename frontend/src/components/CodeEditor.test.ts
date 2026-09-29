import { describe, expect, it } from "vitest";
import { editorHeight } from "./CodeEditor";

describe("editorHeight", () => {
  it("segue il contenuto entro i limiti minimo e massimo", () => {
    expect(editorHeight(50)).toBe(160);
    expect(editorHeight(300.2)).toBe(301);
    expect(editorHeight(5000)).toBe(560);
  });
});
