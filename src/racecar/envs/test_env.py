from pathlib import Path

import numpy as np
from gymnasium.utils.env_checker import check_env

from racecar.envs.vehicle_env import RaceCarEnv

TRACK_PATH = Path(__file__).resolve().parent / "Norisring.csv"

track = np.loadtxt(TRACK_PATH, delimiter=",")
env = RaceCarEnv(track)

check_env(env)
print("check_env passed")