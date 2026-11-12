import gymnasium as gym

from racecar.envs.vehicle_env import RaceCarEnv


class ActionRepeat(gym.Wrapper):
    def __init__(self, env, repeat=10):
        super().__init__(env)
        self.repeat = repeat

    def step(self, action):
        total_reward = 0.0
        for _ in range(self.repeat):
            obs, reward, terminated, truncated, info = self.env.step(action)
            total_reward += reward
            if terminated or truncated:
                break
        return obs, total_reward, terminated, truncated, info


def make_env(track, repeat=10):
    return ActionRepeat(RaceCarEnv(track), repeat=repeat)