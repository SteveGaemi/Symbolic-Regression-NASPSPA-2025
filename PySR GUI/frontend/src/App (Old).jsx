// src/App.jsx
// Libraries -------------------------------------------------------------------------------------
import React, { useRef, useState, useEffect } from 'react';
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
    elementwise_loss: 'L2 Distance',
    model_selection: 'best'
  });


  const [plotData, setPlotData] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [hallOfFame, setHallOfFame] = useState([]);

  const [operators, setOperators] = useState({
    Addition: true,
    Subtraction: true,
    Multiplication: true,
    Division: true
  });

  const [functions, setFunctions] = useState({
    Sine: { selected: true, layer: 0 },
    Cosine: { selected: true, layer: 0 },
    Tangent: { selected: true, layer: 0 },
    Exponential: { selected: true, layer: 0 },
    Logarithm: { selected: true, layer: 0 }
  });

  // ACTIONS -------------------------------------------------------------------------------------
  // Load Button 
  const handleLoadClick = () => {
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
          setRows(results.data); // Update rows with data
          setHeaders(results.meta.fields || []); // Update column headers with column headers
          if (results.meta.fields.length > 0) {
            setSelectedOutput(results.meta.fields[0]); // Automatically sets first column as output variable
            setSelectedInputs(results.meta.fields.filter(h => h !== results.meta.fields[0])); // Automatically sets other columns as input variables
          }
          const fileName = file.name; // Grabs file name
          setProgress({ status: 'loaded', message: `${fileName} loaded` });
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
    setFunctions(prev => ({
      ...prev,
      [name]: {
        ...prev[name],
        [field]: field === 'selected' ? !prev[name][field] : Number(value)
      }
    }));
  };

  // Execute Button
  const handleExecuteClick = async () => {
    const payload = {
      output_variable: selectedOutput,
      input_variables: selectedInputs,
      headers: headers,
      parameters: parameters,
      operators: operators,
      functions: functions,
      rows: rows
    };

    setIsRunning(true);
  
    try {
      const response = await axios.post('http://localhost:5000/run_pysr', payload); // Wait until run_pysr is completed
      console.log('PySR results:', response.data);

    } catch (error) {
      console.error('Error running PySR:', error);
    }
  };

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

  // const renderDataTable = () => {
  //   if (!rows.length || (!selectedOutput && selectedInputs.length === 0)) return null;
  
  //   // Determine which columns to show
  //   const columns = [...selectedInputs];
  //   if (selectedOutput) columns.push(selectedOutput);
  
  //   // Limit how many rows to display (e.g. first 20)
  //   const maxRows = 20;
  //   const displayRows = rows.slice(0, maxRows);
  
  //   return (
  //     <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
  //       <thead>
  //         <tr>
  //           {columns.map(col => (
  //             <th key={col} style={{ border: '1px solid #ccc', padding: '4px', background: '#f0f0f0' }}>
  //               {col}
  //             </th>
  //           ))}
  //         </tr>
  //       </thead>
  //       <tbody>
  //         {displayRows.map((row, i) => (
  //           <tr key={i}>
  //             {columns.map(col => (
  //               <td key={col} style={{ border: '1px solid #ccc', padding: '4px' }}>
  //                 {row[col] !== undefined ? row[col] : ''}
  //               </td>
  //             ))}
  //           </tr>
  //         ))}
  //       </tbody>
  //     </table>
  //   );
  // };



  const fetchHallOfFame = async () => {
    try {
      const response = await axios.get('http://localhost:5000/hall_of_fame');
      if (response.data.status === 'ok') {
        setHallOfFame(response.data.data);
      } else {
        console.warn(response.data.message);
      }
    } catch (err) {
      console.error('Failed to fetch hall_of_fame:', err);
    }

    if (res.data.status === 'done') {
      setIsRunning(false);
      fetchHallOfFame();
    }

  };

  const handleStopClick = async () => {
    try {
      await axios.post('http://localhost:5000/stop');
      setIsRunning(false);
      setProgress({ status: 'stopped', message: 'Execution manually stopped.' });
    } catch (err) {
      console.error('Failed to stop backend process:', err);
      setProgress({ status: 'error', message: 'Failed to stop process.' });
    }
  };

  // STYLE ------------------------------------------------------------------------------------------------
  // Button Style
  const buttonStyle = {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'black',
    border: '2px solid white',
    borderRadius: '5px',
    padding: '5px 10px',
    cursor: 'pointer',
  };

  // Log Text Style
  const logStyle = {
    fontFamily: 'monospace',
    fontSize: '14px',
    color: 'white',
    fontWeight: 'bold'
  };

  // Variable Label Style
  const varLabelStyle = {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    marginRight: '5px'
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
    fontFamily: 'monospace',
    fontSize: '12px',
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: '#000000',
    border: '2px solid white',   // Always show a light gray border
    borderRadius: '5px',
    flex: '1',
    textAlign: 'right',
    maxWidth: '120px',
    minWidth: '100px',
    height: '30px',
    boxSizing: 'border-box',
    padding: '5px',
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


  // GUI --------------------------------------------------------------------------------------------------
  return (
    <div style={{height: '100vh', display: 'flex', flexDirection: 'column', background: '#000000'}}>
      {/* System Control Panel */}
      <div style={{flex: '0.5', display: 'flex', border: '1px solid white', borderRadius: '10px', alignItems: 'center', justifyContent: 'space-around'}}>
      <button onClick={handleLoadClick} style={buttonStyle}>Load</button>
        <button style={buttonStyle}>Save</button>
        <button onClick={handleExecuteClick} style={buttonStyle}>Execute</button>
        <button style={buttonStyle}>Pause</button>
        <button onClick={handleStopClick} style={buttonStyle}>Stop</button>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {/* Main Content */}
      <div style={{ flex: '6', display: 'flex', border: '1px solid white', borderRadius: '5px', overflow: 'hidden' }}>
        {/* Left Panel: Symbolic Regression */}
        <div style={{ flex: '2', display: 'flex', border: '1px solid white', borderRadius: '5px', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Variables Panel */}
          <div style={{ flex: '1', borderBottom: '2px solid white', padding: '5px', overflowY: 'visible' }}>
            {headers.length > 0 && (
              <div>
                {/* Output Row */}
                <div style={{ marginBottom: '5px' }}>
                  <label style={varLabelStyle}>Output Variable:</label>
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
              </div>)}
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
                    checked={functions[fn].selected}
                    onChange={() => handleFunctionChange(fn, 'selected')}
                    style={{ marginRight: '5px' }}
                  />
                  <input
                    type="number"
                    value={functions[fn].layer}
                    onChange={(e) => handleFunctionChange(fn, 'layer', e.target.value)}
                    style={{
                      width: '50px',
                      textAlign: 'center',
                      height: '25px',
                      boxSizing: 'border-box'
                    }}
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
        <div style={{ flex: '5', display: 'flex', border: '1px solid white', borderRadius: '5px', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Models Panel */}
          <div style={{ flex: '1', display: 'flex', borderBottom: '2px solid white', padding: '5px', overflowY: 'auto' }}>
            {/* <h3>Models</h3> */}
            {hallOfFame.length > 0 && (
              <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      {Object.keys(hallOfFame[0]).map(col => (
                        <th key={col} style={{ border: '1px solid #ccc', padding: '5px', background: '#f0f0f0' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hallOfFame.map((row, idx) => (
                      <tr key={idx}>
                        {Object.keys(row).map(col => (
                          <td key={col} style={{ border: '1px solid #ccc', padding: '5px' }}>
                            {row[col]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* Models Panel */}

          {/* Prediction Accuracy and Figure Panels */}
          <div style={{ flex: '1.5', display: 'flex', overflowY: 'auto' }}>
            {/* Prediction Accuracy Panel */}
            <div style={{ flex: '1', borderRight: '2px solid white', padding: '5px', overflowY: 'auto' }}>
              <h3>Prediction Accuracy</h3>
            </div>
            {/* Prediction Accuracy Panel */}

            {/* Figure Panel */}
            <div style={{ flex: '2.5', padding: '10px', overflowY: 'auto' }}>
            <Plot
                data={plotData}
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
      </div>
      {/* Right Panel: Visualization */}
      
      {/* Log Panel */}
      <div style={{flex: '1', display: 'flex', border: '1px solid white', borderRadius: '5px', padding: '10px', overflowY: 'auto', textAlign: 'left'}}>
        <p style={logStyle}>
          {progress.status === 'running' && <>Running: {progress.message}</>}
          {progress.status === 'done' && <>Finished: {progress.message}</>}
          {progress.status === 'stopped' && <>Stopped: {progress.message}</>}
          {progress.status === 'loaded' && <>{progress.message}</>}
          {progress.status === 'error' && <>Error: {progress.message}</>}
        </p>

        {/* Display input/output data as table */}
        {/* {renderDataTable()} */}
      </div>
    </div>
  );
}

export default App;
