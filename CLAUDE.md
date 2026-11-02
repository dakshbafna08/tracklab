# CLAUDE.md

## Project overview

tracklab combines an F1 strategy-learning web app with a reinforcement-learning race car simulator.

- `Melbourne.csv`, `Norisring.csv`: track centerlines. Columns are `x_m, y_m, w_tr_right_m, w_tr_left_m` (meters; the header line starts with `#`).
- `melbourne_track.py`, `norisring_track.py`: plot a track's centerline and save `<Track>_circuit.png` (matplotlib + pandas).
- `src/racecar/envs/vehicle_env.py`: the RL environment for the car (`test_env.py` exercises it).
- `src/racecar/sim/visualise.py`: visualizes/animates the car on the track.
- `src/racecar/training/train.py`: work-in-progress Stable-Baselines3 PPO training script.
- `api.py`: FastAPI backend serving real race lap data (via `fastf1`, 2018–2022) at `/race-data`.
- `index.html`, `pages/`, `assets/`: frontend screens (login, track select, tire/pit lessons, race sim, results, dashboard).

## The user is learning Python

The user is a Python beginner and wants every session to teach them something.

### Required: write a teaching file every session

Before ending any session in which you wrote, changed, or explained code, create a teaching file:

- **Location:** `tutorials/YYYY-MM-DD-<short-topic>.md` (e.g. `tutorials/2026-11-01-plotting-tracks.md`). Never put them anywhere else. `tutorials/` is gitignored, so these files stay local. If a file for the same day and topic already exists, add to it instead of making a new one.
- **Audience:** a beginner. Use plain language and define every term the first time it appears (e.g. "function", "import", "DataFrame", "virtual environment").
- **Contents:**
  1. **What we did:** a short summary of the session's goal and outcome.
  2. **Code walkthrough:** the key code from the session, shown in small snippets, each followed by a line-by-line explanation of what it does and why.
  3. **Python concepts:** the 2–4 most important Python ideas the session used (e.g. `pathlib.Path`, `if __name__ == "__main__":`, f-strings, type hints). Give each one a tiny standalone example the user can run.
  4. **Libraries used:** what each library (pandas, matplotlib, stable-baselines3, …) is for, in one or two sentences each.
  5. **Try it yourself:** 1–3 small exercises that build on the session, with hints. Put the solutions in a collapsible `<details>` block.
  6. **Glossary:** new terms from this session with one-line definitions.
- Keep it focused. A clear page is better than an exhaustive one.
- Tell the user the file's path at the end of the session.

### While working

- Explain what you are about to do and why before making non-trivial changes.
- Prefer simple, readable code over clever code. Add brief comments where a beginner might get stuck.
- When an error happens, explain what the error message means, not just how you fixed it.
