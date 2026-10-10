const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function browser(order, fetch) {
  const values = { fixin_orders: JSON.stringify([order]) };
  const context = vm.createContext({
    console, URLSearchParams, fetch, setInterval() {},
    localStorage: { getItem: key => values[key] || null, setItem: (key, value) => { values[key] = value; } },
    sessionStorage: { getItem: () => null },
    document: { addEventListener() {}, hidden: false },
    window: { location: { search: '', pathname: '/invoice.html' }, addEventListener() {}, dispatchEvent() {} },
    StorageEvent: function(type, data) { Object.assign(this, data); }
  });
  vm.runInContext(fs.readFileSync('js/storage.js', 'utf8'), context);
  return context;
}

test('payment completed outside popup updates the stored order', async () => {
  const app = browser({ id: 'ORD-1', total: 10000, paymentStatus: 'Belum Dibayar', midtransOrderIds: ['ORD-1-123'] },
    async () => ({ ok: true, json: async () => ({ paymentStatus: 'Lunas' }) }));
  await app.sinkronkanPembayaran();
  assert.equal(app.getOrders()[0].paymentStatus, 'Lunas');
});

test('network failure and forged finish flag do not mark an order paid', async () => {
  const app = browser({ id: 'ORD-1', total: 10000, paymentStatus: 'Belum Dibayar' }, async () => { throw Error('offline'); });
  app.window.location.search = '?order=ORD-1&fromMidtrans=1';
  await app.sinkronkanPembayaran();
  assert.equal(app.getOrders()[0].paymentStatus, 'Belum Dibayar');
});

test('legacy return URL recovers ID but uses verified status', async () => {
  const app = browser({ id: 'ORD-1', total: 10000, paymentStatus: 'Belum Dibayar' },
    async () => ({ ok: true, json: async () => ({ paymentStatus: 'Pending' }) }));
  app.window.location.search = '?order=ORD-1&order_id=ORD-1-123&transaction_status=settlement';
  await app.sinkronkanPembayaran();
  assert.equal(app.getOrders()[0].paymentStatus, 'Pending');
  assert.equal(app.getOrders()[0].midtransOrderIds[0], 'ORD-1-123');
});

test('failed lookup preserves pending status and concurrent service edits', async () => {
  let app;
  app = browser({ id: 'ORD-1', total: 10000, serviceStatus: 'Diterima', paymentStatus: 'Pending', midtransOrderIds: ['ORD-1-123'] }, async () => {
    const orders = app.getOrders();
    orders[0].serviceStatus = 'Selesai';
    app.setOrders(orders);
    return { ok: false };
  });
  await app.sinkronkanPembayaran();
  assert.equal(app.getOrders()[0].paymentStatus, 'Pending');
  assert.equal(app.getOrders()[0].serviceStatus, 'Selesai');
});

test('an older successful attempt wins over a newer pending attempt', async () => {
  const app = browser({ id: 'ORD-1', total: 10000, paymentStatus: 'Pending', midtransOrderIds: ['ORD-1-123', 'ORD-1-456'] },
    async (url, options) => ({ ok: true, json: async () => ({ paymentStatus: JSON.parse(options.body).midtransOrderId === 'ORD-1-123' ? 'Lunas' : 'Pending' }) }));
  await app.sinkronkanPembayaran();
  assert.equal(app.getOrders()[0].paymentStatus, 'Lunas');
});

test('status endpoint verifies provider status, amount and order identity', async t => {
  const handler = require('../api/midtrans-status');
  const originalFetch = global.fetch;
  const originalKey = process.env.MIDTRANS_SERVER_KEY;
  process.env.MIDTRANS_SERVER_KEY = 'test-only';
  t.after(() => { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.MIDTRANS_SERVER_KEY; else process.env.MIDTRANS_SERVER_KEY = originalKey; });
  for (const [status, fraud, amount, expected] of [
    ['settlement', 'accept', '10000.00', 'Lunas'],
    ['capture', 'accept', '10000.00', 'Lunas'],
    ['capture', 'challenge', '10000.00', 'Pending'],
    ['pending', undefined, '10000.00', 'Pending'],
    ['expire', undefined, '10000.00', 'Gagal'],
    ['settlement', 'accept', '1.00', undefined]
  ]) {
    global.fetch = async () => ({ ok: true, json: async () => ({ order_id: 'ORD-1-123', transaction_status: status, fraud_status: fraud, gross_amount: amount }) });
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    await handler({ method: 'POST', body: { orderId: 'ORD-1', midtransOrderId: 'ORD-1-123', grossAmount: 10000 } }, res);
    assert.equal(res.data.paymentStatus, expected, status + '/' + fraud + '/' + amount);
    if (!expected) assert.equal(res.code, 409);
  }
  const request = { method: 'POST', body: { orderId: 'ORD-1', midtransOrderId: 'ORD-1-123', grossAmount: 10000 } };
  const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } });
  global.fetch = async () => ({ ok: true, json: async () => ({ order_id: 'OTHER-123', transaction_status: 'settlement', gross_amount: '10000.00' }) });
  let res = response();
  await handler(request, res);
  assert.equal(res.code, 409);
  global.fetch = async () => { throw Error('provider unavailable'); };
  res = response();
  await handler(request, res);
  assert.equal(res.code, 502);
  assert.equal(res.data.paymentStatus, undefined);
  res = response();
  await handler({ method: 'GET' }, res);
  assert.equal(res.code, 405);
  res = response();
  await handler({ method: 'POST', body: { ...request.body, midtransOrderId: 'OTHER-123' } }, res);
  assert.equal(res.code, 400);
});
