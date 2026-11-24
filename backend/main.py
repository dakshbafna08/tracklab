import os
import json
import fastf1
from typing import List
from dotenv import load_dotenv
from supabase import create_client
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

os.makedirs("/tmp/fastf1_cache", exist_ok=True)
fastf1.Cache.enable_cache("/tmp/fastf1_cache")

app = FastAPI()

# Lets the frontend (running on a different address) call this API
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

COLUMNS = ["Driver", "LapNumber", "LapTime", "Compound", "TyreLife",
           "FreshTyre", "Stint", "PitInTime", "PitOutTime"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_strategy(strategy_id):
    """Read a saved strategy with its pit stops, track, and the track's tyre data."""
    result = (supabase.table("strategies")
              .select("*, pit_stops(*), tracks(*, tyre_degradation(*))")
              .eq("id", strategy_id)
              .execute())
    if not result.data:
        raise HTTPException(status_code=404, detail="Strategy not found")

    strategy = result.data[0]
    strategy["pit_stops"].sort(key=lambda stop: stop["stop_number"])
    return strategy


def load_track(track_id):
    """Read one track with its tyre data."""
    result = (supabase.table("tracks")
              .select("*, tyre_degradation(*)")
              .eq("id", track_id)
              .execute())
    if not result.data:
        raise HTTPException(status_code=404, detail="Track not found")
    return result.data[0]


def simulate_race(track, starting_compound, pit_stops):
    """
    Play out the race lap by lap.
    lap time = base + wear * tyre age + fuel effect * lap number,
    plus the track's pit loss for each stop.
    Returns the total time and the details of every lap.
    """
    total_laps = track["total_laps"]
    pit_loss = float(track["pit_loss_seconds"])
    fuel_effect = float(track["fuel_effect_per_lap"] or 0)

    tyres = {t["compound"]: t for t in track["tyre_degradation"]}
    pit_laps = {stop["lap"]: stop["new_compound"] for stop in pit_stops}

    compound = starting_compound
    tyre_age = 0
    total_time = 0.0
    out_lap = False
    laps = []

    for lap in range(1, total_laps + 1):
        tyre_age += 1
        if compound not in tyres:
            raise KeyError(compound)
        tyre = tyres[compound]

        wear_loss = float(tyre["seconds_lost_per_lap"]) * tyre_age
        fuel = fuel_effect * lap
        lap_time = float(tyre["base_lap_seconds"]) + wear_loss + fuel
        total_time += lap_time

        laps.append({
            "lap": lap,
            "time": round(lap_time, 3),
            "compound": compound,
            "tireAge": tyre_age,
            # Rough "tyre life left" for the display: drops as wear adds up
            "wearPct": max(5, min(100, round(100 - wear_loss * 25))),
            "fuelSaving": round(-fuel, 3),
            "event": "PIT" if out_lap else None,
            "cumTime": None,  # filled in below
        })

        out_lap = False
        if lap in pit_laps:  # pit at the end of this lap
            total_time += pit_loss
            compound = pit_laps[lap]
            tyre_age = 0
            out_lap = True

        laps[-1]["cumTime"] = round(total_time, 3)

    return round(total_time, 3), laps


def run_simulation(track, starting_compound, pit_stops):
    try:
        return simulate_race(track, starting_compound, pit_stops)
    except KeyError as missing:
        raise HTTPException(status_code=400,
                            detail=f"No tyre data for {missing} at this track")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    """Lets the frontend check the backend is online."""
    return {"ok": True}


@app.post("/simulate/{strategy_id}")
def simulate(strategy_id: str):
    """Simulate a saved strategy and save the result (logged-in users)."""
    strategy = load_strategy(strategy_id)
    total_time, laps = run_simulation(strategy["tracks"],
                                      strategy["starting_compound"],
                                      strategy["pit_stops"])

    # Also save the optimal time, so the dashboard can show the gap later
    try:
        optimal_time = find_optimal(strategy["tracks"])["total_time_seconds"]
    except HTTPException:
        optimal_time = None

    supabase.table("simulation_results").insert({
        "strategy_id": strategy_id,
        "total_time_seconds": total_time,
        "optimal_time_seconds": optimal_time,
    }).execute()

    return {
        "strategy": strategy["name"],
        "track": strategy["tracks"]["name"],
        "total_time_seconds": total_time,
        "lap_times": [l["time"] for l in laps],
        "laps": laps,
    }


class PitStopIn(BaseModel):
    lap: int
    new_compound: str


class StrategyPreview(BaseModel):
    track_id: str
    starting_compound: str
    pit_stops: List[PitStopIn]


@app.post("/simulate-preview")
def simulate_preview(body: StrategyPreview):
    """Simulate a strategy without saving anything (guests who aren't logged in)."""
    track = load_track(body.track_id)
    pit_stops = [stop.dict() for stop in body.pit_stops]
    total_time, laps = run_simulation(track, body.starting_compound.upper(), pit_stops)

    return {
        "track": track["name"],
        "total_time_seconds": total_time,
        "lap_times": [l["time"] for l in laps],
        "laps": laps,
    }


DRY_COMPOUNDS = ["SOFT", "MEDIUM", "HARD"]


@app.get("/optimal/{track_id}")
def optimal(track_id: str):
    """Fastest one-stop strategy for a track."""
    track = load_track(track_id)
    return {"track": track["name"], **find_optimal(track)}


def find_optimal(track):
    """
    Find the fastest one-stop strategy by trying every option:
    every pair of different dry tyres x every pit lap. Same formula as /simulate.
    """
    available = [t["compound"] for t in track["tyre_degradation"]
                 if t["compound"] in DRY_COMPOUNDS]

    best = None
    for stint1 in available:
        for stint2 in available:
            if stint1 == stint2:  # F1 rules: you must use two different dry tyres
                continue
            for pit_lap in range(1, track["total_laps"]):
                total_time, laps = simulate_race(
                    track, stint1, [{"lap": pit_lap, "new_compound": stint2}])
                if best is None or total_time < best["total_time_seconds"]:
                    best = {
                        "strategy": {"stint1": stint1, "stint2": stint2, "pitLap": pit_lap},
                        "total_time_seconds": total_time,
                        "laps": laps,
                    }

    if best is None:
        raise HTTPException(status_code=400,
                            detail="Need at least two dry tyre types to find an optimal strategy")
    return best


@app.get("/race-data")  # can be used to show what happened in the real race
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
