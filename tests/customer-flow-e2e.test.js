const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createFullAppEnvironment() {
  const localStorageValues = {};
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
      getElementById(id) { return context._domElements[id] || null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      documentElement: { classList: { add() {}, remove() {} } },
      body: { appendChild() {}, removeChild() {}, style: {} }
    },
    window: {
      location: { search: '', pathname: '/', href: '' },
      addEventListener() {},
      dispatchEvent() {},
      scrollTo() {}
    },
    navigator: {
      clipboard: {
        writeText: async (text) => { context._copiedText = text; }
      }
    },
    StorageEvent: function(type, data) { Object.assign(this, data); },
    _domElements: {},
    _copiedText: ''
  });

  // Load in order
  vm.runInContext(fs.readFileSync('js/utils.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/storage.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/auth.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/products.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('js/tracking.js', 'utf8'), context);

  // Initialize seed products & users
  context.seedFixinData();

  return context;
}

test('End-to-End Customer Flow: Catalog -> Detail -> Booking -> Success -> Tracking (8 Steps)', async () => {
  const env = createFullAppEnvironment();

  // 1. Catalog & Detail: Products exist
  const activeProducts = env.getActiveProducts();
  assert.ok(activeProducts.length > 0, 'Catalog should have active products');
  const targetProduct = activeProducts.find(p => p.category === 'Laptop') || activeProducts[0];
  assert.ok(targetProduct, 'Target product found');

  // 2. Booking: User creates booking
  const orderId = env.generateId('ORD');
  const serviceCode = env.generateServiceCode();
  const now = new Date().toISOString();

  const newOrder = {
    id: orderId,
    serviceCode: serviceCode,
    userId: 'USR-001',
    customerName: 'Siti Rahma',
    customerEmail: 'siti@example.com',
    phone: '08123456789',
    productId: targetProduct.id,
    serviceName: targetProduct.name,
    deviceType: targetProduct.category,
    complaint: 'Keyboard sering mengetik sendiri',
    serviceDate: '2026-10-15',
    deliveryMethod: 'dropoff',
    pickupAddress: '',
    subtotal: targetProduct.price,
    deliveryFee: 0,
    total: targetProduct.price,
    serviceStatus: 'Pending',
    paymentStatus: 'Belum Dibayar',
    paymentType: null,
    createdAt: now,
    updatedAt: now,
    serviceHistory: [{ status: 'Pending', at: now }],
    estimasiBiaya: null,
    estimasiSelesai: null,
    catatanTeknisi: null
  };

  // Save order to storage
  const orders = env.getOrders();
  orders.push(newOrder);
  env.setOrders(orders);

  // Verify stored order
  const storedOrders = env.getOrders();
  const saved = storedOrders.find(o => o.serviceCode === serviceCode);
  assert.ok(saved, 'Order must be saved in localStorage');
  assert.equal(saved.serviceStatus, 'Pending');
  assert.equal(saved.customerName, 'Siti Rahma');

  // 3. Tracking Page: Search by service code
  const foundOrder = env.cariOrder(serviceCode);
  assert.ok(foundOrder, 'Order should be found by service code in tracking');
  assert.equal(foundOrder.data.serviceCode, serviceCode);

  // Setup DOM elements for tracking
  const trackingDom = {
    trackingResult: { classList: { add(cls) { this[cls] = true; }, remove(cls) { this[cls] = false; } } },
    trackingNotFound: { style: {} },
    resKode: { textContent: '' },
    resPerangkat: { textContent: '' },
    resLayanan: { textContent: '' },
    resTanggal: { textContent: '' },
    resMetode: { textContent: '' },
    resStatusLabel: { textContent: '', className: '' },
    timelineV2: {
      querySelectorAll: () => [
        { classList: { add() {}, remove() {} } },
        { classList: { add() {}, remove() {} } },
        { classList: { add() {}, remove() {} } },
        { classList: { add() {}, remove() {} } },
        { classList: { add() {}, remove() {} } },
        { classList: { add() {}, remove() {} } },
        { classList: { add() {}, remove() {} } },
        { classList: { add() {}, remove() {} } }
      ]
    },
    trackingExtraInfo: { style: {} },
    extraEstimasiBiaya: { style: {} },
    resEstimasiBiaya: { textContent: '' },
    extraEstimasiSelesai: { style: {} },
    resEstimasiSelesai: { textContent: '' },
    extraCatatanTeknisi: { style: {} },
    resCatatanTeknisi: { textContent: '' }
  };
  env._domElements = trackingDom;

  // 4. Test initial status "Booking Diajukan" on tracking page
  env.tampilkanHasil(foundOrder.data);

  assert.equal(trackingDom.resKode.textContent, serviceCode);
  assert.equal(trackingDom.resPerangkat.textContent, 'Laptop');
  assert.equal(trackingDom.resLayanan.textContent, targetProduct.name);
  assert.equal(trackingDom.resMetode.textContent, 'Antar Sendiri');
  assert.equal(trackingDom.resStatusLabel.textContent, 'Booking Diajukan');
  assert.equal(env.petakanStatusKeTimelineV2(foundOrder.data), 0);

  // 5. Test status progression through all 8 stages:
  const timelineStages = [
    { status: 'Booking Diajukan', expectedStep: 0 },
    { status: 'Dikonfirmasi', expectedStep: 1 },
    { status: 'Perangkat Diterima', expectedStep: 2 },
    { status: 'Diagnosis', expectedStep: 3 },
    { status: 'Menunggu Persetujuan', expectedStep: 4 },
    { status: 'Sedang Dikerjakan', expectedStep: 5 },
    { status: 'Selesai', expectedStep: 6 },
    { status: 'Siap Diambil', expectedStep: 7 }
  ];

  for (const stage of timelineStages) {
    saved.serviceStatus = stage.status;
    const step = env.petakanStatusKeTimelineV2(saved);
    assert.equal(step, stage.expectedStep, `Step index for '${stage.status}' should be ${stage.expectedStep}`);
  }

  // 6. Test with extra technician notes & estimates
  saved.estimasiBiaya = 200000;
  saved.estimasiSelesai = '16 Oktober 2026';
  saved.catatanTeknisi = 'Pembersihan socket keyboard dan penggantian modul switch';
  env.tampilkanHasil(saved);

  assert.equal(trackingDom.resEstimasiBiaya.textContent, 'Rp 200.000');
  assert.equal(trackingDom.resEstimasiSelesai.textContent, '16 Oktober 2026');
  assert.equal(trackingDom.resCatatanTeknisi.textContent, 'Pembersihan socket keyboard dan penggantian modul switch');
  assert.equal(trackingDom.extraEstimasiBiaya.style.display, 'flex');
  assert.equal(trackingDom.extraEstimasiSelesai.style.display, 'flex');
  assert.equal(trackingDom.extraCatatanTeknisi.style.display, 'flex');

  // 7. Test invalid tracking code
  env.tampilkanHasil(null);
  assert.equal(trackingDom.trackingNotFound.style.display, 'block');
});
