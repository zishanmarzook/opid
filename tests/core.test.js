import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES, CURRENCIES, todayISO, addDays, addMonths, daysBetween, money, parseAmount,
  purchaseReturnDate, purchaseWarrantyDate, effectiveStatus, validateState, makeDemoState,
} from '../dist/core.js';

const basePurchase = () => ({
  id: 'purchase-1', name: 'Wireless headphones', merchant: 'Example shop', amount: 12999, currency: 'USD',
  purchaseDate: '2024-01-31', returnDays: 30, returnDeadline: null, warrantyMonths: 12,
  category: 'Electronics', status: 'active', orderRef: 'A-123', notes: '', createdAt: '2024-01-31T10:00:00.000Z',
});
const baseState = () => ({ version: 1, demo: false, settings: { currency: 'USD', leadDays: 7 }, purchases: [basePurchase()] });

test('decimal amounts become exact integer cents without floating-point rounding', () => {
  assert.equal(parseAmount('0.10') + parseAmount('0.20'), 30);
  assert.equal(parseAmount('19.99'), 1999);
  assert.equal(parseAmount(' .5 '), 50);
  assert.equal(parseAmount('00001.05'), 105);
  assert.equal(parseAmount('0'), 0);
  assert.equal(parseAmount('1000000000'), 100_000_000_000);
  assert.equal(parseAmount('1.'), 100);
});

test('money rejects ambiguous, negative, infinite, fractional-cent and oversized inputs', () => {
  for (const value of ['-1', '+1', '1e3', 'NaN', 'Infinity', '', ' ', '1,234.56', '$12', '12.345', '1..2', '.', '1000000000.01', '99999999999999999999999']) {
    assert.throws(() => parseAmount(value), undefined, value);
  }
  assert.throws(() => parseAmount(1.05));
  assert.throws(() => money(1.5));
  assert.throws(() => money(100, 'XYZ'));
  assert.match(money(1999, 'USD'), /19\.99/);
  assert.match(money(-105, 'EUR'), /1\.05/);
});

test('calendar day addition crosses leap days and years', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(addDays('2024-01-01', -1), '2023-12-31');
  assert.equal(daysBetween('2024-12-31', '2025-01-01'), 1);
  assert.equal(daysBetween('2025-01-01', '2024-12-31'), -1);
});

