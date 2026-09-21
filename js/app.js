/**
 * HairStudio App Logic
 * Fast, responsive, mobile-first PWA for hair salon / barber masters.
 */

// ================= STATE =================
const state = {
  activeTab: 'schedule',
  selectedDate: new Date().toISOString().split('T')[0],
  scheduleFilter: 'all',
  serviceCategory: 'all',
  expenseCategory: 'all',
  financePeriod: 'month',
  selectedServicesForAppointment: new Set(),
  services: [],
  appointments: [],
  expenses: [],
  clients: [],
  editingAppointmentId: null,
  editingServiceId: null,
  editingExpenseId: null,
  viewingClientId: null,
  appointmentClientMode: 'existing',
  scheduleViewMode: 'timeline'
};

// ================= DATE HELPERS =================
const RU_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const RU_DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const RU_MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function formatDateToYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return `${date.getDate()} ${RU_MONTHS[date.getMonth()]}, ${RU_DAYS[date.getDay()]}`;
}

function formatFullDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return `${date.getDate()} ${RU_MONTHS_FULL[date.getMonth()]} ${y}`;
}

function addMinutesToTime(timeStr, minutesToAdd) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutesToAdd;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

// ================= TOAST NOTIFICATIONS =================
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ================= MODAL CONTROLS =================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

// Close on backdrop click or close buttons
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('active');
  }
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) {
    const modalId = closeBtn.getAttribute('data-close');
    closeModal(modalId);
  }
});

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.db.init();
    await reloadData();
    setupEventListeners();
    setupDateStrip();
    setupServiceWorker();
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Ошибка инициализации базы данных', 'error');
  }
});

async function reloadData() {
  state.services = await window.db.getServices();
  state.appointments = await window.db.getAppointments();
  state.expenses = await window.db.getExpenses();
  state.clients = await window.db.getClients();

  renderTodayBanner();
  renderDateStripDots();
  renderSchedule();
  renderClients();
  renderServices();
  renderExpenses();
  renderFinance();
}

function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('SW registration error:', err);
    });
  }
}

// ================= NAVIGATION & TABS =================
function setupEventListeners() {
  // Bottom nav tab switching
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Schedule Toolbar listeners (Dropdowns)
  const statusFilterSelect = document.getElementById('appointmentStatusFilter');
  if (statusFilterSelect) {
    statusFilterSelect.addEventListener('change', (e) => {
      state.scheduleFilter = e.target.value;
      renderSchedule();
    });
  }

  const viewSelect = document.getElementById('scheduleViewSelect');
  if (viewSelect) {
    viewSelect.addEventListener('change', (e) => {
      state.scheduleViewMode = e.target.value;
      renderSchedule();
    });
  }

  // Appointment service dropdown listener
  const addServiceSelect = document.getElementById('appAddServiceSelect');
  if (addServiceSelect) {
    addServiceSelect.addEventListener('change', (e) => {
      const serviceId = Number(e.target.value);
      if (serviceId) {
        state.selectedServicesForAppointment.add(serviceId);
        renderSelectedServicesInModal();
        recalcAppointmentForm();
        e.target.value = '';
      }
    });
  }

  // Appointment client mode listeners
  document.getElementById('btnClientModeExisting').addEventListener('click', () => setClientMode('existing'));
  document.getElementById('btnClientModeNew').addEventListener('click', () => setClientMode('new'));
  document.getElementById('appExistingClientSelect').addEventListener('change', updateClientSelectionFromDropdown);
  document.getElementById('btnCopyClientFormula').addEventListener('click', copyClientFormulaToNotes);

  const btnBookClient = document.getElementById('btnBookThisClient');
  if (btnBookClient) {
    btnBookClient.addEventListener('click', () => {
      const client = state.clients.find(c => c.id === state.viewingClientId);
      closeModal('modalClientDetails');
      if (client) {
        openAppointmentModal(null, client);
      }
    });
  }

  // FAB button
  const fab = document.getElementById('btnFab');
  fab.addEventListener('click', () => {
    if (state.activeTab === 'schedule' || state.activeTab === 'clients') {
      openAppointmentModal();
    } else if (state.activeTab === 'services') {
      openServiceModal();
    } else if (state.activeTab === 'expenses') {
      openExpenseModal();
    } else if (state.activeTab === 'finance') {
      openAppointmentModal();
    }
  });

  // Settings button
  document.getElementById('btnSettings').addEventListener('click', () => {
    openModal('modalSettings');
  });

  // Status filter handled via schedule-dropdown

  // Service category filter
  document.querySelectorAll('#serviceCategoryFilter .chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#serviceCategoryFilter .chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.serviceCategory = btn.getAttribute('data-category');
      renderServices();
    });
  });

  // Expense category filter
  document.querySelectorAll('#expenseCategoryFilter .chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#expenseCategoryFilter .chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.expenseCategory = btn.getAttribute('data-category');
      renderExpenses();
    });
  });

  // Finance period selector
  document.querySelectorAll('#financePeriodSelector .period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#financePeriodSelector .period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.financePeriod = btn.getAttribute('data-period');
      renderFinance();
    });
  });

  // Client search input
  document.getElementById('clientSearchInput').addEventListener('input', (e) => {
    renderClients(e.target.value.toLowerCase().trim());
  });

  // Forms
  document.getElementById('formAppointment').addEventListener('submit', handleAppointmentSubmit);
  document.getElementById('btnDeleteAppointment').addEventListener('click', handleAppointmentDelete);

  document.getElementById('formService').addEventListener('submit', handleServiceSubmit);
  document.getElementById('btnDeleteService').addEventListener('click', handleServiceDelete);

  document.getElementById('formExpense').addEventListener('submit', handleExpenseSubmit);
  document.getElementById('btnDeleteExpense').addEventListener('click', handleExpenseDelete);

  // Client notes save
  document.getElementById('btnSaveClientNotes').addEventListener('click', handleSaveClientNotes);

  // Backup & restore
  document.getElementById('btnExportBackup').addEventListener('click', handleExportBackup);
  document.getElementById('btnImportBackup').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', handleImportBackup);
  document.getElementById('btnResetDemo').addEventListener('click', handleResetDemo);

  // Auto calculate end time on start time change
  document.getElementById('appStartTime').addEventListener('change', recalcAppointmentEndTime);
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-screen').forEach(s => {
    s.classList.toggle('active', s.id === `tab-${tabId}`);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================= BANNER =================
