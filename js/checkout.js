// checkout.js - Halaman checkout FIXIN.
//
// =====================================================================
// ARSITEKTUR MIDTRANS - BACA SEBELUM MENGUBAH FILE INI
// =====================================================================
// Project FIXIN ini FRONTEND-ONLY (HTML/CSS/JS vanilla, tanpa backend).
// Midtrans Snap butuh "Snap Token", dan Snap Token HANYA bisa dibuat
// oleh server yang memegang SERVER KEY (rahasia). Server Key TIDAK
// PERNAH boleh ditulis di file ini, di HTML manapun, atau di localStorage.
//
// Alur produksi yang benar:
//   1. Frontend kirim data order ke backend: POST /api/midtrans-token
//   2. Backend (Node/serverless) simpan Server Key sebagai env var,
//      lalu panggil Midtrans Snap API pakai Server Key tsb.
//   3. Midtrans balikin Snap Token ke backend.
//   4. Backend balikin Snap Token itu ke frontend.
//   5. Frontend panggil snap.pay(snapToken, {...}) untuk buka UI pembayaran.
//
// Karena tugas ini frontend-only dan endpoint /api/midtrans-token belum
// ada, mintaSnapToken() di bawah akan gagal (fetch 404/network error) dan
// kode otomatis fallback ke DEMO PAYMENT MODE (Prompt requirement no. 7),
// supaya alur checkout tetap bisa didemokan tanpa backend nyata.
// =====================================================================

// Endpoint aman sisi server untuk membuat Snap Token.
// Ini BUKAN tempat menaruh Server Key - hanya alamat endpoint yang
// nantinya dibuat oleh backend/serverless.
var MIDTRANS_TOKEN_ENDPOINT = "/api/midtrans-token";

var currentOrder = null;

document.addEventListener("DOMContentLoaded", function () {
  var params = new URLSearchParams(window.location.search);
  var orderId = params.get("order");

  currentOrder = cariOrderById(orderId);

  var notFoundBox = document.getElementById("checkoutNotFound");
  var contentBox = document.getElementById("checkoutContent");

  if (!currentOrder) {
    notFoundBox.classList.remove("hidden");
    contentBox.classList.add("hidden");
    return;
  }

  renderRingkasanOrder(currentOrder);

  var btnBayar = document.getElementById("btnBayarMidtrans");
  if (btnBayar) btnBayar.addEventListener("click", mulaiPembayaranMidtrans);

  // Tombol-tombol Demo Payment Mode (requirement no. 7).
  document.getElementById("btnSimulasiLunas").addEventListener("click", function () {
    simulasiPembayaran("Lunas");
  });
  document.getElementById("btnSimulasiPending").addEventListener("click", function () {
    simulasiPembayaran("Pending");
  });
  document.getElementById("btnSimulasiGagal").addEventListener("click", function () {
    simulasiPembayaran("Gagal");
  });

  // Kalau order sudah lunas sebelumnya (misal user reload halaman
  // setelah sukses bayar), langsung arahkan ke invoice.
  if (currentOrder.paymentStatus === "Lunas") {
    window.location.href = "invoice.html?order=" + currentOrder.id;
  }
});

// ---------- Data ----------

function cariOrderById(orderId) {
  var orders = getOrders();
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].id === orderId) return orders[i];
  }
  return null;
}

function simpanStatusPembayaran(status, paymentType) {
  var orders = getOrders();
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].id === currentOrder.id) {
      // A late Pending/Error callback must not undo a verified successful payment.
      if (orders[i].paymentStatus === "Lunas" && status !== "Lunas") return;
      orders[i].paymentStatus = status;
      orders[i].paymentType = paymentType;
      orders[i].updatedAt = new Date().toISOString();
      currentOrder = orders[i];
      setOrders(orders);
      return;
    }
  }
}

function segarkanCurrentOrder() {
  var orders = getOrders();
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].id === currentOrder.id) {
      currentOrder = orders[i];
      return;
    }
  }
}

// ---------- Tampilan ----------

function renderRingkasanOrder(order) {
  document.getElementById("coKode").textContent = order.serviceCode || "-";
  document.getElementById("coKode2").textContent = order.serviceCode || "-";
  document.getElementById("coNama").textContent = order.customerName || "-";
  document.getElementById("coLayanan").textContent = order.serviceName || "-";
  document.getElementById("coMetode").textContent = order.deliveryMethod === "pickup" ? "Dijemput Kurir" : "Antar Sendiri";
  document.getElementById("coSubtotal").textContent = formatRupiah(order.subtotal);
  document.getElementById("coOngkir").textContent = formatRupiah(order.deliveryFee);
  document.getElementById("coTotal").textContent = formatRupiah(order.total);
  perbaruiStatusPembayaranUI(order.paymentStatus);

  if (order.deliveryMethod === "pickup") {
    document.getElementById("coAlamatRow").classList.remove("hidden");
    document.getElementById("coAlamat").textContent = order.pickupAddress || "-";
  }
}

function perbaruiStatusPembayaranUI(status) {
  var el = document.getElementById("coPaymentStatus");
  el.textContent = status || "-";
  el.classList.remove("status-lunas", "status-pending", "status-gagal");

  if (status === "Lunas") el.classList.add("status-lunas");
  else if (status === "Pending") el.classList.add("status-pending");
  else if (status === "Gagal") el.classList.add("status-gagal");
}

function tampilkanPesan(text, tipe) {
  var box = document.getElementById("checkoutMessage");
  box.textContent = text;
  box.classList.remove("hidden");
  box.style.color = tipe === "error" ? "#c0392b" : "#5b6879";
}

