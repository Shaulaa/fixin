/* =========================================
   FIXIN - Ekspor Laporan ke Excel (.xlsx)
   Butuh ExcelJS (dimuat lewat CDN di admin-reports.html).

   Data diambil dari tabel & kartu ringkasan yang SUDAH tampil di
   halaman laporan, jadi hasil Excel selalu sama dengan yang dilihat
   admin di layar (ikut filter periode yang sedang dipilih).
========================================= */
(function (root) {
  "use strict";

  var NAVY = "FF0C2340";
  var TEAL = "FF17B3A3";
  var LINE = "FFD9DFE7";
  var ZEBRA = "FFF6F8FB";

  var MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
    "Agustus", "September", "Oktober", "November", "Desember"];
  var MONTH_KEYS = { jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, jun: 5, jul: 6,
    agu: 7, agt: 7, ags: 7, sep: 8, okt: 9, nov: 10, des: 11 };

  /* ---------- Helper parsing ---------- */
  function parseRupiah(text) {
    var digits = String(text == null ? "" : text).replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : 0;
  }

  function parseTanggal(text) {
    var t = String(text || "").trim();
    var m;
    if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
      return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    }
    if ((m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) {
      return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    }
    if ((m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/))) {
      var key = m[2].toLowerCase().slice(0, 3);
      if (MONTH_KEYS[key] !== undefined) {
        return new Date(Date.UTC(+m[3], MONTH_KEYS[key], +m[1]));
      }
    }
    return null; // tidak dikenali -> dibiarkan sebagai teks
  }

  function tglPanjang(d) {
    return d.getDate() + " " + MONTHS_ID[d.getMonth()] + " " + d.getFullYear();
  }

  function labelPeriode(periode, now) {
    if (periode === "harian") return "Harian, " + tglPanjang(now);
    if (periode === "mingguan") {
      var awal = new Date(now); awal.setDate(now.getDate() - 6);
      return "Mingguan, " + tglPanjang(awal) + " s.d. " + tglPanjang(now);
    }
    if (periode === "tahunan") return "Tahunan, " + now.getFullYear();
    return "Bulanan, " + MONTHS_ID[now.getMonth()] + " " + now.getFullYear();
  }

  function warnaStatus(status) {
    var s = String(status || "").toLowerCase();
    if (s.indexOf("selesai") > -1) return { bg: "FFDDF3EE", fg: "FF0F6F65" };
    if (s.indexOf("batal") > -1 || s.indexOf("tolak") > -1) return { bg: "FFFBE4E1", fg: "FF9C3A2C" };
    if (s.indexOf("menunggu") > -1) return { bg: "FFFDF0D8", fg: "FF8F6414" };
    if (s.indexOf("proses") > -1 || s.indexOf("diperbaiki") > -1 || s.indexOf("diterima") > -1) {
      return { bg: "FFE2ECFA", fg: "FF245A9E" };
    }
    return { bg: "FFEDF0F4", fg: "FF47566A" };
  }

  /* ---------- Baca data dari halaman ---------- */
  function bacaTabel(tbody) {
    var rows = [];
    if (!tbody) return rows;
    Array.prototype.forEach.call(tbody.querySelectorAll("tr"), function (tr) {
      var cells = tr.querySelectorAll("td");
      if (cells.length < 6) return; // baris kosong / pesan "tidak ada data"
      var txt = function (i) { return (cells[i].textContent || "").replace(/\s+/g, " ").trim(); };
      rows.push({
        kode: txt(0),
        tanggal: txt(1),
        customer: txt(2),
        layanan: txt(3),
        status: txt(4),
        biaya: parseRupiah(txt(5))
      });
    });
    return rows;
  }

  function bacaAngka(id) {
    var el = document.getElementById(id);
    return el ? parseRupiah(el.textContent) : null;
  }

  /* ---------- Susun workbook ---------- */
  function buildWorkbook(ExcelJS, data) {
    var rows = data.rows;
    var wb = new ExcelJS.Workbook();
    wb.creator = "FIXIN";
    wb.created = data.now;

    var ws = wb.addWorksheet("Laporan", {
      views: [{ state: "frozen", ySplit: 9, showGridLines: false }],
      pageSetup: {
        paperSize: 9, orientation: "portrait", fitToPage: true,
        fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
        printTitlesRow: "9:9"
      },
      headerFooter: { oddFooter: "&LFIXIN&RHalaman &P dari &N" }
    });

    ws.columns = [
      { key: "kode", width: 17 },
      { key: "tanggal", width: 15 },
      { key: "customer", width: 24 },
      { key: "layanan", width: 32 },
      { key: "status", width: 24 },
      { key: "biaya", width: 19 }
    ];

    // Judul
    ws.mergeCells("A1:F1");
    var judul = ws.getCell("A1");
    judul.value = "Laporan Servis FIXIN";
    judul.font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
    judul.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    judul.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(1).height = 34;

    ws.mergeCells("A2:F2");
    var sub = ws.getCell("A2");
    sub.value = "Periode: " + data.periodeLabel;
    sub.font = { name: "Calibri", size: 11, bold: true, color: { argb: NAVY } };
    sub.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(2).height = 20;

    ws.mergeCells("A3:F3");
    var cetak = ws.getCell("A3");
    cetak.value = "Dicetak: " + tglPanjang(data.now) + ", " +
      String(data.now.getHours()).padStart(2, "0") + ":" + String(data.now.getMinutes()).padStart(2, "0");
    cetak.font = { name: "Calibri", size: 10, color: { argb: "FF6B778A" } };
    cetak.alignment = { vertical: "middle", indent: 1 };

    // Aksen teal di bawah judul
    ["A", "B", "C", "D", "E", "F"].forEach(function (c) {
      ws.getCell(c + "4").border = { top: { style: "medium", color: { argb: TEAL } } };
    });

    // Ringkasan (baris 5-7)
    var ringkasan = [
      ["Total booking", data.totalBooking, "#,##0"],
      ["Servis selesai", data.selesai, "#,##0"],
      ["Total pendapatan (estimasi)", data.pendapatan, '"Rp" #,##0']
    ];
    ringkasan.forEach(function (r, i) {
      var n = 5 + i;
      ws.mergeCells("A" + n + ":B" + n);
      var lab = ws.getCell("A" + n);
      lab.value = r[0];
      lab.font = { name: "Calibri", size: 11, color: { argb: "FF3B4859" } };
      lab.alignment = { vertical: "middle", indent: 1 };
      var val = ws.getCell("C" + n);
      val.value = r[1];
      val.numFmt = r[2];
      val.font = { name: "Calibri", size: 12, bold: true, color: { argb: NAVY } };
      val.alignment = { vertical: "middle", horizontal: "left" };
      ["A", "B", "C"].forEach(function (c) {
        ws.getCell(c + n).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF3F8" } };
      });
      ws.getRow(n).height = 21;
    });

    // Header tabel (baris 9)
    var HEADER_ROW = 9;
    var heads = ["Kode Servis", "Tanggal", "Customer", "Layanan", "Status", "Biaya / Pendapatan"];
    var hr = ws.getRow(HEADER_ROW);
    heads.forEach(function (h, i) {
      var c = hr.getCell(i + 1);
      c.value = h;
      c.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.alignment = { vertical: "middle", horizontal: i === 5 ? "right" : (i === 1 || i === 4 ? "center" : "left"), indent: i === 5 ? 1 : 0, wrapText: true };
      c.border = { bottom: { style: "medium", color: { argb: TEAL } } };
    });
    hr.height = 26;

    // Data
    var thin = { style: "thin", color: { argb: LINE } };
    rows.forEach(function (r, idx) {
      var row = ws.getRow(HEADER_ROW + 1 + idx);
      var tgl = parseTanggal(r.tanggal);
      row.getCell(1).value = r.kode;
      row.getCell(2).value = tgl || r.tanggal;
      row.getCell(3).value = r.customer;
      row.getCell(4).value = r.layanan;
      row.getCell(5).value = r.status;
      row.getCell(6).value = r.biaya;

      if (tgl) row.getCell(2).numFmt = "dd/mm/yyyy";
      row.getCell(6).numFmt = '"Rp" #,##0';

      for (var c = 1; c <= 6; c++) {
        var cell = row.getCell(c);
        cell.font = { name: "Calibri", size: 11, color: { argb: "FF1D2B3F" } };
        cell.border = { bottom: thin };
        cell.alignment = { vertical: "middle", wrapText: c === 4, horizontal: c === 2 || c === 5 ? "center" : (c === 6 ? "right" : "left"), indent: c === 6 ? 1 : 0 };
        if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
      row.getCell(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF0F8F82" } };

      var w = warnaStatus(r.status);
      row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: w.bg } };
      row.getCell(5).font = { name: "Calibri", size: 11, bold: true, color: { argb: w.fg } };
      // Tinggi baris menyesuaikan teks panjang di kolom Layanan / Customer
      var baris = Math.max(Math.ceil(String(r.layanan).length / 30), Math.ceil(String(r.customer).length / 22), 1);
      row.height = Math.max(22, baris * 15 + 7);
    });

    var last = HEADER_ROW + rows.length;
    ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: last, column: 6 } };

    return wb;
  }

  /* ---------- Unduh ---------- */
  function toast(msg) {
    var el = document.getElementById("exportToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "exportToast";
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 3200);
  }

  function namaFile(periode, now) {
    var p = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    var tag = periode === "bulanan" ? now.getFullYear() + "-" + p
      : periode === "tahunan" ? String(now.getFullYear())
      : now.getFullYear() + "-" + p + "-" + d;
    var nama = periode.charAt(0).toUpperCase() + periode.slice(1);
    return "Laporan-FIXIN-" + nama + "-" + tag + ".xlsx";
  }

  async function unduh(btn) {
    if (typeof ExcelJS === "undefined") {
      toast("Library Excel belum termuat. Cek koneksi internet lalu coba lagi.");
      return;
    }
    var rows = bacaTabel(document.getElementById("laporanTableBody"));
    if (!rows.length) {
      toast("Tidak ada data pada periode ini untuk diekspor.");
      return;
    }

    var sel = document.getElementById("filterPeriode");
    var periode = sel ? sel.value : "bulanan";
    var now = new Date();

    var totalBooking = bacaAngka("lapTotalBooking");
    var selesai = bacaAngka("lapSelesai");
    var pendapatan = bacaAngka("lapPendapatan");

    btn.disabled = true;
    try {
      var wb = buildWorkbook(ExcelJS, {
        rows: rows,
        now: now,
        periodeLabel: labelPeriode(periode, now),
        totalBooking: totalBooking != null ? totalBooking : rows.length,
        selesai: selesai != null ? selesai : rows.filter(function (r) { return /selesai/i.test(r.status); }).length,
        pendapatan: pendapatan != null ? pendapatan : rows.reduce(function (a, r) { return a + r.biaya; }, 0)
      });
      var buf = await wb.xlsx.writeBuffer();
      var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = namaFile(periode, now);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast("Laporan Excel berhasil diunduh.");
    } catch (err) {
      console.error(err);
      toast("Gagal membuat file Excel. Coba lagi.");
    } finally {
      btn.disabled = false;
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      var btn = document.getElementById("btnExportExcel");
      if (btn) btn.addEventListener("click", function () { unduh(btn); });
    });
  }

  var api = { buildWorkbook: buildWorkbook, parseRupiah: parseRupiah, parseTanggal: parseTanggal,
    labelPeriode: labelPeriode, namaFile: namaFile };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FixinExport = api;
})(typeof window !== "undefined" ? window : globalThis);
