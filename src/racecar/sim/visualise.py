import re
import sys
from pathlib import Path

import numpy as np
import matplotlib
if sys.platform == "darwin":
    matplotlib.use("macosx")
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

from racecar.envs.wrappers import make_env


SIM_DIR = Path(__file__).resolve().parent
TRACK_PATH = SIM_DIR.parent / "envs" / "Norisring.csv"
CHECKPOINT_DIR = SIM_DIR.parent / "training" / "checkpoints"

POLICY = "model"
CHECKPOINT = None
STRIDE = 2

track = np.loadtxt(TRACK_PATH, delimiter=",")
env = make_env(track)
car_env = env.unwrapped

normal = np.stack([-car_env.seg_vec[:, 1], car_env.seg_vec[:, 0]], axis=1) / car_env.seg_len[:, None]
left_edge = car_env.centreline + normal * car_env.width_left[:, None]
right_edge = car_env.centreline - normal * car_env.width_right[:, None]


def follow_track(obs, target_speed=12.0):
    progress, lateral, i = car_env._locate(car_env.position)
    track_dir = car_env.seg_vec[i] / car_env.seg_len[i]
    velocity = car_env.velocity
    speed = np.linalg.norm(velocity)
    car_dir = velocity / speed
    heading_error = np.arctan2(track_dir[0] * car_dir[1] - track_dir[1] * car_dir[0],
                               track_dir @ car_dir)
    steer = -0.3 * lateral - 2.0 * heading_error
    throttle = 0.5 * (target_speed - speed)
    return np.clip(np.array([throttle, steer]), -1, 1).astype(np.float32)


def load_model_policy(step=None):
    if step is None:
        saved = [int(re.search(r"ppo_(\d+)_steps", p.name).group(1)) for p in CHECKPOINT_DIR.glob("ppo_*_steps.zip")]
        if not saved:
            raise FileNotFoundError(f"No checkpoints in {CHECKPOINT_DIR} - run training/train.py first")
        step = max(saved)
    print(f"Loading checkpoint at {step} steps")

    model = PPO.load(CHECKPOINT_DIR / f"ppo_{step}_steps")
    stats = VecNormalize.load(CHECKPOINT_DIR / f"ppo_vecnormalize_{step}_steps.pkl",
                              DummyVecEnv([lambda: make_env(track)]))
    stats.training = False

    def policy(obs):
        action, _ = model.predict(stats.normalize_obs(obs), deterministic=True)
        return action
    return policy


policy = load_model_policy(CHECKPOINT) if POLICY == "model" else follow_track

positions, speeds, times = [], [], []
obs, info = env.reset(seed=0)
while True:
    obs, reward, terminated, truncated, info = env.step(policy(obs))
    positions.append(car_env.position.copy())
    speeds.append(np.linalg.norm(car_env.velocity))
    times.append(car_env.steps * car_env.dt)
    if terminated or truncated:
        break
positions = np.array(positions)

finished = car_env.total_progress >= car_env.track_length
print(f"{'Lap complete' if finished else 'Episode ended'}: {car_env.total_progress:.0f} m in {times[-1]:.1f} s")

fig, ax = plt.subplots(figsize=(8, 8))
ax.plot(*np.vstack([left_edge, left_edge[:1]]).T, "k-", lw=1)
ax.plot(*np.vstack([right_edge, right_edge[:1]]).T, "k-", lw=1)
ax.set_aspect("equal")
car, = ax.plot([], [], "ro", ms=6)
trail, = ax.plot([], [], "r-", lw=1)
label = ax.text(0.02, 0.95, "", transform=ax.transAxes)


def update(frame):
    k = frame * STRIDE
    car.set_data([positions[k, 0]], [positions[k, 1]])
    trail.set_data(positions[:k + 1, 0], positions[:k + 1, 1])
    label.set_text(f"t = {times[k]:.1f} s   {speeds[k]:.1f} m/s")
    return car, trail, label


anim = FuncAnimation(fig, update, frames=len(positions) // STRIDE, interval=20, blit=True)
plt.show()