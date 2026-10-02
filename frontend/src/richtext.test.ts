import { describe, expect, it } from "vitest";
import { joinList, unsupportedElements } from "./richtext";

describe("unsupportedElements", () => {
  it("non segnala testo, elenchi, codice e tabelle", () => {
    const html =
      "<p><strong>Testo</strong></p><ul><li>a</li></ul><pre><code>x</code></pre>" +
      "<table><tr><th>0</th><td>1</td></tr></table>";
    expect(unsupportedElements(html)).toEqual([]);
  });

  it("conta immagini e altri contenuti", () => {
    const html = '<p><img src="a.png"></p><p><IMG src="b.png"/></p><iframe src="x"></iframe>';
    expect(unsupportedElements(html)).toEqual(["2 immagini", "un contenuto incorporato"]);
  });

  it("ignora i tag scritti come testo", () => {
    expect(unsupportedElements("<p>usa il tag &lt;img&gt;</p>")).toEqual([]);
  });
});

describe("joinList", () => {
  it("unisce con virgole ed e", () => {
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b"])).toBe("a e b");
    expect(joinList(["a", "b", "c"])).toBe("a, b e c");
  });
});
