const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

process.env.TZ = 'Asia/Jakarta';
const app = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(fs.readFileSync('js/admin.js', 'utf8'), app);

test('selected report day includes both boundaries in local time and excludes neighbouring days', () => {
  for (const [createdAt, expected] of [
    ['2026-10-04T23:59:59.999+07:00', false],
    ['2026-10-05T00:00:00.000+07:00', true],
    ['2026-10-05T23:59:59.999+07:00', true],
    ['2026-10-06T00:00:00.000+07:00', false],
    ['2026-10-05', true],
    ['2026-10-04T17:00:00.000Z', true],
    ['invalid', false]
  ]) {
    assert.equal(app.orderPadaTanggal(createdAt, '2026-10-05'), expected, createdAt);
  }
});

test('empty or invalid report date never matches an order', () => {
  for (const date of ['', '2026-02-30', 'invalid']) {
    assert.equal(app.orderPadaTanggal('2026-10-05', date), false);
  }
});

test('custom report range includes start and end days, including across months', () => {
  for (const [createdAt, expected] of [
    ['2026-09-29T23:59:59.999+07:00', false],
    ['2026-09-30T00:00:00+07:00', true],
    ['2026-10-01', true],
    ['2026-10-02T23:59:59.999+07:00', true],
    ['2026-10-03T00:00:00+07:00', false]
  ]) {
    assert.equal(app.orderDalamRentang(createdAt, '2026-09-30', '2026-10-02'), expected, createdAt);
  }
  assert.equal(app.orderDalamRentang('2026-10-05', '2026-10-05', '2026-10-05'), true);
});

test('reversed, missing and invalid date ranges never match', () => {
  for (const [start, end] of [['2026-10-06', '2026-10-05'], ['', '2026-10-05'], ['2026-10-05', ''], ['2026-02-30', '2026-10-05']]) {
    assert.equal(app.orderDalamRentang('2026-10-05', start, end), false);
  }
});