function renderTodayBanner() {
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('bannerTodayDate').innerText = formatFullDate(todayStr);

  const todayApps = state.appointments.filter(a => a.date === todayStr);
  const completedToday = todayApps.filter(a => a.status === 'completed');
  const revenue = completedToday.reduce((sum, a) => sum + (Number(a.totalPrice) || 0), 0);

  document.getElementById('bannerTodayCount').innerText = todayApps.length;
  document.getElementById('bannerTodayRevenue').innerText = `${revenue.toLocaleString('ru-RU')} ₸`;
}

// ================= DATE STRIP (CALENDAR) =================
function setupDateStrip() {
  const strip = document.getElementById('dateStrip');
  strip.innerHTML = '';

  const centerDate = new Date();
  // Generate 15 days (-3 to +11 days from today)
  for (let i = -3; i <= 11; i++) {
    const d = new Date();
    d.setDate(centerDate.getDate() + i);
    const dateStr = formatDateToYMD(d);

    const card = document.createElement('div');
    card.className = `date-card ${dateStr === state.selectedDate ? 'active' : ''}`;
    card.dataset.date = dateStr;

    card.innerHTML = `
      <span class="day-name">${RU_DAYS[d.getDay()]}</span>
      <span class="day-number">${d.getDate()}</span>
      <span class="date-dot"></span>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.date-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.selectedDate = dateStr;
      renderSchedule();
    });

    strip.appendChild(card);
  }

  // Scroll so that active card is visible
  setTimeout(() => {
    const activeCard = strip.querySelector('.date-card.active');
    if (activeCard) {
      activeCard.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }
  }, 100);
}

function renderDateStripDots() {
  const cards = document.querySelectorAll('.date-card');
  cards.forEach(card => {
    const dateStr = card.dataset.date;
    const hasApps = state.appointments.some(a => a.date === dateStr);
    card.classList.toggle('has-appointments', hasApps);
  });
}

// ================= SCHEDULE / APPOINTMENTS =================
function renderSchedule() {
  const container = document.getElementById('appointmentsList');
  container.innerHTML = '';

  let dayApps = state.appointments.filter(a => a.date === state.selectedDate);

  // Apply status filter
  if (state.scheduleFilter !== 'all') {
    dayApps = dayApps.filter(a => a.status === state.scheduleFilter);
  }

  // Sort by start time
  dayApps.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  // HELPER TO CREATE APPOINTMENT CARD ELEMENT
  function createAppointmentCard(app) {
    const card = document.createElement('div');
    card.className = `appointment-card status-${app.status}`;

    const statusLabels = {
      scheduled: 'Запланировано',
      completed: 'Выполнено',
      cancelled: 'Отменено'
    };

    // Services tags HTML
    const servicesHtml = (app.services || []).map(s => `
      <span class="service-tag">${s.name} (${s.price} ₸)</span>
    `).join('');

    // Phone actions
    const phoneClean = (app.clientPhone || '').replace(/\D/g, '');
    const waLink = phoneClean ? `https://wa.me/${phoneClean}` : null;
    const telLink = phoneClean ? `tel:+${phoneClean}` : null;

    card.innerHTML = `
      <div class="card-top">
        <div class="time-slot">
          🕒 ${app.startTime || '--:--'} — ${app.endTime || '--:--'}
        </div>
        <span class="badge-status ${app.status}">
          ${statusLabels[app.status] || app.status}
        </span>
      </div>

      <div class="card-client-info">
        <div class="client-name">${app.clientName}</div>
        ${app.clientPhone ? `<div class="client-phone">📞 ${app.clientPhone}</div>` : ''}
      </div>

      <div class="services-tags">
        ${servicesHtml}
      </div>

      ${app.materialsUsed ? `
        <div class="materials-note">
          🧪 <strong>Расход:</strong> ${app.materialsUsed}
        </div>
      ` : ''}

      ${app.notes ? `
        <div class="materials-note" style="border-left-color: var(--accent-gold); margin-top: 4px;">
          📝 ${app.notes}
        </div>
      ` : ''}

      <div class="card-footer">
        <div class="price-tag">${(Number(app.totalPrice) || 0).toLocaleString('ru-RU')} ₸</div>
        <div class="quick-actions">
          ${app.status === 'scheduled' ? `
            <button class="btn-action-small complete btn-complete-app" title="Отметить выполненным" aria-label="Завершить запись">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
          ` : ''}
          ${waLink ? `<a href="${waLink}" target="_blank" class="btn-action-small whatsapp" title="Написать в WhatsApp">💬</a>` : ''}
          ${telLink ? `<a href="${telLink}" class="btn-action-small call" title="Позвонить">📞</a>` : ''}
          <button class="btn-action-small btn-edit-app" title="Редактировать">✏️</button>
        </div>
      </div>
    `;

    const btnComplete = card.querySelector('.btn-complete-app');
    if (btnComplete) {
      btnComplete.addEventListener('click', async (e) => {
        e.stopPropagation();
        app.status = 'completed';
        app.updatedAt = new Date().toISOString();
        await window.db.updateAppointment(app);
        showToast(`Запись «${app.clientName}» выполнена и оплачена!`);
        await reloadData();
      });
    }

    card.querySelector('.btn-edit-app').addEventListener('click', (e) => {
      e.stopPropagation();
      openAppointmentModal(app);
    });

    return card;
  }

  // MODE 1: HOURLY TIMELINE / CALENDAR VIEW
  if (state.scheduleViewMode === 'timeline') {
    const timeline = document.createElement('div');
    timeline.className = 'timeline-container';

    // Determine working hours (default 09:00 to 21:00, or wider if earlier/later apps exist)
    let minHour = 9;
    let maxHour = 21;

    dayApps.forEach(a => {
      if (a.startTime) {
        const h = parseInt(a.startTime.split(':')[0], 10);
        if (!isNaN(h)) {
          if (h < minHour) minHour = Math.max(0, h);
          if (h > maxHour) maxHour = Math.min(23, h);
        }
      }
      if (a.endTime) {
        const h = parseInt(a.endTime.split(':')[0], 10);
        if (!isNaN(h)) {
          if (h > maxHour) maxHour = Math.min(23, h);
        }
      }
    });

    for (let hour = minHour; hour <= maxHour; hour++) {
      const hourStr = String(hour).padStart(2, '0') + ':00';
      const nextHourStr = String(hour + 1).padStart(2, '0') + ':00';

      const row = document.createElement('div');
      row.className = 'timeline-hour-row';

      // Left time column
      const timeCol = document.createElement('div');
      timeCol.className = 'timeline-time-col';
      timeCol.innerText = hourStr;

      // Right content column
      const contentCol = document.createElement('div');
      contentCol.className = 'timeline-content-col';

      // Find appointments starting in this hour
      const hourApps = dayApps.filter(a => {
        if (!a.startTime) return false;
        const [h] = a.startTime.split(':').map(Number);
        return h === hour;
      });

      if (hourApps.length > 0) {
        hourApps.forEach(app => {
          contentCol.appendChild(createAppointmentCard(app));
        });
      } else {
        // Empty slot - click to add appointment at this time
        const emptySlot = document.createElement('div');
        emptySlot.className = 'timeline-empty-slot';
        emptySlot.innerHTML = `
          <span class="empty-slot-plus">+</span>
          <span>Свободно на ${hourStr} <span style="font-size: 11px; opacity: 0.7;">(нажмите для записи)</span></span>
        `;
        emptySlot.addEventListener('click', () => {
          openAppointmentModal(null, null, hourStr);
        });
        contentCol.appendChild(emptySlot);
      }

      row.appendChild(timeCol);
      row.appendChild(contentCol);
      timeline.appendChild(row);
    }

    container.appendChild(timeline);
    return;
  }

  // MODE 2: CLASSIC LIST VIEW
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

  dayApps.forEach(app => {
    container.appendChild(createAppointmentCard(app));
  });
}

