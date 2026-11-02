from pathlib import Path

import numpy as np 

from stable_baselines3 import PPO
from stable_baselines3.common.monitor import Monitor

from racecar.envs.vehicle_env import RaceCarEnv


TRAINING_DIR = Path(__file__).resolve().parent
TRACK_PATH = TRAINING_DIR.parent / "envs" / "Norisring.csv"
TOTAL_TIMESTEPS = 20_000
MODEL_PATH = TRAINING_DIR / "models" / "ppo_norisring"


def main() -> None:
    track = np.loadtxt(TRACK_PATH, delimiter=",")
    env = Monitor(RaceCarEnv(track))

    model = PPO("MlpPolicy", env, verbose=1, seed=0)
    model.learn(total_timesteps=TOTAL_TIMESTEPS)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    model.save(MODEL_PATH)
    print(f"Saved trained model to {MODEL_PATH}.zip")


if __name__ == "__main__":
    main()


        

