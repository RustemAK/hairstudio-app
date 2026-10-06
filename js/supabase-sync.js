/**
 * HairStudio - Supabase Sync, Auth & Booking API Layer
 * Handles communication with Supabase PostgreSQL/PostgREST and Supabase Auth (GoTrue)
 * Supports full master multi-tenancy, authentication sessions and offline mock fallback.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HairSupabase = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Local storage keys
  const STORAGE_KEYS = {
    URL: 'hairstudio_supabase_url',
    KEY: 'hairstudio_supabase_key',
    SLUG: 'hairstudio_master_slug',
    AUTO_SYNC: 'hairstudio_supabase_autosync',
    MOCK_BOOKINGS: 'hairstudio_mock_cloud_bookings',
    MOCK_SLOTS: 'hairstudio_mock_cloud_slots',
    AUTH_SESSION: 'hairstudio_supabase_auth_session'
  };

  // Safe storage helper
  function getItem(key, fallback = '') {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function setItem(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (e) {
      console.warn('Storage set error:', e);
    }
  }

  function removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  const DEFAULT_SUPABASE_URL = 'https://joknmtpkaijexdaefsud.supabase.co';
  const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impva25tdHBrYWlqZXhkYWVmc3VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNzc5MjMsImV4cCI6MjEwNjg1MzkyM30.1_fL5cC5av_dodTnUfbd0NjUwWX46UR3zDUopEdAK-0';

  // Active configuration
  const config = {
    url: getItem(STORAGE_KEYS.URL, DEFAULT_SUPABASE_URL).trim().replace(/\/+$/, ''),
    key: getItem(STORAGE_KEYS.KEY, DEFAULT_SUPABASE_KEY).trim(),
    slug: getItem(STORAGE_KEYS.SLUG, 'demo').trim().toLowerCase(),
    autoSync: getItem(STORAGE_KEYS.AUTO_SYNC, 'true') === 'true'
  };

  function isConfigured() {
    return Boolean(config.url && config.key && config.url.startsWith('http'));
  }

  // ================= AUTH SESSION HELPER =================
  function parseHashSession() {
    if (typeof window === 'undefined' || !window.location.hash) return null;
    try {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = params.get('expires_in');
      if (accessToken) {
        const session = {
          access_token: accessToken,
          refresh_token: refreshToken || '',
          expires_at: expiresIn ? (Math.floor(Date.now() / 1000) + Number(expiresIn)) : null
        };
        saveStoredSession(session);
        try {
          history.replaceState(null, document.title, window.location.pathname + window.location.search);
        } catch (e) {}
        return session;
      }
    } catch (e) {
      console.warn('Error parsing hash session:', e);
    }
    return null;
  }

  function getStoredSession() {
    const hashSession = parseHashSession();
    if (hashSession) return hashSession;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && parsed.access_token) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function saveStoredSession(session) {
    if (session && session.access_token) {
      setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(session));
    } else {
      removeItem(STORAGE_KEYS.AUTH_SESSION);
    }
  }

  function getHeaders(useAuthToken = false) {
    const session = getStoredSession();
    const token = (useAuthToken && session && session.access_token) ? session.access_token : config.key;
    return {
      'apikey': config.key,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  // ================= DEMO MOCK STORE (For testing before API keys entered) =================
  const mockStore = {
    master: {
      id: 'a0000000-0000-0000-0000-000000000001',
      slug: 'demo',
      name: 'Руслан',
      salon_name: 'HairStudio Barbershop',
      phone: '+7 701 123 45 67',
      city: 'Алматы',
      address: 'пр. Абая 150 (уг. ул. Розыбакиева)',
      instagram: 'hairstudio_kz',
      work_start_hour: 9,
      work_end_hour: 21,
      slot_step_min: 30
    },
    services: [
      { id: 'srv-1', name: 'Мужская стрижка классическая', category: 'Стрижки', duration_min: 45 },
      { id: 'srv-2', name: 'Моделирование бороды и усов', category: 'Стрижки', duration_min: 30 },
      { id: 'srv-3', name: 'Комплекс: Стрижка + Борода', category: 'Стрижки', duration_min: 75 },
      { id: 'srv-4', name: 'Камуфляж седины волос / бороды', category: 'Окрашивание', duration_min: 30 },
      { id: 'srv-5', name: 'SPA-уход за кожей головы и волосами', category: 'Уход', duration_min: 40 },
      { id: 'srv-6', name: 'Детская стрижка (до 10 лет)', category: 'Стрижки', duration_min: 35 }
    ]
  };

  function getMockBookings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MOCK_BOOKINGS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveMockBookings(list) {
    try {
      localStorage.setItem(STORAGE_KEYS.MOCK_BOOKINGS, JSON.stringify(list));
    } catch (e) {}
  }

  function getMockBusySlots() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MOCK_SLOTS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveMockBusySlots(list) {
    try {
      localStorage.setItem(STORAGE_KEYS.MOCK_SLOTS, JSON.stringify(list));
    } catch (e) {}
  }

  // ================= AUTH METHODS (SUPABASE GOTRUE) =================

  /**
   * Register a new Master Account
   */
  async function signUpMaster(data) {
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '').trim();
    if (!email || !password || password.length < 6) {
      return { ok: false, error: 'Укажите корректный Email и пароль (минимум 6 символов)' };
    }

    if (!isConfigured()) {
      return { ok: false, error: 'База данных Supabase не настроена' };
    }

    try {
      const redirectUrl = (typeof window !== 'undefined' && window.location.origin)
        ? `${window.location.origin}${window.location.pathname}`
        : '';
      const signupEndpoint = `${config.url}/auth/v1/signup${redirectUrl ? `?redirect_to=${encodeURIComponent(redirectUrl)}` : ''}`;
      const res = await fetch(signupEndpoint, {
        method: 'POST',
        headers: getHeaders(false),
        body: JSON.stringify({
          email,
          password,
          data: {
            name: data.name || 'Мастер',
            slug: data.slug || 'master'
          }
        })
      });

      const result = await res.json();
      if (!res.ok) {
        return { ok: false, error: result.error_description || result.msg || result.message || 'Ошибка регистрации' };
      }

      const user = result.user || result;
      const session = result.session || (result.access_token ? result : null);

      if (session) {
        saveStoredSession(session);
      }

      // Create master record in public.masters
      const slugVal = String(data.slug || data.name || 'master').toLowerCase().replace(/[^a-z0-9_-]/g, '') || ('m_' + Date.now().toString(36));
      const masterRecord = {
        user_id: user.id,
        slug: slugVal,
        name: data.name || 'Мастер',
        salon_name: data.salon_name || 'HairStudio',
        phone: data.phone || '+7',
        city: data.city || 'Алматы',
        address: data.address || 'ул. Абая 150',
        instagram: data.instagram || '',
        work_start_hour: 9,
        work_end_hour: 21,
        slot_step_min: 30,
        is_active: true
      };

      try {
        const createMasterEndpoint = `${config.url}/rest/v1/masters`;
        const mRes = await fetch(createMasterEndpoint, {
          method: 'POST',
          headers: getHeaders(true),
          body: JSON.stringify(masterRecord)
        });
        if (mRes.ok) {
          const createdList = await mRes.json();
          const createdMaster = Array.isArray(createdList) ? createdList[0] : createdList;
          // Seed standard services for this master
          await seedDefaultServices(createdMaster.id);
          saveSettings(config.url, config.key, createdMaster.slug, true);
          return { ok: true, user, master: createdMaster, session };
        }
      } catch (mErr) {
        console.warn('Master profile auto-insert error:', mErr);
      }

      return { ok: true, user, session, needsConfirm: !session };
    } catch (err) {
      return { ok: false, error: err.message || 'Сетевая ошибка' };
    }
  }

  /**
   * Seed standard services for new master
   */
  async function seedDefaultServices(masterId) {
    if (!masterId) return;
    try {
      const services = [
        { master_id: masterId, name: 'Мужская стрижка классическая', category: 'Стрижки', duration_min: 45, sort_order: 1 },
        { master_id: masterId, name: 'Моделирование бороды и усов', category: 'Стрижки', duration_min: 30, sort_order: 2 },
        { master_id: masterId, name: 'Комплекс: Стрижка + Борода', category: 'Стрижки', duration_min: 75, sort_order: 3 },
        { master_id: masterId, name: 'Камуфляж седины волос / бороды', category: 'Окрашивание', duration_min: 30, sort_order: 4 },
        { master_id: masterId, name: 'SPA-уход за кожей головы и волосами', category: 'Уход', duration_min: 40, sort_order: 5 }
      ];
      await fetch(`${config.url}/rest/v1/master_services`, {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify(services)
      });
    } catch (e) {}
  }

  /**
   * Log In Master with Email and Password
   */
  async function signInMaster(email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();
    if (!cleanEmail || !cleanPassword) {
      return { ok: false, error: 'Укажите Email и пароль' };
    }

    if (!isConfigured()) {
      return { ok: false, error: 'База данных Supabase не настроена' };
    }

    try {
      const tokenEndpoint = `${config.url}/auth/v1/token?grant_type=password`;
      const res = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: getHeaders(false),
        body: JSON.stringify({ email: cleanEmail, password: cleanPassword })
      });

      const session = await res.json();
      if (!res.ok) {
        return { ok: false, error: session.error_description || session.msg || session.message || 'Неверный логин или пароль' };
      }

      saveStoredSession(session);

      // Fetch master profile
      const user = session.user;
      let master = null;
      if (user && user.id) {
        master = await getMasterByUserId(user.id);
      }

      if (master && master.slug) {
        saveSettings(config.url, config.key, master.slug, true);
      }

      return { ok: true, user, session, master };
    } catch (err) {
      return { ok: false, error: err.message || 'Ошибка авторизации' };
    }
  }

  /**
   * Sign Out Master
   */
  async function signOutMaster() {
    const session = getStoredSession();
    if (session && session.access_token && isConfigured()) {
      try {
        await fetch(`${config.url}/auth/v1/logout`, {
          method: 'POST',
          headers: getHeaders(true)
        });
      } catch (e) {}
    }
    saveStoredSession(null);
    return { ok: true };
  }

  /**
   * Refresh Supabase Session using Refresh Token
   */
  async function refreshSession(refreshToken) {
    if (!refreshToken || !isConfigured()) return null;
    try {
      const endpoint = `${config.url}/auth/v1/token?grant_type=refresh_token`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (!res.ok) return null;
      const newSession = await res.json();
      if (newSession && newSession.access_token) {
        saveStoredSession(newSession);
        return newSession;
      }
    } catch (e) {
      console.warn('refreshSession error:', e);
    }
    return null;
  }

  /**
   * Check Current Session / User with Auto-Refresh
   */
  async function getSession() {
    let session = getStoredSession();
    if (!session || !session.access_token) {
      return { authenticated: false, session: null, user: null, master: null };
    }

    // Auto-refresh token if close to expiry (within 2 minutes)
    const nowSec = Math.floor(Date.now() / 1000);
    if (session.expires_at && (session.expires_at - nowSec < 120) && session.refresh_token) {
      const refreshed = await refreshSession(session.refresh_token);
      if (refreshed) session = refreshed;
    }

    // Verify user from cloud
    if (isConfigured()) {
      try {
        const userRes = await fetch(`${config.url}/auth/v1/user`, {
          headers: {
            'apikey': config.key,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        });
        if (userRes.ok) {
          const user = await userRes.json();
          const master = await getMasterByUserId(user.id);
          return { authenticated: true, session, user, master };
        } else if (userRes.status === 401) {
          // Token expired, attempt refresh before logging out
          if (session.refresh_token) {
            const refreshed = await refreshSession(session.refresh_token);
            if (refreshed) {
              const retryUserRes = await fetch(`${config.url}/auth/v1/user`, {
                headers: {
                  'apikey': config.key,
                  'Authorization': `Bearer ${refreshed.access_token}`,
                  'Content-Type': 'application/json'
                }
              });
              if (retryUserRes.ok) {
                const user = await retryUserRes.json();
                const master = await getMasterByUserId(user.id);
                return { authenticated: true, session: refreshed, user, master };
              }
            }
          }
          // Refresh failed, clear session
          saveStoredSession(null);
          return { authenticated: false, session: null, user: null, master: null };
        }
      } catch (e) {
        console.warn('getSession network error, using cached session:', e);
      }
    }

    return { authenticated: true, session, user: session.user, master: null };
  }

  /**
   * Fetch Master Profile linked to a Supabase User ID
   */
  async function getMasterByUserId(userId) {
    if (!userId || !isConfigured()) return null;
    try {
      const endpoint = `${config.url}/rest/v1/masters?user_id=eq.${encodeURIComponent(userId)}&select=*`;
      const res = await fetch(endpoint, { headers: getHeaders(true) });
      if (!res.ok) return null;
      const list = await res.json();
      return Array.isArray(list) && list.length > 0 ? list[0] : null;
    } catch (e) {
      return null;
    }
  }

  // ================= SETTINGS & GENERAL METHODS =================

  /**
   * Save Supabase Connection Settings
   */
  function saveSettings(url, key, slug, autoSync = true) {
    config.url = (url || '').trim().replace(/\/+$/, '');
    config.key = (key || '').trim();
    config.slug = (slug || 'demo').trim().toLowerCase();
    config.autoSync = Boolean(autoSync);

    setItem(STORAGE_KEYS.URL, config.url);
    setItem(STORAGE_KEYS.KEY, config.key);
    setItem(STORAGE_KEYS.SLUG, config.slug);
    setItem(STORAGE_KEYS.AUTO_SYNC, String(config.autoSync));

    return { success: true, isConfigured: isConfigured() };
  }

  /**
   * Test Connection with Supabase
   */
  async function testConnection() {
    if (!isConfigured()) {
      return { ok: false, error: 'URL или Anon Key не указаны' };
    }
    try {
      const endpoint = `${config.url}/rest/v1/masters?select=count&limit=1`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: getHeaders()
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, status: res.status, error: text || 'Ошибка доступа' };
      }
      return { ok: true, message: 'Соединение с Supabase успешно установлено!' };
    } catch (err) {
      return { ok: false, error: err.message || 'Сетевая ошибка' };
    }
  }

  /**
   * Fetch Master Profile by Slug
   */
  async function getMaster(slug) {
    const targetSlug = (slug || config.slug || 'demo').trim().toLowerCase();
    if (!isConfigured()) {
      // Mock master
      const customName = getItem('hairstudio_studio_name', 'HairStudio');
      return {
        ...mockStore.master,
        name: customName || mockStore.master.name,
        slug: targetSlug
      };
    }

    try {
      const endpoint = `${config.url}/rest/v1/masters?slug=eq.${encodeURIComponent(targetSlug)}&is_active=eq.true&select=*`;
      const res = await fetch(endpoint, { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
      // If not found in cloud, return fallback
      return { ...mockStore.master, slug: targetSlug };
    } catch (err) {
      console.warn('Supabase getMaster error, using fallback:', err);
      return { ...mockStore.master, slug: targetSlug };
    }
  }

  /**
   * Fetch Master Services (NO prices returned to public clients!)
   */
  async function getServices(masterId) {
    if (!isConfigured()) {
      // If master has local services saved in IndexedDB, use them without prices!
      if (typeof window !== 'undefined' && window.db && typeof window.db.getServices === 'function') {
        try {
          const localServices = await window.db.getServices();
          if (localServices && localServices.length > 0) {
            return localServices.map(s => ({
              id: String(s.id),
              name: s.name,
              category: s.category || 'Стрижки',
              duration_min: Number(s.duration) || 60
            }));
          }
        } catch (e) {}
      }
      return mockStore.services;
    }

    try {
      const endpoint = `${config.url}/rest/v1/master_services?master_id=eq.${encodeURIComponent(masterId)}&is_active=eq.true&select=id,name,category,duration_min&order=sort_order.asc,name.asc`;
      const res = await fetch(endpoint, { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
      return mockStore.services;
    } catch (err) {
      console.warn('Supabase getServices error, using fallback:', err);
      return mockStore.services;
    }
  }

  /**
   * Fetch Master's Busy Slots for a given Date
   * Uses get_master_busy_intervals RPC to combine calendar slots + pending/confirmed booking requests without leaking PII
   */
  async function getBusySlots(masterId, dateStr) {
    if (!dateStr) return [];

    if (!isConfigured()) {
      if (typeof window !== 'undefined' && window.db && typeof window.db.getAppointments === 'function') {
        try {
          const allApps = await window.db.getAppointments();
          const dayApps = allApps.filter(a => a.date === dateStr && a.status !== 'cancelled');
          return dayApps.map(a => ({
            date: a.date,
            start_time: a.startTime,
            end_time: a.endTime || addMinutes(a.startTime, 60)
          }));
        } catch (e) {}
      }
      const slots = getMockBusySlots().filter(s => s.date === dateStr);
      return slots;
    }

    const targetId = masterId || mockStore.master.id;

    // 1. Try secure RPC function (includes master_busy_slots + active booking_requests)
    try {
      const rpcEndpoint = `${config.url}/rest/v1/rpc/get_master_busy_intervals`;
      const rpcRes = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: getHeaders(false),
        body: JSON.stringify({ p_master_id: targetId, p_date: dateStr })
      });
      if (rpcRes.ok) {
        const rpcList = await rpcRes.json();
        if (Array.isArray(rpcList)) {
          return rpcList;
        }
      }
    } catch (rpcErr) {
      console.warn('RPC get_master_busy_intervals fallback:', rpcErr);
    }

    // 2. Direct fallback on master_busy_slots table
    try {
      const endpoint = `${config.url}/rest/v1/master_busy_slots?master_id=eq.${encodeURIComponent(targetId)}&date=eq.${encodeURIComponent(dateStr)}&select=date,start_time,end_time`;
      const res = await fetch(endpoint, { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      return Array.isArray(list) ? list : [];
    } catch (err) {
      console.warn('Supabase getBusySlots error:', err);
      return [];
    }
  }

  /**
   * Helper: Add minutes to HH:MM string
   */
  function addMinutes(timeStr, mins) {
    if (!timeStr || !timeStr.includes(':')) return '11:00';
    const [h, m] = timeStr.split(':').map(Number);
    const total = (isNaN(h) ? 10 : h) * 60 + (isNaN(m) ? 0 : m) + (Number(mins) || 60);
    const nh = Math.floor(total / 60) % 24;
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  }

  /**
   * Helper: Normalize phone for Kazakhstan / WhatsApp (+7 7XX XXX-XX-XX)
   */
  function normalizePhone(rawPhone) {
    if (!rawPhone) return '';
    let digits = String(rawPhone).replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('8')) {
      digits = '7' + digits.slice(1);
    }
    if (digits.length === 10 && !digits.startsWith('7')) {
      digits = '7' + digits;
    }
    return digits;
  }

  /**
   * Client Submits a Booking Request
   */
  async function submitBooking(bookingData) {
    if (!bookingData.client_name || !bookingData.client_phone || !bookingData.date || !bookingData.start_time) {
      throw new Error('Заполните обязательные поля: Имя, Телефон, Дату и Время');
    }

    let rawPhone = String(bookingData.client_phone).trim();
    let digits = normalizePhone(rawPhone);
    let formattedPhone = rawPhone;
    if (digits.length === 11) {
      formattedPhone = `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
    }

    const payload = {
      master_id: bookingData.master_id || mockStore.master.id,
      client_name: String(bookingData.client_name).trim(),
      client_phone: formattedPhone,
      date: bookingData.date,
      start_time: bookingData.start_time,
      end_time: bookingData.end_time || addMinutes(bookingData.start_time, bookingData.duration_min || 60),
      service_names: String(bookingData.service_names || 'Услуга мастера'),
      duration_min: Number(bookingData.duration_min) || 60,
      client_note: String(bookingData.client_note || '').trim(),
      status: 'pending'
    };

    if (!isConfigured()) {
      const mockList = getMockBookings();
      const mockItem = {
        id: 'mock-bk-' + Date.now(),
        ...payload,
        created_at: new Date().toISOString()
      };
      mockList.unshift(mockItem);
      saveMockBookings(mockList);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hairstudio:new-booking', { detail: mockItem }));
      }
      return { success: true, booking: mockItem, isMock: true };
    }

    try {
      const endpoint = `${config.url}/rest/v1/booking_requests`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Ошибка отправки заявки (${res.status}): ${errorText}`);
      }
      return { success: true, booking: payload };
    } catch (err) {
      console.error('Submit booking failed:', err);
      throw err;
    }
  }

  /**
   * Master Fetches Pending Booking Requests
   */
  async function getPendingBookings(masterId) {
    if (!isConfigured()) {
      const list = getMockBookings();
      return list.filter(b => b.status === 'pending');
    }

    try {
      const targetId = masterId || mockStore.master.id;
      const endpoint = `${config.url}/rest/v1/booking_requests?master_id=eq.${encodeURIComponent(targetId)}&status=eq.pending&order=created_at.desc`;
      const res = await fetch(endpoint, { headers: getHeaders(true) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      return Array.isArray(list) ? list : [];
    } catch (err) {
      console.warn('getPendingBookings error:', err);
      return [];
    }
  }

  /**
   * Master Updates Booking Status ('confirmed' or 'rejected')
   */
  async function updateBookingStatus(bookingId, newStatus) {
    if (!isConfigured()) {
      const list = getMockBookings();
      const item = list.find(b => b.id === bookingId);
      if (item) {
        item.status = newStatus;
        saveMockBookings(list);
      }
      return { success: true };
    }

    try {
      const endpoint = `${config.url}/rest/v1/booking_requests?id=eq.${encodeURIComponent(bookingId)}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: getHeaders(true),
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { success: true };
    } catch (err) {
      console.error('updateBookingStatus error:', err);
      throw err;
    }
  }

  /**
   * Sync Master Schedule (Busy Slots) to Cloud
   */
  async function syncMasterBusySlots(masterId, appointments) {
    if (!Array.isArray(appointments)) return { success: false };

    const today = new Date().toISOString().split('T')[0];
    const activeFutureApps = appointments.filter(a => a.date >= today && a.status !== 'cancelled');

    const slots = activeFutureApps.map(a => ({
      master_id: masterId || mockStore.master.id,
      date: a.date,
      start_time: a.startTime,
      end_time: a.endTime || addMinutes(a.startTime, 60)
    }));

    if (!isConfigured()) {
      saveMockBusySlots(slots);
      return { success: true, count: slots.length, isMock: true };
    }

    try {
      const targetId = masterId || mockStore.master.id;
      const deleteEndpoint = `${config.url}/rest/v1/master_busy_slots?master_id=eq.${encodeURIComponent(targetId)}&date=gte.${today}`;
      await fetch(deleteEndpoint, { method: 'DELETE', headers: getHeaders(true) });

      if (slots.length > 0) {
        const insertEndpoint = `${config.url}/rest/v1/master_busy_slots`;
        const res = await fetch(insertEndpoint, {
          method: 'POST',
          headers: getHeaders(true),
          body: JSON.stringify(slots)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      return { success: true, count: slots.length };
    } catch (err) {
      console.error('syncMasterBusySlots error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Sync Master Services to Cloud (Supabase)
   * Called when master adds/edits/deletes a service locally
   */
  async function syncMasterServices(masterId, localServices) {
    if (!Array.isArray(localServices)) return { success: false };
    if (!isConfigured()) return { success: false, error: 'Not configured' };

    const targetId = masterId || mockStore.master.id;

    const cloudServices = localServices.map(s => ({
      master_id: targetId,
      name: s.name,
      category: s.category || 'Другое',
      duration_min: Number(s.duration) || 60,
      sort_order: Number(s.id) || 0,
      is_active: true
    }));

    try {
      // Delete existing services for this master
      const deleteEndpoint = `${config.url}/rest/v1/master_services?master_id=eq.${encodeURIComponent(targetId)}`;
      await fetch(deleteEndpoint, { method: 'DELETE', headers: getHeaders(true) });

      // Insert current services
      if (cloudServices.length > 0) {
        const insertEndpoint = `${config.url}/rest/v1/master_services`;
        const res = await fetch(insertEndpoint, {
          method: 'POST',
          headers: getHeaders(true),
          body: JSON.stringify(cloudServices)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      return { success: true, count: cloudServices.length };
    } catch (err) {
      console.error('syncMasterServices error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * ==========================================
   * SUPER-ADMIN API METHODS
   * ==========================================
   */

  /**
   * Admin: Fetch all masters
   */
  async function getAllMastersForAdmin() {
    if (!isConfigured()) return [mockStore.master];

    try {
      const endpoint = `${config.url}/rest/v1/masters?select=*&order=created_at.desc`;
      const res = await fetch(endpoint, { headers: getHeaders(true) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      return Array.isArray(list) ? list : [];
    } catch (err) {
      console.error('getAllMastersForAdmin error:', err);
      return [];
    }
  }

  /**
   * Admin: Extend subscription (via RPC with PATCH fallback)
   */
  async function adminExtendSubscription(masterId, months = 1, amount = 2990, paymentMethod = 'kaspi', notes = '') {
    if (!masterId) return { success: false, error: 'No masterId' };
    if (!isConfigured()) return { success: true, isMock: true };

    // 1. Try RPC admin_extend_subscription
    try {
      const rpcEndpoint = `${config.url}/rest/v1/rpc/admin_extend_subscription`;
      const rpcRes = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify({
          p_master_id: masterId,
          p_months: months,
          p_amount: amount,
          p_payment_method: paymentMethod,
          p_notes: notes
        })
      });
      if (rpcRes.ok) {
        const data = await rpcRes.json();
        return data || { success: true };
      }
    } catch (rpcErr) {
      console.warn('RPC admin_extend_subscription failed, using PATCH fallback:', rpcErr);
    }

    // 2. Direct PATCH fallback on masters table
    try {
      const now = new Date();
      let newEnd;
      if (months === 999) {
        newEnd = new Date(now.getFullYear() + 100, now.getMonth(), now.getDate()).toISOString();
      } else {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + months);
        newEnd = futureDate.toISOString();
      }

      const patchEndpoint = `${config.url}/rest/v1/masters?id=eq.${encodeURIComponent(masterId)}`;
      const res = await fetch(patchEndpoint, {
        method: 'PATCH',
        headers: getHeaders(true),
        body: JSON.stringify({
          subscription_status: months === 999 ? 'lifetime' : 'active',
          subscription_plan: months === 1 ? 'monthly' : months === 3 ? 'quarterly' : months === 12 ? 'yearly' : 'lifetime',
          subscription_ends_at: newEnd,
          is_active: true
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { success: true, new_ends_at: newEnd };
    } catch (err) {
      console.error('adminExtendSubscription error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Admin: Toggle Master Active / Blocked Status
   */
  async function adminToggleMasterStatus(masterId, isActive) {
    if (!masterId) return { success: false };
    if (!isConfigured()) return { success: true };

    try {
      const endpoint = `${config.url}/rest/v1/masters?id=eq.${encodeURIComponent(masterId)}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: getHeaders(true),
        body: JSON.stringify({ is_active: Boolean(isActive) })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { success: true };
    } catch (err) {
      console.error('adminToggleMasterStatus error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Admin: Get all subscription payments log
   */
  async function getSubscriptionPayments() {
    if (!isConfigured()) return [];

    try {
      const endpoint = `${config.url}/rest/v1/subscription_payments?select=*,masters(name,slug,salon_name,phone)&order=created_at.desc`;
      const res = await fetch(endpoint, { headers: getHeaders(true) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      return Array.isArray(list) ? list : [];
    } catch (err) {
      console.warn('getSubscriptionPayments error:', err);
      return [];
    }
  }

  // Public API export
  return {
    config,
    isConfigured,
    saveSettings,
    testConnection,
    signUpMaster,
    signInMaster,
    signOutMaster,
    getSession,
    getMasterByUserId,
    getMaster,
    getServices,
    getBusySlots,
    submitBooking,
    getPendingBookings,
    updateBookingStatus,
    syncMasterBusySlots,
    syncMasterServices,
    getAllMastersForAdmin,
    adminExtendSubscription,
    adminToggleMasterStatus,
    getSubscriptionPayments
  };
});
