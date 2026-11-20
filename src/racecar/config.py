import json
from pathlib import Path
import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = REPO_ROOT / "configs"
TRACKS_DIR = REPO_ROOT / "tracks"

def load_car(name="car"):
    with open(CONFIG_DIR / f"{name}.json") as f:
        return json.load(f)

def load_track(name):
    return np.loadtxt(TRACKS_DIR / f"{name}.csv", delimiter=",")