function openAppointmentModal(app = null, preselectedClient = null, defaultStartTime = null) {
  state.editingAppointmentId = app ? app.id : null;
  state.selectedServicesForAppointment.clear();

  const modalTitle = document.getElementById('modalAppointmentTitle');
  const btnDelete = document.getElementById('btnDeleteAppointment');

  modalTitle.innerText = app ? 'Редактирование записи' : 'Новая запись';
  btnDelete.style.display = app ? 'block' : 'none';

  // Populate existing clients dropdown
  const clientsCountEl = document.getElementById('existingClientsCount');
  if (clientsCountEl) clientsCountEl.innerText = state.clients.length;

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

  // Fill services dropdown with optgroups
  const addServiceSelect = document.getElementById('appAddServiceSelect');
  if (addServiceSelect) {
    addServiceSelect.innerHTML = '<option value="">➕ Выберите услугу для добавления...</option>';
    
    // Group services by category
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
  }

  // If editing existing appointment, pre-select its services
  if (app && app.services) {
    app.services.forEach(as => {
      const matched = state.services.find(s => s.name === as.name);
      if (matched) {
        state.selectedServicesForAppointment.add(matched.id);
      }
    });
  }

  // Render selected chips
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

    // Find if client exists in database
    const matchedClient = state.clients.find(c => 
      (app.clientName && c.name.toLowerCase() === app.clientName.toLowerCase()) ||
      (app.clientPhone && c.phone && c.phone === app.clientPhone)
    );

    if (matchedClient) {
      setClientMode('existing');
      document.getElementById('appExistingClientSelect').value = matchedClient.id;
      updateClientSelectionFromDropdown();
    } else {
      setClientMode('new');
      document.getElementById('appClientName').value = app.clientName || '';
      document.getElementById('appClientPhone').value = app.clientPhone || '';
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

    setClientMode('existing');
    document.getElementById('appExistingClientSelect').value = preselectedClient.id;
    updateClientSelectionFromDropdown();
  } else {
    document.getElementById('appId').value = '';
    document.getElementById('appDate').value = state.selectedDate;
    const initStartTime = defaultStartTime || '10:00';
    document.getElementById('appStartTime').value = initStartTime;
    const [startH, startM] = initStartTime.split(':').map(Number);
    const endH = String(Math.min(23, (startH || 10) + 1)).padStart(2, '0');
    const endM = String(startM || 0).padStart(2, '0');
    document.getElementById('appEndTime').value = `${endH}:${endM}`;
    document.getElementById('appTotalPrice').value = '';
    document.getElementById('appMaterialsUsed').value = '';
    document.getElementById('appNotes').value = '';
    document.getElementById('appStatus').value = 'scheduled';

    if (state.clients.length > 0) {
      setClientMode('existing');
      document.getElementById('appExistingClientSelect').value = '';
      updateClientSelectionFromDropdown();
    } else {
      setClientMode('new');
      document.getElementById('appClientName').value = '';
      document.getElementById('appClientPhone').value = '';
    }
  }

  openModal('modalAppointment');
}

