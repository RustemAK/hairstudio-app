/**
 * HairStudio App Logic
 * Fast, responsive, mobile-first PWA for hair salon / barber masters.
 */

// ================= STATE =================
const state = {
  cardDensity: 'compact',
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
  scheduleViewMode: 'timeline',
  workStartHour: 8,
  workEndHour: 22
};

// ================= DATE HELPERS =================
const RU_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const RU_DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const RU_MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Safe storage wrapper for incognito & quota safety
const safeStorage = {
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

function formatDateToYMD(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    date = new Date();
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isAppointmentPast(app) {
  if (!app || !app.date) return false;
  const now = new Date();
  const todayStr = formatDateToYMD(now);

  if (app.date < todayStr) return true;
  if (app.date > todayStr) return false;

  // Same day: compare check time (endTime or startTime) with current time
  const curHours = String(now.getHours()).padStart(2, '0');
  const curMins = String(now.getMinutes()).padStart(2, '0');
  const curTime = `${curHours}:${curMins}`;

  const checkTime = app.endTime || app.startTime;
  if (!checkTime) return false;
  return checkTime <= curTime;
}

function isAppointmentCompleted(app) {
  if (!app) return false;
  if (app.status === 'cancelled') return false;
  return app.status === 'completed' || isAppointmentPast(app);
}


function formatDisplayDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (isNaN(date.getTime())) return dateStr;
  return `${date.getDate()} ${RU_MONTHS[date.getMonth()]}, ${RU_DAYS[date.getDay()]}`;
}

function formatFullDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (isNaN(date.getTime())) return dateStr;
  return `${date.getDate()} ${RU_MONTHS_FULL[date.getMonth()]} ${y}`;
}

function addMinutesToTime(timeStr, minutesToAdd) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
    timeStr = '10:00';
  }
  const [h, m] = timeStr.split(':').map(Number);
  const total = (isNaN(h) ? 10 : h) * 60 + (isNaN(m) ? 0 : m) + (Number(minutesToAdd) || 60);
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
    // If not already active, push a history entry for iOS edge-swipe back support
    if (!modal.classList.contains('active')) {
      history.pushState({ modalOpen: modalId }, '', window.location.href);
    }
    modal.classList.add('active');
    const sheet = modal.querySelector('.modal-sheet');
    if (sheet) {
      sheet.style.transform = '';
      sheet.style.transition = '';
    }
    modal.style.backgroundColor = '';
    modal.style.transition = '';
  }
}

function closeModal(modalId, syncHistory = true) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    const sheet = modal.querySelector('.modal-sheet');
    if (sheet) {
      sheet.style.transform = '';
      sheet.style.transition = '';
    }
    modal.style.backgroundColor = '';
    modal.style.transition = '';

    // If modal was closed via UI, sync history so back button/swipe doesn't hit stale modal
    if (syncHistory && history.state && history.state.modalOpen) {
      history.back();
    }
  }
}

// Close on backdrop click or close buttons
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    closeModal(e.target.id);
  }
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) {
    const modalId = closeBtn.getAttribute('data-close');
    closeModal(modalId);
  }
});

