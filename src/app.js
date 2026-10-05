import { renderToday, renderSettings, setSettingsTab, syncResultMessage, isAuthFormOnScreen } from './views/today.js';
import { renderLog, isLogBusy } from './views/log.js';
import { renderReports } from './views/reports.js';
import {
  onAuthChange,
  isSupabaseConfigured,
  capturePasswordRecoveryFromUrl,
  isPasswordRecoveryPending,
  markPasswordRecovery,
  consumeAuthIntent,
} from './services/auth.js';
import { fullSync } from './services/sync.js';
import { verifyCheckoutSession, setPlan, startPlanCheckout, isPro, planLabel, syncTopUpFromCloud, syncScanStateFromProfile } from './services/subscription.js';
import { getMealsInRange, getMealsForDate, todayKey } from './services/storage.js';
import { getCuisineTips } from './services/cuisine-tips.js';
import { runPersonalisedNotificationCheck } from './services/notifications.js';
import { getProfile, getGreeting } from './services/profile.js';
import { openLegalModal } from './views/legal.js';

let currentView = 'today';
let cachedProfile = null;
let refreshGen = 0;

export function initApp() {
  capturePasswordRecoveryFromUrl();
  const main = document.getElementById('main');
  const headerDate = document.getElementById('headerDate');
  const headerGreeting = document.getElementById('headerGreeting');
  const toast = document.getElementById('toast');

  async function updateHeader() {
    try {
      cachedProfile = await getProfile();
    } catch (_) {
      cachedProfile = { displayName: '', loggedIn: false };
    }

    headerGreeting.textContent = getGreeting(cachedProfile.displayName);
    if (cachedProfile.topup_balance != null) {
      syncTopUpFromCloud(cachedProfile.topup_balance);
    }
    if (cachedProfile.loggedIn) {
      syncScanStateFromProfile(cachedProfile);
    }

    const viewTitles = {
      today: '',
      log: 'Log a meal',
      reports: 'Your reports',
      settings: 'Goals & settings',
    };
    const viewSub = viewTitles[currentView] || '';

    const parts = [
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    ];
    if (viewSub) parts.unshift(viewSub);
    if (isPro() && currentView === 'today') parts.push(planLabel());
    headerDate.textContent = parts.filter(Boolean).join(' · ');
  }

  function showToast(msg, ms = 3200) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, ms);
  }

  function activateNav(view) {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle('active', active);
      btn.toggleAttribute('aria-current', active ? 'page' : false);
    });
  }

  function setView(view) {
    if (currentView === 'log' && view !== 'log' && isLogBusy()) {
      const leave = window.confirm('Leave meal logging? Tap Log again to continue where you left off.');
      if (!leave) return;
    }
    currentView = view;
    activateNav(view);
    refresh();
  }

  async function handleUpgrade() {
    setSettingsTab('plans');
    setView('settings');
  }

  function openSettings(tab, opts) {
    if (tab) setSettingsTab(tab, opts);
    setView('settings');
  }

  async function refresh() {
    const gen = ++refreshGen;
    main.setAttribute('aria-busy', 'true');
    try {
      await updateHeader();
      if (gen !== refreshGen) return;
      const profile = cachedProfile || await getProfile();
      if (gen !== refreshGen) return;
      if (currentView === 'today') {
        await renderToday(main, {
          onLog: () => setView('log'),
          onRefresh: refresh,
          onReports: () => setView('reports'),
          onSettings: openSettings,
          profile,
        });
      } else if (currentView === 'log') {
        renderLog(main, {
          onSaved: () => setView('today'),
          onCancel: () => setView('today'),
          showToast,
          onUpgrade: handleUpgrade,
          onSignIn: () => openSettings('account', { focusAuth: true }),
          profile,
        });
      } else if (currentView === 'reports') {
        await renderReports(main, { profile, onLog: () => setView('log') });
      } else if (currentView === 'settings') {
        await renderSettings(main, {
          onSave: refresh,
          onGoToday: () => setView('today'),
          showToast,
          profile,
        });
      }
    } finally {
      if (gen === refreshGen) main.removeAttribute('aria-busy');
    }
  }

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  document.querySelectorAll('[data-legal]').forEach((btn) => {
    btn.addEventListener('click', () => openLegalModal(btn.dataset.legal));
  });

  onAuthChange(async (session, event) => {
    if (event === 'PASSWORD_RECOVERY') {
      markPasswordRecovery();
      setSettingsTab('account');
      currentView = 'settings';
      activateNav('settings');
    }

    let userJustAuthenticated = false;
    if (event === 'SIGNED_IN') {
      const intent = consumeAuthIntent();
      if (intent && session && isSupabaseConfigured()) {
        userJustAuthenticated = true;
        try {
          const result = await fullSync();
          if (result.plan) setPlan(result.plan);
          const moved = (result.pushed || result.pulled || result.failed)
            ? syncResultMessage(result)
            : '';
          if (intent === 'signup') showToast('Account created — welcome!');
          else if (moved) showToast(`Signed in · ${moved}`);
          else showToast('Signed in');
        } catch (_) {
          showToast(intent === 'signup'
            ? 'Account created — sync will retry later'
            : 'Signed in — sync will retry later');
        }
      }
    } else if (
      session
      && isSupabaseConfigured()
      && (event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY')
    ) {
      try {
        const result = await fullSync();
        if (result.plan) setPlan(result.plan);
      } catch (_) {}
    }

    const shouldRefresh = userJustAuthenticated
      || event === 'INITIAL_SESSION'
      || event === 'SIGNED_OUT'
      || event === 'USER_UPDATED'
      || event === 'PASSWORD_RECOVERY';
    // The first cloud check can finish after someone has already opened sign-in.
    // Rebuilding that form would clear what they typed.
    if (event === 'INITIAL_SESSION' && !session && isAuthFormOnScreen()) return;
    if (shouldRefresh) refresh();
  });

  handleCheckoutReturn().finally(async () => {
    await runNotificationChecks();
    if (isPasswordRecoveryPending()) {
      setSettingsTab('account');
      currentView = 'settings';
      activateNav('settings');
      refresh();
      return;
    }
    const url = new URL(window.location.href);
    const view = url.searchParams.get('view');
    if (view === 'reports' || view === 'settings' || view === 'log' || view === 'today') {
      url.searchParams.delete('view');
      window.history.replaceState({}, '', url.pathname + url.search);
      setView(view);
    } else {
      refresh();
    }
  });
}

