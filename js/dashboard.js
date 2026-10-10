// dashboard.js - halaman dashboard user FIXIN (Prompt 6).
//
// Scope tahap ini: profil singkat, ringkasan jumlah order, riwayat order
// milik user yang sedang login, dan tombol Detail/Tracking/Invoice PDF/
// Cetak Struk pada tiap order.
//
// Catatan:
// - Hanya order skema baru (js/booking.js form lengkap) yang punya field
//   userId, jadi hanya order itu yang bisa "dimiliki" oleh user tertentu.
//   Order dari quick form homepage (skema lama, tanpa login) tidak punya
//   userId dan sengaja tidak tampil di sini.
// - Tombol Tracking mengarah ke tracking.html?kode=... (fitur lacak servis
//   yang sudah ada) supaya status yang ditampilkan selalu baca data
//   terbaru dari fixin_orders setiap halaman dibuka/refresh.
// - Tombol Invoice PDF mengarah ke invoice.html?order=... (masih halaman
//   ringkasan; export PDF asli dengan jsPDF dikerjakan di tahap
//   berikutnya/Prompt 7).
// - Tombol Cetak Struk memakai window.print() sederhana yang hanya
//   menampilkan area struk (lihat aturan @media print di dashboard.css).
//   CSS print khusus ukuran thermal-friendly dikerjakan bersamaan dengan
//   invoice PDF di Prompt 7.
//
// Butuh js/storage.js & js/utils.js sudah ter-load lebih dulu, dan
// js/auth.js untuk requireRole()/logout().

// Pemetaan kelompok status servis, disamakan dengan js/tracking.js supaya
// definisi "order aktif" / "order selesai" konsisten di seluruh aplikasi.
var DASH_STATUS_SELESAI = ["Selesai", "Diantar Kembali", "Diterima Pelanggan"];
var DASH_STATUS_DIBATALKAN = "Dibatalkan";

var dashboardOrdersById = {};
var dashboardSessionUserId = null;
var dashboardDetailOrderId = null;



// ---------- Data ----------

function getOrdersMilikUser(userId) {
  return getOrders().filter(function (o) {
    return o.userId === userId;
  });
}

function kelompokStatusServis(order) {
  if (order.serviceStatus === DASH_STATUS_DIBATALKAN) return "dibatalkan";
  if (DASH_STATUS_SELESAI.indexOf(order.serviceStatus) !== -1) return "selesai";
  return "aktif";
}

function statusBadgeClass(order) {
  var kelompok = kelompokStatusServis(order);
  if (kelompok === "selesai") return "status-active";
  if (kelompok === "dibatalkan") return "status-inactive";
  return "status-warning";
}

function paymentBadgeClass(paymentStatus) {
  if (paymentStatus === "Lunas") return "status-active";
  if (paymentStatus === "Pending") return "status-warning";
  if (paymentStatus === "Gagal") return "status-inactive";
  return "status-info"; // "Belum Dibayar" atau tidak diketahui
}

// ---------- Render: riwayat order ----------

function orderCardTemplate(o) {
  return (
    '<div class="order-card">' +
      '<div class="order-card-top">' +
        '<div>' +
          '<div class="order-card-code">' + escapeHtml(o.serviceCode) + "</div>" +
          '<div class="order-card-meta">' + escapeHtml(o.serviceName) + " &middot; " + formatDateIndonesia(o.serviceDate) + "</div>" +
        "</div>" +
        '<div class="order-card-right">' +
          '<span class="status-badge ' + statusBadgeClass(o) + '">' + escapeHtml(o.serviceStatus) + "</span>" +
          '<div class="order-card-total">' + formatRupiah(o.total) + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="order-card-payment">' +
        "Pembayaran:" +
        '<span class="status-badge ' + paymentBadgeClass(o.paymentStatus) + '">' + escapeHtml(o.paymentStatus) + "</span>" +
      "</div>" +
      '<div class="order-card-actions">' +
        '<button type="button" class="btn btn-outline-dark" data-action="detail" data-id="' + o.id + '">Detail</button>' +
        '<a href="tracking.html?kode=' + encodeURIComponent(o.serviceCode || "") + '" class="btn btn-outline-dark">Tracking</a>' +
        '<a href="invoice.html?order=' + encodeURIComponent(o.id) + '" class="btn btn-outline-dark">Invoice PDF</a>' +
        '<button type="button" class="btn btn-outline-dark" data-action="struk" data-id="' + o.id + '">Cetak Struk</button>' +
      "</div>" +
    "</div>"
  );
}

