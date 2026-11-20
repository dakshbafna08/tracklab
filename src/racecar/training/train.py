from pathlib import Path

import numpy as np

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.vec_env import VecNormalize

from racecar.config import load_car, load_track
from racecar.envs.wrappers import make_env


TRAINING_DIR = Path(__file__).resolve().parent
MODEL_DIR = TRAINING_DIR / "models"
CHECKPOINT_DIR = TRAINING_DIR / "checkpoints"
LOG_DIR = TRAINING_DIR / "runs"

TRACK = "Melbourne"
TOTAL_TIMESTEPS = 1_000_000
N_ENVS = 8
CHECKPOINT_EVERY = 25_000


def main() -> None:
    track = load_track(TRACK)
    car = load_car()

    venv = make_vec_env(lambda: make_env(track, car), n_envs=N_ENVS, seed=0)
    venv = VecNormalize(venv)

    checkpoints = CheckpointCallback(
        save_freq=CHECKPOINT_EVERY // N_ENVS,
        save_path=str(CHECKPOINT_DIR),
        name_prefix="ppo",
        save_vecnormalize=True,
    )

    model = PPO("MlpPolicy", venv, verbose=1, seed=0, tensorboard_log=str(LOG_DIR))
    model.learn(total_timesteps=TOTAL_TIMESTEPS, callback=checkpoints)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.save(MODEL_DIR / f"ppo_{TRACK.lower()}")
    venv.save(MODEL_DIR / "vecnormalize.pkl")
    print(f"Saved model and normalisation stats to {MODEL_DIR}")


if __name__ == "__main__":
    main()