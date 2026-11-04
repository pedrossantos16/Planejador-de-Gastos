import { SCOPE_OPTIONS, SETTLED_STATUSES } from './types.js';

export const PAYMENT_SOURCE = {
  AUTO_ACCESSORY: 'auto_accessory'
};

export const SETTLEMENT_ORIGIN = {
  DECLARED: 'declared_by_user',
  IMPORTED_UNCONFIRMED: 'imported_unconfirmed'
};

const isPending = payment => !payment.isPaid;

function accessoryTotal(item) {
  return (item.shippingCents ?? 0) + (item.assemblyCents ?? 0) +
    (item.installationCents ?? 0) + (item.additionalCostsCents ?? 0);
}

// linkedToDelivery: true = acompanha a entrega; false = vencimento independente;
// ausente = dado antigo sem vínculo identificado (nunca inferido).
export function planDeliveryShift(item, newDeliveryMonth) {
  const oldDeliveryMonth = item?.deliveryMonthIndex ?? 36;
  if (!item || oldDeliveryMonth === newDeliveryMonth) return null;
  const pending = (item.payments || []).filter(isPending);
  return {
    delta: newDeliveryMonth - oldDeliveryMonth,
    shiftable: pending.filter(payment => payment.linkedToDelivery === true),
    independentCount: pending.filter(payment => payment.linkedToDelivery === false).length,
    unlinkedCount: pending.filter(payment => payment.linkedToDelivery === undefined).length
  };
}

export function applyDeliveryShift(payments, delta) {
  return (payments || []).map(payment => {
    if (payment.isPaid || payment.linkedToDelivery !== true) return { ...payment };
    return { ...payment, monthIndex: Math.max(0, payment.monthIndex + delta) };
  });
}

export function needsSettlementConfirmation(item) {
  if (!SETTLED_STATUSES.includes(item.status) || item.scope === SCOPE_OPTIONS.ALREADY_OWNED) return false;
  if (!Number.isSafeInteger(item.basePriceCents) || item.basePriceCents <= 0) return false;
  const paidTotal = (item.payments || [])
    .filter(payment => payment.isPaid)
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  return paidTotal < item.basePriceCents;
}

function accessoryPayment(item) {
  return {
    amountCents: accessoryTotal(item),
    monthIndex: item.deliveryMonthIndex ?? 0,
    isPaid: false,
    isDeposit: false,
    linkedToDelivery: true,
    source: PAYMENT_SOURCE.AUTO_ACCESSORY,
    description: 'Custos acessórios pendentes (frete, montagem, instalação)'
  };
}

// Registra a quitação declarada sem inventar data: monthIndex 0 é apenas posição técnica.
export function buildSettledPayments(item, origin = SETTLEMENT_ORIGIN.DECLARED) {
  const payments = item.payments || [];
  const paid = payments.filter(payment => payment.isPaid).map(payment => ({ ...payment }));
  const keptPending = payments.filter(payment => isPending(payment) &&
    payment.linkedToDelivery !== true && payment.source !== PAYMENT_SOURCE.AUTO_ACCESSORY)
    .map(payment => ({ ...payment }));
  const paidTotal = paid.reduce((sum, payment) => sum + payment.amountCents, 0);
  const keptTotal = keptPending.reduce((sum, payment) => sum + payment.amountCents, 0);
  const result = [...paid];
  const gap = (item.basePriceCents ?? 0) - paidTotal - keptTotal;
  if (item.scope !== SCOPE_OPTIONS.ALREADY_OWNED && gap > 0) {
    result.push({
      amountCents: gap,
      monthIndex: 0,
      isPaid: true,
      isDeposit: false,
      paidDate: null,
      dateUnknown: true,
      origin,
      description: 'Quitação declarada (data não informada)'
    });
  }
  result.push(...keptPending);
  if (accessoryTotal(item) > 0) result.push(accessoryPayment(item));
  return result;
}

export function refreshAccessoryPending(item) {
  const payments = item.payments || [];
  if (payments.length === 0) return payments;
  const remaining = payments.filter(payment => payment.source !== PAYMENT_SOURCE.AUTO_ACCESSORY)
    .map(payment => ({ ...payment }));
  const hasOtherPending = remaining.some(isPending);
  if (accessoryTotal(item) > 0 && !hasOtherPending) remaining.push(accessoryPayment(item));
  return remaining;
}

export function accessoryTotalCents(item) {
  return accessoryTotal(item);
}
