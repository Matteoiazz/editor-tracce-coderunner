"""Generazione del codice che vedono gli studenti a partire dalla soluzione del docente.

Regola ricavata dagli esercizi reali del docente:
- il blocco ``if __name__ == "__main__":`` resta identico;
- le funzioni chiamate dal main restano, ma svuotate;
- le funzioni di supporto (non chiamate dal main) spariscono;
- le altre istruzioni al primo livello (es. import) restano.

Il codice viene analizzato con il modulo ``ast``, che ne conosce la struttura,
invece di cercare pezzi di testo.
"""

import ast

STUB_BODY = "    # Inserisci qui la tua implementazione\n    return None\n"


class StudentCodeError(ValueError):
    """La soluzione non si può analizzare (es. errore di sintassi)."""


def generate_student_code(solution: str) -> str:
    try:
        tree = ast.parse(solution)
    except SyntaxError as exc:
        raise StudentCodeError(
            f"La soluzione contiene un errore di sintassi alla riga {exc.lineno}"
        ) from exc

    main = next((node for node in tree.body if _is_main_block(node)), None)
    functions = {n.name for n in tree.body if isinstance(n, ast.FunctionDef)}
    # Senza main non si sa quale funzione tocca allo studente: si svuotano tutte.
    to_stub = _called_names(main) & functions if main else functions

    parts = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            if node.name in to_stub:
                parts.append(_stub(node))
        else:
            parts.append(ast.get_source_segment(solution, node) + "\n")
    return "\n".join(parts)


def _is_main_block(node: ast.stmt) -> bool:
    """Riconosce ``if __name__ == "__main__":`` (anche con gli operandi invertiti)."""
    if not isinstance(node, ast.If) or not isinstance(node.test, ast.Compare):
        return False
    operands = [node.test.left, *node.test.comparators]
    names = {o.id for o in operands if isinstance(o, ast.Name)}
    values = {o.value for o in operands if isinstance(o, ast.Constant)}
    return names == {"__name__"} and values == {"__main__"}


def _called_names(node: ast.AST) -> set[str]:
    return {
        call.func.id
        for call in ast.walk(node)
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Name)
    }


def _stub(function: ast.FunctionDef) -> str:
    returns = f" -> {ast.unparse(function.returns)}" if function.returns else ""
    return f"def {function.name}({ast.unparse(function.args)}){returns}:\n{STUB_BODY}"
