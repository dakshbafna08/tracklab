/**
 * TrackLab Telemetry & Race Strategy Simulation Engine v2.0
 * =========================================================================
 * Computes realistic Formula 1 race lap-time profiles incorporating:
 *   1. Circuit-calibrated base lap pace, pit-lane transit delta, & corner stress
 *   2. Pirelli compound pace offsets & multi-phase thermal degradation cliffs
 *   3. Dynamic fuel mass dissipation (~1.75 kg/lap → ~0.03s/lap weight gain)
 *   4. Out-lap cold-tire warm-up penalty
 *   5. Optional live FastF1 session calibration via backend /race-data API
 *
 * Telemetry Provenance Policy:
 *   Explicitly distinguishes FASTF1_HISTORICAL data (when retrieved live from
 *   the FastF1 Python backend) vs MODELED_ESTIMATE (empirical calibration).
 */

const TrackLabSim = (() => {

  const API_BASE = 'http://localhost:8000';

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CALIBRATED CIRCUIT DATABASE (9 World Championship Venues)
  // ─────────────────────────────────────────────────────────────────────────
  const TRACKS = {
    'NORISRING': {
      id: 'NORISRING',
      name: 'Norisring — Nuremberg Street Circuit',
      shortName: 'Norisring',
      country: 'Germany',
      location: 'Nuremberg, Bavaria',
      laps: 72,
      lengthKm: 2.300,
      baseLapTime: 48.20,
      pitLoss: 18.4,
      fuelEffect: 0.018,
      tireStress: 'LOW',
      degradationMult: 0.82,
      corners: 8,
      drsZones: 1,
      topSpeedKmh: 285,
      fastf1Event: { year: 2022, event: 'Germany' },
      characteristics: 'Historic Bavarian street circuit with the extreme Grundig hairpin, Dutzendteich straight, and bumpy braking zones.',
      svgPath: 'M 80 150 L 380 150 C 430 150, 440 120, 410 100 L 370 75 C 340 55, 300 70, 270 85 L 120 85 C 80 85, 60 110, 80 150 Z'
    },
    'MELBOURNE': {
      id: 'MELBOURNE',
      name: 'Melbourne — Albert Park',
      shortName: 'Albert Park',
      country: 'Australia',
      location: 'Melbourne, VIC',
      laps: 58,
      lengthKm: 5.278,
      baseLapTime: 82.40,
      pitLoss: 21.2,
      fuelEffect: 0.032,
      tireStress: 'MEDIUM',
      degradationMult: 1.00,
      corners: 14,
      drsZones: 4,
      topSpeedKmh: 328,
      fastf1Event: { year: 2022, event: 'Melbourne' },
      characteristics: 'Fast street-parkland hybrid with sweeping medium-speed chicanes and 4 DRS zones.',
      svgPath: 'M 70 155 C 55 155, 45 140, 60 120 L 115 95 C 145 80, 175 95, 200 105 L 285 95 C 325 85, 365 50, 410 55 C 445 60, 455 95, 435 125 L 385 150 C 350 165, 315 145, 285 155 L 180 170 C 135 175, 100 155, 70 155 Z'
    },
    'AUSTIN (COTA)': {
      id: 'AUSTIN (COTA)',
      name: 'Austin — Circuit of the Americas',
      shortName: 'COTA Austin',
      country: 'United States',
      location: 'Austin, TX',
      laps: 56,
      lengthKm: 5.513,
      baseLapTime: 97.60,
      pitLoss: 20.4,
      fuelEffect: 0.030,
      tireStress: 'HIGH',
      degradationMult: 1.25,
      corners: 20,
      drsZones: 2,
      topSpeedKmh: 332,
      fastf1Event: { year: 2022, event: 'Austin' },
      characteristics: 'Steep Turn 1 climb, flowing Maggotts-style S-curves, heavy braking, and abrasive Texas tarmac.',
      svgPath: 'M 60 165 L 95 65 C 102 48, 125 52, 132 70 L 145 110 C 152 125, 175 115, 185 95 C 195 75, 215 80, 225 100 L 250 130 L 385 125 C 415 125, 435 105, 430 85 C 425 65, 395 65, 385 88 L 365 135 C 355 162, 315 175, 270 168 L 120 172 C 85 174, 55 175, 60 165 Z'
    },
    'SILVERSTONE': {
      id: 'SILVERSTONE',
      name: 'Silverstone — Grand Prix Circuit',
      shortName: 'Silverstone',
      country: 'Great Britain',
      location: 'Towcester, UK',
      laps: 52,
      lengthKm: 5.891,
      baseLapTime: 88.20,
      pitLoss: 22.8,
      fuelEffect: 0.034,
      tireStress: 'VERY HIGH',
      degradationMult: 1.32,
      corners: 18,
      drsZones: 2,
      topSpeedKmh: 334,
      fastf1Event: { year: 2022, event: 'Silverstone' },
      characteristics: 'Relentless high-speed lateral G-loads through Copse, Maggotts, Becketts, and Stowe.',
      svgPath: 'M 80 140 L 145 140 L 165 95 C 180 65, 220 55, 260 60 L 340 55 C 385 52, 425 75, 420 110 C 415 140, 380 155, 345 148 L 305 125 C 280 112, 255 128, 240 150 L 195 172 C 150 180, 95 168, 80 140 Z'
    },
    'SPA': {
      id: 'SPA',
      name: 'Spa-Francorchamps',
      shortName: 'Spa',
      country: 'Belgium',
      location: 'Stavelot, Belgium',
      laps: 44,
      lengthKm: 7.004,
      baseLapTime: 106.50,
      pitLoss: 23.5,
      fuelEffect: 0.038,
      tireStress: 'MEDIUM-HIGH',
      degradationMult: 1.12,
      corners: 19,
      drsZones: 2,
      topSpeedKmh: 344,
      fastf1Event: { year: 2022, event: 'Spa-Francorchamps' },
      characteristics: 'Longest lap on the calendar through Eau Rouge/Raidillon compression and high-speed Pouhon.',
      svgPath: 'M 65 155 L 110 170 C 135 175, 145 145, 130 120 L 115 80 C 110 55, 140 40, 175 48 L 355 70 C 405 78, 435 105, 425 135 C 415 165, 370 170, 335 150 L 275 115 C 250 102, 225 118, 200 135 L 125 150 L 65 155 Z'
    },
    'MONZA': {
      id: 'MONZA',
      name: 'Monza — Temple of Speed',
      shortName: 'Monza',
      country: 'Italy',
      location: 'Monza, Italy',
      laps: 53,
      lengthKm: 5.793,
      baseLapTime: 81.80,
      pitLoss: 24.1,
      fuelEffect: 0.029,
      tireStress: 'LOW',
      degradationMult: 0.85,
      corners: 11,
      drsZones: 2,
      topSpeedKmh: 356,
      fastf1Event: { year: 2022, event: 'Monza' },
      characteristics: 'Minimal downforce, 78% full throttle, extreme braking into chicanes, long pit lane loss.',
      svgPath: 'M 75 150 L 295 150 C 335 150, 355 135, 365 110 L 385 65 C 395 45, 425 50, 425 75 C 425 115, 395 155, 335 165 L 145 165 C 105 165, 75 160, 75 150 Z M 75 150 C 55 150, 50 125, 70 112 L 155 85 C 195 75, 240 95, 295 150'
    },
    'MONACO': {
      id: 'MONACO',
      name: 'Circuit de Monaco',
      shortName: 'Monaco',
      country: 'Monaco',
      location: 'Monte Carlo',
      laps: 78,
      lengthKm: 3.337,
      baseLapTime: 74.20,
      pitLoss: 19.5,
      fuelEffect: 0.024,
      tireStress: 'VERY LOW',
      degradationMult: 0.70,
      corners: 19,
      drsZones: 1,
      topSpeedKmh: 290,
      fastf1Event: { year: 2022, event: 'Monaco' },
      characteristics: 'Tight barrier-lined street circuit where track position rules and tire wear is minimal.',
      svgPath: 'M 75 145 L 185 115 C 215 105, 240 65, 285 60 L 375 60 C 415 60, 435 88, 415 115 L 365 140 C 330 155, 285 135, 245 150 L 145 170 C 105 175, 65 162, 75 145 Z'
    },
    'SUZUKA': {
      id: 'SUZUKA',
      name: 'Suzuka International Racing Course',
      shortName: 'Suzuka',
      country: 'Japan',
      location: 'Mie Prefecture',
      laps: 53,
      lengthKm: 5.807,
      baseLapTime: 90.80,
      pitLoss: 22.4,
      fuelEffect: 0.033,
      tireStress: 'VERY HIGH',
      degradationMult: 1.35,
      corners: 18,
      drsZones: 1,
      topSpeedKmh: 330,
      fastf1Event: { year: 2022, event: 'Japan' },
      characteristics: 'Legendary figure-eight layout with relentless high-speed Esses, Degner curves, and 130R.',
      svgPath: 'M 90 160 L 160 160 C 200 160, 220 130, 200 100 L 170 65 C 150 45, 180 35, 210 50 L 290 90 C 330 110, 370 80, 390 50 C 420 30, 440 60, 420 95 L 360 150 C 320 175, 250 170, 200 135 L 140 100 C 110 80, 80 110, 90 160 Z'
    },
    'INTERLAGOS': {
      id: 'INTERLAGOS',
      name: 'Autódromo José Carlos Pace — Interlagos',
      shortName: 'Interlagos',
      country: 'Brazil',
      location: 'São Paulo',
      laps: 71,
      lengthKm: 4.309,
      baseLapTime: 71.50,
      pitLoss: 21.6,
      fuelEffect: 0.027,
      tireStress: 'MEDIUM-HIGH',
      degradationMult: 1.15,
      corners: 15,
      drsZones: 2,
      topSpeedKmh: 338,
      fastf1Event: { year: 2022, event: 'Brazil' },
      characteristics: 'Anticlockwise amphitheater featuring the Senna S downhill chicane, Junção climb, and sudden weather shifts.',
      svgPath: 'M 85 160 L 220 160 C 260 160, 290 130, 280 95 L 270 65 C 260 40, 300 35, 330 55 L 410 115 C 435 135, 420 165, 380 165 L 310 165 C 280 165, 260 145, 240 120 L 180 85 C 150 65, 110 85, 100 115 L 85 160 Z'
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 2. PIRELLI TIRE COMPOUND MODEL (Empirical Dry Slick Parameters)
  // ─────────────────────────────────────────────────────────────────────────
  const COMPOUNDS = {
    SOFT: {
      id: 'SOFT',
      code: 'C4/C5',
      label: 'Soft',
      color: '#E10600',
      pace: 0.00,
      optLife: 13,
      cliffStart: 18,
      linearDeg: 0.028,
      cliffDeg: 0.24,
      outLapWarmUp: 2.1
    },
    MEDIUM: {
      id: 'MEDIUM',
      code: 'C3',
      label: 'Medium',
      color: '#EAB308',
      pace: 0.48,
      optLife: 22,
      cliffStart: 30,
      linearDeg: 0.014,
      cliffDeg: 0.12,
      outLapWarmUp: 2.6
    },
    HARD: {
      id: 'HARD',
      code: 'C1/C2',
      label: 'Hard',
      color: '#F4F4F5',
      pace: 0.92,
      optLife: 34,
      cliffStart: 46,
      linearDeg: 0.008,
      cliffDeg: 0.07,
      outLapWarmUp: 3.2
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 3. REALISTIC LAP-TIME CALCULATION
  // ─────────────────────────────────────────────────────────────────────────
  function lapTime(track, compoundKey, tireAge, lapNum, outLap = false, weatherOverride = null) {
    const c = COMPOUNDS[compoundKey] || COMPOUNDS.MEDIUM;
    let dm = track.degradationMult;

    // If FastF1 historical weather provided higher track temp (>38°C), scale wear realistically
    if (weatherOverride && typeof weatherOverride.track_temp_c === 'number') {
      const tempDelta = weatherOverride.track_temp_c - 32.0;
      dm *= Math.max(0.85, Math.min(1.25, 1 + tempDelta * 0.008));
    }

    // 1. Base lap + compound delta
    let time = track.baseLapTime + c.pace;

    // 2. Fuel burn benefit (~105kg down to ~2kg over race distance)
    const fuelSaving = (lapNum - 1) * track.fuelEffect;
    time -= fuelSaving;

    // 3. Multi-phase Pirelli thermal & mechanical wear
    const age = Math.max(0, tireAge - 1);
    let deg = 0;
    if (age <= c.optLife) {
      deg = age * c.linearDeg * dm;
    } else if (age <= c.cliffStart) {
      const optDeg = c.optLife * c.linearDeg * dm;
      const extraAge = age - c.optLife;
      const span = Math.max(1, c.cliffStart - c.optLife);
      const transRate = c.linearDeg * dm + (c.cliffDeg - c.linearDeg) * dm * (extraAge / span);
      deg = optDeg + extraAge * transRate;
    } else {
      const baseCliff = c.cliffStart * c.linearDeg * dm + (c.cliffStart - c.optLife) * c.cliffDeg * dm * 0.5;
      const over = age - c.cliffStart;
      deg = baseCliff + over * c.cliffDeg * dm * (1 + over * 0.045);
    }
    time += deg;

    // 4. Cold-tire out-lap penalty
    if (outLap) {
      time += c.outLapWarmUp;
    }

    return {
      time,
      deg,
      fuelSaving,
      pastCliff: age >= c.cliffStart
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. FULL RACE SIMULATION
  // ─────────────────────────────────────────────────────────────────────────
  function simulate(strategy, weatherOverride = null) {
    const { trackKey, stint1, stint2, pitLap } = strategy;
    const track = getTrack(trackKey);
    if (!track) return null;

    const totalLaps = track.laps;
    const clampedPit = Math.max(3, Math.min(totalLaps - 3, Number(pitLap) || 18));
    const laps = [];
    let cumTime = 0;
    let tireAge = 1;
    let currentCompound = (stint1 || 'SOFT').toUpperCase();
    const s2Compound = (stint2 || 'HARD').toUpperCase();

    for (let lap = 1; lap <= totalLaps; lap++) {
      let event = null;
      let isOutLap = false;

      if (lap === clampedPit + 1) {
        cumTime += track.pitLoss;
        tireAge = 1;
        currentCompound = s2Compound;
        isOutLap = true;
        event = 'PIT';
      }

      const calc = lapTime(track, currentCompound, tireAge, lap, isOutLap, weatherOverride);
      cumTime += calc.time;

      const compSpec = COMPOUNDS[currentCompound] || COMPOUNDS.MEDIUM;
      const maxReferenceLife = compSpec.cliffStart + 8;
      const wearPct = Math.max(5, Math.min(100, Math.round((1 - (tireAge - 1) / maxReferenceLife) * 100)));

      laps.push({
        lap,
        time: calc.time,
        deg: calc.deg,
        fuelSaving: calc.fuelSaving,
        pastCliff: calc.pastCliff,
        compound: currentCompound,
        tireAge,
        wearPct,
        cumTime,
        event
      });

      tireAge++;
    }

    return {
      track: track.name,
      trackKey: track.id,
      totalLaps,
      laps,
      totalTime: cumTime,
      stintBreakdown: {
        s1Compound: (stint1 || 'SOFT').toUpperCase(),
        s1Laps: clampedPit,
        s2Compound: s2Compound,
        s2Laps: totalLaps - clampedPit,
        pitLoss: track.pitLoss
      },
      fiaCompliant: (stint1 || 'SOFT').toUpperCase() !== s2Compound,
      valid: true,
      dataSource: weatherOverride ? 'MODELED_WITH_FASTF1_WEATHER' : 'MODELED_ESTIMATE',
      assumptions: 'Modeled Pirelli thermal degradation curves, ~1.75kg/lap fuel burn-off, dry race assumptions.'
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. EXHAUSTIVE STRATEGY OPTIMIZER
  // ─────────────────────────────────────────────────────────────────────────
  function optimise(trackKey, weatherOverride = null) {
    const track = getTrack(trackKey);
    if (!track) return null;

    const compounds = ['SOFT', 'MEDIUM', 'HARD'];
    let best = null;
    const allTop = [];

    for (const s1 of compounds) {
      for (const s2 of compounds) {
        if (s1 === s2) continue; // Mandatory FIA 2-compound rule
        for (let pitLap = 5; pitLap <= track.laps - 5; pitLap++) {
          const result = simulate({ trackKey: track.id, stint1: s1, stint2: s2, pitLap }, weatherOverride);
          if (!result) continue;
          const candidate = {
            ...result,
            stint1: s1,
            stint2: s2,
            pitLap: pitLap,
            strategy: { trackKey: track.id, stint1: s1, stint2: s2, pitLap }
          };
          if (!best || result.totalTime < best.totalTime) {
            best = candidate;
          }
          allTop.push(candidate);
        }
      }
    }

    return best;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. HONEST FASTF1 HISTORICAL SESSION FETCHER (With Labeled Fallback)
  // ─────────────────────────────────────────────────────────────────────────
  async function fetchFastF1Context(trackKey) {
    const track = getTrack(trackKey);
    if (!track || !track.fastf1Event) {
      return {
        source: 'MODELED_ESTIMATE',
        available: false,
        note: 'Using calibrated empirical race physics model.'
      };
    }

    try {
      const url = `${API_BASE}/race-data?year=${track.fastf1Event.year}&event=${encodeURIComponent(track.fastf1Event.event)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          source: 'MODELED_ESTIMATE',
          available: false,
          note: `FastF1 historical endpoint unavailable (${res.status}). Running calibrated empirical physics.`
        };
      }

      const data = await res.json();
      return {
        source: data.source || 'FASTF1_HISTORICAL',
        available: true,
        event: data.event,
        year: data.year,
        weather: data.weather || null,
        compoundMedians: data.compound_medians || {},
        lapCount: Array.isArray(data.laps) ? data.laps.length : 0,
        note: `FastF1 ${data.year} ${data.event} session telemetry loaded (${Array.isArray(data.laps) ? data.laps.length : 0} laps).`
      };
    } catch {
      return {
        source: 'MODELED_ESTIMATE',
        available: false,
        note: 'Backend FastF1 service offline or unreachable. Running calibrated empirical physics.'
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. FORMATTERS & ACCESSORS
  // ─────────────────────────────────────────────────────────────────────────
  function formatTime(totalSeconds) {
    if (totalSeconds == null || isNaN(totalSeconds)) return '0:00.000';
    const hours = Math.floor(totalSeconds / 3600);
    const rem = totalSeconds % 3600;
    const mins = Math.floor(rem / 60);
    const secs = (rem % 60).toFixed(3).padStart(6, '0');
    if (hours > 0) return `${hours}:${String(mins).padStart(2, '0')}:${secs}`;
    return `${mins}:${secs}`;
  }

  function formatLapTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '0:00.000';
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3).padStart(6, '0');
    return `${mins}:${secs}`;
  }

  function formatGap(diffSeconds) {
    if (diffSeconds == null || isNaN(diffSeconds)) return '+0.00s';
    const sign = diffSeconds >= 0 ? '+' : '-';
    return `${sign}${Math.abs(diffSeconds).toFixed(2)}s`;
  }

  function getTrack(key) {
    return TRACKS[key] || TRACKS['NORISRING'];
  }

  function getCompound(name) {
    return COMPOUNDS[(name || '').toUpperCase()] || COMPOUNDS.MEDIUM;
  }

  function listTracks() {
    return Object.keys(TRACKS);
  }

  return {
    simulate,
    optimise,
    fetchFastF1Context,
    formatTime,
    formatLapTime,
    formatGap,
    getTrack,
    getCompound,
    listTracks,
    TRACKS,
    COMPOUNDS
  };
})();

/**
 * Web Audio API Synthesized F1 Gantry Lights & Radio Sound Effects
 */
const TrackLabAudio = (() => {
  let ctx = null;

  function getCtx() {
    try {
      if (!ctx && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) ctx = new AudioCtx();
      }
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    } catch {
      return null;
    }
  }

  function playLightBeep(isGo = false) {
    const c = getCtx();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isGo ? 1860 : 1180, c.currentTime);
      gain.gain.setValueAtTime(0.14, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (isGo ? 0.36 : 0.09));
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + (isGo ? 0.38 : 0.1));
    } catch {}
  }

  function playRadioChime() {
    const c = getCtx();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(840, c.currentTime);
      osc.frequency.setValueAtTime(1240, c.currentTime + 0.07);
      gain.gain.setValueAtTime(0.09, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + 0.24);
    } catch {}
  }

  return { playLightBeep, playRadioChime };
})();

if (typeof window !== 'undefined') {
  window.TrackLabSim = TrackLabSim;
  window.TrackLabAudio = TrackLabAudio;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TrackLabSim, TrackLabAudio };
}
