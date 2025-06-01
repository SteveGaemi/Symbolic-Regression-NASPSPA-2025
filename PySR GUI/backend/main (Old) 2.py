# backend/app.py
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from multiprocessing import Process, Value
from pysr import PySRRegressor
import pandas as pd
import numpy as np
import sympy as sp
from sympy.parsing.sympy_parser import (
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
    parse_expr,
)
import os
import json
import re
import ast
import logging
from typing import Any, Dict, List, Set
# import time
# import glob
# from watchdog.observers import Observer
# from watchdog.events import FileSystemEventHandler
# import threading

app = Flask(__name__)
CORS(app)

current_process = None
TEMP_DIR = os.path.abspath('./temp')
hof_file_path = os.path.join(TEMP_DIR, 'hall of fame', 'hall_of_fame.csv')
progress_file = os.path.abspath('progress.json')

# Flask route to run PySR
@app.route('/run_pysr', methods=['POST'])
def run_pysr():
    global current_process
    data = request.get_json()
    current_process = Process(target=run_pysr_task, args=(data,))
    current_process.start()
    return jsonify({'message': 'PySR started'})

# Background function for PySR
def run_pysr_task(data):
    try:
        # Update progress log text before PySR starts
        with open('progress.json', 'w') as f:
            json.dump({'status': 'running', 'message': 'PySR started...'}, f)

        # Extract data from JSON
        output_variable = data['output_variable']
        input_variables = data['input_variables']
        headers = data['headers']
        parameters = data['parameters']
        operators = data['operators']
        functions = data['functions']
        rows = data['rows']

        # Convert data rows into a pandas data frame
        df = pd.DataFrame(rows, columns = headers)

        # Define output variable and input variables
        X = df[input_variables]
        y = df[output_variable]

        # If last row is NaN, drop last row (occasionally happens)
        if X.iloc[-1].isnull().any() or pd.isnull(y.iloc[-1]):
            print("⚠️ Dropping last row due to NaN")
            X = X.iloc[:-1]
            y = y.iloc[:-1]

        os.makedirs('./temp', exist_ok=True)

        # Initialize PySR symbolic regression model 
        model = PySRRegressor(
            binary_operators=["+", "*"],
            unary_operators=[
                "cos",
                "sin"
            ],
            nested_constraints={"sin": {"sin": 0, "cos": 0},
                                "cos": {"sin": 0, "cos": 0},},
            maxsize = 50,
            niterations = 10000,
            # binary_operators=[op for op, enabled in operators.items() if enabled],
            # unary_operators=[fn for fn, meta in functions.items() if meta['selected']],
            output_directory = TEMP_DIR,
            run_id='hall of fame',
            # **parameters
            verbosity=0
        )

        # Fit models
        model.fit(X, y)

        # Update progress log text after PySR is done
        with open('progress.json', 'w') as f:
            json.dump({'status': 'done', 'message': 'PySR complete!'}, f)

    except Exception as e:
        with open('progress.json', 'w') as f:
            json.dump({'status': 'error', 'message': str(e)}, f)

# Flask route to update progress.json
@app.route('/progress', methods=['GET'])
def progress():
    try:
        with open(progress_file, 'r') as f:
            return jsonify(json.load(f))
    except FileNotFoundError:
        return jsonify({'status': 'not started'})
    
# Flask route to update model list
@app.route('/models_output', methods=['GET'])
def send_model_output():
    return send_file(hof_file_path, mimetype='text/csv')

TRANS = standard_transformations + (implicit_multiplication_application, convert_xor)

def safe_parse(text: str) -> sp.Basic | None:
    if pd.isna(text) or str(text).strip() == "":
        return None
    try:
        return parse_expr(str(text), transformations=TRANS, evaluate=True)
    except (sp.SympifyError, TypeError, SyntaxError):
        return None
    
def normalise(name: str) -> str:
    """Make header/symbol comparable: lower-case, no surrounding spaces."""
    return re.sub(r"\\W+", "_", name).strip().lower()
    
@ app.route('/evaluate', methods = ['POST'])
def evaluate():
    data     = request.get_json(force=True, silent=False)
    eq_str   = data['equation']
    rows     = data['rows']
    headers  = data['headers']

    canon_headers = [normalise(h) for h in headers]
    df = pd.DataFrame(rows, columns=canon_headers)
    # If last row is NaN, drop last row (occasionally happens)
    if df.iloc[-1].isnull().any():
        print("⚠️ Dropping last row due to NaN")
        df = df.iloc[:-1]
    expr = safe_parse(eq_str)

    # Sorted list of variable (column) names that the expression actually uses
    var_syms  = sorted(expr.free_symbols, key=lambda s: s.name)   # deterministic order
    var_names = [normalise(str(s)) for s in var_syms]

    try:
        if var_names:                                  # depends on data
            f     = sp.lambdify(var_syms, expr, modules="numpy")
            pred  = f(*(df[v].values for v in var_names))
            
        else:                                          # constant
            pred  = float(expr)
            
    except KeyError as e:                              # missing column
        return jsonify({"error": f"Missing column {e}"}), 400

    # ── Normalise to JSON-serialisable form ─────────────────────────────────
    if isinstance(pred, np.ndarray):
        pred_out = pred.tolist()                       # 1-D → list
    elif isinstance(pred, (np.floating, np.integer)):
        pred_out = pred.item()                         # NumPy scalar → Python scalar
    else:
        pred_out = pred                                # already a float

    with open("progress.json", "w") as f:
        json.dump({"status": "done", "message": "Equation evaluated."}, f)


    return jsonify({"prediction": pred_out})