function recalcAppointmentForm() {
  let totalPrice = 0;
  let totalDuration = 0;

  state.selectedServicesForAppointment.forEach(id => {
    const s = state.services.find(item => item.id === id);
    if (s) {
      totalPrice += Number(s.price) || 0;
      totalDuration += Number(s.duration) || 60;
    }
  });

  document.getElementById('appTotalPrice').value = totalPrice;

  const startTime = document.getElementById('appStartTime').value || '10:00';
  document.getElementById('appEndTime').value = addMinutesToTime(startTime, totalDuration || 60);
}

function recalcAppointmentEndTime() {
  let totalDuration = 0;
  state.selectedServicesForAppointment.forEach(id => {
    const s = state.services.find(item => item.id === id);
    if (s) totalDuration += Number(s.duration) || 60;
  });
  const startTime = document.getElementById('appStartTime').value || '10:00';
  document.getElementById('appEndTime').value = addMinutesToTime(startTime, totalDuration || 60);
}

async function handleAppointmentSubmit(e) {
  e.preventDefault();

  const selectedServices = [];
  state.selectedServicesForAppointment.forEach(id => {
    const s = state.services.find(item => item.id === id);
    if (s) {
      selectedServices.push({
        name: s.name,
        price: Number(s.price),
        duration: Number(s.duration)
      });
    }
  });

  const clientName = document.getElementById('appClientName').value.trim();
  if (!clientName) {
    showToast(state.appointmentClientMode === 'existing' 
      ? 'Пожалуйста, выберите клиента из списка или переключитесь на «Новый клиент»' 
      : 'Пожалуйста, введите имя нового клиента', 'error');
    return;
  }

  if (selectedServices.length === 0) {
    showToast('Пожалуйста, выберите хотя бы одну услугу', 'error');
    return;
  }

  const appData = {
    clientName: document.getElementById('appClientName').value.trim(),
    clientPhone: document.getElementById('appClientPhone').value.trim(),
    date: document.getElementById('appDate').value,
    startTime: document.getElementById('appStartTime').value,
    endTime: document.getElementById('appEndTime').value,
    services: selectedServices,
    totalPrice: Number(document.getElementById('appTotalPrice').value) || 0,
    materialsUsed: document.getElementById('appMaterialsUsed').value.trim(),
    notes: document.getElementById('appNotes').value.trim(),
    status: document.getElementById('appStatus').value,
    updatedAt: new Date().toISOString()
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

  closeModal('modalAppointment');
  await reloadData();
}

async function handleAppointmentDelete() {
  if (!state.editingAppointmentId) return;
  if (confirm('Вы уверены, что хотите удалить эту запись?')) {
    await window.db.deleteAppointment(state.editingAppointmentId);
    closeModal('modalAppointment');
    showToast('Запись удалена');
    await reloadData();
  }
}

// ================= SERVICES =================
function renderServices() {
  const container = document.getElementById('servicesList');
  container.innerHTML = '';

  let list = state.services;
  if (state.serviceCategory !== 'all') {
    list = list.filter(s => s.category === state.serviceCategory);
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✂️</div>
        <div>В этой категории пока нет услуг</div>
      </div>
    `;
    return;
  }

  list.forEach(s => {
    const card = document.createElement('div');
    card.className = 'data-item-card';
    card.innerHTML = `
      <div class="item-left">
        <div class="item-title">${s.name}</div>
        <div class="item-meta">
          <span>🏷️ ${s.category}</span>
          <span>⏱️ ${s.duration} мин</span>
        </div>
      </div>
      <div class="item-right">
        <div class="item-price">${(Number(s.price) || 0).toLocaleString('ru-RU')} ₸</div>
        <button class="btn-action-small btn-edit-service" title="Редактировать">✏️</button>
      </div>
    `;

    card.querySelector('.btn-edit-service').addEventListener('click', () => {
      openServiceModal(s);
    });

    container.appendChild(card);
  });
}

function openServiceModal(s = null) {
  state.editingServiceId = s ? s.id : null;
  document.getElementById('modalServiceTitle').innerText = s ? 'Редактировать услугу' : 'Новая услуга';
  document.getElementById('btnDeleteService').style.display = s ? 'block' : 'none';

  if (s) {
    document.getElementById('serviceId').value = s.id;
    document.getElementById('serviceName').value = s.name;
    document.getElementById('serviceCategory').value = s.category;
    document.getElementById('servicePrice').value = s.price;
    document.getElementById('serviceDuration').value = s.duration;
  } else {
    document.getElementById('serviceId').value = '';
    document.getElementById('serviceName').value = '';
    document.getElementById('serviceCategory').value = 'Стрижки';
    document.getElementById('servicePrice').value = '';
    document.getElementById('serviceDuration').value = 60;
  }

  openModal('modalService');
}

async function handleServiceSubmit(e) {
  e.preventDefault();
  const serviceData = {
    name: document.getElementById('serviceName').value.trim(),
    category: document.getElementById('serviceCategory').value,
    price: Number(document.getElementById('servicePrice').value) || 0,
    duration: Number(document.getElementById('serviceDuration').value) || 60
  };

  if (state.editingServiceId) {
    serviceData.id = Number(state.editingServiceId);
    await window.db.updateService(serviceData);
    showToast('Услуга обновлена');
  } else {
    await window.db.addService(serviceData);
    showToast('Услуга добавлена в прайс-лист');
  }

  closeModal('modalService');
  await reloadData();
}

async function handleServiceDelete() {
  if (!state.editingServiceId) return;
  if (confirm('Удалить эту услугу из прайс-листа?')) {
    await window.db.deleteService(state.editingServiceId);
    closeModal('modalService');
    showToast('Услуга удалена');
    await reloadData();
  }
}

// ================= EXPENSES & MATERIALS =================
function renderExpenses() {
  const container = document.getElementById('expensesList');
  container.innerHTML = '';

  // Calculate this month's expenses
  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthExpenses = state.expenses.filter(e => (e.date || '').startsWith(currentMonthPrefix));
  const monthTotal = monthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  document.getElementById('expensesMonthTotal').innerText = `${monthTotal.toLocaleString('ru-RU')} ₸`;

  let list = state.expenses;
  if (state.expenseCategory !== 'all') {
    list = list.filter(e => e.category === state.expenseCategory);
  }

  // Sort by date desc
  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div>В этой категории расходов нет</div>
      </div>
    `;
    return;
  }

  list.forEach(exp => {
    const card = document.createElement('div');
    card.className = 'data-item-card';
    card.innerHTML = `
      <div class="item-left">
        <div class="item-title">${exp.title}</div>
        <div class="item-meta">
          <span>📅 ${formatDisplayDate(exp.date)}</span>
          <span>📁 ${exp.category}</span>
          ${exp.quantity ? `<span>🔢 ${exp.quantity}</span>` : ''}
        </div>
        ${exp.notes ? `<div style="font-size: 11px; color: var(--text-subtle); margin-top: 2px;">${exp.notes}</div>` : ''}
      </div>
      <div class="item-right">
        <div class="item-price expense">-${(Number(exp.amount) || 0).toLocaleString('ru-RU')} ₸</div>
        <button class="btn-action-small btn-edit-exp" title="Редактировать">✏️</button>
      </div>
    `;

    card.querySelector('.btn-edit-exp').addEventListener('click', () => {
      openExpenseModal(exp);
    });

    container.appendChild(card);
  });
}

function openExpenseModal(exp = null) {
  state.editingExpenseId = exp ? exp.id : null;
  document.getElementById('modalExpenseTitle').innerText = exp ? 'Редактировать расход' : 'Новая закупка';
  document.getElementById('btnDeleteExpense').style.display = exp ? 'block' : 'none';

  if (exp) {
    document.getElementById('expenseId').value = exp.id;
    document.getElementById('expenseTitle').value = exp.title;
    document.getElementById('expenseCategory').value = exp.category;
    document.getElementById('expenseAmount').value = exp.amount;
    document.getElementById('expenseQuantity').value = exp.quantity || '';
    document.getElementById('expenseDate').value = exp.date;
    document.getElementById('expenseNotes').value = exp.notes || '';
  } else {
    document.getElementById('expenseId').value = '';
    document.getElementById('expenseTitle').value = '';
    document.getElementById('expenseCategory').value = 'Красители';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseQuantity').value = '';
    document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('expenseNotes').value = '';
  }

  openModal('modalExpense');
}

async function handleExpenseSubmit(e) {
  e.preventDefault();
  const expData = {
    title: document.getElementById('expenseTitle').value.trim(),
    category: document.getElementById('expenseCategory').value,
    amount: Number(document.getElementById('expenseAmount').value) || 0,
    quantity: document.getElementById('expenseQuantity').value.trim(),
    date: document.getElementById('expenseDate').value,
    notes: document.getElementById('expenseNotes').value.trim()
  };

  if (state.editingExpenseId) {
    expData.id = Number(state.editingExpenseId);
    await window.db.updateExpense(expData);
    showToast('Расход обновлен');
  } else {
    await window.db.addExpense(expData);
    showToast('Закупка материалов сохранена');
  }

  closeModal('modalExpense');
  await reloadData();
}

async function handleExpenseDelete() {
  if (!state.editingExpenseId) return;
  if (confirm('Удалить эту запись о расходе?')) {
    await window.db.deleteExpense(state.editingExpenseId);
    closeModal('modalExpense');
    showToast('Расход удален');
    await reloadData();
  }
}

// ================= CLIENTS =================
function renderClients(searchQuery = '') {
  const container = document.getElementById('clientsList');
  container.innerHTML = '';

  let list = state.clients;
  if (searchQuery) {
    list = list.filter(c => 
      (c.name || '').toLowerCase().includes(searchQuery) ||
      (c.phone || '').includes(searchQuery)
    );
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <div>Клиенты не найдены</div>
      </div>
    `;
    return;
  }

  list.forEach(c => {
    // Count client visits
    const clientApps = state.appointments.filter(a => 
      (c.phone && a.clientPhone === c.phone) || 
      (a.clientName.toLowerCase() === c.name.toLowerCase())
    );
    const totalSpent = clientApps
      .filter(a => a.status === 'completed')
      .reduce((sum, a) => sum + (Number(a.totalPrice) || 0), 0);

    const phoneClean = (c.phone || '').replace(/\D/g, '');
    const waLink = phoneClean ? `https://wa.me/${phoneClean}` : null;
    const telLink = phoneClean ? `tel:+${phoneClean}` : null;

    const card = document.createElement('div');
    card.className = 'data-item-card';
    card.innerHTML = `
      <div class="item-left">
        <div class="item-title">${c.name}</div>
        <div class="item-meta">
          <span>📞 ${c.phone || 'без телефона'}</span>
          <span>📅 ${clientApps.length} визит(ов)</span>
          <span>💰 ${totalSpent.toLocaleString('ru-RU')} ₸</span>
        </div>
        ${c.notes ? `<div style="font-size: 11px; color: var(--accent-gold-light); margin-top: 2px;">🎨 ${c.notes}</div>` : ''}
      </div>
      <div class="item-right">
        <div class="quick-actions">
          ${waLink ? `<a href="${waLink}" target="_blank" class="btn-action-small whatsapp" title="WhatsApp">💬</a>` : ''}
          ${telLink ? `<a href="${telLink}" class="btn-action-small call" title="Позвонить">📞</a>` : ''}
          <button class="btn-action-small btn-view-client" title="Карточка клиента">📋</button>
        </div>
      </div>
    `;

    card.querySelector('.btn-view-client').addEventListener('click', () => {
      openClientDetailsModal(c, clientApps);
    });

    container.appendChild(card);
  });
}

