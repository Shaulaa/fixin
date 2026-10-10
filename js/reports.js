// reports.js - logic Laporan Transaksi untuk admin-reports.html.
// Butuh utils.js, storage.js, auth.js, dan SheetJS (xlsx.full.min.js) sudah
// ter-load lebih dulu.
//
// Sumber data laporan SELALU fixin_orders (lewat getOrders() dari
// storage.js) - tidak ada data dummy terpisah. Periode difilter berdasarkan
// "createdAt" tiap order (kapan transaksi itu dibuat), relatif terhadap
// tanggal referensi yang admin pilih.

var REPORT_PERIODE_LABEL = {
  hari: "Harian",
  minggu: "Mingguan",
  bulan: "Bulanan",
  tahun: "Tahunan"
};

var REPORT_PERIODE_FILENAME = {
  hari: "HARIAN",
  minggu: "MINGGUAN",
  bulan: "BULANAN",
  tahun: "TAHUNAN"
};

var REPORT_PAYMENT_LUNAS = "Lunas";
var REPORT_PAYMENT_PENDING_GAGAL = ["Pending", "Gagal"];



// ---------- Tanggal ----------

/**
 * Parse "YYYY-MM-DD" (dari <input type="date">) jadi Date lokal jam 00:00:00,
 * supaya tidak geser timezone seperti new Date("YYYY-MM-DD") biasa.
 */
function parseTanggalReferensi(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    var bagian = value.split("-");
    return new Date(Number(bagian[0]), Number(bagian[1]) - 1, Number(bagian[2]));
  }
  var fallback = new Date();
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

