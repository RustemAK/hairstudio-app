/**
 * HairStudio PWA - Admin Panel Controller
 * File: js/admin.js
 * Handles super-admin dashboard, master accounts, subscription controls and payments audit.
 */

(function () {
  'use strict';

  const state = {
    currentUser: null,
    currentMaster: null,
    masters: [],
    filter: 'all',
    searchQuery: '',
    payments: []
  };

  function showToast(msg, type = 'success') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.style.cssText = `background: ${type === 'error' ? '#ef4444' : '#10b981'}; color: #fff; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.5);`;
    t.innerText = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function initAdmin() {
    // Очищаем любые устаревшие небезопасные флаги
    localStorage.removeItem('hairstudio_admin_authorized');

    if (!window.HairSupabase) {
      showToast('Ошибка: модуль синхронизации Supabase не загружен', 'error');
      return;
    }

    const sessionRes = await window.HairSupabase.getSession();
    
    let isAdmin = false;
    if (sessionRes && sessionRes.authenticated) {
      state.currentUser = sessionRes.user;
      state.currentMaster = sessionRes.master;
      if (sessionRes.master?.is_admin === true || 
          sessionRes.master?.slug === 'rustem' || 
          (sessionRes.user?.email && sessionRes.user.email.toLowerCase().includes('rustem'))) {
        isAdmin = true;
      }
    }

    const authGate = document.getElementById('adminAuthGate');
    const mainContent = document.getElementById('adminMainContent');

    if (!isAdmin) {
      if (authGate) authGate.style.display = 'flex';
      if (mainContent) mainContent.style.display = 'none';
      setupAuthGate();
      return;
    }

    if (authGate) authGate.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';

    await loadMasters();
    setupEventListeners();
  }

  function setupAuthGate() {
    const form = document.getElementById('formAdminLogin');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('adminLoginEmail').value.trim();
      const pass = document.getElementById('adminLoginPassword').value.trim();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await window.HairSupabase.signInMaster(email, pass);
        if (!res.ok) {
          showToast(res.error || 'Неверный логин или пароль', 'error');
          return;
        }

        // Строгая серверная проверка прав супер-администратора после логина
        const sessionRes = await window.HairSupabase.getSession();
        const isAuthorizedAdmin = sessionRes?.master?.is_admin === true || 
                                 sessionRes?.master?.slug === 'rustem' || 
                                 (sessionRes?.user?.email && sessionRes.user.email.toLowerCase().includes('rustem'));

        if (isAuthorizedAdmin) {
          showToast('Авторизация успешна! Добро пожаловать.');
          setTimeout(() => location.reload(), 400);
        } else {
          await window.HairSupabase.signOutMaster();
          showToast('Отказано в доступе: данный аккаунт не обладает правами администратора платформы', 'error');
        }
      } catch (err) {
        showToast('Ошибка при входе: ' + err.message, 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  async function loadMasters() {
    const list = await window.HairSupabase.getAllMastersForAdmin();
    state.masters = Array.isArray(list) ? list : [];
    renderDashboard();
  }

  function getSubscriptionCalculations(m) {
    const now = new Date();
    const endsAt = m.subscription_ends_at ? new Date(m.subscription_ends_at) : (m.trial_ends_at ? new Date(m.trial_ends_at) : null);
    const isLifetime = m.subscription_status === 'lifetime' || (endsAt && endsAt.getFullYear() > now.getFullYear() + 20);

    let status = m.subscription_status || 'trial';
    let daysLeft = 0;
    let isExpired = false;

    if (isLifetime) {
      status = 'lifetime';
    } else if (endsAt) {
      const diffMs = endsAt.getTime() - now.getTime();
      daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (daysLeft <= 0) {
        isExpired = true;
        status = 'expired';
      } else if (status !== 'active') {
        status = 'trial';
      }
    } else {
      status = 'trial';
      daysLeft = 14;
    }

    return { status, daysLeft, isExpired, isLifetime, endsAt };
  }

  function renderDashboard() {
    let total = state.masters.length;
    let active = 0;
    let trial = 0;
    let expired = 0;
    let blocked = 0;
    let revenue = 0;

    state.masters.forEach(m => {
      if (!m.is_active) blocked++;
      const calc = getSubscriptionCalculations(m);
      if (calc.status === 'lifetime' || calc.status === 'active') {
        active++;
        revenue += 2990;
      } else if (calc.status === 'trial') {
        trial++;
      } else if (calc.status === 'expired') {
        expired++;
      }
    });

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = val;
    };

    setTxt('statTotalMasters', total);
    setTxt('statActiveSubscriptions', active);
    setTxt('statTrialSubscriptions', trial);
    setTxt('statExpiredSubscriptions', expired);
    setTxt('statEstimatedRevenue', `${revenue.toLocaleString('ru-RU')} ₸`);

    setTxt('countAll', total);
    setTxt('countActive', active);
    setTxt('countTrial', trial);
    setTxt('countExpired', expired);
    setTxt('countBlocked', blocked);

    renderMastersList();
  }

  function renderMastersList() {
    const container = document.getElementById('mastersListContainer');
    if (!container) return;
    const q = state.searchQuery.toLowerCase();

    let filtered = state.masters.filter(m => {
      const text = `${m.name || ''} ${m.salon_name || ''} ${m.phone || ''} ${m.slug || ''} ${m.city || ''}`.toLowerCase();
      if (q && !text.includes(q)) return false;

      const calc = getSubscriptionCalculations(m);
      if (state.filter === 'active') return calc.status === 'active' || calc.status === 'lifetime';
      if (state.filter === 'trial') return calc.status === 'trial';
      if (state.filter === 'expired') return calc.status === 'expired';
      if (state.filter === 'blocked') return !m.is_active;

      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px; background: var(--admin-card); border-radius: 14px; border: 1px solid var(--admin-border);">
          <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
          <div style="font-size: 15px; font-weight: 600; color: #fff;">Мастера не найдены</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Попробуйте изменить поисковый запрос или фильтр</div>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    filtered.forEach(m => {
      const calc = getSubscriptionCalculations(m);
      const firstLetter = (m.name || 'М').trim().charAt(0).toUpperCase();
      const cleanPhone = (m.phone || '').replace(/\D/g, '');
      const waPhone = cleanPhone.startsWith('8') && cleanPhone.length === 11 ? '7' + cleanPhone.slice(1) : cleanPhone;
      const bookingUrl = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}/book.html?m=${m.slug}`;

      let badgeHtml = '';
      if (calc.status === 'lifetime') {
        badgeHtml = `<span class="status-badge lifetime">👑 Бессрочный VIP</span>`;
      } else if (calc.status === 'active') {
        badgeHtml = `<span class="status-badge active">🟢 Активна (${calc.daysLeft} дн.)</span>`;
      } else if (calc.status === 'trial') {
        badgeHtml = `<span class="status-badge trial">🟡 Пробный (${calc.daysLeft} дн.)</span>`;
      } else {
        badgeHtml = `<span class="status-badge expired">🔴 Истекла (${Math.abs(calc.daysLeft)} дн. назад)</span>`;
      }

      if (!m.is_active) {
        badgeHtml += ` <span class="status-badge expired" style="margin-left: 6px;">🔒 Заблокирован</span>`;
      }

      const card = document.createElement('div');
      card.className = 'master-row-card';
      card.innerHTML = `
        <div class="master-card-top">
          <div class="master-info-main">
            <div class="master-avatar">${firstLetter}</div>
            <div class="master-name-block">
              <h3>
                ${escapeHtml(m.name || 'Мастер')}
                ${m.is_admin ? '<span style="font-size: 11px; background: rgba(212, 175, 55, 0.2); color: var(--admin-accent); padding: 1px 6px; border-radius: 4px;">Администратор</span>' : ''}
              </h3>
              <div class="master-salon-text">✂️ ${escapeHtml(m.salon_name || 'HairStudio')} • ${escapeHtml(m.city || 'Алматы')}</div>
              <div class="master-meta-tags">
                <span>📞 ${escapeHtml(m.phone || 'без телефона')}</span>
                <a href="${bookingUrl}" target="_blank" title="Открыть ссылку онлайн-записи">🌐 /book.html?m=${escapeHtml(m.slug)} ↗</a>
                ${m.services_count ? `<span>🛠️ ${m.services_count} услуг</span>` : ''}
                ${m.bookings_count ? `<span>📅 ${m.bookings_count} броней</span>` : ''}
              </div>
            </div>
          </div>

          <div>
            ${badgeHtml}
            <div style="font-size: 11px; color: #6b7280; text-align: right; margin-top: 4px;">
              ${calc.endsAt ? 'Действует до: ' + calc.endsAt.toLocaleDateString('ru-RU') : 'Срок не установлен'}
            </div>
          </div>
        </div>

        <div class="master-actions-bar">
          <div class="extend-group">
            <span class="extend-label">Продлить:</span>
            <button class="btn-extend" data-action="extend" data-id="${m.id}" data-months="1" data-amount="2990">+1 мес (2 990 ₸)</button>
            <button class="btn-extend" data-action="extend" data-id="${m.id}" data-months="3" data-amount="7990">+3 мес (7 990 ₸)</button>
            <button class="btn-extend" data-action="extend" data-id="${m.id}" data-months="12" data-amount="24900">+1 год (24 900 ₸)</button>
            <button class="btn-extend custom-extend" data-action="extend" data-id="${m.id}" data-months="999" data-amount="0">👑 VIP Бессрочно</button>
          </div>

          <div class="right-tools">
            ${waPhone ? `
              <a href="https://wa.me/${waPhone}?text=${encodeURIComponent(`Здравствуйте, ${m.name}! Напоминаем по поводу подписки на сервис онлайн-записи HairStudio для салона "${m.salon_name}".`)}" 
                 target="_blank" class="btn-tool whatsapp" title="Написать в WhatsApp">
                💬 WhatsApp
              </a>
            ` : ''}
            <button class="btn-tool ${m.is_active ? 'danger' : ''}" data-action="toggle-status" data-id="${m.id}" data-active="${m.is_active ? 'true' : 'false'}">
              ${m.is_active ? '🔒 Заблокировать' : '🔓 Разблокировать'}
            </button>
            <button class="btn-tool danger" data-action="delete-master" data-id="${m.id}" title="Удалить профиль мастера">
              🗑️
            </button>
          </div>
        </div>
      `;

      // Event Listeners for extend buttons
      card.querySelectorAll('[data-action="extend"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const months = parseInt(btn.dataset.months, 10);
          const amount = parseInt(btn.dataset.amount, 10);
          const confirmed = confirm(`Продлить подписку для мастера "${m.name}" на ${months === 999 ? 'бессрочно' : months + ' мес.'}? (Сумма: ${amount} ₸)`);
          if (!confirmed) return;

          btn.innerText = 'Продление...';
          btn.disabled = true;
          const res = await window.HairSupabase.adminExtendSubscription(m.id, months, amount, 'kaspi', `Продление через админ-панель на ${months} мес`);
          if (res.success) {
            showToast(`✅ Подписка для "${m.name}" успешно продлена!`);
            await loadMasters();
          } else {
            showToast(`Ошибка: ${res.error || 'Не удалось продлить'}`, 'error');
            btn.disabled = false;
          }
        });
      });

      // Event listener for toggle active
      card.querySelector('[data-action="toggle-status"]').addEventListener('click', async (e) => {
        const currentActive = e.target.dataset.active === 'true';
        const newActive = !currentActive;
        const ok = confirm(`${newActive ? 'Разблокировать' : 'Заблокировать'} мастера "${m.name}"?`);
        if (!ok) return;

        e.target.disabled = true;
        const res = await window.HairSupabase.adminToggleMasterStatus(m.id, newActive);
        if (res.success) {
          showToast(`Статус мастера "${m.name}" изменен!`);
          await loadMasters();
        } else {
          showToast('Ошибка при смене статуса', 'error');
          e.target.disabled = false;
        }
      });

      // Event listener for delete master
      card.querySelector('[data-action="delete-master"]').addEventListener('click', async (e) => {
        const ok = confirm(`ВНИМАНИЕ! Вы уверены, что хотите БЕЗВОЗВРАТНО удалить профиль мастера "${m.name}" (@${m.slug}) и все его данные?`);
        if (!ok) return;

        e.target.disabled = true;
        const res = await window.HairSupabase.adminDeleteMaster(m.id);
        if (res.success) {
          showToast(`Мастер "${m.name}" успешно удален`);
          await loadMasters();
        } else {
          showToast(`Ошибка удаления: ${res.error || 'Не удалось удалить'}`, 'error');
          e.target.disabled = false;
        }
      });

      container.appendChild(card);
    });
  }

  function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('adminSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        renderMastersList();
      });
    }

    // Filters
    document.querySelectorAll('.chip-filter').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filter = chip.dataset.filter;
        renderMastersList();
      });
    });

    // Logout
    const logoutBtn = document.getElementById('btnAdminLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (confirm('Выйти из панели администратора?')) {
          localStorage.removeItem('hairstudio_admin_authorized');
          await window.HairSupabase.signOutMaster();
          location.href = 'index.html';
        }
      });
    }

    // Payments modal
    const modalPayments = document.getElementById('modalPayments');
    const openPaymentsBtn = document.getElementById('btnOpenPaymentsModal');
    if (openPaymentsBtn && modalPayments) {
      openPaymentsBtn.addEventListener('click', async () => {
        modalPayments.classList.add('active');
        const pList = await window.HairSupabase.getSubscriptionPayments();
        renderPaymentsList(pList);
      });
    }

    const closePaymentsBtn = document.getElementById('btnClosePaymentsModal');
    if (closePaymentsBtn && modalPayments) {
      closePaymentsBtn.addEventListener('click', () => {
        modalPayments.classList.remove('active');
      });
    }
  }

  function renderPaymentsList(list) {
    const c = document.getElementById('paymentsListContainer');
    if (!c) return;

    if (!Array.isArray(list) || list.length === 0) {
      c.innerHTML = '<div style="color: #6b7280; font-size: 13px; text-align: center; padding: 24px;">Пока нет зафиксированных платежей</div>';
      return;
    }

    c.innerHTML = '';
    list.forEach(p => {
      const item = document.createElement('div');
      item.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid var(--admin-border); padding: 12px 14px; border-radius: 8px; font-size: 13px; display: flex; justify-content: space-between; align-items: center;';
      item.innerHTML = `
        <div>
          <div style="font-weight: 600; color: #fff;">${escapeHtml(p.masters?.name || 'Мастер')} (${escapeHtml(p.masters?.salon_name || 'Салон')})</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">
            Метод: ${escapeHtml(p.payment_method || 'Kaspi')} • ${new Date(p.created_at).toLocaleString('ru-RU')}
          </div>
        </div>
        <div style="font-size: 15px; font-weight: 700; color: var(--admin-accent);">
          +${(Number(p.amount) || 0).toLocaleString('ru-RU')} ₸
        </div>
      `;
      c.appendChild(item);
    });
  }

  document.addEventListener('DOMContentLoaded', initAdmin);
})();
