/**
 * HairStudio PWA - Subscription & Kaspi Payment Controller
 * File: js/subscription.js
 * Calculates subscription status, manages Kaspi QR payment modal and receipt submission.
 */

import { state } from './state.js';
import { showToast, safeStorage } from './utils.js';

export function calculateSubscription(master) {
  const m = master || state.currentMaster || {};
  const now = new Date();
  const endsAt = m.subscription_ends_at ? new Date(m.subscription_ends_at) : (m.trial_ends_at ? new Date(m.trial_ends_at) : null);
  const isLifetime = m.subscription_status === 'lifetime' || (endsAt && endsAt.getFullYear() > now.getFullYear() + 20);

  let status = m.subscription_status || 'trial';
  let daysLeft = 0;
  let isExpired = false;

  if (isLifetime) {
    status = 'lifetime';
    daysLeft = 9999;
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

export function updateSubscriptionBadge(master) {
  const calc = calculateSubscription(master);
  const subBadge = document.getElementById('authProfileSubscriptionBadge');
  if (!subBadge) return;

  if (calc.status === 'lifetime') {
    subBadge.innerText = '👑 Бессрочный доступ (VIP)';
    subBadge.className = 'auth-sub-badge lifetime';
  } else if (calc.status === 'active') {
    subBadge.innerText = `🟢 Подписка активна (${calc.daysLeft} дн.)`;
    subBadge.className = 'auth-sub-badge active';
  } else if (calc.status === 'trial') {
    subBadge.innerText = `🟡 Пробный период (осталось ${calc.daysLeft} дн.)`;
    subBadge.className = 'auth-sub-badge trial';
  } else {
    subBadge.innerText = '🔴 Подписка истекла';
    subBadge.className = 'auth-sub-badge expired';
  }
}

export function setupSubscriptionModalListeners() {
  const btnOpenSub = document.getElementById('btnOpenSubscriptionModal');
  if (btnOpenSub) {
    btnOpenSub.addEventListener('click', () => {
      const calc = calculateSubscription(state.currentMaster);
      const statusEl = document.getElementById('subModalCurrentStatusText');
      const expiresEl = document.getElementById('subModalExpiresAtText');

      if (statusEl) {
        statusEl.innerText = calc.isLifetime ? '👑 Бессрочный VIP' : (calc.status === 'active' ? '🟢 Подписка активна' : (calc.status === 'expired' ? '🔴 Подписка истекла' : '🟡 Пробный период'));
      }
      if (expiresEl) {
        expiresEl.innerText = calc.isLifetime ? 'Действует бессрочно' : (calc.endsAt ? `Действует до: ${calc.endsAt.toLocaleDateString('ru-RU')}` : 'Действует 14 дней');
      }

      if (window.openModal) {
        window.openModal('modalSubscription');
      }
    });
  }

  // Copy Kaspi Number
  const btnCopyKaspi = document.getElementById('btnCopyKaspiNumber');
  if (btnCopyKaspi) {
    btnCopyKaspi.addEventListener('click', () => {
      const phone = '+77079372624';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(phone).then(() => {
          showToast('Номер Kaspi скопирован: +7 707 937-26-24');
        }).catch(() => {
          prompt('Номер Kaspi для перевода:', phone);
        });
      } else {
        prompt('Номер Kaspi для перевода:', phone);
      }
    });
  }

  // Send Receipt to WhatsApp
  const btnSendReceipt = document.getElementById('btnSendReceiptWhatsapp');
  if (btnSendReceipt) {
    btnSendReceipt.addEventListener('click', () => {
      const selectedRadio = document.querySelector('input[name="subPlanOption"]:checked');
      const months = selectedRadio ? selectedRadio.value : '1';
      let planName = '1 месяц (2 990 ₸)';
      if (months === '3') planName = '3 месяца (7 990 ₸)';
      if (months === '12') planName = '12 месяцев (24 900 ₸)';

      const master = state.currentMaster || {};
      const salon = master.salon_name || safeStorage.get('hairstudio_studio_name', 'HairStudio');
      const name = master.name || 'Мастер';
      const slug = master.slug || safeStorage.get('hairstudio_master_slug', 'demo');

      const waMsg = `Здравствуйте! Я оплатил(а) подписку HairStudio.\n\n✂️ Салон: ${salon}\n👤 Мастер: ${name}\n🌐 Адрес ссылки: /book.html?m=${slug}\n⭐ Выбранный тариф: ${planName}\n\nПрикрепляю чек/квитанцию перевода Kaspi:`;
      const waUrl = `https://wa.me/77079372624?text=${encodeURIComponent(waMsg)}`;
      window.open(waUrl, '_blank');
    });
  }
}