function toInputDateValue(date) {
  var yyyy = date.getFullYear();
  var mm = String(date.getMonth() + 1).padStart(2, "0");
  var dd = String(date.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

function toFilenameDateValue(date) {
  var yyyy = date.getFullYear();
  var mm = String(date.getMonth() + 1).padStart(2, "0");
  var dd = String(date.getDate()).padStart(2, "0");
  return "" + yyyy + mm + dd;
}

function akhirHari(date) {
  var d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function awalHari(date) {
  var d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Hitung rentang [start, end] berdasarkan periode & tanggal referensi.
 * Minggu dihitung Senin-Minggu (konvensi Indonesia).
 */
function hitungRentangPeriode(periode, tanggalReferensi) {
  var ref = awalHari(tanggalReferensi);
  var start, end;

  if (periode === "hari") {
    start = ref;
    end = akhirHari(ref);
  } else if (periode === "minggu") {
    var hariKe = ref.getDay(); // 0 = Minggu, 1 = Senin, ... 6 = Sabtu
    var offsetKeSenin = hariKe === 0 ? 6 : hariKe - 1;
    start = new Date(ref);
    start.setDate(ref.getDate() - offsetKeSenin);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    end = akhirHari(end);
  } else if (periode === "tahun") {
    start = new Date(ref.getFullYear(), 0, 1);
    end = akhirHari(new Date(ref.getFullYear(), 11, 31));
  } else {
    // default: bulan
    start = new Date(ref.getFullYear(), ref.getMonth(), 1);
    end = akhirHari(new Date(ref.getFullYear(), ref.getMonth() + 1, 0));
  }

  return { start: start, end: end };
}

function formatRentangLabel(periode, start, end) {
  if (periode === "hari") return formatDateIndonesia(start);
  if (periode === "tahun") return "Tahun " + start.getFullYear();
  return formatDateIndonesia(start) + " - " + formatDateIndonesia(end);
}

// ---------- Data & agregasi ----------

function ambilOrderPeriodeLaporan(periode, tanggalReferensi) {
  var rentang = hitungRentangPeriode(periode, tanggalReferensi);
  var orders = getOrders().filter(function (o) {
    var dibuat = new Date(o.createdAt);
    if (isNaN(dibuat.getTime())) return false;
    return dibuat >= rentang.start && dibuat <= rentang.end;
  });

  return { orders: orders, rentang: rentang };
}

function hitungRingkasanLaporan(orders) {
  var jumlahTransaksi = orders.length;
  var omzetTotal = 0;
  var transaksiLunas = 0;
  var transaksiPendingGagal = 0;
  var transaksiBelumDibayar = 0;

  orders.forEach(function (o) {
    if (o.paymentStatus === REPORT_PAYMENT_LUNAS) {
      transaksiLunas++;
      omzetTotal += Number(o.total) || 0;
    } else if (REPORT_PAYMENT_PENDING_GAGAL.indexOf(o.paymentStatus) !== -1) {
      transaksiPendingGagal++;
    } else {
      transaksiBelumDibayar++;
    }
  });

  return {
    jumlahTransaksi: jumlahTransaksi,
    omzetTotal: omzetTotal,
    transaksiLunas: transaksiLunas,
    transaksiPendingGagal: transaksiPendingGagal,
    transaksiBelumDibayar: transaksiBelumDibayar,
    jumlahLayananTerjual: jumlahTransaksi // satu order = satu layanan pada skema order saat ini
  };
}

/**
 * Rekap per layanan: nama layanan -> jumlah terjual & omzet (hanya yang Lunas).
 * Dikembalikan sebagai array supaya urut berdasarkan jumlah terjual terbanyak.
 */
function hitungRekapLayanan(orders) {
  var peta = {};

  orders.forEach(function (o) {
    var nama = o.serviceName || "(Tanpa Nama Layanan)";
    if (!peta[nama]) {
      peta[nama] = { namaLayanan: nama, jumlahTerjual: 0, omzetLunas: 0 };
    }
    if (o.paymentStatus === REPORT_PAYMENT_LUNAS && o.serviceStatus !== "Dibatalkan") {
      peta[nama].jumlahTerjual++;
      peta[nama].omzetLunas += Number(o.total) || 0;
    }
  });

  return Object.keys(peta)
    .map(function (nama) { return peta[nama]; })
    .sort(function (a, b) { return b.jumlahTerjual - a.jumlahTerjual; });
}

// ---------- Render tampilan ----------

function renderRingkasanLaporan(ringkasan) {
  document.getElementById("reportStatTransaksi").textContent = ringkasan.jumlahTransaksi;
  document.getElementById("reportStatOmzet").textContent = formatRupiah(ringkasan.omzetTotal);
  document.getElementById("reportStatLunas").textContent = ringkasan.transaksiLunas;
  document.getElementById("reportStatPendingGagal").textContent = ringkasan.transaksiPendingGagal;
  document.getElementById("reportStatLayanan").textContent = ringkasan.jumlahLayananTerjual;
}

function renderRekapLayananTable(rekapLayanan) {
  var tbody = document.getElementById("reportServiceTableBody");
  var emptyState = document.getElementById("reportServiceEmptyState");

  if (rekapLayanan.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  tbody.innerHTML = rekapLayanan.map(function (r) {
    return (
      "<tr>" +
        "<td>" + escapeHtml(r.namaLayanan) + "</td>" +
        "<td>" + r.jumlahTerjual + "</td>" +
        "<td>" + formatRupiah(r.omzetLunas) + "</td>" +
      "</tr>"
    );
  }).join("");
}

function reportOrderRowTemplate(o) {
  return (
    "<tr>" +
      "<td>" + escapeHtml(o.serviceCode) + "</td>" +
      "<td>" + formatDateIndonesia(o.createdAt) + "</td>" +
      "<td>" + escapeHtml(o.customerName) + "</td>" +
      "<td>" + escapeHtml(o.serviceName) + "</td>" +
      "<td>" + (o.deliveryMethod === "pickup" ? "Dijemput Kurir" : "Antar Sendiri") + "</td>" +
      "<td>" + escapeHtml(o.paymentStatus) + "</td>" +
      "<td>" + escapeHtml(o.serviceStatus) + "</td>" +
      "<td>" + formatRupiah(o.total) + "</td>" +
    "</tr>"
  );
}

function renderTabelDetailLaporan(orders) {
  var tbody = document.getElementById("reportTableBody");
  var emptyState = document.getElementById("reportEmptyState");

  var terurut = orders.slice().sort(function (a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  if (terurut.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  tbody.innerHTML = terurut.map(reportOrderRowTemplate).join("");
}

// ---------- State halaman & render utama ----------

var reportStateTerkini = null; // { periode, tanggalReferensi, orders, rentang, ringkasan, rekapLayanan }

function ambilInputLaporan() {
  var periodeSelect = document.getElementById("reportPeriodeSelect");
  var refDateInput = document.getElementById("reportRefDateInput");

  var periode = periodeSelect ? periodeSelect.value : "bulan";
  var tanggalReferensi = parseTanggalReferensi(refDateInput ? refDateInput.value : "");

  return { periode: periode, tanggalReferensi: tanggalReferensi };
}

function renderLaporan() {
  var input = ambilInputLaporan();
  var hasil = ambilOrderPeriodeLaporan(input.periode, input.tanggalReferensi);
  var ringkasan = hitungRingkasanLaporan(hasil.orders);
  var rekapLayanan = hitungRekapLayanan(hasil.orders);

  document.getElementById("reportRangeLabel").textContent =
    formatRentangLabel(input.periode, hasil.rentang.start, hasil.rentang.end);

  renderRingkasanLaporan(ringkasan);
  renderRekapLayananTable(rekapLayanan);
  renderTabelDetailLaporan(hasil.orders);

  reportStateTerkini = {
    periode: input.periode,
    tanggalReferensi: input.tanggalReferensi,
    orders: hasil.orders,
    rentang: hasil.rentang,
    ringkasan: ringkasan,
    rekapLayanan: rekapLayanan
  };
}

// ---------- Export Excel (SheetJS + xlsx-js-style) ----------
// Catatan: styling (bold/warna/border) hanya benar-benar tampil kalau library
// yang termuat adalah "xlsx-js-style" (lihat <script> di admin-reports.html).
// Kalau fallback ke SheetJS polos yang termuat, workbook tetap valid & angka
// tetap numerik/rapi, cuma tanpa warna/bold (browser lama/CDN gagal, dsb).
// reportStylingAktif dicek sekali saat export supaya tidak berulang kali
// bikin objek style kalau ternyata tidak didukung.

var REPORT_WARNA_NAVY = "0C2340";
var REPORT_WARNA_TEAL = "17B3A3";
var REPORT_WARNA_PUTIH = "FFFFFF";
var REPORT_WARNA_ZEBRA = "F4F6F8";
var REPORT_WARNA_BORDER = "D9D9D9";
var REPORT_FORMAT_RUPIAH = '"Rp" #,##0';

var REPORT_BORDER_TIPIS = { style: "thin", color: { rgb: REPORT_WARNA_BORDER } };
var REPORT_BORDER_SEKELILING = {
  top: REPORT_BORDER_TIPIS, bottom: REPORT_BORDER_TIPIS,
  left: REPORT_BORDER_TIPIS, right: REPORT_BORDER_TIPIS
};

function dukungStylingExcel() {
  // xlsx-js-style menandai dirinya lewat properti "style_version" pada objek XLSX.
  return typeof XLSX !== "undefined" && !!XLSX.style_version;
}

function styleHeaderSel() {
  return {
    font: { bold: true, color: { rgb: REPORT_WARNA_PUTIH } },
    fill: { patternType: "solid", fgColor: { rgb: REPORT_WARNA_NAVY } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: REPORT_BORDER_SEKELILING
  };
}

function styleDataSel(zebra, opsi) {
  opsi = opsi || {};
  return {
    font: { bold: !!opsi.bold },
    fill: zebra ? { patternType: "solid", fgColor: { rgb: REPORT_WARNA_ZEBRA } } : undefined,
    alignment: { horizontal: opsi.align || "left", vertical: "center" },
    numFmt: opsi.rupiah ? REPORT_FORMAT_RUPIAH : undefined,
    border: REPORT_BORDER_SEKELILING
  };
}

function styleJudulSel() {
  return { font: { bold: true, sz: 14, color: { rgb: REPORT_WARNA_NAVY } } };
}

function styleLabelSel() {
  return { font: { bold: true }, alignment: { horizontal: "left" } };
}

function styleSubjudulSel() {
  return {
    font: { bold: true, color: { rgb: REPORT_WARNA_PUTIH } },
    fill: { patternType: "solid", fgColor: { rgb: REPORT_WARNA_TEAL } },
    alignment: { horizontal: "left", vertical: "center" }
  };
}

/**
 * Terapkan style ke satu sel worksheet berdasarkan koordinat baris/kolom
 * (0-based). Tidak melakukan apa-apa kalau library aktif tidak mendukung
 * styling, supaya tetap aman dipakai di kedua mode (styled/fallback).
 */
function terapkanStyleSel(ws, baris, kolom, style) {
  if (!style) return;
  var ref = XLSX.utils.encode_cell({ r: baris, c: kolom });
  if (!ws[ref]) ws[ref] = { t: "z", v: "" };
  ws[ref].s = style;
}

function bangunSheetRingkasan(state) {
  var rentangLabel = formatRentangLabel(state.periode, state.rentang.start, state.rentang.end);
  var styling = dukungStylingExcel();

  var rows = [
    ["LAPORAN TRANSAKSI FIXIN", ""],
    ["", ""],
    ["Periode", REPORT_PERIODE_LABEL[state.periode] || state.periode],
    ["Tanggal Referensi", formatDateIndonesia(state.tanggalReferensi)],
    ["Rentang Tanggal", rentangLabel],
    ["", ""],
    ["RINGKASAN ANGKA", ""],
    ["Jumlah Transaksi", state.ringkasan.jumlahTransaksi],
    ["Omzet Total (Rp)", state.ringkasan.omzetTotal],
    ["Transaksi Lunas", state.ringkasan.transaksiLunas],
    ["Transaksi Pending/Gagal", state.ringkasan.transaksiPendingGagal],
    ["Transaksi Belum Dibayar", state.ringkasan.transaksiBelumDibayar],
    ["Jumlah Layanan Terjual", state.ringkasan.jumlahLayananTerjual]
  ];

  var ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 26 }, { wch: 24 }];

  if (styling) {
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
      { s: { r: 6, c: 0 }, e: { r: 6, c: 1 } }
    ];

    terapkanStyleSel(ws, 0, 0, styleJudulSel());
    terapkanStyleSel(ws, 6, 0, styleSubjudulSel());
    terapkanStyleSel(ws, 6, 1, styleSubjudulSel());

    [2, 3, 4].forEach(function (r) { terapkanStyleSel(ws, r, 0, styleLabelSel()); });

    for (var r = 7; r <= 12; r++) {
      terapkanStyleSel(ws, r, 0, styleLabelSel());
      var rupiah = r === 8; // baris "Omzet Total (Rp)"
      terapkanStyleSel(ws, r, 1, styleDataSel(false, { align: "right", rupiah: rupiah }));
    }
  }

  return ws;
}

function bangunSheetTransaksi(state) {
  var header = [
    "No", "Kode Servis", "Tanggal Transaksi", "Customer", "Kontak", "Layanan",
    "Metode", "Status Pembayaran", "Status Servis", "Total (Rp)"
  ];

  var terurut = state.orders.slice().sort(function (a, b) {
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  var rows = terurut.map(function (o, idx) {
    return [
      idx + 1,
      o.serviceCode || "",
      formatDateIndonesia(o.createdAt),
      o.customerName || "",
      o.phone || "",
      o.serviceName || "",
      o.deliveryMethod === "pickup" ? "Dijemput Kurir" : "Antar Sendiri",
      o.paymentStatus || "",
      o.serviceStatus || "",
      Number(o.total) || 0 // numerik, bukan string "Rp"
    ];
  });

  var ws = XLSX.utils.aoa_to_sheet([header].concat(rows));
  ws["!cols"] = [
    { wch: 5 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 15 },
    { wch: 24 }, { wch: 15 }, { wch: 16 }, { wch: 18 }, { wch: 15 }
  ];
  ws["!autofilter"] = { ref: "A1:J1" };
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", state: "frozen" };

  if (dukungStylingExcel()) {
    header.forEach(function (_, c) { terapkanStyleSel(ws, 0, c, styleHeaderSel()); });

    rows.forEach(function (row, idx) {
      var baris = idx + 1;
      var zebra = idx % 2 === 1;
      row.forEach(function (_, kolom) {
        var kananRata = kolom === 0 || kolom === 9;
        terapkanStyleSel(ws, baris, kolom, styleDataSel(zebra, {
          align: kananRata ? "right" : "left",
          rupiah: kolom === 9
        }));
      });
    });
  }

  return ws;
}

function bangunSheetLayanan(state) {
  var header = ["Nama Layanan", "Jumlah Terjual", "Omzet Lunas (Rp)"];

  var rows = state.rekapLayanan.map(function (r) {
    return [r.namaLayanan, r.jumlahTerjual, r.omzetLunas];
  });

  var ws = XLSX.utils.aoa_to_sheet([header].concat(rows));
  ws["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 18 }];
  ws["!autofilter"] = { ref: "A1:C1" };
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", state: "frozen" };

  if (dukungStylingExcel()) {
    header.forEach(function (_, c) { terapkanStyleSel(ws, 0, c, styleHeaderSel()); });

    rows.forEach(function (row, idx) {
      var baris = idx + 1;
      var zebra = idx % 2 === 1;
      row.forEach(function (_, kolom) {
        terapkanStyleSel(ws, baris, kolom, styleDataSel(zebra, {
          align: kolom === 0 ? "left" : "right",
          rupiah: kolom === 2
        }));
      });
    });
  }

  return ws;
}

function namaFileLaporan(state) {
  var periodeFile = REPORT_PERIODE_FILENAME[state.periode] || state.periode.toUpperCase();
  var tanggalFile = toFilenameDateValue(state.tanggalReferensi);
  return "FIXIN-Laporan-" + periodeFile + "-" + tanggalFile + ".xlsx";
}

function exportLaporanExcel() {
  if (!reportStateTerkini) return;
  if (typeof XLSX === "undefined") {
    showReportToast("Gagal export: pustaka Excel belum termuat. Cek koneksi internet.");
    return;
  }

  var state = reportStateTerkini;
  var wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, bangunSheetRingkasan(state), "Ringkasan");
  XLSX.utils.book_append_sheet(wb, bangunSheetTransaksi(state), "Transaksi");
  XLSX.utils.book_append_sheet(wb, bangunSheetLayanan(state), "Layanan");

  XLSX.writeFile(wb, namaFileLaporan(state));
  showReportToast("Laporan berhasil diexport.");
}

// ---------- Live refresh lintas tab ----------

function refreshReportLive() {
  if (!document.getElementById("adminReportsPage")) return;
  renderLaporan();
}

window.addEventListener("storage", function (e) {
  if (e.key === FIXIN_KEYS.ORDERS || e.key === null) {
    refreshReportLive();
  }
});

// ---------- Toast kecil (tanpa bergantung ke products.js) ----------

var reportToastTimer = null;

function showReportToast(message) {
  var toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(reportToastTimer);
  reportToastTimer = setTimeout(function () {
    toast.classList.remove("show");
  }, 2800);
}

// ---------- Init ----------

document.addEventListener("DOMContentLoaded", function () {
  if (!document.getElementById("adminReportsPage")) return; // bukan halaman laporan, skip

  var session = requireRole("admin");
  if (!session) return; // sudah di-redirect sama requireRole

  var welcome = document.getElementById("adminWelcome");
  if (welcome) welcome.textContent = session.name;

  var periodeSelect = document.getElementById("reportPeriodeSelect");
  var refDateInput = document.getElementById("reportRefDateInput");
  var exportBtn = document.getElementById("exportReportBtn");

  if (refDateInput) refDateInput.value = toInputDateValue(new Date());

  renderLaporan();

  if (periodeSelect) periodeSelect.addEventListener("change", renderLaporan);
  if (refDateInput) refDateInput.addEventListener("change", renderLaporan);
  if (exportBtn) exportBtn.addEventListener("click", exportLaporanExcel);
});


