const DEFAULT_STATE = {
  track: 'MELBOURNE',
  totalLaps: 58,
  stint1: 'SOFT',
  stint2: 'HARD',
  pitLap: 18
};

const SCREEN_PATHS = {
  1: 'index.html',
  2: 'pages/02-intro/index.html',
  3: 'pages/03-track-select/index.html',
  4: 'pages/04-tire-lesson/index.html',
  5: 'pages/05-pick-tires/index.html',
  6: 'pages/06-pit-lesson/index.html',
  7: 'pages/07-pick-pit-lap/index.html',
  8: 'pages/08-confirm/index.html',
  9: 'pages/09-race-sim/index.html',
  10: 'pages/10-results/index.html',
  11: 'pages/11-dashboard/index.html',
  12: 'pages/12-f1-explained/index.html'
};

function getState() {
  const saved = localStorage.getItem('tracklab_state');
  return saved ? JSON.parse(saved) : { ...DEFAULT_STATE };
}

function saveState(updates) {
  const next = { ...getState(), ...updates };
  localStorage.setItem('tracklab_state', JSON.stringify(next));
  return next;
}

function goTo(screenNum) {
  const isSubpage = window.location.pathname.includes('/pages/');
  const prefix = isSubpage ? '../../' : '';
  const targetPath = SCREEN_PATHS[screenNum];
  if (targetPath) {
    window.location.href = prefix + targetPath;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  let state = getState();

  // --- AUTO-INJECT "NEW TO F1?" LINK INTO HEADER ON ALL PAGES ---
  const headerLinksContainer = document.querySelector('.app-header .text-sm');
  if (headerLinksContainer && !headerLinksContainer.querySelector('[data-goto="12"]')) {
    const f1Btn = document.createElement('button');
    f1Btn.setAttribute('data-goto', '12');
    f1Btn.className = 'header-link';
    f1Btn.textContent = 'New to F1?';

    const divider = document.createElement('span');
    divider.className = 'divider';
    divider.textContent = '|';

    headerLinksContainer.prepend(divider);
    headerLinksContainer.prepend(f1Btn);
  }

  // --- AUTO-INJECT "12. F1 EXPLAINED" INTO DEV BAR ON ALL PAGES ---
  const devNav = document.querySelector('.dev-nav');
  if (devNav && !devNav.querySelector('[data-target="12"]')) {
    const devBtn = document.createElement('button');
    devBtn.setAttribute('data-target', '12');
    devBtn.className = 'nav-btn';
    devBtn.textContent = '12. F1 Explained';
    devNav.appendChild(devBtn);
  }

  // 1. Wire up Dev Wireframe Bar & Navigation Buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => goTo(Number(btn.dataset.target)));
  });

  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => goTo(Number(btn.dataset.goto)));
  });

  // Update total laps labels if present on current page
  document.querySelectorAll('.total-laps-label').forEach(el => {
    el.textContent = state.totalLaps;
  });

  // 2. Screen 3: Track Selection Logic
  const trackMel = document.getElementById('track-mel');
  const trackAus = document.getElementById('track-aus');
  if (trackMel && trackAus) {
    const renderTracks = () => {
      const isMel = state.track === 'MELBOURNE';
      trackMel.classList.toggle('track-selected', isMel);
      trackAus.classList.toggle('track-selected', !isMel);
      document.getElementById('badge-mel').classList.toggle('hidden', !isMel);
      document.getElementById('badge-aus').classList.toggle('hidden', isMel);
    };
    renderTracks();

    document.querySelectorAll('.track-card').forEach(card => {
      card.addEventListener('click', () => {
        state = saveState({
          track: card.dataset.track,
          totalLaps: Number(card.dataset.laps)
        });
        renderTracks();
      });
    });
  }

  // 3. Screen 5: Tire Compound Selection Logic
  const previewS1 = document.getElementById('preview-s1');
  if (previewS1) {
    const renderTires = () => {
      ['SOFT', 'MEDIUM', 'HARD'].forEach(c => {
        const b1 = document.getElementById(`s1-${c}`);
        const b2 = document.getElementById(`s2-${c}`);
        if (b1) b1.classList.toggle('compound-active', state.stint1 === c);
        if (b2) b2.classList.toggle('compound-active', state.stint2 === c);
      });
      previewS1.textContent = `STINT 1: ${state.stint1}`;
      document.getElementById('preview-s2').textContent = `STINT 2: ${state.stint2}`;
    };
    renderTires();

    document.querySelectorAll('.compound-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stint = Number(btn.dataset.stint);
        const compound = btn.dataset.compound;
        state = saveState(stint === 1 ? { stint1: compound } : { stint2: compound });
        renderTires();
      });
    });
  }

  // 4. Screen 7: Pit Stop Slider Logic
  const slider = document.getElementById('pit-slider');
  if (slider) {
    slider.max = state.totalLaps - 5;
    slider.value = state.pitLap;

    const renderPitWindow = (val) => {
      const pitLap = parseInt(val, 10);
      state = saveState({ pitLap });
      document.getElementById('pit-lap-val').textContent = pitLap;

      const pct1 = Math.round((pitLap / state.totalLaps) * 100);
      const pct2 = 100 - pct1;

      const bar1 = document.getElementById('bar-s1');
      const bar2 = document.getElementById('bar-s2');
      bar1.style.width = `${pct1}%`;
      bar1.textContent = `${state.stint1} (${pitLap}L)`;
      bar2.style.width = `${pct2}%`;
      bar2.textContent = `${state.stint2} (${state.totalLaps - pitLap}L)`;

      const warn = document.getElementById('wear-warning');
      if (state.stint1 === 'SOFT' && pitLap > 22) {
        warn.textContent = 'WARNING: High risk of hitting the Soft degradation cliff after Lap 20!';
        warn.className = 'mt-4 mono text-xs text-[#E10600] font-bold';
      } else {
        warn.textContent = 'STATUS: Pit window within workable thermal degradation range.';
        warn.className = 'mt-4 mono text-xs muted-text';
      }
    };

    renderPitWindow(state.pitLap);
    slider.addEventListener('input', e => renderPitWindow(e.target.value));
  }

  // 5. Screen 8: Confirm Strategy Summary
  const summaryTrack = document.getElementById('summary-track');
  if (summaryTrack) {
    summaryTrack.textContent = `${state.track} (${state.totalLaps} LAPS)`;
    document.getElementById('summary-s1').textContent = `${state.stint1} (LAPS 1 – ${state.pitLap})`;
    document.getElementById('summary-pit').textContent = `END OF LAP ${state.pitLap} (+21.2s PIT LOSS)`;
    document.getElementById('summary-s2').textContent = `${state.stint2} (LAPS ${state.pitLap + 1} – ${state.totalLaps})`;
  }

  const startRaceBtn = document.getElementById('start-race-btn');
  if (startRaceBtn) {
    startRaceBtn.addEventListener('click', () => goTo(9));
  }

  // 6. Screen 9: Race Simulation Timer
  const simLap = document.getElementById('sim-lap');
  if (simLap) {
    let lap = 1;
    const simTimer = setInterval(() => {
      lap += 3;
      if (lap >= state.totalLaps) {
        lap = state.totalLaps;
        clearInterval(simTimer);
      }
      simLap.textContent = lap;
      document.getElementById('sim-gap').textContent = `+${(1.2 + lap * 0.09).toFixed(2)}s`;
    }, 180);
  }

  // 7. Screen 10: Results Summary
  const resSummary = document.getElementById('result-user-summary');
  if (resSummary) {
    resSummary.textContent = `PIT STOP ON LAP ${state.pitLap}`;
  }

  // 8. Screen 11: Dashboard Quick Buttons
  document.querySelectorAll('[data-quicktrack]').forEach(btn => {
    btn.addEventListener('click', () => {
      saveState({
        track: btn.dataset.quicktrack,
        totalLaps: Number(btn.dataset.quicklaps)
      });
      goTo(5);
    });
  });

  document.querySelectorAll('.replay-sim-btn').forEach(btn => {
    btn.addEventListener('click', () => goTo(9));
  });
});