import fastf1

race = fastf1.get_session(2022, "Bahrain", "R")
race.load()
laps = race.laps
print(laps.columns)

#tyre wear: laptime, compound, tyrelife, freshtyre, stint
#pit stop times: pitintime, pitouttime

cols = ["Driver", "LapTime", "LapNumber", "Compound", "TyreLife", "FreshTyre",
        "Stint", "PitInTime", "PitOutTime"]

print(laps[cols])