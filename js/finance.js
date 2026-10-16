/**
 * HairStudio PWA - Finance, Expenses & Profit Analytics Controller
 * File: js/finance.js
 * Calculates revenue, expenses, net profit, average checks and top services.
 */

import { state } from './state.js';
import { escapeHtml, formatDateToYMD, formatDisplayDate, isAppointmentCompleted, RU_MONTHS_FULL, showToast } from './utils.js';

export function renderFinance() {
  const period = state.financePeriod;
  const now = new Date();
  const todayStr = formatDateToYMD(now);

  let filteredAppointments = [];
  let filteredExpenses = [];
  let subText = 'Ваш реальный чистый доход за выбранный период';

  if (period === 'today') {
    filteredAppointments = state.appointments.filter(a => a.date === todayStr);
    filteredExpenses = state.expenses.filter(e => e.date === todayStr);
    subText = 'Чистый доход за сегодня';
  } else if (period === 'week') {
    const firstDay = new Date(now);
    const dayIndex = (now.getDay() + 6) % 7;
    firstDay.setDate(now.getDate() - dayIndex);
    const firstDayStr = formatDateToYMD(firstDay);

    filteredAppointments = state.appointments.filter(a => a.date >= firstDayStr && a.date <= todayStr);
    filteredExpenses = state.expenses.filter(e => e.date >= firstDayStr && e.date <= todayStr);
    subText = 'Чистый доход за текущую неделю';
  } else if (period === 'month') {
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    filteredAppointments = state.appointments.filter(a => (a.date || '').startsWith(monthPrefix));
    filteredExpenses = state.expenses.filter(e => (e.date || '').startsWith(monthPrefix));
    subText = `Чистый доход за ${RU_MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}`;
  } else if (period === 'prev_month') {
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    filteredAppointments = state.appointments.filter(a => (a.date || '').startsWith(prevMonthPrefix));
    filteredExpenses = state.expenses.filter(e => (e.date || '').startsWith(prevMonthPrefix));
    subText = `Чистый доход за ${RU_MONTHS_FULL[prevDate.getMonth()]} ${prevDate.getFullYear()}`;
  } else {
    filteredAppointments = state.appointments;
    filteredExpenses = state.expenses;
    subText = 'Чистый доход за всё время';
  }

  const completedApps = filteredAppointments.filter(isAppointmentCompleted);
  const revenue = completedApps.reduce((sum, a) => sum + (Number(a.totalPrice) || 0), 0);
  const expensesTotal = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netProfit = revenue - expensesTotal;
  const avgCheck = completedApps.length > 0 ? Math.round(revenue / completedApps.length) : 0;
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

  const profitElem = document.getElementById('statNetProfit');
  if (profitElem) {
    profitElem.innerText = `${netProfit.toLocaleString('ru-RU')} ₸`;
    profitElem.className = `stat-card-value ${netProfit >= 0 ? 'profit' : 'expense'}`;
  }

  const subElem = document.getElementById('statNetProfitSub');
  if (subElem) subElem.innerText = subText;

  const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  setTxt('statTotalRevenue', `${revenue.toLocaleString('ru-RU')} ₸`);
  setTxt('statAppointmentsCount', `${completedApps.length} вып. записей`);
  setTxt('statTotalExpenses', `${expensesTotal.toLocaleString('ru-RU')} ₸`);
  setTxt('statExpensesCount', `${filteredExpenses.length} закупок`);
  setTxt('statAvgCheck', `${avgCheck.toLocaleString('ru-RU')} ₸`);
  setTxt('statMargin', `${margin}%`);

  // Top Services Breakdown
  const topServicesBox = document.getElementById('topServicesContainer');
  if (!topServicesBox) return;
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
          <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(name)}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${data.count} раз(а)</div>
        </div>
        <div style="font-weight: 700; color: var(--accent-gold-light);">${data.revenue.toLocaleString('ru-RU')} ₸</div>
      `;
      topServicesBox.appendChild(row);
    });
  }
}

export function renderExpenses() {
  const container = document.getElementById('expensesList');
  if (!container) return;
  container.innerHTML = '';

  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthExpenses = state.expenses.filter(e => (e.date || '').startsWith(currentMonthPrefix));
  const monthTotal = monthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const monthTotalEl = document.getElementById('expensesMonthTotal');
  if (monthTotalEl) {
    monthTotalEl.innerText = `${monthTotal.toLocaleString('ru-RU')} ₸`;
  }

  let list = state.expenses;
  if (state.expenseCategory !== 'all') {
    list = list.filter(e => e.category === state.expenseCategory);
  }

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

  if (!container._hasItemClickListener) {
    container._hasItemClickListener = true;
    container.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.btn-edit-exp');
      const card = e.target.closest('.data-item-card');
      if (editBtn || card) {
        const id = editBtn ? editBtn.dataset.id : card.querySelector('.btn-edit-exp')?.dataset.id;
        if (id) {
          const exp = state.expenses.find(item => String(item.id) === String(id));
          if (exp) openExpenseModal(exp);
        }
      }
    });
  }

  const fragment = document.createDocumentFragment();
  list.forEach(exp => {
    const card = document.createElement('div');
    card.className = 'data-item-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="item-left">
        <div class="item-title">${escapeHtml(exp.title)}</div>
        <div class="item-meta">
          <span>📅 ${formatDisplayDate(exp.date)}</span>
          <span>📁 ${escapeHtml(exp.category)}</span>
          ${exp.quantity ? `<span>🔢 ${escapeHtml(exp.quantity)}</span>` : ''}
        </div>
        ${exp.notes ? `<div style="font-size: 11px; color: var(--text-subtle); margin-top: 2px;">${escapeHtml(exp.notes)}</div>` : ''}
      </div>
      <div class="item-right">
        <div class="item-price expense">-${(Number(exp.amount) || 0).toLocaleString('ru-RU')} ₸</div>
        <button class="btn-action-small btn-edit-exp" data-id="${exp.id}" title="Редактировать">✏️</button>
      </div>
    `;
    fragment.appendChild(card);
  });
  container.appendChild(fragment);
}

