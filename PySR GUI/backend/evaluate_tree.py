
"""
evaluation_tree.py

Utility to evaluate a mathematical expression by (1) parsing it into an
expression-tree and (2) walking that tree, almost the same way the original
`evaluate()` in *evaluation2.py* does.

The module is fully self-contained except for the optional import
of `safe_divide` from *accessory.py* (a 1-line fallback is provided).

Example
-------
>>> from evaluation_tree import evaluate_expression
>>> evaluate_expression("sqrt(x) + y/2", {"x": 9, "y": 4})
5.0
"""
from __future__ import annotations
import re
import math
import numpy as np

# Safe division
def safe_divide(up, down, epsilon=1e-10):

    down_clipped = np.where(np.abs(down) < epsilon, epsilon, down)
    return up / down_clipped

# ------------------------------------------------------------
#  Node class – no subclasses, like in expression2.py
# ------------------------------------------------------------
class Node:
    __slots__ = ("value", "left", "right")

    def __init__(self, value, left: "Node|None" = None, right: "Node|None" = None):
        self.value = value
        self.left = left
        self.right = right

    # Technical representation (unique) – used for hashing / debugging
    def __repr__(self) -> str:                       # noqa: D401
        if self.left is None and self.right is None:
            return f"Node({self.value!r})"
        return f"Node({self.value!r}, {self.left!r}, {self.right!r})"

    # Human‑friendly infix string
    def __str__(self) -> str:                        # noqa: D401
        if self.left is None and self.right is None:
            return str(self.value)
        if self.right is None:                       # unary func
            return f"{self.value}({self.left})"
        return f"({self.left} {self.value} {self.right})"


# ------------------------------------------------------------
#  1.  Tokenisation
# ------------------------------------------------------------
_token_pat = re.compile(
    r"""(?x)                 # verbose
    (\d+\.\d+|\d+\.|\.\d+|\d+)  # numbers  3.14  3.   .14  3
  | ([A-Za-z_][A-Za-z0-9_]*)    # names    x var_1 sin
  | ([()+\-*/])                 # operators and parentheses
    """
)


def _tokenise(expr: str) -> list[str]:
    tokens = [m.group(0) for m in _token_pat.finditer(expr.replace(" ", ""))]
    if "".join(tokens) != expr.replace(" ", ""):
        raise ValueError(f"Invalid token in expression: {expr!r}")
    return tokens


# ------------------------------------------------------------
#  2.  Shunting‑yard → postfix
# ------------------------------------------------------------
# precedence (higher number = binds tighter)
_PRECEDENCE = {"+": 2, "-": 2, "*": 3, "/": 3}
# functions have precedence 4 but handled separately

_FUNCTIONS = {"sqrt", "sin", "cos"}


def _infix_to_postfix(tokens: list[str]) -> list[str]:
    output: list[str] = []
    stack: list[str] = []

    def is_function(tok: str) -> bool:
        return tok in _FUNCTIONS

    for tok in tokens:
        if tok.isidentifier() and not is_function(tok):          # variable
            output.append(tok)
        elif re.match(r"\d|\.\d", tok):                      # number
            output.append(tok)
        elif is_function(tok):
            stack.append(tok)
        elif tok == "(":
            stack.append(tok)
        elif tok == ")":
            # pop until "(" or function
            while stack and stack[-1] != "(":
                output.append(stack.pop())
            if not stack:
                raise ValueError("Mismatched parentheses")
            stack.pop()  # discard "("
            # if function directly before ( f(…) ) → pop it
            if stack and is_function(stack[-1]):
                output.append(stack.pop())
        else:   # operator
            while (stack and stack[-1] not in ("(") and
                   (stack[-1] in _FUNCTIONS or
                    _PRECEDENCE.get(stack[-1], 0) >= _PRECEDENCE.get(tok, 0))):
                output.append(stack.pop())
            stack.append(tok)

    # drain
    while stack:
        if stack[-1] in ("(", ")"):
            raise ValueError("Mismatched parentheses")
        output.append(stack.pop())
    return output


