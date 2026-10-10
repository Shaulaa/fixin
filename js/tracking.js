// tracking.js - cari & tampilkan status servis berdasarkan kode
//
// Order lama (dibuat sebelum tahap booking baru) memakai field
// "kode" & "status" (diterima/diproses/selesai). Order baru (dari
// js/booking.js hasil tahap booking antar/jemput) memakai
// "serviceCode" & "serviceStatus" (Menunggu Konfirmasi, Diterima,
// Dijemput, Dalam Pemeriksaan, Dalam Perbaikan, Selesai,
// Diantar Kembali, Diterima Pelanggan, Dibatalkan). Fungsi di bawah
// mendukung kedua skema supaya fitur lacak servis tetap jalan untuk
// order lama maupun baru.

function cariOrder(kode) {
  var orders = typeof getOrders === "function" ? getOrders() : JSON.parse(localStorage.getItem("fixin_orders") || "[]");
  var kodeCari = kode.toLowerCase();
  for (var i = 0; i < orders.length; i++) {
    var kodeOrder = orders[i].serviceCode || orders[i].kode || "";
    if (kodeOrder.toLowerCase() === kodeCari) {
      return { data: orders[i], index: i };
    }
  }
  return null;
}

// Petakan status baru (9 status) ke 3 tahap timeline lama (diterima/diproses/selesai).
function petakanServiceStatusKeStep(serviceStatus) {
  var petaSelesai = ["Selesai", "Diantar Kembali", "Diterima Pelanggan"];
  var petaProses = ["Diterima", "Dijemput", "Dalam Pemeriksaan", "Dalam Perbaikan"];

  if (petaSelesai.indexOf(serviceStatus) !== -1) return 2;
  if (petaProses.indexOf(serviceStatus) !== -1) return 1;
  return -1; // "Menunggu Konfirmasi", "Dibatalkan", atau status tak dikenal
}

// Mapping status ke 6 langkah timeline V2
var TIMELINE_V2_STEPS = ["diterima", "diagnosis", "persetujuan", "dikerjakan", "selesai", "diambil"];

function petakanStatusKeTimelineV2(order) {
  var isSkemaBaru = !!order.serviceCode;
  if (!isSkemaBaru) {
    // Skema lama: petakan 3 status ke 6 langkah
    var old = ["diterima", "diproses", "selesai"];
    var idx = old.indexOf(order.status);
    if (idx === 0) return 0; // diterima
    if (idx === 1) return 3; // dikerjakan
    if (idx === 2) return 5; // diambil
    return -1;
  }
  // Skema baru
  var statusMap = {
    "Menunggu Konfirmasi": -1,
    "Diterima": 0,
    "Dijemput": 0,
    "Perangkat Diterima": 0,
    "Dalam Pemeriksaan": 1,
    "Diagnosis": 1,
    "Menunggu Persetujuan": 2,
    "Dalam Perbaikan": 3,
    "Sedang Dikerjakan": 3,
    "Selesai": 4,
    "Siap Diambil": 5,
    "Diantar Kembali": 5,
    "Diterima Pelanggan": 5,
    "Dibatalkan": -1
  };
  var s = order.serviceStatus || "";
  return statusMap.hasOwnProperty(s) ? statusMap[s] : -1;
}

