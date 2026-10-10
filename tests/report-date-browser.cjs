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
    const page = await browser.newPage({ timezoneId: 'Asia/Jakarta', viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.fulfill({ body: '' }));
    await page.addInitScript(() => {
      sessionStorage.setItem('fixin_session', JSON.stringify({ userId: 'ADM-001', role: 'admin', name: 'Admin FIXIN' }));
      localStorage.setItem('fixin_orders', JSON.stringify([
        { id: 'A', serviceCode: 'FX-START', createdAt: '2026-10-05T00:00:00+07:00', customerName: 'A', serviceName: 'Cleaning', deviceType: 'Laptop', serviceStatus: 'Selesai', paymentStatus: 'Lunas', diagnosisCost: 100000 },
        { id: 'B', serviceCode: 'FX-END', createdAt: '2026-10-05T23:59:59+07:00', customerName: 'B', serviceName: 'Cleaning', deviceType: 'HP', serviceStatus: 'Diagnosis', paymentStatus: 'Lunas' },
        { id: 'C', serviceCode: 'FX-NEXT', createdAt: '2026-10-06T00:00:00+07:00', customerName: 'C', serviceName: 'Cleaning', deviceType: 'Laptop', serviceStatus: 'Selesai', paymentStatus: 'Lunas', diagnosisCost: 200000 }
      ]));
      // Capture the report passed to the Excel library; no CDN dependency.
      window.ExcelJS = { Workbook: class {
        constructor() {
          this.cells = {}; this.rows = []; window.exportedReport = this;
          this.xlsx = { writeBuffer: async () => new Uint8Array() };
        }
        addWorksheet() {
          return { properties: {}, mergeCells() {},
            getCell: name => this.cells[name] || (this.cells[name] = {}),
            addRow: values => { this.rows.push(values); return { eachCell: fn => values.forEach((value, i) => fn({ value }, i + 1)) }; }
          };
        }
      } };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/admin-reports.html`);
    assert.ok(await page.locator('#filterTanggalField').isHidden());
    await page.getByLabel('Periode', { exact: true }).selectOption('tanggal');
    await page.getByLabel('Tanggal Laporan').fill('2026-10-05');
    await page.locator('#btnFilter').click();
    assert.equal(await page.locator('#lapTotalBooking').innerText(), '2');
    assert.equal(await page.locator('#lapPendapatan').innerText(), 'Rp 100.000');
    assert.equal(await page.locator('#laporanTableBody tr').count(), 2);
    assert.match(await page.locator('#reportAppliedPeriod').innerText(), /5 Oktober 2026/);
    await page.getByLabel('Tanggal Laporan').fill('2026-10-06');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btnExportExcel').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /2026-10-05/);
    const exported = await page.evaluate(() => ({ label: exportedReport.cells.A2.value, rows: exportedReport.rows }));
    assert.match(exported.label, /5 Oktober 2026/);
    assert.equal(exported.rows.filter(row => ['FX-START', 'FX-END'].includes(row[1])).length, 2);
    assert.ok(!exported.rows.some(row => row[1] === 'FX-NEXT'));
    await page.locator('#btnFilter').click();
    assert.equal(await page.locator('#lapTotalBooking').innerText(), '1');
    await page.locator('#filterDevice').selectOption('HP');
    await page.locator('#btnFilter').click();
    assert.ok(await page.locator('#laporanEmptyState').isVisible());
    await page.locator('#btnResetFilter').click();
    assert.equal(await page.locator('#filterPeriode').inputValue(), 'bulanan');
    assert.ok(await page.locator('#filterTanggalField').isHidden());
    await page.locator('#filterPeriode').selectOption('tanggal');
    await page.locator('#filterTanggal').fill('2026-10-05');
    await page.locator('#btnFilter').click();
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const field = await page.locator('#filterTanggal').boundingBox();
      assert.ok(field.x >= 0 && field.x + field.width <= width, 'Calendar fits width ' + width);
    }
    await page.locator('#filterPeriode').selectOption('rentang');
    assert.ok(await page.locator('#filterTanggalField').isHidden());
    await page.getByLabel('Tanggal Mulai').fill('2026-10-05');
    await page.getByLabel('Tanggal Akhir').fill('2026-10-06');
    await page.locator('#btnFilter').click();
    assert.equal(await page.locator('#lapTotalBooking').innerText(), '3');
    assert.equal(await page.locator('#lapPendapatan').innerText(), 'Rp 300.000');
    assert.match(await page.locator('#reportAppliedPeriod').innerText(), /5 Oktober 2026 sampai 6 Oktober 2026/);
    const rangeDownloadPromise = page.waitForEvent('download');
    await page.locator('#btnExportExcel').click();
    assert.match((await rangeDownloadPromise).suggestedFilename(), /2026-10-05_sampai_2026-10-06/);
    const rangeExport = await page.evaluate(() => ({ label: exportedReport.cells.A2.value, rows: exportedReport.rows }));
    assert.match(rangeExport.label, /5 Oktober 2026 sampai 6 Oktober 2026/);
    assert.equal(rangeExport.rows.filter(row => ['FX-START', 'FX-END', 'FX-NEXT'].includes(row[1])).length, 3);
    await page.getByLabel('Tanggal Mulai').fill('2026-10-07');
    await page.locator('#btnFilter').click();
    assert.ok(await page.locator('#filterTanggalAkhir').evaluate(el => !el.validity.valid));
    assert.equal(await page.locator('#lapTotalBooking').innerText(), '3');
    await page.getByLabel('Tanggal Mulai').fill('');
    await page.locator('#btnFilter').click();
    assert.ok(await page.locator('#filterTanggalMulai').evaluate(el => el.validity.valueMissing));
    await page.getByLabel('Tanggal Mulai').fill('2026-10-06');
    await page.locator('#btnFilter').click();
    assert.equal(await page.locator('#lapTotalBooking').innerText(), '1');
    await page.locator('#btnResetFilter').click();
    assert.ok(await page.locator('#filterTanggalMulaiField').isHidden());
    assert.ok(await page.locator('#filterTanggalAkhirField').isHidden());
    await page.locator('#filterPeriode').selectOption('rentang');
    await page.getByLabel('Tanggal Mulai').fill('2026-10-05');
    await page.getByLabel('Tanggal Akhir').fill('2026-10-06');
    await page.locator('#btnFilter').click();
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const id of ['filterTanggalMulai', 'filterTanggalAkhir']) {
        const field = await page.locator('#' + id).boundingBox();
        assert.ok(field.x >= 0 && field.x + field.width <= width, 'Range calendar fits width ' + width);
      }
    }
    if (process.env.REPORT_SCREENSHOT) await page.screenshot({ path: process.env.REPORT_SCREENSHOT });
    assert.deepEqual(errors, []);
    console.log('PASS: selected day and range/table/totals/export, invalid range, combined filters, empty state, reset, responsive calendars; no page errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
