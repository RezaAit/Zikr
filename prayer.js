/**
 * তাসবীহ — Prayer Time Calculator & Notification Scheduler
 * Pure JS, no external dependencies, works offline.
 * Algorithm: Muslim World League (Fajr 18°, Isha 17°)
 */

(function(){
'use strict';

// ─────────────────────────────────────────────
// Prayer Time Calculation (astronomical)
// ─────────────────────────────────────────────
const DEG = Math.PI / 180;

function julianDay(date){
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
    + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

function sunPosition(jd){
  const D = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * D) % 360;
  const q = (280.459 + 0.98564736 * D) % 360;
  const L = (q + 1.915 * Math.sin(g * DEG) + 0.02 * Math.sin(2 * g * DEG)) % 360;
  const e = 23.439 - 0.00000036 * D;
  const RA = Math.atan2(Math.cos(e * DEG) * Math.sin(L * DEG), Math.cos(L * DEG)) / DEG;
  const decl = Math.asin(Math.sin(e * DEG) * Math.sin(L * DEG)) / DEG;
  const eqT = q / 15 - ((RA < 0 ? RA + 360 : RA) / 15);
  return { decl, eqT };
}

function hourAngle(angle, lat, decl){
  const num = -Math.sin(angle * DEG) - Math.sin(lat * DEG) * Math.sin(decl * DEG);
  const den = Math.cos(lat * DEG) * Math.cos(decl * DEG);
  if(Math.abs(den) < 1e-9) return NaN;
  const cos = num / den;
  if(cos < -1 || cos > 1) return NaN;
  return Math.acos(cos) / DEG;
}

function asrAngle(shadowFactor, lat, decl){
  const target = Math.atan(1 / (shadowFactor + Math.tan(Math.abs(lat - decl) * DEG))) / DEG;
  return hourAngle(-target, lat, decl);
}

/**
 * Calculate prayer times for a given date and location.
 * Returns object with times as Date objects (local time).
 * @param {Date} date
 * @param {number} lat  latitude
 * @param {number} lng  longitude
 * @param {number} tz   UTC offset in hours (auto-detected if omitted)
 */
function calcPrayerTimes(date, lat, lng, tz){
  if(tz === undefined){
    tz = -date.getTimezoneOffset() / 60;
  }

  const jd = julianDay(date);
  const { decl, eqT } = sunPosition(jd);

  const transit = 12 - eqT - lng / 15; // solar noon in UTC

  function utcToLocal(utc){ return utc + tz; }
  function timeToDate(hours){
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(Math.round(hours * 60));
    return d;
  }

  const solar = utcToLocal(transit);

  const fajrHA  = hourAngle(-18, lat, decl);  // 18° below horizon
  const sunriseHA = hourAngle(-0.833, lat, decl);
  const asrHA   = asrAngle(1, lat, decl);       // Shafi (shadow = 1)
  const maghribHA = hourAngle(-0.833, lat, decl); // same as sunrise angle
  const ishaHA  = hourAngle(-17, lat, decl);    // 17° below horizon

  return {
    fajr:    timeToDate(solar - fajrHA / 15),
    sunrise: timeToDate(solar - sunriseHA / 15),
    dhuhr:   timeToDate(solar + 5/60),           // solar noon + 5 min
    asr:     timeToDate(solar + asrHA / 15),
    maghrib: timeToDate(solar + maghribHA / 15),
    isha:    timeToDate(solar + ishaHA / 15),
  };
}

/**
 * Estimate Tahajjud as midpoint between Isha and next Fajr (last third of night)
 */
function calcTahajjud(isha, nextFajr){
  const ishaMs = isha.getTime();
  const fajrMs = nextFajr.getTime();
  // Last third of night starts at: isha + (fajr - isha) * 2/3
  const tahajjudMs = ishaMs + (fajrMs - ishaMs) * (2 / 3);
  return new Date(tahajjudMs);
}

/**
 * Bedtime reminder: 90 minutes before Tahajjud (or fixed 10pm if tahajjud is before 10pm)
 */
function calcBedtime(tahajjud){
  const t = new Date(tahajjud.getTime() - 90 * 60 * 1000);
  return t;
}

// ─────────────────────────────────────────────
// Notification helpers
// ─────────────────────────────────────────────
const NOTIF_KEY = 'tasbeeh_prayer_notif';

function loadNotifState(){
  try{ return JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}'); }
  catch(e){ return {}; }
}
function saveNotifState(s){
  try{ localStorage.setItem(NOTIF_KEY, JSON.stringify(s)); }
  catch(e){}
}

/**
 * Request notification permission and return true if granted.
 */
async function requestPermission(){
  if(!('Notification' in window)) return false;
  if(Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Schedule all prayer notifications for today (and tomorrow's fajr + tahajjud).
 * Uses setTimeout — works as long as the page/PWA is open.
 * Service Worker push handles the background case.
 */
let _scheduledTimers = [];

function clearScheduled(){
  _scheduledTimers.forEach(clearTimeout);
  _scheduledTimers = [];
}

function scheduleNotification(title, body, time, icon){
  const now = Date.now();
  const delay = time.getTime() - now;
  if(delay < 0) return; // already passed
  if(delay > 24 * 60 * 60 * 1000) return; // more than 24h away

  const tid = setTimeout(() => {
    if(Notification.permission === 'granted'){
      new Notification(title, {
        body,
        icon: icon || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: title,
        renotify: false,
        silent: false
      });
    }
  }, delay);
  _scheduledTimers.push(tid);
}

function padTime(d){
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

/**
 * Main: calculate and schedule today's prayer notifications.
 * @param {number} lat
 * @param {number} lng
 * @param {string} lang 'bn' | 'en'
 * @param {object} enabled { fajr, dhuhr, asr, maghrib, isha, bedtime, tahajjud }
 */
function schedulePrayerNotifications(lat, lng, lang, enabled){
  clearScheduled();

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const times = calcPrayerTimes(today, lat, lng);
  const tomorrowTimes = calcPrayerTimes(tomorrow, lat, lng);
  const tahajjud = calcTahajjud(times.isha, tomorrowTimes.fajr);
  const bedtime  = calcBedtime(tahajjud);

  const isBn = lang === 'bn';

  const prayers = [
    {
      key: 'fajr',
      time: times.fajr,
      titleBn: '🌙 ফজরের সময় হয়েছে',
      titleEn: '🌙 Fajr Prayer Time',
      bodyBn: `ফজর নামাজের সময় হয়েছে। (${padTime(times.fajr)})`,
      bodyEn: `It's time for Fajr prayer. (${padTime(times.fajr)})`,
    },
    {
      key: 'dhuhr',
      time: times.dhuhr,
      titleBn: '☀️ যোহরের সময় হয়েছে',
      titleEn: '☀️ Dhuhr Prayer Time',
      bodyBn: `যোহর নামাজের সময় হয়েছে। (${padTime(times.dhuhr)})`,
      bodyEn: `It's time for Dhuhr prayer. (${padTime(times.dhuhr)})`,
    },
    {
      key: 'asr',
      time: times.asr,
      titleBn: '🌤️ আসরের সময় হয়েছে',
      titleEn: '🌤️ Asr Prayer Time',
      bodyBn: `আসর নামাজের সময় হয়েছে। (${padTime(times.asr)})`,
      bodyEn: `It's time for Asr prayer. (${padTime(times.asr)})`,
    },
    {
      key: 'maghrib',
      time: times.maghrib,
      titleBn: '🌆 মাগরিবের সময় হয়েছে',
      titleEn: '🌆 Maghrib Prayer Time',
      bodyBn: `মাগরিব নামাজের সময় হয়েছে। (${padTime(times.maghrib)})`,
      bodyEn: `It's time for Maghrib prayer. (${padTime(times.maghrib)})`,
    },
    {
      key: 'isha',
      time: times.isha,
      titleBn: '🌙 ইশার সময় হয়েছে',
      titleEn: '🌙 Isha Prayer Time',
      bodyBn: `ইশা নামাজের সময় হয়েছে। (${padTime(times.isha)})`,
      bodyEn: `It's time for Isha prayer. (${padTime(times.isha)})`,
    },
    {
      key: 'bedtime',
      time: bedtime,
      titleBn: '😴 শোয়ার সময় হয়েছে',
      titleEn: '😴 Bedtime Reminder',
      bodyBn: `তাহাজ্জুদের জন্য আগে ঘুমিয়ে নিন। (${padTime(bedtime)})`,
      bodyEn: `Sleep early for Tahajjud. (${padTime(bedtime)})`,
    },
    {
      key: 'tahajjud',
      time: tahajjud,
      titleBn: '🤲 তাহাজ্জুদের সময় হয়েছে',
      titleEn: '🤲 Tahajjud Time',
      bodyBn: `তাহাজ্জুদ নামাজের সময় হয়েছে। আল্লাহর কাছে দোয়া করুন। (${padTime(tahajjud)})`,
      bodyEn: `It's time for Tahajjud. Make du'a to Allah. (${padTime(tahajjud)})`,
    },
  ];

  prayers.forEach(p => {
    if(enabled[p.key] !== false){
      scheduleNotification(
        isBn ? p.titleBn : p.titleEn,
        isBn ? p.bodyBn  : p.bodyEn,
        p.time
      );
    }
  });

  return times;
}

// ─────────────────────────────────────────────
// Geolocation
// ─────────────────────────────────────────────
function getLocation(){
  return new Promise((resolve, reject) => {
    if(!navigator.geolocation){
      reject(new Error('Geolocation not supported'));
      return;
    }
    const cached = loadNotifState();
    const now = Date.now();
    // Use cached location if less than 6 hours old
    if(cached.lat && cached.lng && (now - (cached.locTime||0)) < 6*3600*1000){
      resolve({ lat: cached.lat, lng: cached.lng });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const s = loadNotifState();
        s.lat = pos.coords.latitude;
        s.lng = pos.coords.longitude;
        s.locTime = now;
        saveNotifState(s);
        resolve({ lat: s.lat, lng: s.lng });
      },
      err => reject(err),
      { timeout: 10000, maximumAge: 3600000 }
    );
  });
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────
// OneSignal Integration
// ─────────────────────────────────────────────

/**
 * Wait for OneSignal to be ready (loaded via CDN async)
 */
function waitForOneSignal(timeout = 8000){
  return new Promise((resolve) => {
    if(window._oneSignalReady && window.OneSignal){
      resolve(true); return;
    }
    const timer = setTimeout(() => resolve(false), timeout);
    window.addEventListener('onesignal-ready', () => {
      clearTimeout(timer); resolve(true);
    }, { once: true });
  });
}

/**
 * Request OneSignal permission — shows the native OS notification prompt.
 * Returns true if subscribed.
 */
async function requestOneSignalPermission(){
  try{
    const ready = await waitForOneSignal();
    if(!ready || !window.OneSignal) return false;
    await window.OneSignal.Notifications.requestPermission();
    const isSubscribed = await window.OneSignal.User.PushSubscription.optedIn;
    return !!isSubscribed;
  }catch(e){ return false; }
}

/**
 * Schedule a OneSignal local notification at a specific time.
 * OneSignal v16 supports local notifications via the Notifications API.
 * For background delivery we use setTimeout + OneSignal.Notifications.addClickListener
 * as fallback since REST API requires server-side.
 * Primary method: native Notification API (works with OneSignal SW scope).
 */
function scheduleOneSignalNotification(title, body, time){
  const now = Date.now();
  const delay = time.getTime() - now;
  if(delay < 0 || delay > 24 * 60 * 60 * 1000) return;

  const tid = setTimeout(async () => {
    try{
      // Use OneSignal's service worker scope for the notification
      // so it can show even when tab is in background
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: title,
        renotify: true,
        vibrate: [200, 100, 200],
        data: { url: '/' }
      });
    }catch(e){
      // Fallback to basic Notification API
      if(Notification.permission === 'granted'){
        new Notification(title, { body, icon: '/icons/icon-192.png' });
      }
    }
  }, delay);
  _scheduledTimers.push(tid);
}

// Override scheduleNotification with OneSignal-enhanced version
function scheduleNotification(title, body, time){
  const now = Date.now();
  const delay = time.getTime() - now;
  if(delay < 0 || delay > 24 * 60 * 60 * 1000) return;
  // Use SW-backed notification for background support
  scheduleOneSignalNotification(title, body, time);
}

// ─────────────────────────────────────────────
window.PrayerNotif = {
  calcPrayerTimes,
  calcTahajjud,
  calcBedtime,
  schedulePrayerNotifications,
  requestPermission,
  requestOneSignalPermission,
  getLocation,
  loadNotifState,
  saveNotifState,
  clearScheduled,

  /**
   * Full setup: request OneSignal permission → get location → schedule notifications.
   * Uses OneSignal when available, falls back to native Notification API.
   */
  async setup(lang, enabled){
    try{
      // Try OneSignal first (background notifications)
      const osReady = await waitForOneSignal(3000);
      let granted = false;

      if(osReady && window.OneSignal){
        granted = await requestOneSignalPermission();
        if(!granted){
          // Fallback to native
          granted = await requestPermission();
        }
      } else {
        // No OneSignal, use native
        granted = await requestPermission();
      }

      if(!granted) return { error: 'permission_denied' };

      const { lat, lng } = await getLocation();
      const times = schedulePrayerNotifications(lat, lng, lang, enabled || {});

      // Schedule daily re-setup at midnight
      const now = new Date();
      const midnight = new Date(now);
      midnight.setDate(now.getDate() + 1);
      midnight.setHours(0, 1, 0, 0);
      const msUntilMidnight = midnight.getTime() - now.getTime();
      setTimeout(() => window.PrayerNotif.setup(lang, enabled), msUntilMidnight);

      // Save OneSignal player ID for reference
      if(osReady && window.OneSignal){
        try{
          const playerId = window.OneSignal.User.PushSubscription.id;
          if(playerId){
            const ns = loadNotifState();
            ns.osPlayerId = playerId;
            saveNotifState(ns);
          }
        }catch(e){}
      }

      return { success: true, times, lat, lng };
    }catch(err){
      return { error: err.message };
    }
  }
};

})();
