// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package.
// Provider responses are simulated; this does not make a real payment.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      res.writeHead(err ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
      res.end(err ? '' : data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let status = 'Pending';
    await page.route('**/api/midtrans-status', route => route.fulfill({ json: { paymentStatus: status } }));
    await page.route('**/api/midtrans-token', route => route.fulfill({ json: { snapToken: 'test-token', midtransOrderId: 'ORD-1-123' } }));
    await page.route('https://**/*', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.addInitScript(() => {
      sessionStorage.setItem('fixin_session', JSON.stringify({ userId: 'USR-001', role: 'user', name: 'User Demo' }));
      if (!localStorage.getItem('fixin_orders')) localStorage.setItem('fixin_orders', JSON.stringify([{
        id: 'ORD-1', userId: 'USR-001', total: 10000, subtotal: 10000, deliveryFee: 0,
        paymentStatus: 'Belum Dibayar', serviceCode: 'FX-TEST', customerName: 'User Demo',
        serviceName: 'Servis', serviceStatus: 'Menunggu Konfirmasi', deliveryMethod: 'dropoff',
        createdAt: '2026-09-29T00:00:00Z', serviceDate: '2026-09-29'
      }]));
      window.snap = { pay(token, callbacks) { window.paymentCallbacks = callbacks; } };
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base + '/checkout.html?order=ORD-1');
    await page.locator('#btnBayarMidtrans').click();
    await page.waitForFunction(() => !!window.paymentCallbacks);
    assert.equal(await page.evaluate(() => getOrders()[0].midtransOrderIds[0]), 'ORD-1-123');
    // Close popup without receiving onSuccess; payment settles in another app.
    await page.evaluate(async () => { window.paymentCallbacks.onClose(); await sinkronkanPembayaran(); });
    status = 'Lunas';
    await page.goto(base + '/invoice.html?order=ORD-1&fromMidtrans=1');
    await page.waitForFunction(() => getOrders()[0].paymentStatus === 'Lunas');
    assert.match(await page.locator('#invoiceContent').innerText(), /Lunas/);
    await page.goto(base + '/user-dashboard.html');
    assert.match(await page.locator('#orderList').innerText(), /Lunas/);
    assert.deepEqual(errors, []);
    console.log('PASS: popup close -> verified invoice Lunas -> dashboard Lunas; no page errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