function openClientDetailsModal(client, clientApps) {
  state.viewingClientId = client.id;
  document.getElementById('clientDetailsName').innerText = client.name;
  document.getElementById('clientDetailsPhone').innerText = client.phone || 'Телефон не указан';
  document.getElementById('clientDetailsVisitsCount').innerText = `${clientApps.length} визит(ов) • Всего: ${clientApps.filter(a => a.status === 'completed').reduce((sum, a) => sum + (Number(a.totalPrice) || 0), 0).toLocaleString('ru-RU')} ₸`;
  document.getElementById('clientDetailsNotes').value = client.notes || '';

  // Actions
  const phoneClean = (client.phone || '').replace(/\D/g, '');
  const actionsBox = document.getElementById('clientDetailsActions');
  actionsBox.innerHTML = `
    ${phoneClean ? `<a href="https://wa.me/${phoneClean}" target="_blank" class="btn-action-small whatsapp">💬</a>` : ''}
    ${phoneClean ? `<a href="tel:+${phoneClean}" class="btn-action-small call">📞</a>` : ''}
  `;

  // History list
  const histBox = document.getElementById('clientVisitHistory');
  histBox.innerHTML = '';
  if (clientApps.length === 0) {
    histBox.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">Записей пока нет</div>';
  } else {
    clientApps.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    clientApps.forEach(a => {
      const item = document.createElement('div');
      item.style.cssText = 'background: var(--bg-card); padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 13px;';
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-weight: 600;">
          <span>${formatDisplayDate(a.date)} ${a.startTime}</span>
          <span style="color: var(--accent-gold-light);">${(Number(a.totalPrice) || 0).toLocaleString('ru-RU')} ₸</span>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
          ${(a.services || []).map(s => s.name).join(', ')}
        </div>
        ${a.materialsUsed ? `<div style="font-size: 11px; color: var(--accent-gold); margin-top: 2px;">🧪 ${a.materialsUsed}</div>` : ''}
      `;
      histBox.appendChild(item);
    });
  }

  openModal('modalClientDetails');
}

async function handleSaveClientNotes() {
  if (!state.viewingClientId) return;
  const client = state.clients.find(c => c.id === state.viewingClientId);
  if (!client) return;

  client.notes = document.getElementById('clientDetailsNotes').value.trim();
  await window.db.updateClient(client);
  showToast('Формулы и заметки сохранены');
  await reloadData();
}

// ================= FINANCE & PROFIT =================
function renderFinance() {
  const period = state.financePeriod;
  const now = new Date();
  const todayStr = formatDateToYMD(now);

  let filteredAppointments = [];
  let filteredExpenses = [];

  if (period === 'today') {
    filteredAppointments = state.appointments.filter(a => a.date === todayStr);
    filteredExpenses = state.expenses.filter(e => e.date === todayStr);
  } else if (period === 'week') {
    // Current week
    const firstDay = new Date(now);
    const dayIndex = (now.getDay() + 6) % 7; // Monday = 0
    firstDay.setDate(now.getDate() - dayIndex);
    const firstDayStr = formatDateToYMD(firstDay);

    filteredAppointments = state.appointments.filter(a => a.date >= firstDayStr && a.date <= todayStr);
    filteredExpenses = state.expenses.filter(e => e.date >= firstDayStr && e.date <= todayStr);
  } else if (period === 'month') {
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    filteredAppointments = state.appointments.filter(a => (a.date || '').startsWith(monthPrefix));
    filteredExpenses = state.expenses.filter(e => (e.date || '').startsWith(monthPrefix));
  } else {
    // All time
    filteredAppointments = state.appointments;
    filteredExpenses = state.expenses;
  }

  // Calculate revenue (only completed appointments)
  const completedApps = filteredAppointments.filter(a => a.status === 'completed');
  const revenue = completedApps.reduce((sum, a) => sum + (Number(a.totalPrice) || 0), 0);

  // Calculate expenses
  const expensesTotal = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // Net Profit
  const netProfit = revenue - expensesTotal;

  // Average Check
  const avgCheck = completedApps.length > 0 ? Math.round(revenue / completedApps.length) : 0;

  // Margin
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

  // DOM Updates
  const profitElem = document.getElementById('statNetProfit');
  profitElem.innerText = `${netProfit.toLocaleString('ru-RU')} ₸`;
  profitElem.className = `stat-card-value ${netProfit >= 0 ? 'profit' : 'expense'}`;

  document.getElementById('statTotalRevenue').innerText = `${revenue.toLocaleString('ru-RU')} ₸`;
  document.getElementById('statAppointmentsCount').innerText = `${completedApps.length} вып. записей`;

  document.getElementById('statTotalExpenses').innerText = `${expensesTotal.toLocaleString('ru-RU')} ₸`;
  document.getElementById('statExpensesCount').innerText = `${filteredExpenses.length} закупок`;

  document.getElementById('statAvgCheck').innerText = `${avgCheck.toLocaleString('ru-RU')} ₸`;
  document.getElementById('statMargin').innerText = `${margin}%`;

  // Top Services Breakdown
  const topServicesBox = document.getElementById('topServicesContainer');
  topServicesBox.innerHTML = '';

  const serviceStats = {};
  completedApps.forEach(a => {
    (a.services || []).forEach(s => {
      if (!serviceStats[s.name]) {
        serviceStats[s.name] = { count: 0, revenue: 0 };
      }
      serviceStats[s.name].count += 1;
      serviceStats[s.name].revenue += Number(s.price) || 0;
    });
  });

  const sortedServices = Object.entries(serviceStats)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);

  if (sortedServices.length === 0) {
    topServicesBox.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">Нет данных за выбранный период</div>';
  } else {
    sortedServices.forEach(([name, data]) => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: 13px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;';
      row.innerHTML = `
        <div>
          <div style="font-weight: 600; color: var(--text-main);">${name}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${data.count} раз(а)</div>
        </div>
        <div style="font-weight: 700; color: var(--accent-gold-light);">${data.revenue.toLocaleString('ru-RU')} ₸</div>
      `;
      topServicesBox.appendChild(row);
    });
  }
}

// ================= BACKUP & RESTORE =================
async function handleExportBackup() {
  try {
    const jsonString = await window.db.exportAllData();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `HairStudio_Backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Резервная копия сохранена в загрузки');
  } catch (err) {
    console.error(err);
    showToast('Ошибка при создании бэкапа', 'error');
  }
}

async function handleImportBackup(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      await window.db.importAllData(event.target.result);
      showToast('Данные успешно восстановлены из копии');
      closeModal('modalSettings');
      await reloadData();
    } catch (err) {
      console.error(err);
      showToast('Ошибка импорта: неверный формат файла', 'error');
    }
  };
  reader.readAsText(file);
}

