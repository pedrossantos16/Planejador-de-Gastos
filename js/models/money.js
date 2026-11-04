export function parseMoneyToCents(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    const cents = Math.round(value * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }

  const text = String(value).trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (text.startsWith('-')) return null;

  let normalized;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) {
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+(,\d{1,2})?$/.test(text)) {
    normalized = text.replace(',', '.');
  } else if (/^\d+(\.\d{1,2})?$/.test(text)) {
    normalized = text;
  } else {
    return null;
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCentsToBrl(cents) {
  if (!Number.isSafeInteger(cents)) return '';
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
