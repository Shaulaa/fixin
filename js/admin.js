// admin.js - Logika untuk sisi admin (Dashboard, Booking List, Booking Detail)

var ADMIN_STATUSES = [
  "Pending",
  "Menunggu Konfirmasi",
  "Booking Baru",
  "Dikonfirmasi",
  "Diagnosis",
  "Menunggu Persetujuan",
  "Sedang Dikerjakan",
  "Selesai",
  "Siap Diambil"
];

function getUrlParam(param) {
  var urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

function getOrderById(id) {
  var orders = getOrders();
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].id === id) return orders[i];
  }
  return null;
}

function updateOrderStatus(id, status, extraData) {
  var orders = getOrders();
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].id === id) {
      if (orders[i].paymentStatus !== "Lunas" && status !== "Pending" && status !== "Dibatalkan") return null;
      if (status === "Pending" && orders[i].paymentStatus === "Lunas") return null;
      orders[i].serviceStatus = status;
      orders[i].updatedAt = new Date().toISOString();
      if (extraData) {
        if (extraData.diagnosisResult) orders[i].diagnosisResult = extraData.diagnosisResult;
        if (extraData.diagnosisCost) orders[i].diagnosisCost = extraData.diagnosisCost;
        if (extraData.diagnosisTime) orders[i].diagnosisTime = extraData.diagnosisTime;
        if (extraData.diagnosisNote) orders[i].diagnosisNote = extraData.diagnosisNote;
      }
      setOrders(orders);
      return orders[i];
    }
  }
  return null;
}

function statusBadgeClass(status) {
  if (status === "Pending" || status === "Menunggu Konfirmasi" || status === "Booking Baru" || status === "Menunggu Persetujuan") return "status-warning";
  if (status === "Selesai" || status === "Siap Diambil") return "status-active";
  if (status === "Dikonfirmasi" || status === "Diagnosis" || status === "Sedang Dikerjakan") return "status-info";
  return "";
}

function parseTanggalLaporan(tanggal) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null;
  var parts = tanggal.split("-").map(Number);
  var day = new Date(parts[0], parts[1] - 1, parts[2]);
  if (day.getFullYear() !== parts[0] || day.getMonth() !== parts[1] - 1 || day.getDate() !== parts[2]) return null;
  return day;
}

function orderDalamRentang(createdAt, tanggalMulai, tanggalAkhir) {
  var start = parseTanggalLaporan(tanggalMulai);
  var end = parseTanggalLaporan(tanggalAkhir);
  if (!start || !end || start > end) return false;
  var created = /^\d{4}-\d{2}-\d{2}$/.test(createdAt) ? parseTanggalLaporan(createdAt) : new Date(createdAt);
  if (!created) return false;
  end.setDate(end.getDate() + 1);
  return created >= start && created < end;
}

function orderPadaTanggal(createdAt, tanggal) {
  return orderDalamRentang(createdAt, tanggal, tanggal);
}

