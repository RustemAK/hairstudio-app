/**
 * HairStudio PWA - Centralized State Management
 * File: js/state.js
 * Holds the reactive state of the application with O(1) Map indices for ultra-fast lookups.
 */

import { formatDateToYMD, cleanPhoneForWhatsapp } from './utils.js';

export const state = {
  cardDensity: 'compact',
  activeTab: 'schedule',
  selectedDate: formatDateToYMD(new Date()),
  scheduleFilter: 'all',
  serviceCategory: 'all',
  expenseCategory: 'all',
  financePeriod: 'month',
  selectedServicesForAppointment: new Set(),
  services: [],
  appointments: [],
  expenses: [],
  clients: [],
  clientNotes: [],
  pendingBookings: [],
  authSession: null,
  currentUser: null,
  currentMaster: null,
  editingAppointmentId: null,
  editingServiceId: null,
  editingExpenseId: null,
  viewingClientId: null,
  appointmentClientMode: 'existing',
  scheduleViewMode: 'timeline',
  workStartHour: 8,
  workEndHour: 22
};

// O(1) lookup indices
export const indices = {
  servicesMap: new Map(),
  clientsIdMap: new Map(),
  clientsPhoneMap: new Map(),
  appointmentsDateMap: new Map(),
  appointmentsIdMap: new Map()
};

/**
 * Rebuild O(1) indices whenever data changes
 */
export function rebuildIndices() {
  // Services index
  indices.servicesMap.clear();
  state.services.forEach(s => {
    indices.servicesMap.set(Number(s.id), s);
    indices.servicesMap.set(String(s.id), s);
  });

  // Clients index
  indices.clientsIdMap.clear();
  indices.clientsPhoneMap.clear();
  state.clients.forEach(c => {
    indices.clientsIdMap.set(Number(c.id), c);
    indices.clientsIdMap.set(String(c.id), c);
    if (c.phone) {
      const clean = cleanPhoneForWhatsapp(c.phone);
      if (clean) indices.clientsPhoneMap.set(clean, c);
    }
  });

  // Appointments index by date and id
  indices.appointmentsDateMap.clear();
  indices.appointmentsIdMap.clear();
  state.appointments.forEach(a => {
    indices.appointmentsIdMap.set(Number(a.id), a);
    indices.appointmentsIdMap.set(String(a.id), a);

    if (a.date) {
      if (!indices.appointmentsDateMap.has(a.date)) {
        indices.appointmentsDateMap.set(a.date, []);
      }
      indices.appointmentsDateMap.get(a.date).push(a);
    }
  });
}

// Selectors
export function getServiceById(id) {
  return indices.servicesMap.get(id) || indices.servicesMap.get(Number(id)) || null;
}

export function getClientById(id) {
  return indices.clientsIdMap.get(id) || indices.clientsIdMap.get(Number(id)) || null;
}

export function getClientByPhone(phone) {
  const clean = cleanPhoneForWhatsapp(phone);
  return indices.clientsPhoneMap.get(clean) || null;
}

export function getAppointmentsForDate(dateStr) {
  return indices.appointmentsDateMap.get(dateStr) || [];
}

export function getAppointmentsForSelectedDate() {
  return getAppointmentsForDate(state.selectedDate);
}

// Expose state globally for debugging & backwards compatibility
if (typeof window !== 'undefined') {
  window.state = state;
  window.stateIndices = indices;
  window.rebuildIndices = rebuildIndices;
}
