/**
 * HairStudio PWA - Main Application Controller (ES Module)
 * File: js/app.js
 * Entry point orchestrating state, auth, routing, modals, offline-first sync & background tasks.
 */

import { state, rebuildIndices } from './state.js';
import {
  safeStorage,
  escapeHtml,
  formatDateToYMD,
  parseYMD,
  formatDisplayDate,
  formatFullDate,
  addMinutesToTime,
  timesOverlap,
  cleanPhoneForWhatsapp,
  cleanPhoneForTel,
  showToast,
  playChime,
  isAppointmentPast,
  isAppointmentCompleted,
  RU_DAYS,
  RU_MONTHS,
  RU_MONTHS_FULL
} from './utils.js';
import {
  setupDateStrip,
  renderDateStripDots,
  renderSchedule,
  updateDateNavLabel,
  openAppointmentModal,
  handleAppointmentSubmit,
  handleAppointmentDelete,
  triggerAutoSyncSlots,
  recalcAppointmentForm
} from './calendar.js';
import {
  renderClients,
  openClientDetailsModal,
  handleSaveClientNotes,
  handleDeleteClient
} from './clients.js';
import {
  renderServices,
  openServiceModal,
  handleServiceSubmit,
  handleServiceDelete,
  triggerSyncMasterServices
} from './services.js';
import {
  renderFinance,
  renderExpenses,
  openExpenseModal,
  handleExpenseSubmit,
  handleExpenseDelete
} from './finance.js';
import {
  renderSubscriptionStatus,
  openKaspiPayModal,
  initSubscriptionListeners,
  checkSubscriptionExpired,
  calculateSubscription
} from './subscription.js';

// ================= MODAL CONTROLLER & SWIPE GESTURES =================
let programmaticBackCount = 0;

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const activeModals = document.querySelectorAll('.modal-backdrop.active');
  const wasAnotherModalActive = Array.from(activeModals).some(m => m.id !== modalId);

  // Close other open modals without polluting history
  activeModals.forEach(m => {
    if (m.id !== modalId) closeModal(m.id, false);
  });

  if (wasAnotherModalActive && history.state && history.state.modalOpen) {
    try {
      history.replaceState({ modalOpen: modalId }, '', window.location.href);
    } catch (e) {
      console.warn('history.replaceState failed:', e);
    }
  } else if (!history.state || history.state.modalOpen !== modalId) {
    try {
      history.pushState({ modalOpen: modalId }, '', window.location.href);
    } catch (e) {
      console.warn('history.pushState failed:', e);
    }
  }

  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.style.pointerEvents = 'auto';
  modal.classList.add('active');
  const sheet = modal.querySelector('.modal-sheet');
  if (sheet) {
    sheet.style.transform = 'translateY(0)';
    sheet.style.transition = '';
  }
  modal.style.backgroundColor = '';
  modal.style.transition = '';

  if (modalId === 'modalSettings') {
    loadOnlineBookingSettings();
    updateAutoBackupUI();
  } else if (modalId === 'modalAuth') {
    if (state.currentMaster) {
      renderSubscriptionStatus(state.currentMaster);
    }
  } else if (modalId === 'modalBookings') {
    renderBookingsList();
  }
}

export function closeModal(modalId, syncHistory = true) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.remove('active');
  modal.style.display = '';
  modal.style.opacity = '';
  modal.style.pointerEvents = '';
  const sheet = modal.querySelector('.modal-sheet');
  if (sheet) {
    sheet.style.transform = '';
    sheet.style.transition = '';
  }
  modal.style.backgroundColor = '';
  modal.style.transition = '';

  if (syncHistory && history.state && history.state.modalOpen === modalId) {
    try {
      programmaticBackCount++;
      history.back();
      setTimeout(() => {
        if (programmaticBackCount > 0) programmaticBackCount--;
      }, 400);
    } catch (e) {
      programmaticBackCount = Math.max(0, programmaticBackCount - 1);
      console.warn('history.back failed:', e);
    }
  }
}

// Global exposure for inline HTML event attributes
window.openModal = openModal;
window.closeModal = closeModal;

function setupModalSwipeGestures() {
  window.addEventListener('popstate', (e) => {
    if (programmaticBackCount > 0) {
      programmaticBackCount--;
      return;
    }
    const activeModal = document.querySelector('.modal-backdrop.active');
    if (activeModal) {
      if (!e.state || e.state.modalOpen !== activeModal.id) {
        closeModal(activeModal.id, false);
      }
    }
  });

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

      isHeaderTouch = Boolean((handle && (target === handle || handle.contains(target))) ||
                             (header && (target === header || header.contains(target))));
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
        if (Math.abs(deltaY) < 7 && Math.abs(deltaX) < 7) return;
        if (Math.abs(deltaX) > Math.abs(deltaY)) return;
        if (deltaY <= 0) return;

        if (isHeaderTouch || (initialScrollTop <= 0 && currentScrollTop <= 0)) {
          isDragging = true;
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
        } else {
          return;
        }
      }

      if (isDragging) {
        if (e.cancelable) e.preventDefault();
        const translateY = Math.max(0, deltaY);
        sheet.style.transition = 'none';
        sheet.style.transform = `translateY(${translateY}px)`;
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

      const shouldDismiss = deltaY > sheetHeight * 0.2 || (deltaY > 60 && velocityY > 0.38);

      if (shouldDismiss) {
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
  });
}

// ================= BANNER & STATS =================
export function renderTodayBanner() {
  const todayStr = formatDateToYMD(new Date());
  const bannerDateEl = document.getElementById('bannerTodayDate');
  if (bannerDateEl) bannerDateEl.innerText = formatFullDate(todayStr);

  const todayApps = state.appointments.filter(a => a.date === todayStr);
  const completedToday = todayApps.filter(isAppointmentCompleted);
  const revenue = completedToday.reduce((sum, a) => sum + (Number(a.totalPrice) || 0), 0);

  const bannerCountEl = document.getElementById('bannerTodayCount');
  if (bannerCountEl) bannerCountEl.innerText = todayApps.length;

  const bannerRevEl = document.getElementById('bannerTodayRevenue');
  if (bannerRevEl) bannerRevEl.innerText = `${revenue.toLocaleString('ru-RU')} ₸`;
}