function tampilkanHasil(order) {
  var result = document.getElementById("trackingResult");
  var notFound = document.getElementById("trackingNotFound");

  if (!order) {
    result.classList.remove("show");
    notFound.style.display = "block";
    return;
  }

  notFound.style.display = "none";

  var isSkemaBaru = !!order.serviceCode;

  document.getElementById("resKode").textContent = order.serviceCode || order.kode;
  document.getElementById("resNama").textContent = order.customerName || order.nama || "-";
  document.getElementById("resLayanan").textContent = order.serviceName || order.layanan || "-";
  document.getElementById("resTanggal").textContent = formatDateIndonesia(order.serviceDate || order.tanggal);

  var resMetode = document.getElementById("resMetode");
  var resStatusLabel = document.getElementById("resStatusLabel");

  if (resMetode) {
    if (isSkemaBaru) {
      resMetode.textContent = order.deliveryMethod === "pickup" ? "Dijemput Kurir" : "Antar Sendiri";
      resMetode.parentElement.classList.remove("hidden");
    } else {
      resMetode.parentElement.classList.add("hidden");
    }
  }

  if (resStatusLabel) {
    resStatusLabel.textContent = isSkemaBaru ? order.serviceStatus : "-";
    resStatusLabel.parentElement.classList.toggle("hidden", !isSkemaBaru);
  }

  var currentIndex = isSkemaBaru ? petakanServiceStatusKeStep(order.serviceStatus) : ["diterima", "diproses", "selesai"].indexOf(order.status);

  var steps = ["diterima", "diproses", "selesai"];
  steps.forEach(function (step, i) {
    var el = document.getElementById("step-" + step);
    if (!el) return;
    if (i <= currentIndex) {
      el.classList.add("done");
    } else {
      el.classList.remove("done");
    }
  });

  // Timeline V2 (6 langkah)
  var timelineV2 = document.getElementById("timelineV2");
  if (timelineV2) {
    var v2Index = petakanStatusKeTimelineV2(order);
    var v2Steps = timelineV2.querySelectorAll(".timeline-v2-step");
    for (var j = 0; j < v2Steps.length; j++) {
      v2Steps[j].classList.remove("done", "active");
      if (j < v2Index) {
        v2Steps[j].classList.add("done");
      } else if (j === v2Index) {
        v2Steps[j].classList.add("active");
      }
    }
  }

  // Render Riwayat Status (History)
  var historyContainer = document.getElementById("trackingHistoryContainer");
  var historyList = document.getElementById("trackingHistoryList");
  if (historyContainer && historyList) {
    if (isSkemaBaru && order.serviceHistory && order.serviceHistory.length > 0) {
      historyContainer.classList.remove("hidden");
      // Urutkan dari yang terbaru (reverse)
      var reversedHistory = order.serviceHistory.slice().reverse();
      historyList.innerHTML = reversedHistory.map(function(h, index) {
        var isLatest = index === 0 ? " latest" : "";
        var d = new Date(h.at);
        var timeStr = isNaN(d.getTime()) ? "-" : (formatDateIndonesia(d) + ", " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"));
        return '<li class="tracking-history-item' + isLatest + '">' +
               '<div class="history-time">' + timeStr + '</div>' +
               '<div class="history-status">' + (typeof escapeHtml === "function" ? escapeHtml(h.status) : h.status) + '</div>' +
               '</li>';
      }).join("");
    } else {
      historyContainer.classList.add("hidden");
      historyList.innerHTML = "";
    }
  }

  // Card diagnosis: tampil hanya saat status = Menunggu Persetujuan
  var diagnosisCard = document.getElementById("diagnosisCard");
  if (diagnosisCard) {
    var showDiagnosis = isSkemaBaru && order.serviceStatus === "Menunggu Persetujuan";
    diagnosisCard.style.display = showDiagnosis ? "block" : "none";

    if (showDiagnosis) {
      var getTxt = function (id) { return document.getElementById(id); };
      getTxt("diagResHasil").textContent = order.diagnosisResult || "-";
      getTxt("diagResBiaya").textContent = order.diagnosisCost
        ? (typeof formatRupiah === "function" ? formatRupiah(order.diagnosisCost) : "Rp " + order.diagnosisCost)
        : "-";
      getTxt("diagResWaktu").textContent = order.diagnosisTime || "-";

      var catatanRow = document.getElementById("diagResCatatanRow");
      if (order.diagnosisNote) {
        catatanRow.style.display = "";
        getTxt("diagResCatatan").textContent = order.diagnosisNote;
      } else {
        catatanRow.style.display = "none";
      }

      var btnApprove = document.getElementById("btnSetujuiPerbaikan");
      if (btnApprove) {
        btnApprove.onclick = function () {
          setujuiPerbaikan(order);
        };
      }
    }
  }

  // Tombol simulasi status hanya relevan untuk order skema lama.
  // Untuk order baru, perubahan status dilakukan admin (tahap berikutnya).
  var simulateBtn = document.getElementById("simulateStatus");
  if (simulateBtn) {
    simulateBtn.classList.toggle("hidden", isSkemaBaru);
  }

  result.classList.add("show");
}

var trackingKodeAktif = null;

document.addEventListener("DOMContentLoaded", function () {
  var form = document.getElementById("trackingForm");
  var input = document.getElementById("trackingInput");

  // Auto isi dari query string ?kode=FX-1234 (dari halaman booking)
  var params = new URLSearchParams(window.location.search);
  var kodeAwal = params.get("kode");
  if (kodeAwal) {
    input.value = kodeAwal;
    trackingKodeAktif = kodeAwal;
    var found = cariOrder(kodeAwal);
    tampilkanHasil(found ? found.data : null);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    trackingKodeAktif = input.value.trim();
    var loading = document.getElementById("trackingLoading");
    var result = document.getElementById("trackingResult");
    var notFound = document.getElementById("trackingNotFound");
    
    // Hide old results/not found state before loading
    result.classList.remove("show");
    notFound.style.display = "none";
    
    if (loading) loading.style.display = "block";
    
    setTimeout(function() {
      if (loading) loading.style.display = "none";
      var found = cariOrder(trackingKodeAktif);
      tampilkanHasil(found ? found.data : null);
    }, 400);
  });

  // Live update: kalau admin ubah serviceStatus di tab lain (admin-orders.html),
  // hasil tracking yang lagi ditampilkan ikut disegarkan otomatis tanpa
  // perlu klik "Cek Status" ulang.
  window.addEventListener("storage", function (e) {
    if (!trackingKodeAktif) return;
    if (e.key !== "fixin_orders" && e.key !== null) return;

    var found = cariOrder(trackingKodeAktif);
    tampilkanHasil(found ? found.data : null);
  });

  // Tombol simulasi update status (buat keperluan demo/presentasi tugas)
  var simulateBtn = document.getElementById("simulateStatus");
  if (simulateBtn) {
    simulateBtn.addEventListener("click", function () {
      var found = cariOrder(input.value.trim());
      if (!found) return;

      if (found.data.serviceCode) return; // hanya untuk order skema lama

      var steps = ["diterima", "diproses", "selesai"];
      var orders = typeof getOrders === "function" ? getOrders() : JSON.parse(localStorage.getItem("fixin_orders") || "[]");
      var currentIndex = steps.indexOf(orders[found.index].status);

      if (currentIndex < steps.length - 1) {
        orders[found.index].status = steps[currentIndex + 1];
        if (typeof setOrders === "function") {
          setOrders(orders);
        } else {
          localStorage.setItem("fixin_orders", JSON.stringify(orders));
        }
        tampilkanHasil(orders[found.index]);
      }
    });
  }
});

// ===== Customer approval =====
function setujuiPerbaikan(order) {
  var orders = getOrders();
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].id === order.id) {
      orders[i].serviceStatus = "Sedang Dikerjakan";
      orders[i].updatedAt = new Date().toISOString();
      setOrders(orders);

      var found = cariOrder(order.serviceCode || order.kode);
      tampilkanHasil(found ? found.data : null);
      alert("Perbaikan disetujui! Status sekarang: Sedang Dikerjakan.");
      return;
    }
  }
}
