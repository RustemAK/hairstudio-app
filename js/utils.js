/**
 * HairStudio PWA - Common Utilities & Helpers
 * File: js/utils.js
 * Sanitization, formatting, phone normalization, date utilities, and notification chime.
 */

export const RU_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const RU_DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const RU_MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Safe storage wrapper for incognito & quota safety
export const safeStorage = {
  get(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (e) {
      console.warn('LocalStorage write failed:', e);
    }
  },
  getSession(key, fallback = null) {
    try {
      const val = sessionStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch (e) {
      return fallback;
    }
  },
  setSession(key, val) {
    try {
      sessionStorage.setItem(key, val);
    } catch (e) {
      console.warn('SessionStorage write failed:', e);
    }
  }
};

/**
 * HTML escape helper to prevent XSS injection in innerHTML
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatDateToYMD(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    date = new Date();
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYMD(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0])) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

export function isAppointmentPast(app) {
  if (!app || !app.date) return false;
  const now = new Date();
  const todayStr = formatDateToYMD(now);

  if (app.date < todayStr) return true;
  if (app.date > todayStr) return false;

  const curHours = String(now.getHours()).padStart(2, '0');
  const curMins = String(now.getMinutes()).padStart(2, '0');
  const curTime = `${curHours}:${curMins}`;

  const checkTime = app.endTime || app.startTime;
  if (!checkTime) return false;
  return checkTime <= curTime;
}

export function isAppointmentCompleted(app) {
  if (!app) return false;
  if (app.status === 'cancelled') return false;
  return app.status === 'completed' || isAppointmentPast(app);
}

export function formatDisplayDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (isNaN(date.getTime())) return dateStr;
  return `${date.getDate()} ${RU_MONTHS[date.getMonth()]}, ${RU_DAYS[date.getDay()]}`;
}

export function formatFullDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (isNaN(date.getTime())) return dateStr;
  return `${date.getDate()} ${RU_MONTHS_FULL[date.getMonth()]} ${y}`;
}

export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return `${num.toLocaleString('ru-RU')} ₸`;
}

export function addMinutesToTime(timeStr, minutesToAdd) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
    timeStr = '10:00';
  }
  const [h, m] = timeStr.split(':').map(Number);
  const total = (isNaN(h) ? 10 : h) * 60 + (isNaN(m) ? 0 : m) + (Number(minutesToAdd) || 60);
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

export function timesOverlap(start1, end1, start2, end2) {
  if (!start1 || !end1 || !start2 || !end2) return false;
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  return Math.max(s1, s2) < Math.min(e1, e2);
}

export function cleanPhoneForWhatsapp(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  } else if (digits.length === 10 && !digits.startsWith('7')) {
    digits = '7' + digits;
  }
  return digits;
}

export function cleanPhoneForTel(phone) {
  const digits = cleanPhoneForWhatsapp(phone);
  return digits ? `+${digits}` : '';
}

export function debounce(fn, waitMs = 200) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), waitMs);
  };
}

export function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3200);
}

export function playBookingNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.35); // D6

    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.15);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.7);
  } catch (e) {}
}

// Make critical helpers globally accessible on window for compatibility with existing inline callers
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
  window.showToast = showToast;
  window.formatCurrency = formatCurrency;
  window.safeStorage = safeStorage;
}
