import numpy as np
from gymnasium.utils.env_checker import check_env

from racecar.config import load_car, load_track
from racecar.envs.vehicle_env import RaceCarEnv

car = load_car()

env = RaceCarEnv(load_track("Melbourne"), car)
check_env(env)
print("check_env passed")

straight = np.array([[x, 0.0, 10.0, 10.0] for x in range(0, 5000, 10)], dtype=float)


def make_test_env(options, speed=None):
    test_env = RaceCarEnv(straight, car)
    test_env.reset(seed=0, options=options)
    if speed is not None:
        test_env.velocity = test_env.start_direction * speed
    return test_env


def speed_after(seconds, options):
    test_env = make_test_env(options)
    for _ in range(int(seconds / test_env.dt)):
        test_env.step(np.array([1.0, 0.0], dtype=np.float32))
    return np.linalg.norm(test_env.velocity)


def accel_at(speed, options):
    test_env = make_test_env(options, speed)
    test_env.step(np.array([1.0, 0.0], dtype=np.float32))
    return (np.linalg.norm(test_env.velocity) - speed) / test_env.dt


def grip_at(speed, options):
    test_env = make_test_env(options, speed)
    test_env.step(np.array([0.0, 0.0], dtype=np.float32))
    return test_env.max_accel


empty = {"compound": "MEDIUM", "tyre_age": 0, "fuel_kg": 0.0}
full = {"compound": "MEDIUM", "tyre_age": 0, "fuel_kg": 100.0}

v_top = (car["power_w"] / car["drag_coeff"]) ** (1 / 3)
v_test = 0.8 * v_top
for options in (empty, full):
    mass = car["car_mass_kg"] + options["fuel_kg"]
    assert car["power_w"] / (mass * v_test) < grip_at(v_test, options), "not power-limited at the test speed"

light, heavy = accel_at(v_test, empty), accel_at(v_test, full)
assert heavy < light, (light, heavy)
print(f"heavier accelerates less at {v_test:.0f} m/s: {light:.2f} vs {heavy:.2f} m/s^2")

light, heavy = grip_at(60.0, empty), grip_at(60.0, full)
assert heavy < light, (light, heavy)
print(f"heavier has less grip at 60 m/s: {light / 9.81:.2f} g vs {heavy / 9.81:.2f} g")

slow, fast = grip_at(20.0, empty), grip_at(80.0, empty)
assert fast > slow, (slow, fast)
print(f"downforce adds grip with speed: {slow / 9.81:.2f} g at 20 m/s vs {fast / 9.81:.2f} g at 80 m/s")

soft = speed_after(1, {"compound": "SOFT", "tyre_age": 0, "fuel_kg": 50.0})
hard = speed_after(1, {"compound": "HARD", "tyre_age": 0, "fuel_kg": 50.0})
assert soft > hard, (soft, hard)
print(f"more grip is faster off the line: {soft:.2f} m/s soft vs {hard:.2f} m/s hard after 1 s")

new = speed_after(1, {"compound": "SOFT", "tyre_age": 0, "fuel_kg": 50.0})
worn = speed_after(1, {"compound": "SOFT", "tyre_age": 30, "fuel_kg": 50.0})
assert worn < new, (new, worn)
print(f"worn tyres are slower: {new:.2f} m/s new vs {worn:.2f} m/s at 30 laps")

options = {"compound": "HARD", "tyre_age": 12, "fuel_kg": 42.0}
obs, info = env.reset(seed=0, options=options)
assert all(info[key] == value for key, value in options.items()), info
print("reset options respected")

top = speed_after(60, empty)
assert abs(top - v_top) < 1.0, (top, v_top)
print(f"top speed {top:.1f} m/s matches power/drag prediction {v_top:.1f} m/s")