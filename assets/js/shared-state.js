/**
 * TrackLab // Shared State, Bottom Progress Dock, DB Sync & Navigation
 * =========================================================================
 */

const API_BASE = 'http://localhost:8000';

// Supabase Cloud Project Configuration
const SUPABASE_URL = 'https://ejbrepdwafsjxyhoufut.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g-qWZ-McCCBXz-l7lcEVkQ_xOezN_Jw';

let supabaseClient = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return supabaseClient;
    } catch (e) {
      console.warn('[TrackLab] Supabase client init warning:', e);
    }
  }
  return null;
}

// Auto-inject Supabase JS client from CDN if not already in document head
if (typeof window !== 'undefined' && typeof window.supabase === 'undefined' && typeof document !== 'undefined') {
  if (!document.getElementById('supabase-js-cdn')) {
    const s = document.createElement('script');
    s.id = 'supabase-js-cdn';
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload = () => { getSupabase(); };
    document.head.appendChild(s);
  }
}

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
  0: 'pages/login/index.html',
  'login': 'pages/login/index.html',
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
    const raw = sessionStorage.getItem('tracklab_session_state');
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(updates) {
  const next = { ...getState(), ...updates };
  try {
    sessionStorage.setItem('tracklab_session_state', JSON.stringify(next));
  } catch {}

  // Sync state directly to Supabase user_strategy_state table in real time
  if (next.username && next.username !== 'Guest Driver') {
    const sb = getSupabase();
    if (sb) {
      sb.from('user_strategy_state').upsert({
        username: next.username,
        track: next.track || 'NORISRING',
        total_laps: next.totalLaps || 72,
        stint1: next.stint1 || 'SOFT',
        stint2: next.stint2 || 'HARD',
        pit_lap: next.pitLap || 28,
        preferred_mode: next.userMode || 'guided',
        updated_at: new Date().toISOString()
      }).then(() => {}).catch(err => console.warn('[TrackLab] Supabase state sync notice:', err));
    }
  }

  return next;
}

const setState = saveState;

function getCurrentScreen() {
  if (typeof window === 'undefined') return 1;
  const path = window.location.pathname.replace(/\\/g, '/');
  if (path.includes('/pages/login/') || path.endsWith('/login.html')) return 0;
  for (const [num, relPath] of Object.entries(SCREEN_PATHS)) {
    if (Number(num) === 1) {
      if ((path.endsWith('/index.html') || path.endsWith('/')) && !path.includes('/pages/')) return 1;
    } else if (Number(num) > 1) {
      const folder = relPath.replace('/index.html', '');
      if (path.includes(folder)) return Number(num);
    }
  }
  return 1;
}