// ================= MODAL SWIPE-TO-CLOSE GESTURES =================
function setupModalSwipeGestures() {
  // Support iOS Safari edge swipe back and browser/hardware back button
  window.addEventListener('popstate', () => {
    const activeModal = document.querySelector('.modal-backdrop.active');
    if (activeModal) {
      closeModal(activeModal.id, false);
    }
  });

  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    const sheet = modal.querySelector('.modal-sheet');
    if (!sheet) return;

    let startY = 0;
    let startX = 0;
    let startTime = 0;
    let isDragging = false;
    let isHeaderTouch = false;
    let initialScrollTop = 0;

    const onTouchStart = (e) => {
      if (!modal.classList.contains('active')) return;
      if (e.touches.length !== 1) return;

      const target = e.target;
      // Do not hijack taps on close button or clickable action buttons
      if (target.closest('.modal-close') || target.closest('button')) {
        isHeaderTouch = false;
        return;
      }

      const touch = e.touches[0];
      startY = touch.clientY;
      startX = touch.clientX;
      startTime = performance.now();
      isDragging = false;

      const handle = sheet.querySelector('.modal-handle');
      const header = sheet.querySelector('.modal-header');
      const modalBody = sheet.querySelector('.modal-body');

      if ((handle && (target === handle || handle.contains(target))) ||
          (header && (target === header || header.contains(target)))) {
        isHeaderTouch = true;
      } else {
        isHeaderTouch = false;
      }

      initialScrollTop = modalBody ? modalBody.scrollTop : 0;
    };

    const onTouchMove = (e) => {
      if (!modal.classList.contains('active')) return;
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaY = touch.clientY - startY;
      const deltaX = touch.clientX - startX;

      const modalBody = sheet.querySelector('.modal-body');
      const currentScrollTop = modalBody ? modalBody.scrollTop : 0;

      if (!isDragging) {
        // Minimum movement required to classify gesture
        if (Math.abs(deltaY) < 7 && Math.abs(deltaX) < 7) return;

        // If predominantly horizontal, ignore to not interfere with text selection or horizontal swipes
        if (Math.abs(deltaX) > Math.abs(deltaY)) return;

        // If pulling UP, allow normal scrolling inside modal
        if (deltaY <= 0) return;

        // Pulling DOWN:
        // Either touch started on handle/header, OR started at top of body and is at top
        if (isHeaderTouch || (initialScrollTop <= 0 && currentScrollTop <= 0)) {
          isDragging = true;
          // Hide mobile keyboard if open to prevent viewport jumping on iPhone
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
        } else {
          return;
        }
      }

      if (isDragging) {
        if (e.cancelable) {
          e.preventDefault();
        }

        // Apply downward translation
        const translateY = Math.max(0, deltaY);
        sheet.style.transition = 'none';
        sheet.style.transform = `translateY(${translateY}px)`;

        // Backdrop opacity tracks pull down distance
        const sheetHeight = sheet.offsetHeight || 500;
        const progress = Math.min(1, translateY / sheetHeight);
        modal.style.transition = 'none';
        modal.style.backgroundColor = `rgba(0, 0, 0, ${Math.max(0, 0.7 * (1 - progress * 0.75))})`;
      }
    };

    const onTouchEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;

      const touch = e.changedTouches ? e.changedTouches[0] : e;
      const deltaY = touch.clientY - startY;
      const duration = performance.now() - startTime;
      const velocityY = deltaY / Math.max(1, duration);
      const sheetHeight = sheet.offsetHeight || 500;

      // Dismiss if dragged down > 20% of sheet height OR fast flick downwards (> 0.38 px/ms)
      const shouldDismiss = deltaY > sheetHeight * 0.2 || (deltaY > 60 && velocityY > 0.38);

      if (shouldDismiss) {
        // Animate out smoothly
        sheet.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
        sheet.style.transform = 'translateY(100%)';
        modal.style.transition = 'background-color 0.22s ease-out';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0)';

        setTimeout(() => {
          closeModal(modal.id);
          sheet.style.transform = '';
          sheet.style.transition = '';
          modal.style.backgroundColor = '';
          modal.style.transition = '';
        }, 220);
      } else {
        // Snap back to open position
        sheet.style.transition = 'transform 0.26s cubic-bezier(0.16, 1, 0.3, 1)';
        sheet.style.transform = 'translateY(0)';
        modal.style.transition = 'background-color 0.26s ease-out';
        modal.style.backgroundColor = '';

        setTimeout(() => {
          sheet.style.transform = '';
          sheet.style.transition = '';
          modal.style.backgroundColor = '';
          modal.style.transition = '';
        }, 260);
      }
    };

    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd);
    sheet.addEventListener('touchcancel', onTouchEnd);

    // Mouse drag support for header/handle on desktop
    const handle = sheet.querySelector('.modal-handle');
    const header = sheet.querySelector('.modal-header');
    [handle, header].forEach(el => {
      if (!el) return;
      el.addEventListener('mousedown', (e) => {
        if (e.target.closest('.modal-close') || e.target.closest('button')) return;
        if (e.button !== 0) return;

        startY = e.clientY;
        startX = e.clientX;
        startTime = performance.now();
        isDragging = false;
        isHeaderTouch = true;
        initialScrollTop = 0;

        const onMouseMove = (moveEvent) => {
          const deltaY = moveEvent.clientY - startY;
          if (!isDragging && deltaY > 6) {
            isDragging = true;
          }
          if (isDragging) {
            const translateY = Math.max(0, deltaY);
            sheet.style.transition = 'none';
            sheet.style.transform = `translateY(${translateY}px)`;
            const sheetHeight = sheet.offsetHeight || 500;
            const progress = Math.min(1, translateY / sheetHeight);
            modal.style.transition = 'none';
            modal.style.backgroundColor = `rgba(0, 0, 0, ${Math.max(0, 0.7 * (1 - progress * 0.75))})`;
          }
        };

        const onMouseUp = (upEvent) => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          if (!isDragging) return;
          onTouchEnd({ changedTouches: [{ clientY: upEvent.clientY }] });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  });
}

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.db.init();
    restoreSavedPreferences();
    await reloadData();
    setupEventListeners();
    setupDateStrip();
    setupServiceWorker();
    restoreActiveTabAndScroll();
    await checkAndRunAutoBackup();
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Ошибка инициализации базы данных', 'error');
  }
});

// ================= THEME & CUSTOM BRANDING =================
function loadStudioName() {
  const savedName = localStorage.getItem('hairstudio_studio_name') || 'HairStudio';
  const headerElem = document.getElementById('headerStudioName');
  if (headerElem) {
    headerElem.innerText = savedName;
  }
  const inputElem = document.getElementById('settingStudioName');
  if (inputElem) {
    inputElem.value = savedName;
  }
  document.title = `${savedName} — Запись клиентов и Учет`;
}

