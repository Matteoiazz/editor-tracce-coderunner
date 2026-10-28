import { describe, expect, it } from "vitest";
import { aiTextProblem, hasContent, hasText, joinList, plainText, unsupportedElements } from "./richtext";

describe("plainText", () => {
  it("toglie i tag e decodifica i caratteri speciali", () => {
    expect(plainText("<p>Se <strong>lst</strong> &lt; 3&nbsp;e</p><p>altro &amp; fine</p>")).toBe(
      "Se lst < 3 e altro & fine",
    );
  });

  it("decodifica le lettere accentate e le entità numeriche, una volta sola", () => {
    expect(plainText("<p>perch&eacute; &egrave; cos&igrave; &#8211; &#x2192; &amp;lt;</p>")).toBe(
      "perché è così – → &lt;",
    );
    expect(plainText("&sconosciuta; &#99999999;")).toBe("&sconosciuta; &#99999999;");
  });
});

describe("testo con un contenuto", () => {
  const image = '<p><img src="@@PLUGINFILE@@/testo.png"></p>';

  it("un testo fatto solo di un'immagine non è vuoto, ma il modello non può leggerlo", () => {
    expect(hasText(image)).toBe(false);
    expect(hasContent(image)).toBe(true);
    expect(hasContent("<p>&nbsp;</p><p> </p>")).toBe(false);
    expect(aiTextProblem(image, "Scrivi prima il testo.")).toContain("non vede le immagini");
    expect(aiTextProblem("<p></p>", "Scrivi prima il testo.")).toBe("Scrivi prima il testo.");
    expect(aiTextProblem("<p>Somma</p>", "Scrivi prima il testo.")).toBeNull();
  });
});

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