// ================= MASTER AUTHENTICATION CONTROLLER =================
export async function initMasterAuth() {
  if (!window.HairSupabase) return;
  try {
    const authState = await window.HairSupabase.getSession();
    if (authState && authState.authenticated) {
      state.authSession = authState.session;
      state.currentUser = authState.user;
      state.currentMaster = authState.master;

      if (authState.master) {
        if (authState.master.slug) safeStorage.set('hairstudio_master_slug', authState.master.slug);
        if (authState.master.salon_name) {
          safeStorage.set('hairstudio_studio_name', authState.master.salon_name);
          loadStudioName();
        }
        if (authState.master.address) safeStorage.set('hairstudio_master_address', authState.master.address);
        if (authState.master.city) safeStorage.set('hairstudio_master_city', authState.master.city);
        if (authState.master.instagram) safeStorage.set('hairstudio_master_instagram', authState.master.instagram);
        if (authState.master.gis_url) {
          safeStorage.set('hairstudio_master_2gis', authState.master.gis_url);
        } else if (authState.master.subscription_notes) {
          try {
            const sn = JSON.parse(authState.master.subscription_notes);
            if (sn.gis_url) {
              authState.master.gis_url = sn.gis_url;
              safeStorage.set('hairstudio_master_2gis', sn.gis_url);
            }
          } catch (e) {}
        }
      }
      updateAuthUI(true);
    } else {
      updateAuthUI(false);
    }
  } catch (err) {
    console.warn('initMasterAuth error:', err);
    updateAuthUI(false);
  }
}

export function updateAuthUI(isLoggedIn) {
  const btnAuthProfile = document.getElementById('btnAuthProfile');
  const settingsEmail = document.getElementById('settingsAccountEmail');
  const btnSettingsAction = document.getElementById('btnSettingsAuthAction');
  const authProfileCard = document.getElementById('authProfileCard');
  const authUnauthenticatedBox = document.getElementById('authUnauthenticatedBox');
  const authModalTitle = document.getElementById('authModalTitle');

  const profileName = document.getElementById('authProfileName');
  const profileSalon = document.getElementById('authProfileSalon');
  const profileEmail = document.getElementById('authProfileEmail');
  const profileLink = document.getElementById('authProfileBookingLink');
  const profileAvatar = document.getElementById('authProfileAvatar');

  if (isLoggedIn && (state.currentUser || state.currentMaster)) {
    const master = state.currentMaster || {};
    const user = state.currentUser || {};
    const displayName = master.name || (user.email ? user.email.split('@')[0] : 'Мастер');
    const displayEmail = user.email || master.email || 'Авторизован';
    const displaySalon = master.salon_name || 'HairStudio';
    const slug = master.slug || safeStorage.get('hairstudio_master_slug', 'demo');
    const bookingUrl = getMasterBookingUrl(slug);

    if (btnAuthProfile) {
      btnAuthProfile.title = `Мастер: ${displayName} (${displayEmail})`;
      btnAuthProfile.innerHTML = '👑';
    }

    if (settingsEmail) {
      settingsEmail.innerHTML = `🟢 ${escapeHtml(displayName)} <span style="font-weight: 400; color: var(--text-muted); font-size: 11px;">(${escapeHtml(displayEmail)})</span>`;
    }

    if (btnSettingsAction) {
      btnSettingsAction.innerText = 'Выйти';
      btnSettingsAction.className = 'btn-danger';
      btnSettingsAction.style.padding = '6px 12px';
      btnSettingsAction.style.fontSize = '12px';
    }

    if (authProfileCard) authProfileCard.style.display = 'flex';
    if (authUnauthenticatedBox) authUnauthenticatedBox.style.display = 'none';
    if (authModalTitle) authModalTitle.innerText = `👑 Кабинет: ${displayName}`;

    if (profileName) profileName.innerText = displayName;
    if (profileSalon) profileSalon.innerText = displaySalon;
    if (profileEmail) profileEmail.innerText = displayEmail;
    if (profileLink) profileLink.innerText = bookingUrl;
    if (profileAvatar) {
      const firstChar = displayName.trim().charAt(0).toUpperCase() || '✂️';
      profileAvatar.innerText = firstChar;
    }

    // Super-admin link visibility
    const adminSection = document.getElementById('authProfileAdminSection');
    if (adminSection) {
      adminSection.style.display = master.is_admin ? 'block' : 'none';
    }

    // Render Subscription status badge
    renderSubscriptionStatus(master);
  } else {
    if (btnAuthProfile) {
      btnAuthProfile.title = 'Войти в кабинет мастера';
      btnAuthProfile.innerHTML = '👤';
    }
    if (settingsEmail) {
      settingsEmail.innerHTML = `⚪ Демо-режим <span style="font-weight: 400; color: var(--text-muted); font-size: 11px;">(данные на устройстве)</span>`;
    }
    if (btnSettingsAction) {
      btnSettingsAction.innerText = 'Войти / Регистрация';
      btnSettingsAction.className = 'btn-primary';
      btnSettingsAction.style.padding = '6px 12px';
      btnSettingsAction.style.fontSize = '12px';
    }
    if (authProfileCard) authProfileCard.style.display = 'none';
    if (authUnauthenticatedBox) authUnauthenticatedBox.style.display = 'block';
    if (authModalTitle) authModalTitle.innerText = '👤 Кабинет мастера';
  }
}

export async function handleSignIn(e) {
  if (e) e.preventDefault();
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');
  const btnSubmit = document.getElementById('btnSubmitLogin');

  const email = emailInput ? emailInput.value.trim() : '';
  const password = passInput ? passInput.value.trim() : '';

  if (!email || !password) {
    showToast('Введите email и пароль', 'error');
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerText = 'Вход...';
  }

  try {
    const res = await window.HairSupabase.signInMaster(email, password);
    if (!res.ok) {
      showToast(res.error || 'Ошибка входа', 'error');
      return;
    }

    state.authSession = res.session;
    state.currentUser = res.user;
    state.currentMaster = res.master;

    if (res.master) {
      if (res.master.slug) safeStorage.set('hairstudio_master_slug', res.master.slug);
      if (res.master.salon_name) {
        safeStorage.set('hairstudio_studio_name', res.master.salon_name);
        loadStudioName();
      }
      if (res.master.address) safeStorage.set('hairstudio_master_address', res.master.address);
    }

    updateAuthUI(true);
    closeModal('modalAuth');
    showToast(`✅ Добро пожаловать, ${res.master?.name || email}!`, 'success');

    await checkOnlineBookings(false);
    triggerAutoSyncSlots();
  } catch (err) {
    showToast(`Ошибка входа: ${err.message}`, 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerText = 'Войти в аккаунт';
    }
  }
}