export function openExpenseModal(exp = null) {
  state.editingExpenseId = exp ? exp.id : null;
  const titleEl = document.getElementById('modalExpenseTitle');
  const deleteBtn = document.getElementById('btnDeleteExpense');
  if (titleEl) titleEl.innerText = exp ? 'Редактировать расход' : 'Новая закупка';
  if (deleteBtn) deleteBtn.style.display = exp ? 'block' : 'none';

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
    document.getElementById('expenseDate').value = formatDateToYMD(new Date());
    document.getElementById('expenseNotes').value = '';
  }

  if (window.openModal) window.openModal('modalExpense');
}

export async function handleExpenseSubmit(e, onDataChanged) {
  e.preventDefault();
  const expData = {
    title: document.getElementById('expenseTitle').value.trim(),
    category: document.getElementById('expenseCategory').value,
    amount: Number(document.getElementById('expenseAmount').value) || 0,
    quantity: document.getElementById('expenseQuantity').value.trim(),
    date: document.getElementById('expenseDate').value,
    notes: document.getElementById('expenseNotes').value.trim()
  };

  if (!expData.title) {
    showToast('Введите название расхода', 'error');
    return;
  }

  if (state.editingExpenseId) {
    expData.id = Number(state.editingExpenseId);
    await window.db.updateExpense(expData);
    showToast('Расход обновлен');
  } else {
    await window.db.addExpense(expData);
    showToast('Закупка материалов сохранена');
  }

  if (window.closeModal) window.closeModal('modalExpense');
  if (typeof onDataChanged === 'function') await onDataChanged();
}

export async function handleExpenseDelete(onDataChanged) {
  if (!state.editingExpenseId) return;
  if (confirm('Удалить эту запись о расходе?')) {
    await window.db.deleteExpense(state.editingExpenseId);
    if (window.closeModal) window.closeModal('modalExpense');
    showToast('Расход удален');
    if (typeof onDataChanged === 'function') await onDataChanged();
  }
}