# ------------------------------------------------------------
#  3.  Postfix → expression tree
# ------------------------------------------------------------

def _postfix_to_tree(postfix: list[str]) -> Node:
    stack: list[Node] = []
    for tok in postfix:
        if tok in _FUNCTIONS:
            if not stack:
                raise ValueError("Function without operand")
            operand = stack.pop()
            stack.append(Node(tok, left=operand))
        elif tok in _PRECEDENCE:
            if len(stack) < 2:
                raise ValueError("Operator without two operands")
            right = stack.pop()
            left = stack.pop()
            stack.append(Node(tok, left, right))
        else:  # number or variable
            try:
                value = float(tok)
            except ValueError:
                value = tok          # keep as variable name
            stack.append(Node(value))
    if len(stack) != 1:
        raise ValueError("Invalid expression")
    return stack[0]


def parse_expression(expr: str) -> Node:
    """Convert *expr* (string) to an expression tree *Node*."""
    tokens = _tokenise(expr)
    postfix = _infix_to_postfix(tokens)
    return _postfix_to_tree(postfix)


# ------------------------------------------------------------
#  4.  Evaluate – stack‑based (mirrors evaluation2.evaluate)
# ------------------------------------------------------------

def evaluate_tree(root: Node, variables: dict[str, float]) -> float:
    stack = [root]
    cache: dict[Node, float] = {}
    vars_np = {k: np.asarray(v, dtype=float) for k, v in variables.items()}

    while stack:
        node = stack.pop()

        if node in cache:
            continue

        # leaf: constant
        if isinstance(node.value, (int, float)):
            cache[node] = node.value
            continue

        # leaf: variable
        if isinstance(node.value, str) and node.value not in _PRECEDENCE and node.value not in _FUNCTIONS:
            if node.value not in vars_np:
                raise KeyError(f"Variable {node.value!r} not provided")
            cache[node] = vars_np[node.value]
            continue

        # unary function
        if node.value in _FUNCTIONS:
            if node.left in cache:
                x = cache[node.left]
                if node.value == "sqrt":
                    cache[node] = np.sqrt(np.maximum(x, 0))
                elif node.value == "sin":
                    cache[node] = np.sin(x)
                elif node.value == "cos":
                    cache[node] = np.cos(x)
            else:
                stack.append(node)
                stack.append(node.left)
            continue

        # binary operator
        if node.value in _PRECEDENCE:
            if node.left in cache and node.right in cache:
                a = cache[node.left]
                b = cache[node.right]
                if node.value == "+":
                    cache[node] = a + b
                elif node.value == "-":
                    cache[node] = a - b
                elif node.value == "*":
                    cache[node] = a * b
                elif node.value == "/":
                    cache[node] = safe_divide(a, b)
            else:
                stack.append(node)
                if node.right:
                    stack.append(node.right)
                if node.left:
                    stack.append(node.left)
            continue

        raise ValueError(f"Unknown node {node.value!r}")

    res = cache[root]

    # Keep vectorised output intact; unwrap single scalars only.
    if isinstance(res, np.ndarray):
        return res
    return float(res)


def evaluate_expression(expr: str, variables: dict[str, float]) -> float:
    """High‑level helper: *parse* then *evaluate* the expression."""
    tree = parse_expression(expr)
    return evaluate_tree(tree, variables)


# ------------------------------------------------------------
#  5.  Quick CLI for ad‑hoc testing
# ------------------------------------------------------------
if __name__ == "__main__":                        # pragma: no cover
    import argparse, json
    p = argparse.ArgumentParser(description="Evaluate a math expression via tree.")
    p.add_argument("expr", help="Expression, e.g. 'sqrt(x)+y/2'")
    p.add_argument("--vars", default="{}", help="JSON dict of variables, e.g. '{\"x\":9,\"y\":4}'")
    ns = p.parse_args()
    vars_dict = json.loads(ns.vars)
    result = evaluate_expression(ns.expr, vars_dict)
    print(result)

