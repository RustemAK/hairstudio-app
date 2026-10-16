/**
 * HairStudio PWA - Calendar, Timeline & Schedule Controller
 * File: js/calendar.js
 * Handles date navigation, hourly timeline, appointment cards, conflict checking and CRUD modals.
 */

import { state } from './state.js';
import { 
  escapeHtml, 
  parseYMD, 
  formatDateToYMD, 
  formatDisplayDate, 
  addMinutesToTime, 
  timesOverlap, 
  cleanPhoneForWhatsapp, 
  cleanPhoneForTel, 
  isAppointmentPast, 
  RU_DAYS, 
  RU_MONTHS, 
  showToast 
} from './utils.js';

export function updateDateNavLabel() {
  const label = document.getElementById('currentDateLabel');
  if (!label) return;
  const d = parseYMD(state.selectedDate);
  const now = new Date();
  const todayStr = formatDateToYMD(now);

  let prefix = '';
  if (state.selectedDate === todayStr) {
    prefix = 'Сегодня, ';
  } else {
    const tmr = new Date(now);
    tmr.setDate(now.getDate() + 1);
    if (state.selectedDate === formatDateToYMD(tmr)) {
      prefix = 'Завтра, ';
    }
  }

  label.innerText = `${prefix}${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;
}

export function setupDateStrip(baseDate = null) {
  const strip = document.getElementById('dateStrip');
  if (!strip) return;

  const activeDate = parseYMD(state.selectedDate);
  const center = baseDate instanceof Date ? baseDate : activeDate;
  const fragment = document.createDocumentFragment();

  const appDates = new Set(state.appointments.map(a => a.date));

  for (let i = -10; i <= 14; i++) {
    const d = new Date(center);
    d.setDate(center.getDate() + i);
    const dateStr = formatDateToYMD(d);
    const hasApps = appDates.has(dateStr);
    const isActive = dateStr === state.selectedDate;

    const card = document.createElement('div');
    card.className = `date-card${isActive ? ' active' : ''}${hasApps ? ' has-appointments' : ''}`;
    card.dataset.date = dateStr;

    card.innerHTML = `
      <span class="day-name">${RU_DAYS[d.getDay()]}</span>
      <span class="day-number">${d.getDate()}</span>
      <span class="date-dot"></span>
    `;

    fragment.appendChild(card);
  }

  strip.innerHTML = '';
  strip.appendChild(fragment);

  updateDateNavLabel();

  requestAnimationFrame(() => {
    const activeCard = strip.querySelector('.date-card.active');
    if (activeCard) {
      const scrollLeft = activeCard.offsetLeft - (strip.clientWidth / 2) + (activeCard.offsetWidth / 2);
      strip.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior: 'smooth'
      });
    }
  });
}

export function renderDateStripDots() {
  const strip = document.getElementById('dateStrip');
  if (!strip) return;
  const appDates = new Set(state.appointments.map(a => a.date));
  strip.querySelectorAll('.date-card').forEach(card => {
    card.classList.toggle('has-appointments', appDates.has(card.dataset.date));
  });
}

export function createAppointmentCard(app) {
  const isCompact = state.cardDensity === 'compact';
  const isPast = isAppointmentPast(app);
  const card = document.createElement('div');
  card.className = 'appointment-card' + (isPast ? ' is-past' : '') + (app.status === 'cancelled' ? ' status-cancelled' : '') + (isCompact ? ' compact' : '');
  card.dataset.appId = app.id;

  const phoneClean = cleanPhoneForWhatsapp(app.clientPhone);
  const waLink = phoneClean ? `https://wa.me/${phoneClean}` : null;
  const telLink = phoneClean ? `tel:${cleanPhoneForTel(app.clientPhone)}` : null;

  if (isCompact) {
    const servicesSummary = (app.services || []).map(s => escapeHtml(s.name)).join(', ');
    const detailsArr = [];
    if (servicesSummary) detailsArr.push(servicesSummary);
    if (app.materialsUsed) detailsArr.push('Расход: ' + escapeHtml(app.materialsUsed));
    if (app.notes) detailsArr.push('📝 ' + escapeHtml(app.notes));
    const detailsText = detailsArr.join(' • ');

    const noteTooltip = [
      app.materialsUsed ? 'Расход: ' + escapeHtml(app.materialsUsed) : '',
      app.notes ? 'Заметка: ' + escapeHtml(app.notes) : ''
    ].filter(Boolean).join(' | ');

    card.innerHTML = `
      <div class="compact-row-top">
        <div class="compact-time-name">
          <span class="compact-time">${app.startTime || '--:--'}–${app.endTime || '--:--'}</span>
          <span class="compact-client-name" title="${escapeHtml(app.clientName)}">${escapeHtml(app.clientName)}</span>
          ${app.channel === 'whatsapp' ? '<span class="compact-channel-icon" title="Запись через WhatsApp">💬</span>' : ''}
          ${noteTooltip ? `<span class="compact-note-indicator" title="${noteTooltip}">📝</span>` : ''}
        </div>
        <div class="compact-quick-actions">
          ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="compact-mini-btn whatsapp" title="WhatsApp">💬</a>` : ''}
          ${telLink ? `<a href="${telLink}" class="compact-mini-btn call" title="Позвонить">📞</a>` : ''}
        </div>
      </div>

      ${detailsText ? `
        <div class="compact-row-bottom">
          <div class="compact-services-text" title="${detailsText}">
            ${detailsText}
          </div>
        </div>
      ` : ''}
    `;
  } else {
    const servicesHtml = (app.services || []).map(s => `
      <span class="service-tag">${escapeHtml(s.name)}</span>
    `).join('');

    card.innerHTML = `
      <div class="card-top">
        <div class="time-slot">
          🕒 ${app.startTime || '--:--'} — ${app.endTime || '--:--'}
          ${app.channel === 'whatsapp' 
            ? '<span class="channel-badge whatsapp" title="Запись через WhatsApp">💬 WhatsApp</span>' 
            : '<span class="channel-badge phone" title="Запись по телефонному звонку">📞 Звонок</span>'}
        </div>
        <div class="quick-actions">
          ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-action-small whatsapp" title="Написать в WhatsApp">💬</a>` : ''}
          ${telLink ? `<a href="${telLink}" class="btn-action-small call" title="Позвонить">📞</a>` : ''}
        </div>
      </div>

      <div class="card-client-info">
        <div class="client-name">${escapeHtml(app.clientName)}</div>
        ${app.clientPhone ? `<div class="client-phone">📞 ${escapeHtml(app.clientPhone)}</div>` : ''}
      </div>

      ${servicesHtml ? `
        <div class="services-tags">
          ${servicesHtml}
        </div>
      ` : ''}

      ${app.materialsUsed ? `
        <div class="materials-note">
          <strong>Расход:</strong> ${escapeHtml(app.materialsUsed)}
        </div>
      ` : ''}

      ${app.notes ? `
        <div class="materials-note" style="border-left-color: var(--accent-gold); margin-top: 4px;">
          📝 ${escapeHtml(app.notes)}
        </div>
      ` : ''}
    `;
  }

  card.style.cursor = 'pointer';
  card.addEventListener('click', (e) => {
    if (e.target.closest('a') || e.target.closest('button')) return;
    openAppointmentModal(app);
  });

  return card;
}

export function renderSchedule() {
  const container = document.getElementById('appointmentsList');
  if (!container) return;
  container.innerHTML = '';

  if (!container._hasScheduleClickListener) {
    container._hasScheduleClickListener = true;
    container.addEventListener('click', (e) => {
      const slotBtn = e.target.closest('.btn-timeline-add-slot');
      if (slotBtn) {
        const hour = slotBtn.getAttribute('data-hour');
        openAppointmentModal(null, null, hour);
        return;
      }
      const expandBtn = e.target.closest('.btn-timeline-expand');
      if (expandBtn) {
        const dir = expandBtn.getAttribute('data-direction');
        const target = parseInt(expandBtn.getAttribute('data-target-hour'), 10);
        if (dir === 'earlier') {
          state.workStartHour = target;
        } else {
          state.workEndHour = target;
        }
        renderSchedule();
        return;
      }
      const card = e.target.closest('.appointment-card');
      if (card && !e.target.closest('a') && !e.target.closest('button')) {
        const appId = card.dataset.appId;
        const app = state.appointments.find(a => String(a.id) === String(appId));
        if (app) openAppointmentModal(app);
      }
    });
  }

  let dayApps = state.appointments.filter(a => a.date === state.selectedDate);

  if (state.scheduleFilter !== 'all') {
    dayApps = dayApps.filter(a => a.status === state.scheduleFilter);
  }

  dayApps.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  if (state.scheduleViewMode === 'timeline') {
    const timeline = document.createElement('div');
    timeline.className = 'timeline-container' + (state.cardDensity === 'compact' ? ' compact' : '');

    const appsByHour = {};
    let minHour = typeof state.workStartHour === 'number' ? state.workStartHour : 8;
    let maxHour = typeof state.workEndHour === 'number' ? state.workEndHour : 22;

    dayApps.forEach(a => {
      if (a.startTime) {
        const h = parseInt(a.startTime.split(':')[0], 10);
        if (!isNaN(h)) {
          if (h < minHour) minHour = Math.max(0, h);
          if (h > maxHour) maxHour = Math.min(23, h);
          if (!appsByHour[h]) appsByHour[h] = [];
          appsByHour[h].push(a);
        }
      }
      if (a.endTime) {
        const eh = parseInt(a.endTime.split(':')[0], 10);
        if (!isNaN(eh) && eh > maxHour) {
          maxHour = Math.min(23, eh);
        }
      }
    });

    if (minHour > maxHour) {
      const tmp = minHour; minHour = maxHour; maxHour = tmp;
    }

    const fragment = document.createDocumentFragment();

    if (minHour > 0) {
      const expandEarlierRow = document.createElement('div');
      expandEarlierRow.className = 'timeline-expand-row';
      const earlierTarget = Math.max(0, minHour - 2);
      expandEarlierRow.innerHTML = `
        <button type="button" class="btn-timeline-expand" data-direction="earlier" data-target-hour="${earlierTarget}" title="Показать более ранние утренние часы">
          ⬆ Показать с ${String(earlierTarget).padStart(2, '0')}:00 (ранние часы)
        </button>
      `;
      fragment.appendChild(expandEarlierRow);
    }

    for (let h = minHour; h <= maxHour; h++) {
      const hourStr = String(h).padStart(2, '0') + ':00';
      const row = document.createElement('div');
      row.className = 'timeline-hour-row';
      row.dataset.hour = String(h);

      const hourApps = appsByHour[h] || [];
      const hasApps = hourApps.length > 0;

      row.innerHTML = `
        <div class="timeline-time-label">
          <span>${hourStr}</span>
        </div>
        <div class="timeline-slot-content ${hasApps ? 'has-appointments' : 'empty-slot'}"></div>
      `;

      const slotContent = row.querySelector('.timeline-slot-content');
      if (hasApps) {
        hourApps.forEach(app => {
          slotContent.appendChild(createAppointmentCard(app));
        });
      } else {
        slotContent.innerHTML = `
          <button type="button" class="btn-timeline-add-slot" data-hour="${hourStr}" title="Нажмите, чтобы записать на ${hourStr}">
            <span class="slot-plus-icon">+</span>
            <span class="slot-free-text">Свободно на ${hourStr}</span>
          </button>
        `;
      }

      fragment.appendChild(row);
    }

    if (maxHour < 23) {
      const expandLaterRow = document.createElement('div');
      expandLaterRow.className = 'timeline-expand-row';
      const laterTarget = Math.min(23, maxHour + 2);
      expandLaterRow.innerHTML = `
        <button type="button" class="btn-timeline-expand" data-direction="later" data-target-hour="${laterTarget}" title="Показать более поздние вечерние часы">
          ⬇ Показать до ${String(laterTarget).padStart(2, '0')}:00 (поздние часы)
        </button>
      `;
      fragment.appendChild(expandLaterRow);
    }

    timeline.appendChild(fragment);
    container.appendChild(timeline);
    return;
  }

  // Classic list view
  if (dayApps.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✂️</div>
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: var(--text-main);">
          На этот день записей нет
        </div>
        <div>Нажмите кнопку «+», чтобы записать клиента на ${formatDisplayDate(state.selectedDate)}</div>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  dayApps.forEach(app => {
    fragment.appendChild(createAppointmentCard(app));
  });
  container.appendChild(fragment);
}

export function openAppointmentModal(app = null, preselectedClient = null, defaultStartTime = null, defaultDate = null) {
  state.editingAppointmentId = app ? app.id : null;
  state.selectedServicesForAppointment.clear();

  const modalTitle = document.getElementById('modalAppointmentTitle');
  const btnDelete = document.getElementById('btnDeleteAppointment');

  if (modalTitle) modalTitle.innerText = app ? 'Редактирование записи' : 'Новая запись';
  if (btnDelete) btnDelete.style.display = app ? 'block' : 'none';

  const clientSelect = document.getElementById('appExistingClientSelect');
  if (clientSelect) {
    clientSelect.innerHTML = '<option value="">-- Выберите клиента из базы --</option>';
    const sortedClients = [...state.clients].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    sortedClients.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name}${c.phone ? ' (' + c.phone + ')' : ''}`;
      clientSelect.appendChild(opt);
    });
  }

  const addServiceSelect = document.getElementById('appAddServiceSelect');
  if (addServiceSelect) {
    addServiceSelect.innerHTML = '<option value="">➕ Выберите услугу для добавления...</option>';
    const categories = {};
    state.services.forEach(s => {
      const cat = s.category || 'Другое';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(s);
    });

    Object.keys(categories).sort().forEach(cat => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = cat;
      categories[cat].forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} — ${Number(s.price).toLocaleString('ru-RU')} ₸ (${s.duration} мин)`;
        optgroup.appendChild(opt);
      });
      addServiceSelect.appendChild(optgroup);
    });

    if (!addServiceSelect._hasChangeListener) {
      addServiceSelect._hasChangeListener = true;
      addServiceSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) return;
        const s = state.services.find(srv => String(srv.id) === String(val));
        if (s) {
          state.selectedServicesForAppointment.add(s.id);
          renderSelectedServicesInModal();
          recalcAppointmentForm();
        }
        e.target.value = '';
      });
    }
  }

  if (app && app.services) {
    app.services.forEach(as => {
      const matched = state.services.find(s => s.name === as.name);
      if (matched) {
        state.selectedServicesForAppointment.add(matched.id);
      }
    });
  }

  renderSelectedServicesInModal();

  if (app) {
    document.getElementById('appId').value = app.id;
    document.getElementById('appDate').value = app.date || state.selectedDate;
    document.getElementById('appStartTime').value = app.startTime || '10:00';
    document.getElementById('appEndTime').value = app.endTime || '11:00';
    document.getElementById('appTotalPrice').value = app.totalPrice || 0;
    document.getElementById('appMaterialsUsed').value = app.materialsUsed || '';
    document.getElementById('appNotes').value = app.notes || '';
    document.getElementById('appStatus').value = app.status || 'scheduled';

    const matchedClient = state.clients.find(c => 
      (app.clientName && c.name.toLowerCase() === app.clientName.toLowerCase()) ||
      (app.clientPhone && c.phone && c.phone === app.clientPhone)
    );

    if (matchedClient && clientSelect) {
      clientSelect.value = matchedClient.id;
    } else {
      const nameInput = document.getElementById('appClientName');
      const phoneInput = document.getElementById('appClientPhone');
      if (nameInput) nameInput.value = app.clientName || '';
      if (phoneInput) phoneInput.value = app.clientPhone || '';
    }
  } else if (preselectedClient) {
    document.getElementById('appId').value = '';
    document.getElementById('appDate').value = state.selectedDate;
    document.getElementById('appStartTime').value = '10:00';
    document.getElementById('appEndTime').value = '11:00';
    document.getElementById('appTotalPrice').value = '';
    document.getElementById('appMaterialsUsed').value = '';
    document.getElementById('appNotes').value = preselectedClient.notes || '';
    document.getElementById('appStatus').value = 'scheduled';
    if (clientSelect) clientSelect.value = preselectedClient.id;
  } else {
    document.getElementById('appId').value = '';
    document.getElementById('appDate').value = defaultDate || state.selectedDate;
    const defaultHour = typeof state.workStartHour === 'number' ? state.workStartHour : 9;
    const initStartTime = defaultStartTime || `${String(defaultHour).padStart(2, '0')}:00`;
    document.getElementById('appStartTime').value = initStartTime;
    const [startH, startM] = initStartTime.split(':').map(Number);
    const endH = String(Math.min(23, (startH || defaultHour) + 1)).padStart(2, '0');
    const endM = String(startM || 0).padStart(2, '0');
    document.getElementById('appEndTime').value = `${endH}:${endM}`;
    document.getElementById('appTotalPrice').value = '';
    document.getElementById('appMaterialsUsed').value = '';
    document.getElementById('appNotes').value = '';
    document.getElementById('appStatus').value = 'scheduled';
    const nameInput = document.getElementById('appClientName');
    const phoneInput = document.getElementById('appClientPhone');
    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
  }

  if (window.openModal) window.openModal('modalAppointment');
}

export function renderSelectedServicesInModal() {
  const container = document.getElementById('appSelectedServicesChips') || document.getElementById('appSelectedServicesContainer');
  if (!container) return;
  container.innerHTML = '';

  state.selectedServicesForAppointment.forEach(id => {
    const s = state.services.find(srv => String(srv.id) === String(id));
    if (!s) return;
    const chip = document.createElement('div');
    chip.className = 'chip active';
    chip.innerHTML = `
      <span>${escapeHtml(s.name)} (${(Number(s.price) || 0).toLocaleString('ru-RU')} ₸)</span>
      <span class="chip-remove" data-id="${s.id}" style="margin-left: 6px; cursor: pointer;">✕</span>
    `;
    chip.querySelector('.chip-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedServicesForAppointment.delete(s.id);
      renderSelectedServicesInModal();
      recalcAppointmentForm();
    });
    container.appendChild(chip);
  });
}

export function recalcAppointmentForm() {
  let totalPrice = 0;
  let totalDuration = 0;

  state.selectedServicesForAppointment.forEach(id => {
    const s = state.services.find(item => String(item.id) === String(id));
    if (s) {
      totalPrice += Number(s.price) || 0;
      totalDuration += Number(s.duration) || 60;
    }
  });

  const priceInput = document.getElementById('appTotalPrice');
  if (priceInput) priceInput.value = totalPrice;

  const defaultH = typeof state.workStartHour === 'number' ? state.workStartHour : 9;
  const fallbackTime = `${String(defaultH).padStart(2, '0')}:00`;
  const startTime = (document.getElementById('appStartTime') ? document.getElementById('appStartTime').value : '') || fallbackTime;
  const endInput = document.getElementById('appEndTime');
  if (endInput) endInput.value = addMinutesToTime(startTime, totalDuration || 60);
}

export async function handleAppointmentSubmit(e, onDataChanged) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('[type="submit"]');
  if (submitBtn) { if (submitBtn.disabled) return; submitBtn.disabled = true; }

  try {
    const selectedServices = [];
    state.selectedServicesForAppointment.forEach(id => {
      const s = state.services.find(item => String(item.id) === String(id));
      if (s) {
        selectedServices.push({
          name: s.name,
          price: Number(s.price),
          duration: Number(s.duration)
        });
      }
    });

    if (selectedServices.length === 0) {
      showToast('Пожалуйста, выберите хотя бы одну услугу', 'error');
      return;
    }

    let clientName = '';
    let clientPhone = '';

    if (state.appointmentClientMode === 'existing') {
      const select = document.getElementById('appExistingClientSelect');
      const selectedId = select ? select.value : '';
      const client = state.clients.find(c => String(c.id) === String(selectedId));
      if (!client) {
        showToast('Пожалуйста, выберите клиента из списка или переключитесь на «Новый клиент»', 'error');
        return;
      }
      clientName = client.name;
      clientPhone = client.phone || '';
    } else {
      clientName = document.getElementById('appClientName').value.trim();
      clientPhone = document.getElementById('appClientPhone').value.trim();
      if (!clientName) {
        showToast('Пожалуйста, введите имя нового клиента', 'error');
        document.getElementById('appClientName').focus();
        return;
      }
    }


    const appDate = document.getElementById('appDate').value;
    const startTime = document.getElementById('appStartTime').value;
    const endTime = document.getElementById('appEndTime').value;

    if (!appDate || !startTime || !endTime) {
      showToast('Пожалуйста, укажите дату и время записи', 'error');
      return;
    }

    const currentAppId = state.editingAppointmentId ? Number(state.editingAppointmentId) : null;
    const overlappingApps = state.appointments.filter(a => {
      if (a.date !== appDate) return false;
      if (currentAppId && a.id === currentAppId) return false;
      if (a.status === 'cancelled') return false;
      return timesOverlap(a.startTime, a.endTime, startTime, endTime);
    });

    if (overlappingApps.length > 0) {
      const conflictList = overlappingApps.map(a => `• ${a.clientName || 'Запись'} (${a.startTime || '??'}–${a.endTime || '??'})`).join('\n');
      const proceed = confirm(`⚠️ Внимание! Наложение по времени с существующей записью:\n${conflictList}\n\nВсё равно сохранить запись?`);
      if (!proceed) return;
    }

    const appData = {
      clientName,
      clientPhone,
      date: appDate,
      startTime,
      endTime,
      services: selectedServices,
      totalPrice: Number(document.getElementById('appTotalPrice').value) || 0,
      materialsUsed: document.getElementById('appMaterialsUsed').value.trim(),
      notes: document.getElementById('appNotes').value.trim(),
      status: document.getElementById('appStatus').value,
      channel: (document.getElementById('appChannel') ? document.getElementById('appChannel').value : '') || 'phone',
      updated_at: new Date().toISOString()
    };

    if (state.editingAppointmentId) {
      appData.id = Number(state.editingAppointmentId);
      await window.db.updateAppointment(appData);
      showToast('Запись успешно обновлена');
    } else {
      appData.createdAt = new Date().toISOString();
      await window.db.addAppointment(appData);
      showToast('Запись клиента успешно создана');
    }

    if (clientName) {
      try {
        await window.db.saveClientIfNotExists({
          name: clientName,
          phone: clientPhone,
          notes: ''
        });
      } catch (cErr) {
        console.warn('Auto-saving client failed:', cErr);
      }
    }

    if (window.closeModal) window.closeModal('modalAppointment');
    if (typeof onDataChanged === 'function') await onDataChanged();
    triggerAutoSyncSlots();
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

export async function handleAppointmentDelete(onDataChanged) {
  if (!state.editingAppointmentId) return;
  if (confirm('Вы уверены, что хотите удалить эту запись?')) {
    await window.db.deleteAppointment(state.editingAppointmentId);
    if (window.closeModal) window.closeModal('modalAppointment');
    showToast('Запись удалена');
    if (typeof onDataChanged === 'function') await onDataChanged();
    triggerAutoSyncSlots();
  }
}

export async function triggerAutoSyncSlots() {
  if (!window.HairSupabase || !window.HairSupabase.isConfigured()) return;
  const masterId = state.currentMaster ? state.currentMaster.id : null;
  try {
    await window.HairSupabase.syncMasterBusySlots(masterId, state.appointments);
  } catch (err) {
    console.warn('Auto-sync slots error:', err);
  }
}