function goTo(screenNum) {
  if (typeof window === 'undefined') return;
  const target = SCREEN_PATHS[screenNum] || (screenNum === 0 || screenNum === 'login' ? 'pages/login/index.html' : null);
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
 * Supabase Cloud Persistence Client
 * No local storage fallback — all profiles, strategy state & telemetry live in Supabase
 */
const TrackLabDB = {
  async login(username, password) {
    const cleanUser = (username || '').trim();
    if (!cleanUser) return { ok: false, error: 'Please enter a driver callsign.' };

    const sb = getSupabase();
    if (!sb) {
      return { ok: false, error: 'Supabase client is not loaded. Please verify internet connection.' };
    }

    try {
      const { data, error } = await sb
        .from('drivers')
        .select('*')
        .ilike('username', cleanUser)
        .maybeSingle();

      if (error) {
        if (
          error.code === 'PGRST205' ||
          error.code === '42P01' ||
          (error.message && (error.message.includes('schema cache') || error.message.includes('does not exist')))
        ) {
          return { ok: false, error: 'Supabase tables not found in schema cache. Please open your Supabase SQL Editor and run supabase_schema.sql to create them.' };
        }
        return { ok: false, error: 'Supabase Error: ' + error.message };
      }

      if (!data) {
        return { ok: false, error: `Driver callsign "${cleanUser}" not found in Supabase. Please create a profile first.` };
      }

      if (data.password_hash && data.password_hash !== 'pass' && data.password_hash !== password) {
        return { ok: false, error: 'Incorrect password for driver ' + cleanUser };
      }

      const updates = {
        username: data.username,
        userMode: data.preferred_mode || getState().userMode
      };

      // Pull latest strategy state from Supabase
      try {
        const { data: stData } = await sb
          .from('user_strategy_state')
          .select('*')
          .ilike('username', data.username)
          .maybeSingle();
        if (stData) {
          updates.track = stData.track || updates.track;
          updates.totalLaps = stData.total_laps || updates.totalLaps;
          updates.stint1 = stData.stint1 || updates.stint1;
          updates.stint2 = stData.stint2 || updates.stint2;
          updates.pitLap = stData.pit_lap || updates.pitLap;
        }
      } catch (err) {
        console.warn('[TrackLab] Strategy state fetch notice:', err);
      }

      saveState(updates);
      return { ok: true, source: 'supabase', username: data.username };
    } catch (e) {
      return { ok: false, error: 'Supabase connection failed: ' + (e.message || e) };
    }
  },

  async register(username, password, preferred_mode = 'guided') {
    const cleanUser = (username || '').trim();
    if (!cleanUser) return { ok: false, error: 'Please enter a driver callsign.' };

    const sb = getSupabase();
    if (!sb) {
      return { ok: false, error: 'Supabase client is not loaded. Please verify internet connection.' };
    }

    try {
      // Check existing driver in Supabase
      const { data: existing, error: checkErr } = await sb
        .from('drivers')
        .select('username')
        .ilike('username', cleanUser)
        .maybeSingle();

      if (existing) {
        return { ok: false, error: `Driver callsign "${cleanUser}" already registered in Supabase. Please sign in instead.` };
      }

      // Insert new driver in Supabase
      const { data, error } = await sb
        .from('drivers')
        .insert([{
          username: cleanUser,
          password_hash: password || 'pass',
          preferred_mode: preferred_mode
        }])
        .select()
        .maybeSingle();

      if (error) {
        if (
          error.code === 'PGRST205' ||
          error.code === '42P01' ||
          (error.message && (error.message.includes('schema cache') || error.message.includes('does not exist')))
        ) {
          return { ok: false, error: 'Supabase tables not found in schema cache. Please open your Supabase SQL Editor and run supabase_schema.sql to create them.' };
        }
        return { ok: false, error: 'Supabase registration error: ' + error.message };
      }

      // Initialize user strategy state in Supabase
      try {
        await sb.from('user_strategy_state').upsert({
          username: cleanUser,
          track: 'NORISRING',
          total_laps: 72,
          stint1: 'SOFT',
          stint2: 'HARD',
          pit_lap: 28,
          preferred_mode: preferred_mode,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('[TrackLab] Strategy state init notice:', err);
      }

      saveState({ username: cleanUser, userMode: preferred_mode });
      return { ok: true, source: 'supabase', username: cleanUser };
    } catch (e) {
      return { ok: false, error: 'Supabase registration failed: ' + (e.message || e) };
    }
  },

  async saveRace(raceRecord) {
    const state = getState();
    const cleanUser = state.username || 'Guest Driver';
    const sb = getSupabase();

    if (!sb) {
      return { savedToDb: false, error: 'Supabase client unavailable' };
    }

    try {
      const { data, error } = await sb.from('race_history').insert([{
        username: cleanUser,
        track: raceRecord.track || 'NORISRING',
        track_name: raceRecord.track_name || 'Norisring — Nuremberg Street Circuit',
        stint1: raceRecord.stint1,
        stint2: raceRecord.stint2,
        pit_lap: raceRecord.pit_lap,
        total_time: raceRecord.total_time,
        optimal_time: raceRecord.optimal_time,
        optimal_stint1: raceRecord.optimal_stint1 || 'MEDIUM',
        optimal_stint2: raceRecord.optimal_stint2 || 'HARD',
        optimal_pit_lap: raceRecord.optimal_pit_lap || 28,
        gap: raceRecord.gap,
        data_source: raceRecord.data_source || 'MODELED_PHYSICS'
      }]).select();

      if (error) {
        console.warn('[TrackLab] Supabase saveRace error:', error);
        return { savedToDb: false, error: error.message };
      }

      // Sync active strategy state to Supabase
      if (cleanUser !== 'Guest Driver') {
        try {
          await sb.from('user_strategy_state').upsert({
            username: cleanUser,
            track: raceRecord.track || 'NORISRING',
            total_laps: state.totalLaps || 72,
            stint1: raceRecord.stint1,
            stint2: raceRecord.stint2,
            pit_lap: raceRecord.pit_lap,
            updated_at: new Date().toISOString()
          });
        } catch {}
      }

      return { savedToDb: true, source: 'supabase', id: data?.[0]?.id };
    } catch (e) {
      console.warn('[TrackLab] Supabase saveRace exception:', e);
      return { savedToDb: false, error: e.message || e };
    }
  },

  async getRaces() {
    const state = getState();
    const username = state.username || '';
    const sb = getSupabase();

    if (!sb) {
      return { source: 'none', races: [], error: 'Supabase client unavailable' };
    }

    try {
      let query = sb.from('race_history').select('*').order('created_at', { ascending: false });
      if (username && username !== 'Guest Driver') {
        query = query.ilike('username', username);
      }
      const { data, error } = await query;
      if (error) {
        console.warn('[TrackLab] Supabase getRaces error:', error);
        return { source: 'none', races: [], error: error.message };
      }
      return { source: 'supabase', races: data || [] };
    } catch (e) {
      console.warn('[TrackLab] Supabase getRaces exception:', e);
      return { source: 'none', races: [], error: e.message || e };
    }
  },

  async clearOrDeleteRace(raceId) {
    const sb = getSupabase();
    if (sb && raceId) {
      try {
        await sb.from('race_history').delete().eq('id', raceId);
        return { ok: true };
      } catch (e) {
        console.warn('[TrackLab] Supabase delete error:', e);
        return { ok: false, error: e.message };
      }
    }
    return { ok: false };
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
      const raw = el.dataset.goto;
      if (raw === '0' || raw === 'login') {
        goTo(0);
      } else if (raw !== undefined && raw !== null && raw !== '') {
        const target = Number(raw);
        if (!isNaN(target)) goTo(target);
        else goTo(raw);
      }
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
    `;

    dock.innerHTML = stepsMarkup + modeChip;
    document.body.appendChild(dock);

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
  } else if (currentScreen <= 1 || currentScreen >= 11) {
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

  // 9. Auto-check backend & Supabase status for header pill
  const apiStatusEl = document.getElementById('header-api-status');
  if (apiStatusEl) {
    const checkApi = async () => {
      let isSupabaseOnline = false;
      let isFastF1Online = false;

      // Supabase connection test
      const sb = getSupabase();
      if (sb) {
        try {
          const { error } = await sb.from('race_history').select('id').limit(1);
          if (!error || error.code === 'PGRST116' || error.message) {
            isSupabaseOnline = true;
          }
        } catch {}
      }

      // FastAPI / Local backend test
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) isFastF1Online = true;
      } catch {}

      if (isSupabaseOnline && isFastF1Online) {
        apiStatusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-[#22C55E] shadow-[0_0_8px_#22C55E]"></span> Supabase + FastF1';
      } else if (isSupabaseOnline) {
        apiStatusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-[#22C55E] shadow-[0_0_8px_#22C55E]"></span> Supabase Cloud';
      } else if (isFastF1Online) {
        apiStatusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-[#22C55E] shadow-[0_0_8px_#22C55E]"></span> FastF1 Engine';
      } else {
        apiStatusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-[#E10600]"></span> Supabase Required';
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
