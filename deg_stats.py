import numpy as np
import fastf1

race = fastf1.get_session(2022, "Bahrain Grand Prix", "R")
race.load(laps=True, telemetry=False, weather=False, messages=False)
laps = race.laps.copy()
laps["LapSeconds"] = laps["LapTime"].dt.total_seconds()

clean = laps.pick_wo_box().pick_track_status("1").pick_quicklaps()

compounds = ["SOFT", "MEDIUM", "HARD"]
clean = clean[clean["Compound"].isin(compounds)].dropna(subset=["TyreLife", "LapSeconds"])

columns = []
for c in compounds:
    is_c = (clean["Compound"] == c).astype(float)
    columns.append(is_c)                          # base time for this compound
    columns.append(is_c * clean["TyreLife"])      # wear rate for this compound
columns.append(clean["LapNumber"].astype(float))  # fuel effect, shared by all

X = np.column_stack(columns)
y = clean["LapSeconds"].to_numpy()
coef, *_ = np.linalg.lstsq(X, y, rcond=None)

for i, c in enumerate(compounds):
    print(f"{c}: base_lap_seconds = {coef[2*i]:.3f}, seconds_lost_per_lap = {coef[2*i+1]:.3f}")
print(f"fuel_effect_per_lap = {coef[-1]:.3f}")