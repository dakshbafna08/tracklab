/**
 * TrackLab // Shared State, Bottom Progress Dock, DB Sync & Navigation
 * =========================================================================
 */

const API_BASE = 'http://localhost:8000';

const DEFAULT_STATE = {
  track: 'NORISRING',
  totalLaps: 72,
  stint1: 'SOFT',
  stint2: 'HARD',
  pitLap: 28,
  username: '',
  userMode: 'guided' // 'guided' | 'pro'
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

const FLOW_GUIDED = [
  { screen: 2, label: 'Briefing' },
  { screen: 3, label: 'Circuit' },
  { screen: 4, label: 'Tire Physics' },
  { screen: 5, label: 'Compounds' },
  { screen: 7, label: 'Pit Window' },
  { screen: 8, label: 'Grid' },
  { screen: 9, label: 'Telemetry' },
  { screen: 10, label: 'Debrief' }
];

const FLOW_PRO = [
  { screen: 3, label: 'Circuit' },
  { screen: 5, label: 'Compounds' },
  { screen: 7, label: 'Pit Window' },
  { screen: 8, label: 'Grid' },
  { screen: 9, label: 'Telemetry' },
  { screen: 10, label: 'Debrief' }
];

function getState() {
  try {
    const raw = localStorage.getItem('tracklab_state');
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(updates) {
  const next = { ...getState(), ...updates };
  try {
    localStorage.setItem('tracklab_state', JSON.stringify(next));
  } catch {}

  // Background sync to SQLite if user is signed in
  if (next.username && typeof fetch === 'function') {
    fetch(`${API_BASE}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: next.username,
        track: next.track,
        total_laps: next.totalLaps,
        stint1: next.stint1,
        stint2: next.stint2,
        pit_lap: next.pitLap,
        preferred_mode: next.userMode
      })
    }).catch(() => {});
  }

  return next;
}

const setState = saveState;

function getCurrentScreen() {
  if (typeof window === 'undefined') return 1;
  const path = window.location.pathname.replace(/\\/g, '/');
  for (const [num, relPath] of Object.entries(SCREEN_PATHS)) {
    if (Number(num) === 1) {
      if ((path.endsWith('/index.html') || path.endsWith('/')) && !path.includes('/pages/')) return 1;
    } else {
      const folder = relPath.replace('/index.html', '');
      if (path.includes(folder)) return Number(num);
    }
  }
  return 1;
}

function goTo(screenNum) {
  if (typeof window === 'undefined') return;
  const target = SCREEN_PATHS[screenNum];
  if (!target) return;
  const isSubpage = window.location.pathname.replace(/\\/g, '/').includes('/pages/');
  const prefix = isSubpage ? '../../' : '';
  const url = prefix + target;

  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    window.location.href = url;
    return;
  }

  // Trigger F1 Car across screen transition
  let overlay = document.getElementById('f1-transition-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'f1-transition-overlay';
    overlay.innerHTML = `
      <div class="f1-speed-car-container">
        <div class="f1-aerodynamic-trail"></div>
        <svg class="f1-speed-car-svg" viewBox="0 0 320 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="20" y="10" width="16" height="42" rx="3" fill="#E10600"/>
          <path d="M 36 28 L 85 46 L 85 58 L 30 58 Z" fill="#18181B"/>
          <path d="M 85 52 L 130 25 C 145 22, 175 22, 190 32 L 245 48 L 290 56 L 290 62 L 75 62 Z" fill="#09090B" stroke="#E10600" stroke-width="2.5"/>
          <path d="M 145 25 C 160 22, 175 24, 185 30 L 175 38 C 165 34, 155 33, 145 35 Z" fill="#E10600"/>
          <path d="M 285 55 L 315 58 L 315 65 L 275 65 Z" fill="#E10600"/>
          <rect x="300" y="52" width="14" height="16" rx="2" fill="#FFFFFF"/>
          <circle cx="70" cy="58" r="16" fill="#18181B" stroke="#E10600" stroke-width="4"/>
          <circle cx="70" cy="58" r="7" fill="#E4E4E7"/>
          <circle cx="265" cy="58" r="15" fill="#18181B" stroke="#E10600" stroke-width="4"/>
          <circle cx="265" cy="58" r="6" fill="#E4E4E7"/>
        </svg>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  overlay.classList.remove('active');
  void overlay.offsetWidth;
  overlay.classList.add('active');

  setTimeout(() => {
    window.location.href = url;
  }, 340);
}

const navigateTo = goTo;

/**
 * SQLite + LocalStorage Unified Persistence Client
 */
const TrackLabDB = {
  async login(username, password) {
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.detail || 'Authentication failed.', offline: false };
      }
      const updates = {
        username: data.username,
        userMode: data.preferred_mode || getState().userMode
      };
      if (data.state) {
        updates.track = data.state.track;
        updates.totalLaps = data.state.total_laps;
        updates.stint1 = data.state.stint1;
        updates.stint2 = data.state.stint2;
        updates.pitLap = data.state.pit_lap;
      }
      saveState(updates);
      return { ok: true, data, offline: false };
    } catch {
      // Backend offline: store locally with honest offline label
      saveState({ username });
      return { ok: true, offline: true };
    }
  },

  async register(username, password, preferred_mode = 'guided') {
    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, preferred_mode })
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.detail || 'Registration failed.', offline: false };
      }
      saveState({ username: data.username, userMode: preferred_mode });
      return { ok: true, data, offline: false };
    } catch {
      saveState({ username, userMode: preferred_mode });
      return { ok: true, offline: true };
    }
  },

  async saveRace(raceRecord) {
    const state = getState();
    const record = {
      ...raceRecord,
      username: state.username || 'Guest Driver',
      created_at: new Date().toISOString()
    };

    // Save locally immediately so dashboard always has it
    try {
      const existing = JSON.parse(localStorage.getItem('tracklab_history') || '[]');
      existing.unshift(record);
      localStorage.setItem('tracklab_history', JSON.stringify(existing.slice(0, 50)));
    } catch {}

    // Persist to SQLite backend if online
    try {
      const res = await fetch(`${API_BASE}/api/races`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: record.username,
          track: record.track,
          track_name: record.track_name,
          stint1: record.stint1,
          stint2: record.stint2,
          pit_lap: record.pit_lap,
          total_time: record.total_time,
          optimal_time: record.optimal_time,
          optimal_stint1: record.optimal_stint1 || 'MEDIUM',
          optimal_stint2: record.optimal_stint2 || 'HARD',
          optimal_pit_lap: record.optimal_pit_lap || 22,
          gap: record.gap,
          data_source: record.data_source || 'MODELED_ESTIMATE'
        })
      });
      if (res.ok) {
        const saved = await res.json();
        return { savedToDb: true, id: saved.id };
      }
    } catch {}

    return { savedToDb: false };
  },

  async getRaces() {
    const state = getState();
    const username = state.username || '';
    try {
      const q = username ? `?username=${encodeURIComponent(username)}` : '';
      const res = await fetch(`${API_BASE}/api/races${q}`);
      if (res.ok) {
        const data = await res.json();
        return { source: 'sqlite', races: data.races || [] };
      }
    } catch {}

    try {
      const local = JSON.parse(localStorage.getItem('tracklab_history') || '[]');
      const filtered = username ? local.filter(r => !r.username || r.username.toLowerCase() === username.toLowerCase()) : local;
      return { source: 'localStorage', races: filtered };
    } catch {
      return { source: 'localStorage', races: [] };
    }
  },

  async clearOrDeleteRace(raceId, localIdx) {
    if (raceId) {
      try {
        await fetch(`${API_BASE}/api/races/${raceId}`, { method: 'DELETE' });
      } catch {}
    }
    try {
      const existing = JSON.parse(localStorage.getItem('tracklab_history') || '[]');
      if (typeof localIdx === 'number') {
        existing.splice(localIdx, 1);
      } else if (raceId) {
        const idx = existing.findIndex(r => r.id === raceId);
        if (idx >= 0) existing.splice(idx, 1);
      }
      localStorage.setItem('tracklab_history', JSON.stringify(existing));
    } catch {}
  }
};

