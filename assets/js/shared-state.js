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
  userId: null,
  email: '',
  startingFuelKg: 105,
  hasCompletedGuide: false
};

const ALLOWED_TYRES = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'];

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
  12: 'pages/12-f1-explained/index.html',
  13: 'pages/about/index.html',
  'about': 'pages/about/index.html'
};

const FLOW_GUIDE = [
  { screen: 2, label: 'Briefing' },
  { screen: 3, label: 'Circuit' },
  { screen: 4, label: 'Tire Guide' },
  { screen: 5, label: 'Compounds' },
  { screen: 6, label: 'Pit Guide' },
  { screen: 7, label: 'Pit Window' },
  { screen: 8, label: 'Grid' },
  { screen: 9, label: 'Telemetry' },
  { screen: 10, label: 'Debrief' }
];

const FLOW_STANDARD = [
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

  // Remember guide progress on the user's profile in Supabase,
  // so returning users can skip the tutorial on any device
  if ('hasCompletedGuide' in updates && next.userId) {
    const sb = getSupabase();
    if (sb) {
      sb.from('profiles')
        .update({ has_completed_guide: Boolean(next.hasCompletedGuide) })
        .eq('id', next.userId)
        .then(({ error }) => {
          if (error) console.warn('[TrackLab] Guide progress sync notice:', error);
        });
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
 * Cryptographic Password Hashing (Web Crypto API SHA-256 with Salt)
 */
async function hashPassword(plainText, salt = 'tracklab_f1_telemetry') {
  if (!plainText) return '';
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const enc = new TextEncoder();
      const data = enc.encode(`${salt}:${plainText}`);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return plainText;
    }
  }
  return plainText;
}

/**
 * Helper to fetch a valid Track UUID from Supabase 'tracks' table
 */
let cachedTrackId = '8242f5b2-4c1b-4387-b790-8ace8fce93a0';
async function getSupabaseTrackId(trackName = 'Norisring') {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.from('tracks').select('id, name');
      if (!error && data && data.length > 0) {
        const match = data.find(t => t.name && t.name.toLowerCase().includes(trackName.toLowerCase()));
        if (match) {
          cachedTrackId = match.id;
          return match.id;
        }
        cachedTrackId = data[0].id;
        return data[0].id;
      }
    } catch (e) {
      console.warn('[TrackLab] Track UUID lookup warning:', e);
    }
  }
  return cachedTrackId;
}

/**
 * Supabase Cloud Persistence Client
 * Built-in Supabase Auth API & exact strategy/pit_stops schema
 */
