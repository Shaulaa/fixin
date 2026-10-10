const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function app(order, providerStatus = 'Lunas') {
  const values = { fixin_orders: JSON.stringify([order]) };
  const context = vm.createContext({
    console, URLSearchParams, StorageEvent: function () {},
    localStorage: {
      getItem: key => values[key] ?? null,
      setItem: (key, value) => { values[key] = value; }
    },
    document: { addEventListener() {} },
    window: { location: { search: '' }, addEventListener() {}, dispatchEvent() {} },
    fetch: async () => ({ ok: true, json: async () => ({ paymentStatus: providerStatus }) })
  });
  vm.runInContext(fs.readFileSync('js/storage.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/admin.js', 'utf8'), context);
  context.savedOrders = () => JSON.parse(values.fixin_orders);
  return context;
}

test('unpaid new and legacy bookings are persisted as Pending', () => {
  for (const serviceStatus of ['Pending', 'Menunggu Konfirmasi', 'Booking Baru', 'Booking Diajukan']) {
    const env = app({ id: 'ORD-1', serviceStatus, paymentStatus: 'Belum Dibayar' });
    assert.equal(env.getOrders()[0].serviceStatus, 'Pending');
    assert.equal(env.savedOrders()[0].serviceStatus, 'Pending');
    assert.ok(env.ADMIN_STATUSES.includes('Pending'));
  }
});

test('verified payment advances Pending to Menunggu Konfirmasi with history', async () => {
  const env = app({ id: 'ORD-1', serviceStatus: 'Pending', paymentStatus: 'Pending', total: 10000,
    midtransOrderIds: ['ORD-1-123'], serviceHistory: [{ status: 'Pending', at: '2026-10-06' }] });
  await env.sinkronkanPembayaran();
  const order = env.savedOrders()[0];
  assert.equal(order.paymentStatus, 'Lunas');
  assert.equal(order.serviceStatus, 'Menunggu Konfirmasi');
  assert.equal(order.serviceHistory.at(-1).status, 'Menunggu Konfirmasi');
});

test('pending or failed payment keeps booking Pending and admin cannot advance it', async () => {
  for (const paymentStatus of ['Belum Dibayar', 'Pending', 'Gagal']) {
    const env = app({ id: 'ORD-1', serviceStatus: 'Menunggu Konfirmasi', paymentStatus,
      midtransOrderIds: ['ORD-1-123'], total: 10000 }, paymentStatus === 'Belum Dibayar' ? 'Pending' : paymentStatus);
    await env.sinkronkanPembayaran();
    assert.equal(env.updateOrderStatus('ORD-1', 'Dikonfirmasi'), null);
    assert.equal(env.getOrders()[0].serviceStatus, 'Pending');
  }
});

test('paid bookings can be confirmed; progressed and cancelled statuses are preserved', () => {
  const env = app({ id: 'ORD-1', serviceStatus: 'Pending', paymentStatus: 'Lunas' });
  assert.equal(env.getOrders()[0].serviceStatus, 'Menunggu Konfirmasi');
  assert.equal(env.updateOrderStatus('ORD-1', 'Dikonfirmasi').serviceStatus, 'Dikonfirmasi');
  for (const serviceStatus of ['Diagnosis', 'Sedang Dikerjakan', 'Selesai', 'Dibatalkan']) {
    const existing = app({ id: 'ORD-2', serviceStatus, paymentStatus: 'Pending' });
    assert.equal(existing.getOrders()[0].serviceStatus, serviceStatus);
  }
});