document.addEventListener('DOMContentLoaded', () => {
  let state = getState();
  const currentScreen = getCurrentScreen();

  // 1. Page transition class
  const mainEl = document.querySelector('main');
  if (mainEl) mainEl.classList.add('page-enter');

  // 2. Wire all [data-goto] buttons & links
  document.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const target = Number(el.dataset.goto);
      if (target) goTo(target);
    });
  });

  // 3. Scroll Animation Observer (Apple reveal physics)
  const animTargets = document.querySelectorAll('.animate-on-scroll');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (animTargets.length > 0) {
    if (reducedMotion || !('IntersectionObserver' in window)) {
      animTargets.forEach(el => {
        el.classList.add('is-visible', 'visible');
      });
    } else {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible', 'visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });

      animTargets.forEach(el => observer.observe(el));
    }
  }

  // 4. Inject Floating BOTTOM Progress Dock (Screens 2 to 10)
  if (currentScreen >= 2 && currentScreen <= 10 && !document.querySelector('.progress-dock')) {
    const flow = state.userMode === 'pro' ? FLOW_PRO : FLOW_GUIDED;
    const activeIdx = flow.findIndex(s => s.screen === currentScreen);

    const dock = document.createElement('nav');
    dock.className = 'progress-dock';
    dock.setAttribute('aria-label', 'Race Strategy Progress');

    const stepsMarkup = flow.map((step, idx) => {
      const isActive = step.screen === currentScreen;
      const isDone = activeIdx !== -1 && idx < activeIdx;
      const cls = isActive ? 'is-active' : (isDone ? 'is-done' : '');
      return `
        <button type="button" data-dock-target="${step.screen}" class="dock-step ${cls}" title="Jump to ${step.label}">
          <span class="dock-step-dot"></span>
          <span class="${isActive ? 'inline' : 'hidden md:inline'}">${step.label}</span>
        </button>
      `;
    }).join('<span class="dock-divider"></span>');

    const modeChip = `
      <span class="dock-divider"></span>
      <button type="button" id="dock-mode-toggle" class="dock-step mono text-[10px] uppercase tracking-wider" title="Switch Guided / Pro workflow">
        ${state.userMode === 'pro' ? '★ Pro' : 'Guided'}
      </button>
      <span class="dock-divider"></span>
      <button type="button" id="dock-pro-upgrade" class="dock-step mono text-[10px] text-amber-300 hover:text-white uppercase tracking-wider" title="Telemetry Pro Upgraded Version">
        ⚡ Pro Tier
      </button>
    `;

    dock.innerHTML = stepsMarkup + modeChip;
    document.body.appendChild(dock);

    // Pro Upgrade Modal Injector
    let proModal = document.getElementById('pro-upgrade-modal');
    if (!proModal) {
      proModal = document.createElement('div');
      proModal.id = 'pro-upgrade-modal';
      proModal.innerHTML = `
        <div class="glass-panel p-8 max-w-md w-full relative">
          <div class="flex justify-between items-start mb-4">
            <div>
              <span class="section-tag mb-1">Exclusive Upgrade</span>
              <h3 class="text-2xl font-bold text-white">TrackLab Pro Telemetry</h3>
            </div>
            <button type="button" id="close-pro-modal" class="text-zinc-500 hover:text-white text-xl leading-none">&times;</button>
          </div>
          <p class="body-copy text-xs mb-6">
            Unlock championship-grade F1 race engineering algorithms with real-time predictive degradation modeling.
          </p>
          <div class="space-y-3 mono text-xs mb-6">
            <div class="sub-box p-3 flex items-center justify-between">
              <span>⚡ Monte Carlo Stint Variance Simulation</span>
              <span class="text-[#22C55E]">Unlocked</span>
            </div>
            <div class="sub-box p-3 flex items-center justify-between">
              <span>🌧 Live Weather Radar & Rain Delta</span>
              <span class="text-[#22C55E]">Active</span>
            </div>
            <div class="sub-box p-3 flex items-center justify-between">
              <span>📊 Sub-Tenth Degradation Cliff Optimizer</span>
              <span class="text-[#22C55E]">Enabled</span>
            </div>
          </div>
          <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs mb-6">
            <strong>Pro Mode Status:</strong> High-precision strategy optimization engine unlocked for this session.
          </div>
          <button type="button" id="confirm-pro-modal" class="btn-primary w-full py-3 text-xs">
            Continue with Pro Capabilities
          </button>
        </div>
      `;
      document.body.appendChild(proModal);

      const closeHandler = () => proModal.classList.remove('active');
      document.getElementById('close-pro-modal').addEventListener('click', closeHandler);
      document.getElementById('confirm-pro-modal').addEventListener('click', closeHandler);
    }

    document.getElementById('dock-pro-upgrade').addEventListener('click', () => {
      proModal.classList.add('active');
    });

    dock.querySelectorAll('[data-dock-target]').forEach(btn => {
      btn.addEventListener('click', () => goTo(Number(btn.dataset.dockTarget)));
    });

    const modeBtn = document.getElementById('dock-mode-toggle');
    if (modeBtn) {
      modeBtn.addEventListener('click', () => {
        const nextMode = state.userMode === 'pro' ? 'guided' : 'pro';
        saveState({ userMode: nextMode });
        window.location.reload();
      });
    }
  } else if (currentScreen === 1 || currentScreen >= 11) {
    document.body.classList.add('no-dock');
  }

  // 5. Hydrate Driver Name in Header if element present
  const driverEl = document.getElementById('header-driver-name');
  if (driverEl) {
    driverEl.textContent = state.username ? state.username : 'Guest';
  }

  // 6. Hydrate .total-laps-label everywhere
  document.querySelectorAll('.total-laps-label').forEach(el => {
    el.textContent = state.totalLaps;
  });

  // 7. Auto-wire Track Selection Cards if container exists
  const trackContainer = document.getElementById('track-cards-container');
  if (trackContainer) {
    const syncTrackUI = () => {
      trackContainer.querySelectorAll('.track-card[data-track]').forEach(card => {
        const isSelected = card.dataset.track === state.track;
        card.classList.toggle('track-selected', isSelected);
        const badge = card.querySelector('.selected-badge');
        if (badge) badge.classList.toggle('hidden', !isSelected);
      });
    };
    syncTrackUI();

    trackContainer.querySelectorAll('.track-card[data-track]').forEach(card => {
      card.addEventListener('click', () => {
        state = saveState({
          track: card.dataset.track,
          totalLaps: Number(card.dataset.laps) || 58
        });
        syncTrackUI();
        document.dispatchEvent(new CustomEvent('tracklab:trackChanged', { detail: state }));
      });
    });
  }

  // 8. Auto-wire Compound Buttons if present
  const compoundBtns = document.querySelectorAll('.compound-btn[data-stint][data-compound]');
  if (compoundBtns.length > 0) {
    const syncTires = () => {
      compoundBtns.forEach(btn => {
        const stint = Number(btn.dataset.stint);
        const comp = btn.dataset.compound;
        const active = stint === 1 ? state.stint1 === comp : state.stint2 === comp;
        btn.classList.toggle('compound-active', active);
      });
      const p1 = document.getElementById('preview-s1');
      const p2 = document.getElementById('preview-s2');
      if (p1) p1.textContent = `STINT 1: ${state.stint1}`;
      if (p2) p2.textContent = `STINT 2: ${state.stint2}`;

      const fiaWarn = document.getElementById('fia-compound-warning');
      if (fiaWarn) {
        const same = state.stint1 === state.stint2;
        fiaWarn.classList.toggle('hidden', !same);
      }
    };
    syncTires();

    compoundBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const stint = Number(btn.dataset.stint);
        const comp = btn.dataset.compound;
        state = saveState(stint === 1 ? { stint1: comp } : { stint2: comp });
        syncTires();
        document.dispatchEvent(new CustomEvent('tracklab:tiresChanged', { detail: state }));
      });
    });
  }

  // 9. Auto-check backend API status for header pill
  const apiStatusEl = document.getElementById('header-api-status');
  if (apiStatusEl) {
    const checkApi = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          apiStatusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-[#22C55E] shadow-[0_0_8px_#22C55E]"></span> FastF1 Engine';
        } else {
          apiStatusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-zinc-400"></span> Local Engine';
        }
      } catch {
        apiStatusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-zinc-400"></span> Local Engine';
      }
    };
    checkApi();
  }
});

if (typeof window !== 'undefined') {
  window.getState = getState;
  window.saveState = saveState;
  window.setState = setState;
  window.goTo = goTo;
  window.navigateTo = navigateTo;
  window.getCurrentScreen = getCurrentScreen;
  window.TrackLabDB = TrackLabDB;
}