async function runNotificationChecks() {
  try {
    const end = todayKey();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    const weekMeals = await getMealsInRange(weekStart.toISOString().slice(0, 10), end);
    const todayMeals = await getMealsForDate(end);
    const cuisineTips = weekMeals.length ? await getCuisineTips(weekMeals) : null;
    const profile = await getProfile();
    await runPersonalisedNotificationCheck(weekMeals, todayMeals, cuisineTips, profile.displayName);
  } catch (_) {}
}

async function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') !== 'success') return;

  const sessionId = params.get('session_id');
  const toast = document.getElementById('toast');
  if (sessionId) {
    try {
      const result = await verifyCheckoutSession(sessionId);
      if (result?.type === 'topup') {
        if (toast) {
          toast.textContent = `+${result.scans || 100} meal logs added to your account`;
          toast.hidden = false;
        }
      } else if (result?.plan) {
        setPlan(result.plan);
        if (toast) {
          toast.textContent = 'Subscription active — thank you!';
          toast.hidden = false;
        }
      }
    } catch (err) {
      if (toast) {
        toast.textContent = err?.message || 'Could not verify payment — contact support if you were charged';
        toast.hidden = false;
      }
    }
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('checkout');
  url.searchParams.delete('session_id');
  window.history.replaceState({}, '', url.pathname + url.search);
}
