import pytest

from tesi.domain import plain_text


def test_paragrafi_elenchi_immagini_e_spazi() -> None:
    html = (
        "<p>Primo&nbsp;paragrafo</p><ul><li>uno</li><li>due &amp; tre</li></ul>"
        "<p>Secondo <img src='x.png'> e   spazi</p><br>"
    )
    expected = "Primo paragrafo\n\n- uno\n\n- due & tre\n\nSecondo [immagine] e spazi"
    assert plain_text(html) == expected


def test_voci_di_elenco_dell_editor_su_una_riga() -> None:
    # L'editor del testo mette un paragrafo dentro ogni voce
    html = "<ul><li><p>uno</p></li><li><p><code>due</code> e tre</p></li></ul><p>Fine</p>"
    assert plain_text(html) == "- uno\n\n- due e tre\n\nFine"


@pytest.mark.parametrize(
    "html",
    [
        # Tabella scritta nell'editor del testo: ogni cella contiene un paragrafo
        (
            "<p>Esempio:</p><table><tbody><tr><td><p>1</p></td><td><p>2</p></td></tr>"
            "<tr><td><p>3</p></td><td><p>4</p></td></tr></tbody></table>"
        ),
        # Tabella importata da Moodle, senza paragrafi nelle celle
        "<p>Esempio:</p><table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>",
        # Celle non chiuse
        "<p>Esempio:</p><table><tr><td>1<td>2</tr><tr><td>3<td>4</tr></table>",
    ],
)
def test_tabella_una_riga_per_riga_con_le_celle_separate(html: str) -> None:
    assert plain_text(html) == "Esempio:\n\n1 | 2\n3 | 4"


def test_intestazioni_e_testo_dopo_la_tabella() -> None:
    html = (
        "<table><tr><th><p>i</p></th><th><p>valore</p></th></tr><tr><td>0</td><td>7</td></tr>"
        "</table><p>Restituire la somma.</p>"
    )
    assert plain_text(html) == "i | valore\n0 | 7\n\nRestituire la somma."


def test_tabella_dentro_una_cella_resta_sulla_riga() -> None:
    html = "<table><tr><td>a</td><td><table><tr><td>1</td><td>2</td></tr></table></td></tr></table>"
    assert plain_text(html) == "a | 1 | 2"
