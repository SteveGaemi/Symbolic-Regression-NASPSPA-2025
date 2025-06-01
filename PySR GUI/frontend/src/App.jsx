// src/App.jsx
// Libraries -------------------------------------------------------------------------------------
import React, { useRef, useState, useEffect, useCallback } from 'react';
import Plot from 'react-plotly.js';
import Papa from 'papaparse';
import axios from 'axios';

// Main App --------------------------------------------------------------------------------------
function App() {
  // OBJECTS -------------------------------------------------------------------------------------
  const fileInputRef = useRef(null); // Input file reference
  const [rows, setRows] = useState([]); // Data in rows
  const [headers, setHeaders] = useState([]); // Data headers
  const [selectedOutput, setSelectedOutput] = useState(''); // Output variable
  const [selectedInputs, setSelectedInputs] = useState([]); // Input variable
  const [progress, setProgress] = useState({status: 'not started', message: ''}); // Progress log text
  // Parameters
  const [parameters, setParameters] = useState({ 
    maxsize: 30,
    niterations: 100,
    populations: 31,
    population_size: 27,
    ncycles_per_iteration: 380,
    elementwise_loss: 'L2DistLoss()',
    model_selection: 'best'
  });
  // Operators
  const [operators, setOperators] = useState({
    "+": true,
    "-": true,
    "*": true,
    "/": true
  });
  // Functions
  const [functions, setFunctions] = useState({
    sin: true,
    cos: true,
    tan: true,
    exp: true,
    log: true
  });
  const [isRunning, setIsRunning] = useState(false); // Flag indicating if backend is running
  const [plotData, setPlotData] = useState([]); // Plot
  const [modelsTable, setModelsTable] = useState([]); // Data to populate model table
  const [logMessages, setLogMessages] = useState([]); // Extended log text
  const [selectedRowIndex, setSelectedRowIndex] = useState(null); // Row to highlight
  const [selectedEquation, setSelectedEquation] = useState(null); // Equation to plot
  const [predictedValues, setPredictedValues] = useState([]); // Predicted output values
  const [accuracyMetrics, setAccuracyMetrics] = useState([
    { name: 'r2', value: null },
    { name: 'rmse', value: null },
    { name: 'nrmse', value: null },
  ]);


  // ACTIONS -------------------------------------------------------------------------------------
  // Load Button 
  const handleLoadClick = async () => {
    // 1) Clear out the UI
    setPredictedValues([]);
    setModelsTable([]);  // reset your models table

    // 2) Delete the server’s HOF CSV
    try {
      const res = await axios.delete('http://localhost:5000/models_output');
      setProgress({
        status: res.data.status === 'deleted' ? 'idle' : 'warning',
        message: res.data.message || 'Old hall_of_fame.csv deleted.'
      });
    } catch (err) {
      console.error('Failed to delete remote hall_of_fame.csv:', err);
      setProgress({
        status: 'error',
        message: 'Could not delete old hall_of_fame.csv.'
      });
    }
    
    fileInputRef.current.click(); // Triggers file selection diaglog
  };

  // "handleLoadClick" > Trigger file selection > Change input file reference > Trigger "handleFileChange"
  // > Grab and Parse File > Update data rows and headers, output, and inputs

  // File Change
  const handleFileChange = (event) => {
    const file = event.target.files[0]; // Grabs selected file
    if (file) { // If file was selected
      Papa.parse(file, { // Parse CSV file
        header: true, // Treats first row as column header
        dynamicTyping: true, // Automatically converts values to numbers or booleans when possible
        complete: (results) => { // Callback function that runs after parsing is finished
          const rawHeaders = results.meta.fields || []; // Original headers
          const numericPattern = /^-?\d+(\.\d+)?$/;     // e.g. 1, 2, 3.14
    
          // Are **all** headers numeric?
          const headersAreNumeric = rawHeaders.every(h => numericPattern.test(h));
    
          // Decide on the final header names
          const finalHeaders = headersAreNumeric
            ? rawHeaders.map((_, i) => `v${i + 1}`)     // v1, v2, …
            : [...rawHeaders];

          // If we changed the headers, remap each row’s keys
          const dataRows = headersAreNumeric
            ? results.data.map(row => {
                const newRow = {};
                finalHeaders.forEach((newKey, i) => {
                  newRow[newKey] = row[rawHeaders[i]];
                });
                return newRow;
              })
            : results.data;
          
          setRows(results.data); // Update rows with data
          setHeaders(finalHeaders);

          if (finalHeaders.length) {
            setSelectedOutput(finalHeaders[0]);          // First column = output
            setSelectedInputs(finalHeaders.slice(1));    // Rest = inputs
          }

          const fileName = file.name; // Grabs file name
          setProgress({ status: 'loaded', message: `${fileName} loaded` }); // Update log text
        },
        error: (err) => console.error(err)
      });
    }
  };

  // Input Change
  const handleInputChange = (header) => {
    if (selectedInputs.includes(header)) {
      setSelectedInputs(selectedInputs.filter(h => h !== header));
    } else {
      setSelectedInputs([...selectedInputs, header]);
    }
  };

  useEffect(() => {
    setSelectedInputs(prev =>
      prev.filter(input => input !== selectedOutput)
    );
  }, [selectedOutput]);

  // Check All Button
  const handleCheckAll = () => {
    setSelectedInputs(headers.filter(h => h !== selectedOutput));
  };

  // Check None Button
  const handleCheckNone = () => {
    setSelectedInputs([]);
  };

  // Parameter Change
  const handleParameterChange = (param, value) => {
    setParameters(prev => ({ ...prev, [param]: value }));
  };

  // Operator Change
  const handleOperatorChange = (name) => {
    setOperators(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Function Change
  const handleFunctionChange = (name, field, value) => {
    setFunctions(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Execute Button
  const handleExecuteClick = async () => {
    
    // ─── LOG ALL SELECTED PARAMETERS ────────────────────────────────────────
      // 1) Parameters
      const paramsLog = Object
      .entries(parameters)
      .map(([key, val]) => `${key} = ${val}`)
      .join(', ');
    appendLog(`Parameters: ${paramsLog}`);

    // 2) Operators (only those that are on)
    const opsLog = Object
      .entries(operators)
      .filter(([_, enabled]) => enabled)
      .map(([op]) => op)
      .join(', ');
    appendLog(`Operators: ${opsLog}`);

    // 3) Functions (only those selected, with their layers)
    const funcsLog = Object
      .entries(functions)
      .filter(([_, enabled]) => enabled)
      .map(([fn]) => fn)
      .join(', ');
    appendLog(`Functions: ${funcsLog}`);
    // ────────────────────────────────────────────────────────────────────────

    const payload = { // Data sent to backend for PySR
      output_variable: selectedOutput,
      input_variables: selectedInputs,
      headers: headers,
      parameters: parameters,
      operators: operators,
      functions: functions,
      rows: rows
    };

    setIsRunning(true);
    appendLog('Started execution and polling...');

    try {
      const response = await axios.post('http://localhost:5000/run_pysr', payload); // Wait until run_pysr is completed
      console.log('PySR results:', response.data);

    } catch (error) {
      console.error('Error running PySR:', error);
      appendLog(`Error: ${error.message}`);
    }
  };

  // Progress Log Update
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(async () => { // If run_pysr is running, set up a repeating task every 1 second
      try {
        const res = await axios.get('http://localhost:5000/progress'); // Send request to progress to chceck progress

        setProgress(res.data); // Updates progress log text

        // Stop polling automatically if complete
        if (res.data.status === 'done') {
          setIsRunning(false);
        }
      } catch (err) {
        console.error('Progress fetch error', err);
        setIsRunning(false);
      }
    }, 1000); // Set up time interval for the repeating task
    
    return () => clearInterval(interval);
  }, [isRunning]);

  // Extended Log Update
  const appendLog = useCallback((message) => {
    setLogMessages(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  // Models Table Update
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(async () => {
      try {
        const res = await axios.get('http://localhost:5000/models_output');
        // appendLog('Polling backend for model output...');

        Papa.parse(res.data, {
          header: true,
          dynamicTyping: true,
          complete: (results) => {
            // appendLog(`Parsed ${results.data.length} rows from CSV`);
            setModelsTable(results.data);
          },
          error: (err) => {
            console.error('CSV parse error:', err);
          }
        });
      } catch (err) {
        console.error('CSV fetch error', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  // Evaluation Update
  const handleAccuracyChange = (metric, value) => {
    setAccuracyMetrics(prev => ({ ...prev, [metric]: value }));
  };

  // Plot Update
  useEffect(() => {
    if (rows.length && selectedOutput) {
      const x = rows.map((_, index) => index);
      const y = rows.map(r => r[selectedOutput]);
      setPlotData([
        { x, y,
          type: 'scatter',
          mode: 'lines',
          line: {
            width: 3,
            // color: '#FFFFFF',
            color: '#1A91D6',
          },
          name: selectedOutput }
      ]);
    }
  }, [rows, selectedOutput]);

  // Save Button
  const handleSaveClick = async () => {
    try {
      // a) download the CSV
      const csvRes = await fetch('http://localhost:5000/models_output');
      if (!csvRes.ok) {
        throw new Error(`Download failed: ${csvRes.statusText}`);
      }
      const csvBlob = await csvRes.blob();

      // b) show native Save dialog
      if (!('showSaveFilePicker' in window)) {
        throw new Error('File System Access API not supported by your browser.');
      }
      const handle = await window.showSaveFilePicker({
        suggestedName: 'hall_of_fame.csv',
        types: [
          {
            description: 'CSV files',
            accept: { 'text/csv': ['.csv'] }
          }
        ]
      });

      // c) write to disk
      const writable = await handle.createWritable();
      await writable.write(csvBlob);
      await writable.close();

      setProgress({ status: 'saved', message: 'CSV saved successfully.' });
    } catch (err) {
      console.error(err);
      setProgress({
        status: 'error',
        message: err.message || 'Failed to save CSV.'
      });
    }
  };

  // Stop Button
  const handleStopClick = async () => {
    try {
      // Stop the server process
      await axios.post('http://localhost:5000/stop');
      setIsRunning(false);
  
      // Grab the CSV from the server
      const csvRes = await fetch('http://localhost:5000/models_output');
      if (!csvRes.ok) {
        throw new Error(`Failed to download CSV: ${csvRes.statusText}`);
      }
      const csvBlob = await csvRes.blob();
  
      // Let the user browse & pick a save location + filename
      if (!('showSaveFilePicker' in window)) {
        throw new Error('Your browser does not support the File System Access API.');
      }
      const handle = await window.showSaveFilePicker({
        suggestedName: 'hall_of_fame.csv',
        types: [
          {
            description: 'CSV files',
            accept: { 'text/csv': ['.csv'] }
          }
        ]
      });
  
      // Write the blob to disk
      const writable = await handle.createWritable();
      await writable.write(csvBlob);
      await writable.close();
          
      // Delete the original on the server
      await axios.delete('http://localhost:5000/models_output');

      setProgress({
        status: 'stopped',
        message: 'Execution stopped and CSV saved successfully.'
      });
  
    } catch (err) {
      console.error(err);
      setProgress({
        status: 'error',
        // user‐friendly fallback if they cancel the picker or any step fails
        message: err.message || 'Failed to stop or save CSV.'
      });
    }
  };

  // STYLE --------------------------------------------------------------------------------------
  // Button Style
  const buttonStyle = {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'black',
    border: '2px solid white',
    borderRadius: '8px',
    padding: '10px 20px',
    cursor: 'pointer',
  };

  // Log Text Style
  const logStyle = {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    margin: 0
  };

  // Variable Label Style
  const varLabelStyle = {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    marginRight: '5px',

  };

  // Dropdown Style
  const dropDownStyle = {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'black',
    border: '2px solid white',
    borderRadius: '5px',
    marginLeft: '10px',
    padding: '5px',
  };

  // Input Button Style
  const inputButtonStyle = {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'black',
    border: '2px solid white',
    borderRadius: '5px',
    marginLeft: '10px',
    padding: '5px',
    cursor: 'pointer',
  };

  // Input List Style
  const inputListStyle =  {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'black',
    border: '2px solid white',
    borderRadius: '5px',
    maxHeight: '85px',
    overflowY: 'auto',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '5px',
  };

  // Parameter Row Style
  const parameterRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '5px'
  };

  // Parameter Label Style
  const parameterLabelStyle = {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'left'
  };

// Parameter Input Style
  const parameteInputStyle = {
    flex: '1',
    textAlign: 'right',
    maxWidth: '120px',
    minWidth: '100px',
    height: '30px',
    boxSizing: 'border-box',
    padding: '5px',
    border: '1px solid #ccc',   // Always show a light gray border
    borderRadius: '4px'
  };

  // Operator & Function Label Style
  const ofLabelStyle = {
    display: 'flex',
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    marginBottom: '10px'
  };

  // Operator & Function Label Style
  const ofListStyle = {
    display: 'flex',
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: '15px',
    marginBottom: '5px'
  };



  // GUI ----------------------------------------------------------------------------------------
  return (
    <div style={{height: '100vh', display: 'flex', background: '#000000', flexDirection: 'column'}}> {/* Main Board */}
      {/* System Control Panel */}
      <div style={{flex: '0.5', display: 'flex', border: '2px solid white', borderRadius: '5px', alignItems: 'center', justifyContent: 'space-around'}}>
        <button onClick={handleLoadClick}style={buttonStyle}>Load</button>
        <button onClick={handleExecuteClick} style={buttonStyle}>Execute</button>
        <button onClick={handleSaveClick} style={buttonStyle}>Save</button>
        <button onClick={handleStopClick} style={buttonStyle}>Stop</button>
        {/* Hidden Item: File */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {/* Hidden Item: File */}
      </div>
      {/* System Control Panel */}

      {/* Main Panel */}
      <div style={{flex: '6', display: 'flex', border: '2px solid white', borderRadius: '5px', overflow: 'hidden'}}>
        {/* Left Panel: Symbolic Regression */}
        <div style={{ flex: '2', display: 'flex', border: '2px solid white', borderRadius: '5px', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Variables Panel */}
          <div style={{ flex: '1', borderBottom: '2px solid white', padding: '5px', overflowY: 'visible' }}>
            {headers.length > 0 && (
              <div>
                {/* Output Row */}
                <div style={{ marginBottom: '5px' }}>
                  <label style={varLabelStyle}>Output Variable:</label>
                  {/* Output Variable Dropdown */}
                  <select
                    value={selectedOutput}
                    onChange={(e) => setSelectedOutput(e.target.value)}
                    style={dropDownStyle}
                  >
                    {/* Dynamically draw headers from data's column header */}
                    {headers.map((header) => ( 
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                  {/* Output Variable Dropdown */}
                </div>
                {/* Output Row */}

                {/* Input Row */}
                <div style={{ marginBottom: '5px' }}>
                  <label style={varLabelStyle}>Input Variables:</label>
                  <button onClick={handleCheckAll} style={inputButtonStyle}>Check All</button>
                  <button onClick={handleCheckNone} style={inputButtonStyle}>Check None</button>
                </div>
                {/* Input Row */}

                {/* Input List Row */}
                <div style={inputListStyle}>
                  {headers.filter(h => h !== selectedOutput).map((header) => (
                    <div key={header} style={{width:'48%'}}>
                      <input
                        type="checkbox"
                        checked={selectedInputs.includes(header)}
                        onChange={() => handleInputChange(header)}
                      /> {header}
                    </div>
                  ))}
                </div>
                {/* Input List Row */}
              </div>
            )}
          </div>
          {/* Variables Panel */}

          {/* Parameters Panel */}
          <div style={{ flex: '1.5', borderBottom: '2px solid white', padding: '5px', overflowY: 'auto' }}>
            <div>
              <div style={parameterRowStyle}>
                <label style={parameterLabelStyle}>Max Size:</label>
                <input style={parameteInputStyle} type="number" value={parameters.maxsize} onChange={(e) => handleParameterChange('maxsize', Number(e.target.value))} />
              </div>
              <div style={parameterRowStyle}>
                <label style={parameterLabelStyle}>Number of Iterations:</label>
                <input style={parameteInputStyle} type="number" value={parameters.niterations} onChange={(e) => handleParameterChange('niterations', Number(e.target.value))} />
              </div>
              <div style={parameterRowStyle}>
                <label style={parameterLabelStyle}>Number of Populations:</label>
                <input style={parameteInputStyle} type="number" value={parameters.populations} onChange={(e) => handleParameterChange('populations', Number(e.target.value))} />
              </div>
              <div style={parameterRowStyle}>
                <label style={parameterLabelStyle}>Population Size:</label>
                <input style={parameteInputStyle} type="number" value={parameters.population_size} onChange={(e) => handleParameterChange('population_size', Number(e.target.value))} />
              </div>
              <div style={parameterRowStyle}>
                <label style={parameterLabelStyle}>Number of Cycles Per Iteration:</label>
                <input style={parameteInputStyle} type="number" value={parameters.ncycles_per_iteration} onChange={(e) => handleParameterChange('ncycles_per_iteration', Number(e.target.value))} />
              </div>
              <div style={parameterRowStyle}>
                <label style={parameterLabelStyle}>Elementwise Loss Function:</label>
                <select style={parameteInputStyle} value={parameters.elementwise_loss} onChange={(e) => handleParameterChange('elementwise_loss', e.target.value)}>
                  <option value="L1DistLoss()">L1 Distance</option>
                  <option value="L2DistLoss()">L2 Distance</option>
                </select>
              </div>
              <div style={parameterRowStyle}>
                <label style={parameterLabelStyle}>Model Selection:</label>
                <select style={parameteInputStyle} value={parameters.modelSelection} onChange={(e) => handleParameterChange('model_selection', e.target.value)}>
                  <option value="accuracy">Accuracy</option>
                  <option value="score">Score</option>
                  <option value="best">Best</option>
                </select>
              </div>
            </div>
          </div>
          {/* Parameters Panel */}

          {/* Operators and Functions Panel */}
          <div style={{ flex: '2', padding: '5px', overflowY: 'auto' }}>
            <div>
              <h4 style={ofLabelStyle}>Operators</h4>
              {Object.keys(operators).map(op => (
                <div key={op} style={ofListStyle}>
                  <div style={{ textAlign: 'left' }}>{op}</div>
                  <input
                    type="checkbox"
                    checked={operators[op]}
                    onChange={() => handleOperatorChange(op)}
                  />
                </div>
              ))}
              <h4 style={ofLabelStyle}>Functions</h4>
              {Object.keys(functions).map(fn => (
                <div key={fn} style={ofListStyle}>
                <div style={{ flex: '2', textAlign: 'left' }}>{fn}</div>
                <div style={{ flex: '1', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={functions[fn]}
                    onChange={() => handleFunctionChange(fn)}
                    style={{ marginRight: '5px' }}
                  />
                </div>
              </div>
            ))}
            </div>
          </div>
          {/* Operators and Functions Panel */}

        </div>
        {/* Left Panel: Symbolic Regression */}

        {/* Right Panel: Visualization */}
        <div style={{ flex: '5', display: 'flex', border: '2px solid white', borderRadius: '5px', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Models Panel */}
          <div style={{ flex: '1', display: 'flex', borderBottom: '2px solid white', padding: '5px', overflowY: 'auto' }}>
            <table style={{ width: '100%', tableLayout: 'auto', borderCollapse: 'collapse', color: 'white', fontFamily: 'monospace', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={{ width: '100px', height: '15px', borderBottom: '1px solid white', borderRight: '1px solid white', textAlign: 'left' }}>Complexity</th>
                  <th style={{ width: '100px', height: '15px', borderBottom: '1px solid white', borderRight: '1px solid white', textAlign: 'left' }}>Loss</th>
                  <th style={{ height: '15px', borderBottom: '1px solid white', textAlign: 'left' }}>Equation</th>
                </tr>
              </thead>
              <tbody>
                {modelsTable.map((row, idx) => (
                  <tr
                    key={idx}
                    onClick={async () => {
                      // setSelectedEquation(row.Equation);
                      // setSelectedRowIndex(idx);
                      appendLog(`Selected equation: ${row.Equation}`);

                      const payload = {
                        equation: row.Equation,
                        output_variable: selectedOutput,
                        input_variables: selectedInputs,
                        headers: headers,
                        rows: rows
                      };
                    
                      try {
                        const response = await axios.post('http://localhost:5000/evaluate', payload);

                        appendLog(`Received predicted values from backend: ${response.data.prediction}`);

                        const predicted = response.data.prediction;
                        // const predictedArr = Array.isArray(predicted) ? predicted : [predicted];

                        setPredictedValues(predicted);
                        setAccuracyMetrics({
                          r2:    response.data.r2,
                          rmse:  response.data.rmse,
                          nrmse: response.data.nrmse,
                        });                    
                        appendLog(`r2: ${response.data.r2}`);
                        // appendLog(`Received ${predicted.length} predicted values from backend`);
                      } catch (err) {
                        console.error('Backend evaluation error:', err);
                        appendLog(`Evaluation failed: ${err.message}`);
                      }
                      // const predicted = predictFromEquation(row.Equation, rows);
                      // setPredictedValues(predicted);
                      // appendLog(`Selected equation and generated ${predicted.length} predictions`);
                    }}
                    style={{
                      backgroundColor: idx === selectedRowIndex ? 'rgba(26, 145, 214, 0.5)' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    <td style={{ width: '100px', height: '30px', borderBottom: '1px solid white', borderRight: '1px solid white', textAlign: 'left' }}>{modelsTable[idx]?.Complexity || ''}</td>
                    <td style={{ width: '100px', height: '30px', borderBottom: '1px solid white', borderRight: '1px solid white', textAlign: 'left' }}>{modelsTable[idx]?.Loss || ''}</td>
                    <td style={{ borderBottom: '1px solid white', borderRight: '1px solid white', textAlign: 'left' }}>{modelsTable[idx]?.Equation || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Models Panel */}

          {/* Prediction Accuracy and Figure Panels */}
          <div style={{ flex: '1.5', display: 'flex', overflowY: 'auto' }}>
            {/* Prediction Accuracy Panel */}
            <div style={{ flex: '1', borderRight: '2px solid white', padding: '10px', overflowY: 'auto' }}>
              <div className="prediction-accuracy-panel">
                <h3>Prediction Accuracy</h3>
                <table style={{ width: '100%', tableLayout: 'auto', borderCollapse: 'collapse', color: 'white', fontFamily: 'monospace', fontSize: '14px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '30%', height: '30px', borderTop: '1px solid white', borderBottom: '1px solid white', borderRight: '1px solid white', borderLeft: '1px solid white', textAlign: 'left' }}>Metric</th>
                      <th style={{ width: '70%', height: '30px', borderTop: '1px solid white', borderBottom: '1px solid white', borderRight: '1px solid white', textAlign: 'left' }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ width: '30%', height: '30px', borderTop: '1px solid white', borderBottom: '1px solid white', borderRight: '1px solid white', borderLeft: '1px solid white', textAlign: 'left' }}>R²</td>
                      <td style={{ width: '30%', height: '30px', borderTop: '1px solid white', borderBottom: '1px solid white', borderRight: '1px solid white', borderLeft: '1px solid white', textAlign: 'left' }}>
                        {accuracyMetrics.r2 == null
                          ? '—'
                          : accuracyMetrics.r2.toFixed(4)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ width: '30%', height: '30px', borderTop: '1px solid white', borderBottom: '1px solid white', borderRight: '1px solid white', borderLeft: '1px solid white', textAlign: 'left' }}>RMSE</td>
                      <td style={{ width: '30%', height: '30px', borderTop: '1px solid white', borderBottom: '1px solid white', borderRight: '1px solid white', borderLeft: '1px solid white', textAlign: 'left' }}>
                        {accuracyMetrics.rmse == null
                          ? '—'
                          : accuracyMetrics.rmse.toFixed(4)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ width: '30%', height: '30px', borderTop: '1px solid white', borderBottom: '1px solid white', borderRight: '1px solid white', borderLeft: '1px solid white', textAlign: 'left' }}>nRMSE</td>
                      <td style={{ width: '30%', height: '30px', borderTop: '1px solid white', borderBottom: '1px solid white', borderRight: '1px solid white', borderLeft: '1px solid white', textAlign: 'left' }}>
                        {accuracyMetrics.nrmse == null
                          ? '—'
                          : accuracyMetrics.nrmse.toFixed(4)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {/* Prediction Accuracy Panel */}
            
            {/* Figure Panel */}
            <div style={{ flex: '2.5', padding: '10px', overflowY: 'auto' }}>
            <Plot
              data={[
                {
                  x: rows.map((_, i) => i),
                  y: rows.map(r => r[selectedOutput]),
                  name: selectedOutput,
                  type: 'scatter',
                  mode: 'lines',
                  line: { color: '#1A91D6', width: 3 },
                },
                predictedValues.length > 0 && {
                  x: rows.map((_, i) => i),
                  y: predictedValues,
                  name: 'Predicted',
                  type: 'scatter',
                  mode: 'lines',
                  line: { dash: 'dot', color: '#D71920', width: 3 },
                },
              ].filter(Boolean)}
              layout={{
                title: {
                  text: selectedOutput ? `Plot of ${selectedOutput}` : 'Loaded Data Plot',
                  font: {color: '#FFFFFF', size: 18, weight: 'bold'},
                },
                xaxis: {
                  title: {
                    text: 'Index',
                    font: {color: '#FFFFFF', size: 18, weight: 'bold'},
                  },
                  tickfont: { color: '#FFFFFF', size: 12, weight: 'bold'},
                  linecolor: '#FFFFFF',
                  linewidth: 2,
                  gridcolor: '#555',
                  gridwidth: 2,
                  zerolinecolor: '#D71920',
                  zerolinewidth: 2,
                  showline: true,
                },
                yaxis: {
                  title: {
                    text: selectedOutput || 'Output',
                    font: {color: '#FFFFFF', size: 18, weight: 'bold'},
                  },
                  tickfont: { color: '#FFFFFF', size: 12, weight: 'bold'},
                  linecolor: '#FFFFFF',
                  linewidth: 2,
                  gridcolor: '#555',
                  gridwidth: 2,
                  zerolinecolor: '#D71920',
                  zerolinewidth: 2,
                  showline: true,
                },
                autosize: true,
                responsize: true,
                paper_bgcolor: '#000',
                plot_bgcolor: '#000',
                font: {color: '#FFFFFF'},
              }}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%' }}
            />
            </div>
            {/* Figure Panel */}

          </div>
          {/* Prediction Accuracy and Figure Panels */}

        </div>
        {/* Right Panel: Visualization */}
      </div>
      {/* Main Panel */}

      
      {/* Log Panel */}
      {/*}
      <div style={{flex: '1', display: 'flex', border: '2px solid white', borderRadius: '5px', padding: '10px', overflowY: 'auto', textAlign: 'left'}}>
        <p style={{ ...logStyle, marginBottom: '10px' }}>
          {progress.status === 'running' && `Running: ${progress.message}`}
          {progress.status === 'done' && `Finished: ${progress.message}`}
          {progress.status === 'stopped' && `Stopped: ${progress.message}`}
          {progress.status === 'loaded' && `${progress.message}`}
          {progress.status === 'error' && `Error: ${progress.message}`}
          {progress.status === 'idle' && `Idle: ${progress.message}`}
        </p>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {logMessages && logMessages.map((msg, index) => (
            <p key={index} style={logStyle}>{msg}</p>
          ))}
        </div>
      </div>
      */}
      {/* Log Panel */}
      

    </div>
  ); // return
}

export default App