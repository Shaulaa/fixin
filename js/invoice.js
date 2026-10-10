// invoice.js - halaman Invoice FIXIN.
//
// Scope:
// - Halaman ini WAJIB login (requireAuth), dan invoice hanya bisa dibuka
//   untuk order milik user yang sedang login (order.userId === session.userId).
//   Order yang tidak ditemukan ATAU bukan milik user login sama-sama
//   ditampilkan sebagai "Order tidak ditemukan" (pesan digeneralisasi
//   supaya tidak bocorin ke user lain apakah suatu order ID valid).
// - Tombol "Unduh Invoice (PDF)" generate PDF asli dari DATA transaksi
//   (order object di localStorage) memakai jsPDF + AutoTable, BUKAN dari
//   screenshot/html2canvas.
// - Tombol "Cetak Struk" mengisi #strukPrintArea lalu window.print(),
//   dengan CSS print khusus ukuran kecil/thermal-friendly (lihat <style>
//   @media print di invoice.html).
//
// Butuh js/utils.js, js/storage.js, js/auth.js sudah ter-load lebih dulu,
// dan js/main.js. Lib eksternal jsPDF + jsPDF-AutoTable dimuat via CDN
// di invoice.html sebelum file ini.

var invoiceOrder = null;

// ---------- Cari order + guard kepemilikan ----------

function cariInvoiceOrder(orderId, userId) {
  var orders = getOrders();
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].id === orderId && orders[i].userId === userId) {
      return orders[i];
    }
  }
  return null;
}

// ---------- Render ringkasan invoice di halaman ----------

function renderInvoice(order) {
  var nomor = order.serviceCode || order.id;
  var isPickup = order.deliveryMethod === "pickup";
  var kodeServis = order.serviceCode || order.kode;
  document.querySelectorAll("[data-invoice-tracking]").forEach(function (link) {
    link.href = kodeServis ? "tracking.html?kode=" + encodeURIComponent(kodeServis) : "tracking.html";
  });

  document.getElementById("invNomor").textContent = nomor;
  document.getElementById("invKode2").textContent = nomor;
  document.getElementById("invTanggal").textContent = formatDateIndonesia(order.createdAt);

  document.getElementById("invNama").textContent = order.customerName || "-";
  document.getElementById("invEmail").textContent = order.customerEmail || "-";
  document.getElementById("invTelepon").textContent = order.phone || "-";

  document.getElementById("invLayanan").textContent = order.serviceName || "-";
  document.getElementById("invMetode").textContent = isPickup ? "Dijemput Kurir" : "Antar Sendiri";

  if (isPickup) {
    document.getElementById("invAlamatRow").classList.remove("hidden");
    document.getElementById("invAlamat").textContent = order.pickupAddress || "-";
  }

  document.getElementById("invSubtotal").textContent = formatRupiah(order.subtotal);

  if (isPickup && Number(order.deliveryFee) > 0) {
    document.getElementById("invOngkirRow").classList.remove("hidden");
    document.getElementById("invOngkir").textContent = formatRupiah(order.deliveryFee);
  }

  document.getElementById("invTotal").textContent = formatRupiah(order.total);

  var statusEl = document.getElementById("invPaymentStatus");
  statusEl.textContent = order.paymentStatus || "-";
  statusEl.classList.remove("status-lunas", "status-pending", "status-gagal");
  if (order.paymentStatus === "Lunas") statusEl.classList.add("status-lunas");
  else if (order.paymentStatus === "Pending") statusEl.classList.add("status-pending");
  else if (order.paymentStatus === "Gagal") statusEl.classList.add("status-gagal");
}

// ---------- Cetak Struk (thermal-friendly) ----------

function siapkanStrukInvoice(order) {
  var nomor = order.serviceCode || order.id;
  var isPickup = order.deliveryMethod === "pickup";

  document.getElementById("strukKode").textContent = nomor;
  document.getElementById("strukTanggal").textContent = formatDateIndonesia(order.createdAt);
  document.getElementById("strukNama").textContent = order.customerName || "-";
  document.getElementById("strukLayanan").textContent = order.serviceName || "-";
  document.getElementById("strukMetode").textContent = isPickup ? "Dijemput Kurir" : "Antar Sendiri";
  document.getElementById("strukSubtotal").textContent = formatRupiah(order.subtotal);

  var ongkirRow = document.getElementById("strukOngkirRow");
  if (isPickup && Number(order.deliveryFee) > 0) {
    ongkirRow.classList.remove("hidden");
    document.getElementById("strukOngkir").textContent = formatRupiah(order.deliveryFee);
  } else {
    ongkirRow.classList.add("hidden");
  }

  document.getElementById("strukTotal").textContent = formatRupiah(order.total);
  document.getElementById("strukStatusBayar").textContent = order.paymentStatus || "-";
}

// ---------- Unduh Invoice (PDF) via jsPDF + AutoTable ----------
// PDF dibangun murni dari field-field order (data transaksi), bukan hasil
// screenshot/render halaman.