async function handleResetDemo() {
  if (confirm('Сбросить текущие данные и загрузить демонстрационные примеры?')) {
    await window.db.clearAll();
    await window.db.loadSeedData();
    showToast('Демо-данные успешно загружены');
    closeModal('modalSettings');
    await reloadData();
  }
}


// ================= APPOINTMENT CLIENT SELECTION =================
function setClientMode(mode) {
  state.appointmentClientMode = mode;
  const btnExisting = document.getElementById('btnClientModeExisting');
  const btnNew = document.getElementById('btnClientModeNew');
  const blockExisting = document.getElementById('existingClientBlock');
  const blockNew = document.getElementById('newClientBlock');
  const nameInput = document.getElementById('appClientName');
  const phoneInput = document.getElementById('appClientPhone');

  if (mode === 'existing') {
    btnExisting.classList.add('active');
    btnNew.classList.remove('active');
    blockExisting.style.display = 'block';
    blockNew.style.display = 'none';
    updateClientSelectionFromDropdown();
  } else {
    btnNew.classList.add('active');
    btnExisting.classList.remove('active');
    blockExisting.style.display = 'none';
    blockNew.style.display = 'block';
    document.getElementById('selectedClientCard').style.display = 'none';
    nameInput.focus();
  }
}

function updateClientSelectionFromDropdown() {
  const select = document.getElementById('appExistingClientSelect');
  const nameInput = document.getElementById('appClientName');
  const phoneInput = document.getElementById('appClientPhone');
  const card = document.getElementById('selectedClientCard');
  const cardName = document.getElementById('selectedClientName');
  const cardPhone = document.getElementById('selectedClientPhone');
  const formulaPrompt = document.getElementById('selectedClientFormulaPrompt');
  const formulaText = document.getElementById('selectedClientFormulaText');

  const selectedId = Number(select.value);
  const client = state.clients.find(c => c.id === selectedId);

  if (client) {
    nameInput.value = client.name;
    phoneInput.value = client.phone || '';
    cardName.innerText = client.name;
    cardPhone.innerText = client.phone || 'Телефон не указан';
    card.style.display = 'block';

    if (client.notes && client.notes.trim()) {
      formulaPrompt.style.display = 'block';
      formulaText.innerText = client.notes;
    } else {
      formulaPrompt.style.display = 'none';
    }
  } else {
    nameInput.value = '';
    phoneInput.value = '';
    card.style.display = 'none';
    formulaPrompt.style.display = 'none';
  }
}

