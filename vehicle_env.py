import numpy as np
import gymnasium as gym
from gymnasium import spaces

class RaceCarEnv(gym.Env):
    def __init__(self, track, mass=700,mu=1.5,drag=2,dt=0.01,max_steps=20000):
        super().__init__()

        # constants
        self.track = track
        self.centreline = track[:, :2] # this is the TUM .csv file format, so take x y and leave out track width
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

        return self._get_obs(), self._get_info()

    def _get_obs(self):
        return np.concatenate([self.position, self.velocity], dtype=np.float32)

    def _get_info(self):
        return {}

    def step(self, action):
        self.steps += 1
        action = np.clip(action, -1.0, 1.0)

        # this is the throttle, the acceleration along the vehicle
        accel_longitudinal = action[0] * self.max_accel

        # longitudinal and lateral acceleration are dictated by the grip of the tyre, as
        # it can be modeled by a circular relation, e.g. if 100% of grip is used for long accel, 0% is left for lateral accel

        max_lateral_accel = np.sqrt(self.max_accel**2 - accel_longitudinal**2)
        accel_lateral = action[1] * max_lateral_accel

        #subtract air resistance from accel vector
        accel_longitudinal -= self.drag * self.velocity**2 / self.mass

        # need to translate car frame accels to world frame (where pos and vel are in)
        forward_unit_v = self.velocity / np.linalg.norm(self.velocity)
        left_unit_v = np.array([[0,-1], [1,0]]) @ forward_unit_v
        accel_world = forward_unit_v * accel_longitudinal + left_unit_v * accel_lateral

        self.velocity += accel_world * self.dt
        self.position += self.velocity * self.dt

        reward = 0.0
        terminated = False
        truncated = self.steps >= self.max_steps
        return self._get_obs(), reward, terminated, truncated, self._get_info()