function buatInvoicePDF(order) {
  if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
    alert("Library PDF belum berhasil dimuat. Cek koneksi internet lalu coba lagi.");
    return;
  }

  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ unit: "mm", format: "a4" });

  var nomor = order.serviceCode || order.id;
  var isPickup = order.deliveryMethod === "pickup";
  var tealRGB = [23, 179, 163];
  var navyRGB = [12, 35, 64];
  var mutedRGB = [91, 104, 121];

  // ---- Header: logo/nama FIXIN ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(navyRGB[0], navyRGB[1], navyRGB[2]);
  doc.text("FIX", 14, 20);
  doc.setTextColor(tealRGB[0], tealRGB[1], tealRGB[2]);
  doc.text("IN", 14 + doc.getTextWidth("FIX"), 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(mutedRGB[0], mutedRGB[1], mutedRGB[2]);
  doc.text("Servis HP, Laptop & Tablet Terpercaya", 14, 26);

  doc.setDrawColor(226, 230, 234);
  doc.line(14, 31, 196, 31);

  // ---- Nomor invoice/order & tanggal ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(navyRGB[0], navyRGB[1], navyRGB[2]);
  doc.text("INVOICE", 14, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text("No. Invoice/Order: " + nomor, 14, 47);
  doc.text("Tanggal: " + formatDateIndonesia(order.createdAt), 14, 53);

  // ---- Data pelanggan ----
  doc.setFont("helvetica", "bold");
  doc.text("Ditagihkan kepada:", 120, 40);
  doc.setFont("helvetica", "normal");
  doc.text(order.customerName || "-", 120, 47);
  doc.text(order.phone || "-", 120, 53);
  doc.text(order.customerEmail || "-", 120, 59);

  var yAfterHeader = 59;
  if (isPickup && order.pickupAddress) {
    var alamatLines = doc.splitTextToSize("Alamat jemput: " + order.pickupAddress, 76);
    doc.text(alamatLines, 120, 65);
    yAfterHeader = 65 + (alamatLines.length - 1) * 5;
  }

  var startY = Math.max(70, yAfterHeader + 8);

  // ---- Tabel layanan (AutoTable) ----
  var body = [
    ["Layanan", order.serviceName || "-", formatRupiah(order.subtotal)]
  ];

  if (isPickup) {
    body.push([
      "Biaya Jemput/Antar",
      "Dijemput Kurir",
      formatRupiah(order.deliveryFee || 0)
    ]);
  }

  doc.autoTable({
    startY: startY,
    head: [["Deskripsi", "Metode Antar/Jemput", "Biaya"]],
    body: body,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 4, textColor: [30, 30, 30] },
    headStyles: { fillColor: tealRGB, textColor: 255, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" } },
    margin: { left: 14, right: 14 }
  });

  var finalY = doc.lastAutoTable.finalY + 10;

  // ---- Total ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(navyRGB[0], navyRGB[1], navyRGB[2]);
  doc.text("Total: " + formatRupiah(order.total), 182, finalY, { align: "right" });

  // ---- Status pembayaran ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text("Status Pembayaran: " + (order.paymentStatus || "-"), 14, finalY + 10);
  doc.text("Metode Antar/Jemput: " + (isPickup ? "Dijemput Kurir" : "Antar Sendiri"), 14, finalY + 16);

  // ---- Footer ----
  doc.setFontSize(8.5);
  doc.setTextColor(mutedRGB[0], mutedRGB[1], mutedRGB[2]);
  doc.text("Terima kasih telah menggunakan layanan FIXIN.", 14, 285);
  doc.text("Invoice ini dibuat otomatis dari data transaksi FIXIN.", 14, 290);

  doc.save("FIXIN-Invoice-" + nomor + ".pdf");
}

// ---------- Wiring ----------

document.addEventListener("DOMContentLoaded", function () {
  var session = requireAuth();
  if (!session) return; // sudah di-redirect ke login.html sama requireAuth()

  var params = new URLSearchParams(window.location.search);
  var orderId = params.get("order");

  invoiceOrder = cariInvoiceOrder(orderId, session.userId);

  var notFoundBox = document.getElementById("invoiceNotFound");
  var contentBox = document.getElementById("invoiceContent");

  if (!invoiceOrder) {
    notFoundBox.classList.remove("hidden");
    contentBox.classList.add("hidden");
    return;
  }

  // storage.js verifies redirected/delayed payments through the server status API.

  renderInvoice(invoiceOrder);

  window.addEventListener("storage", function (event) {
    if (event.key !== FIXIN_KEYS.ORDERS && event.key !== null) return;
    invoiceOrder = cariInvoiceOrder(orderId, session.userId);
    if (invoiceOrder) renderInvoice(invoiceOrder);
  });

  document.getElementById("btnDownloadInvoice").addEventListener("click", function () {
    buatInvoicePDF(invoiceOrder);
  });

  document.getElementById("btnCetakStruk").addEventListener("click", function () {
    siapkanStrukInvoice(invoiceOrder);
    window.print();
  });
});