function copyClientFormulaToNotes() {
  const formulaText = document.getElementById('selectedClientFormulaText').innerText;
  const notesField = document.getElementById('appNotes');

  if (!formulaText) return;

  if (notesField.value.trim()) {
    if (!notesField.value.includes(formulaText)) {
      notesField.value += '\n' + formulaText;
    }
  } else {
    notesField.value = formulaText;
  }
  showToast('Формула окрашивания скопирована в заметку');
}


function renderSelectedServicesInModal() {
  const container = document.getElementById('appSelectedServicesContainer');
  if (!container) return;
  container.innerHTML = '';

  if (state.selectedServicesForAppointment.size === 0) {
    container.innerHTML = `
      <div class="empty-services-hint">
        Услуги пока не выбраны (выберите из выпадающего списка выше)
      </div>
    `;
    return;
  }

  state.selectedServicesForAppointment.forEach(id => {
    const s = state.services.find(item => item.id === id);
    if (!s) return;

    const chip = document.createElement('div');
    chip.className = 'selected-service-chip';
    chip.innerHTML = `
      <div class="chip-service-info">
        <span class="chip-service-name">${s.name}</span>
        <span class="chip-service-meta">${s.category} • ${s.duration} мин</span>
      </div>
      <div class="chip-service-right">
        <span class="chip-service-price">${Number(s.price).toLocaleString('ru-RU')} ₸</span>
        <button type="button" class="btn-remove-service" data-id="${s.id}" title="Удалить услугу">✕</button>
      </div>
    `;

    chip.querySelector('.btn-remove-service').addEventListener('click', () => {
      state.selectedServicesForAppointment.delete(s.id);
      renderSelectedServicesInModal();
      recalcAppointmentForm();
    });

    container.appendChild(chip);
  });
}
