import json
import fastf1
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])
os.makedirs("/tmp/fastf1_cache", exist_ok=True)
fastf1.Cache.enable_cache("/tmp/fastf1_cache")

def load_strategy(strategy_id):
    result = (supabase.table("strategies")
              .select("*, pit_stops(*), tracks(*, tyre_degradation(*))")
              .eq("id", strategy_id)
              .execute())
    if not result.data:
        raise HTTPException(status_code=404, detail="Strategy not found")

    strategy = result.data[0]
    strategy["pit_stops"].sort(key=lambda stop: stop["stop_number"])
    return strategy

def simulate_race(strategy):
    track = strategy["tracks"]
    total_laps = track["total_laps"]
    pit_loss = float(track["pit_loss_seconds"])
    fuel_effect = float(track["fuel_effect_per_lap"] or 0)

    tyres = {t["compound"]: t for t in track["tyre_degradation"]}
    pit_laps = {stop["lap"]: stop["new_compound"] for stop in strategy["pit_stops"]}

    compound = strategy["starting_compound"]
    tyre_age = 0
    total_time = 0.0
    lap_times = []

    for lap in range(1, total_laps + 1):
        tyre_age += 1
        tyre = tyres[compound]
        lap_time = (float(tyre["base_lap_seconds"])
                    + float(tyre["seconds_lost_per_lap"]) * tyre_age
                    + fuel_effect * lap)
        lap_times.append(round(lap_time, 3))
        total_time += lap_time

        if lap in pit_laps:            # pit at the end of this lap
            total_time += pit_loss
            compound = pit_laps[lap]
            tyre_age = 0

    return round(total_time, 3), lap_times

@app.post("/simulate/{strategy_id}")
def simulate(strategy_id: str):
    strategy = load_strategy(strategy_id)

    try:
        total_time, lap_times = simulate_race(strategy)
    except KeyError as missing:
        raise HTTPException(status_code=400,
                            detail=f"No tyre data for {missing} at this track")

    supabase.table("simulation_results").insert({
        "strategy_id": strategy_id,
        "total_time_seconds": total_time,
    }).execute()

    return {
        "strategy": strategy["name"],
        "track": strategy["tracks"]["name"],
        "total_time_seconds": total_time,
        "lap_times": lap_times,
    }


# Lets the frontend (running on a different address) call this API
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

COLUMNS = ["Driver", "LapNumber", "LapTime", "Compound", "TyreLife",
           "FreshTyre", "Stint", "PitInTime", "PitOutTime"]


@app.get("/race-data") #can be used to show what happened in the real race
def race_data(year: int, event: str):
    try:
        race = fastf1.get_session(year, event, "R")
        race.load(laps=True, telemetry=False, weather=False, messages=False)
        laps = race.laps[COLUMNS].copy()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not load {year} {event}: {e}")

    # JSON can't store pandas time values, so convert them to seconds
    for col in ["LapTime", "PitInTime", "PitOutTime"]:
        laps[col] = laps[col].dt.total_seconds()

    records = json.loads(laps.to_json(orient="records"))
    return {"year": year, "event": race.event["EventName"], "laps": records}