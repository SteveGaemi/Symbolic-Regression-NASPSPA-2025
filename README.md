### Symbolic-Regression-NASPSPA-2025

# 1. Windows 11 (or 10) Guide
 
# A. One-time installations
# Python 3.12+
1. Go to https://www.python.org → Downloads
2. Grab the Windows installer (64-bit).
3. Important: tick “Add python.exe to PATH” in the first screen.
4. Click Install Now.

# Julia 1.10+	Required by PySR
1. Go to https://julialang.org/downloads/
2. Download the 64-bit installer and run it (the defaults are fine).
Node.js LTS	Runs the React frontend	1. Go to https://nodejs.org → LTS version
2. Run the installer (npm is included)

# App	Runs the app
1. Go to https://github.com/SteveGaemi/Symbolic-Regression-NASPSPA-2025 
2. Click ‘<>Code’ (Green button)
3. Click ‘Download ZIP’

Restart your PC (so new PATH entries are picked up).
 
B. Set up the backend (Python + Flask + PySR)
1.	Open Command Prompt (press ⊞ Win → type “command prompt” → Run).
2.	Create a folder named ‘pysr-app’
3.	Create a folder named ‘backend’ inside ‘pysr-app’
4.	Choose the ‘backend’ folder, e.g.
cd C:\Users\<YourName>\Documents\pysr-app\backend
5.	Extract main.py into this folder (main.py should be in .\PySR GUI\backend\).
6.	Create and activate a virtual environment inside ‘backend’ (keeps packages isolated):
python -m venv venv
.\venv\Scripts\activate
7.	(Your prompt will now start with (venv) — good.)
8.	Upgrade pip and install requirements:
python -m pip install --upgrade pip
pip install flask flask-cors pandas numpy scikit-learn pysr numepxr
-	The first pysr run will compile some Julia packages; let it finish.
9.	Launch the back-end:
python main.py
10.	By default Flask starts on http://localhost:5000 and command prompt will keep showing its log; leave this window open.
 
C. Set up the 
frontend
 (React)
1.	Open a second command prompt window (keep the backend running in the first).
2.	Create a React project inside ‘pysr-app’ (using Vite, lightweight & modern):
cd C:\Users\<YourName>\Documents\pysr-app
npm create vite@latest frontend -- --template react
cd frontend
3.	Copy your App.jsx into ‘frontend’ folder inside ‘pysr-app’ (overwrite frontend/src/App.jsx; App.jsx should be in .\PySR GUI\frontend\).
4.	Install the React-side libraries:
npm install
npm install react-plotly.js plotly.js papaparse axios

5.	Tell React where the API lives – add this line to frontend/package.json just before "dependencies" (one time only):
"proxy": "http://localhost:5000",
6.	Start the dev server:
npm run dev
7.	Vite prints a local URL (typically http://localhost:5173). Open it in a browser — you should see the UI.
You’re done! Upload a CSV, pick variables, and click Run to watch PySR crank.
 
2. macOS (12 Monterey, 13 Ventura, 14 Sonoma) Guide

A. One-time installations
What	Quick method
Homebrew (package manager)	1.	/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
2.	Add homebrew path
-	echo >> /Users/ericshin/.zprofile
-	echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> /Users/ericshin/.zprofile
-	eval "$(/opt/homebrew/bin/brew shellenv)"
Python 3.12+	brew install python
Julia 1.10+	brew install --cask julia
Node.js LTS	brew install node
App	1. Go to https://github.com/SteveGaemi/Symbolic-Regression-NASPSPA-2025 
2. Click ‘<>Code’ (Green button)
3. Click ‘Download ZIP’
Open a new Terminal tab after Homebrew finishes so PATH is updated.
 
B. Set up the 
backend
1.	Create a project folder:
mkdir -p ~/<desired path>/pysr-app/backend
cd ~/<desired path>//pysr-app/backend
2.	Copy main.py here (main.py should be in .\PySR GUI\backend\).
3.	Create & activate a virtual environment:
python3 -m venv venv
source venv/bin/activate
4.	Install the packages:
python -m pip install --upgrade pip
pip install flask flask-cors pandas numpy scikit-learn pysr numexpr
5.	Run Flask:
python main.py
6.	Flask listens on http://127.0.0.1:5000; leave this Terminal window open.
-	macOS localhost:5000 may already be in use. Turn off Airplay receiver (System Preferences > General > Airdrop & Handoff)
 
C. Set up the 
frontend
1.	Open a second Terminal tab and go to the project root:
cd ~/<desired path>/pysr-app
2.	Create the React project:
npm create vite@latest frontend -- --template react
cd frontend
3.	Replace src/App.jsx with App.jsx in .\PySR GUI\frontend\.
4.	Install dependencies:
npm install
npm install react-plotly.js plotly.js papaparse axios
5.	Add the proxy (so React calls the Flask API without CORS headaches): open package.json and insert
"proxy": "http://localhost:5000",
6.	just before the "dependencies" block.
7.	Start Vite:
npm run dev
8.	Browse to the URL Vite prints (e.g., http://localhost:5173).
You’re done! Upload a CSV, pick variables, and click Run to watch PySR crank.
 
3. Daily workflow (both systems)
Task	Windows command	macOS command
Activate backend venv	.\venv\Scripts\activate	source venv/bin/activate
Start backend	python main.py	python main.py
Start frontend	npm run dev (inside frontend folder)	npm run dev (inside frontend folder)
Keep the two terminals open while you work.
When you finish, press Ctrl + C in each terminal to stop the servers, then deactivate the venv with deactivate.
 
Troubleshooting quick hits
Symptom	Likely fix
“python not found”	Re-open command prompt / Terminal so PATH refreshes, or reinstall Python and ensure “Add to PATH” is ticked.
Flask says port 5000 already in use	Close other Flask instances or run python main.py --port 5001 and update the "proxy" accordingly.
First PySR run hangs on “Compiling…”	That’s normal the very first time; PySR builds its Julia packages (can take several minutes).
React cannot fetch http://localhost:5000/...	Check that the backend console shows “Running on http://127.0.0.1:5000”; also verify the proxy line is in package.json, then restart npm run dev.
 
✨ Tip: Installing Visual Studio Code lets you open the whole pysr-app folder, run integrated terminals, and debug both Python (with the Python extension) and React (via the JavaScript/TypeScript Nightly extension) from one window.

That’s everything — enjoy exploring symbolic regression through your brand-new web interface!
