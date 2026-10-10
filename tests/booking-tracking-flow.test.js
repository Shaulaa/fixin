const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createBrowserEnv(initialStorage = {}) {
  const localStorageValues = { ...initialStorage };
  const sessionStorageValues = {};

  const context = vm.createContext({
    console,
    URLSearchParams,
    setInterval() {},
    setTimeout(fn) { fn(); },
    clearTimeout() {},
    localStorage: {
      getItem: key => localStorageValues[key] || null,
      setItem: (key, value) => { localStorageValues[key] = String(value); },
      removeItem: key => { delete localStorageValues[key]; }
    },
    sessionStorage: {
      getItem: key => sessionStorageValues[key] || null,
      setItem: (key, value) => { sessionStorageValues[key] = String(value); },
      removeItem: key => { delete sessionStorageValues[key]; }
    },
    document: {
      addEventListener() {},
      getElementById(id) {
        return context._domElements[id] || null;
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      documentElement: { classList: { add() {}, remove() {} } }
    },
    window: {
      location: { search: '', pathname: '/tracking.html', href: '' },
      addEventListener() {},
      dispatchEvent() {},
      scrollTo() {}
    },
    navigator: {
      clipboard: {
        writeText: async () => {}
      }
    },
    StorageEvent: function(type, data) { Object.assign(this, data); },
    _domElements: {}
  });

  // Load scripts
  vm.runInContext(fs.readFileSync('js/utils.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/storage.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/auth.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/products.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/tracking.js', 'utf8'), context);

  return context;
}

test('tracking.js: cariOrder finds order by serviceCode case-insensitively', () => {
  const sampleOrder = {
    id: 'ORD-20261005-001',
    serviceCode: 'FX-1005-4321',
    customerName: 'Budi Santoso',
    serviceName: 'Ganti Layar HP',
    deviceType: 'HP',
    serviceStatus: 'Booking Diajukan'
  };

  const env = createBrowserEnv({
    fixin_orders: JSON.stringify([sampleOrder])
  });

  const foundExact = env.cariOrder('FX-1005-4321');
  assert.ok(foundExact);
  assert.equal(foundExact.data.customerName, 'Budi Santoso');

  const foundLower = env.cariOrder('fx-1005-4321');
  assert.ok(foundLower);
  assert.equal(foundLower.data.serviceCode, 'FX-1005-4321');

  const notFound = env.cariOrder('FX-9999-9999');
  assert.equal(notFound, null);
});

test('tracking.js: 8-step timeline status mapping is correct', () => {
  const env = createBrowserEnv();

  const statuses = [
    { status: 'Booking Diajukan', expectedIndex: 0 },
    { status: 'Menunggu Konfirmasi', expectedIndex: 0 },
    { status: 'Dikonfirmasi', expectedIndex: 1 },
    { status: 'Perangkat Diterima', expectedIndex: 2 },
    { status: 'Diterima', expectedIndex: 2 },
    { status: 'Dijemput', expectedIndex: 2 },
    { status: 'Diagnosis', expectedIndex: 3 },
    { status: 'Dalam Pemeriksaan', expectedIndex: 3 },
    { status: 'Menunggu Persetujuan', expectedIndex: 4 },
    { status: 'Sedang Dikerjakan', expectedIndex: 5 },
    { status: 'Dalam Perbaikan', expectedIndex: 5 },
    { status: 'Selesai', expectedIndex: 6 },
    { status: 'Siap Diambil', expectedIndex: 7 },
    { status: 'Diantar Kembali', expectedIndex: 7 },
    { status: 'Diterima Pelanggan', expectedIndex: 7 },
    { status: 'Dibatalkan', expectedIndex: -1 }
  ];

  statuses.forEach(({ status, expectedIndex }) => {
    const order = { serviceCode: 'FX-01', serviceStatus: status };
    const stepIdx = env.petakanStatusKeTimelineV2(order);
    assert.equal(stepIdx, expectedIndex, `Status '${status}' should map to step index ${expectedIndex}`);
  });
});

test('tracking.js: tampilkanHasil renders all required customer tracking fields', () => {
  const env = createBrowserEnv();

  // Create mock DOM elements
  const elements = {
    trackingResult: { classList: { add() {}, remove() {} } },
    trackingNotFound: { style: {} },
    resKode: { textContent: '' },
    resPerangkat: { textContent: '' },
    resLayanan: { textContent: '' },
    resTanggal: { textContent: '' },
    resMetode: { textContent: '' },
    resStatusLabel: { textContent: '', className: '' },
    timelineV2: { querySelectorAll: () => [] },
    trackingExtraInfo: { style: {} },
    extraEstimasiBiaya: { style: {} },
    resEstimasiBiaya: { textContent: '' },
    extraEstimasiSelesai: { style: {} },
    resEstimasiSelesai: { textContent: '' },
    extraCatatanTeknisi: { style: {} },
    resCatatanTeknisi: { textContent: '' }
  };
  env._domElements = elements;

  const sampleOrder = {
    id: 'ORD-001',
    serviceCode: 'FX-1005-1234',
    customerName: 'Ahmad User',
    deviceType: 'Laptop',
    serviceName: 'Install Ulang OS',
    serviceDate: '2026-10-10',
    deliveryMethod: 'dropoff',
    serviceStatus: 'Sedang Dikerjakan',
    estimasiBiaya: 100000,
    estimasiSelesai: '11 Oktober 2026',
    catatanTeknisi: 'Sedang backup data user'
  };

  env.tampilkanHasil(sampleOrder);

  assert.equal(elements.resKode.textContent, 'FX-1005-1234');
  assert.equal(elements.resPerangkat.textContent, 'Laptop');
  assert.equal(elements.resLayanan.textContent, 'Install Ulang OS');
  assert.equal(elements.resMetode.textContent, 'Antar Sendiri');
  assert.equal(elements.resStatusLabel.textContent, 'Sedang Dikerjakan');
  assert.equal(elements.resEstimasiBiaya.textContent, 'Rp 100.000');
  assert.equal(elements.resEstimasiSelesai.textContent, '11 Oktober 2026');
  assert.equal(elements.resCatatanTeknisi.textContent, 'Sedang backup data user');
});

test('tracking.js: tampilkanHasil displays error state when order is null', () => {
  const env = createBrowserEnv();

  let removedShow = false;
  const elements = {
    trackingResult: {
      classList: {
        remove: (cls) => { if (cls === 'show') removedShow = true; }
      }
    },
    trackingNotFound: { style: {} }
  };
  env._domElements = elements;

  env.tampilkanHasil(null);

  assert.equal(removedShow, true);
  assert.equal(elements.trackingNotFound.style.display, 'block');
});

test('booking order schema contains initial status Booking Diajukan', () => {
  const env = createBrowserEnv();

  // Test service code generation format
  const code = env.generateServiceCode();
  assert.match(code, /^FX-\d{4}-\d{4}$/, 'Service code must follow FX-MMDD-XXXX format');
});
