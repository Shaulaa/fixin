// storage.js - source of truth untuk localStorage FIXIN.
// Semua key memakai prefix "fixin_". Wajib di-load SEBELUM script lain
// yang butuh data user/produk/order (booking.js, tracking.js, dll),
// dan SETELAH utils.js karena seed produk pakai generateId().

var FIXIN_KEYS = {
  USERS: "fixin_users",
  SESSION: "fixin_session",
  PRODUCTS: "fixin_products",
  ORDERS: "fixin_orders"
};

// ---------- Helper baca/tulis generik ----------

function fixinGetItem(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error("Gagal membaca localStorage[" + key + "]", e);
    return fallback;
  }
}

function fixinSetItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error("Gagal menulis localStorage[" + key + "]", e);
    return false;
  }
}

// ---------- Users ----------

function getUsers() {
  return fixinGetItem(FIXIN_KEYS.USERS, []);
}

function setUsers(users) {
  return fixinSetItem(FIXIN_KEYS.USERS, users);
}

// ---------- Session ----------
// Sengaja pakai sessionStorage (bukan localStorage) khusus untuk session.
// localStorage dibagi ke SEMUA tab dalam origin yang sama, jadi kalau
// dulu login sebagai admin di satu tab, tab lain yang lagi login sebagai
// user ikut "berubah" jadi admin begitu halaman itu baca ulang session.
// sessionStorage terisolasi per tab, jadi tiap tab bisa punya sesi login
// sendiri-sendiri (misalnya testing akun user & admin bersamaan).
// Konsekuensinya: sesi login hilang begitu tab ditutup (harus login lagi
// di tab baru) - trade-off yang wajar untuk kebutuhan ini.

function getSession() {
  try {
    var raw = sessionStorage.getItem(FIXIN_KEYS.SESSION);
    return raw === null ? null : JSON.parse(raw);
  } catch (e) {
    console.error("Gagal membaca sessionStorage[" + FIXIN_KEYS.SESSION + "]", e);
    return null;
  }
}

function setSession(session) {
  try {
    sessionStorage.setItem(FIXIN_KEYS.SESSION, JSON.stringify(session));
    return true;
  } catch (e) {
    console.error("Gagal menulis sessionStorage[" + FIXIN_KEYS.SESSION + "]", e);
    return false;
  }
}

function clearSession() {
  sessionStorage.removeItem(FIXIN_KEYS.SESSION);
}

// ---------- Products ----------

function getProducts() {
  return fixinGetItem(FIXIN_KEYS.PRODUCTS, []);
}

function setProducts(products) {
  return fixinSetItem(FIXIN_KEYS.PRODUCTS, products);
}

// ---------- Orders ----------
// Catatan: booking.html & index.html (quick form) sudah lebih dulu menulis
// langsung ke key "fixin_orders" lewat js/booking.js dengan struktur lama
// (nama, layanan, kode, status, dst). getOrders/setOrders di bawah ini
// generik, jadi tetap bisa membaca order lama itu tanpa error. Migrasi ke
// skema order baru (serviceCode, serviceStatus, paymentStatus, dst)
// dikerjakan di tahap booking/checkout, bukan di tahap fondasi ini.

function getOrders() {
  var orders = fixinGetItem(FIXIN_KEYS.ORDERS, []);
  if (normalisasiStatusBooking(orders)) fixinSetItem(FIXIN_KEYS.ORDERS, orders);
  return orders;
}

function setOrders(orders) {
  normalisasiStatusBooking(orders);
  return fixinSetItem(FIXIN_KEYS.ORDERS, orders);
}

// Only initial bookings follow payment state. Preserve service progress and cancellations.
function normalisasiStatusBooking(orders) {
  var changed = false;
  orders.forEach(function (order) {
    if (["Pending", "Menunggu Konfirmasi", "Booking Baru", "Booking Diajukan"].indexOf(order.serviceStatus) === -1) return;
    var nextStatus = order.paymentStatus === "Lunas" ? "Menunggu Konfirmasi" : "Pending";
    if (order.serviceStatus === nextStatus) return;
    order.serviceStatus = nextStatus;
    order.updatedAt = new Date().toISOString();
    order.serviceHistory = order.serviceHistory || [];
    order.serviceHistory.push({ status: nextStatus, at: order.updatedAt });
    changed = true;
  });
  return changed;
}