# @app.route("/evaluate", methods=["POST"])
# def evaluate_route():
#     """HTTP endpoint:

#     POST JSON {
#         "equation": "…",
#         "row": { … },
#         "headers": ["col1", "col2", …]
#     }  ➔  { "result": … } or { "error": … }
#     """
#     data = request.get_json()
#     equation = data['equation']
#     headers = data['headers']
#     rows = data['rows']

#     try:
#         result = evaluate_equation(equation, rows, headers)
#         return jsonify({"result": result})
#     except (ValueError, SyntaxError, KeyError, TypeError) as err:
#         app.logger.warning("Bad equation %s: %s", equation, err)
#         return jsonify({"error": str(err)}), 400
    
# def sanitise_equation(equation: str, allowed_vars: Set[str]) -> str:
#     """Return a cleaned, *Python‑legal* version of *equation* or raise.

#     The caller provides *allowed_vars* (typically the CSV headers) so that the
#     backend is not hard‑wired to v1/v2/… but respects whatever column names the
#     frontend sends.
#     """
#     if not isinstance(equation, str):
#         raise ValueError("Equation must be a string.")

#     # 1. Normalise power symbol
#     cleaned = equation.replace("^", "**")

#     # 2. Character whitelist
#     if not _SAFE_CHARS_RE.match(cleaned):
#         raise ValueError("Equation contains illegal characters.")

#     # 3. AST identifier whitelist
#     try:
#         tree = ast.parse(cleaned, mode="eval")
#     except SyntaxError as err:
#         raise ValueError(f"Syntax error in equation: {err}") from err

#     for node in ast.walk(tree):
#         if isinstance(node, ast.Name):
#             token = node.id
#             if token not in ALLOWED_FUNCS and token not in allowed_vars:
#                 raise ValueError(f"Illegal token {token!r} in equation.")

#     return cleaned

# def str_to_float(val: Any) -> float:
#     """Convert *val* to float, treating blanks/None as NaN."""
#     try:
#         return float(val)
#     except (ValueError, TypeError):
#         if val in ("", None):
#             return float("nan")
#         raise ValueError(f"Cannot convert {val!r} to float.")


# def evaluate_equation(equation: str, row: Dict[str, Any], headers: List[str]) -> float:
#     """Safely evaluate *equation* on the data in *row*.

#     • *headers* is the list of column names coming from the frontend. These
#       become the only legal variable identifiers in the equation.
#     • *row* should map those header names to values.
#     """
#     allowed_vars: Set[str] = set(headers)
#     safe_eq = sanitise_equation(equation, allowed_vars)

#     # Prepare numeric values — only keep vars present in the row
#     numeric_row = {k: str_to_float(row.get(k, np.nan)) for k in allowed_vars}

#     # Build SymPy symbols
#     sym_vars = {name: sp.symbols(name) for name in allowed_vars}

#     # Combine allowed functions & symbols for sympify scope
#     local_scope = {**ALLOWED_FUNCS, **sym_vars}

#     try:
#         sym_expr = sp.sympify(safe_eq, locals=local_scope, convert_xor=True)
#     except (sp.SympifyError, SyntaxError) as err:
#         raise ValueError(f"Cannot parse equation: {err}") from err

#     func = sp.lambdify(tuple(sym_vars.values()), sym_expr, modules=["numpy"])

#     # Keep variable order consistent
#     values = [numeric_row[var] for var in sym_vars]

#     try:
#         result = func(*values)
#     except Exception as err:
#         raise ValueError(f"Error evaluating equation: {err}") from err

#     # Reduce NumPy scalars/arrays to plain Python floats where possible
#     if isinstance(result, np.ndarray):
#         result = result.item()

#     return float(result)
    
# Flask route to stop running PySR
@app.route('/stop', methods=['POST'])
def stop():
    global current_process
    if current_process is not None and current_process.is_alive():
        current_process.terminate()
        current_process.join()
        current_process = None
        with open('progress.json', 'w') as f:
            json.dump({'status': 'stopped', 'message': 'PySR was manually stopped.'}, f)
        return jsonify({'status': 'stopped'})
    return jsonify({'status': 'no process running'})

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)
