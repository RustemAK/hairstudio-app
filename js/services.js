/**
 * HairStudio PWA - Services & Price List Controller
 * File: js/services.js
 * Handles CRUD operations for services and categories with automatic cloud sync.
 */

import { state, rebuildIndices } from './state.js';
import { escapeHtml, showToast } from './utils.js';

export function renderServices() {
  const container = document.getElementById('servicesList');
  if (!container) return;
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

  if (!container._hasItemClickListener) {
    container._hasItemClickListener = true;
    container.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.btn-edit-service');
      const card = e.target.closest('.data-item-card');
      if (editBtn || card) {
        const id = editBtn ? editBtn.dataset.id : card.querySelector('.btn-edit-service')?.dataset.id;
        if (id) {
          const s = state.services.find(item => String(item.id) === String(id));
          if (s) openServiceModal(s);
        }
      }
    });
  }

  const fragment = document.createDocumentFragment();
  list.forEach(s => {
    const card = document.createElement('div');
    card.className = 'data-item-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="item-left">
        <div class="item-title">${escapeHtml(s.name)}</div>
        <div class="item-meta">
          <span>🏷️ ${escapeHtml(s.category)}</span>
          <span>⏱️ ${s.duration} мин</span>
        </div>
      </div>
      <div class="item-right">
        <div class="item-price">${(Number(s.price) || 0).toLocaleString('ru-RU')} ₸</div>
        <button class="btn-action-small btn-edit-service" data-id="${s.id}" title="Редактировать">✏️</button>
      </div>
    `;
    fragment.appendChild(card);
  });
  container.appendChild(fragment);
}

export function openServiceModal(s = null) {
  state.editingServiceId = s ? s.id : null;
  const titleEl = document.getElementById('modalServiceTitle');
  const deleteBtn = document.getElementById('btnDeleteService');
  if (titleEl) titleEl.innerText = s ? 'Редактировать услугу' : 'Новая услуга';
  if (deleteBtn) deleteBtn.style.display = s ? 'block' : 'none';

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

  if (window.openModal) window.openModal('modalService');
}

export async function handleServiceSubmit(e, onDataChanged) {
  e.preventDefault();
  const serviceData = {
    name: document.getElementById('serviceName').value.trim(),
    category: document.getElementById('serviceCategory').value,
    price: Number(document.getElementById('servicePrice').value) || 0,
    duration: Number(document.getElementById('serviceDuration').value) || 60
  };

  if (!serviceData.name) {
    showToast('Введите название услуги', 'error');
    return;
  }

  if (state.editingServiceId) {
    serviceData.id = Number(state.editingServiceId);
    await window.db.updateService(serviceData);
    showToast('Услуга обновлена');
  } else {
    await window.db.addService(serviceData);
    showToast('Услуга добавлена в прайс-лист');
  }

  if (window.closeModal) window.closeModal('modalService');
  if (typeof onDataChanged === 'function') await onDataChanged();
  triggerSyncMasterServices();
}

export async function handleServiceDelete(onDataChanged) {
  if (!state.editingServiceId) return;
  const service = state.services.find(item => item.id === Number(state.editingServiceId));
  const serviceName = service ? service.name : '';
  const usedCount = state.appointments.filter(a => a.services && a.services.some(srv => srv.name === serviceName)).length;

  let msg = 'Удалить эту услугу из прайс-листа?';
  if (usedCount > 0) {
    msg = `Внимание: услуга «${serviceName}» использована в ${usedCount} записи(ях) в истории.\nОна будет удалена из прайс-листа для новых записей, но история прошлых визитов сохранится.\n\nПродолжить удаление?`;
  }

  if (confirm(msg)) {
    await window.db.deleteService(state.editingServiceId);
    if (window.closeModal) window.closeModal('modalService');
    showToast('Услуга удалена');
    if (typeof onDataChanged === 'function') await onDataChanged();
    triggerSyncMasterServices();
  }
}

export async function triggerSyncMasterServices() {
  if (!window.HairSupabase || !window.HairSupabase.isConfigured()) return;
  const masterId = state.currentMaster ? state.currentMaster.id : null;
  try {
    await window.HairSupabase.syncMasterServices(masterId, state.services);
  } catch (e) {
    console.warn('Sync services error:', e);
  }
}
