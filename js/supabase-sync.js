/**
 * HairStudio - Supabase Sync & Booking API Layer
 * Handles communication with Supabase PostgreSQL/PostgREST
 * Includes seamless mock fallback for offline local testing.
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
    MOCK_SLOTS: 'hairstudio_mock_cloud_slots'
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

  // Active configuration
  const config = {
    url: getItem(STORAGE_KEYS.URL, '').trim().replace(/\/+$/, ''),
    key: getItem(STORAGE_KEYS.KEY, '').trim(),
    slug: getItem(STORAGE_KEYS.SLUG, 'demo').trim().toLowerCase(),
    autoSync: getItem(STORAGE_KEYS.AUTO_SYNC, 'true') === 'true'
  };

  function isConfigured() {
    return Boolean(config.url && config.key && config.url.startsWith('http'));
  }

  function getHeaders() {
    return {
      'apikey': config.key,
      'Authorization': `Bearer ${config.key}`,
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

  // ================= API METHODS =================

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
   */
  async function getBusySlots(masterId, dateStr) {
    if (!dateStr) return [];

    if (!isConfigured()) {
      // Check mock cloud slots or local IndexedDB appointments
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

    try {
      const endpoint = `${config.url}/rest/v1/master_busy_slots?master_id=eq.${encodeURIComponent(masterId)}&date=eq.${encodeURIComponent(dateStr)}&select=date,start_time,end_time`;
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
   * Client Submits a Booking Request
   */
  async function submitBooking(bookingData) {
    if (!bookingData.client_name || !bookingData.client_phone || !bookingData.date || !bookingData.start_time) {
      throw new Error('Заполните обязательные поля: Имя, Телефон, Дату и Время');
    }

    const payload = {
      master_id: bookingData.master_id || mockStore.master.id,
      client_name: String(bookingData.client_name).trim(),
      client_phone: String(bookingData.client_phone).trim(),
      date: bookingData.date,
      start_time: bookingData.start_time,
      end_time: bookingData.end_time || addMinutes(bookingData.start_time, bookingData.duration_min || 60),
      service_names: String(bookingData.service_names || 'Услуга мастера'),
      duration_min: Number(bookingData.duration_min) || 60,
      client_note: String(bookingData.client_note || '').trim(),
      status: 'pending'
    };

    if (!isConfigured()) {
      // Save to mock storage
      const mockList = getMockBookings();
      const mockItem = {
        id: 'mock-bk-' + Date.now(),
        ...payload,
        created_at: new Date().toISOString()
      };
      mockList.unshift(mockItem);
      saveMockBookings(mockList);

      // Trigger custom window event if in same tab/browser
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hairstudio:new-booking', { detail: mockItem }));
      }
      return { success: true, booking: mockItem, isMock: true };
    }

    try {
      const endpoint = `${config.url}/rest/v1/booking_requests`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Ошибка отправки заявки (${res.status}): ${errorText}`);
      }
      const created = await res.json();
      return { success: true, booking: Array.isArray(created) ? created[0] : created };
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
      const res = await fetch(endpoint, { headers: getHeaders() });
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
        headers: getHeaders(),
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
   * Only uploads anonymous time blocks (NO personal client details!)
   */
  async function syncMasterBusySlots(masterId, appointments) {
    if (!Array.isArray(appointments)) return { success: false };

    // Format appointments as anonymous slots for today and future dates
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
      // Delete existing future slots
      const deleteEndpoint = `${config.url}/rest/v1/master_busy_slots?master_id=eq.${encodeURIComponent(targetId)}&date=gte.${today}`;
      await fetch(deleteEndpoint, { method: 'DELETE', headers: getHeaders() });

      // Insert fresh slots in batch
      if (slots.length > 0) {
        const insertEndpoint = `${config.url}/rest/v1/master_busy_slots`;
        const res = await fetch(insertEndpoint, {
          method: 'POST',
          headers: getHeaders(),
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

  // Public API export
  return {
    config,
    isConfigured,
    saveSettings,
    testConnection,
    getMaster,
    getServices,
    getBusySlots,
    submitBooking,
    getPendingBookings,
    updateBookingStatus,
    syncMasterBusySlots
  };
});