function handleSaveStudioName() {
  const inputElem = document.getElementById('settingStudioName');
  if (!inputElem) return;
  const newName = inputElem.value.trim() || 'HairStudio';
  localStorage.setItem('hairstudio_studio_name', newName);
  loadStudioName();
  showToast('Название сохранено!');
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  if (isLight) {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  // Update theme meta color
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isLight ? '#f6f8fb' : '#0a0e17');
  }

  // Update header toggle button icon
  const btnToggle = document.getElementById('btnThemeToggle');
  if (btnToggle) {
    btnToggle.innerText = isLight ? '☀️' : '🌙';
    btnToggle.title = isLight ? 'Светлая тема (нажмите для тёмной)' : 'Тёмная тема (нажмите для светлой)';
  }

  // Update modal buttons active state
  const btnDark = document.getElementById('btnThemeDark');
  const btnLight = document.getElementById('btnThemeLight');
  if (btnDark && btnLight) {
    btnDark.classList.toggle('active', !isLight);
    btnLight.classList.toggle('active', isLight);
  }

  localStorage.setItem('hairstudio_theme', isLight ? 'light' : 'dark');
}

function toggleTheme() {
  const currentTheme = localStorage.getItem('hairstudio_theme') || 'dark';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
  showToast(newTheme === 'light' ? 'Включена светлая тема' : 'Включена тёмная тема');
}

function updateDensityToggleUI() {
  const btn = document.getElementById('btnDensityToggle');
  const icon = document.getElementById('densityToggleIcon');
  const text = document.getElementById('densityToggleText');
  if (!btn) return;
  const isCompact = state.cardDensity === 'compact';
  btn.classList.toggle('is-compact', isCompact);
  if (icon) icon.innerText = isCompact ? '⚡' : '📱';
  if (text) text.innerText = isCompact ? 'Компактно' : 'Подробно';
}

function restoreSavedPreferences() {
  // Restore card density (compact vs comfortable)
  state.cardDensity = localStorage.getItem('hairstudio_card_density') || 'compact';
  updateDensityToggleUI();

  // Restore theme
  const savedTheme = localStorage.getItem('hairstudio_theme') || 'dark';
  applyTheme(savedTheme);

  // Restore custom studio / master name
  loadStudioName();

  // Restore view mode (timeline vs list)
  const savedViewMode = localStorage.getItem('hairstudio_schedule_view');
  if (savedViewMode) {
    state.scheduleViewMode = savedViewMode;
  }

  // Restore schedule status filter
  const savedStatusFilter = localStorage.getItem('hairstudio_schedule_filter');
  if (savedStatusFilter) {
    state.scheduleFilter = 'all';
  }

  // Restore finance period
  const savedFinancePeriod = localStorage.getItem('hairstudio_finance_period');
  if (savedFinancePeriod) {
    state.financePeriod = savedFinancePeriod;
  }

  // Restore service category filter
  const savedServiceCategory = localStorage.getItem('hairstudio_service_category');
  if (savedServiceCategory) {
    state.serviceCategory = savedServiceCategory;
  }

  // Restore expense category filter
  const savedExpenseCategory = localStorage.getItem('hairstudio_expense_category');
  if (savedExpenseCategory) {
    state.expenseCategory = savedExpenseCategory;
  }

  // Restore working hours for schedule timeline
  const savedWorkStart = localStorage.getItem('hairstudio_work_start_hour');
  state.workStartHour = savedWorkStart !== null ? parseInt(savedWorkStart, 10) : 8;

  const savedWorkEnd = localStorage.getItem('hairstudio_work_end_hour');
  state.workEndHour = savedWorkEnd !== null ? parseInt(savedWorkEnd, 10) : 22;

  populateWorkHourSelects();
}

function populateWorkHourSelects() {
  const startSelect = document.getElementById('settingWorkStartHour');
  const endSelect = document.getElementById('settingWorkEndHour');
  if (!startSelect || !endSelect) return;

  startSelect.innerHTML = '';
  endSelect.innerHTML = '';

  for (let h = 0; h <= 23; h++) {
    const hStr = String(h).padStart(2, '0') + ':00';

    const optStart = document.createElement('option');
    optStart.value = String(h);
    optStart.textContent = hStr;
    if (h === state.workStartHour) optStart.selected = true;
    startSelect.appendChild(optStart);

    const optEnd = document.createElement('option');
    optEnd.value = String(h);
    optEnd.textContent = hStr;
    if (h === state.workEndHour) optEnd.selected = true;
    endSelect.appendChild(optEnd);
  }
}

