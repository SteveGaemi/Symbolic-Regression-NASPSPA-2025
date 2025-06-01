    
import os

# Get the directory where this script resides
script_dir = os.path.dirname(os.path.abspath(__file__))
# Build a path to e.g. a “data” subfolder and a file within it
rel_path   = os.path.join(script_dir, 'temp', 'temp_equations.txt')

print(rel_path)