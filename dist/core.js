/** Calendar dates and money stay independent of the browser and its time zone. */
export const CATEGORIES = Object.freeze(['Electronics', 'Clothing', 'Home', 'Beauty', 'Sports', 'Other']);
export const CURRENCIES = Object.freeze(['USD', 'GBP', 'EUR', 'INR', 'LKR', 'AUD', 'CAD']);
const DAY = 86_400_000;
const MAX_AMOUNT = 100_000_000_000; // 1 billion in major currency units, held as cents.

function isoParts(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Use a date in YYYY-MM-DD format.');
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) throw new RangeError('That calendar date is not valid.');
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new RangeError('That calendar date is not valid.');
  return { year, month, day, timestamp };
}

function fromUTC(timestamp) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(timestamp) || year < 1000 || year > 9999) throw new RangeError('The resulting date is outside the supported calendar.');
  return `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
}

export function todayISO(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('A valid Date is required.');
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDays(date, days) {
  integer(days, -1_000_000, 1_000_000, 'Days');
  return fromUTC(isoParts(date).timestamp + days * DAY);
}

export function addMonths(date, months) {
  integer(months, -100_000, 100_000, 'Months');
  const { year, month, day } = isoParts(date);
  const index = year * 12 + month - 1 + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = ((index % 12) + 12) % 12;
  if (targetYear < 1000 || targetYear > 9999) throw new RangeError('The resulting date is outside the supported calendar.');
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return fromUTC(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
}

export function daysBetween(from, to) {
  return Math.round((isoParts(to).timestamp - isoParts(from).timestamp) / DAY);
}

export function money(cents, currency = 'USD') {
  if (!Number.isSafeInteger(cents)) throw new TypeError('Money must be expressed as whole, safe integer cents.');
  if (!CURRENCIES.includes(currency)) throw new RangeError('Choose a supported currency.');
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

export function parseAmount(value) {
  if (typeof value !== 'string') throw new TypeError('Enter an amount as a decimal number.');
  const clean = value.trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(clean)) throw new TypeError('Enter a positive amount with no more than two decimal places.');
  const [whole = '', decimal = ''] = clean.split('.');
  const significant = whole.replace(/^0+/, '') || '0';
  if (significant.length > 10) throw new RangeError('The amount cannot exceed 1 billion.');
  const cents = Number(significant) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT) throw new RangeError('The amount cannot exceed 1 billion.');
  return cents;
}

export function purchaseReturnDate(purchase) {
  if (purchase.returnDeadline) {
    isoParts(purchase.returnDeadline);
    return purchase.returnDeadline;
  }
  return addDays(purchase.purchaseDate, purchase.returnDays);
}

export function purchaseWarrantyDate(purchase) {
  return purchase.warrantyMonths ? addMonths(purchase.purchaseDate, purchase.warrantyMonths) : null;
}

export function effectiveStatus(purchase, today = todayISO()) {
  if (purchase.status === 'kept' || purchase.status === 'returned') return purchase.status;
  return daysBetween(today, purchaseReturnDate(purchase)) >= 0 ? 'active' : 'expired';
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${label} must be an object.`);
  return value;
}

function text(value, max, label, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') throw new TypeError(`${label} must be text.`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) throw new RangeError(`${label} must contain ${required ? '1' : '0'} to ${max} characters.`);
  return normalized;
}

function importDate(value, label) {
  const parsed = isoParts(value);
  if (parsed.year < 2000 || parsed.year > 2100) throw new RangeError(`${label} must be between 2000 and 2100.`);
  return value;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new TypeError('Purchase creation time must be a valid ISO timestamp.');
  importDate(value.slice(0, 10), 'Creation date');
  const [hour, minute, second] = value.slice(11, 19).split(':').map(Number);
  const millis = Date.parse(value);
  if (hour > 23 || minute > 59 || second > 59 || !Number.isFinite(millis)) throw new RangeError('Purchase creation time is not valid.');
  const normalized = new Date(millis).toISOString();
  importDate(normalized.slice(0, 10), 'Creation date');
  return normalized;
}

