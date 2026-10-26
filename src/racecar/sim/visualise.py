import numpy as np
from racecar.src.racecar.envs.vehicle_env import RaceCarEnv
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

track = np.loadtxt("../envs/Norisring.csv", delimiter=",")
env = RaceCarEnv(track)

normal = np.stack([-env.seg_vec[:, 1], env.seg_vec[:, 0]], axis=1) / env.seg_len[:, None]
left_edge = env.centreline + normal * env.width_left[:, None]
right_edge = env.centreline - normal * env.width_right[:, None]


positions, speeds = [], []
obs, info = env.reset()

def follow_track(obs, target_speed=12.0):
    progress, lateral, i = env._locate(env.position)
    track_dir = env.seg_vec[i] / env.seg_len[i]
    velocity = obs[2:]
    speed = np.linalg.norm(velocity)
    car_dir = velocity / speed
    heading_error = np.arctan2(track_dir[0] * car_dir[1] - track_dir[1] * car_dir[0],
                               track_dir @ car_dir)
    steer = -0.3 * lateral - 2.0 * heading_error
    throttle = 0.5 * (target_speed - speed)
    return np.clip(np.array([throttle, steer]), -1, 1).astype(np.float32)

while True:
    action = follow_track(obs) + env.np_random.normal(0, 0.3, size=2).astype(np.float32)
    obs, reward, terminated, truncated, info = env.step(action)
    positions.append(env.position.copy())
    speeds.append(np.linalg.norm(env.velocity))
    if terminated or truncated:
        break
print(len(positions), env.steps)
print(positions[:5])
positions = np.array(positions)

fig, ax = plt.subplots(figsize=(8, 8))
ax.plot(*np.vstack([left_edge, left_edge[:1]]).T, "k-", lw=1)
ax.plot(*np.vstack([right_edge, right_edge[:1]]).T, "k-", lw=1)
sc = ax.scatter(positions[:, 0], positions[:, 1], c=speeds, s=2)
fig.colorbar(sc, ax=ax, label="speed (m/s)")
ax.set_aspect("equal")
stride = 20
car, = ax.plot([], [], "ro", ms=6)
trail, = ax.plot([], [], "r-", lw=1)
label = ax.text(0.02, 0.95, "", transform=ax.transAxes)

def update(frame):
    k = frame * stride
    car.set_data([positions[k, 0]], [positions[k, 1]])
    trail.set_data(positions[:k + 1, 0], positions[:k + 1, 1])
    label.set_text(f"t = {k * env.dt:.1f} s   {speeds[k]:.1f} m/s")
    return car, trail, label

anim = FuncAnimation(fig, update, frames=len(positions) // stride, interval=20, blit=True)
plt.show()