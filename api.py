import hashlib
import json
import os
import secrets
import sqlite3
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    import fastf1
    HAS_FASTF1 = True
except ImportError:
    fastf1 = None
    HAS_FASTF1 = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "tracklab.db")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://ejbrepdwafsjxyhoufut.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "sb_publishable_g-qWZ-McCCBXz-l7lcEVkQ_xOezN_Jw")

app = FastAPI(
    title="TrackLab Telemetry & Strategy API",
    description="F1 Race Strategy Simulation API with SQLite persistence and FastF1 historical telemetry support.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/supabase-config")
def get_supabase_config():
    return {
        "url": SUPABASE_URL,
        "key": SUPABASE_KEY,
        "configured": True,
    }


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            preferred_mode TEXT DEFAULT 'guided',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_strategy_state (
            username TEXT PRIMARY KEY COLLATE NOCASE,
            track TEXT NOT NULL DEFAULT 'NORISRING',
            total_laps INTEGER NOT NULL DEFAULT 72,
            stint1 TEXT NOT NULL DEFAULT 'SOFT',
            stint2 TEXT NOT NULL DEFAULT 'HARD',
            pit_lap INTEGER NOT NULL DEFAULT 28,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (username) REFERENCES users(username)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS race_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL COLLATE NOCASE,
            track TEXT NOT NULL,
            track_name TEXT NOT NULL,
            stint1 TEXT NOT NULL,
            stint2 TEXT NOT NULL,
            pit_lap INTEGER NOT NULL,
            total_time REAL NOT NULL,
            optimal_time REAL NOT NULL,
            optimal_stint1 TEXT NOT NULL DEFAULT 'MEDIUM',
            optimal_stint2 TEXT NOT NULL DEFAULT 'HARD',
            optimal_pit_lap INTEGER NOT NULL DEFAULT 22,
            gap REAL NOT NULL,
            data_source TEXT NOT NULL DEFAULT 'MODELED_PHYSICS',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (username) REFERENCES users(username)
        )
        """
    )
    conn.commit()
    conn.close()


init_db()


def hash_password(password: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    if "$" not in stored_hash:
        return False
    salt, _ = stored_hash.split("$", 1)
    return secrets.compare_digest(hash_password(password, salt), stored_hash)


class AuthRequest(BaseModel):
    username: str
    password: str
    preferred_mode: Optional[str] = "guided"


class StrategyStateRequest(BaseModel):
    username: str
    track: str = "NORISRING"
    total_laps: int = 72
    stint1: str = "SOFT"
    stint2: str = "HARD"
    pit_lap: int = 28
    preferred_mode: Optional[str] = None


class SaveRaceRequest(BaseModel):
    username: str
    track: str
    track_name: str
    stint1: str
    stint2: str
    pit_lap: int
    total_time: float
    optimal_time: float
    optimal_stint1: str = "MEDIUM"
    optimal_stint2: str = "HARD"
    optimal_pit_lap: int = 22
    gap: float
    data_source: str = "MODELED_PHYSICS"


@app.get("/health")
def health():
    return {
        "status": "online",
        "database": "sqlite_connected",
        "db_path": os.path.basename(DB_PATH),
        "fastf1_available": HAS_FASTF1,
    }


@app.get("/circuits")
@app.get("/api/circuits")
def get_circuits():
    return {
        "circuits": [
            {
                "id": "NORISRING",
                "name": "Norisring — Nuremberg Street Circuit",
                "short_name": "Norisring",
                "country": "Germany",
                "laps": 72,
                "length_km": 2.300,
                "pit_loss": 18.4,
                "tire_stress": "LOW"
            }
        ]
    }


@app.post("/api/register")
@app.post("/register")
def register(payload: AuthRequest):
    username = payload.username.strip()
    if len(username) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters.")
    if len(payload.password) < 3:
        raise HTTPException(status_code=400, detail="Password must be at least 3 characters.")

    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Driver callsign already registered.")

        pw_hash = hash_password(payload.password)
        mode = payload.preferred_mode if payload.preferred_mode in ("guided", "pro") else "guided"
        conn.execute(
            "INSERT INTO users (username, password_hash, preferred_mode) VALUES (?, ?, ?)",
            (username, pw_hash, mode),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO user_strategy_state (username, track, total_laps, stint1, stint2, pit_lap)
            VALUES (?, 'NORISRING', 72, 'SOFT', 'HARD', 28)
            """,
            (username,),
        )
        conn.commit()

        state_row = conn.execute(
            "SELECT track, total_laps, stint1, stint2, pit_lap FROM user_strategy_state WHERE username = ?",
            (username,),
        ).fetchone()
        return {
            "success": True,
            "username": username,
            "preferred_mode": mode,
            "state": dict(state_row) if state_row else None,
        }
    finally:
        conn.close()


