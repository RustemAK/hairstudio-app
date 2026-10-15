/**
 * HairStudio PWA - Public Client Booking Controller
 * File: js/book.js
 * Handles master profile display, service selection, slot calculation and booking submission.
 */

(function () {
  'use strict';

  // State
  const bookingState = {
    master: null,
    services: [],
    selectedServiceIds: new Set(),
    selectedDate: '',
    selectedSlot: null,
    busySlots: [],
    activeCategory: 'all'
  };

  const RU_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const RU_DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const RU_MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDisplayFullDate(ymd) {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    return `${d} ${RU_MONTHS_FULL[m - 1]} ${y}`;
  }

  function addMinutesToTime(timeStr, mins) {
    const [h, m] = timeStr.split(':').map(Number);
    const total = h * 60 + m + Number(mins);
    const nh = Math.floor(total / 60) % 24;
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  }

  function timeToMinutes(t) {
    const [h, m] = String(t).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', async () => {
    setupPhoneMask();
    setupCategoryFilters();
    setupFormListeners();
    await loadMasterData();
  });

  // Phone mask for Kazakhstan (+7 (7XX) XXX-XX-XX)
  function setupPhoneMask() {
    const phoneInput = document.getElementById('clientPhoneInput');
    if (!phoneInput) return;

    phoneInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      if (!val) {
        e.target.value = '';
        return;
      }
      if (val[0] === '8') val = '7' + val.slice(1);
      if (val[0] !== '7') val = '7' + val;

      let formatted = '+7';
      if (val.length > 1) formatted += ' (' + val.substring(1, 4);
      if (val.length >= 4) formatted += ') ' + val.substring(4, 7);
      if (val.length >= 7) formatted += '-' + val.substring(7, 9);
      if (val.length >= 9) formatted += '-' + val.substring(9, 11);

      e.target.value = formatted;
      checkFormValidity();
    });
  }

  function isMasterBookingActive(master) {
    if (!master) return false;
    if (master.is_active === false) return false;
    if (master.subscription_status === 'expired') return false;

    if (master.subscription_ends_at) {
      const subEnd = new Date(master.subscription_ends_at).getTime();
      if (subEnd < Date.now()) {
        if (master.trial_ends_at) {
          const trialEnd = new Date(master.trial_ends_at).getTime();
          if (trialEnd < Date.now()) return false;
        } else {
          return false;
        }
      }
    } else if (master.trial_ends_at) {
      const trialEnd = new Date(master.trial_ends_at).getTime();
      if (trialEnd < Date.now()) return false;
    }

    return true;
  }

  function showInactiveBooking(master) {
    const stepsWrap = document.getElementById('bookingStepsWrapper');
    if (stepsWrap) stepsWrap.style.display = 'none';

    const bottomBar = document.querySelector('.bottom-booking-bar');
    if (bottomBar) bottomBar.style.display = 'none';

    const notice = document.getElementById('bookingInactiveNotice');
    if (notice) {
      notice.style.display = 'block';
      const waLink = document.getElementById('linkInactiveWhatsapp');
      if (waLink && master.phone) {
        let cleanPhone = master.phone.replace(/\D/g, '');
        if (cleanPhone.length === 11 && cleanPhone.startsWith('8')) cleanPhone = '7' + cleanPhone.slice(1);
        else if (cleanPhone.length === 10 && !cleanPhone.startsWith('7')) cleanPhone = '7' + cleanPhone;
        waLink.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent('Здравствуйте! Хочу записаться к вам на приём')}`;
      }
    }
  }

  async function loadMasterData() {
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('m') || 'demo';

    try {
      const master = await window.HairSupabase.getMaster(slug);
      if (!master) {
        document.getElementById('masterName').innerText = 'Мастер не найден';
        return;
      }
      bookingState.master = master;
      renderMasterProfile(master);

      if (!isMasterBookingActive(master)) {
        showInactiveBooking(master);
        return;
      }

      const services = await window.HairSupabase.getServices(master.id);
      bookingState.services = services;
      renderServices();

      initDateStrip();
    } catch (err) {
      console.error('Error loading master data:', err);
      document.getElementById('masterName').innerText = 'Мастер временно недоступен';
    }
  }

  function renderMasterProfile(master) {
    document.getElementById('masterName').innerText = master.name || 'Мастер';
    const salonElem = document.getElementById('masterSalon');
    if (salonElem) salonElem.innerText = master.salon_name || 'HairStudio';

    const city = (master.city || '').trim();
    let addr = (master.address || '').trim();
    let addressText = '';
    if (city && addr) {
      if (addr.toLowerCase().startsWith(city.toLowerCase())) {
        addressText = addr;
      } else {
        addressText = `${city}, ${addr}`.trim().replace(/^,\s*/, '');
      }
    } else {
      addressText = city || addr || 'Город уточняйте у мастера';
    }
    document.getElementById('masterAddress').innerText = addressText;
    document.title = `Запись к ${master.name || 'мастеру'} — ${master.salon_name || 'HairStudio'}`;

    // 2GIS link (custom direct URL or automatic search query)
    let customGis = (master.gis_url && master.gis_url.startsWith('http')) ? master.gis_url : '';
    if (!customGis && master.subscription_notes) {
      try {
        const sn = JSON.parse(master.subscription_notes);
        if (sn.gis_url && sn.gis_url.startsWith('http')) customGis = sn.gis_url;
      } catch (e) {}
    }
    const gisTarget = customGis || `https://2gis.kz/search/${encodeURIComponent(addressText)}`;

    const locLink = document.getElementById('linkMasterLocation');
    if (locLink) locLink.href = gisTarget;

    const gisLink = document.getElementById('linkMaster2Gis');
    if (gisLink) gisLink.href = gisTarget;

    // WhatsApp link
    let cleanPhone = (master.phone || '+77011234567').replace(/\D/g, '');
    if (cleanPhone.length === 11 && cleanPhone.startsWith('8')) {
      cleanPhone = '7' + cleanPhone.slice(1);
    } else if (cleanPhone.length === 10 && !cleanPhone.startsWith('7')) {
      cleanPhone = '7' + cleanPhone;
    }
    const waLink = document.getElementById('linkMasterWhatsapp');
    if (waLink) {
      waLink.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent('Здравствуйте! Я по поводу онлайн-записи')}`;
    }

    // Instagram link
    const igLink = document.getElementById('linkMasterInstagram');
    if (igLink) {
      const rawIg = master.instagram || '';
      if (rawIg.trim()) {
        igLink.href = `https://instagram.com/${rawIg.replace('@', '').trim()}`;
        igLink.style.display = 'inline-flex';
      } else {
        igLink.style.display = 'none';
      }
    }
  }

  function setupCategoryFilters() {
    const filterWrap = document.getElementById('serviceCategoryChips');
    if (!filterWrap) return;
    filterWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;
      filterWrap.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bookingState.activeCategory = btn.getAttribute('data-category');
      renderServices();
    });
  }

  function renderServices() {
    const container = document.getElementById('servicesList');
    if (!container) return;
    const filtered = bookingState.services.filter(s => {
      if (bookingState.activeCategory === 'all') return true;
      return s.category === bookingState.activeCategory;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="no-slots-alert">В этой категории нет доступных услуг</div>';
      return;
    }

    container.innerHTML = filtered.map(s => {
      const isSelected = bookingState.selectedServiceIds.has(s.id);
      const dur = s.duration_min >= 60 
        ? `${Math.floor(s.duration_min / 60)} ч ${s.duration_min % 60 ? (s.duration_min % 60) + ' мин' : ''}`.trim()
        : `${s.duration_min} мин`;

      return `
        <div class="service-item ${isSelected ? 'selected' : ''}" data-service-id="${escapeHtml(s.id)}">
          <div class="service-info">
            <div class="service-name">${escapeHtml(s.name)}</div>
            <div class="service-duration">
              <span>⏱️</span>
              <span>${dur}</span>
            </div>
          </div>
          <div class="service-checkbox">${isSelected ? '✓' : ''}</div>
        </div>
      `;
    }).join('');

    // Attach clicks
    container.querySelectorAll('.service-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-service-id');
        if (bookingState.selectedServiceIds.has(id)) {
          bookingState.selectedServiceIds.delete(id);
        } else {
          bookingState.selectedServiceIds.add(id);
        }
        onServicesSelectionChanged();
      });
    });
  }

  function onServicesSelectionChanged() {
    bookingState.selectedSlot = null;
    const timeLabel = document.getElementById('barSelectedTimeLabel');
    if (timeLabel) timeLabel.innerText = 'Выберите время';
    renderServices();
    updateDurationSummary();
    if (bookingState.selectedDate) {
      loadSlotsForDate(bookingState.selectedDate);
    }
    checkFormValidity();
  }

  function getTotalSelectedDuration() {
    let total = 0;
    bookingState.selectedServiceIds.forEach(id => {
      const s = bookingState.services.find(srv => srv.id === id);
      if (s) total += (Number(s.duration_min) || 45);
    });
    return total || 45;
  }

  function updateDurationSummary() {
    const count = bookingState.selectedServiceIds.size;
    const countBadge = document.getElementById('selectedCountBadge');
    if (countBadge) countBadge.innerText = `Выбрано: ${count}`;

    const summaryBox = document.getElementById('durationSummary');
    const durationText = document.getElementById('totalDurationText');
    const barServices = document.getElementById('barSelectedServicesLabel');

    if (count > 0) {
      if (summaryBox) summaryBox.style.display = 'flex';
      const totalMin = getTotalSelectedDuration();
      const durStr = totalMin >= 60
        ? `${Math.floor(totalMin / 60)} ч ${totalMin % 60 ? (totalMin % 60) + ' мин' : ''}`.trim()
        : `${totalMin} мин`;
      if (durationText) durationText.innerText = durStr;
      if (barServices) barServices.innerText = `${count} ${count === 1 ? 'услуга' : (count < 5 ? 'услуги' : 'услуг')} (~${durStr})`;
    } else {
      if (summaryBox) summaryBox.style.display = 'none';
      if (barServices) barServices.innerText = 'Услуги не выбраны';
    }
  }

  function initDateStrip() {
    const strip = document.getElementById('bookingDateStrip');
    if (!strip) return;
    const today = new Date();
    const pills = [];

    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const ymd = formatYMD(d);
      const dayName = i === 0 ? 'Сегодня' : (i === 1 ? 'Завтра' : RU_DAYS[d.getDay()]);

      pills.push(`
        <div class="date-pill ${i === 0 ? 'selected' : ''}" data-ymd="${ymd}">
          <span class="pill-day">${dayName}</span>
          <span class="pill-num">${d.getDate()}</span>
          <span class="pill-month">${RU_MONTHS[d.getMonth()]}</span>
        </div>
      `);
    }

    strip.innerHTML = pills.join('');

    // Select first day by default
    bookingState.selectedDate = formatYMD(today);
    loadSlotsForDate(bookingState.selectedDate);

    strip.querySelectorAll('.date-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        strip.querySelectorAll('.date-pill').forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
        const ymd = pill.getAttribute('data-ymd');
        bookingState.selectedDate = ymd;
        bookingState.selectedSlot = null;
        loadSlotsForDate(ymd);
        checkFormValidity();
      });
    });
  }

  async function loadSlotsForDate(dateStr) {
    const container = document.getElementById('slotsContainer');
    if (!container) return;
    container.innerHTML = '<div class="no-slots-alert">Расчет свободных окон...</div>';

    if (bookingState.selectedServiceIds.size === 0) {
      container.innerHTML = '<div class="no-slots-alert">Сначала выберите хотя бы одну услугу выше ☝️</div>';
      return;
    }

    const masterId = bookingState.master ? bookingState.master.id : null;
    const busySlots = await window.HairSupabase.getBusySlots(masterId, dateStr);
    bookingState.busySlots = busySlots;

    renderSlots(dateStr, busySlots);
  }

  function renderSlots(dateStr, busySlots) {
    const container = document.getElementById('slotsContainer');
    if (!container) return;
    const master = bookingState.master || {};
    const startHour = Number(master.work_start_hour) || 9;
    const endHour = Number(master.work_end_hour) || 21;
    const stepMin = Number(master.slot_step_min) || 30;
    const totalDuration = getTotalSelectedDuration();

    // Check if date is today and filter out past hours
    const now = new Date();
    const isToday = (dateStr === formatYMD(now));
    const currentMinutes = now.getHours() * 60 + now.getMinutes() + 15; // 15 min buffer

    const freeSlots = [];

    for (let m = startHour * 60; m <= (endHour * 60) - totalDuration; m += stepMin) {
      if (isToday && m < currentMinutes) {
        continue;
      }

      const slotStart = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const slotEnd = addMinutesToTime(slotStart, totalDuration);

      const slotStartMin = m;
      const slotEndMin = m + totalDuration;

      // Check overlap with busy slots
      const isOverlapping = Array.isArray(busySlots) && busySlots.some(busy => {
        const bStart = timeToMinutes(busy.start_time);
        const bEnd = timeToMinutes(busy.end_time);
        return Math.max(slotStartMin, bStart) < Math.min(slotEndMin, bEnd);
      });

      if (!isOverlapping) {
        freeSlots.push({ start: slotStart, end: slotEnd });
      }
    }

    if (freeSlots.length === 0) {
      container.innerHTML = '<div class="no-slots-alert">На этот день все места заняты или мастер отдыхает. Пожалуйста, выберите другую дату выше 📅</div>';
      return;
    }

    // Group slots by period
    const morning = freeSlots.filter(s => timeToMinutes(s.start) < 12 * 60);
    const afternoon = freeSlots.filter(s => timeToMinutes(s.start) >= 12 * 60 && timeToMinutes(s.start) < 17 * 60);
    const evening = freeSlots.filter(s => timeToMinutes(s.start) >= 17 * 60);

    let html = '';

    const makeGroup = (title, list) => {
      if (list.length === 0) return '';
      return `
        <div class="slots-period-group">
          <div class="period-title">${title}</div>
          <div class="slots-grid">
            ${list.map(s => {
              const isSel = bookingState.selectedSlot && bookingState.selectedSlot.start === s.start;
              return `<button type="button" class="slot-btn ${isSel ? 'selected' : ''}" data-slot="${s.start}" data-slot-end="${s.end}">${s.start}</button>`;
            }).join('')}
          </div>
        </div>
      `;
    };

    html += makeGroup('🌅 Утро', morning);
    html += makeGroup('☀️ День', afternoon);
    html += makeGroup('🌙 Вечер', evening);

    container.innerHTML = html;

    // Slot click listeners
    container.querySelectorAll('.slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        bookingState.selectedSlot = {
          start: btn.getAttribute('data-slot'),
          end: btn.getAttribute('data-slot-end')
        };
        onSlotSelected();
      });
    });
  }

  function onSlotSelected() {
    const timeLabel = document.getElementById('barSelectedTimeLabel');
    if (bookingState.selectedSlot && bookingState.selectedDate && timeLabel) {
      const [y, m, d] = bookingState.selectedDate.split('-').map(Number);
      timeLabel.innerText = `${d} ${RU_MONTHS[m - 1]}, в ${bookingState.selectedSlot.start}`;
    }
    checkFormValidity();
  }

  function setupFormListeners() {
    const nameInput = document.getElementById('clientNameInput');
    if (nameInput) nameInput.addEventListener('input', checkFormValidity);

    const submitBtn = document.getElementById('btnSubmitBooking');
    if (submitBtn) submitBtn.addEventListener('click', handleSubmitBooking);

    const closeBtn = document.getElementById('btnCloseSuccess');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const modal = document.getElementById('modalBookingSuccess');
        if (modal) modal.classList.remove('active');
      });
    }
  }

  function checkFormValidity() {
    const nameInput = document.getElementById('clientNameInput');
    const phoneInput = document.getElementById('clientPhoneInput');
    const submitBtn = document.getElementById('btnSubmitBooking');
    if (!submitBtn) return;

    const hasServices = bookingState.selectedServiceIds.size > 0;
    const hasSlot = Boolean(bookingState.selectedSlot && bookingState.selectedDate);
    const nameVal = nameInput ? nameInput.value.trim() : '';
    const phoneDigits = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';
    const hasValidPhone = phoneDigits.length >= 11;

    if (hasServices && hasSlot && nameVal.length >= 2 && hasValidPhone) {
      submitBtn.disabled = false;
    } else {
      submitBtn.disabled = true;
    }
  }

  async function handleSubmitBooking() {
    const submitBtn = document.getElementById('btnSubmitBooking');
    if (!submitBtn) return;
    submitBtn.disabled = true;
    submitBtn.innerText = 'Отправка заявки...';

    try {
      const nameInput = document.getElementById('clientNameInput');
      const phoneInput = document.getElementById('clientPhoneInput');
      const noteInput = document.getElementById('clientNoteInput');

      const selectedServices = bookingState.services.filter(s => bookingState.selectedServiceIds.has(s.id));
      const serviceNames = selectedServices.map(s => s.name).join(', ');
      const totalDuration = getTotalSelectedDuration();

      const bookingPayload = {
        master_id: bookingState.master.id,
        client_name: nameInput.value.trim(),
        client_phone: phoneInput.value.trim(),
        date: bookingState.selectedDate,
        start_time: bookingState.selectedSlot.start,
        end_time: bookingState.selectedSlot.end,
        service_names: serviceNames,
        duration_min: totalDuration,
        client_note: noteInput ? noteInput.value.trim() : ''
      };

      const res = await window.HairSupabase.submitBooking(bookingPayload);

      if (res.success) {
        showSuccessModal(bookingPayload);
      } else {
        alert('Не удалось отправить заявку. Попробуйте еще раз или напишите мастеру в WhatsApp напрямую.');
        submitBtn.disabled = false;
        submitBtn.innerText = 'Записаться →';
      }
    } catch (err) {
      console.error('Submit error:', err);
      alert('Ошибка при отправке заявки: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.innerText = 'Записаться →';
    }
  }

  function showSuccessModal(data) {
    document.getElementById('successDateVal').innerText = formatDisplayFullDate(data.date);
    document.getElementById('successTimeVal').innerText = `${data.start_time} - ${data.end_time}`;
    document.getElementById('successServicesVal').innerText = data.service_names;
    document.getElementById('successMasterVal').innerText = bookingState.master.name;
    document.getElementById('successAddressVal').innerText = [bookingState.master?.city, bookingState.master?.address].filter(Boolean).join(', ') || 'Адрес уточняйте у мастера';

    let cleanMasterPhone = (bookingState.master.phone || '+77011234567').replace(/\D/g, '');
    if (cleanMasterPhone.length === 11 && cleanMasterPhone.startsWith('8')) {
      cleanMasterPhone = '7' + cleanMasterPhone.slice(1);
    } else if (cleanMasterPhone.length === 10 && !cleanMasterPhone.startsWith('7')) {
      cleanMasterPhone = '7' + cleanMasterPhone;
    }
    const waMsg = `Здравствуйте, ${bookingState.master.name}! Я оставил(а) онлайн-заявку на запись:\n✂️ Услуга: ${data.service_names}\n📅 Дата: ${formatDisplayFullDate(data.date)}\n⏰ Время: ${data.start_time}\n👤 Имя: ${data.client_name}`;
    
    const waDirectBtn = document.getElementById('btnOpenMasterWhatsappDirect');
    if (waDirectBtn) {
      waDirectBtn.href = `https://wa.me/${cleanMasterPhone}?text=${encodeURIComponent(waMsg)}`;
    }

    const successModal = document.getElementById('modalBookingSuccess');
    if (successModal) successModal.classList.add('active');
    const submitBtn = document.getElementById('btnSubmitBooking');
    if (submitBtn) submitBtn.innerText = 'Заявка отправлена ✓';
  }

})();