export function validateState(input) {
  const state = record(input, 'The imported file');
  if (state.version !== 1) throw new RangeError('This file uses an unsupported data version.');
  if (typeof state.demo !== 'boolean') throw new TypeError('The file must specify whether it contains example data.');
  const settings = record(state.settings, 'Preferences');
  if (!CURRENCIES.includes(settings.currency)) throw new RangeError('The preferred currency is not supported.');
  const leadDays = integer(settings.leadDays, 0, 90, 'Reminder lead time');
  if (!Array.isArray(state.purchases) || state.purchases.length > 1000) throw new RangeError('A file can contain up to 1,000 purchases.');
  const ids = new Set();
  const purchases = state.purchases.map((entry, index) => {
    const p = record(entry, `Purchase ${index + 1}`);
    const id = text(p.id, 100, 'Purchase ID', true);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new TypeError('Purchase IDs may only contain letters, numbers, hyphens, and underscores.');
    if (ids.has(id)) throw new RangeError('The file contains duplicate purchase IDs.');
    ids.add(id);
    const name = text(p.name, 120, 'Item name', true);
    const merchant = text(p.merchant, 120, 'Shop name', true);
    const amount = integer(p.amount, 0, MAX_AMOUNT, 'Purchase amount in cents');
    if (!CURRENCIES.includes(p.currency)) throw new RangeError(`The currency for ${name} is not supported.`);
    const purchaseDate = importDate(p.purchaseDate, 'Purchase date');
    const returnDays = integer(p.returnDays, 0, 730, 'Return window');
    const returnDeadline = p.returnDeadline === null || p.returnDeadline === undefined || p.returnDeadline === '' ? null : importDate(p.returnDeadline, 'Return deadline');
    if (returnDeadline && daysBetween(purchaseDate, returnDeadline) < 0) throw new RangeError('A return deadline cannot be before the purchase date.');
    const warrantyMonths = integer(p.warrantyMonths ?? 0, 0, 120, 'Warranty length');
    if (!CATEGORIES.includes(p.category)) throw new RangeError(`The category for ${name} is not supported.`);
    if (!['active', 'kept', 'returned'].includes(p.status)) throw new RangeError(`The status for ${name} is not supported.`);
    return {
      id, name, merchant, amount, currency: p.currency, purchaseDate, returnDays, returnDeadline, warrantyMonths,
      category: p.category, status: p.status,
      orderRef: text(p.orderRef, 150, 'Order reference'),
      notes: text(p.notes, 3000, 'Purchase notes'),
      createdAt: timestamp(p.createdAt),
    };
  });
  return { version: 1, demo: state.demo, settings: { currency: settings.currency, leadDays }, purchases };
}

export function makeDemoState() {
  const today = todayISO();
  const now = new Date().toISOString();
  const sample = [
    { id: 'demo-headphones', name: 'Wireless headphones', merchant: 'Sound & Co.', amount: 12900, daysAgo: 27, returnDays: 30, warrantyMonths: 24, category: 'Electronics', status: 'active', notes: 'Try them on a longer commute before deciding.' },
    { id: 'demo-sneakers', name: 'Everyday sneakers', merchant: 'Stride', amount: 8900, daysAgo: 12, returnDays: 14, warrantyMonths: 0, category: 'Clothing', status: 'active', notes: 'Keep the box until the fit feels right.' },
    { id: 'demo-lamp', name: 'Reading lamp', merchant: 'Room Theory', amount: 4500, daysAgo: 5, returnDays: 30, warrantyMonths: 12, category: 'Home', status: 'active', notes: 'Receipt is in the purchase confirmation email.' },
    { id: 'demo-yoga', name: 'Cork yoga mat', merchant: 'Move Well', amount: 3800, daysAgo: 8, returnDays: 14, warrantyMonths: 6, category: 'Sports', status: 'active', notes: '' },
    { id: 'demo-backpack', name: 'Weekend backpack', merchant: 'Field Notes', amount: 7200, daysAgo: 40, returnDays: 30, warrantyMonths: 24, category: 'Clothing', status: 'kept', notes: 'A keeper. Save the warranty details.' },
    { id: 'demo-serum', name: 'Daily face serum', merchant: 'Good Form', amount: 2400, daysAgo: 35, returnDays: 30, warrantyMonths: 0, category: 'Beauty', status: 'active', notes: 'Check the shop policy for opened products.' },
    { id: 'demo-kettle', name: 'Electric kettle', merchant: 'Room Theory', amount: 5900, daysAgo: 95, returnDays: 30, warrantyMonths: 12, category: 'Home', status: 'kept', notes: 'Warranty covers manufacturing defects; check the original terms.' },
    { id: 'demo-jacket', name: 'Rain jacket', merchant: 'Field Notes', amount: 11000, daysAgo: 18, returnDays: 30, warrantyMonths: 12, category: 'Clothing', status: 'returned', notes: 'Returned because the size was too large.' },
  ];
  return validateState({
    version: 1, demo: true, settings: { currency: 'USD', leadDays: 7 },
    purchases: sample.map(({ daysAgo, ...item }) => ({
      ...item, currency: 'USD', purchaseDate: addDays(today, -daysAgo), returnDeadline: null,
      orderRef: '', createdAt: now,
    })),
  });
}