@app.post("/api/login")
@app.post("/login")
def login(payload: AuthRequest):
    username = payload.username.strip()
    if not username or not payload.password:
        raise HTTPException(status_code=400, detail="Username and password are required.")

    conn = get_db()
    try:
        user = conn.execute(
            "SELECT username, password_hash, preferred_mode FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if not user or not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid driver credentials.")

        state_row = conn.execute(
            "SELECT track, total_laps, stint1, stint2, pit_lap FROM user_strategy_state WHERE username = ?",
            (user["username"],),
        ).fetchone()

        return {
            "success": True,
            "username": user["username"],
            "preferred_mode": user["preferred_mode"],
            "state": dict(state_row) if state_row else None,
        }
    finally:
        conn.close()


@app.get("/api/state")
def get_user_state(username: str = Query(..., min_length=1)):
    conn = get_db()
    try:
        user = conn.execute(
            "SELECT username, preferred_mode FROM users WHERE username = ?", (username.strip(),)
        ).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        row = conn.execute(
            "SELECT track, total_laps, stint1, stint2, pit_lap, updated_at FROM user_strategy_state WHERE username = ?",
            (user["username"],),
        ).fetchone()
        return {
            "username": user["username"],
            "preferred_mode": user["preferred_mode"],
            "state": dict(row) if row else None,
        }
    finally:
        conn.close()


@app.post("/api/state")
def save_user_state(payload: StrategyStateRequest):
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username required.")

    conn = get_db()
    try:
        user = conn.execute(
            "SELECT username FROM users WHERE username = ?", (username,)
        ).fetchone()
        if not user:
            # Auto-provision guest/offline callsign state record cleanly if user registered locally
            conn.execute(
                "INSERT INTO users (username, password_hash, preferred_mode) VALUES (?, ?, ?)",
                (username, hash_password(secrets.token_hex(8)), payload.preferred_mode or "guided"),
            )

        if payload.preferred_mode in ("guided", "pro"):
            conn.execute(
                "UPDATE users SET preferred_mode = ? WHERE username = ?",
                (payload.preferred_mode, username),
            )

        conn.execute(
            """
            INSERT INTO user_strategy_state (username, track, total_laps, stint1, stint2, pit_lap, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(username) DO UPDATE SET
                track = excluded.track,
                total_laps = excluded.total_laps,
                stint1 = excluded.stint1,
                stint2 = excluded.stint2,
                pit_lap = excluded.pit_lap,
                updated_at = CURRENT_TIMESTAMP
            """,
            (username, payload.track, payload.total_laps, payload.stint1, payload.stint2, payload.pit_lap),
        )
        conn.commit()
        return {"success": True}
    finally:
        conn.close()


