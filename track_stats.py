import fastf1

race = fastf1.get_session(2022, "Bahrain", "R")
race.load(laps=True, telemetry=False, weather=False, messages=False)
laps = race.laps.copy()
laps["LapSeconds"] = laps["LapTime"].dt.total_seconds()

clean = laps.pick_wo_box().pick_track_status("1").pick_quicklaps()
typical = clean["LapSeconds"].median()
in_laps = laps[laps["PitInTime"].notna()]
out_laps = laps[laps["PitOutTime"].notna() & (laps["LapNumber"] > 1)]
pit_loss = in_laps["LapSeconds"].median() + out_laps["LapSeconds"].median() - 2 * typical

print("Event name:", race.event["EventName"])
print("Total laps:", int(laps["LapNumber"].max()))
print(f"Pit loss: {pit_loss:.1f} s")