const TrackLabDB = {
  /**
   * Supabase Auth: Sign Up with email, password, and username in options.data
   */
  async signUp(email, password, username = '') {
    const cleanEmail = (email || '').trim();
    const cleanUser = (username || '').trim() || cleanEmail.split('@')[0];
    if (!cleanEmail) return { ok: false, error: 'Please enter an email address.' };
    if (!password || password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };

    const sb = getSupabase();
    if (!sb || !sb.auth) {
      return { ok: false, error: 'Supabase client is not loaded. Please verify connection.' };
    }

    try {
      // Official Supabase Auth signUp as instructed
      const { data, error } = await sb.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            username: cleanUser
          }
        }
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      const user = data.user;
      const driverName = user?.user_metadata?.username || cleanUser;
      saveState({
        username: driverName,
        userId: user?.id || null,
        email: user?.email || cleanEmail,
        hasCompletedGuide: false
      });

      return { ok: true, user, session: data.session, username: driverName, hasCompletedGuide: false };
    } catch (e) {
      return { ok: false, error: 'Registration failed: ' + (e.message || e) };
    }
  },

  /**
   * Supabase Auth: Sign In with email and password
   */
  async signInWithPassword(email, password) {
    const cleanEmail = (email || '').trim();
    if (!cleanEmail) return { ok: false, error: 'Please enter your email.' };
    if (!password) return { ok: false, error: 'Please enter your password.' };

    const sb = getSupabase();
    if (!sb || !sb.auth) {
      return { ok: false, error: 'Supabase client is not loaded. Please verify connection.' };
    }

    try {
      // Official Supabase Auth signInWithPassword as instructed
      const { data, error } = await sb.auth.signInWithPassword({
        email: cleanEmail,
        password: password
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      const user = data.user;
      const driverName = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Driver';

      // Check whether user has previously completed the guide in Supabase
      let hasCompleted = false;
      try {
          const { data: profileData } = await sb
            .from('profiles')
            .select('has_completed_guide')
            .eq('id', user.id)
            .maybeSingle();
        if (profileData && profileData.has_completed_guide) {
          hasCompleted = true;
        }
      } catch {}

      saveState({
        username: driverName,
        userId: user?.id || null,
        email: user?.email || cleanEmail,
        hasCompletedGuide: hasCompleted
      });

      return { ok: true, user, session: data.session, username: driverName, hasCompletedGuide: hasCompleted };
    } catch (e) {
      return { ok: false, error: 'Sign in failed: ' + (e.message || e) };
    }
  },

  /**
   * Supabase Auth: Sign Out
   */
  async signOut() {
    const sb = getSupabase();
    if (sb && sb.auth) {
      try {
        await sb.auth.signOut();
      } catch (e) {
        console.warn('[TrackLab] Supabase signOut notice:', e);
      }
    }
    saveState({ username: '', userId: null, email: '', hasCompletedGuide: false });
    return { ok: true };
  },

  // Aliases for compatibility
  async login(emailOrUser, password) {
    // If input is an email, sign in with password directly
    if (emailOrUser && emailOrUser.includes('@')) {
      return this.signInWithPassword(emailOrUser, password);
    }
    // If a username was entered without @, provide informative prompt or attempt sign in
    return this.signInWithPassword(emailOrUser, password);
  },

  async register(email, password, username) {
    return this.signUp(email, password, username);
  },

  /**
   * Save strategy to Supabase with exact column names:
   * strategies: user_id, track_id, name, starting_compound, starting_fuel_kg
   * pit_stops: strategy_id, stop_number, lap, new_compound
   * Allowed tyre names: SOFT, MEDIUM, HARD, INTERMEDIATE, WET (all capitalized)
   */
  async saveStrategy(strategyParams = {}) {
    const state = getState();
    const sb = getSupabase();
    if (!sb) {
      return { ok: false, savedToDb: false, error: 'Supabase client unavailable' };
    }

    // Retrieve active user UUID from Supabase Auth session
    let userId = state.userId;
    if (!userId && sb.auth) {
      try {
        const { data } = await sb.auth.getUser();
        userId = data?.user?.id || null;
        if (userId) saveState({ userId });
      } catch {}
    }

    // Resolve valid track UUID from Supabase tracks table
    const trackUuid = await getSupabaseTrackId(strategyParams.track || state.track || 'Norisring');

    // Ensure tyre compounds are strictly uppercase & valid
    const rawStart = (strategyParams.starting_compound || strategyParams.stint1 || state.stint1 || 'SOFT').toUpperCase();
    const rawNew = (strategyParams.new_compound || strategyParams.stint2 || state.stint2 || 'HARD').toUpperCase();
    const startingCompound = ALLOWED_TYRES.includes(rawStart) ? rawStart : 'SOFT';
    const newCompound = ALLOWED_TYRES.includes(rawNew) ? rawNew : 'HARD';

    const pitLap = Number(strategyParams.lap || strategyParams.pit_lap || state.pitLap || 28);
    const startingFuelKg = Number(strategyParams.starting_fuel_kg || strategyParams.fuel || state.startingFuelKg || 105);
    const stratName = strategyParams.name || `${state.track || 'Norisring'} Strategy: ${startingCompound} → ${newCompound} (L${pitLap})`;

    try {
      // 1. Insert into 'strategies'
      const { data: stratRow, error: stratErr } = await sb
        .from('strategies')
        .insert([{
          user_id: userId,
          track_id: trackUuid,
          name: stratName,
          starting_compound: startingCompound,
          starting_fuel_kg: startingFuelKg
        }])
        .select()
        .single();

      if (stratErr) {
        console.warn('[TrackLab] Error inserting into strategies table:', stratErr);
        return { ok: false, savedToDb: false, error: stratErr.message };
      }

      const strategyId = stratRow?.id;

      // 2. Insert into 'pit_stops'
      let pitStopRow = null;
      if (strategyId) {
        const { data: pitData, error: pitErr } = await sb
          .from('pit_stops')
          .insert([{
            strategy_id: strategyId,
            stop_number: 1,
            lap: pitLap,
            new_compound: newCompound
          }])
          .select()
          .single();

        if (pitErr) {
          console.warn('[TrackLab] Error inserting into pit_stops table:', pitErr);
        } else {
          pitStopRow = pitData;
        }
      }

      return {
        ok: true,
        savedToDb: true,
        source: 'supabase',
        strategy: stratRow,
        pitStop: pitStopRow,
        strategyId: strategyId
      };
    } catch (e) {
      console.warn('[TrackLab] saveStrategy exception:', e);
      return { ok: false, savedToDb: false, error: e.message || e };
    }
  },

  async saveRace(raceRecord) {
    return this.saveStrategy({
      track: raceRecord.track,
      name: raceRecord.track_name || `${raceRecord.track || 'Norisring'} Grand Prix Run`,
      starting_compound: raceRecord.stint1,
      starting_fuel_kg: 105,
      lap: raceRecord.pit_lap,
      new_compound: raceRecord.stint2
    });
  },

  /**
   * Retrieve saved strategies with nested pit stops from Supabase
   */
  async getStrategies() {
    const sb = getSupabase();
    if (!sb) {
      return { source: 'none', strategies: [], error: 'Supabase client unavailable' };
    }

    try {
      const state = getState();
      let query = sb
        .from('strategies')
        .select('*, pit_stops(*)')
        .order('created_at', { ascending: false });

      if (state.userId) {
        query = query.eq('user_id', state.userId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[TrackLab] Supabase getStrategies error:', error);
        return { source: 'none', strategies: [], error: error.message };
      }

      return { source: 'supabase', strategies: data || [] };
    } catch (e) {
      console.warn('[TrackLab] getStrategies exception:', e);
      return { source: 'none', strategies: [], error: e.message || e };
    }
  },

  async getRaces() {
    const res = await this.getStrategies();
    const races = (res.strategies || []).map(s => {
      const stop = (s.pit_stops && s.pit_stops[0]) || {};
      return {
        id: s.id,
        track: s.track_id,
        track_name: s.name || 'F1 Strategy Run',
        stint1: s.starting_compound || 'SOFT',
        stint2: stop.new_compound || 'HARD',
        pit_lap: stop.lap || 28,
        fuel_kg: s.starting_fuel_kg || 105,
        total_time: 3528.4,
        gap: 0.0,
        data_source: 'SUPABASE_CLOUD'
      };
    });
    return { source: res.source, races, error: res.error };
  },

  async clearOrDeleteRace(strategyId) {
    const sb = getSupabase();
    if (sb && strategyId) {
      try {
        await sb.from('pit_stops').delete().eq('strategy_id', strategyId);
        await sb.from('strategies').delete().eq('id', strategyId);
        return { ok: true };
      } catch (e) {
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
    const isGuideActive = !state.hasCompletedGuide || currentScreen === 2 || currentScreen === 4 || currentScreen === 6;
    const flow = isGuideActive ? FLOW_GUIDE : FLOW_STANDARD;
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

    const guideChip = `
      <span class="dock-divider"></span>
      <button type="button" id="dock-guide-toggle" class="dock-step mono text-[10px] uppercase tracking-wider ${currentScreen === 2 ? 'is-active' : ''}" title="View Strategy Guide & Lessons">
        📘 Guide
      </button>
    `;

    dock.innerHTML = stepsMarkup + guideChip;
    document.body.appendChild(dock);

    dock.querySelectorAll('[data-dock-target]').forEach(btn => {
      btn.addEventListener('click', () => goTo(Number(btn.dataset.dockTarget)));
    });

    const guideBtn = document.getElementById('dock-guide-toggle');
    if (guideBtn) {
      guideBtn.addEventListener('click', () => {
        goTo(2);
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
          const { error } = await sb.from('tracks').select('id').limit(1);
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
