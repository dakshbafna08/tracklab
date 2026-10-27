import json
import fastf1
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Lets the frontend (running on a different address) call this API
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

COLUMNS = ["Driver", "LapNumber", "LapTime", "Compound", "TyreLife",
           "FreshTyre", "Stint", "PitInTime", "PitOutTime"]

@app.get("/race-data")
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