function resetTombolBayar() {
  var btn = document.getElementById("btnBayarMidtrans");
  btn.disabled = false;
  btn.textContent = "Bayar dengan Midtrans";
}

function tampilkanDemoPaymentBox() {
  resetTombolBayar();
  document.getElementById("btnBayarMidtrans").classList.add("hidden");
  document.getElementById("demoPaymentBox").classList.remove("hidden");
}

// =====================================================================
// PRODUKSI: request Snap Token dari backend, lalu buka Midtrans Snap UI.
// =====================================================================

function mintaSnapToken(order) {
  // returnUrl dipakai backend untuk mengisi callbacks.finish ke Midtrans,
  // supaya tombol "Back to Merchant" di halaman sukses Snap mengarah ke
  // invoice.html (bukan checkout.html, dan bukan default sandbox
  // Midtrans/example.com). Ini penting untuk metode bayar yang membuat
  // Snap pindah dari halaman kita (GoPay app-switch, VA redirect, 3DS
  // kartu) karena untuk metode itu callback onSuccess di JS tidak akan
  // pernah terpanggil (halaman sudah reload lewat returnUrl).
  var basePath = window.location.pathname.replace(/checkout\.html.*$/, "");
  var returnUrl = window.location.origin + basePath + "invoice.html?order=" + order.id + "&fromMidtrans=1";

  return fetch(MIDTRANS_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: order.id,
      grossAmount: order.total,
      customer: {
        name: order.customerName,
        phone: order.phone,
        email: order.customerEmail || ""
      },
      returnUrl: returnUrl
    })
  }).then(function (res) {
    if (!res.ok) throw new Error("Endpoint Snap Token tidak tersedia (status " + res.status + ")");
    return res.json();
  }).then(function (data) {
    if (!data || !data.snapToken) throw new Error("Response endpoint tidak berisi snapToken");
    if (!data.midtransOrderId) throw new Error("ID transaksi Midtrans tidak tersedia");
    var orders = getOrders();
    var savedOrder = orders.find(function (item) { return item.id === order.id; });
    if (!savedOrder) throw new Error("Pesanan tidak ditemukan");
    savedOrder.midtransOrderIds = (savedOrder.midtransOrderIds || []).concat(data.midtransOrderId);
    savedOrder.paymentType = "midtrans";
    if (!setOrders(orders)) throw new Error("Transaksi tidak dapat disimpan");
    return data.snapToken;
  });
}

function mulaiPembayaranMidtrans() {
  segarkanCurrentOrder();
  if (currentOrder.paymentStatus === "Lunas") {
    window.location.href = "invoice.html?order=" + currentOrder.id;
    return;
  }

  var btn = document.getElementById("btnBayarMidtrans");
  btn.disabled = true;
  btn.textContent = "Memproses...";

  mintaSnapToken(currentOrder)
    .then(function (snapToken) {
      // ---------- PRODUKSI: buka UI pembayaran Midtrans Snap ----------
      if (typeof window.snap === "undefined") {
        throw new Error("Snap.js belum termuat (data-client-key belum diisi / offline)");
      }

      window.snap.pay(snapToken, {
        onSuccess: function () {
          sinkronkanPembayaran().then(function () {
            window.location.href = "invoice.html?order=" + currentOrder.id;
          });
        },
        onPending: function () {
          simpanStatusPembayaran("Pending", "midtrans");
          perbaruiStatusPembayaranUI("Pending");
          resetTombolBayar();
          tampilkanPesan("Pembayaran pending, menunggu konfirmasi dari Midtrans.");
        },
        onError: function () {
          simpanStatusPembayaran("Gagal", "midtrans");
          perbaruiStatusPembayaranUI("Gagal");
          resetTombolBayar();
          tampilkanPesan("Pembayaran gagal. Silakan coba lagi.", "error");
        },
        onClose: function () {
          resetTombolBayar();
          sinkronkanPembayaran();
        }
      });
    })
    .catch(function (err) {
      // ---------- DEMO PAYMENT MODE ----------
      // Endpoint /api/midtrans-token belum ada di project frontend-only ini,
      // jadi fallback ke simulasi manual supaya presentasi tetap bisa jalan.
      console.warn("Snap Token tidak didapat, masuk demo payment mode:", err.message);
      tampilkanDemoPaymentBox();
    });
}

window.addEventListener("storage", function (event) {
  if (event.key !== FIXIN_KEYS.ORDERS || !currentOrder) return;
  segarkanCurrentOrder();
  perbaruiStatusPembayaranUI(currentOrder.paymentStatus);
  if (currentOrder.paymentStatus === "Lunas") window.location.href = "invoice.html?order=" + currentOrder.id;
});

// =====================================================================
// DEMO PAYMENT MODE - khusus tugas frontend-only, BUKAN integrasi asli.
// Tombol ini mensimulasikan hasil pembayaran secara manual tanpa
// menghubungi Midtrans sama sekali.
// =====================================================================

function simulasiPembayaran(status) {
  segarkanCurrentOrder();
  if (currentOrder.paymentStatus === "Lunas") {
    window.location.href = "invoice.html?order=" + currentOrder.id;
    return;
  }
  simpanStatusPembayaran(status, "demo");
  perbaruiStatusPembayaranUI(status);

  if (status === "Lunas") {
    window.location.href = "invoice.html?order=" + currentOrder.id;
    return;
  }

  if (status === "Pending") {
    tampilkanPesan("Status pembayaran disimulasikan: Pending.");
  } else {
    tampilkanPesan("Status pembayaran disimulasikan: Gagal. Kamu bisa coba simulasikan ulang.", "error");
  }
}