export async function handleSignUp(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('regName');
  const salonInput = document.getElementById('regSalonName');
  const phoneInput = document.getElementById('regPhone');
  const cityInput = document.getElementById('regCity');
  const addressInput = document.getElementById('regAddress');
  const slugInput = document.getElementById('regSlug');
  const emailInput = document.getElementById('regEmail');
  const passInput = document.getElementById('regPassword');
  const btnSubmit = document.getElementById('btnSubmitRegister');

  const name = nameInput ? nameInput.value.trim() : '';
  const salon_name = salonInput ? salonInput.value.trim() : 'HairStudio';
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const city = cityInput ? cityInput.value.trim() : 'Алматы';
  const address = addressInput ? addressInput.value.trim() : '';
  const slug = slugInput ? slugInput.value.trim().toLowerCase() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const password = passInput ? passInput.value.trim() : '';

  if (!name || !email || !password || !slug) {
    showToast('Заполните обязательные поля (*)', 'error');
    return;
  }
  if (password.length < 6) {
    showToast('Пароль должен быть не менее 6 символов', 'error');
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    showToast('Адрес ссылки должен содержать только буквы, цифры и дефис', 'error');
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerText = 'Создание кабинета...';
  }

  try {
    const res = await window.HairSupabase.signUpMaster({
      email,
      password,
      name,
      salon_name,
      phone,
      city,
      address,
      slug
    });

    if (!res.ok) {
      showToast(res.error || 'Ошибка регистрации', 'error');
      return;
    }

    if (res.needsConfirm) {
      closeModal('modalAuth');
      showToast(`🎉 Аккаунт создан! Проверьте ${email} для входа.`, 'success');
      return;
    }

    state.authSession = res.session;
    state.currentUser = res.user;
    state.currentMaster = res.master;

    safeStorage.set('hairstudio_master_slug', slug);
    safeStorage.set('hairstudio_studio_name', salon_name);
    if (address) safeStorage.set('hairstudio_master_address', address);
    loadStudioName();

    updateAuthUI(true);
    closeModal('modalAuth');
    showToast(`🎉 Кабинет мастера "${name}" создан!`, 'success');

    triggerAutoSyncSlots();
  } catch (err) {
    showToast(`Ошибка регистрации: ${err.message}`, 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerText = 'Зарегистрироваться и создать кабинет';
    }
  }
}

export async function handleSignOut() {
  const confirmed = confirm('Выйти из аккаунта мастера?\n(Данные сохранятся в облаке)');
  if (!confirmed) return;

  if (window.HairSupabase) {
    await window.HairSupabase.signOutMaster();
  }

  state.authSession = null;
  state.currentUser = null;
  state.currentMaster = null;

  updateAuthUI(false);
  closeModal('modalAuth');
  closeModal('modalSettings');
  showToast('Вы вышли из аккаунта');
}

// ================= ONLINE BOOKING SETTINGS & LINK =================
export function getMasterBookingUrl(slug) {
  try {
    const currentOrigin = window.location.origin || '';
    const currentPath = (window.location.pathname || '').replace(/\/[^/]*$/, '');
    const s = slug || safeStorage.get('hairstudio_master_slug', 'demo');
    return `${currentOrigin}${currentPath}/book.html?m=${encodeURIComponent(s)}`;
  } catch (e) {
    return `book.html?m=${encodeURIComponent(slug || 'demo')}`;
  }
}

export function updateBookingLinkDisplay() {
  try {
    const inputSlug = document.getElementById('settingMasterSlug');
    const slug = (inputSlug ? inputSlug.value.trim() : '') || 'demo';
    const previewUrl = document.getElementById('settingBookingUrlPreview');
    if (previewUrl) {
      previewUrl.innerText = getMasterBookingUrl(slug);
    }
  } catch (e) {}
}

export function loadOnlineBookingSettings() {
  const master = state.currentMaster || {};
  const slug = master.slug || safeStorage.get('hairstudio_master_slug', 'demo');
  const city = master.city || safeStorage.get('hairstudio_master_city', 'Алматы');
  const address = master.address || safeStorage.get('hairstudio_master_address', 'пр. Абая 150');
  const gis = master.gis_url || safeStorage.get('hairstudio_master_2gis', '');
  const insta = master.instagram || safeStorage.get('hairstudio_master_instagram', '');

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal('settingMasterSlug', slug);
  setVal('settingMasterCity', city);
  setVal('settingMasterAddress', address);
  setVal('settingMaster2gis', gis);
  setVal('settingMasterInstagram', insta);

  updateBookingLinkDisplay();
}

export async function handleSaveOnlineBookingSettings() {
  const slugInput = document.getElementById('settingMasterSlug');
  const cityInput = document.getElementById('settingMasterCity');
  const addressInput = document.getElementById('settingMasterAddress');
  const gisInput = document.getElementById('settingMaster2gis');
  const instaInput = document.getElementById('settingMasterInstagram');

  const slug = slugInput ? slugInput.value.trim().toLowerCase() : 'demo';
  const city = cityInput ? cityInput.value.trim() : 'Алматы';
  const address = addressInput ? addressInput.value.trim() : '';
  const gis = gisInput ? gisInput.value.trim() : '';
  const insta = instaInput ? instaInput.value.trim().replace(/^@/, '') : '';

  if (!slug) {
    showToast('Укажите уникальную ссылку', 'error');
    return;
  }

  safeStorage.set('hairstudio_master_slug', slug);
  safeStorage.set('hairstudio_master_city', city);
  safeStorage.set('hairstudio_master_address', address);
  safeStorage.set('hairstudio_master_2gis', gis);
  safeStorage.set('hairstudio_master_instagram', insta);

  if (state.currentMaster && window.HairSupabase) {
    try {
      await window.HairSupabase.updateMasterProfile(state.currentMaster.id, {
        slug,
        city,
        address,
        gis_url: gis,
        instagram: insta
      });
      state.currentMaster.slug = slug;
      state.currentMaster.city = city;
      state.currentMaster.address = address;
      state.currentMaster.gis_url = gis;
      state.currentMaster.instagram = insta;
    } catch (e) {
      console.warn('Sync profile to Supabase failed:', e);
    }
  }

  showToast('Настройки онлайн-записи сохранены!');
}

export function handleCopyBookingLink() {
  const slug = state.currentMaster?.slug || safeStorage.get('hairstudio_master_slug', 'demo');
  const fullUrl = getMasterBookingUrl(slug);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(fullUrl).then(() => {
      showToast('Ссылка скопирована в буфер!');
    }).catch(() => {
      prompt('Скопируйте ссылку вручную:', fullUrl);
    });
  } else {
    prompt('Скопируйте ссылку вручную:', fullUrl);
  }
}

export function handleOpenBookingLink() {
  const slug = state.currentMaster?.slug || safeStorage.get('hairstudio_master_slug', 'demo');
  const fullUrl = getMasterBookingUrl(slug);
  window.open(fullUrl, '_blank');
}

