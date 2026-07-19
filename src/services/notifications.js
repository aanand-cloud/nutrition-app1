import { getSession } from './auth.js';
import { buildWeeklyPushMessage, buildDailyPushMessage } from './push-messages.js';
import { weekReport } from './reports.js';
import { getGoals } from './goals.js';
import { sumNutrition } from './storage.js';

const PREFS_KEY = 'nutrilog_notify_prefs';
const CACHE_KEY = 'nutrilog_notify_cache';

export function getNotifyPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...defaultPrefs(), ...JSON.parse(raw) };
  } catch (_) {}
  return defaultPrefs();
}

export function saveNotifyPrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...getNotifyPrefs(), ...prefs }));
}

function defaultPrefs() {
  return {
    enabled: false,
    reminderHour: 19,
    reminderMinute: 0,
    weeklyDigest: true,
    pushEnabled: false,
  };
}

export function isNotificationSupported() {
  return typeof Notification !== 'undefined' || isNativeNotifications();
}

export async function requestNotificationPermission() {
  if (isNativeNotifications()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.requestPermissions();
    return perm.display === 'granted' ? 'granted' : 'denied';
  }
  if (!('Notification' in window)) return 'denied';
  return Notification.requestPermission();
}

export async function enableNotifications() {
  const perm = await requestNotificationPermission();
  if (perm !== 'granted') throw new Error('Notification permission denied');
  saveNotifyPrefs({ enabled: true });
  await subscribeWebPush();
  return perm;
}

export async function disableNotifications() {
  saveNotifyPrefs({ enabled: false, pushEnabled: false });
  await cancelNativeReminder();
  await unsubscribeWebPush();
}

/** Personalised weekly + daily notification check */
export async function runPersonalisedNotificationCheck(weekMeals, todayMeals, cuisineTips = null, displayName = '') {
  if (!getNotifyPrefs().enabled) return;

  const perm = await getPermissionState();
  if (perm !== 'granted') return;

  const report = weekReport(weekMeals);
  const weeklyMsg = buildWeeklyPushMessage(report, cuisineTips, displayName);
  const todayTotals = sumNutrition(todayMeals);
  const dailyMsg = buildDailyPushMessage(todayTotals, getGoals(), todayMeals.length, displayName);

  await maybeNotifyWeeklyDigest(weeklyMsg);
  await maybeDailyReminder(dailyMsg);
  await syncPersonalisedNativeReminders(weeklyMsg, dailyMsg);
}

/** Weekly digest with real stats (protein %, etc.) */
export async function maybeNotifyWeeklyDigest(msg) {
  if (!msg || !getNotifyPrefs().enabled || !getNotifyPrefs().weeklyDigest) return;

  const perm = await getPermissionState();
  if (perm !== 'granted') return;

  const cache = readCache();
  const wk = weekId();
  if (cache.lastWeeklyDigestKey === wk) return;

  await showNotification(msg.title, msg.body, msg.url || '/?view=reports');
  writeCache({ ...cache, lastWeeklyDigestKey: wk });
}

/** @deprecated use runPersonalisedNotificationCheck */
export async function maybeNotifyWeeklyInsight(insight) {
  if (!insight) return;
  const msg = {
    title: `${insight.label} at ${insight.percent}% this week`,
    body: insight.message,
    url: '/?view=reports',
  };
  await maybeNotifyWeeklyDigest(msg);
}

/** Daily reminder with today's stats when meals are logged */
export async function maybeDailyReminder(msg = null) {
  if (!getNotifyPrefs().enabled) return;

  const perm = await getPermissionState();
  if (perm !== 'granted') return;

  const cache = readCache();
  const today = todayKey();
  if (cache.lastDailyReminder === today) return;

  const hour = getNotifyPrefs().reminderHour;
  const now = new Date();
  if (now.getHours() < hour) return;

  const payload = msg || {
    title: 'NutriLog check-in',
    body: 'Log today\'s meals or review your weekly nutrition progress.',
    url: '/',
  };

  await showNotification(payload.title, payload.body, payload.url);
  writeCache({ ...cache, lastDailyReminder: today });
}

/** Preview personalised push immediately (for testing) */
export async function sendTestNotification(weekMeals, todayMeals, cuisineTips = null) {
  const perm = await requestNotificationPermission();
  if (perm !== 'granted') throw new Error('Notification permission denied');

  const report = weekReport(weekMeals);
  const weeklyMsg = buildWeeklyPushMessage(report, cuisineTips);
  await showNotification(
    `[Test] ${weeklyMsg.title}`,
    weeklyMsg.body,
    weeklyMsg.url
  );
  return weeklyMsg;
}

export async function syncPersonalisedNativeReminders(weeklyMsg, dailyMsg) {
  if (!isNativeNotifications()) return;

  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const prefs = getNotifyPrefs();
  await LocalNotifications.cancel({ notifications: [{ id: 1001 }, { id: 1002 }] });

  await LocalNotifications.schedule({
    notifications: [
      {
        id: 1001,
        title: dailyMsg?.title || 'NutriLog daily check-in',
        body: dailyMsg?.body || 'Remember to log your meals today.',
        schedule: {
          on: { hour: prefs.reminderHour, minute: prefs.reminderMinute },
          repeats: true,
          allowWhileIdle: true,
        },
        smallIcon: 'ic_stat_icon',
        iconColor: '#0f766e',
      },
      {
        id: 1002,
        title: weeklyMsg?.title || 'Weekly nutrition review',
        body: weeklyMsg?.body || 'See how you did this week — protein, fibre, and more.',
        schedule: {
          on: { weekday: 1, hour: 9, minute: 0 },
          repeats: true,
          allowWhileIdle: true,
        },
        smallIcon: 'ic_stat_icon',
        iconColor: '#0f766e',
      },
    ],
  });
}

async function cancelNativeReminder() {
  if (!isNativeNotifications()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: [{ id: 1001 }, { id: 1002 }] });
}

async function showNotification(title, body, url = '/') {
  if (isNativeNotifications()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 100000),
        title,
        body,
        extra: { url },
      }],
    });
    return;
  }

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
      tag: 'nutrilog-insight',
    });
    return;
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icons/icon-192.png' });
  }
}

async function getPermissionState() {
  if (isNativeNotifications()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    return perm.display === 'granted' ? 'granted' : 'denied';
  }
  return Notification.permission;
}

async function subscribeWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const session = await getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    await fetch('/api/save-push-subscription', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        subscription: sub.toJSON(),
        userAgent: navigator.userAgent,
      }),
    });
    saveNotifyPrefs({ pushEnabled: true });
  } catch (err) {
    console.warn('Web push subscribe failed', err);
  }
}

async function unsubscribeWebPush() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/save-push-subscription', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  } catch (_) {}
}

function isNativeNotifications() {
  try {
    return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function weekId() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export { weekId, todayKey as notifyTodayKey };
