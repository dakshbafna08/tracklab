import numpy as np
from gymnasium.utils.env_checker import check_env, check_space_limit
from vehicle_env import RaceCarEnv

track = np.loadtxt("Norisring.csv", delimiter=",")
env = RaceCarEnv(track)

check_env(env)
print("check_env passed")