test('calendar arithmetic is unchanged across DST time zones', () => {
  const originalTZ = process.env.TZ;
  try {
    for (const TZ of ['UTC', 'America/New_York', 'Europe/London', 'Asia/Colombo', 'Pacific/Auckland']) {
      process.env.TZ = TZ;
      assert.deepEqual([
        addDays('2024-03-09', 2), daysBetween('2024-03-09', '2024-03-11'),
        addDays('2024-11-02', 2), daysBetween('2024-11-02', '2024-11-04'),
      ], ['2024-03-11', 2, '2024-11-04', 2], TZ);
      const localNoon = new Date(2024, 2, 10, 12, 0, 0);
      assert.equal(todayISO(localNoon), '2024-03-10', TZ);
    }
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
});

test('month-based warranties clamp to the actual final day of a month', () => {
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2023-01-31', 1), '2023-02-28');
  assert.equal(addMonths('2024-02-29', 12), '2025-02-28');
  assert.equal(addMonths('2024-03-31', -1), '2024-02-29');
  assert.equal(addMonths('2024-10-31', 4), '2025-02-28');
  assert.equal(addMonths('2024-01-31', 0), '2024-01-31');
});

test('invalid ISO dates and fractional offsets are rejected rather than normalized', () => {
  for (const date of ['2023-02-29', '2024-02-30', '2024-13-01', '2024-00-01', '2024-01-00', '2024-1-01', 'not-a-date']) assert.throws(() => addDays(date, 1));
  assert.throws(() => addDays('2024-01-01', 1.5));
  assert.throws(() => addMonths('2024-01-01', Infinity));
  assert.throws(() => todayISO(new Date('bad')));
});

test('exact deadlines override return-day windows, with deadline day still active', () => {
  const p = basePurchase();
  assert.equal(purchaseReturnDate(p), '2024-03-01');
  assert.equal(effectiveStatus(p, '2024-03-01'), 'active');
  assert.equal(effectiveStatus(p, '2024-03-02'), 'expired');
  p.returnDeadline = '2024-02-15';
  assert.equal(purchaseReturnDate(p), '2024-02-15');
  assert.equal(effectiveStatus(p, '2024-02-15'), 'active');
  assert.equal(effectiveStatus(p, '2024-02-16'), 'expired');
  p.status = 'kept';
  assert.equal(effectiveStatus(p, '2025-01-01'), 'kept');
  p.status = 'returned';
  assert.equal(effectiveStatus(p, '2024-02-01'), 'returned');
});

test('warranty month zero means no warranty date', () => {
  assert.equal(purchaseWarrantyDate(basePurchase()), '2025-01-31');
  assert.equal(purchaseWarrantyDate({ ...basePurchase(), warrantyMonths: 0 }), null);
  assert.equal(purchaseWarrantyDate({ ...basePurchase(), purchaseDate: '2024-02-29' }), '2025-02-28');
});

test('import normalization preserves known data and discards unknown or prototype-like properties', () => {
  const input = JSON.parse(JSON.stringify(baseState()));
  input.purchases[0].name = '  Headphones  ';
  input.purchases[0].notes = '  Review the fit.  ';
  input.extra = 'ignore';
  input.settings.admin = true;
  input.purchases[0].unsafeHTML = '<script>bad()</script>';
  const imported = validateState(input);
  assert.equal(imported.purchases[0].name, 'Headphones');
  assert.equal(imported.purchases[0].notes, 'Review the fit.');
  assert.equal('extra' in imported, false);
  assert.equal('admin' in imported.settings, false);
  assert.equal('unsafeHTML' in imported.purchases[0], false);
  const polluted = JSON.parse(JSON.stringify(baseState()).replace('"version":1', '"__proto__":{"polluted":true},"version":1'));
  assert.equal(validateState(polluted).polluted, undefined);
  assert.equal({}.polluted, undefined);
});

test('malformed imports reject unsupported versions, preferences and collection bounds', () => {
  for (const malformed of [null, [], {}, { ...baseState(), version: 2 }, { ...baseState(), demo: 'false' }, { ...baseState(), settings: { currency: 'XYZ', leadDays: 7 } }, { ...baseState(), settings: { currency: 'USD', leadDays: -1 } }, { ...baseState(), settings: { currency: 'USD', leadDays: 91 } }, { ...baseState(), purchases: Array(1001).fill(basePurchase()) }]) assert.throws(() => validateState(malformed));
});

test('malformed purchase entries cannot bypass bounds or date validation', () => {
  const patches = [
    { id: '<img>' }, { name: '' }, { merchant: '' }, { name: 'a'.repeat(121) }, { amount: -1 }, { amount: 1.1 },
    { amount: 100_000_000_001 }, { currency: 'JPY' }, { purchaseDate: '1999-12-31' }, { purchaseDate: '2101-01-01' },
    { purchaseDate: '2024-02-30' }, { returnDays: 731 }, { returnDays: -1 }, { returnDays: 1.5 },
    { returnDeadline: '2024-01-01' }, { warrantyMonths: 121 }, { category: 'Unknown' }, { status: 'expired' },
    { notes: 'a'.repeat(3001) }, { createdAt: '2024-02-30T10:00:00Z' }, { createdAt: '2024-01-31T24:00:00Z' },
  ];
  for (const patch of patches) assert.throws(() => validateState({ ...baseState(), purchases: [{ ...basePurchase(), ...patch }] }), undefined, JSON.stringify(patch));
  assert.throws(() => validateState({ ...baseState(), purchases: [basePurchase(), basePurchase()] }), /duplicate/);
});

test('timestamp normalization cannot move imported data outside supported years', () => {
  for (const createdAt of ['2000-01-01T00:30:00+23:00', '2100-12-31T23:30:00-23:00']) {
    assert.throws(() => validateState({ ...baseState(), purchases: [{ ...basePurchase(), createdAt }] }), /between 2000 and 2100/);
  }
  const imported = validateState({ ...baseState(), purchases: [{ ...basePurchase(), createdAt: '2000-01-01T00:30:00+00:30' }] });
  assert.equal(imported.purchases[0].createdAt, '2000-01-01T00:00:00.000Z');
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(imported))), imported);
});

test('demo has varied real relative deadlines and is valid for export/import round trips', () => {
  const demo = makeDemoState();
  assert.equal(demo.demo, true);
  assert.equal(demo.purchases.length, 8);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(demo))), demo);
  const statuses = new Set(demo.purchases.map(p => effectiveStatus(p)));
  assert.deepEqual(statuses, new Set(['active', 'expired', 'kept', 'returned']));
  for (const p of demo.purchases) {
    assert.ok(Number.isSafeInteger(p.amount));
    assert.ok(CURRENCIES.includes(p.currency));
    assert.ok(CATEGORIES.includes(p.category));
  }
});