function restoreActiveTabAndScroll() {
  if (history.state && history.state.modalOpen) {
    history.replaceState(null, '', window.location.href);
  }
  const hashTab = window.location.hash.replace('#', '');
  const validTabs = ['schedule', 'clients', 'services', 'expenses', 'finance'];
  const savedTab = (hashTab && validTabs.includes(hashTab))
    ? hashTab
    : (localStorage.getItem('hairstudio_active_tab') || 'schedule');

  switchTab(savedTab, false);

  // Restore UI element states (dropdowns, chips)
  const viewSelect = document.getElementById('scheduleViewSelect');
  if (viewSelect && state.scheduleViewMode) {
    viewSelect.value = state.scheduleViewMode;
  }

  const statusFilterSelect = document.getElementById('appointmentStatusFilter');
  if (statusFilterSelect && state.scheduleFilter) {
    statusFilterSelect.value = state.scheduleFilter;
  }

  if (state.financePeriod) {
    document.querySelectorAll('#financePeriodSelector .period-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-period') === state.financePeriod);
    });
  }

  if (state.serviceCategory) {
    document.querySelectorAll('#serviceCategoryFilter .chip-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-category') === state.serviceCategory);
    });
  }

  if (state.expenseCategory) {
    document.querySelectorAll('#expenseCategoryFilter .chip-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-category') === state.expenseCategory);
    });
  }

  // Restore scroll position
  const savedScroll = sessionStorage.getItem('hairstudio_scroll_' + savedTab);
  if (savedScroll !== null) {
    setTimeout(() => {
      window.scrollTo({ top: Number(savedScroll), behavior: 'instant' });
    }, 60);
  }
}

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
  setupModalSwipeGestures();

  // Density switcher (Compact vs Comfortable)
  const btnDensity = document.getElementById('btnDensityToggle');
  if (btnDensity) {
    btnDensity.addEventListener('click', () => {
      state.cardDensity = state.cardDensity === 'compact' ? 'comfortable' : 'compact';
      localStorage.setItem('hairstudio_card_density', state.cardDensity);
      updateDensityToggleUI();
      renderSchedule();
      showToast(state.cardDensity === 'compact' ? '⚡ Компактный вид' : '📱 Подробный вид');
    });
  }

  // Bottom nav tab switching
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Browser back/forward navigation support
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['schedule', 'clients', 'services', 'expenses', 'finance'];
    if (hash && hash !== state.activeTab && validTabs.includes(hash)) {
      switchTab(hash, false);
    }
  });

  // Save scroll position for the current tab (debounced)
  let scrollDebounce;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => {
      if (state.activeTab) {
        sessionStorage.setItem('hairstudio_scroll_' + state.activeTab, String(window.scrollY));
      }
    }, 100);
  }, { passive: true });

  // Schedule Toolbar listeners (Dropdowns)
  const statusFilterSelect = document.getElementById('appointmentStatusFilter');
  if (statusFilterSelect) {
    statusFilterSelect.addEventListener('change', (e) => {
      state.scheduleFilter = e.target.value;
      localStorage.setItem('hairstudio_schedule_filter', state.scheduleFilter);
      renderSchedule();
    });
  }

  const viewSelect = document.getElementById('scheduleViewSelect');
  if (viewSelect) {
    viewSelect.addEventListener('change', (e) => {
      state.scheduleViewMode = e.target.value;
      localStorage.setItem('hairstudio_schedule_view', state.scheduleViewMode);
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

  // Channel toggle listeners (Phone vs WhatsApp)
  const btnChannelPhone = document.getElementById('btnChannelPhone');
  const btnChannelWhatsapp = document.getElementById('btnChannelWhatsapp');
  if (btnChannelPhone && btnChannelWhatsapp) {
    btnChannelPhone.addEventListener('click', () => setChannelMode('phone'));
    btnChannelWhatsapp.addEventListener('click', () => setChannelMode('whatsapp'));
  }

  // Paste phone button listener
  const btnPastePhone = document.getElementById('btnPastePhone');
  if (btnPastePhone) {
    btnPastePhone.addEventListener('click', handlePastePhone);
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
    updateAutoBackupUI();
    openModal('modalSettings');
  });

  // Status filter handled via schedule-dropdown

  // Service category filter
  document.querySelectorAll('#serviceCategoryFilter .chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#serviceCategoryFilter .chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.serviceCategory = btn.getAttribute('data-category');
      localStorage.setItem('hairstudio_service_category', state.serviceCategory);
      renderServices();
    });
  });

  // Expense category filter
  document.querySelectorAll('#expenseCategoryFilter .chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#expenseCategoryFilter .chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.expenseCategory = btn.getAttribute('data-category');
      localStorage.setItem('hairstudio_expense_category', state.expenseCategory);
      renderExpenses();
    });
  });

  // Finance period selector
  document.querySelectorAll('#financePeriodSelector .period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#financePeriodSelector .period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.financePeriod = btn.getAttribute('data-period');
      localStorage.setItem('hairstudio_finance_period', state.financePeriod);
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

  // Auto-backup listeners
  const intervalSelect = document.getElementById('settingAutoBackupInterval');
  if (intervalSelect) {
    intervalSelect.addEventListener('change', (e) => {
      safeStorage.set('hairstudio_autobackup_interval', e.target.value);
      showToast('Периодичность автокопирования сохранена');
      checkAndRunAutoBackup();
    });
  }

  const btnMakeBackup = document.getElementById('btnMakeAutoBackupNow');
  if (btnMakeBackup) {
    btnMakeBackup.addEventListener('click', async () => {
      btnMakeBackup.disabled = true;
      await createAutoBackup(false);
      btnMakeBackup.disabled = false;
    });
  }

  const btnRestoreAuto = document.getElementById('btnRestoreAutoBackup');
  if (btnRestoreAuto) {
    btnRestoreAuto.addEventListener('click', restoreFromAutoBackup);
  }

  // Studio / Master name save listener
  const btnSaveName = document.getElementById('btnSaveStudioName');
  if (btnSaveName) {
    btnSaveName.addEventListener('click', handleSaveStudioName);
  }
  const inputStudioName = document.getElementById('settingStudioName');
  if (inputStudioName) {
    inputStudioName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveStudioName();
      }
    });
  }

  // Theme switch listeners
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', toggleTheme);
  }
  const btnThemeDark = document.getElementById('btnThemeDark');
  if (btnThemeDark) {
    btnThemeDark.addEventListener('click', () => applyTheme('dark'));
  }
  const btnThemeLight = document.getElementById('btnThemeLight');
  if (btnThemeLight) {
    btnThemeLight.addEventListener('click', () => applyTheme('light'));
  }

  // Working hours change listeners
  const selectWorkStart = document.getElementById('settingWorkStartHour');
  if (selectWorkStart) {
    selectWorkStart.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      state.workStartHour = val;
      safeStorage.set('hairstudio_work_start_hour', String(val));
      if (state.scheduleViewMode === 'timeline') {
        renderSchedule();
      }
      showToast(`Начало дня: ${String(val).padStart(2, '0')}:00`);
    });
  }

  const selectWorkEnd = document.getElementById('settingWorkEndHour');
  if (selectWorkEnd) {
    selectWorkEnd.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      state.workEndHour = val;
      safeStorage.set('hairstudio_work_end_hour', String(val));
      if (state.scheduleViewMode === 'timeline') {
        renderSchedule();
      }
      showToast(`Конец дня: ${String(val).padStart(2, '0')}:00`);
    });
  }
}