// Reconcile delayed/app-switch payments on every order page, including return visits.
var paymentSyncPromise = null;
function sinkronkanPembayaran() {
  if (paymentSyncPromise) return paymentSyncPromise;
  var params = new URLSearchParams(window.location.search);
  var returnedOrderId = params.get("order_id");
  var changed = false;
  paymentSyncPromise = Promise.all(getOrders().map(async function (order) {
    if (order.paymentStatus === "Lunas" || order.paymentType === "demo") return;
    var ids = (order.midtransOrderIds || []).slice();
    // Older checkouts did not save the provider ID. Recover it from the return
    // URL only as a lookup hint; the server still verifies the actual payment.
    if (params.get("order") === order.id && returnedOrderId &&
        returnedOrderId.indexOf(order.id + "-") === 0 && ids.indexOf(returnedOrderId) === -1) ids.push(returnedOrderId);
    if (!ids.length) return;
    var statuses = await Promise.all(ids.map(async function (id) {
      try {
        var response = await fetch("/api/midtrans-status", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id, midtransOrderId: id, grossAmount: order.total })
        });
        if (!response.ok) return null;
        return (await response.json()).paymentStatus;
      } catch (_) { return null; }
    }));
    var status = statuses.indexOf("Lunas") !== -1 ? "Lunas" : statuses[statuses.length - 1];
    if (["Lunas", "Pending", "Gagal"].indexOf(status) === -1) return;
    // Re-read after the request so admin edits or another payment aren't overwritten.
    var orders = getOrders();
    var latest = orders.find(function (item) { return item.id === order.id; });
    if (!latest || latest.paymentStatus === "Lunas") return;
    if (latest.paymentStatus === status && JSON.stringify(latest.midtransOrderIds) === JSON.stringify(ids)) return;
    latest.paymentStatus = status;
    latest.paymentType = "midtrans";
    latest.midtransOrderIds = Array.from(new Set((latest.midtransOrderIds || []).concat(ids)));
    latest.updatedAt = new Date().toISOString();
    if (setOrders(orders)) changed = true;
  })).then(function () {
    // Existing dashboard/admin/tracking listeners already refresh on storage changes.
    if (changed) window.dispatchEvent(new StorageEvent("storage", { key: FIXIN_KEYS.ORDERS }));
  }).finally(function () { paymentSyncPromise = null; });
  return paymentSyncPromise;
}

document.addEventListener("DOMContentLoaded", function () {
  sinkronkanPembayaran();
  setInterval(function () { if (!document.hidden) sinkronkanPembayaran(); }, 15000);
});
window.addEventListener("focus", function () { sinkronkanPembayaran(); });

// ---------- Seed data demo ----------

function seedUsers() {
  var users = getUsers();
  if (users.length > 0) {
    migrateUsersPlaintext(users);
    return;
  }

  setUsers([
    {
      id: "USR-001",
      name: "User Demo",
      email: "user@fixin.test",
      password: "e606e38b0d8c19b24cf0ee3808183162ea7cd63ff7912dbb22b5e803286b4446", // user123
      role: "user"
    },
    {
      id: "ADM-001",
      name: "Admin FIXIN",
      email: "admin@fixin.test",
      password: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9", // admin123
      role: "admin"
    }
  ]);
}

function seedProducts() {
  var products = getProducts();
  if (products.length > 0) return;

  // Diseed dari layanan yang sudah tampil di index.html & services.html
  setProducts([
    {
      id: "PRD-001",
      name: "Ganti Layar HP",
      category: "HP",
      description: "Penggantian layar retak atau bergaris dengan sparepart original/kompatibel.",
      price: 250000,
      estimatedTime: "1-2 hari",
      active: true
    },
    {
      id: "PRD-002",
      name: "Ganti Baterai",
      category: "HP",
      description: "Baterai boros atau cepat habis, kami ganti dengan yang baru dan bergaransi.",
      price: 150000,
      estimatedTime: "1 hari",
      active: true
    },
    {
      id: "PRD-003",
      name: "Install Ulang OS",
      category: "Laptop",
      description: "Instalasi ulang sistem operasi laptop/PC beserta driver dan software dasar.",
      price: 100000,
      estimatedTime: "1 hari",
      active: true
    },
    {
      id: "PRD-004",
      name: "Perbaikan Konektor Charger",
      category: "HP",
      description: "Perangkat susah mengisi daya karena konektor kendor atau rusak, kami perbaiki.",
      price: 80000,
      estimatedTime: "1 hari",
      active: true
    },
    {
      id: "PRD-005",
      name: "Bersihkan Virus & Malware",
      category: "Laptop",
      description: "Pembersihan virus, malware, dan optimasi performa laptop yang mulai lambat.",
      price: 60000,
      estimatedTime: "Beberapa jam",
      active: true
    },
    {
      id: "PRD-006",
      name: "Servis Tablet",
      category: "Tablet",
      description: "Perbaikan layar sentuh, baterai, dan konektivitas pada perangkat tablet.",
      price: 90000,
      estimatedTime: "1-2 hari",
      active: true
    }
  ]);
}

function seedFixinData() {
  seedUsers();
  seedProducts();
  // fixin_orders SENGAJA tidak di-seed, karena order harus lahir dari
  // aksi booking asli (baik data lama maupun baru), bukan data dummy.
}

// Jalan otomatis begitu storage.js di-load di halaman manapun.
document.addEventListener("DOMContentLoaded", seedFixinData);




function migrateUsersPlaintext(users) {
  var dominated = false;
  for (var i = 0; i < users.length; i++) {
    if (users[i].password && users[i].password.length < 64) {
      dominated = true;
      break;
    }
  }
  if (!dominated) return;
  var pending = [];
  users.forEach(function (u, idx) {
    if (u.password && u.password.length < 64) {
      pending.push(hashPassword(u.password).then(function (h) { users[idx].password = h; }));
    }
  });
  Promise.all(pending).then(function () { setUsers(users); });
}



