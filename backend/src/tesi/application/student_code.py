"""Generazione del codice che vedono gli studenti a partire dalla soluzione del docente.

Regola ricavata dagli esercizi reali del docente:
- il blocco ``if __name__ == "__main__":`` resta identico;
- le funzioni usate dal main (chiamate, o passate ad altre funzioni come in
  ``map(calcola, lst)``) restano, ma svuotate, anche se sono ``async def``;
- le classi usate dal main restano con i metodi svuotati;
- le funzioni e le classi di supporto (non usate dal main) spariscono;
- le altre istruzioni al primo livello (es. import) restano.

Il codice viene analizzato con il modulo ``ast``, che ne conosce la struttura,
invece di cercare pezzi di testo.
"""

import ast
import builtins
import difflib

STUB_LINES = ("# Inserisci qui la tua implementazione", "return None")
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


class StudentCodeError(ValueError):
    """La soluzione non si può analizzare (es. errore di sintassi)."""


def generate_student_code(solution: str) -> str:
    try:
        tree = ast.parse(solution)
    except SyntaxError as exc:
        raise StudentCodeError(
            f"La soluzione contiene un errore di sintassi alla riga {exc.lineno}"
        ) from exc

    main = next((node for node in tree.body if is_main_block(node)), None)
    functions = {n.name for n in tree.body if isinstance(n, FUNCTIONS)}
    classes = {n.name for n in tree.body if isinstance(n, ast.ClassDef)}
    # Senza main non si sa quale funzione tocca allo studente: si svuotano tutte.
    to_stub = (_used_names(main) if main else functions | classes) & (functions | classes)
    if main and functions and not to_stub:
        # Lo studente non avrebbe nessuna funzione da completare: di solito un nome sbagliato
        raise StudentCodeError(_nothing_to_complete(tree, main, functions))

    parts = []
    for node in tree.body:
        if isinstance(node, FUNCTIONS):
            if node.name in to_stub:
                parts.append(_stub(node))
        elif isinstance(node, ast.ClassDef):
            if node.name in to_stub:
                parts.append(_stub_class(node, solution))
        else:
            parts.append(ast.get_source_segment(solution, node) + "\n")
    return "\n".join(parts)


def is_main_block(node: ast.stmt) -> bool:
    """Riconosce ``if __name__ == "__main__":`` (anche con gli operandi invertiti)."""
    if not isinstance(node, ast.If) or not isinstance(node.test, ast.Compare):
        return False
    operands = [node.test.left, *node.test.comparators]
    names = {o.id for o in operands if isinstance(o, ast.Name)}
    values = {o.value for o in operands if isinstance(o, ast.Constant)}
    return names == {"__name__"} and values == {"__main__"}


def _used_names(node: ast.AST) -> set[str]:
    """Nomi letti nel blocco: comprende le funzioni chiamate e quelle passate come valore."""
    return {n.id for n in ast.walk(node) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}


def _called_names(node: ast.AST) -> set[str]:
    return {
        call.func.id
        for call in ast.walk(node)
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Name)
    }


def _bound_names(tree: ast.Module) -> set[str]:
    """Nomi definiti nel programma: import, assegnamenti, classi, parametri dei cicli."""
    bound: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            bound.update((alias.asname or alias.name).split(".")[0] for alias in node.names)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            bound.add(node.id)
        elif isinstance(node, ast.ClassDef):
            bound.add(node.name)
    return bound


def _nothing_to_complete(tree: ast.Module, main: ast.If, functions: set[str]) -> str:
    """Spiega perché il main non usa nessuna funzione della soluzione, indicando se possibile
    la funzione chiamata con un nome che non esiste e quella che probabilmente si intendeva."""
    known = functions | _bound_names(tree) | set(dir(builtins))
    unknown = sorted(_called_names(main) - known)
    defined = ", ".join(sorted(functions))
    if not unknown:
        return (
            f"Il main non usa nessuna funzione della soluzione ({defined}): "
            "lo studente non avrebbe nulla da completare"
        )
    name = unknown[0]
    similar = difflib.get_close_matches(name, functions, n=1)
    hint = f" (forse {similar[0]}?)" if similar else f"; le funzioni definite sono: {defined}"
    return f"Il main chiama {name}, che nella soluzione non esiste: controlla il nome{hint}"


def _stub(function: ast.FunctionDef | ast.AsyncFunctionDef, indent: str = "") -> str:
    """La funzione con la stessa intestazione e il corpo da completare."""
    keyword = "async def" if isinstance(function, ast.AsyncFunctionDef) else "def"
    returns = f" -> {ast.unparse(function.returns)}" if function.returns else ""
    body = "".join(f"{indent}    {line}\n" for line in STUB_LINES)
    return f"{indent}{keyword} {function.name}({ast.unparse(function.args)}){returns}:\n{body}"


def _stub_class(node: ast.ClassDef, solution: str) -> str:
    """La classe con i metodi svuotati; attributi e altre istruzioni del corpo restano. I
    decoratori restano: per i metodi cambiano il modo di chiamarli (es. @staticmethod)."""
    decorators = "".join(f"@{ast.unparse(d)}\n" for d in node.decorator_list)
    bases = [ast.unparse(b) for b in node.bases] + [ast.unparse(k) for k in node.keywords]
    header = f"class {node.name}({', '.join(bases)}):\n" if bases else f"class {node.name}:\n"
    body = []
    for item in node.body:
        if isinstance(item, FUNCTIONS):
            indent = " " * item.col_offset
            method_decorators = "".join(f"{indent}@{ast.unparse(d)}\n" for d in item.decorator_list)
            body.append(method_decorators + _stub(item, indent))
        else:
            # Il segmento parte dalla colonna dell'istruzione: il rientro si rimette davanti
            body.append(" " * item.col_offset + ast.get_source_segment(solution, item) + "\n")
    return decorators + header + "\n".join(body)