function switchTab(tabId, shouldScroll = true) {
  const validTabs = ['schedule', 'clients', 'services', 'expenses', 'finance'];
  if (!validTabs.includes(tabId)) return;

  // Save current tab scroll position before switching
  if (state.activeTab && state.activeTab !== tabId) {
    sessionStorage.setItem('hairstudio_scroll_' + state.activeTab, String(window.scrollY));
  }

  state.activeTab = tabId;
  localStorage.setItem('hairstudio_active_tab', tabId);

  // Sync URL hash without jumping
  if (window.location.hash !== '#' + tabId) {
    history.replaceState(null, '', '#' + tabId);
  }

  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-screen').forEach(s => {
    s.classList.toggle('active', s.id === `tab-${tabId}`);
  });

  if (shouldScroll) {
    const savedScroll = sessionStorage.getItem('hairstudio_scroll_' + tabId);
    if (savedScroll !== null) {
      window.scrollTo({ top: Number(savedScroll), behavior: 'instant' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}

// ================= BANNER =================
function renderTodayBanner() {
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('bannerTodayDate').innerText = formatFullDate(todayStr);

  const todayApps = state.appointments.filter(a => a.date === todayStr);
  const completedToday = todayApps.filter(isAppointmentCompleted);
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
    const isCompact = state.cardDensity === 'compact';
    const isPast = isAppointmentPast(app);
    const card = document.createElement('div');
    card.className = 'appointment-card' + (isPast ? ' is-past' : '') + (app.status === 'cancelled' ? ' status-cancelled' : '') + (isCompact ? ' compact' : '');

    const phoneClean = (app.clientPhone || '').replace(/\D/g, '');
    const waLink = phoneClean ? `https://wa.me/${phoneClean}` : null;
    const telLink = phoneClean ? `tel:+${phoneClean}` : null;

    if (isCompact) {
      // COMPACT CARD (NO PRICE, NO STATUS BADGE)
      const servicesSummary = (app.services || []).map(s => s.name).join(', ');
      const detailsArr = [];
      if (servicesSummary) detailsArr.push(servicesSummary);
      if (app.materialsUsed) detailsArr.push('🧪 ' + app.materialsUsed);
      if (app.notes) detailsArr.push('📝 ' + app.notes);
      const detailsText = detailsArr.join(' • ');

      const noteTooltip = [
        app.materialsUsed ? 'Расход: ' + app.materialsUsed : '',
        app.notes ? 'Заметка: ' + app.notes : ''
      ].filter(Boolean).join(' | ');

      card.innerHTML = `
        <div class="compact-row-top">
          <div class="compact-time-name">
            <span class="compact-time">${app.startTime || '--:--'}–${app.endTime || '--:--'}</span>
            <span class="compact-client-name" title="${app.clientName}">${app.clientName}</span>
            ${app.channel === 'whatsapp' ? '<span class="compact-channel-icon" title="Запись через WhatsApp">💬</span>' : ''}
            ${noteTooltip ? `<span class="compact-note-indicator" title="${noteTooltip}">📝</span>` : ''}
          </div>
          <div class="compact-quick-actions">
            ${waLink ? `<a href="${waLink}" target="_blank" class="compact-mini-btn whatsapp" title="WhatsApp">💬</a>` : ''}
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
      // COMFORTABLE DETAILED CARD (NO PRICE, NO STATUS BADGE)
      const servicesHtml = (app.services || []).map(s => `
        <span class="service-tag">${s.name}</span>
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
            ${waLink ? `<a href="${waLink}" target="_blank" class="btn-action-small whatsapp" title="Написать в WhatsApp">💬</a>` : ''}
            ${telLink ? `<a href="${telLink}" class="btn-action-small call" title="Позвонить">📞</a>` : ''}
          </div>
        </div>

        <div class="card-client-info">
          <div class="client-name">${app.clientName}</div>
          ${app.clientPhone ? `<div class="client-phone">📞 ${app.clientPhone}</div>` : ''}
        </div>

        ${servicesHtml ? `
          <div class="services-tags">
            ${servicesHtml}
          </div>
        ` : ''}

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
      `;
    }

    // Common event listeners for both compact & comfortable modes
    card.addEventListener('click', (e) => {
      if (e.target.closest('.quick-actions') || e.target.closest('.compact-quick-actions') || e.target.closest('button') || e.target.closest('a')) {
        return;
      }
      openAppointmentModal(app);
    });



    card.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    return card;
  }

    // MODE 1: HOURLY TIMELINE / CALENDAR VIEW
  if (state.scheduleViewMode === 'timeline') {
    const timeline = document.createElement('div');
    timeline.className = 'timeline-container' + (state.cardDensity === 'compact' ? ' compact' : '');

    // Determine working hours (from master settings, or wider if earlier/later apps exist)
    let minHour = typeof state.workStartHour === 'number' ? state.workStartHour : 8;
    let maxHour = typeof state.workEndHour === 'number' ? state.workEndHour : 22;

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

    if (minHour > maxHour) {
      const tmp = minHour;
      minHour = maxHour;
      maxHour = tmp;
    }

    // Button to easily show earlier morning hours if not at 00:00
    if (minHour > 0) {
      const expandEarlierRow = document.createElement('div');
      expandEarlierRow.className = 'timeline-expand-row';
      const earlierTarget = Math.max(0, minHour - 2);
      expandEarlierRow.innerHTML = `
        <button type="button" class="btn-timeline-expand" title="Показать более ранние утренние часы">
          ⬆ Показать с ${String(earlierTarget).padStart(2, '0')}:00 (ранние часы)
        </button>
      `;
      expandEarlierRow.querySelector('button').addEventListener('click', () => {
        state.workStartHour = earlierTarget;
        safeStorage.set('hairstudio_work_start_hour', String(earlierTarget));
        const startSel = document.getElementById('settingWorkStartHour');
        if (startSel) startSel.value = String(earlierTarget);
        renderSchedule();
      });
      timeline.appendChild(expandEarlierRow);
    }

    for (let hour = minHour; hour <= maxHour; hour++) {
      const hourStr = String(hour).padStart(2, '0') + ':00';

      // Find appointments starting in this hour, sorted by startTime
      const hourApps = dayApps.filter(a => {
        if (!a.startTime) return false;
        const [h] = a.startTime.split(':').map(Number);
        return h === hour;
      }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

      if (hourApps.length === 0) {
        // Empty hour slot
        const row = document.createElement('div');
        row.className = 'timeline-hour-row';

        const timeCol = document.createElement('div');
        timeCol.className = 'timeline-time-col';
        timeCol.innerText = hourStr;

        const contentCol = document.createElement('div');
        contentCol.className = 'timeline-content-col';

        const emptySlot = document.createElement('div');
        emptySlot.className = 'timeline-empty-slot';
        const emptySlotHint = state.cardDensity === 'compact'
          ? `<span>Свободно на ${hourStr}</span>`
          : `<span>Свободно на ${hourStr} <span style="font-size: 11px; opacity: 0.7;">(нажмите для записи)</span></span>`;
        emptySlot.innerHTML = `
          <span class="empty-slot-plus">+</span>
          ${emptySlotHint}
        `;
        emptySlot.addEventListener('click', () => {
          openAppointmentModal(null, null, hourStr);
        });
        contentCol.appendChild(emptySlot);

        row.appendChild(timeCol);
        row.appendChild(contentCol);
        timeline.appendChild(row);
      } else {
        // Group appointments by their exact startTime (e.g. 11:30 or 10:15)
        const timeGroups = new Map();
        hourApps.forEach(app => {
          const t = app.startTime || hourStr;
          if (!timeGroups.has(t)) {
            timeGroups.set(t, []);
          }
          timeGroups.get(t).push(app);
        });

        timeGroups.forEach((appsAtTime, timeKey) => {
          const row = document.createElement('div');
          row.className = 'timeline-hour-row';

          const timeCol = document.createElement('div');
          timeCol.className = 'timeline-time-col has-app';
          timeCol.innerText = timeKey; // Exact appointment time on the left (e.g. 11:30)

          const contentCol = document.createElement('div');
          contentCol.className = 'timeline-content-col';

          appsAtTime.forEach(app => {
            contentCol.appendChild(createAppointmentCard(app));
          });

          row.appendChild(timeCol);
          row.appendChild(contentCol);
          timeline.appendChild(row);
        });
      }
    }

    // Button to easily show later evening hours if not at 23:00
    if (maxHour < 23) {
      const expandLaterRow = document.createElement('div');
      expandLaterRow.className = 'timeline-expand-row';
      const laterTarget = Math.min(23, maxHour + 2);
      expandLaterRow.innerHTML = `
        <button type="button" class="btn-timeline-expand" title="Показать более поздние вечерние часы">
          ⬇ Показать до ${String(laterTarget).padStart(2, '0')}:00 (поздние часы)
        </button>
      `;
      expandLaterRow.querySelector('button').addEventListener('click', () => {
        state.workEndHour = laterTarget;
        safeStorage.set('hairstudio_work_end_hour', String(laterTarget));
        const endSel = document.getElementById('settingWorkEndHour');
        if (endSel) endSel.value = String(laterTarget);
        renderSchedule();
      });
      timeline.appendChild(expandLaterRow);
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

function openAppointmentModal(app = null, preselectedClient = null, defaultStartTime = null, defaultDate = null) {
  state.editingAppointmentId = app ? app.id : null;
  state.selectedServicesForAppointment.clear();

  const modalTitle = document.getElementById('modalAppointmentTitle');
  const btnDelete = document.getElementById('btnDeleteAppointment');

  modalTitle.innerText = app ? 'Редактирование записи' : 'Новая запись';
  setChannelMode(app && app.channel ? app.channel : 'phone');
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

  const defaultH = typeof state.workStartHour === 'number' ? state.workStartHour : 9;
  const fallbackTime = `${String(defaultH).padStart(2, '0')}:00`;
  const startTime = document.getElementById('appStartTime').value || fallbackTime;
  document.getElementById('appEndTime').value = addMinutesToTime(startTime, totalDuration || 60);
}

function recalcAppointmentEndTime() {
  let totalDuration = 0;
  state.selectedServicesForAppointment.forEach(id => {
    const s = state.services.find(item => item.id === id);
    if (s) totalDuration += Number(s.duration) || 60;
  });
  const defaultH = typeof state.workStartHour === 'number' ? state.workStartHour : 9;
  const fallbackTime = `${String(defaultH).padStart(2, '0')}:00`;
  const startTime = document.getElementById('appStartTime').value || fallbackTime;
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
    channel: document.getElementById('appChannel').value || 'phone',
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
      .filter(isAppointmentCompleted)
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
  document.getElementById('clientDetailsVisitsCount').innerText = `${clientApps.length} визит(ов) • Всего: ${clientApps.filter(isAppointmentCompleted).reduce((sum, a) => sum + (Number(a.totalPrice) || 0), 0).toLocaleString('ru-RU')} ₸`;
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
      item.style.cssText = 'background: var(--bg-card); padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 13px; cursor: pointer; transition: transform 0.15s, border-color 0.15s;';
      item.title = 'Нажмите для редактирования записи';
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
      item.addEventListener('click', () => {
        closeModal('modalClientDetails');
        openAppointmentModal(a);
      });
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
  const completedApps = filteredAppointments.filter(isAppointmentCompleted);
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

// ================= BACKUP & RESTORE (WHATSAPP-STYLE AUTO BACKUP) =================
async function checkAndRunAutoBackup() {
  updateAutoBackupUI();

  const interval = safeStorage.get('hairstudio_autobackup_interval', 'weekly');
  if (interval === 'off') return;

  const lastBackup = safeStorage.get('hairstudio_last_backup_time');
  const now = Date.now();
  let needBackup = false;

  if (!lastBackup) {
    needBackup = true;
  } else {
    const lastTime = new Date(lastBackup).getTime();
    if (isNaN(lastTime)) {
      needBackup = true;
    } else {
      const diffMs = now - lastTime;
      if (interval === 'daily' && diffMs >= 24 * 60 * 60 * 1000) {
        needBackup = true;
      } else if (interval === 'weekly' && diffMs >= 7 * 24 * 60 * 60 * 1000) {
        needBackup = true;
      } else if (interval === 'monthly' && diffMs >= 30 * 24 * 60 * 60 * 1000) {
        needBackup = true;
      }
    }
  }

  if (needBackup) {
    await createAutoBackup(true); // silent in background
  }
}

async function createAutoBackup(silent = false) {
  try {
    const jsonString = await window.db.exportAllData();
    safeStorage.set('hairstudio_autobackup_data', jsonString);
    const nowIso = new Date().toISOString();
    safeStorage.set('hairstudio_last_backup_time', nowIso);

    const meta = {
      appointmentsCount: (state.appointments || []).length,
      clientsCount: (state.clients || []).length,
      servicesCount: (state.services || []).length,
      expensesCount: (state.expenses || []).length,
      timestamp: nowIso
    };
    safeStorage.set('hairstudio_last_backup_meta', JSON.stringify(meta));
    updateAutoBackupUI();

    if (!silent) {
      showToast('Автокопия сохранена на устройстве!');
    }
  } catch (err) {
    console.error('AutoBackup error:', err);
    if (!silent) {
      showToast('Ошибка при создании автокопии', 'error');
    }
  }
}

async function restoreFromAutoBackup() {
  const backupJson = safeStorage.get('hairstudio_autobackup_data');
  if (!backupJson) {
    showToast('Автокопия не найдена', 'error');
    return;
  }

  const metaStr = safeStorage.get('hairstudio_last_backup_meta');
  let dateStr = 'сохраненной копии';
  if (metaStr) {
    try {
      const meta = JSON.parse(metaStr);
      if (meta.timestamp) {
        const d = new Date(meta.timestamp);
        dateStr = `${d.toLocaleDateString('ru-RU')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    } catch (e) {}
  }

  if (confirm(`Восстановить данные из автокопии от ${dateStr}?\n\nВсе текущие записи будут заменены данными из резервной копии.`)) {
    try {
      await window.db.importAllData(backupJson);
      showToast('Данные успешно восстановлены из автокопии!');
      closeModal('modalSettings');
      await reloadData();
    } catch (err) {
      console.error('Restore error:', err);
      showToast('Ошибка восстановления из автокопии', 'error');
    }
  }
}

function updateAutoBackupUI() {
  const intervalSelect = document.getElementById('settingAutoBackupInterval');
  if (intervalSelect) {
    intervalSelect.value = safeStorage.get('hairstudio_autobackup_interval', 'weekly');
  }

  const dateLabel = document.getElementById('autoBackupDateLabel');
  const metaLabel = document.getElementById('autoBackupMetaLabel');
  const btnRestore = document.getElementById('btnRestoreAutoBackup');

  const lastBackup = safeStorage.get('hairstudio_last_backup_time');
  const hasData = !!safeStorage.get('hairstudio_autobackup_data');

  if (btnRestore) {
    btnRestore.disabled = !hasData;
    btnRestore.style.opacity = hasData ? '1' : '0.5';
    btnRestore.style.cursor = hasData ? 'pointer' : 'not-allowed';
  }

  if (!lastBackup || !hasData) {
    if (dateLabel) dateLabel.innerText = 'Не создавалась';
    if (metaLabel) metaLabel.innerText = 'Нажмите «Создать сейчас» для первого снимка';
    return;
  }

  const d = new Date(lastBackup);
  if (isNaN(d.getTime())) {
    if (dateLabel) dateLabel.innerText = 'Не создавалась';
    return;
  }

  const isToday = new Date().toDateString() === d.toDateString();
  const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const formattedDate = isToday ? `Сегодня, ${timeStr}` : `${d.toLocaleDateString('ru-RU')}, ${timeStr}`;

  if (dateLabel) dateLabel.innerText = formattedDate;

  const metaStr = safeStorage.get('hairstudio_last_backup_meta');
  if (metaLabel && metaStr) {
    try {
      const meta = JSON.parse(metaStr);
      metaLabel.innerText = `Записей: ${meta.appointmentsCount || 0} • Клиентов: ${meta.clientsCount || 0} • Услуг: ${meta.servicesCount || 0}`;
    } catch (e) {
      metaLabel.innerText = '';
    }
  }
}

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


// ================= CHANNEL & CLIPBOARD PHONE HELPERS =================
function setChannelMode(channel) {
  const hiddenInput = document.getElementById('appChannel');
  if (hiddenInput) hiddenInput.value = channel;

  const btnPhone = document.getElementById('btnChannelPhone');
  const btnWhatsapp = document.getElementById('btnChannelWhatsapp');
  if (btnPhone && btnWhatsapp) {
    if (channel === 'phone') {
      btnPhone.classList.add('active');
      btnWhatsapp.classList.remove('active');
    } else {
      btnWhatsapp.classList.add('active');
      btnPhone.classList.remove('active');
    }
  }
}

async function handlePastePhone() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      showToast('Буфер обмена пуст', 'error');
      return;
    }

    const cleaned = text.trim();
    const digits = cleaned.replace(/\D/g, '');

    if (digits.length < 6) {
      showToast('В буфере не найден номер телефона', 'error');
      return;
    }

    let formattedPhone = cleaned;
    if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
      formattedPhone = `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
    } else if (digits.length === 10) {
      formattedPhone = `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + digits;
    }

    document.getElementById('appClientPhone').value = formattedPhone;

    // Check if this phone number exists in our clients database
    const matchedClient = state.clients.find(c => {
      if (!c.phone) return false;
      const cDigits = c.phone.replace(/\D/g, '');
      return cDigits.endsWith(digits.slice(-10)) || digits.endsWith(cDigits.slice(-10));
    });

    if (matchedClient) {
      document.getElementById('appClientName').value = matchedClient.name;
      if (matchedClient.notes && !document.getElementById('appNotes').value) {
        document.getElementById('appNotes').value = matchedClient.notes;
      }
      showToast(`Клиент найден: ${matchedClient.name}!`);
    } else {
      showToast('Номер вставлен из буфера');
      document.getElementById('appClientName').focus();
    }
  } catch (err) {
    const manual = prompt('Вставьте номер телефона из буфера:');
    if (manual) {
      document.getElementById('appClientPhone').value = manual.trim();
      showToast('Номер добавлен');
    }
  }
}
