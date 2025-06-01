# backend/app.py
from flask import Flask, request, jsonify, send_file, current_app
from flask_cors import CORS
from multiprocessing import Process
from pysr import PySRRegressor
from sklearn.metrics import r2_score, mean_squared_error
import pandas as pd
import numpy as np
from math import isnan
import os
import json
import shutil

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
        parameters = data.get("parameters", {})
        operators  = data.get("operators", {})
        functions  = data.get("functions", [])
        rows = data['rows']

        # Make sure we never train on the output itself
        if output_variable in input_variables:
            input_variables = [v for v in input_variables if v != output_variable]

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

        defaults = {
            "binary_operators": operators,
            "unary_operators": functions,
            "nested_constraints": {
                fn: {inner: 0 for inner in functions}
                for fn in functions
            },
            "output_directory": os.path.abspath(TEMP_DIR),
            "run_id": "hall of fame",
            "verbosity": 0,
            "maxsize": 30,
            "niterations": 100,
            "populations": 31,
            "population_size": 27,
            "ncycles_per_iteration": 380,
            "elementwise_loss": 'L2DistLoss()',
            "model_selection": 'best'
        }

        # Merge in overrides (parameters keys will overwrite the above)
        defaults.update(parameters)

        # Instantiate with the merged kwargs
        model = PySRRegressor(**defaults)

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
    if os.path.exists(hof_file_path):
        return send_file(hof_file_path, mimetype='text/csv')
    else:
        return jsonify({'status': 'no file to send'})
    
@app.route('/models_output', methods=['DELETE'])
def delete_model_output():
    if os.path.exists(hof_file_path):
        os.remove(hof_file_path)
        return jsonify({'status': 'deleted'}), 200
    return jsonify({'status': 'no file to delete'}), 404
    
@app.route('/evaluate', methods=['POST'])
def evaluate():
    try:
        data = request.get_json(force=True)
        expr    = str(data.get("equation", "")).strip()
        rows    = data.get("rows", [])
        headers = data.get("headers", [])
        output_variable = data.get("output_variable", "").strip()

        current_app.logger.debug("Equation string received: %r", expr)


        if not expr:
            return jsonify({"error": "No equation supplied"}), 400

        df = pd.DataFrame(rows, columns=headers)
        if df.empty:
            return jsonify({"error": "No data rows supplied"}), 400
        if df.iloc[-1].isnull().any():
            current_app.logger.warning("Dropping last row – it has NaNs")
            df = df.iloc[:-1]

        try:
            result = df.eval(expr,
                            # local_dict=safe_locals,
                            engine="numexpr")          # fast + safe
            
            if isinstance(result, pd.Series):          # usual case
                pred = result.to_numpy(dtype=float)

            elif isinstance(result, pd.DataFrame):     # rare: multi-column result
                # Flatten in column order so the downstream code still sees 1-D.
                pred = result.to_numpy(dtype=float).ravel(order="F")

            else:                                      # scalar (numpy.float64, int, etc.)
                # Broadcast the single value across the entire time series
                pred = np.full(len(df), float(result), dtype=float)



        except (SyntaxError, KeyError, ValueError, ZeroDivisionError) as err:
            current_app.logger.error(f"Expression evaluation failed: {err}")
            return jsonify({"error": f"Cannot evaluate expression: {err}"}), 400

        pred = np.asarray(pred, dtype=float)
        pred = np.where(np.isfinite(pred), pred, None).tolist()

        y = df[output_variable].astype(float).to_numpy()

        # R²
        r2   = float(r2_score(y, pred))
        # RMSE
        rmse = float(np.sqrt(mean_squared_error(y, pred)))
        # normalized RMSE (by y range)
        y_range = float(np.nanmax(y) - np.nanmin(y))
        nrmse   = float(rmse / y_range) if y_range != 0 else float("nan")

        pred_list = [
            None if (isnan(x) or x is None) else float(x)
            for x in pred
        ]
        
        return jsonify({
            "prediction": pred_list,
            "r2":   r2,
            "rmse": rmse,
            "nrmse": nrmse
        })

    except Exception as e:
        current_app.logger.exception("Evaluation failed")
        return jsonify({"error": str(e)}), 500

# Flask route to stop running PySR
@app.route('/stop', methods=['POST'])
def stop():
    global current_process

    # If there’s a live PySR process, terminate it
    if current_process is not None and current_process.is_alive():

        # os.remove(hof_file_path)

        current_process.terminate()
        current_process.join()
        current_process = None

        # Return to frontend
        return jsonify({'status': 'stopped', 'message': 'PySR stopped'})

    # No process was running
    return jsonify({
        'status': 'no process running',
        'message': 'There was no active PySR process to stop.'
    }), 200

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)
