"""Download Formula 1 data from the OpenF1 API as pandas DataFrames.

OpenF1 covers 2023 onwards. Every session (a race, a qualifying, ...) has a
number called its session_key. Use find_race() to look one up.
"""

import time

import pandas as pd
import requests

BASE_URL = "https://api.openf1.org/v1"
MAX_TRIES = 4


def _get(endpoint, **params):
    """Ask OpenF1 for one endpoint and return the rows as a DataFrame."""
    url = f"{BASE_URL}/{endpoint}"

    # None means "don't filter by this", so leave those out of the request
    params = {name: value for name, value in params.items() if value is not None}

    for attempt in range(MAX_TRIES):
        response = requests.get(url, params=params, timeout=30)
        if response.status_code != 429:  # 429 = "too many requests, slow down"
            break
        if attempt < MAX_TRIES - 1:
            time.sleep(2 ** attempt)  # wait 1, 2, then 4 seconds

    # OpenF1 answers 404 when no rows match. That isn't a crash, just no data.
    if response.status_code == 404:
        return pd.DataFrame()

    response.raise_for_status()  # any other error stops the program here
    return pd.DataFrame(response.json())


def _parse_dates(df, *columns):
    """Turn text columns into real dates, skipping columns that aren't there."""
    for column in columns:
        if column in df.columns:
            # ISO8601 copes with times both with and without decimals
            df[column] = pd.to_datetime(df[column], format="ISO8601", utc=True)
    return df


def get_sessions(year, country_name=None, session_name=None):
    """List sessions, e.g. get_sessions(2024, session_name="Race")."""
    df = _get("sessions", year=year, country_name=country_name,
              session_name=session_name)
    return _parse_dates(df, "date_start", "date_end")


def find_race(year, circuit):
    """Return the session_key of a Grand Prix, e.g. find_race(2024, "Sakhir")."""
    # Asking by "Race" leaves out sprints, which are named "Sprint"
    races = get_sessions(year, session_name="Race")
    if races.empty:
        raise ValueError(f"OpenF1 has no races for {year}")

    matches = races[races["circuit_short_name"].str.lower() == circuit.lower()]
    if matches.empty:
        names = ", ".join(sorted(races["circuit_short_name"]))
        raise ValueError(f"No race at {circuit!r} in {year}. Choose from: {names}")
    return int(matches["session_key"].iloc[0])


def get_drivers(session_key):
    """One row per driver: number, name, team."""
    return _get("drivers", session_key=session_key)


def get_laps(session_key, driver_number=None):
    """One row per driver per lap: lap time, sector times, is_pit_out_lap."""
    df = _get("laps", session_key=session_key, driver_number=driver_number)
    return _parse_dates(df, "date_start")


def get_stints(session_key, driver_number=None):
    """One row per stint: compound, first and last lap, tyre age at the start."""
    return _get("stints", session_key=session_key, driver_number=driver_number)


def get_pit_stops(session_key, driver_number=None):
    """One row per pit stop: lap number and seconds spent in the pit lane."""
    df = _get("pit", session_key=session_key, driver_number=driver_number)
    return _parse_dates(df, "date")


def get_race_control(session_key):
    """Race control messages: flags, safety cars, and so on."""
    return _parse_dates(_get("race_control", session_key=session_key), "date")


def get_weather(session_key):
    """Air and track temperature, rain and wind, about once a minute."""
    return _parse_dates(_get("weather", session_key=session_key), "date")


def get_car_data(session_key, driver_number, start, end):
    """Speed, throttle, brake, gear and rpm between two times.

    OpenF1 refuses requests for too much telemetry, so ask for about a lap at
    a time. start and end are Timestamps, like those in get_laps()["date_start"].
    """
    # "date>" isn't a legal Python argument name, so pass it through a dict.
    # requests joins name and value with "=", which makes "date>=..."
    time_range = {"date>": start.isoformat(), "date<": end.isoformat()}
    df = _get("car_data", session_key=session_key,
              driver_number=driver_number, **time_range)
    return _parse_dates(df, "date")


# Runs only for `python -m racecar.data.openf1`, not when the file is imported
if __name__ == "__main__":
    key = find_race(2024, "Sakhir")
    print("session_key:", key)

    laps = get_laps(key, driver_number=1)
    print(laps[["lap_number", "lap_duration", "is_pit_out_lap"]].head())
    print(get_stints(key, driver_number=1))
