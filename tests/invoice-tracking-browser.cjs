// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package.
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
    await page.route('https://**/*', route => route.fulfill({ body: '' }));
    await page.addInitScript(() => {
      sessionStorage.setItem('fixin_session', JSON.stringify({ userId: 'USR-001', role: 'user', name: 'User Demo' }));
      localStorage.setItem('fixin_orders', JSON.stringify([
        { id: 'ORD-1', userId: 'USR-001', serviceCode: 'FX-1006-1234', customerName: 'Customer One', serviceName: 'Cleaning', serviceStatus: 'Diagnosis', paymentStatus: 'Lunas', createdAt: '2026-10-06', total: 10000 },
        { id: 'ORD-2', userId: 'USR-001', serviceCode: 'FX-1006-5678', customerName: 'Customer Two', serviceName: 'Upgrade SSD', serviceStatus: 'Selesai', paymentStatus: 'Lunas', createdAt: '2026-10-06', total: 20000 }
      ]));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const [id, code, customer] of [['ORD-1', 'FX-1006-1234', 'Customer One'], ['ORD-2', 'FX-1006-5678', 'Customer Two']]) {
      for (const selector of ['#invoiceContent a[href^="tracking.html"]', '.nav-links a[href^="tracking.html"]']) {
        await page.goto(origin + '/invoice.html?order=' + id);
        const link = page.locator(selector);
        assert.equal(await link.getAttribute('href'), 'tracking.html?kode=' + encodeURIComponent(code));
        await link.click();
        await page.waitForURL('**/tracking.html?kode=*');
        assert.equal(await page.locator('#trackingInput').inputValue(), code);
        assert.equal(await page.locator('#resKode').innerText(), code);
        assert.equal(await page.locator('#resNama').innerText(), customer);
        assert.ok(await page.locator('#trackingResult').evaluate(el => el.classList.contains('show')));
      }
    }
    await page.goto(origin + '/tracking.html');
    assert.equal(await page.locator('#trackingInput').inputValue(), '');
    await page.locator('#trackingInput').fill('FX-1006-1234');
    await page.locator('#trackingForm button').click();
    await page.waitForFunction(() => document.getElementById('trackingResult').classList.contains('show'));
    assert.equal(await page.locator('#resKode').innerText(), 'FX-1006-1234');
    assert.deepEqual(errors, []);
    console.log('PASS: invoice and navbar links autofill and show correct order; manual tracking still works; no page errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
