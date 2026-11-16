import numpy as np
import gymnasium as gym
from gymnasium import spaces

class RaceCarEnv(gym.Env):
    def __init__(self, track, mass=700,mu=1.5,drag=2,dt=0.01,max_steps=50000):
        super().__init__()

        # constants
        self.track = track
        self.centreline = track[:, :2] # this is the TUM .csv file format, so take x y and leave out track width
        self.width_right = track[:, 2]
        self.width_left = track[:, 3]
        self.seg_start = self.centreline
        self.seg_vec = np.roll(self.centreline, -1, axis=0) - self.centreline
        self.seg_len = np.linalg.norm(self.seg_vec, axis=1)
        self.seg_start_s = np.concatenate([[0.0], np.cumsum(self.seg_len)[:-1]])
        self.track_length = self.seg_len.sum()
        self.min_speed = 0.5
        self.crash_penalty = 50.0
        self.mass = mass
        self.mu = mu
        self.drag = drag
        self.dt = dt
        self.max_steps = max_steps
        self.max_accel = self.mu * 9.81

        #start position
        self.start_position = self.centreline[0].copy()
        direction = self.centreline[1] - self.centreline[0]
        self.start_direction = direction / np.linalg.norm(direction) #unit vector
        self.start_speed = 1.0

        # action, [accel along velocity, accel perpendicular to velocity] normalised to [-1, 1]
        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(2,), dtype=np.float32)

        # observation in world coords
        self.observation_space = spaces.Box(low=-np.inf, high=np.inf, shape=(4,), dtype=np.float32)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)

        self.position = self.start_position.copy()
        self.velocity = self.start_direction * self.start_speed
        self.prev_progress = 0.0
        self.steps = 0
        self.total_progress = 0.0

        return self._get_obs(), self._get_info()

    def _get_obs(self):
        return np.concatenate([self.position, self.velocity], dtype=np.float32)

    def _get_info(self):
        return {}

    def _locate(self, p):
        rel = p - self.seg_start
        t = (rel * self.seg_vec).sum(axis=1) / self.seg_len ** 2
        t = np.clip(t, 0.0, 1.0)
        closest = self.seg_start + t[:, None] * self.seg_vec
        i = np.argmin(np.linalg.norm(p - closest, axis=1))

        progress = self.seg_start_s[i] + t[i] * self.seg_len[i]
        offset = p - closest[i]
        side = self.seg_vec[i, 0] * offset[1] - self.seg_vec[i, 1] * offset[0]
        lateral = np.sign(side) * np.linalg.norm(offset)
        return progress, lateral, i


    def step(self, action):
        self.steps += 1
        action = np.clip(np.asarray(action, dtype=np.float64), -1.0, 1.0)

        speed = np.linalg.norm(self.velocity)

        # this is the throttle, the acceleration along the vehicle
        accel_longitudinal = action[0] * self.max_accel

        # longitudinal and lateral acceleration are dictated by the grip of the tyre, as
        # it can be modeled by a circular relation, e.g. if 100% of grip is used for long accel, 0% is left for lateral accel

        max_lateral_accel = np.sqrt(max(0.0, self.max_accel**2 - accel_longitudinal**2))
        accel_lateral = action[1] * max_lateral_accel

        #subtract air resistance from accel vector
        accel_longitudinal -= self.drag * speed**2 / self.mass

        # need to translate car frame accels to world frame (where pos and vel are in)
        forward_unit_v = self.velocity / speed
        left_unit_v = np.array([[0,-1], [1,0]]) @ forward_unit_v

        new_direction = forward_unit_v + left_unit_v * (accel_lateral / speed) * self.dt
        new_direction /= np.linalg.norm(new_direction)
        new_speed = max(speed + accel_longitudinal * self.dt, self.min_speed)

        self.velocity = new_direction * new_speed
        self.position += self.velocity * self.dt

        progress, lateral, i = self._locate(self.position)

        delta = progress - self.prev_progress
        if delta < -self.track_length / 2:
            delta += self.track_length
        elif delta > self.track_length / 2:
            delta -= self.track_length
        self.prev_progress = progress
        self.total_progress += delta

        reward = delta

        width = self.width_left[i] if lateral > 0 else self.width_right[i]
        off_track = abs(lateral) > width
        lap_done = self.total_progress >= self.track_length

        if off_track:
            reward -= self.crash_penalty
        terminated = off_track or lap_done
        truncated = self.steps >= self.max_steps

        return self._get_obs(), reward, terminated, truncated, self._get_info()