// ================= INCOMING ONLINE BOOKINGS CONTROLLER =================
export async function checkOnlineBookings(notify = false) {
  if (!window.HairSupabase) return;
  try {
    const targetMasterId = state.currentMaster ? state.currentMaster.id : null;
    const bookings = await window.HairSupabase.getPendingBookings(targetMasterId);
    const prevCount = Array.isArray(state.pendingBookings) ? state.pendingBookings.length : 0;
    state.pendingBookings = Array.isArray(bookings) ? bookings : [];
    const newCount = state.pendingBookings.length;

    if (newCount > prevCount && prevCount >= 0) {
      playChime();
      showToast(`🔔 Новая онлайн-заявка от клиента! (${newCount})`, 'info');
    }

    const badge = document.getElementById('bookingBadge');
    if (badge) {
      if (state.pendingBookings.length > 0) {
        badge.innerText = String(state.pendingBookings.length);
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }

    const modal = document.getElementById('modalBookings');
    if (modal && modal.classList.contains('active')) {
      renderBookingsList();
    }

    if (notify) {
      if (state.pendingBookings.length > 0) {
        showToast(`Новых заявок: ${state.pendingBookings.length}`);
      } else {
        showToast('Новых заявок пока нет');
      }
    }
  } catch (err) {
    console.warn('Check bookings error:', err);
  }
}

export function renderBookingsList() {
  const container = document.getElementById('bookingsList');
  if (!container) return;

  if (state.pendingBookings.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px 10px; text-align: center;">
        <div style="font-size: 34px; margin-bottom: 8px;">📭</div>
        <div style="font-weight: 700; color: var(--text-main); font-size: 15px;">Нет новых заявок</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px; line-height: 1.4;">
          Когда клиенты отправят заявку по вашей ссылке онлайн-записи, она появится здесь для подтверждения.
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = state.pendingBookings.map(b => {
    return `
      <div class="booking-request-card pending" data-booking-id="${escapeHtml(b.id)}">
        <div class="booking-card-header">
          <div>
            <div class="booking-card-client">${escapeHtml(b.client_name)}</div>
            <div class="booking-card-phone">📞 ${escapeHtml(b.client_phone)}</div>
          </div>
          <div class="booking-card-time-badge">
            <div>📅 ${formatDisplayDate(b.date)}</div>
            <div style="color: var(--accent-gold-light);">${escapeHtml(b.start_time)} - ${escapeHtml(b.end_time)}</div>
          </div>
        </div>
        <div class="booking-card-services">
          <span>✂️</span>
          <span>${escapeHtml(b.service_names)}</span>
        </div>
        ${b.client_note ? `<div class="booking-card-note">💬 ${escapeHtml(b.client_note)}</div>` : ''}
        <div class="booking-actions-row">
          <button type="button" class="btn-booking-accept" data-booking-action="accept" data-id="${escapeHtml(b.id)}">
            ✅ Принять и WhatsApp
          </button>
          <button type="button" class="btn-booking-reject" data-booking-action="reject" data-id="${escapeHtml(b.id)}">
            ❌ Отклонить
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-booking-action="accept"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      handleAcceptBooking(id);
    });
  });

  container.querySelectorAll('[data-booking-action="reject"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      handleRejectBooking(id);
    });
  });
}

export async function handleAcceptBooking(bookingId) {
  const b = state.pendingBookings.find(item => item.id === bookingId);
  if (!b) return;

  const existingSameDay = state.appointments.filter(a => a.date === b.date && a.status !== 'cancelled');
  const collision = existingSameDay.find(a => timesOverlap(b.start_time, b.end_time, a.startTime, a.endTime || addMinutesToTime(a.startTime, 60)));

  if (collision) {
    const ok = confirm(`Внимание! На это время (${b.start_time} - ${b.end_time}) уже есть запись:\n"${collision.clientName}" (${collision.startTime} - ${collision.endTime || ''}).\n\nВсе равно принять запись онлайн?`);
    if (!ok) return;
  }

  let totalPrice = 0;
  const matchedServices = [];
  const serviceNamesSplit = (b.service_names || '').split(',').map(s => s.trim().toLowerCase());

  state.services.forEach(srv => {
    if (serviceNamesSplit.some(name => srv.name.toLowerCase().includes(name) || name.includes(srv.name.toLowerCase()))) {
      matchedServices.push(srv);
      totalPrice += Number(srv.price) || 0;
    }
  });

  const appData = {
    clientName: b.client_name,
    clientPhone: b.client_phone,
    date: b.date,
    startTime: b.start_time,
    endTime: b.end_time,
    services: matchedServices.length > 0 ? matchedServices : [{ name: b.service_names, price: 0, duration: b.duration_min || 60 }],
    totalPrice: totalPrice,
    materialsUsed: '',
    notes: b.client_note ? `[Онлайн-запись] ${b.client_note}` : '[Онлайн-запись]',
    status: 'scheduled',
    channel: 'whatsapp',
    createdAt: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    await window.db.addAppointment(appData);

    if (window.HairSupabase) {
      await window.HairSupabase.updateBookingStatus(bookingId, 'confirmed');
    }

    state.pendingBookings = state.pendingBookings.filter(item => item.id !== bookingId);
    renderBookingsList();
    const badge = document.getElementById('bookingBadge');
    if (badge) {
      badge.style.display = state.pendingBookings.length > 0 ? 'flex' : 'none';
      badge.innerText = String(state.pendingBookings.length);
    }

    await reloadData();
    triggerAutoSyncSlots();

    const cleanPhone = cleanPhoneForWhatsapp(b.client_phone);
    const address = safeStorage.get('hairstudio_master_address', 'пр. Абая 150');
    const waText = `Здравствуйте, ${b.client_name}!\n\nВаша запись подтверждена ✅\n✂️ Услуга: ${b.service_names}\n📅 Дата: ${formatFullDate(b.date)}\n⏰ Время: ${b.start_time} - ${b.end_time}\n📍 Адрес: ${address}\n\nЖдем вас! Если планы изменятся, пожалуйста, предупредите заранее.`;

    if (cleanPhone) {
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;
      window.open(waUrl, '_blank');
    }

    showToast('Запись принята и добавлена в расписание!');
  } catch (err) {
    console.error('Accept booking error:', err);
    showToast(`Ошибка: ${err.message}`, 'error');
  }
}

export async function handleRejectBooking(bookingId) {
  const b = state.pendingBookings.find(item => item.id === bookingId);
  if (!b) return;

  const ok = confirm(`Отклонить заявку клиента ${b.client_name} на ${formatDisplayDate(b.date)} в ${b.start_time}?`);
  if (!ok) return;

  try {
    if (window.HairSupabase) {
      await window.HairSupabase.updateBookingStatus(bookingId, 'rejected');
    }

    state.pendingBookings = state.pendingBookings.filter(item => item.id !== bookingId);
    renderBookingsList();
    const badge = document.getElementById('bookingBadge');
    if (badge) {
      badge.style.display = state.pendingBookings.length > 0 ? 'flex' : 'none';
      badge.innerText = String(state.pendingBookings.length);
    }

    const cleanPhone = cleanPhoneForWhatsapp(b.client_phone);
    if (cleanPhone) {
      const waText = `Здравствуйте, ${b.client_name}!\n\nК сожалению, ${formatFullDate(b.date)} в ${b.start_time} я не смогу вас принять (время занято).\nМогу предложить свободные окна в другой день. Подскажите, когда вам удобно?`;
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;
      window.open(waUrl, '_blank');
    }

    showToast('Заявка отклонена');
  } catch (err) {
    console.error('Reject booking error:', err);
    showToast(`Ошибка: ${err.message}`, 'error');
  }
}

// ================= BACKUP & RESTORE =================
export async function checkAndRunAutoBackup() {
  const interval = safeStorage.get('hairstudio_autobackup_interval', 'weekly');
  if (interval === 'disabled') return;

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
      if (interval === 'daily' && diffMs >= 24 * 60 * 60 * 1000) needBackup = true;
      else if (interval === 'weekly' && diffMs >= 7 * 24 * 60 * 60 * 1000) needBackup = true;
      else if (interval === 'monthly' && diffMs >= 30 * 24 * 60 * 60 * 1000) needBackup = true;
    }
  }

  if (needBackup) {
    await createAutoBackup(true);
  }
}

export async function createAutoBackup(silent = false) {
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

    if (!silent) showToast('Автокопия сохранена на устройстве!');
  } catch (err) {
    console.error('AutoBackup error:', err);
    if (!silent) showToast('Ошибка при создании автокопии', 'error');
  }
}

export async function restoreFromAutoBackup() {
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

export function updateAutoBackupUI() {
  try {
    const intervalSelect = document.getElementById('settingAutoBackupInterval');
    if (intervalSelect) {
      intervalSelect.value = safeStorage.get('hairstudio_autobackup_interval', 'weekly');
    }

    const dateLabel = document.getElementById('autoBackupDateLabel');
    const metaLabel = document.getElementById('autoBackupMetaLabel');
    const btnRestore = document.getElementById('btnRestoreAutoBackup');

    const lastBackup = safeStorage.get('hairstudio_last_backup_time');
    const backupData = safeStorage.get('hairstudio_autobackup_data');
    const hasData = Boolean(backupData);

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
  } catch (err) {
    console.warn('updateAutoBackupUI error:', err);
  }
}

export async function handleExportBackup() {
  try {
    const jsonString = await window.db.exportAllData();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = formatDateToYMD(new Date());
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

export async function handleImportBackup(e) {
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

export async function handleResetDemo() {
  if (confirm('Сбросить текущие данные и загрузить демонстрационные примеры?')) {
    await window.db.clearAll();
    await window.db.loadSeedData();
    showToast('Демо-данные успешно загружены');
    closeModal('modalSettings');
    await reloadData();
  }
}

// ================= THEME & CUSTOM BRANDING =================
export function loadStudioName() {
  const savedName = safeStorage.get('hairstudio_studio_name', 'HairStudio');
  const headerElem = document.getElementById('headerStudioName');
  if (headerElem) headerElem.innerText = savedName;

  const inputElem = document.getElementById('settingStudioName');
  if (inputElem) inputElem.value = savedName;

  document.title = `${savedName} — Запись клиентов и Учет`;
}

export async function handleSaveStudioName() {
  const inputElem = document.getElementById('settingStudioName');
  if (!inputElem) return;
  const newName = inputElem.value.trim() || 'HairStudio';
  safeStorage.set('hairstudio_studio_name', newName);
  state.studioName = newName;
  loadStudioName();

  if (state.currentMaster && window.HairSupabase) {
    try {
      await window.HairSupabase.updateMasterProfile(state.currentMaster.id, {
        salon_name: newName
      });
      state.currentMaster.salon_name = newName;
    } catch (e) {
      console.warn('Sync studio name to Supabase failed:', e);
    }
  }
  showToast('Название сохранено!');
}

export function applyTheme(theme) {
  const isLight = theme === 'light';
  if (isLight) {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isLight ? '#f6f8fb' : '#0a0e17');
  }

  const btnToggle = document.getElementById('btnThemeToggle');
  if (btnToggle) {
    btnToggle.innerText = isLight ? '☀️' : '🌙';
    btnToggle.title = isLight ? 'Светлая тема (нажмите для тёмной)' : 'Тёмная тема (нажмите для светлой)';
  }

  const btnDark = document.getElementById('btnThemeDark');
  const btnLight = document.getElementById('btnThemeLight');
  if (btnDark && btnLight) {
    btnDark.classList.toggle('active', !isLight);
    btnLight.classList.toggle('active', isLight);
  }

  localStorage.setItem('hairstudio_theme', isLight ? 'light' : 'dark');
}

export function toggleTheme() {
  const currentTheme = localStorage.getItem('hairstudio_theme') || 'dark';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
  showToast(newTheme === 'light' ? 'Включена светлая тема' : 'Включена тёмная тема');
}

export function updateDensityToggleUI() {
  const btn = document.getElementById('btnDensityToggle');
  const icon = document.getElementById('densityToggleIcon');
  const text = document.getElementById('densityToggleText');
  if (!btn) return;
  const isCompact = state.cardDensity === 'compact';
  btn.classList.toggle('is-compact', isCompact);
  if (icon) icon.innerText = isCompact ? '⚡' : '📱';
  if (text) text.innerText = isCompact ? 'Компактно' : 'Подробно';
}

export function restoreSavedPreferences() {
  state.cardDensity = localStorage.getItem('hairstudio_card_density') || 'compact';
  updateDensityToggleUI();

  const savedTheme = localStorage.getItem('hairstudio_theme') || 'dark';
  applyTheme(savedTheme);

  loadStudioName();

  const savedViewMode = localStorage.getItem('hairstudio_schedule_view');
  if (savedViewMode) state.scheduleViewMode = savedViewMode;

  const savedStatusFilter = safeStorage.get('hairstudio_schedule_filter');
  if (savedStatusFilter) state.scheduleFilter = savedStatusFilter;

  const savedFinancePeriod = localStorage.getItem('hairstudio_finance_period');
  if (savedFinancePeriod) state.financePeriod = savedFinancePeriod;

  const savedServiceCategory = localStorage.getItem('hairstudio_service_category');
  if (savedServiceCategory) state.serviceCategory = savedServiceCategory;

  const savedExpenseCategory = localStorage.getItem('hairstudio_expense_category');
  if (savedExpenseCategory) state.expenseCategory = savedExpenseCategory;

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

// ================= APPOINTMENT FORM HELPERS =================
export function setClientMode(mode) {
  state.appointmentClientMode = mode;
  const btnExisting = document.getElementById('btnClientModeExisting');
  const btnNew = document.getElementById('btnClientModeNew');
  const blockExisting = document.getElementById('existingClientBlock');
  const blockNew = document.getElementById('newClientBlock');
  const nameInput = document.getElementById('appClientName');

  if (mode === 'existing') {
    if (btnExisting) btnExisting.classList.add('active');
    if (btnNew) btnNew.classList.remove('active');
    if (blockExisting) blockExisting.style.display = 'block';
    if (blockNew) blockNew.style.display = 'none';
    updateClientSelectionFromDropdown();
  } else {
    if (btnNew) btnNew.classList.add('active');
    if (btnExisting) btnExisting.classList.remove('active');
    if (blockExisting) blockExisting.style.display = 'none';
    if (blockNew) blockNew.style.display = 'block';
    const card = document.getElementById('selectedClientCard');
    if (card) card.style.display = 'none';
    if (nameInput) nameInput.focus();
  }
}

export function updateClientSelectionFromDropdown() {
  const select = document.getElementById('appExistingClientSelect');
  if (!select) return;
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
    if (nameInput) nameInput.value = client.name;
    if (phoneInput) phoneInput.value = client.phone || '';
    if (cardName) cardName.innerText = client.name;
    if (cardPhone) cardPhone.innerText = client.phone || 'Телефон не указан';
    if (card) card.style.display = 'block';

    if (client.notes && client.notes.trim()) {
      if (formulaPrompt) formulaPrompt.style.display = 'block';
      if (formulaText) formulaText.innerText = client.notes;
    } else {
      if (formulaPrompt) formulaPrompt.style.display = 'none';
    }
  } else {
    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (card) card.style.display = 'none';
    if (formulaPrompt) formulaPrompt.style.display = 'none';
  }
}

export function copyClientFormulaToNotes() {
  const formulaEl = document.getElementById('selectedClientFormulaText');
  const formulaText = formulaEl ? formulaEl.innerText : '';
  const notesField = document.getElementById('appNotes');

  if (!formulaText || !notesField) return;

  if (notesField.value.trim()) {
    if (!notesField.value.includes(formulaText)) {
      notesField.value += '\n' + formulaText;
    }
  } else {
    notesField.value = formulaText;
  }
  showToast('Формула окрашивания скопирована в заметку');
}

export function setChannelMode(channel) {
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

export async function handlePastePhone() {
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

    const phoneField = document.getElementById('appClientPhone');
    if (phoneField) phoneField.value = formattedPhone;

    const matchedClient = state.clients.find(c => {
      if (!c.phone) return false;
      const cDigits = c.phone.replace(/\D/g, '');
      return cDigits.endsWith(digits.slice(-10)) || digits.endsWith(cDigits.slice(-10));
    });

    if (matchedClient) {
      const nameEl = document.getElementById('appClientName');
      if (nameEl) nameEl.value = matchedClient.name;
      const notesEl = document.getElementById('appNotes');
      if (matchedClient.notes && notesEl && !notesEl.value) {
        notesEl.value = matchedClient.notes;
      }
      showToast(`Клиент найден: ${matchedClient.name}!`);
    } else {
      showToast('Номер вставлен из буфера');
      const nameEl = document.getElementById('appClientName');
      if (nameEl) nameEl.focus();
    }
  } catch (err) {
    const manual = prompt('Вставьте номер телефона из буфера:');
    if (manual) {
      const phoneField = document.getElementById('appClientPhone');
      if (phoneField) phoneField.value = manual.trim();
      showToast('Номер добавлен');
    }
  }
}

// ================= NAVIGATION & TABS =================
export function switchTab(tabId, shouldScroll = true) {
  const validTabs = ['schedule', 'clients', 'services', 'expenses', 'finance'];
  if (!validTabs.includes(tabId)) return;

  if (state.activeTab && state.activeTab !== tabId) {
    sessionStorage.setItem('hairstudio_scroll_' + state.activeTab, String(window.scrollY));
  }

  state.activeTab = tabId;
  localStorage.setItem('hairstudio_active_tab', tabId);

  if (window.location.hash !== '#' + tabId) {
    history.replaceState(null, '', '#' + tabId);
  }

  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-screen').forEach(s => {
    s.classList.toggle('active', s.id === `tab-${tabId}`);
  });

  if (tabId === 'schedule') renderSchedule();
  else if (tabId === 'clients') renderClients();
  else if (tabId === 'services') renderServices();
  else if (tabId === 'expenses') renderExpenses();
  else if (tabId === 'finance') renderFinance();

  if (shouldScroll) {
    const savedScroll = sessionStorage.getItem('hairstudio_scroll_' + tabId);
    if (savedScroll !== null) {
      window.scrollTo({ top: Number(savedScroll), behavior: 'instant' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

  const savedScroll = sessionStorage.getItem('hairstudio_scroll_' + savedTab);
  if (savedScroll !== null) {
    setTimeout(() => {
      window.scrollTo({ top: Number(savedScroll), behavior: 'instant' });
    }, 60);
  }
}

// ================= DATA LOADING =================
export async function reloadData() {
  const [services, appointments, expenses, clients] = await Promise.all([
    window.db.getServices(),
    window.db.getAppointments(),
    window.db.getExpenses(),
    window.db.getClients()
  ]);

  state.services = services || [];
  state.appointments = appointments || [];
  state.expenses = expenses || [];
  state.clients = clients || [];

  rebuildIndices();

  renderTodayBanner();
  renderDateStripDots();

  if (state.activeTab === 'schedule') {
    renderSchedule();
  } else if (state.activeTab === 'clients') {
    renderClients();
  } else if (state.activeTab === 'services') {
    renderServices();
  } else if (state.activeTab === 'expenses') {
    renderExpenses();
  } else if (state.activeTab === 'finance') {
    renderFinance();
  } else {
    renderSchedule();
  }
}

// ================= EVENT LISTENERS SETUP =================
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

  // Navigation tab switching
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['schedule', 'clients', 'services', 'expenses', 'finance'];
    if (hash && hash !== state.activeTab && validTabs.includes(hash)) {
      switchTab(hash, false);
    }
  });

  // Schedule Toolbar listeners
  const statusFilterSelect = document.getElementById('appointmentStatusFilter');
  if (statusFilterSelect) {
    statusFilterSelect.addEventListener('change', (e) => {
      state.scheduleFilter = e.target.value;
      safeStorage.set('hairstudio_schedule_filter', state.scheduleFilter);
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

  // Date Navigation buttons
  const btnToday = document.getElementById('btnToday');
  if (btnToday) {
    btnToday.addEventListener('click', () => {
      state.selectedDate = formatDateToYMD(new Date());
      setupDateStrip();
      renderSchedule();
    });
  }

  const btnPrevDay = document.getElementById('btnPrevDay');
  if (btnPrevDay) {
    btnPrevDay.addEventListener('click', () => {
      const d = parseYMD(state.selectedDate);
      d.setDate(d.getDate() - 1);
      state.selectedDate = formatDateToYMD(d);
      setupDateStrip();
      renderSchedule();
    });
  }

  const btnNextDay = document.getElementById('btnNextDay');
  if (btnNextDay) {
    btnNextDay.addEventListener('click', () => {
      const d = parseYMD(state.selectedDate);
      d.setDate(d.getDate() + 1);
      state.selectedDate = formatDateToYMD(d);
      setupDateStrip();
      renderSchedule();
    });
  }

  const dateInput = document.getElementById('scheduleDateInput');
  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        state.selectedDate = e.target.value;
        setupDateStrip();
        renderSchedule();
      }
    });
  }

  // Date Strip click delegation
  const strip = document.getElementById('dateStrip');
  if (strip) {
    strip.addEventListener('click', (e) => {
      const card = e.target.closest('.date-card');
      if (card && card.dataset.date) {
        state.selectedDate = card.dataset.date;
        strip.querySelectorAll('.date-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        updateDateNavLabel();
        renderSchedule();
      }
    });
  }

  // Clients Search
  const searchClients = document.getElementById('searchClientsInput');
  if (searchClients) {
    searchClients.addEventListener('input', (e) => {
      renderClients(e.target.value.trim());
    });
  }

  // Category Filters
  const serviceCatBox = document.getElementById('serviceCategoryFilter');
  if (serviceCatBox) {
    serviceCatBox.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;
      serviceCatBox.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.serviceCategory = btn.getAttribute('data-category');
      localStorage.setItem('hairstudio_service_category', state.serviceCategory);
      renderServices();
    });
  }

  const expCatBox = document.getElementById('expenseCategoryFilter');
  if (expCatBox) {
    expCatBox.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;
      expCatBox.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.expenseCategory = btn.getAttribute('data-category');
      localStorage.setItem('hairstudio_expense_category', state.expenseCategory);
      renderExpenses();
    });
  }

  const finPeriodBox = document.getElementById('financePeriodSelector');
  if (finPeriodBox) {
    finPeriodBox.addEventListener('click', (e) => {
      const btn = e.target.closest('.period-btn');
      if (!btn) return;
      finPeriodBox.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.financePeriod = btn.getAttribute('data-period');
      localStorage.setItem('hairstudio_finance_period', state.financePeriod);
      renderFinance();
    });
  }

  // Add Item Buttons
  const btnAddApp = document.getElementById('btnAddAppointment');
  if (btnAddApp) btnAddApp.addEventListener('click', () => openAppointmentModal());

  const btnAddServ = document.getElementById('btnAddService');
  if (btnAddServ) btnAddServ.addEventListener('click', () => openServiceModal());

  const btnAddExp = document.getElementById('btnAddExpense');
  if (btnAddExp) btnAddExp.addEventListener('click', () => openExpenseModal());

  // Form Submissions
  const formApp = document.getElementById('formAppointment');
  if (formApp) formApp.addEventListener('submit', (e) => handleAppointmentSubmit(e, reloadData));

  const btnDelApp = document.getElementById('btnDeleteAppointment');
  if (btnDelApp) btnDelApp.addEventListener('click', () => handleAppointmentDelete(reloadData));

  const formServ = document.getElementById('formService');
  if (formServ) formServ.addEventListener('submit', (e) => handleServiceSubmit(e, reloadData));

  const btnDelServ = document.getElementById('btnDeleteService');
  if (btnDelServ) btnDelServ.addEventListener('click', () => handleServiceDelete(reloadData));

  const formExp = document.getElementById('formExpense');
  if (formExp) formExp.addEventListener('submit', (e) => handleExpenseSubmit(e, reloadData));

  const btnDelExp = document.getElementById('btnDeleteExpense');
  if (btnDelExp) btnDelExp.addEventListener('click', () => handleExpenseDelete(reloadData));

  const btnSaveNotes = document.getElementById('btnSaveClientNotes');
  if (btnSaveNotes) btnSaveNotes.addEventListener('click', () => handleSaveClientNotes(reloadData));

  const btnDelClient = document.getElementById('btnDeleteClient');
  if (btnDelClient) btnDelClient.addEventListener('click', () => handleDeleteClient(reloadData));

  // Appointment Modal Helpers
  const btnClientExisting = document.getElementById('btnClientModeExisting');
  if (btnClientExisting) btnClientExisting.addEventListener('click', () => setClientMode('existing'));

  const btnClientNew = document.getElementById('btnClientModeNew');
  if (btnClientNew) btnClientNew.addEventListener('click', () => setClientMode('new'));

  const selectExistingClient = document.getElementById('appExistingClientSelect');
  if (selectExistingClient) selectExistingClient.addEventListener('change', updateClientSelectionFromDropdown);

  const btnCopyFormula = document.getElementById('btnCopyClientFormula');
  if (btnCopyFormula) btnCopyFormula.addEventListener('click', copyClientFormulaToNotes);

  const btnPastePhone = document.getElementById('btnPastePhone');
  if (btnPastePhone) btnPastePhone.addEventListener('click', handlePastePhone);

  const btnChanPhone = document.getElementById('btnChannelPhone');
  if (btnChanPhone) btnChanPhone.addEventListener('click', () => setChannelMode('phone'));

  const btnChanWa = document.getElementById('btnChannelWhatsapp');
  if (btnChanWa) btnChanWa.addEventListener('click', () => setChannelMode('whatsapp'));

  const appStart = document.getElementById('appStartTime');
  if (appStart) appStart.addEventListener('change', recalcAppointmentForm);

  // Backup & Restore
  const btnExport = document.getElementById('btnExportBackup');
  if (btnExport) btnExport.addEventListener('click', handleExportBackup);

  const btnImport = document.getElementById('btnImportBackup');
  if (btnImport) {
    btnImport.addEventListener('click', () => {
      const fileInput = document.getElementById('importFileInput');
      if (fileInput) fileInput.click();
    });
  }
  const importInput = document.getElementById('importFileInput');
  if (importInput) importInput.addEventListener('change', handleImportBackup);

  const btnReset = document.getElementById('btnResetDemo');
  if (btnReset) btnReset.addEventListener('click', handleResetDemo);

  const btnMakeBackup = document.getElementById('btnMakeAutoBackupNow');
  if (btnMakeBackup) {
    btnMakeBackup.addEventListener('click', async () => {
      btnMakeBackup.disabled = true;
      await createAutoBackup(false);
      btnMakeBackup.disabled = false;
    });
  }

  const btnRestoreAuto = document.getElementById('btnRestoreAutoBackup');
  if (btnRestoreAuto) btnRestoreAuto.addEventListener('click', restoreFromAutoBackup);

  const intervalSelect = document.getElementById('settingAutoBackupInterval');
  if (intervalSelect) {
    intervalSelect.addEventListener('change', (e) => {
      safeStorage.set('hairstudio_autobackup_interval', e.target.value);
      showToast('Периодичность автокопирования сохранена');
      checkAndRunAutoBackup();
    });
  }

  // Studio Name & Themes
  const btnSaveName = document.getElementById('btnSaveStudioName');
  if (btnSaveName) btnSaveName.addEventListener('click', handleSaveStudioName);

  const inputStudioName = document.getElementById('settingStudioName');
  if (inputStudioName) {
    inputStudioName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveStudioName();
      }
    });
  }

  const btnThemeToggle = document.getElementById('btnThemeToggle');
  if (btnThemeToggle) btnThemeToggle.addEventListener('click', toggleTheme);

  const btnThemeDark = document.getElementById('btnThemeDark');
  if (btnThemeDark) btnThemeDark.addEventListener('click', () => applyTheme('dark'));

  const btnThemeLight = document.getElementById('btnThemeLight');
  if (btnThemeLight) btnThemeLight.addEventListener('click', () => applyTheme('light'));

  // Working Hours
  const selectWorkStart = document.getElementById('settingWorkStartHour');
  if (selectWorkStart) {
    selectWorkStart.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      state.workStartHour = val;
      safeStorage.set('hairstudio_work_start_hour', String(val));
      if (state.scheduleViewMode === 'timeline') renderSchedule();
      showToast(`Начало дня: ${String(val).padStart(2, '0')}:00`);
    });
  }

  const selectWorkEnd = document.getElementById('settingWorkEndHour');
  if (selectWorkEnd) {
    selectWorkEnd.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      state.workEndHour = val;
      safeStorage.set('hairstudio_work_end_hour', String(val));
      if (state.scheduleViewMode === 'timeline') renderSchedule();
      showToast(`Конец дня: ${String(val).padStart(2, '0')}:00`);
    });
  }

  // Header & Profile Buttons
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  if (btnOpenSettings) btnOpenSettings.addEventListener('click', () => openModal('modalSettings'));

  const btnAuthProfile = document.getElementById('btnAuthProfile');
  if (btnAuthProfile) btnAuthProfile.addEventListener('click', () => openModal('modalAuth'));

  const btnSettingsAuthAction = document.getElementById('btnSettingsAuthAction');
  if (btnSettingsAuthAction) {
    btnSettingsAuthAction.addEventListener('click', () => {
      if (state.currentUser || state.currentMaster) {
        handleSignOut();
      } else {
        openModal('modalAuth');
      }
    });
  }

  const btnOnlineBookings = document.getElementById('btnOnlineBookings');
  if (btnOnlineBookings) {
    btnOnlineBookings.addEventListener('click', () => {
      openModal('modalBookings');
      renderBookingsList();
      checkOnlineBookings(false);
    });
  }

  const btnRefreshBookings = document.getElementById('btnRefreshBookings');
  if (btnRefreshBookings) {
    btnRefreshBookings.addEventListener('click', () => checkOnlineBookings(true));
  }

  // Online Booking Settings Buttons
  const btnSaveOnline = document.getElementById('btnSaveOnlineSettings');
  if (btnSaveOnline) btnSaveOnline.addEventListener('click', handleSaveOnlineBookingSettings);

  const btnCopyBooking = document.getElementById('btnCopyBookingLink');
  if (btnCopyBooking) btnCopyBooking.addEventListener('click', handleCopyBookingLink);

  const btnOpenBooking = document.getElementById('btnOpenBookingLink');
  if (btnOpenBooking) btnOpenBooking.addEventListener('click', handleOpenBookingLink);

  const inputMasterSlug = document.getElementById('settingMasterSlug');
  if (inputMasterSlug) inputMasterSlug.addEventListener('input', updateBookingLinkDisplay);

  const btnAuthCopyLink = document.getElementById('btnAuthCopyLink');
  if (btnAuthCopyLink) btnAuthCopyLink.addEventListener('click', handleCopyBookingLink);

  const btnAuthOpenLink = document.getElementById('btnAuthOpenLink');
  if (btnAuthOpenLink) btnAuthOpenLink.addEventListener('click', handleOpenBookingLink);

  // Auth Modal Tabs & Forms
  const btnAuthTabLogin = document.getElementById('btnAuthTabLogin');
  const btnAuthTabRegister = document.getElementById('btnAuthTabRegister');
  const formAuthLogin = document.getElementById('formAuthLogin');
  const formAuthRegister = document.getElementById('formAuthRegister');

  if (btnAuthTabLogin && btnAuthTabRegister) {
    btnAuthTabLogin.addEventListener('click', () => {
      btnAuthTabLogin.classList.add('active');
      btnAuthTabRegister.classList.remove('active');
      if (formAuthLogin) formAuthLogin.style.display = 'flex';
      if (formAuthRegister) formAuthRegister.style.display = 'none';
    });
    btnAuthTabRegister.addEventListener('click', () => {
      btnAuthTabRegister.classList.add('active');
      btnAuthTabLogin.classList.remove('active');
      if (formAuthLogin) formAuthLogin.style.display = 'none';
      if (formAuthRegister) formAuthRegister.style.display = 'flex';
    });
  }

  if (formAuthLogin) formAuthLogin.addEventListener('submit', handleSignIn);
  if (formAuthRegister) formAuthRegister.addEventListener('submit', handleSignUp);

  const btnAuthLogout = document.getElementById('btnAuthLogout');
  if (btnAuthLogout) btnAuthLogout.addEventListener('click', handleSignOut);

  const btnGuest = document.getElementById('btnContinueAsGuest');
  if (btnGuest) btnGuest.addEventListener('click', () => closeModal('modalAuth'));

  // Init Subscription payment modal listeners
  initSubscriptionListeners();
}

// ================= SERVICE WORKER REGISTRATION =================
function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.update().catch(() => {});
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('🔄 Новая версия приложения готова, перезагрузка...');
              showToast('Приложение обновлено! Перезагрузка...', 'info');
              setTimeout(() => window.location.reload(), 1200);
            }
          });
        }
      });
    }).catch(err => {
      console.log('SW registration error:', err);
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}

// ================= APP INITIALIZATION =================
function initApp() {
  try {
    setupEventListeners();
    restoreSavedPreferences();
    loadOnlineBookingSettings();
  } catch (uiErr) {
    console.warn('UI setup error:', uiErr);
  }

  (async () => {
    try {
      await window.db.init();

      initMasterAuth().then(() => {
        loadOnlineBookingSettings();
      }).catch(console.warn);

      await reloadData();
      setupDateStrip();
      setupServiceWorker();
      restoreActiveTabAndScroll();

      checkAndRunAutoBackup().catch(console.warn);
      checkOnlineBookings(false).catch(console.warn);
      triggerAutoSyncSlots().catch(console.warn);
    } catch (err) {
      console.error('Initialization error:', err);
      showToast('Ошибка инициализации базы данных', 'error');
    }
  })();

  // Periodic check of bookings every 60s
  setInterval(() => checkOnlineBookings(false), 60000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkOnlineBookings(false);
  });

  window.addEventListener('hairstudio:new-booking', () => {
    checkOnlineBookings(true);
  });

  window.addEventListener('online', () => {
    console.log('📶 Интернет появился: запуск автоматической синхронизации...');
    triggerAutoSyncSlots();
    triggerSyncMasterServices();
    checkOnlineBookings(false);
  });
}

// Global debug exposure
window.app = {
  state,
  reloadData,
  openAppointmentModal,
  openServiceModal,
  openExpenseModal,
  openClientDetailsModal,
  openKaspiPayModal
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
