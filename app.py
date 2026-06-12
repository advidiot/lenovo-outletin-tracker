import os
import sys

# Ensure backend package can be imported from parent path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.main import main

if __name__ == "__main__":
    main()
