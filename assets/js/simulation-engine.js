/**
 * TrackLab Simulation Engine
 * =============================================================
 * Computes realistic F1 race lap-time models based on:
 *   - Per-track baseline lap times and characteristics
 *   - Tire compound pace deltas (Soft / Medium / Hard)
 *   - Non-linear tire degradation curves with cliff behaviour
 *   - Fuel burn effect (~0.03s per lap as car lightens)
 *   - Pit-stop time loss (track-specific)
 *
 * Public API
 * ----------
 *   TrackLabSim.simulate(strategy)   → { laps[], totalTime, finalGap }
 *   TrackLabSim.optimise(trackKey)   → { strategy, laps[], totalTime }
 *   TrackLabSim.formatTime(seconds)  → "1:23.456"
 */

const TrackLabSim = (() => {

  // ─────────────────────────────────────────────
  // 1. TRACK DATA
  // ─────────────────────────────────────────────
  const TRACKS = {
    'MELBOURNE': {
      name: 'Melbourne — Albert Park',
      laps: 58,
      baseLapTime: 87.5,       // seconds – representative clean-air lap time
      pitLoss: 21.2,           // seconds – pit-entry to pit-exit time cost
      fuelEffect: 0.030,       // s per lap saved as fuel burns (~0.03s / lap)
      tireStress: 'MEDIUM',    // affects degradation multiplier
      degradationMult: 1.0,
    },
    'AUSTIN (COTA)': {
      name: 'Austin — Circuit of the Americas',
      laps: 56,
      baseLapTime: 97.6,
      pitLoss: 20.4,
      fuelEffect: 0.028,
      tireStress: 'HIGH',
      degradationMult: 1.25,   // higher wear due to aggressive kerbs / lateral G
    },
  };

  // ─────────────────────────────────────────────
  // 2. TIRE COMPOUND MODEL
  // ─────────────────────────────────────────────
  /**
   * Per-compound properties:
   *   pace       – seconds added to base lap time (0 = fastest)
   *   optLife    – laps of optimal performance (flat-ish degradation)
   *   cliffStart – lap age at which cliff degradation begins
   *   linearDeg  – seconds/lap added per lap of tyre life (pre-cliff)
   *   cliffDeg   – seconds/lap added per lap after cliff (exponential onset)
   */
  const COMPOUNDS = {
    SOFT: {
      pace: 0.0,
      optLife: 14,
      cliffStart: 18,
      linearDeg: 0.025,   // gentle build-up
      cliffDeg: 0.22,     // drops sharply after cliff
    },
    MEDIUM: {
      pace: 0.45,
      optLife: 22,
      cliffStart: 30,
      linearDeg: 0.012,
      cliffDeg: 0.11,
    },
    HARD: {
      pace: 0.85,
      optLife: 32,
      cliffStart: 45,
      linearDeg: 0.007,
      cliffDeg: 0.065,
    },
  };

  // ─────────────────────────────────────────────
  // 3. CORE LAP-TIME FUNCTION
  // ─────────────────────────────────────────────
  /**
   * Returns the lap time (in seconds) for a single lap.
   *
   * @param {object} track    – from TRACKS
   * @param {string} compound – 'SOFT' | 'MEDIUM' | 'HARD'
   * @param {number} tireAge  – laps on current set (1-indexed, 1 = fresh)
   * @param {number} lapNum   – overall race lap (1-indexed, for fuel burn)
   * @param {boolean} outLap  – whether this is a pit-out lap (slower + cold tires)
   */
  function lapTime(track, compound, tireAge, lapNum, outLap = false) {
    const c = COMPOUNDS[compound];
    const dm = track.degradationMult;

    // Base pace delta from compound
    let time = track.baseLapTime + c.pace;

    // Fuel benefit: car gets lighter each lap
    // Full fuel = ~110 kg, burns ~1.6 kg/lap → ~3.3s advantage across the race
    const fuelSaving = (lapNum - 1) * track.fuelEffect;
    time -= fuelSaving;

    // Tire degradation
    const age = tireAge - 1; // 0-indexed age
    let deg = 0;
    if (age <= c.optLife) {
      // Linear gentle phase
      deg = age * c.linearDeg * dm;
    } else if (age <= c.cliffStart) {
      // Transitional phase – degradation accelerating
      const optDeg = c.optLife * c.linearDeg * dm;
      const extraAge = age - c.optLife;
      const transitionRate = c.linearDeg * dm + (c.cliffDeg - c.linearDeg) * dm * (extraAge / (c.cliffStart - c.optLife));
      deg = optDeg + extraAge * transitionRate;
    } else {
      // Post-cliff – exponential-ish increase
      const cliffDeg = c.cliffStart * c.linearDeg * dm + (c.cliffStart - c.optLife) * c.cliffDeg * dm * 0.5;
      const lapsOverCliff = age - c.cliffStart;
      deg = cliffDeg + lapsOverCliff * c.cliffDeg * dm * (1 + lapsOverCliff * 0.04);
    }

    time += deg;

    // Out-lap penalty: cold tires + careful driving after stop
    if (outLap) {
      time += 2.8 + c.pace * 0.3; // softer tires warm up slightly quicker
    }

    return time;
  }

  // ─────────────────────────────────────────────
  // 4. FULL RACE SIMULATION
  // ─────────────────────────────────────────────
  /**
   * Simulate a complete race for a given strategy.
   *
   * @param {object} strategy
   *   { trackKey, stint1, stint2, pitLap }
   *
   * @returns {object}
   *   {
   *     laps: [ { lap, time, compound, tireAge, cumTime, event } ],
   *     totalTime: number,          // total race time in seconds
   *     stintBreakdown: { s1Laps, s2Laps, pitLoss },
   *     valid: boolean              // false if strategy is physically impossible
   *   }
   */
  function simulate(strategy) {
    const { trackKey, stint1, stint2, pitLap } = strategy;
    const track = TRACKS[trackKey];
    if (!track) return null;

    const totalLaps = track.laps;
    const laps = [];
    let cumTime = 0;
    let tireAge = 1;
    let currentCompound = stint1;

    for (let lap = 1; lap <= totalLaps; lap++) {
      let event = null;
      let isOutLap = false;

      // Pit stop happens at the END of pitLap → next lap is out-lap
      if (lap === pitLap + 1) {
        // Apply pit loss on the lap after the stop (pit-out lap)
        cumTime += track.pitLoss;
        tireAge = 1;
        currentCompound = stint2;
        isOutLap = true;
        event = 'PIT';
      }

      const lt = lapTime(track, currentCompound, tireAge, lap, isOutLap);
      cumTime += lt;
      tireAge++;

      laps.push({
        lap,
        time: lt,
        compound: currentCompound,
        tireAge: tireAge - 1,
        cumTime,
        event,
      });
    }

    return {
      laps,
      totalTime: cumTime,
      stintBreakdown: {
        s1Laps: pitLap,
        s2Laps: totalLaps - pitLap,
        pitLoss: track.pitLoss,
      },
      valid: true,
    };
  }

  // ─────────────────────────────────────────────
  // 5. STRATEGY OPTIMIZER
  // ─────────────────────────────────────────────
  /**
   * Tests every valid pit window for every compound combination
   * and returns the fastest strategy.
   *
   * Constraints:
   *   - Stint 1 and Stint 2 must use different compounds (FIA rule)
   *   - Pit window: laps 5 → (totalLaps - 5)
   *   - Stint 2 must be at least 5 laps
   */
  function optimise(trackKey) {
    const track = TRACKS[trackKey];
    if (!track) return null;

    const compounds = ['SOFT', 'MEDIUM', 'HARD'];
    let best = null;

    for (const s1 of compounds) {
      for (const s2 of compounds) {
        if (s1 === s2) continue; // FIA rule: must use 2 compounds
        for (let pitLap = 5; pitLap <= track.laps - 5; pitLap++) {
          const result = simulate({ trackKey, stint1: s1, stint2: s2, pitLap });
          if (!result) continue;
          if (!best || result.totalTime < best.totalTime) {
            best = {
              ...result,
              strategy: { trackKey, stint1: s1, stint2: s2, pitLap },
            };
          }
        }
      }
    }

    return best;
  }

  // ─────────────────────────────────────────────
  // 6. UTILITY HELPERS
  // ─────────────────────────────────────────────
  function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const rem = totalSeconds % 3600;
    const mins = Math.floor(rem / 60);
    const secs = (rem % 60).toFixed(3).padStart(6, '0');
    if (hours > 0) return `${hours}:${String(mins).padStart(2, '0')}:${secs}`;
    return `${mins}:${secs}`;
  }

  function formatLapTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3).padStart(6, '0');
    return `${mins}:${secs}`;
  }

  function formatGap(diffSeconds) {
    const sign = diffSeconds >= 0 ? '+' : '-';
    return `${sign}${Math.abs(diffSeconds).toFixed(1)}s`;
  }

  function getTrack(key) {
    return TRACKS[key] || null;
  }

  function getCompound(name) {
    return COMPOUNDS[name] || null;
  }

  function listTracks() {
    return Object.keys(TRACKS);
  }

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────
  return {
    simulate,
    optimise,
    formatTime,
    formatLapTime,
    formatGap,
    getTrack,
    getCompound,
    listTracks,
    TRACKS,
    COMPOUNDS,
  };

})();