function renderRiwayat(orders) {
  var listEl = document.getElementById("orderList");
  var emptyEl = document.getElementById("orderEmptyState");

  if (orders.length === 0) {
    listEl.innerHTML = "";
    listEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  listEl.classList.remove("hidden");

  var sorted = orders.slice().sort(function (a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  dashboardOrdersById = {};
  sorted.forEach(function (o) {
    dashboardOrdersById[o.id] = o;
  });

  listEl.innerHTML = sorted.map(orderCardTemplate).join("");
}

// ---------- Modal: Detail order ----------

function openDetailModal(order) {
  dashboardDetailOrderId = order.id;
  document.getElementById("detailKode").textContent = order.serviceCode || "-";
  document.getElementById("detailLayanan").textContent = order.serviceName || "-";
  document.getElementById("detailPerangkat").textContent = order.deviceType || "-";
  document.getElementById("detailKeluhan").textContent = order.complaint || "-";
  document.getElementById("detailTanggal").textContent = formatDateIndonesia(order.serviceDate);
  document.getElementById("detailMetode").textContent = order.deliveryMethod === "pickup" ? "Dijemput Kurir" : "Antar Sendiri";

  var alamatRow = document.getElementById("detailAlamatRow");
  if (order.deliveryMethod === "pickup") {
    alamatRow.classList.remove("hidden");
    document.getElementById("detailAlamat").textContent = order.pickupAddress || "-";
  } else {
    alamatRow.classList.add("hidden");
  }

  document.getElementById("detailSubtotal").textContent = formatRupiah(order.subtotal);
  document.getElementById("detailOngkir").textContent = formatRupiah(order.deliveryFee);
  document.getElementById("detailTotal").textContent = formatRupiah(order.total);
  document.getElementById("detailStatusServis").textContent = order.serviceStatus || "-";
  document.getElementById("detailStatusBayar").textContent = order.paymentStatus || "-";

  document.getElementById("detailModalBackdrop").classList.add("show");
}

function closeDetailModal() {
  dashboardDetailOrderId = null;
  document.getElementById("detailModalBackdrop").classList.remove("show");
}

// ---------- Live refresh: baca ulang fixin_orders kalau diubah dari tab lain ----------
// (misalnya admin ubah serviceStatus di admin-orders.html), tanpa perlu
// user reload halaman riwayat pesanannya sendiri.

function refreshRiwayatUser() {
  if (!dashboardSessionUserId) return;

  var orders = getOrdersMilikUser(dashboardSessionUserId);
  renderRiwayat(orders);

  // Kalau modal detail lagi kebuka buat order yang barusan berubah,
  // ikut disegarkan biar status yang tampil gak basi.
  if (dashboardDetailOrderId && dashboardOrdersById[dashboardDetailOrderId]) {
    openDetailModal(dashboardOrdersById[dashboardDetailOrderId]);
  }
}

window.addEventListener("storage", function (e) {
  if (e.key === FIXIN_KEYS.ORDERS || e.key === null) {
    refreshRiwayatUser();
  }
});

// ---------- Cetak Struk ----------

function siapkanStruk(order) {
  document.getElementById("strukKode").textContent = order.serviceCode || "-";
  document.getElementById("strukNama").textContent = order.customerName || "-";
  document.getElementById("strukLayanan").textContent = order.serviceName || "-";
  document.getElementById("strukTanggal").textContent = formatDateIndonesia(order.serviceDate);
  document.getElementById("strukMetode").textContent = order.deliveryMethod === "pickup" ? "Dijemput Kurir" : "Antar Sendiri";
  document.getElementById("strukSubtotal").textContent = formatRupiah(order.subtotal);
  document.getElementById("strukOngkir").textContent = formatRupiah(order.deliveryFee);
  document.getElementById("strukTotal").textContent = formatRupiah(order.total);
  document.getElementById("strukStatusBayar").textContent = order.paymentStatus || "-";
}

// ---------- Wiring ----------

document.addEventListener("DOMContentLoaded", function () {
  var session = requireRole("user");
  if (!session) return; // sudah di-redirect sama requireRole

  dashboardSessionUserId = session.userId;

  var orders = getOrdersMilikUser(session.userId);
  renderRiwayat(orders);

  // Klik tombol Detail / Cetak Struk pada kartu order (event delegation).
  document.getElementById("orderList").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;

    var order = dashboardOrdersById[btn.getAttribute("data-id")];
    if (!order) return;

    if (btn.getAttribute("data-action") === "detail") {
      openDetailModal(order);
    } else if (btn.getAttribute("data-action") === "struk") {
      siapkanStruk(order);
      window.print();
    }
  });

  // Tutup modal detail.
  document.getElementById("closeDetailModal").addEventListener("click", closeDetailModal);
  document.getElementById("detailModalBackdrop").addEventListener("click", function (e) {
    if (e.target === this) closeDetailModal();
  });
});

