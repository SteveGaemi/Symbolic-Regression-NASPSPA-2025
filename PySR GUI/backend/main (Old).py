# backend/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from multiprocessing import Process, Value
from pysr import PySRRegressor
import pandas as pd
import os
import json
import time
import glob
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import threading

app = Flask(__name__)
CORS(app)

current_process = None
TEMP_DIR = os.path.abspath('./temp')
hof_file_path = os.path.join(TEMP_DIR, 'hall_of_fame', 'hall_of_fame.csv')
progress_file = os.path.abspath('progress.json')

class HallOfFameHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if event.src_path.endswith('hall_of_fame.csv'):
            update_progress_from_hof()

    def on_created(self, event):
        if event.src_path.endswith('hall_of_fame.csv'):
            update_progress_from_hof()

def update_progress_from_hof():
    if os.path.exists(hof_file_path):
        try:
            with open(hof_file_path, 'r') as f:
                lines = f.readlines()
            if len(lines) > 1:
                last_line = lines[-1].strip()
                progress_data = {'status': 'running', 'message': f'Updated hall_of_fame: {last_line}'}
            else:
                progress_data = {'status': 'running', 'message': 'hall_of_fame created but no data yet.'}
        except Exception as e:
            progress_data = {'status': 'error', 'message': f'Error reading hall_of_fame: {str(e)}'}
    else:
        progress_data = {'status': 'running', 'message': 'hall_of_fame not found'}

    with open(progress_file, 'w') as f:
        json.dump(progress_data, f)

def start_hof_watcher():
    observer = Observer()
    event_handler = HallOfFameHandler()
    observer.schedule(event_handler, path=TEMP_DIR, recursive=False)
    observer.start()
    return observer

def run_pysr_task(data):
    try:

        with open('progress.json', 'w') as f:
            json.dump({'status': 'running', 'message': 'PySR started...'}, f)

        print("=== Received Data ===")
        print("Output variable:", data.get("output_variable"))
        print("Input variables:", data.get("input_variables"))
        print("Number of rows:", len(data.get("rows", [])))
        print("First row:", data["rows"][0] if data["rows"] else "No rows")

        output_variable = data['output_variable']
        input_variables = data['input_variables']
        headers = data['headers']
        parameters = data['parameters']
        operators = data['operators']
        functions = data['functions']
        rows = data['rows']

        df = pd.DataFrame(rows, columns = headers)

        print("DataFrame shape:", df.shape)
        print("Columns:", df.columns.tolist())

        X = df[input_variables]
        y = df[output_variable]

        if X.iloc[-1].isnull().any() or pd.isnull(y.iloc[-1]):
            print("⚠️ Dropping last row due to NaN")
            X = X.iloc[:-1]
            y = y.iloc[:-1]

        print("X:\n", X)
        print("Any NaNs in X?", X.isnull().any().any())
        print("NaN count per column:\n", X.isnull().sum())

        os.makedirs('./temp', exist_ok=True)

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
            run_id='hall of fame'
            # **parameters
        )

        model.fit(X, y)

        with open('progress.json', 'w') as f:
            json.dump({'status': 'done', 'message': 'PySR complete!'}, f)

    except Exception as e:
        with open('progress.json', 'w') as f:
            json.dump({'status': 'error', 'message': str(e)}, f)

@app.route('/run_pysr', methods=['POST'])
def run_pysr():
    global current_process
    data = request.get_json()
    current_process = Process(target=run_pysr_task, args=(data,))
    current_process.start()
    return jsonify({'message': 'PySR started'})

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

@app.route('/progress', methods=['GET'])
def progress():
    try:
        with open(progress_file, 'r') as f:
            return jsonify(json.load(f))
    except FileNotFoundError:
        return jsonify({'status': 'not started'})
    
@app.route('/hall_of_fame', methods=['GET'])
def hall_of_fame():
    if not os.path.exists(hof_file_path):
        return jsonify({'status': 'error', 'message': 'hall_of_fame.csv not found'})

    try:
        df = pd.read_csv(hof_file_path)
        # Convert DataFrame to list-of-dicts for JSON
        return jsonify({'status': 'ok', 'data': df.to_dict(orient='records')})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

if __name__ == '__main__':
    threading.Thread(target=start_hof_watcher, daemon=True).start()
    app.run(host='0.0.0.0', port=5000)
