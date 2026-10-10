// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package.
// Payments and admin session are fixtures in an isolated browser context.
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
    let paymentStatus = 'Pending';
    await page.route('**/api/midtrans-status', route => route.fulfill({ json: { paymentStatus } }));
    await page.route('https://**/*', route => route.fulfill({ body: '' }));
    await page.addInitScript(() => {
      sessionStorage.setItem('fixin_session', JSON.stringify({ userId: 'ADM-001', role: 'admin', name: 'Admin FIXIN' }));
      if (!localStorage.getItem('fixin_orders')) localStorage.setItem('fixin_orders', JSON.stringify([{
        id: 'ORD-1', paymentStatus: 'Belum Dibayar', serviceStatus: 'Menunggu Konfirmasi',
        serviceCode: 'FX-TEST', customerName: 'Test Customer', total: 10000,
        createdAt: '2026-10-06', serviceName: 'Cleaning', deviceType: 'Laptop',
        midtransOrderIds: ['ORD-1-123']
      }]));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin + '/admin-booking.html');
    assert.match(await page.locator('#ordersTableBody').innerText(), /Pending/);
    await page.locator('#filterStatus').selectOption('Pending');
    assert.match(await page.locator('#ordersTableBody').innerText(), /FX-TEST/);
    await page.goto(origin + '/admin-dashboard.html');
    assert.equal(await page.locator('#statSedangDiproses').innerText(), '0');
    assert.match(await page.locator('#recentTransactionsBody').innerText(), /Pending/);
    await page.goto(origin + '/admin-booking-detail.html?id=ORD-1');
    assert.equal(await page.locator('#detailStatusBadge').innerText(), 'Pending');
    assert.ok(await page.locator('#statusSelect').isDisabled());
    assert.ok(await page.locator('#adminPaymentNotice').isVisible());
    paymentStatus = 'Lunas';
    // Invoke the actual reconciliation path with a mocked provider response.
    await page.evaluate(() => sinkronkanPembayaran());
    await page.waitForFunction(() => document.getElementById('detailStatusBadge').textContent === 'Menunggu Konfirmasi');
    assert.ok(await page.locator('#btnKonfirmasi').isVisible());
    assert.ok(await page.locator('#btnKonfirmasi').isEnabled());
    await page.locator('#btnKonfirmasi').click();
    await page.waitForFunction(() => document.getElementById('detailStatusBadge').textContent === 'Dikonfirmasi');
    assert.deepEqual(errors, []);
    console.log('PASS: unpaid -> admin Pending/filter/no processing -> verified paid -> Menunggu Konfirmasi -> admin confirms; no page errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
