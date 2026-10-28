"""Testo semplice di un frammento HTML, per il modello linguistico e per la ricerca nell'archivio.

Un a capo per paragrafo e per voce di elenco (con "- " davanti), una riga per ogni riga di
tabella con le celle separate da " | ", le immagini indicate con [immagine]. Gli spazi di fila
diventano uno solo e restano al massimo una riga vuota tra due paragrafi.
"""

import re
from html.parser import HTMLParser
from typing import ClassVar

CELL_SEPARATOR = " | "
IMAGE = "[immagine]"


class _TextExtractor(HTMLParser):
    # Elementi che vanno a capo; dentro una cella di tabella diventano uno spazio
    BLOCKS: ClassVar[set[str]] = {
        "p",
        "div",
        "br",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "pre",
        "blockquote",
        "ul",
        "ol",
    }
    CELLS: ClassVar[set[str]] = {"td", "th"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        # Celle aperte attorno al punto letto: più di una se una tabella sta dentro una cella
        self._cells = 0
        # Per ogni tabella aperta, le celle aperte fuori da essa
        self._tables: list[int] = []
        self._row_start = False
        # Appena scritto "- " di una voce di elenco: il paragrafo che la apre (come nell'editor,
        # <li><p>…</p></li>) resta sulla stessa riga
        self._item_start = False

    def _outer(self) -> int:
        return self._tables[-1] if self._tables else 0

    def _break(self) -> None:
        self.parts.append(" " if self._cells else "\n")

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag == "table":
            self._break()
            self._tables.append(self._cells)
        elif tag == "tr":
            # Ogni riga riparte dalla profondità della sua tabella, anche se una cella non è
            # stata chiusa
            self._cells = self._outer()
            self._break()
            self._row_start = True
        elif tag in self.CELLS:
            if not self._row_start:
                self.parts.append(CELL_SEPARATOR)
            self._row_start = False
            self._cells = self._outer() + 1
        elif tag in self.BLOCKS and not (self._item_start and tag != "li"):
            self._break()
        if tag == "li":
            self.parts.append("- ")
            self._item_start = True
        elif tag == "img":
            self.parts.append(IMAGE)
            self._item_start = False

    def handle_endtag(self, tag: str) -> None:
        self._item_start = False
        if tag == "table":
            self._cells = self._tables.pop() if self._tables else 0
            self._break()
        elif tag in self.CELLS:
            self._cells = self._outer()
        elif tag in self.BLOCKS:
            self._break()

    def handle_data(self, data: str) -> None:
        self.parts.append(data)
        if data.strip():
            self._item_start = False


def plain_text(html: str) -> str:
    """Il testo del frammento HTML senza formattazione (vedi il commento del modulo)."""
    parser = _TextExtractor()
    parser.feed(html)
    parser.close()
    lines = [" ".join(line.split()) for line in "".join(parser.parts).splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