document.addEventListener("DOMContentLoaded", function () {
  var session = requireRole("admin");
  if (!session) return;

  var isDashboard = document.getElementById("adminDashboardPage");
  var isBookingList = document.getElementById("adminBookingPage");
  var isBookingDetail = document.getElementById("adminBookingDetailPage");
  var isReports = document.getElementById("adminReportsPage");
  var isProducts = document.getElementById("adminProductsPage");

  // REPORTS
  if (isReports) {
    var filterPeriode = document.getElementById("filterPeriode");
    var filterTanggal = document.getElementById("filterTanggal");
    var filterTanggalField = document.getElementById("filterTanggalField");
    var filterTanggalMulai = document.getElementById("filterTanggalMulai");
    var filterTanggalAkhir = document.getElementById("filterTanggalAkhir");
    var filterStatus = document.getElementById("filterStatus");
    var filterDevice = document.getElementById("filterDevice");
    var filterService = document.getElementById("filterService");
    var btnFilter = document.getElementById("btnFilter");
    var btnResetFilter = document.getElementById("btnResetFilter");
    var btnExportExcel = document.getElementById("btnExportExcel");

    var currentFilteredData = [];
    var currentPeriodeLabel = "";
    var currentTanggal = "";

    function resetTanggal() {
      var today = new Date();
      filterTanggal.value = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
      filterTanggalMulai.value = filterTanggal.value;
      filterTanggalAkhir.value = filterTanggal.value;
      filterTanggalAkhir.setCustomValidity("");
    }

    function toggleTanggal() {
      var pilihTanggal = filterPeriode.value === "tanggal";
      filterTanggalField.hidden = !pilihTanggal;
      filterTanggal.disabled = !pilihTanggal;
      var pilihRentang = filterPeriode.value === "rentang";
      document.getElementById("filterTanggalMulaiField").hidden = !pilihRentang;
      document.getElementById("filterTanggalAkhirField").hidden = !pilihRentang;
      filterTanggalMulai.disabled = !pilihRentang;
      filterTanggalAkhir.disabled = !pilihRentang;
    }

    resetTanggal();
    toggleTanggal();
    filterPeriode.addEventListener("change", toggleTanggal);
    [filterTanggalMulai, filterTanggalAkhir].forEach(function (input) {
      input.addEventListener("input", function () { filterTanggalAkhir.setCustomValidity(""); });
    });

    // Init select options
    ADMIN_STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      filterStatus.appendChild(opt);
    });

    var products = getProducts();
    products.forEach(function (p) {
      if (p.active) {
        var opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = p.name;
        filterService.appendChild(opt);
      }
    });

    function renderReports() {
      var orders = getOrders();
      var fPeriode = filterPeriode.value;
      if (fPeriode === "tanggal" && !filterTanggal.reportValidity()) return;
      if (fPeriode === "rentang") {
        filterTanggalAkhir.setCustomValidity(filterTanggalMulai.value > filterTanggalAkhir.value ? "Tanggal akhir harus sama dengan atau setelah tanggal mulai." : "");
        if (!filterTanggalMulai.reportValidity() || !filterTanggalAkhir.reportValidity()) return;
      }
      var fStatus = filterStatus.value;
      var fDevice = filterDevice.value;
      var fService = filterService.value;
      var now = new Date();

      var filtered = orders.filter(function(o) {
        var d = new Date(o.createdAt);

        // Periode
        if (fPeriode === "rentang") {
          if (!orderDalamRentang(o.createdAt, filterTanggalMulai.value, filterTanggalAkhir.value)) return false;
        } else if (fPeriode === "tanggal") {
          if (!orderPadaTanggal(o.createdAt, filterTanggal.value)) return false;
        } else if (fPeriode === "harian") {
          if (!(d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear())) return false;
        } else if (fPeriode === "mingguan") {
          var msInWeek = 7 * 24 * 60 * 60 * 1000;
          if ((now - d) > msInWeek) return false;
        } else if (fPeriode === "bulanan") {
          if (!(d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear())) return false;
        } else if (fPeriode === "tahunan") {
          if (d.getFullYear() !== now.getFullYear()) return false;
        }

        // Status
        var s = o.serviceStatus || "Booking Baru";
        if (fStatus !== "Semua" && s !== fStatus) return false;

        // Device
        var dev = o.deviceType || "Lainnya";
        if (fDevice !== "Semua") {
          if (fDevice === "HP" && dev.toLowerCase().indexOf("hp") === -1 && dev.toLowerCase().indexOf("smartphone") === -1) return false;
          else if (fDevice !== "HP" && dev.toLowerCase().indexOf(fDevice.toLowerCase()) === -1) return false;
        }

        // Service
        if (fService !== "Semua" && o.serviceName !== fService) return false;

        return true;
      });

      // Simpan untuk export
      filtered.sort(function(a,b) { return new Date(a.createdAt) - new Date(b.createdAt); });
      currentFilteredData = filtered;
      currentTanggal = fPeriode === "tanggal" ? filterTanggal.value : "";
      currentPeriodeLabel = currentTanggal ? "Tanggal " + formatDateIndonesia(currentTanggal) : filterPeriode.options[filterPeriode.selectedIndex].text;
      if (fPeriode === "rentang") {
        currentTanggal = filterTanggalMulai.value + "_sampai_" + filterTanggalAkhir.value;
        currentPeriodeLabel = formatDateIndonesia(filterTanggalMulai.value) + " sampai " + formatDateIndonesia(filterTanggalAkhir.value);
      }
      document.getElementById("reportAppliedPeriod").textContent = "Laporan: " + currentPeriodeLabel;

      var totalBooking = filtered.length;
      var totalSelesai = 0;
      var totalDiproses = 0;
      var totalPendapatan = 0;

      var statCounts = {};
      ADMIN_STATUSES.forEach(function(s) { statCounts[s] = 0; });

      var tbody = document.getElementById("laporanTableBody");
      var empty = document.getElementById("laporanEmptyState");

      if (filtered.length === 0) {
        tbody.innerHTML = "";
        empty.style.display = "block";
      } else {
        empty.style.display = "none";
        tbody.innerHTML = filtered.map(function(o, index) {
          var status = o.serviceStatus || "Booking Baru";
          var isDone = (status === "Selesai" || status === "Siap Diambil");
          var biaya = Number(o.diagnosisCost) || 0;

          if (statCounts[status] !== undefined) statCounts[status]++;

          if (isDone) {
            totalSelesai++;
            totalPendapatan += biaya;
          } else if (["Pending", "Menunggu Konfirmasi", "Booking Baru"].indexOf(status) === -1) {
            totalDiproses++;
          }

          var tglSelesai = "-";
          if (isDone && o.updatedAt) {
             tglSelesai = formatDateIndonesia(o.updatedAt);
          }

          return "<tr>" +
            "<td>" + (index + 1) + "</td>" +
            "<td>" + escapeHtml(o.serviceCode) + "</td>" +
            "<td>" + formatDateIndonesia(o.createdAt) + "</td>" +
            "<td>" + escapeHtml(o.customerName) + "</td>" +
            "<td>" + escapeHtml(o.deviceType || "-") + "</td>" +
            "<td>" + escapeHtml(o.serviceName) + "</td>" +
            "<td><span class='status-badge " + statusBadgeClass(status) + "'>" + escapeHtml(status) + "</span></td>" +
            "<td>" + (isDone ? formatRupiah(biaya) : (biaya ? formatRupiah(biaya) + " (Est)" : "Rp0")) + "</td>" +
            "<td>" + tglSelesai + "</td>" +
            "</tr>";
        }).join("");
      }

      document.getElementById("lapTotalBooking").textContent = totalBooking;
      document.getElementById("lapSelesai").textContent = totalSelesai;
      document.getElementById("lapDiproses").textContent = totalDiproses;
      document.getElementById("lapPendapatan").textContent = formatRupiah(totalPendapatan);
      document.getElementById("tfootTotalPendapatan").textContent = formatRupiah(totalPendapatan);

      var sumWrap = document.getElementById("statusSummaryWrap");
      var sumHtml = "";
      ADMIN_STATUSES.forEach(function(s) {
         if (statCounts[s] > 0) {
           sumHtml += "<div style='background:var(--bg-card); border:1px solid var(--gray-border); padding:6px 12px; border-radius:4px;'>" + s + ": <strong>" + statCounts[s] + "</strong></div>";
         }
      });
      if (!sumHtml) sumHtml = "<span style='color:var(--text-muted);'>Tidak ada data</span>";
      sumWrap.innerHTML = sumHtml;
    }

    btnFilter.addEventListener("click", renderReports);

    btnResetFilter.addEventListener("click", function() {
      filterPeriode.value = "bulanan";
      filterStatus.value = "Semua";
      filterDevice.value = "Semua";
      filterService.value = "Semua";
      resetTanggal();
      toggleTanggal();
      renderReports();
    });

    btnExportExcel.addEventListener("click", function() {
       if (currentFilteredData.length === 0) {
          alert("Tidak ada data untuk diexport.");
          return;
       }

       if (typeof ExcelJS === "undefined") {
          alert("Library ExcelJS gagal dimuat. Periksa koneksi internet.");
          return;
       }

       var workbook = new ExcelJS.Workbook();
       var sheet = workbook.addWorksheet('Laporan Servis');

       // Styling defaults
       sheet.properties.defaultRowHeight = 20;

       // Header: Judul
       sheet.mergeCells('A1:I1');
       var titleCell = sheet.getCell('A1');
       titleCell.value = 'LAPORAN SERVIS FIXIN';
       titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF004E64' } }; // FIXIN Teal
       titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

       // Header: Subjudul/Periode
       sheet.mergeCells('A2:I2');
       var subTitleCell = sheet.getCell('A2');
       subTitleCell.value = currentPeriodeLabel + ' (Dicetak: ' + formatDateIndonesia(new Date().toISOString()) + ')';
       subTitleCell.font = { name: 'Arial', size: 10, italic: true };
       subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };

       sheet.addRow([]); // Spacer

       // Ringkasan
       sheet.getCell('A4').value = 'Ringkasan Laporan';
       sheet.getCell('A4').font = { bold: true };

       var totalBooking = document.getElementById("lapTotalBooking").textContent;
       var totalDiproses = document.getElementById("lapDiproses").textContent;
       var totalSelesai = document.getElementById("lapSelesai").textContent;
       var totalPend = document.getElementById("lapPendapatan").textContent;

       sheet.getCell('A5').value = 'Total Booking:';
       sheet.getCell('B5').value = totalBooking;

       sheet.getCell('A6').value = 'Sedang Diproses:';
       sheet.getCell('B6').value = totalDiproses;

       sheet.getCell('A7').value = 'Servis Selesai:';
       sheet.getCell('B7').value = totalSelesai;

       sheet.getCell('A8').value = 'Total Pendapatan:';
       sheet.getCell('B8').value = totalPend;
       sheet.getCell('B8').font = { bold: true };

       sheet.addRow([]); // Spacer

       // Tabel Header
       var headerRow = sheet.addRow(['No', 'Kode Servis', 'Tanggal Masuk', 'Customer', 'Perangkat', 'Layanan', 'Status', 'Biaya Servis', 'Tanggal Selesai']);
       headerRow.eachCell(function(cell) {
         cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004E64' } };
         cell.alignment = { vertical: 'middle', horizontal: 'center' };
         cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
       });

       // Data Rows
       currentFilteredData.forEach(function(o, idx) {
          var status = o.serviceStatus || "Booking Baru";
          var isDone = (status === "Selesai" || status === "Siap Diambil");
          var biaya = Number(o.diagnosisCost) || 0;

          var biayaVal = isDone ? biaya : 0;
          var tglSelesai = isDone && o.updatedAt ? formatDateIndonesia(o.updatedAt) : "-";

          var row = sheet.addRow([
            idx + 1,
            o.serviceCode,
            formatDateIndonesia(o.createdAt),
            o.customerName,
            o.deviceType || "-",
            o.serviceName,
            status,
            biayaVal,
            tglSelesai
          ]);

          row.eachCell(function(cell, colNumber) {
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            cell.alignment = { vertical: 'middle' };
            // Format accounting/currency for biaya
            if (colNumber === 8) {
               cell.numFmt = '_("Rp"* #,##0_);_("Rp"* -#,##0_);_("Rp"* "-"_);_(@_)';
            }
          });
       });

       // Total Row at bottom
       var lastRow = sheet.addRow(['', '', '', '', '', '', 'TOTAL PENDAPATAN', document.getElementById("lapPendapatan").textContent.replace(/[^0-9]/g, '') * 1, '']);
       lastRow.eachCell(function(cell, colNumber) {
         cell.font = { bold: true };
         if (colNumber === 7) cell.alignment = { horizontal: 'right' };
         if (colNumber === 8) cell.numFmt = '_("Rp"* #,##0_);_("Rp"* -#,##0_);_("Rp"* "-"_);_(@_)';
       });

       // Auto width columns
       sheet.columns = [
         { width: 5 },  // No
         { width: 15 }, // Kode
         { width: 18 }, // Tgl Masuk
         { width: 25 }, // Customer
         { width: 15 }, // Perangkat
         { width: 25 }, // Layanan
         { width: 20 }, // Status
         { width: 15 }, // Biaya
         { width: 18 }  // Tgl Selesai
       ];

       workbook.xlsx.writeBuffer().then(function(buffer) {
         var blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
         var link = document.createElement('a');
         link.href = URL.createObjectURL(blob);
         link.download = 'Laporan_FIXIN_' + (currentTanggal ? currentTanggal + '_' : '') + Date.now() + '.xlsx';
         link.click();
         URL.revokeObjectURL(link.href);
       });
    });

    renderReports();
  }

  // PRODUCTS
  if (isProducts) {
    var modal = document.getElementById("modalProduct");
    var form = document.getElementById("formProduct");
    var idField = document.getElementById("prodId");

    function showModal(prod) {
      if (prod) {
        document.getElementById("modalProductTitle").textContent = "Edit Layanan";
        idField.value = prod.id;
        document.getElementById("prodName").value = prod.name;
        document.getElementById("prodCat").value = prod.category;
        document.getElementById("prodTime").value = prod.estimatedTime;
        document.getElementById("prodPrice").value = prod.price;
        document.getElementById("prodDesc").value = prod.description;
        document.getElementById("prodActive").checked = prod.active;
      } else {
        document.getElementById("modalProductTitle").textContent = "Tambah Layanan";
        idField.value = "";
        form.reset();
        document.getElementById("prodActive").checked = true;
      }
      modal.classList.add("show");
    }

    function hideModal() {
      modal.classList.remove("show");
      form.reset();
    }

    document.getElementById("btnTambahProduk").addEventListener("click", function() { showModal(null); });
    document.getElementById("btnCloseProduct").addEventListener("click", hideModal);
    document.getElementById("btnCancelProduct").addEventListener("click", hideModal);

    form.addEventListener("submit", function(e) {
      e.preventDefault();
      var products = getProducts();
      var isNew = !idField.value;

      var newProd = {
        id: isNew ? generateId("PRD") : idField.value,
        name: document.getElementById("prodName").value.trim(),
        category: document.getElementById("prodCat").value,
        estimatedTime: document.getElementById("prodTime").value.trim(),
        price: Number(document.getElementById("prodPrice").value),
        description: document.getElementById("prodDesc").value.trim(),
        active: document.getElementById("prodActive").checked
      };

      if (isNew) {
        products.push(newProd);
      } else {
        for (var i = 0; i < products.length; i++) {
          if (products[i].id === newProd.id) {
            products[i] = newProd;
            break;
          }
        }
      }

      setProducts(products);
      hideModal();
      renderProducts();
    });

    window.editProduct = function(id) {
      var prod = null;
      var products = getProducts();
      for (var i = 0; i < products.length; i++) {
        if (products[i].id === id) prod = products[i];
      }
      if (prod) showModal(prod);
    };

    window.deleteProduct = function(id) {
      if (confirm("Yakin ingin menghapus layanan ini?")) {
        var products = getProducts();
        var kept = [];
        for (var i = 0; i < products.length; i++) {
          if (products[i].id !== id) kept.push(products[i]);
        }
        setProducts(kept);
        renderProducts();
      }
    };

    function renderProducts() {
      var products = getProducts();
      var tbody = document.getElementById("productsTableBody");
      var empty = document.getElementById("productsEmptyState");

      if (products.length === 0) {
        tbody.innerHTML = "";
        empty.style.display = "block";
      } else {
        empty.style.display = "none";
        tbody.innerHTML = products.map(function(p) {
          return "<tr>" +
            "<td data-label='ID'>" + p.id + "</td>" +
            "<td data-label='Layanan'><strong>" + escapeHtml(p.name) + "</strong></td>" +
            "<td data-label='Kategori'>" + escapeHtml(p.category) + "</td>" +
            "<td data-label='Waktu'>" + escapeHtml(p.estimatedTime) + "</td>" +
            "<td data-label='Harga'>" + formatRupiah(p.price) + "</td>" +
            "<td data-label='Status'><span class='status-badge " + (p.active ? "status-active" : "status-inactive") + "'>" + (p.active ? "Aktif" : "Nonaktif") + "</span></td>" +
            "<td data-label='Aksi'>" +
              "<button type='button' onclick='editProduct(\"" + p.id + "\")' class='btn-link'>Edit</button> | " +
              "<button type='button' onclick='deleteProduct(\"" + p.id + "\")' class='btn-link btn-link-danger'>Hapus</button>" +
            "</td>" +
            "</tr>";
        }).join("");
      }
    }
    renderProducts();
  }

  // DASHBOARD
  if (isDashboard) {
    function renderDashboard() {
    var orders = getOrders();
    var countBaru = 0, countProses = 0, countTunggu = 0, countSelesai = 0;

    orders.forEach(function (o) {
      var status = o.serviceStatus || "Booking Baru";
      if (status === "Pending" || status === "Menunggu Konfirmasi" || status === "Booking Baru") countBaru++;
      else if (status === "Menunggu Persetujuan") countTunggu++;
      else if (status === "Selesai" || status === "Siap Diambil") countSelesai++;
      else countProses++;
    });

    document.getElementById("statBookingBaru").textContent = countBaru;
    document.getElementById("statSedangDiproses").textContent = countProses;
    document.getElementById("statMenungguPersetujuan").textContent = countTunggu;
    document.getElementById("statSelesai").textContent = countSelesai;

    var tbody = document.getElementById("recentTransactionsBody");
    var empty = document.getElementById("recentTransactionsEmpty");
    var recent = orders.slice().sort(function(a,b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 5);

    if (recent.length === 0) {
      empty.style.display = "block";
    } else {
      empty.style.display = "none";
      tbody.innerHTML = recent.map(function (o) {
        var status = o.serviceStatus || "Booking Baru";
        return (
          "<tr>" +
            "<td data-label='Kode Servis'>" + escapeHtml(o.serviceCode) + "</td>" +
            "<td data-label='Customer'>" + escapeHtml(o.customerName) + "</td>" +
            "<td data-label='Perangkat'>" + escapeHtml(o.deviceType || "-") + "</td>" +
            "<td data-label='Layanan'>" + escapeHtml(o.serviceName) + "</td>" +
            "<td data-label='Tanggal'>" + formatDateIndonesia(o.createdAt) + "</td>" +
            "<td data-label='Status'><span class='status-badge " + statusBadgeClass(status) + "'>" + escapeHtml(status) + "</span></td>" +
            "<td data-label='Aksi'><a href='admin-booking-detail.html?id=" + o.id + "' class='btn-link'>Lihat Detail</a></td>" +
          "</tr>"
        );
      }).join("");
    }
    }
    renderDashboard();
    window.addEventListener("storage", function (event) {
      if (event.key === FIXIN_KEYS.ORDERS) renderDashboard();
    });
  }

  // BOOKING LIST
  if (isBookingList) {
    var filterStatus = document.getElementById("filterStatus");
    ADMIN_STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      filterStatus.appendChild(opt);
    });

    function renderTable() {
      var search = document.getElementById("searchInput").value.toLowerCase();
      var statusVal = filterStatus.value;

      var orders = getOrders().filter(function(o) {
        var status = o.serviceStatus || "Booking Baru";
        if (statusVal && statusVal !== "Semua" && status !== statusVal) return false;
        if (search) {
          var match = (o.serviceCode || "").toLowerCase().indexOf(search) > -1 ||
                      (o.customerName || "").toLowerCase().indexOf(search) > -1 ||
                      (o.phone || "").toLowerCase().indexOf(search) > -1;
          if (!match) return false;
        }
        return true;
      }).sort(function(a,b) { return new Date(b.createdAt) - new Date(a.createdAt); });

      var tbody = document.getElementById("ordersTableBody");
      var empty = document.getElementById("ordersEmptyState");

      if (orders.length === 0) {
        tbody.innerHTML = "";
        empty.style.display = "block";
      } else {
        empty.style.display = "none";
        tbody.innerHTML = orders.map(function(o) {
          var status = o.serviceStatus || "Booking Baru";
          return (
            "<tr>" +
              "<td data-label='Kode Servis'>" + escapeHtml(o.serviceCode) + "</td>" +
              "<td data-label='Customer'>" + escapeHtml(o.customerName) + "</td>" +
              "<td data-label='Perangkat'>" + escapeHtml(o.deviceType || "-") + "</td>" +
              "<td data-label='Layanan'>" + escapeHtml(o.serviceName) + "</td>" +
              "<td data-label='Tanggal'>" + formatDateIndonesia(o.createdAt) + "</td>" +
              "<td data-label='Status'><span class='status-badge " + statusBadgeClass(status) + "'>" + escapeHtml(status) + "</span></td>" +
              "<td data-label='Aksi'><a href='admin-booking-detail.html?id=" + o.id + "' class='btn-link'>Lihat Detail</a></td>" +
            "</tr>"
          );
        }).join("");
      }
    }

    document.getElementById("searchInput").addEventListener("input", renderTable);
    filterStatus.addEventListener("change", renderTable);
    window.addEventListener("storage", function (event) {
      if (event.key === FIXIN_KEYS.ORDERS) renderTable();
    });
    renderTable();
  }

  // BOOKING DETAIL
  if (isBookingDetail) {
    var orderId = getUrlParam("id");
    var order = getOrderById(orderId);

    if (!order) {
      alert("Booking tidak ditemukan!");
      window.location.href = "admin-booking.html";
      return;
    }

    var currentStatus = order.serviceStatus || "Booking Baru";

    var h1Title = document.getElementById("detailServiceCode");
    if (h1Title) h1Title.textContent = order.serviceCode || "Detail Booking";

    document.getElementById("detailCustomerName").textContent = order.customerName || "-";
    document.getElementById("detailCustomerPhone").textContent = order.phone || "-";
    document.getElementById("detailServiceCode2").textContent = order.serviceCode || "-";
    document.getElementById("detailDate").textContent = formatDateIndonesia(order.createdAt);
    document.getElementById("detailMethod").textContent = order.deliveryMethod === "pickup" ? "Jemput Kurir" : "Antar Sendiri";
    document.getElementById("detailDevice").textContent = order.deviceType || "-";
    document.getElementById("detailService").textContent = order.serviceName || "-";
    document.getElementById("detailComplaint").textContent = order.complaint || "-";

    var statusBadge = document.getElementById("detailStatusBadge");
    statusBadge.textContent = currentStatus;
    statusBadge.className = "status-badge " + statusBadgeClass(currentStatus);

    // --- Diagnosis card ---
    var cardDiagnosis = document.getElementById("cardDiagnosis");
    var diagHasil = document.getElementById("diagHasil");
    var diagBiaya = document.getElementById("diagBiaya");
    var diagWaktu = document.getElementById("diagWaktu");
    var diagCatatan = document.getElementById("diagCatatan");
    var btnSimpanDiag = document.getElementById("btnSimpanDiagnosis");

    // Tampilkan form diagnosis hanya saat status = Diagnosis atau sudah ada data diagnosis
    var sudahAdaDiagnosis = !!order.diagnosisResult;

    if (currentStatus === "Diagnosis" || sudahAdaDiagnosis) {
      cardDiagnosis.style.display = "";
    }

    // Isi form dengan data existing jika ada
    if (sudahAdaDiagnosis) {
      diagHasil.value = order.diagnosisResult || "";
      diagBiaya.value = order.diagnosisCost || "";
      diagWaktu.value = order.diagnosisTime || "";
      diagCatatan.value = order.diagnosisNote || "";
    }

    // Jika sudah dikirim (status bukan Diagnosis lagi), form read-only
    if (sudahAdaDiagnosis && currentStatus !== "Diagnosis") {
      diagHasil.readOnly = true;
      diagBiaya.readOnly = true;
      diagWaktu.readOnly = true;
      diagCatatan.readOnly = true;
      btnSimpanDiag.style.display = "none";
    }

    btnSimpanDiag.addEventListener("click", function() {
      var hasil = diagHasil.value.trim();
      var biaya = diagBiaya.value.trim();
      var waktu = diagWaktu.value.trim();
      if (!hasil || !biaya || !waktu) {
        alert("Hasil diagnosis, estimasi biaya, dan estimasi waktu wajib diisi.");
        return;
      }
      updateOrderStatus(orderId, "Menunggu Persetujuan", {
        diagnosisResult: hasil,
        diagnosisCost: Number(biaya),
        diagnosisTime: waktu,
        diagnosisNote: diagCatatan.value.trim()
      });
      window.location.reload();
    });

    var statusSelect = document.getElementById("statusSelect");
    ADMIN_STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      if (s === currentStatus) opt.selected = true;
      statusSelect.appendChild(opt);
    });

    var btnTerima = document.getElementById("btnTerimaPerangkat");
    var btnKonfirmasi = document.getElementById("btnKonfirmasi");

    if (currentStatus !== "Booking Baru" && currentStatus !== "Menunggu Konfirmasi") {
      btnKonfirmasi.style.display = "none";
    }

    // Asumsi perangkat belum diterima jika status masih Baru atau Dikonfirmasi
    if (currentStatus !== "Booking Baru" && currentStatus !== "Dikonfirmasi") {
      btnTerima.style.display = "none";
    }

    if (order.paymentStatus !== "Lunas") {
      statusSelect.disabled = true;
      document.getElementById("btnUbahStatus").disabled = true;
      document.getElementById("btnSimpanDiagnosis").disabled = true;
      btnKonfirmasi.disabled = true;
      btnTerima.disabled = true;
      document.getElementById("adminPaymentNotice").hidden = false;
    }
    window.addEventListener("storage", function (event) {
      if (event.key === FIXIN_KEYS.ORDERS) window.location.reload();
    });

    btnKonfirmasi.addEventListener("click", function() {
      updateOrderStatus(orderId, "Dikonfirmasi");
      window.location.reload();
    });

    btnTerima.addEventListener("click", function() {
      // Ketika diterima, masuk antrian diagnosis
      updateOrderStatus(orderId, "Diagnosis");
      window.location.reload();
    });

    document.getElementById("btnUbahStatus").addEventListener("click", function() {
      var newStatus = statusSelect.value;
      updateOrderStatus(orderId, newStatus);
      window.location.reload();
    });
  }
});
