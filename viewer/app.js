const state = {
  track: 'MELBOURNE',
  totalLaps: 58,
  stint1: 'SOFT',
  stint2: 'HARD',
  pitLap: 18
};

let simTimer = null;

function goTo(screenNum) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById(`screen-${screenNum}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('nav-btn-active', btn.dataset.target === String(screenNum));
  });
}

function selectTrack(name, laps) {
  state.track = name;
  state.totalLaps = Number(laps);

  document.querySelectorAll('.total-laps-label').forEach(el => {
    el.textContent = state.totalLaps;
  });

  const isMel = name === 'MELBOURNE';
  document.getElementById('track-mel').classList.toggle('track-selected', isMel);
  document.getElementById('track-aus').classList.toggle('track-selected', !isMel);
  document.getElementById('badge-mel').classList.toggle('hidden', !isMel);
  document.getElementById('badge-aus').classList.toggle('hidden', isMel);

  updateSummary();
}

function setStintTire(stint, compound) {
  if (stint === 1) state.stint1 = compound;
  if (stint === 2) state.stint2 = compound;

  ['SOFT', 'MEDIUM', 'HARD'].forEach(c => {
    const btn = document.getElementById(`s${stint}-${c}`);
    if (btn) {
      btn.classList.toggle('compound-active', c === compound);
    }
  });

  document.getElementById('preview-s1').textContent = `STINT 1: ${state.stint1}`;
  document.getElementById('preview-s2').textContent = `STINT 2: ${state.stint2}`;
  updatePitLap(state.pitLap);
  updateSummary();
}

function updatePitLap(val) {
  state.pitLap = parseInt(val, 10);
  document.getElementById('pit-lap-val').textContent = state.pitLap;

  const pct1 = Math.round((state.pitLap / state.totalLaps) * 100);
  const pct2 = 100 - pct1;

  const bar1 = document.getElementById('bar-s1');
  const bar2 = document.getElementById('bar-s2');
  bar1.style.width = `${pct1}%`;
  bar1.textContent = `${state.stint1} (${state.pitLap}L)`;
  bar2.style.width = `${pct2}%`;
  bar2.textContent = `${state.stint2} (${state.totalLaps - state.pitLap}L)`;

  const warn = document.getElementById('wear-warning');
  if (state.stint1 === 'SOFT' && state.pitLap > 22) {
    warn.textContent = 'WARNING: High risk of hitting the Soft degradation cliff after Lap 20!';
    warn.className = 'mt-4 mono text-xs text-[#E10600] font-bold';
  } else {
    warn.textContent = 'STATUS: Pit window within workable thermal degradation range.';
    warn.className = 'mt-4 mono text-xs muted-text';
  }

  updateSummary();
}

function updateSummary() {
  document.getElementById('summary-track').textContent = `${state.track} (${state.totalLaps} LAPS)`;
  document.getElementById('summary-s1').textContent = `${state.stint1} (LAPS 1 – ${state.pitLap})`;
  document.getElementById('summary-pit').textContent = `END OF LAP ${state.pitLap} (+21.2s PIT LOSS)`;
  document.getElementById('summary-s2').textContent = `${state.stint2} (LAPS ${state.pitLap + 1} – ${state.totalLaps})`;
  document.getElementById('result-user-summary').textContent = `PIT STOP ON LAP ${state.pitLap}`;
}

function startRace() {
  goTo(9);
  let lap = 1;
  if (simTimer) clearInterval(simTimer);
  simTimer = setInterval(() => {
    lap += 3;
    if (lap >= state.totalLaps) {
      lap = state.totalLaps;
      clearInterval(simTimer);
    }
    document.getElementById('sim-lap').textContent = lap;
    document.getElementById('sim-gap').textContent = `+${(1.2 + lap * 0.09).toFixed(2)}s`;
  }, 180);
}

// Wire up all event listeners cleanly (No inline onclicks in HTML)
document.addEventListener('DOMContentLoaded', () => {
  // Dev bar navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => goTo(Number(btn.dataset.target)));
  });

  // Standard screen navigation buttons
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => goTo(Number(btn.dataset.goto)));
  });

  // Track cards
  document.querySelectorAll('.track-card').forEach(card => {
    card.addEventListener('click', () => {
      selectTrack(card.dataset.track, card.dataset.laps);
    });
  });

  // Quick track select from Dashboard
  document.querySelectorAll('[data-quicktrack]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectTrack(btn.dataset.quicktrack, btn.dataset.quicklaps);
      goTo(5);
    });
  });

  // Compound selector buttons
  document.querySelectorAll('.compound-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setStintTire(Number(btn.dataset.stint), btn.dataset.compound);
    });
  });

  // Pit lap slider
  const slider = document.getElementById('pit-slider');
  if (slider) {
    slider.addEventListener('input', e => updatePitLap(e.target.value));
  }

  // Start & Replay Simulation buttons
  document.getElementById('start-race-btn').addEventListener('click', startRace);
  document.querySelectorAll('.replay-sim-btn').forEach(btn => {
    btn.addEventListener('click', startRace);
  });

  // Initialize on Screen 1
  goTo(1);
});