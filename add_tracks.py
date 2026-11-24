import os
import numpy as np
import fastf1
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

YEAR = 2022
COMPOUNDS = ["SOFT", "MEDIUM", "HARD"]

# (name shown in the app, FastF1 event name, TUM track shape file)
RACES = [
    ("Bahrain",     "Bahrain Grand Prix",       "data/tracks/Sakhir.csv"),
    ("Melbourne",   "Australian Grand Prix",    "data/tracks/Melbourne.csv"),
    ("Barcelona",   "Spanish Grand Prix",       "data/tracks/Catalunya.csv"),
    ("Montreal",    "Canadian Grand Prix",      "data/tracks/Montreal.csv"),
    ("Silverstone", "British Grand Prix",       "data/tracks/Silverstone.csv"),
    ("Spielberg",   "Austrian Grand Prix",      "data/tracks/Spielberg.csv"),
    ("Budapest",    "Hungarian Grand Prix",     "data/tracks/Budapest.csv"),
    ("Spa",         "Belgian Grand Prix",       "data/tracks/Spa.csv"),
    ("Zandvoort",   "Dutch Grand Prix",         "data/tracks/Zandvoort.csv"),
    ("Monza",       "Italian Grand Prix",       "data/tracks/Monza.csv"),
    ("Suzuka",      "Japanese Grand Prix",      "data/tracks/Suzuka.csv"),
    ("Austin",      "United States Grand Prix", "data/tracks/Austin.csv"),
    ("Mexico City", "Mexico City Grand Prix",   "data/tracks/MexicoCity.csv"),
    ("Sao Paulo",   "São Paulo Grand Prix",     "data/tracks/SaoPaulo.csv"),
    ("Abu Dhabi",   "Abu Dhabi Grand Prix",     "data/tracks/YasMarina.csv"),
]

for name, event, centerline in RACES:
    if not os.path.exists(centerline):
        print(f"Skipping {name}: track file {centerline} not found")
        continue

    try:
        race = fastf1.get_session(YEAR, event, "R")
        race.load(laps=True, telemetry=False, weather=False, messages=False)
    except Exception as e:
        print(f"Skipping {name}: could not load race ({e})")
        continue

    laps = race.laps.copy()
    laps["LapSeconds"] = laps["LapTime"].dt.total_seconds()
    clean = laps.pick_wo_box().pick_track_status("1").pick_quicklaps()
    clean = clean.dropna(subset=["TyreLife", "LapSeconds"])

    # Pit loss: in-lap + out-lap, minus two normal laps
    typical = clean["LapSeconds"].median()
    green = laps["TrackStatus"] == "1"
    in_laps = laps[laps["PitInTime"].notna() & green]
    out_laps = laps[laps["PitOutTime"].notna() & (laps["LapNumber"] > 1) & green]
    if in_laps.empty or out_laps.empty:
        in_laps = laps[laps["PitInTime"].notna()]
        out_laps = laps[laps["PitOutTime"].notna() & (laps["LapNumber"] > 1)]
    pit_loss = in_laps["LapSeconds"].median() + out_laps["LapSeconds"].median() - 2 * typical

    # Tyre wear per compound + one shared fuel effect (least squares)
    used = [c for c in COMPOUNDS if (clean["Compound"] == c).sum() >= 20]
    if not used:
        print(f"Skipping {name}: not enough dry-tyre laps")
        continue
    clean = clean[clean["Compound"].isin(used)]
    columns = []
    for c in used:
        is_c = (clean["Compound"] == c).astype(float)
        columns += [is_c, is_c * clean["TyreLife"]]
    columns.append(clean["LapNumber"].astype(float))
    coef, *_ = np.linalg.lstsq(np.column_stack(columns), clean["LapSeconds"].to_numpy(), rcond=None)

    total_laps = int(laps["LapNumber"].max())
    fuel = round(float(coef[-1]), 3)

    # Save the track (updates it if it already exists)
    track = supabase.table("tracks").upsert({
        "name": name,
        "fastf1_event": race.event["EventName"],
        "total_laps": total_laps,
        "pit_loss_seconds": round(float(pit_loss), 1),
        "fuel_effect_per_lap": fuel,
        "centerline_file": centerline,
    }, on_conflict="name").execute().data[0]

    # Save its tyre rows
    wear_summary = []
    for i, c in enumerate(used):
        base, wear = round(float(coef[2 * i]), 3), max(round(float(coef[2 * i + 1]), 3), 0.0)
        supabase.table("tyre_degradation").upsert({
            "track_id": track["id"],
            "compound": c,
            "base_lap_seconds": base,
            "seconds_lost_per_lap": wear,
        }, on_conflict="track_id,compound").execute()
        wear_summary.append(f"{c} {wear:+.3f}")

    print(f"Saved {name}: {total_laps} laps, pit loss {pit_loss:.1f}s, fuel {fuel:+.3f}, wear: {', '.join(wear_summary)}")