@app.post("/api/races")
@app.post("/save-race")
def save_race(payload: SaveRaceRequest):
    username = payload.username.strip() or "Driver"
    conn = get_db()
    try:
        user = conn.execute("SELECT username FROM users WHERE username = ?", (username,)).fetchone()
        if not user:
            conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, hash_password(secrets.token_hex(8))),
            )

        cur = conn.execute(
            """
            INSERT INTO race_history (
                username, track, track_name, stint1, stint2, pit_lap,
                total_time, optimal_time, optimal_stint1, optimal_stint2,
                optimal_pit_lap, gap, data_source
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                username,
                payload.track,
                payload.track_name,
                payload.stint1,
                payload.stint2,
                payload.pit_lap,
                payload.total_time,
                payload.optimal_time,
                payload.optimal_stint1,
                payload.optimal_stint2,
                payload.optimal_pit_lap,
                payload.gap,
                payload.data_source,
            ),
        )
        conn.commit()
        return {"success": True, "id": cur.lastrowid}
    finally:
        conn.close()


@app.get("/api/races")
@app.get("/race-history")
def get_race_history(username: Optional[str] = None):
    conn = get_db()
    try:
        if username and username.strip():
            rows = conn.execute(
                """
                SELECT id, username, track, track_name, stint1, stint2, pit_lap,
                       total_time, optimal_time, optimal_stint1, optimal_stint2,
                       optimal_pit_lap, gap, data_source, created_at
                FROM race_history
                WHERE username = ?
                ORDER BY id DESC
                """,
                (username.strip(),),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, username, track, track_name, stint1, stint2, pit_lap,
                       total_time, optimal_time, optimal_stint1, optimal_stint2,
                       optimal_pit_lap, gap, data_source, created_at
                FROM race_history
                ORDER BY id DESC
                LIMIT 50
                """
            ).fetchall()
        return {"races": [dict(r) for r in rows]}
    finally:
        conn.close()


@app.delete("/api/races/{race_id}")
def delete_race(race_id: int):
    conn = get_db()
    try:
        cur = conn.execute("DELETE FROM race_history WHERE id = ?", (race_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Race entry not found.")
        return {"success": True}
    finally:
        conn.close()


COLUMNS = [
    "Driver", "LapNumber", "LapTime", "Compound", "TyreLife",
    "FreshTyre", "Stint", "PitInTime", "PitOutTime",
]


@app.get("/race-data")
def race_data(year: int = Query(..., ge=2018, le=2023), event: str = Query(...)):
    if not HAS_FASTF1:
        raise HTTPException(
            status_code=503,
            detail="FastF1 package is not installed in this Python environment. Using calibrated empirical physics fallback on client.",
        )
    try:
        race = fastf1.get_session(year, event, "R")
        race.load(laps=True, telemetry=False, weather=True, messages=False)
        laps = race.laps[COLUMNS].copy()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not load FastF1 session {year} {event}: {e}")

    for col in ["LapTime", "PitInTime", "PitOutTime"]:
        if col in laps.columns:
            laps[col] = laps[col].dt.total_seconds()

    weather_summary = None
    try:
        if race.weather_data is not None and not race.weather_data.empty:
            weather_summary = {
                "air_temp_c": round(float(race.weather_data["AirTemp"].mean()), 1),
                "track_temp_c": round(float(race.weather_data["TrackTemp"].mean()), 1),
                "humidity_pct": round(float(race.weather_data["Humidity"].mean()), 1),
                "rainfall": bool(race.weather_data["Rainfall"].any()),
            }
    except Exception:
        weather_summary = None

    # Compute compound summary benchmarks from genuine historical laps
    compound_medians = {}
    try:
        clean_laps = laps.dropna(subset=["LapTime", "Compound"])
        for comp in ["SOFT", "MEDIUM", "HARD"]:
            sub = clean_laps[clean_laps["Compound"] == comp]["LapTime"]
            if not sub.empty:
                compound_medians[comp] = round(float(sub.median()), 3)
    except Exception:
        compound_medians = {}

    records = json.loads(laps.to_json(orient="records"))
    return {
        "source": "FASTF1_HISTORICAL",
        "year": year,
        "event": race.event["EventName"],
        "weather": weather_summary,
        "compound_medians": compound_medians,
        "laps": records,
    }


# Serve frontend directly when running uvicorn api:app
app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="static")
